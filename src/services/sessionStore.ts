import {
  collection,
  deleteDoc,
  doc,
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
