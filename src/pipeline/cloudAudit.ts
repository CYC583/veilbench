/**
 * Stage 2 / Stage 4 decisions without React: which engine a task may use, the Layer 3 block record,
 * and how a partial retry merges into the previous audit. The store runs the calls and keeps state.
 */
import type { RouterDecision, TelemetryEvent } from '../types/hybrid';
import type { PreFlightAssertion } from '../types/privacy';
import type { DeepAuditResult, WorkbenchDocument } from '../types/audit';
import { decideHybridRoute } from '../core';
import { combineDocumentsText, type AuditPart } from '../state/workbenchHelpers';
import type { RoutingInputs } from './airlock';

export type CloudTask = 'rapid_triage' | 'deep_redline_audit' | 'cross_doc_contradiction';

/** Two or more documents are checked against each other; one document gets a redline audit. */
export function deepAuditTask(docs: WorkbenchDocument[]): CloudTask {
  return docs.length > 1 ? 'cross_doc_contradiction' : 'deep_redline_audit';
}

/** Routes a post-airlock task over the sanitized text, applying the category policy of every document. */
export function routeSanitizedTask(params: {
  task: CloudTask;
  docs: WorkbenchDocument[];
  routing: RoutingInputs;
  isPayloadSanitized: boolean;
}): RouterDecision {
  const { docs } = params;
  return decideHybridRoute({
    ...params.routing,
    categories: docs.map((d) => d.category),
    task: params.task,
    charLength: combineDocumentsText(docs, 'sanitizedText').length,
    hasImage: docs.some((d) => Boolean(d.redactedImageDataUrl)),
    isPayloadSanitized: params.isPayloadSanitized,
  });
}

/** The Inference Log entry when Layer 3 stops a cloud call: nothing left the device. */
export function layer3BlockedEvent(
  docs: WorkbenchDocument[],
  assertion: PreFlightAssertion | null,
  payloadChars: number
): TelemetryEvent {
  const leaks = assertion?.leaks.length ?? 1;
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    task: deepAuditTask(docs),
    requestedMode: 'prefer_in_cloud',
    actualSource: 'LOCAL_DETERMINISTIC',
    latencyMs: 0,
    inputChars: payloadChars,
    piiInterceptedCount: assertion?.leaks.length ?? 0,
    status: 'blocked',
    errorKind: 'layer3_preflight',
    appCheckStatus: 'offline_bypass',
    note: `BLOCKED by Layer 3: ${leaks} leak(s); nothing left the device.`,
  };
}

export function layer3BlockedMessage(assertion: PreFlightAssertion | null): string {
  return `Layer 3 Pre-Flight Circuit Breaker BLOCKED cloud escalation: ${assertion?.leaks.length ?? 1} unredacted leak(s) detected.`;
}

/**
 * Partial retry: keeps the half that already succeeded and fills in the re-run half. Without a retry
 * the fresh audit is used as is. Empty bookkeeping fields are removed either way.
 */
export function mergeRetriedAudit(
  previous: DeepAuditResult | null,
  fresh: DeepAuditResult,
  retryOnly?: AuditPart
): DeepAuditResult {
  const audit: DeepAuditResult =
    retryOnly && previous
      ? {
          ...previous,
          ...(retryOnly === 'analysis'
            ? { contradictions: fresh.contradictions, redlines: fresh.redlines }
            : { playbook: fresh.playbook }),
          incompleteParts: fresh.incompleteParts,
          cachedParts: (previous.cachedParts ?? []).filter(
            (p) => p !== retryOnly || fresh.incompleteParts?.includes(p)
          ),
          generatedAt: fresh.generatedAt,
        }
      : { ...fresh };
  if (!audit.incompleteParts?.length) delete audit.incompleteParts;
  if (!audit.cachedParts?.length) {
    delete audit.cachedParts;
    delete audit.cacheInfo;
  }
  return audit;
}
