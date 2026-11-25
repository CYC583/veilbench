import { useCallback, useRef, useState } from 'react';

/**
 * One in-flight AI request at a time. Starting a new run aborts the previous one; a cancelled or
 * superseded run never returns its stage to idle over a newer run, and never shows its stale answer.
 */
export function useRunController(onIdle: () => void) {
  const controllerRef = useRef<AbortController | null>(null);
  const [cancelledNotice, setCancelledNotice] = useState(false);

  /** Aborts any in-flight request and returns a fresh signal for the next one. */
  const beginRun = useCallback((): AbortSignal => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setCancelledNotice(false);
    return controller.signal;
  }, []);

  /** Stops the in-flight request without telling the user (e.g. the documents changed). */
  const abortRun = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  /** Returns to idle only if this run is still the current one (a newer run keeps its own stage). */
  const settleRun = useCallback(
    (signal: AbortSignal) => {
      if (controllerRef.current && controllerRef.current.signal !== signal) return;
      controllerRef.current = null;
      onIdle();
    },
    [onIdle]
  );

  /** The user pressed Cancel. Returns false when nothing was running. */
  const cancelRun = useCallback((): boolean => {
    if (!controllerRef.current) return false;
    controllerRef.current.abort();
    controllerRef.current = null;
    setCancelledNotice(true);
    return true;
  }, []);

  return {
    beginRun,
    abortRun,
    settleRun,
    cancelRun,
    cancelledNotice,
    dismissCancelledNotice: useCallback(() => setCancelledNotice(false), []),
  };
}
