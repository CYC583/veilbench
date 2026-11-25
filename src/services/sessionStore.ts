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
 *
 * Pairing (enforced by firestore.rules): the phone shows a 6-digit relay code; this browser files a
 * request with its own random 6-digit confirmation number; the user types that number on the phone,
 * which approves exactly one browser. Only then can this browser read the relay. Guessing a code is
 * useless without the phone's approval.
 */
export interface RelayAudit {
  code: string;
  flags: Array<{ title: string; severity: 'high' | 'medium' | 'low'; summary: string }>;
  emailSanitized: string;
  expiresAt: Date | null;
}

export type RelayRequestResult =
  | { status: 'requested'; challenge: string }
  | { status: 'invalid_code' | 'not_found' | 'offline' | 'error' };

export type RelayReadResult =
  | { status: 'ok'; audit: RelayAudit }
  | { status: 'waiting' | 'invalid_code' | 'offline' | 'error' };

export function parseRelayCode(input: string): string | null {
  const code = input.replace(/\s+/g, '');
  return /^\d{6}$/.test(code) ? code : null;
}

function randomChallenge(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, '0');
}

/** Files (or re-reads) this browser's pairing request and returns the number to confirm on the phone. */
export async function requestRelayAccess(input: string): Promise<RelayRequestResult> {
  const code = parseRelayCode(input);
  if (!code) return { status: 'invalid_code' };
  const { db } = getFirebaseServices();
  const user = await ensureAnonymousUser();
  if (!db || !user) return { status: 'offline' };
  const ref = doc(db, 'relays', code, 'requests', user.uid);
  try {
    const existing = await getDoc(ref);
    const prior = existing.exists() ? (existing.data() as { challenge?: unknown }).challenge : undefined;
    if (typeof prior === 'string') return { status: 'requested', challenge: prior };
  } catch {
    // Not readable yet (no request, or the relay does not exist); try to create one below.
  }
  const challenge = randomChallenge();
  try {
    await setDoc(ref, { challenge, createdAt: serverTimestamp() });
    return { status: 'requested', challenge };
  } catch (err) {
    const errCode = (err as { code?: string } | null)?.code;
    // Rules reject requests for missing or expired relays (and the phone's own browser session).
    if (errCode === 'permission-denied' || errCode === 'not-found') return { status: 'not_found' };
    if (errCode === 'unavailable') return { status: 'offline' };
    return { status: 'error' };
  }
}

/** Reads relays/{code}; 'waiting' until the phone has approved this browser. */
export async function readRelayAudit(input: string): Promise<RelayReadResult> {
  const code = parseRelayCode(input);
  if (!code) return { status: 'invalid_code' };
  const { db } = getFirebaseServices();
  const user = await ensureAnonymousUser();
  if (!db || !user) return { status: 'offline' };
  try {
    // Always from the server: a cached copy must never stand in for the phone's approval.
    const snap = await getDocFromServer(doc(db, 'relays', code));
    if (!snap.exists()) return { status: 'waiting' };
    const d = snap.data() as Record<string, unknown>;
    const flags = Array.isArray(d.flags) ? d.flags.filter((f): f is RelayAudit['flags'][number] =>
      !!f && typeof f === 'object' && typeof (f as { title?: unknown }).title === 'string'
      && typeof (f as { summary?: unknown }).summary === 'string'
      && ['high', 'medium', 'low'].includes((f as { severity?: string }).severity ?? '')).slice(0, 5) : [];
    const expires = d.expiresAt as { toDate?: () => Date } | undefined;
    return {
      status: 'ok',
      audit: {
        code,
        flags,
        emailSanitized: typeof d.emailSanitized === 'string' ? d.emailSanitized : '',
        expiresAt: typeof expires?.toDate === 'function' ? expires.toDate() : null,
      },
    };
  } catch (err) {
    const errCode = (err as { code?: string } | null)?.code;
    if (errCode === 'permission-denied') return { status: 'waiting' }; // not approved yet
    if (errCode === 'unavailable') return { status: 'offline' };
    return { status: 'error' };
  }
}
