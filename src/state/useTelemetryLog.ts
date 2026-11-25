import { useCallback, useState } from 'react';
import type { TelemetryEvent } from '../types/hybrid';
import { logHybridAnalyticsEvent } from '../config/firebase';
import type { GoldenAuditRecord } from '../data/sampleGoldenAudits';
import type { AuditPart } from './workbenchHelpers';

const MAX_EVENTS = 60;

/** The X-Ray Inference Log: every real inference event, newest first, plus honest cache-use records. */
export function useTelemetryLog() {
  const [telemetry, setTelemetry] = useState<TelemetryEvent[]>([]);

  const pushTelemetry = useCallback((evt: TelemetryEvent) => {
    setTelemetry((prev) => [evt, ...prev].slice(0, MAX_EVENTS));
  }, []);

  /** Records a "cached" event whenever a recorded demo result is shown instead of a live one. */
  const logCacheUse = useCallback(
    (parts: AuditPart[], golden: GoldenAuditRecord) => {
      pushTelemetry({
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        task: 'cross_doc_contradiction',
        requestedMode: 'prefer_in_cloud',
        actualSource: 'IN_CLOUD',
        latencyMs: 0,
        inputChars: 0,
        piiInterceptedCount: 0,
        status: 'cached',
        errorKind: 'live_call_failed',
        cloudModelUsed: parts.includes('analysis') ? golden.analysisModel : golden.playbookModel,
        appCheckStatus: 'offline_bypass',
        note: `Recorded demo result shown for ${parts.join(' + ')} (recorded ${golden.recordedAt.slice(0, 10)}); live call failed.`,
      });
      logHybridAnalyticsEvent('cache_fallback_used', { parts: parts.join('+') });
    },
    [pushTelemetry]
  );

  return { telemetry, pushTelemetry, logCacheUse };
}
