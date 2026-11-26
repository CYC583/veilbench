/**
 * Stage 1 + Layer 3, without React: the local privacy airlock for a batch of documents, the outbound
 * security proof, and the zero-PII session record. The store calls these and only stores the results,
 * so every step here can be tested on its own.
 */
import type { RouterContext, RouterDecision, TelemetryEvent } from '../types/hybrid';
import type { PiiEntity, PreFlightAssertion, VaultMap, ZeroLeakProof } from '../types/privacy';
import type { DeepAuditResult, SanitizedFirestoreSession, TriageResult, WorkbenchDocument } from '../types/audit';
import {
  assertPayloadZeroLeak,
  decideHybridRoute,
  generateZeroLeakProof,
  parseNanoEntitiesDefensive,
  redactWithVault,
  runLocalAirlock,
  sha256Hex,
} from '../core';
import { runOnDevicePiiScan } from '../services/aiLogicService';
import {
  burnImageForEntities,
  buildOutboundPayload,
  collectDisabledTokens,
  combineDocumentsText,
} from '../state/workbenchHelpers';

/** What the router needs besides the task itself. */
export type RoutingInputs = Pick<RouterContext, 'isOnline' | 'nanoStatus' | 'userPreference' | 'remoteConfig'>;

export interface AirlockBatchResult {
  processed: WorkbenchDocument[];
  vault: VaultMap;
  entitiesByDoc: Record<string, PiiEntity[]>;
  lastDecision: RouterDecision | null;
}

/**
 * Runs the 3-layer local airlock on each incoming document with one shared vault, so the same name or
 * amount gets the same token across documents. Nano candidates are merged when the router picks the
 * on-device engine; otherwise the measured deterministic pass is logged.
 */
export async function scanIncomingDocuments(params: {
  incomingDocs: WorkbenchDocument[];
  startVault: VaultMap;
  startEntitiesByDoc: Record<string, PiiEntity[]>;
  /** Categories of the documents already in the workspace (the router's policy input). */
  existingCategories: WorkbenchDocument['category'][];
  routing: RoutingInputs;
  pushTelemetry: (evt: TelemetryEvent) => void;
}): Promise<AirlockBatchResult> {
  let vault = params.startVault;
  const entitiesByDoc = { ...params.startEntitiesByDoc };
  const processed: WorkbenchDocument[] = [];
  let lastDecision: RouterDecision | null = null;

  for (const doc of params.incomingDocs) {
    const decision = decideHybridRoute({
      ...params.routing,
      categories: params.existingCategories,
      task: 'pii_scan',
      charLength: doc.rawText.length,
      hasImage: Boolean(doc.rawImageDataUrl),
      isPayloadSanitized: false,
    });
    lastDecision = decision;

    let nanoCandidates: ReturnType<typeof parseNanoEntitiesDefensive> = [];
    if (decision.targetEngine === 'on_device') {
      const scan = await runOnDevicePiiScan({
        rawText: doc.rawText,
        rawImageDataUrl: doc.rawImageDataUrl,
        remoteConfig: params.routing.remoteConfig,
        parseDefensive: parseNanoEntitiesDefensive,
      });
      nanoCandidates = scan.candidates;
      params.pushTelemetry(scan.telemetry);
    }

    const started = performance.now();
    const airlock = runLocalAirlock({
      documentId: doc.id,
      rawText: doc.rawText,
      nanoCandidates,
      existingVault: vault,
    });
    if (decision.targetEngine !== 'on_device') {
      // Measured, not mocked: real deterministic-shield latency and the entities it actually intercepted.
      params.pushTelemetry({
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        task: 'pii_scan',
        requestedMode: 'only_on_device',
        actualSource: 'LOCAL_DETERMINISTIC',
        latencyMs: Math.max(1, Math.round(performance.now() - started)),
        inputChars: doc.rawText.length,
        piiInterceptedCount: airlock.stats.totalDetected,
        status: 'ok',
        appCheckStatus: 'offline_bypass',
        note: decision.reason,
      });
    }

    vault = airlock.vault;
    entitiesByDoc[doc.id] = airlock.entities;
    processed.push({
      ...doc,
      sanitizedText: airlock.sanitizedText,
      redactedImageDataUrl: await burnImageForEntities(doc, airlock.entities),
    });
  }

  return { processed, vault, entitiesByDoc, lastDecision };
}

export interface SecurityProofResult {
  assertion: PreFlightAssertion | null;
  proof: ZeroLeakProof | null;
  /** The exact string Stage 4 sends; Layer 3, the hash and the Payload Inspector all use it. */
  payload: string;
  disabledTokens: Set<string>;
}

/**
 * Layer 3 pre-flight check and SHA-256 proof over the exact outbound envelope. Text checks cannot see
 * pixels, so an uploaded image also blocks until a human has confirmed its burned preview.
 */
export async function buildSecurityProof(
  docs: WorkbenchDocument[],
  vault: VaultMap,
  entitiesByDoc: Record<string, PiiEntity[]>
): Promise<SecurityProofResult> {
  if (docs.length === 0) {
    return { assertion: null, proof: null, payload: '', disabledTokens: new Set<string>() };
  }
  const rawCombined = combineDocumentsText(docs, 'rawText');
  const payload = buildOutboundPayload(docs, vault);
  const disabledTokens = collectDisabledTokens(entitiesByDoc);
  const textAssertion = assertPayloadZeroLeak(payload, vault, disabledTokens);
  const imageLeaks = docs
    .filter((d) => d.rawImageDataUrl && d.requiresImageReview && !d.imageReviewed)
    .map((d) => ({
      source: 'image_review_required' as const,
      reason: `Uploaded image "${d.title}" has not been reviewed after pixel redaction.`,
      matchedSnippet: d.title,
    }));
  const assertion: PreFlightAssertion = imageLeaks.length
    ? { ...textAssertion, passed: false, leaks: [...textAssertion.leaks, ...imageLeaks] }
    : textAssertion;
  const outboundImageHashes = await Promise.all(
    docs
      .filter((d) => d.redactedImageDataUrl)
      .map(async (d) => ({
        title: redactWithVault(d.title, vault),
        sha256: await sha256Hex(d.redactedImageDataUrl!),
      }))
  );
  const textProof = await generateZeroLeakProof({
    rawCombinedText: rawCombined,
    sanitizedCombinedText: payload,
    vault,
    preFlight: assertion,
  });
  const proof = outboundImageHashes.length ? { ...textProof, outboundImageHashes } : textProof;
  return { assertion, proof, payload, disabledTokens };
}

/**
 * The Firestore record for a session, or null when nothing may be saved. Firestore is a cloud boundary
 * too: only a Layer 3-verified session is persisted, with titles and excerpts in token form.
 */
export function buildSessionRecord(params: {
  sessionId: string;
  docs: WorkbenchDocument[];
  vault: VaultMap;
  proof: ZeroLeakProof | null;
  triage: TriageResult | null;
  deepAudit: DeepAuditResult | null;
}): Omit<SanitizedFirestoreSession, 'uid'> | null {
  const { docs, vault, proof } = params;
  if (docs.length === 0 || !proof?.preFlightPassed) return null;
  return {
    id: params.sessionId,
    title: redactWithVault(docs[0].title, vault),
    category: docs[0].category,
    documentCount: docs.length,
    sanitizedExcerpts: docs.map((d) => ({
      documentId: d.id,
      title: redactWithVault(d.title, vault),
      sanitizedText: d.sanitizedText.slice(0, 1500),
    })),
    zeroLeakProofHash: proof.sanitizedPayloadHash,
    triage: params.triage ?? undefined,
    deepAudit: params.deepAudit ?? undefined,
    updatedAt: new Date().toISOString(),
  };
}
