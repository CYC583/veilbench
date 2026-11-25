import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
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
 * The relay ID is 128 random bits (32 hex chars) shared from the iPhone as a link whose fragment
 * (#relay=…) never reaches a server, so it cannot be guessed or enumerated.
 */
export interface RelayAudit {
  id: string;
  flags: Array<{ title: string; severity: 'high' | 'medium' | 'low'; summary: string }>;
  emailSanitized: string;
  expiresAt: Date | null;
}

export type RelayReadResult =
  | { status: 'ok'; audit: RelayAudit }
  | { status: 'invalid_code' | 'not_found' | 'offline' | 'error' };

/** Accepts a bare relay ID or a full link containing #relay=<id>; returns the ID or null. */
export function parseRelayId(input: string): string | null {
  const trimmed = input.trim();
  const fromLink = trimmed.match(/[#&]relay=([0-9a-fA-F]{32})(?![0-9a-fA-F])/);
  const id = fromLink ? fromLink[1] : trimmed;
  return /^[0-9a-fA-F]{32}$/.test(id) ? id.toLowerCase() : null;
}

/** Reads relays/{id}. Rules allow a single get of an unexpired ID by a signed-in user (no listing). */
export async function readRelayAudit(input: string): Promise<RelayReadResult> {
  const id = parseRelayId(input);
  if (!id) return { status: 'invalid_code' };
  const { db } = getFirebaseServices();
  const user = await ensureAnonymousUser();
  if (!db || !user) return { status: 'offline' };
  try {
    const snap = await getDoc(doc(db, 'relays', id));
    if (!snap.exists()) return { status: 'not_found' };
    const d = snap.data() as Record<string, unknown>;
    const flags = Array.isArray(d.flags) ? d.flags.filter((f): f is RelayAudit['flags'][number] =>
      !!f && typeof f === 'object' && typeof (f as { title?: unknown }).title === 'string'
      && typeof (f as { summary?: unknown }).summary === 'string'
      && ['high', 'medium', 'low'].includes((f as { severity?: string }).severity ?? '')).slice(0, 5) : [];
    const expires = d.expiresAt as { toDate?: () => Date } | undefined;
    return {
      status: 'ok',
      audit: {
        id,
        flags,
        emailSanitized: typeof d.emailSanitized === 'string' ? d.emailSanitized : '',
        expiresAt: typeof expires?.toDate === 'function' ? expires.toDate() : null,
      },
    };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    // Rules deny reads of expired IDs; to the user that is the same as "not found".
    if (code === 'permission-denied' || code === 'not-found') return { status: 'not_found' };
    if (code === 'unavailable') return { status: 'offline' };
    return { status: 'error' };
  }
}
