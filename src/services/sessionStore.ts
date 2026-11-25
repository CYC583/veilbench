import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import type { SanitizedFirestoreSession } from '../types/audit';
import { ensureAnonymousUser, getFirebaseServices } from '../config/firebase';

const COLLECTION_NAME = 'sanitized_sessions';

export type FirestoreSyncState = 'local_only' | 'pending' | 'synced' | 'failed';

/**
 * Persists strictly Zero-PII sanitized audit sessions to Cloud Firestore.
 * setDoc() commits to the persistentLocalCache immediately but its Promise only resolves on server
 * acknowledgement, so it is never awaited here: offline runs must not hang the pipeline. The returned
 * `synced` Promise reports the server round-trip for the "Pending sync -> Synced" indicator.
 */
export async function saveSanitizedSession(
  session: Omit<SanitizedFirestoreSession, 'uid'>
): Promise<{ payload: SanitizedFirestoreSession; synced: Promise<FirestoreSyncState> }> {
  const { db } = getFirebaseServices();
  const user = await ensureAnonymousUser();
  const uid = user?.uid ?? 'local-offline-session';

  const payload: SanitizedFirestoreSession = {
    ...session,
    uid,
    updatedAt: new Date().toISOString(),
  };

  if (!db || !user) {
    return { payload, synced: Promise.resolve<FirestoreSyncState>('local_only') };
  }

  try {
    const ref = doc(db, COLLECTION_NAME, payload.id);
    // Firestore rejects `undefined` field values (no ignoreUndefinedProperties); drop them so a Stage 2-only
    // session (deepAudit undefined) persists instead of throwing. merge:true keeps previously stored fields.
    const data = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
    const synced = setDoc(ref, data, { merge: true }).then(
      (): FirestoreSyncState => 'synced',
      (): FirestoreSyncState => 'failed'
    );
    return { payload, synced };
  } catch {
    return { payload, synced: Promise.resolve<FirestoreSyncState>('failed') };
  }
}

export async function listSanitizedSessions(): Promise<SanitizedFirestoreSession[]> {
  const { db } = getFirebaseServices();
  const user = await ensureAnonymousUser();
  if (!db || !user) {
    return [];
  }

  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('uid', '==', user.uid),
      orderBy('updatedAt', 'desc'),
      limit(12)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as SanitizedFirestoreSession);
  } catch {
    // Graceful fallback while composite index builds: query by uid only and sort locally
    try {
      const fallbackQ = query(
        collection(db, COLLECTION_NAME),
        where('uid', '==', user.uid),
        limit(24)
      );
      const snap = await getDocs(fallbackQ);
      return snap.docs
        .map((d) => d.data() as SanitizedFirestoreSession)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 12);
    } catch {
      return [];
    }
  }
}

/**
 * Deletes one of the signed-in user's sessions. Like setDoc, deleteDoc applies to the local cache at once
 * and its Promise resolves on server acknowledgement, so the caller gets the server outcome separately.
 * firestore.rules only allow deleting your own documents.
 */
export async function deleteSanitizedSession(id: string): Promise<FirestoreSyncState> {
  const { db } = getFirebaseServices();
  const user = await ensureAnonymousUser();
  if (!db || !user) return 'local_only';
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
    return 'synced';
  } catch {
    return 'failed';
  }
}

/**
 * A VeilBench Pocket (iOS) audit handed to the web. Tokens only: the vault stays on the phone.
 * The phone shares a link with a 128-bit ID in the fragment (see integrations/relayLink.ts); the ID is the
 * only way to read the relay, and firestore.rules allow a single get of an exact, unexpired ID.
 */
export interface RelayAudit {
  id: string;
  flags: Array<{ title: string; severity: 'high' | 'medium' | 'low'; summary: string }>;
  emailSanitized: string;
  expiresAt: Date | null;
}

export type RelayReadResult =
  | { status: 'ok'; audit: RelayAudit }
  | { status: 'invalid_link' | 'not_found' | 'offline' | 'error' };

export async function readRelayAudit(id: string): Promise<RelayReadResult> {
  if (!/^[0-9a-f]{32}$/.test(id)) return { status: 'invalid_link' };
  const { db } = getFirebaseServices();
  const user = await ensureAnonymousUser();
  if (!db || !user) return { status: 'offline' };
  try {
    // Always from the server: a cached copy must never outlive the relay's expiry.
    const snap = await getDocFromServer(doc(db, 'relays', id));
    if (!snap.exists()) return { status: 'not_found' };
    const d = snap.data() as Record<string, unknown>;
    const expires = d.expiresAt as { toDate?: () => Date } | undefined;
    const expiresAt = typeof expires?.toDate === 'function' ? expires.toDate() : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) return { status: 'not_found' };
    const flags = Array.isArray(d.flags) ? d.flags.filter((f): f is RelayAudit['flags'][number] =>
      !!f && typeof f === 'object' && typeof (f as { title?: unknown }).title === 'string'
      && typeof (f as { summary?: unknown }).summary === 'string'
      && ['high', 'medium', 'low'].includes((f as { severity?: string }).severity ?? '')).slice(0, 5) : [];
    return {
      status: 'ok',
      audit: { id, flags, emailSanitized: typeof d.emailSanitized === 'string' ? d.emailSanitized : '', expiresAt },
    };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    // Rules deny reads of expired or unknown IDs; to the user that is the same as "not found".
    if (code === 'permission-denied' || code === 'not-found') return { status: 'not_found' };
    if (code === 'unavailable') return { status: 'offline' };
    return { status: 'error' };
  }
}

/**
 * Six-digit pairing (the default on the phone). The phone shows a code; this browser files a request
 * with its own random confirmation number; the user types that number on the phone, which approves this
 * one browser. firestore.rules let only the owner or the approved browser read relays/{code}; a 128-bit
 * link ID and a 6-digit code never authorize each other.
 */
export type RelayPairRequest =
  | { status: 'requested'; challenge: string }
  | { status: 'not_found' | 'offline' | 'error' };

function randomChallenge(): string {
  return (crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).toString().padStart(6, '0');
}

export async function requestRelayAccess(code: string): Promise<RelayPairRequest> {
  if (!/^\d{6}$/.test(code)) return { status: 'not_found' };
  const { db } = getFirebaseServices();
  const user = await ensureAnonymousUser();
  if (!db || !user) return { status: 'offline' };
  const ref = doc(db, 'relays', code, 'requests', user.uid);
  try {
    // Re-use this browser's earlier request instead of creating a second one.
    const existing = await getDoc(ref);
    const prior = existing.exists() ? (existing.data() as { challenge?: unknown }).challenge : undefined;
    if (typeof prior === 'string' && /^\d{6}$/.test(prior)) return { status: 'requested', challenge: prior };
  } catch {
    // Not readable yet (no request, or no such relay): try to create one below.
  }
  const challenge = randomChallenge();
  try {
    // setDoc resolves only on server acknowledgement; offline it would wait forever.
    const timedOut = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 10_000));
    const outcome = await Promise.race([setDoc(ref, { challenge, createdAt: serverTimestamp() }), timedOut]);
    if (outcome === 'timeout') return { status: 'offline' };
    return { status: 'requested', challenge };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'permission-denied' || code === 'not-found') return { status: 'not_found' };
    if (code === 'unavailable') return { status: 'offline' };
    return { status: 'error' };
  }
}

/** Reads a paired relay from the server; 'waiting' until the phone has approved this browser. */
export async function readPairedRelay(
  code: string
): Promise<{ status: 'ok'; audit: RelayAudit } | { status: 'waiting' | 'offline' | 'error' }> {
  const { db } = getFirebaseServices();
  const user = await ensureAnonymousUser();
  if (!db || !user) return { status: 'offline' };
  try {
    const snap = await getDocFromServer(doc(db, 'relays', code));
    if (!snap.exists()) return { status: 'waiting' };
    const d = snap.data() as Record<string, unknown>;
    const expires = d.expiresAt as { toDate?: () => Date } | undefined;
    const expiresAt = typeof expires?.toDate === 'function' ? expires.toDate() : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) return { status: 'error' };
    const flags = Array.isArray(d.flags) ? d.flags.filter((f): f is RelayAudit['flags'][number] =>
      !!f && typeof f === 'object' && typeof (f as { title?: unknown }).title === 'string'
      && typeof (f as { summary?: unknown }).summary === 'string'
      && ['high', 'medium', 'low'].includes((f as { severity?: string }).severity ?? '')).slice(0, 5) : [];
    return {
      status: 'ok',
      audit: { id: code, flags, emailSanitized: typeof d.emailSanitized === 'string' ? d.emailSanitized : '', expiresAt },
    };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'permission-denied') return { status: 'waiting' }; // not approved yet
    if (code === 'unavailable') return { status: 'offline' };
    return { status: 'error' };
  }
}
