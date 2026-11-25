import { useCallback, useState } from 'react';
import type { SanitizedFirestoreSession } from '../types/audit';
import { logHybridAnalyticsEvent } from '../config/firebase';
import {
  deleteSanitizedSession,
  listSanitizedSessions,
  type FirestoreSyncState,
} from '../services/sessionStore';

const MAX_SESSIONS = 12;

/** Saved Zero-PII sessions in Firestore: the list, the last written document and its sync state. */
export function useSessionHistory(onError: (message: string) => void) {
  const [savedSessions, setSavedSessions] = useState<SanitizedFirestoreSession[]>([]);
  const [lastFirestorePayload, setLastFirestorePayload] = useState<SanitizedFirestoreSession | null>(null);
  const [firestoreSync, setFirestoreSync] = useState<FirestoreSyncState | null>(null);

  const loadHistory = useCallback(async () => {
    setSavedSessions(await listSanitizedSessions());
  }, []);

  /** Shows a just-written session: Pending until the server acknowledges it, then Synced (or Failed). */
  const recordSaved = useCallback(
    (payload: SanitizedFirestoreSession, synced: Promise<FirestoreSyncState>) => {
      setLastFirestorePayload(payload);
      setFirestoreSync('pending');
      void synced.then((state) => {
        setFirestoreSync((current) => (current === 'pending' ? state : current));
      });
      setSavedSessions((prev) => [payload, ...prev.filter((s) => s.id !== payload.id)].slice(0, MAX_SESSIONS));
    },
    []
  );

  /**
   * Deletes saved sessions (one, or all when ids is omitted). The list updates at once; if the server
   * rejects a delete, that session is put back and the error is shown.
   */
  const deleteSessions = useCallback(
    async (ids?: string[]) => {
      const targets = savedSessions.filter((s) => !ids || ids.includes(s.id));
      if (targets.length === 0) return;
      setSavedSessions((prev) => prev.filter((s) => !targets.some((t) => t.id === s.id)));
      const results = await Promise.all(targets.map((t) => deleteSanitizedSession(t.id)));
      const failed = targets.filter((_, i) => results[i] === 'failed');
      if (failed.length) {
        setSavedSessions((prev) => [...failed, ...prev].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        onError(`Could not delete ${failed.length} saved session(s). Check your connection and try again.`);
      }
      logHybridAnalyticsEvent('sessions_deleted', { count: targets.length - failed.length, failed: failed.length });
    },
    [onError, savedSessions]
  );

  return {
    savedSessions,
    lastFirestorePayload,
    setLastFirestorePayload,
    firestoreSync,
    loadHistory,
    recordSaved,
    deleteSessions,
  };
}
