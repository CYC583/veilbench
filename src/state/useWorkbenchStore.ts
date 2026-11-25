import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ActualInferenceSource,
  NanoAvailabilityStatus,
  RemoteHybridConfig,
  RouterDecision,
  TelemetryEvent,
  UserRoutingPreference,
} from '../types/hybrid';
import type {
  BoundingBoxNormalized,
  ImageRedactionRegion,
  PiiEntity,
  PreFlightAssertion,
  SemanticRole,
  VaultMap,
  ZeroLeakProof,
} from '../types/privacy';
import type {
  ChatTurn,
  DeepAuditResult,
  DocumentCategory,
  SanitizedFirestoreSession,
  SupportedLocale,
  TriageResult,
  WorkbenchDocument,
} from '../types/audit';
import {
  applyRedactionWithToggles,
  assertPayloadZeroLeak,
  createEmptyVault,
  decideHybridRoute,
  generateZeroLeakProof,
  sha256Hex,
  parseNanoEntitiesDefensive,
  rehydrateWithLocalMath,
  redactWithVault,
  buildRelationalHints,
  formatRelationalHints,
  runLocalAirlock,
  buildDecisionCard,
  type DecisionCard,
} from '../core';
import {
  ensureAnonymousUser,
  getFirebaseServices,
  logHybridAnalyticsEvent,
  verifyAppCheckToken,
  type AppCheckUiStatus,
} from '../config/firebase';
import {
  DEFAULT_REMOTE_HYBRID_CONFIG,
  loadRemoteHybridConfig,
} from '../config/remoteConfig';
import {
  detectChromeNanoStatus,
  runDeepRedlineAudit,
  runNegotiationChatTurn,
  runOnDevicePiiScan,
  runRapidTriage,
  translateTextToZhTw,
  CloudStageError,
} from '../services/aiLogicService';
import {
  saveSanitizedSession,
  type FirestoreSyncState,
} from '../services/sessionStore';
import { registerAuditedTexts } from '../services/egressLedger';
import { SAMPLE_PACKS, type SampleDocumentSpec } from '../data/sampleDocuments';
import { SAMPLE_GOLDEN_AUDITS } from '../data/sampleGoldenAudits';
import {
  burnImageForEntities,
  buildOutboundPayload,
  collectDisabledTokens,
  combineDocumentsText,
  fillFromGolden,
  isAbortError,
  makeSessionId,
  toUserSafeMessage,
  type AuditPart,
} from './workbenchHelpers';
import { useRunController } from './useRunController';
import { useTelemetryLog } from './useTelemetryLog';
import { useSessionHistory } from './useSessionHistory';

export type WorkbenchStage =
  | 'idle'
  | 'scanning_pii'
  | 'running_triage'
  | 'running_deep_audit'
  /** A2: on-device first verdict and cloud deep audit running at the same time. */
  | 'running_parallel'
  | 'sending_chat'
  | 'translating';

export interface TranslatedAuditCache {
  triageHeadline?: string;
  triageSummaries: Record<string, string>;
  executiveSummary?: string;
  contradictionDescriptions: Record<string, string>;
  redlineRationales: Record<string, string>;
  source?: ActualInferenceSource;
}

export interface WorkbenchState {
  sessionId: string;
  documents: WorkbenchDocument[];
  activeDocId: string | null;
  entitiesByDoc: Record<string, PiiEntity[]>;
  vault: VaultMap;
  preFlight: PreFlightAssertion | null;
  zeroLeakProof: ZeroLeakProof | null;
  triage: TriageResult | null;
  deepAudit: DeepAuditResult | null;
  chatHistory: ChatTurn[];
  telemetry: TelemetryEvent[];
  isOnline: boolean;
  nanoStatus: NanoAvailabilityStatus;
  userPreference: UserRoutingPreference;
  remoteConfig: RemoteHybridConfig;
  locale: SupportedLocale;
  translatedCache: TranslatedAuditCache;
  stage: WorkbenchStage;
  stageMessage: string;
  errorBanner: string | null;
  cloudFailure: CloudFailureState | null;
  lastRouterDecision: RouterDecision | null;
  lastFirestorePayload: SanitizedFirestoreSession | null;
  firestoreSync: FirestoreSyncState | null;
  savedSessions: SanitizedFirestoreSession[];
  isFirebaseConfigured: boolean;
  appCheckStatus: AppCheckUiStatus;
  isInspectorOpen: boolean;
  isHistoryOpen: boolean;
  /** A1: sign-or-fix decision, computed on-device from the audit + vault. */
  decisionCard: DecisionCard | null;
  /** A2: timings of the last parallel hybrid run (ms since start; null while running). */
  parallelRun: ParallelRunState | null;
  triageRunning: boolean;
  deepRunning: boolean;
  /** The user cancelled the last request (shown as a neutral note, not an error). */
  cancelledNotice: boolean;
}

export interface ParallelRunState {
  /** performance.now() at start, for the live timers. */
  startedAt: number;
  triageMs: number | null;
  deepMs: number | null;
  triageSource: ActualInferenceSource | null;
  deepSource: ActualInferenceSource | null;
}

export type CloudAction = 'triage' | 'deep_audit' | 'chat';

/** A recoverable cloud failure rendered inline in the Audit Workbench with a Retry action. */
export interface CloudFailureState {
  action: CloudAction;
  message: string;
  attempts: number;
  at: string;
  /** Raw follow-up question kept locally so Retry can resend it (never persisted). */
  pendingQuestion?: string;
  /** Stage 4 half that failed while the other half succeeded. */
  partialPart?: 'analysis' | 'playbook';
}

export function useWorkbenchStore() {
  const firebaseInfo = useMemo(() => getFirebaseServices(), []);
  const [appCheckStatus, setAppCheckStatus] = useState<AppCheckUiStatus>(firebaseInfo.appCheckStatus);

  const [sessionId, setSessionId] = useState<string>(() => makeSessionId());
  const [documents, setDocuments] = useState<WorkbenchDocument[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [entitiesByDoc, setEntitiesByDoc] = useState<Record<string, PiiEntity[]>>({});
  const [vault, setVault] = useState<VaultMap>(() => createEmptyVault());
  const [preFlight, setPreFlight] = useState<PreFlightAssertion | null>(null);
  const [zeroLeakProof, setZeroLeakProof] = useState<ZeroLeakProof | null>(null);

  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [deepAudit, setDeepAudit] = useState<DeepAuditResult | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [nanoStatus, setNanoStatus] = useState<NanoAvailabilityStatus>('unavailable');
  const [userPreference, setUserPreference] = useState<UserRoutingPreference>('auto_hybrid');
  const [remoteConfig, setRemoteConfig] = useState<RemoteHybridConfig>(
    DEFAULT_REMOTE_HYBRID_CONFIG
  );

  const [locale, setLocale] = useState<SupportedLocale>('en');
  const [translatedCache, setTranslatedCache] = useState<TranslatedAuditCache>({
    triageSummaries: {},
    contradictionDescriptions: {},
    redlineRationales: {},
  });

  const [stage, setStage] = useState<WorkbenchStage>('idle');
  const [stageMessage, setStageMessage] = useState<string>('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const {
    savedSessions,
    lastFirestorePayload,
    setLastFirestorePayload,
    firestoreSync,
    loadHistory,
    recordSaved,
    deleteSessions,
  } = useSessionHistory(setErrorBanner);
  const [cloudFailure, setCloudFailure] = useState<CloudFailureState | null>(null);
  const [parallelRun, setParallelRun] = useState<ParallelRunState | null>(null);
  const goIdle = useCallback(() => {
    setStage('idle');
    setStageMessage('');
  }, []);
  const { beginRun, abortRun, settleRun, cancelRun, cancelledNotice, dismissCancelledNotice } =
    useRunController(goIdle);
  const [lastRouterDecision, setLastRouterDecision] = useState<RouterDecision | null>(null);
  const [outboundPayload, setOutboundPayload] = useState<string>('');
  /** Built-in sample currently loaded unmodified (enables the badged demo cache); null for user content. */
  const [activeSamplePackId, setActiveSamplePackId] = useState<string | null>(null);

  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

  const { telemetry, pushTelemetry, logCacheUse } = useTelemetryLog();

  /** Routes classified cloud failures to the inline retry card + Inference Log; other errors to the banner. */
  const reportStageError = useCallback(
    (err: unknown, action: CloudAction, fallback: string, pendingQuestion?: string) => {
      if (err instanceof CloudStageError) {
        pushTelemetry(err.telemetry);
        err.relatedTelemetry.forEach(pushTelemetry);
        setCloudFailure({
          action,
          message: err.message,
          attempts: err.failure.attempts.length,
          at: new Date().toISOString(),
          pendingQuestion,
        });
        return;
      }
      setErrorBanner(toUserSafeMessage(err, fallback));
    },
    [pushTelemetry]
  );

  // Bootstrap environment: online listeners, Chrome Nano status, Anonymous Auth, Remote Config, Firestore history
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    void verifyAppCheckToken().then(setAppCheckStatus);

    void (async () => {
      const [nano, rc] = await Promise.all([
        detectChromeNanoStatus(),
        loadRemoteHybridConfig(),
      ]);
      setNanoStatus(nano);
      setRemoteConfig(rc);

      await ensureAnonymousUser();
      await loadHistory();
    })();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const recomputeSecurityProof = useCallback(
    async (
      nextDocs: WorkbenchDocument[],
      nextVault: VaultMap,
      nextEntitiesByDoc: Record<string, PiiEntity[]>
    ) => {
      if (nextDocs.length === 0) {
        setPreFlight(null);
        setZeroLeakProof(null);
        setOutboundPayload('');
        return { assertion: null, proof: null, payload: '', disabledTokens: new Set<string>() };
      }
      const rawCombined = combineDocumentsText(nextDocs, 'rawText');
      // Layer 3, the SHA-256 proof and the Payload Inspector all operate on the exact string Stage 4 sends.
      const sanitizedCombined = buildOutboundPayload(nextDocs, nextVault);
      const disabledTokens = collectDisabledTokens(nextEntitiesByDoc);
      const textAssertion = assertPayloadZeroLeak(sanitizedCombined, nextVault, disabledTokens);
      // Text checks cannot see pixels: an uploaded image stays on-device until a human confirms its burn preview.
      const imageLeaks = nextDocs
        .filter((d) => d.rawImageDataUrl && d.requiresImageReview && !d.imageReviewed)
        .map((d) => ({
          source: 'image_review_required' as const,
          reason: `Uploaded image "${d.title}" has not been reviewed after pixel redaction.`,
          matchedSnippet: d.title,
        }));
      const assertion = imageLeaks.length
        ? { ...textAssertion, passed: false, leaks: [...textAssertion.leaks, ...imageLeaks] }
        : textAssertion;
      const outboundImageHashes = await Promise.all(
        nextDocs
          .filter((d) => d.redactedImageDataUrl)
          .map(async (d) => ({
            title: redactWithVault(d.title, nextVault),
            sha256: await sha256Hex(d.redactedImageDataUrl!),
          }))
      );
      const textProof = await generateZeroLeakProof({
        rawCombinedText: rawCombined,
        sanitizedCombinedText: sanitizedCombined,
        vault: nextVault,
        preFlight: assertion,
      });
      const proof = outboundImageHashes.length ? { ...textProof, outboundImageHashes } : textProof;
      setPreFlight(assertion);
      setZeroLeakProof(proof);
      setOutboundPayload(sanitizedCombined);
      // disabledTokens is returned as-is so Stage 4 re-checks with exactly what Layer 3 used here.
      return { assertion, proof, payload: sanitizedCombined, disabledTokens };
    },
    []
  );

  const persistZeroPiiSession = useCallback(
    async (
      nextTriage: TriageResult | null,
      nextDeepAudit: DeepAuditResult | null,
      override?: {
        docs: WorkbenchDocument[];
        proof: ZeroLeakProof | null;
        sessionId: string;
        vault: VaultMap;
      }
    ) => {
      const docs = override?.docs ?? documents;
      const activeVault = override?.vault ?? vault;
      const proof = override ? override.proof : zeroLeakProof;
      // Firestore is a cloud boundary too: only Layer 3-verified sanitized excerpts may be persisted.
      if (docs.length === 0 || !proof?.preFlightPassed) return;
      const res = await saveSanitizedSession({
        id: override?.sessionId ?? sessionId,
        title: redactWithVault(docs[0].title, activeVault),
        category: docs[0].category,
        documentCount: docs.length,
        sanitizedExcerpts: docs.map((d) => ({
          documentId: d.id,
          title: redactWithVault(d.title, activeVault),
          sanitizedText: d.sanitizedText.slice(0, 1500),
        })),
        zeroLeakProofHash: proof.sanitizedPayloadHash,
        triage: nextTriage ?? undefined,
        deepAudit: nextDeepAudit ?? undefined,
        updatedAt: new Date().toISOString(),
      });
      recordSaved(res.payload, res.synced);
    },
    [documents, recordSaved, sessionId, vault, zeroLeakProof]
  );

  /**
   * Stage 1: Run 3-Layer Local Privacy Airlock on a batch of documents (shared Cross-Document Vault).
   */
  const runAirlockPipeline = useCallback(
    async (
      incomingDocs: WorkbenchDocument[],
      options?: { replaceWorkspace?: boolean }
    ) => {
      setErrorBanner(null);
      abortRun(); // new or changed documents make any in-flight answer stale
      setStage('scanning_pii');
      setStageMessage('Layer 1/2/3: Scanning PII strictly on-device & locking Local Vault...');

      const baseDocs = options?.replaceWorkspace ? [] : documents;
      let workingVault = options?.replaceWorkspace ? createEmptyVault() : vault;
      const workingEntitiesByDoc: Record<string, PiiEntity[]> = options?.replaceWorkspace
        ? {}
        : { ...entitiesByDoc };

      const activeSessionId = options?.replaceWorkspace ? makeSessionId() : sessionId;
      if (options?.replaceWorkspace) {
        setSessionId(activeSessionId);
        setTriage(null);
        setDeepAudit(null);
        setParallelRun(null);
        setCloudFailure(null);
        setChatHistory([]);
        setTranslatedCache({
          triageSummaries: {},
          contradictionDescriptions: {},
          redlineRationales: {},
        });
      }

      const processedIncoming: WorkbenchDocument[] = [];

      for (const docItem of incomingDocs) {
        const decision = decideHybridRoute({
        categories: documents.map((d) => d.category),
          task: 'pii_scan',
          charLength: docItem.rawText.length,
          hasImage: Boolean(docItem.rawImageDataUrl),
          isOnline,
          nanoStatus,
          userPreference,
          remoteConfig,
          isPayloadSanitized: false,
        });
        setLastRouterDecision(decision);

        let nanoCandidates: ReturnType<typeof parseNanoEntitiesDefensive> = [];
        if (decision.targetEngine === 'on_device') {
          const scanRes = await runOnDevicePiiScan({
            rawText: docItem.rawText,
            rawImageDataUrl: docItem.rawImageDataUrl,
            remoteConfig,
            parseDefensive: parseNanoEntitiesDefensive,
          });
          nanoCandidates = scanRes.candidates;
          pushTelemetry(scanRes.telemetry);
        }

        const airlockStarted = performance.now();
        const airlock = runLocalAirlock({
          documentId: docItem.id,
          rawText: docItem.rawText,
          nanoCandidates,
          existingVault: workingVault,
        });
        if (decision.targetEngine !== 'on_device') {
          // Measured, not mocked: real deterministic-shield latency and the entities it actually intercepted.
          pushTelemetry({
            id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp: new Date().toISOString(),
            task: 'pii_scan',
            requestedMode: 'only_on_device',
            actualSource: 'LOCAL_DETERMINISTIC',
            latencyMs: Math.max(1, Math.round(performance.now() - airlockStarted)),
            inputChars: docItem.rawText.length,
            piiInterceptedCount: airlock.stats.totalDetected,
            status: 'ok',
            appCheckStatus: 'offline_bypass',
            note: decision.reason,
          });
        }

        workingVault = airlock.vault;
        workingEntitiesByDoc[docItem.id] = airlock.entities;

        const redactedImageDataUrl = await burnImageForEntities(docItem, airlock.entities);

        processedIncoming.push({
          ...docItem,
          sanitizedText: airlock.sanitizedText,
          redactedImageDataUrl,
        });
      }

      const finalDocs = [...baseDocs, ...processedIncoming];
      setDocuments(finalDocs);
      setVault(workingVault);
      setEntitiesByDoc(workingEntitiesByDoc);
      setActiveDocId(processedIncoming[0]?.id ?? finalDocs[0]?.id ?? null);

      const { proof } = await recomputeSecurityProof(finalDocs, workingVault, workingEntitiesByDoc);
      // Persist the zero-PII session right after Stage 1 (offline-safe, non-blocking), so the Firestore
      // tab and History are populated even before any cloud call succeeds.
      void persistZeroPiiSession(null, null, {
        docs: finalDocs,
        proof,
        sessionId: activeSessionId,
        vault: workingVault,
      });
      setStage('idle');
      setStageMessage('');
    },
    [
      persistZeroPiiSession,
      sessionId,
      documents,
      entitiesByDoc,
      isOnline,
      nanoStatus,
      pushTelemetry,
      recomputeSecurityProof,
      remoteConfig,
      userPreference,
      vault,
    ]
  );

  const loadSamplePack = useCallback(
    async (packId: string) => {
      const pack: SampleDocumentSpec | undefined = SAMPLE_PACKS.find((p) => p.id === packId);
      if (!pack) return;
      const now = new Date().toISOString();
      const builtDocs: WorkbenchDocument[] = pack.documents.map((spec) => {
        const img = spec.generateImage ? spec.generateImage() : undefined;
        return {
          id: `${spec.id}_${Date.now().toString(36)}`,
          title: spec.title,
          category: spec.category,
          rawText: spec.rawText,
          sanitizedText: spec.rawText,
          rawImageDataUrl: img?.dataUrl || undefined,
          imageRegions: img?.regions,
          createdAt: now,
        };
      });
      await runAirlockPipeline(builtDocs, { replaceWorkspace: true });
      setActiveSamplePackId(pack.id);
    },
    [runAirlockPipeline]
  );

  const addCustomDocument = useCallback(
    async (params: {
      title: string;
      category: DocumentCategory;
      rawText: string;
      rawImageDataUrl?: string;
    }) => {
      const newDoc: WorkbenchDocument = {
        id: `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        title: params.title.trim() || 'Untitled Document.txt',
        category: params.category,
        rawText: params.rawText,
        sanitizedText: params.rawText,
        rawImageDataUrl: params.rawImageDataUrl,
        imageRegions: params.rawImageDataUrl
          ? [
              {
                id: 'reg_header_auto',
                label: '[HEADER_PII_MASKED]',
                bbox: { x: 0.05, y: 0.05, width: 0.9, height: 0.16 },
              },
            ]
          : undefined,
        requiresImageReview: Boolean(params.rawImageDataUrl),
        imageReviewed: false,
        createdAt: new Date().toISOString(),
      };
      // User content is mixed in: the recorded sample result no longer describes this workspace.
      setActiveSamplePackId(null);
      await runAirlockPipeline([newDoc], { replaceWorkspace: false });
    },
    [runAirlockPipeline]
  );

  const removeDocument = useCallback(
    async (docId: string) => {
      setActiveSamplePackId(null);
      const nextDocs = documents.filter((d) => d.id !== docId);
      const nextEntities = { ...entitiesByDoc };
      delete nextEntities[docId];
      setDocuments(nextDocs);
      setEntitiesByDoc(nextEntities);
      if (activeDocId === docId) {
        setActiveDocId(nextDocs[0]?.id ?? null);
      }
      if (nextDocs.length === 0) {
        setVault(createEmptyVault());
        setTriage(null);
        setDeepAudit(null);
        setParallelRun(null);
        setChatHistory([]);
      }
      await recomputeSecurityProof(nextDocs, vault, nextEntities);
    },
    [activeDocId, documents, entitiesByDoc, recomputeSecurityProof, vault]
  );

  /** Manual box-select redaction: always burned (no vault anchor), then the Layer 3 proof is recomputed. */
  const updateManualRegions = useCallback(
    async (docId: string, edit: (regions: ImageRedactionRegion[]) => ImageRedactionRegion[]) => {
      const target = documents.find((d) => d.id === docId);
      if (!target?.rawImageDataUrl) return;
      const imageRegions = edit(target.imageRegions ?? []);
      const updated = { ...target, imageRegions };
      const redactedImageDataUrl = await burnImageForEntities(updated, entitiesByDoc[docId] ?? []);
      const nextDocs = documents.map((d) => (d.id === docId ? { ...updated, redactedImageDataUrl } : d));
      setDocuments(nextDocs);
      await recomputeSecurityProof(nextDocs, vault, entitiesByDoc);
    },
    [documents, entitiesByDoc, recomputeSecurityProof, vault]
  );

  const addManualRegion = useCallback(
    (docId: string, bbox: BoundingBoxNormalized) =>
      updateManualRegions(docId, (regions) => [
        ...regions,
        { id: `manual_${Date.now().toString(36)}`, label: '[MANUAL_REDACTION]', bbox },
      ]),
    [updateManualRegions]
  );

  const undoManualRegion = useCallback(
    (docId: string) =>
      updateManualRegions(docId, (regions) => {
        let lastManual = -1;
        regions.forEach((r, i) => {
          if (r.id.startsWith('manual_')) lastManual = i;
        });
        return lastManual < 0 ? regions : regions.filter((_, i) => i !== lastManual);
      }),
    [updateManualRegions]
  );

  /** Human confirmation that an uploaded image's burned preview contains no remaining identifiers. */
  const setImageReviewed = useCallback(
    async (docId: string, reviewed: boolean) => {
      const nextDocs = documents.map((d) => (d.id === docId ? { ...d, imageReviewed: reviewed } : d));
      setDocuments(nextDocs);
      await recomputeSecurityProof(nextDocs, vault, entitiesByDoc);
    },
    [documents, entitiesByDoc, recomputeSecurityProof, vault]
  );

  const toggleEntityRedaction = useCallback(
    async (docId: string, entityId: string) => {
      const docEntities = entitiesByDoc[docId];
      const targetDoc = documents.find((d) => d.id === docId);
      if (!docEntities || !targetDoc) return;

      const updatedEntities = docEntities.map((ent) =>
        ent.id === entityId ? { ...ent, enabled: !ent.enabled } : ent
      );
      const nextEntitiesByDoc = { ...entitiesByDoc, [docId]: updatedEntities };
      const nextSanitizedText = applyRedactionWithToggles(targetDoc.rawText, updatedEntities);
      // Keep the outbound image in lockstep with the text toggles (burn boxes appear / disappear).
      const nextRedactedImage = await burnImageForEntities(targetDoc, updatedEntities);
      const nextDocs = documents.map((d) =>
        d.id === docId
          ? { ...d, sanitizedText: nextSanitizedText, redactedImageDataUrl: nextRedactedImage }
          : d
      );

      setEntitiesByDoc(nextEntitiesByDoc);
      setDocuments(nextDocs);
      await recomputeSecurityProof(nextDocs, vault, nextEntitiesByDoc);
    },
    [documents, entitiesByDoc, recomputeSecurityProof, vault]
  );

  /** Q-2 "Try to leak": un-redacts the first enabled token so Layer 3 visibly blocks escalation. */
  /**
   * Human-in-the-loop: the user names a word the detectors missed (a project code name, a Chinese name in a
   * non-Nano browser). It is vaulted in every document, in every casing that occurs, and the payload,
   * images and Layer 3 proof are recomputed. Existing toggles are kept.
   */
  const addCustomTerm = useCallback(
    async (rawValue: string, role: SemanticRole): Promise<'added' | 'too_short' | 'not_found'> => {
      const value = rawValue.trim();
      if (value.length < 2) return 'too_short';
      const lower = value.toLowerCase();
      if (!documents.some((d) => d.rawText.toLowerCase().includes(lower))) return 'not_found';

      let workingVault = vault;
      const nextEntitiesByDoc: Record<string, PiiEntity[]> = { ...entitiesByDoc };
      const nextDocs: WorkbenchDocument[] = [];
      for (const d of documents) {
        const previous = entitiesByDoc[d.id] ?? [];
        const disabled = new Set(previous.filter((e) => !e.enabled).map((e) => e.originalValue));
        const airlock = runLocalAirlock({
          documentId: d.id,
          rawText: d.rawText,
          existingVault: workingVault,
          // Re-feed earlier findings with their image boxes so no pixel-burn region is lost on recompute.
          nanoCandidates: previous
            .filter((e) => e.bbox)
            .map((e) => ({ value: e.originalValue, role: e.role, bbox: e.bbox })),
          manualCandidates: [{ value, role }],
        });
        workingVault = airlock.vault;
        const recomputed = airlock.entities.map((e) => (disabled.has(e.originalValue) ? { ...e, enabled: false } : e));
        // Fail closed: any earlier entity (e.g. image-only) missing from the recompute is kept as it was.
        const kept = previous.filter((p) => !recomputed.some((e) => e.originalValue === p.originalValue));
        const entities = [...recomputed, ...kept];
        nextEntitiesByDoc[d.id] = entities;
        nextDocs.push({
          ...d,
          sanitizedText: applyRedactionWithToggles(d.rawText, entities),
          redactedImageDataUrl: await burnImageForEntities(d, entities),
        });
      }
      setVault(workingVault);
      setEntitiesByDoc(nextEntitiesByDoc);
      setDocuments(nextDocs);
      await recomputeSecurityProof(nextDocs, workingVault, nextEntitiesByDoc);
      return 'added';
    },
    [documents, entitiesByDoc, recomputeSecurityProof, vault]
  );

  const tryLeak = useCallback(async () => {
    const docId = activeDocId ?? documents[0]?.id;
    const target = docId ? entitiesByDoc[docId]?.find((e) => e.enabled) : undefined;
    if (docId && target) await toggleEntityRedaction(docId, target.id);
  }, [activeDocId, documents, entitiesByDoc, toggleEntityRedaction]);



  /**
   * Stage 2: Rapid Offline-Ready Triage (PREFER_ON_DEVICE).
   */
  const executeRapidTriage = useCallback(async (
    opts?: { inParallel?: boolean; signal?: AbortSignal }
  ): Promise<TriageResult | null> => {
    const inParallel = Boolean(opts?.inParallel);
    if (documents.length === 0) return null;
    setErrorBanner(null);
    setCloudFailure(null);

    const sanitizedCombined = combineDocumentsText(documents, 'sanitizedText');
    const decision = decideHybridRoute({
        categories: documents.map((d) => d.category),
      task: 'rapid_triage',
      charLength: sanitizedCombined.length,
      hasImage: documents.some((d) => Boolean(d.redactedImageDataUrl)),
      isOnline,
      nanoStatus,
      userPreference,
      remoteConfig,
      isPayloadSanitized: Boolean(preFlight?.passed),
    });
    setLastRouterDecision(decision);

    if (!decision.allowedToProceed) {
      setErrorBanner(decision.blockedReason ?? decision.reason);
      return null;
    }

    if (!inParallel) setStage('running_triage');
    if (!inParallel) setStageMessage(
      decision.targetEngine === 'on_device'
        ? 'Stage 2: Running rapid risk triage on-device via Chrome Gemini Nano...'
        : 'Stage 2: Running rapid risk triage via Firebase AI Logic (Sanitized Payload)...'
    );

    const signal = opts?.signal ?? beginRun();
    try {
      const { triage: result, telemetry: evt } = await runRapidTriage({
        signal,
        sanitizedText: sanitizedCombined,
        mode: decision.recommendedMode,
        remoteConfig,
        onRetryNotice: inParallel ? undefined : setStageMessage,
      });
      if (signal.aborted) return null; // superseded or cancelled: never show a stale answer
      setTriage(result);
      pushTelemetry(evt);
      if (!inParallel) await persistZeroPiiSession(result, deepAudit);
      return result;
    } catch (err) {
      if (isAbortError(err)) return null;
      reportStageError(
        err,
        'triage',
        'Rapid triage failed. Verify Firebase configuration or Chrome Gemini Nano status.'
      );
      return null;
    } finally {
      if (!inParallel) settleRun(signal);
    }
  }, [
    beginRun,
    settleRun,
    deepAudit,
    documents,
    isOnline,
    nanoStatus,
    persistZeroPiiSession,
    preFlight,
    pushTelemetry,
    reportStageError,
    remoteConfig,
    userPreference,
  ]);

  /**
   * Stage 4: Escalate to Cloud Gemini (Cross-Document Audit, Interactive Redlines & Playbook).
   * Strictly gated by Layer 3 Pre-Flight Circuit Breaker.
   */
  const executeDeepAudit = useCallback(async (
    retryOnly?: 'analysis' | 'playbook',
    opts?: { inParallel?: boolean; signal?: AbortSignal }
  ): Promise<DeepAuditResult | null> => {
    const inParallel = Boolean(opts?.inParallel);
    if (documents.length === 0) return null;
    setErrorBanner(null);
    setCloudFailure(null);

    const { assertion, proof, payload, disabledTokens } = await recomputeSecurityProof(documents, vault, entitiesByDoc);
    if (!assertion || !assertion.passed || !proof?.preFlightPassed) {
      pushTelemetry({
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        task: documents.length > 1 ? 'cross_doc_contradiction' : 'deep_redline_audit',
        requestedMode: 'prefer_in_cloud',
        actualSource: 'LOCAL_DETERMINISTIC',
        latencyMs: 0,
        inputChars: payload.length,
        piiInterceptedCount: assertion?.leaks.length ?? 0,
        status: 'blocked',
        errorKind: 'layer3_preflight',
        appCheckStatus: 'offline_bypass',
        note: `BLOCKED by Layer 3: ${assertion?.leaks.length ?? 1} leak(s); nothing left the device.`,
      });
      logHybridAnalyticsEvent('layer3_blocked', { leaks: assertion?.leaks.length ?? 1 });
      setErrorBanner(
        `Layer 3 Pre-Flight Circuit Breaker BLOCKED cloud escalation: ${assertion?.leaks.length ?? 1} unredacted leak(s) detected.`
      );
      setIsInspectorOpen(true);
      return null;
    }

    const sanitizedCombined = combineDocumentsText(documents, 'sanitizedText');
    const task =
      documents.length > 1 ? 'cross_doc_contradiction' : 'deep_redline_audit';
    const decision = decideHybridRoute({
        categories: documents.map((d) => d.category),
      task,
      charLength: sanitizedCombined.length,
      hasImage: documents.some((d) => Boolean(d.redactedImageDataUrl)),
      isOnline,
      nanoStatus,
      userPreference,
      remoteConfig,
      isPayloadSanitized: assertion.passed,
    });
    setLastRouterDecision(decision);

    if (!decision.allowedToProceed) {
      setErrorBanner(decision.blockedReason ?? decision.reason);
      return null;
    }

    setIsInspectorOpen(false);
    if (!inParallel) setStage('running_deep_audit');
    if (!inParallel) setStageMessage(
      documents.length > 1
        ? 'Stage 4: Running Cross-Document Contradiction & Redline Audit via Cloud Gemini (Zero-PII Verified)...'
        : 'Stage 4: Synthesizing Interactive Redline Diff & Negotiation Playbook via Cloud Gemini...'
    );

    const deepSignal = opts?.signal ?? beginRun();
    try {
      const { audit: fresh, telemetry: events, partialFailure } = await runDeepRedlineAudit({
        signal: deepSignal,
        prompt: payload,
        documents,
        // The approval that matches this exact envelope and these exact burned images (same snapshot of
        // documents, vault and toggles). The server-template path re-checks it and stops on any mismatch.
        templateProof: { vault, disabledTokens, proof },
        mode: decision.recommendedMode,
        remoteConfig,
        onRetryNotice: inParallel ? undefined : setStageMessage,
        onlyParts: retryOnly && deepAudit ? [retryOnly] : undefined,
      });
      // Partial retry: keep the half that already succeeded, fill in the re-run half.
      const audit: DeepAuditResult =
        retryOnly && deepAudit
          ? {
              ...deepAudit,
              ...(retryOnly === 'analysis'
                ? { contradictions: fresh.contradictions, redlines: fresh.redlines }
                : { playbook: fresh.playbook }),
              incompleteParts: fresh.incompleteParts,
              cachedParts: (deepAudit.cachedParts ?? []).filter(
                (p) => p !== retryOnly || fresh.incompleteParts?.includes(p)
              ),
              generatedAt: fresh.generatedAt,
            }
          : fresh;
      if (!audit.incompleteParts?.length) delete audit.incompleteParts;
      if (!audit.cachedParts?.length) {
        delete audit.cachedParts;
        delete audit.cacheInfo;
      }
      const golden = activeSamplePackId ? SAMPLE_GOLDEN_AUDITS[activeSamplePackId] : undefined;
      const finalAudit =
        partialFailure && golden ? fillFromGolden(audit, golden, [partialFailure.part]) : audit;
      if (deepSignal.aborted) return null; // superseded or cancelled: never show a stale answer
      if (partialFailure && golden) logCacheUse([partialFailure.part], golden);
      setDeepAudit(finalAudit);
      events.forEach(pushTelemetry);
      if (partialFailure) {
        // Show the half that succeeded; the inline card offers a retry for the missing half.
        setCloudFailure({
          action: 'deep_audit',
          message: partialFailure.error.message,
          attempts: partialFailure.error.failure.attempts.length,
          at: new Date().toISOString(),
          partialPart: partialFailure.part,
        });
      }
      if (!inParallel) await persistZeroPiiSession(triage, finalAudit);
      return finalAudit;
    } catch (err) {
      // A cancel is the user's choice: no error card and no recorded-result fallback.
      if (isAbortError(err) || deepSignal.aborted) return null;
      const golden = activeSamplePackId ? SAMPLE_GOLDEN_AUDITS[activeSamplePackId] : undefined;
      let fallback: DeepAuditResult | null = null;
      if (err instanceof CloudStageError && golden) {
        // Every model failed: show the recorded real result for this built-in sample, clearly badged,
        // while the retry card below keeps the live path one click away.
        const parts: AuditPart[] = retryOnly ? [retryOnly] : ['analysis', 'playbook'];
        fallback = fillFromGolden(retryOnly ? deepAudit : null, golden, parts);
        setDeepAudit(fallback);
        logCacheUse(parts, golden);
      }
      reportStageError(
        err,
        'deep_audit',
        'Cloud deep audit failed. Check network connection and Firebase App Check / AI Logic configuration.'
      );
      return fallback;
    } finally {
      if (!inParallel) settleRun(deepSignal);
    }
  }, [
    beginRun,
    settleRun,
    activeSamplePackId,
    deepAudit,
    documents,
    entitiesByDoc,
    isOnline,
    nanoStatus,
    persistZeroPiiSession,
    pushTelemetry,
    reportStageError,
    recomputeSecurityProof,
    remoteConfig,
    triage,
    userPreference,
    vault,
  ]);

  /**
   * A2 · Parallel hybrid: the on-device first verdict (Stage 2) and the cloud deep audit (Stage 4, sanitized
   * relations only, Layer 3-gated) start together. The decision card shows the first answer that arrives
   * and upgrades in place when the deep audit returns. Each path's wall-clock time is recorded.
   */
  const executeParallelHybrid = useCallback(async () => {
    if (documents.length === 0) return;
    setStage('running_parallel');
    setStageMessage('Stage 2 + 4: on-device first verdict and cloud deep audit running in parallel...');
    const signal = beginRun();
    const started = performance.now();
    setParallelRun({ startedAt: started, triageMs: null, deepMs: null, triageSource: null, deepSource: null });
    const elapsed = () => Math.max(1, Math.round(performance.now() - started));
    try {
      const [tri, deep] = await Promise.all([
        executeRapidTriage({ inParallel: true, signal }).then((r) => {
          setParallelRun((p) => p && { ...p, triageMs: elapsed(), triageSource: r?.inferenceSource ?? null });
          return r;
        }),
        executeDeepAudit(undefined, { inParallel: true, signal }).then((r) => {
          setParallelRun((p) => p && { ...p, deepMs: elapsed(), deepSource: r?.inferenceSource ?? null });
          return r;
        }),
      ]);
      logHybridAnalyticsEvent('parallel_hybrid_completed', {
        triage_ok: Boolean(tri),
        deep_ok: Boolean(deep),
      });
      if (signal.aborted) setParallelRun(null);
      else if (tri || deep) await persistZeroPiiSession(tri ?? triage, deep ?? deepAudit);
    } finally {
      settleRun(signal);
    }
  }, [settleRun, beginRun, deepAudit, documents.length, executeDeepAudit, executeRapidTriage, persistZeroPiiSession, triage]);

  /**
   * Multi-Turn Follow-Up Chat: sanitizes user input locally, sends sanitized turn, re-hydrates response locally.
   */
  const sendChatMessage = useCallback(
    async (rawQuestion: string) => {
      const trimmed = rawQuestion.trim();
      if (!trimmed || documents.length === 0) return;
      setErrorBanner(null);
      setCloudFailure(null);

      // Sanitize the user's question through the shared Local Vault before sending
      const questionAirlock = runLocalAirlock({
        documentId: `chat_${Date.now()}`,
        rawText: trimmed,
        existingVault: vault,
      });
      const updatedVault = questionAirlock.vault;
      const sanitizedQuestion = questionAirlock.sanitizedText;
      const questionCheck = assertPayloadZeroLeak(sanitizedQuestion, updatedVault);
      if (!questionCheck.passed) {
        setErrorBanner(
          'Pre-Flight Guard blocked your follow-up message due to an unredacted sensitive token.'
        );
        return;
      }

      const relations = formatRelationalHints(buildRelationalHints(updatedVault));
      const sanitizedContext = [combineDocumentsText(documents, 'sanitizedText'), relations]
        .filter(Boolean)
        .join('\n\n');
      const decision = decideHybridRoute({
        categories: documents.map((d) => d.category),
        task: 'negotiation_chat',
        charLength: sanitizedContext.length + sanitizedQuestion.length,
        hasImage: false,
        isOnline,
        nanoStatus,
        userPreference,
        remoteConfig,
        isPayloadSanitized: true,
      });
      setLastRouterDecision(decision);

      if (!decision.allowedToProceed) {
        setErrorBanner(decision.blockedReason ?? decision.reason);
        return;
      }

      setVault(updatedVault);
      const userTurn: ChatTurn = {
        id: `turn_u_${Date.now()}`,
        role: 'user',
        sanitizedContent: sanitizedQuestion,
        rehydratedContent: trimmed,
        timestamp: new Date().toISOString(),
      };
      const nextHistory = [...chatHistory, userTurn];
      setChatHistory(nextHistory);

      setStage('sending_chat');
      setStageMessage('Sending sanitized follow-up & re-hydrating response locally...');
      const chatSignal = beginRun();

      try {
        const res = await runNegotiationChatTurn({
          signal: chatSignal,
          sanitizedContext,
          history: chatHistory,
          sanitizedUserQuestion: sanitizedQuestion,
          mode: decision.recommendedMode,
          remoteConfig,
          onRetryNotice: setStageMessage,
        });

        const assistantTurn: ChatTurn = {
          id: `turn_a_${Date.now()}`,
          role: 'assistant',
          sanitizedContent: res.sanitizedReply,
          rehydratedContent: rehydrateWithLocalMath(res.sanitizedReply, updatedVault),
          inferenceSource: res.actualSource,
          timestamp: new Date().toISOString(),
        };
        setChatHistory([...nextHistory, assistantTurn]);
        pushTelemetry(res.telemetry);
      } catch (err) {
        // Roll back the unanswered user turn; Retry resends the same question.
        setChatHistory(chatHistory);
        if (!isAbortError(err)) reportStageError(err, 'chat', 'Follow-up chat request failed.', trimmed);
      } finally {
        settleRun(chatSignal);
      }
    },
    [
      beginRun,
      settleRun,
      chatHistory,
      documents,
      isOnline,
      nanoStatus,
      pushTelemetry,
      reportStageError,
      remoteConfig,
      userPreference,
      vault,
    ]
  );

  /**
   * On-Device First Semantic Translation (EN <-> Traditional Chinese zh-TW).
   */
  const toggleLocaleWithAiTranslation = useCallback(async () => {
    if (locale === 'zh-TW') {
      setLocale('en');
      return;
    }

    setLocale('zh-TW');
    if (!triage && !deepAudit) return;

    const decision = decideHybridRoute({
        categories: documents.map((d) => d.category),
      task: 'translate_ui_content',
      charLength: 1500,
      hasImage: false,
      isOnline,
      nanoStatus,
      userPreference,
      remoteConfig,
      isPayloadSanitized: true,
    });
    if (!decision.allowedToProceed) return;

    setStage('translating');
    setStageMessage('Translating audit insights to Traditional Chinese (PREFER_ON_DEVICE)...');
    const translateSignal = beginRun();

    try {
      const nextCache: TranslatedAuditCache = {
        triageSummaries: { ...translatedCache.triageSummaries },
        contradictionDescriptions: { ...translatedCache.contradictionDescriptions },
        redlineRationales: { ...translatedCache.redlineRationales },
        triageHeadline: translatedCache.triageHeadline,
        executiveSummary: translatedCache.executiveSummary,
        source: translatedCache.source,
      };

      if (triage && !nextCache.triageHeadline) {
        const res = await translateTextToZhTw({
          signal: translateSignal,
          englishText: triage.headline,
          remoteConfig,
        });
        nextCache.triageHeadline = res.translatedText;
        nextCache.source = res.actualSource;
        pushTelemetry(res.telemetry);
      }

      if (deepAudit && !nextCache.executiveSummary) {
        const res = await translateTextToZhTw({
          signal: translateSignal,
          englishText: deepAudit.playbook.executiveSummary,
          remoteConfig,
        });
        nextCache.executiveSummary = res.translatedText;
        nextCache.source = res.actualSource;
        pushTelemetry(res.telemetry);
      }

      if (!translateSignal.aborted) setTranslatedCache(nextCache);
    } catch {
      // Keep English content visible gracefully if translation fails
    } finally {
      settleRun(translateSignal);
    }
  }, [
    beginRun,
    settleRun,
    deepAudit,
    isOnline,
    locale,
    nanoStatus,
    pushTelemetry,
    remoteConfig,
    translatedCache,
    triage,
    userPreference,
  ]);

  const restoreSessionFromHistory = useCallback((sess: SanitizedFirestoreSession) => {
    const restoredDocs: WorkbenchDocument[] = sess.sanitizedExcerpts.map((ex) => ({
      id: ex.documentId,
      title: ex.title,
      category: sess.category,
      rawText: ex.sanitizedText,
      sanitizedText: ex.sanitizedText,
      createdAt: sess.updatedAt,
    }));
    setSessionId(sess.id);
    setDocuments(restoredDocs);
    setActiveDocId(restoredDocs[0]?.id ?? null);
    setEntitiesByDoc({});
    setVault(createEmptyVault());
    setTriage(sess.triage ?? null);
    setDeepAudit(sess.deepAudit ?? null);
    setChatHistory([]);
    setLastFirestorePayload(sess);
    setIsHistoryOpen(false);
  }, []);

  /** User pressed Cancel: stop the in-flight request; nothing more is sent and no error is shown. */
  const cancelCurrentRun = useCallback(() => {
    if (cancelRun()) logHybridAnalyticsEvent('run_cancelled', { stage });
  }, [cancelRun, stage]);

  const clearWorkspace = useCallback(() => {
    abortRun();
    setCloudFailure(null);
    setActiveSamplePackId(null);
    setSessionId(makeSessionId());
    setDocuments([]);
    setActiveDocId(null);
    setEntitiesByDoc({});
    setVault(createEmptyVault());
    setPreFlight(null);
    setZeroLeakProof(null);
    setTriage(null);
    setDeepAudit(null);
    setParallelRun(null);
    setChatHistory([]);
    setErrorBanner(null);
    setTranslatedCache({
      triageSummaries: {},
      contradictionDescriptions: {},
      redlineRationales: {},
    });
  }, []);

  /** Re-runs exactly the cloud step that failed, from the same sanitized workspace. */
  const retryCloudAction = useCallback(() => {
    if (!cloudFailure) return;
    switch (cloudFailure.action) {
      case 'triage':
        void executeRapidTriage();
        break;
      case 'deep_audit':
        void executeDeepAudit(cloudFailure.partialPart);
        break;
      case 'chat':
        if (cloudFailure.pendingQuestion) void sendChatMessage(cloudFailure.pendingQuestion);
        break;
    }
  }, [cloudFailure, executeDeepAudit, executeRapidTriage, sendChatMessage]);

  /** Pulls the latest Remote Config (e.g. a model swap made in the Console) without a redeploy. */
  const refetchRemoteConfig = useCallback(async () => {
    const rc = await loadRemoteHybridConfig();
    setRemoteConfig(rc);
    return rc;
  }, []);

  const rehydrateLocal = useCallback(
    (text: string) => rehydrateWithLocalMath(text, vault),
    [vault]
  );

  const combinedSanitizedPayload = outboundPayload;

  // A3: let the egress ledger confirm that AI Logic request bodies carry only Layer 3-checked text.
  useEffect(() => {
    registerAuditedTexts(preFlight?.passed
      ? [outboundPayload, combineDocumentsText(documents, 'sanitizedText')]
      : []);
  }, [documents, outboundPayload, preFlight]);

  const decisionCard = useMemo(
    () => buildDecisionCard({ triage, deepAudit, vault }),
    [deepAudit, triage, vault]
  );
  const triageRunning = stage === 'running_triage'
    || (stage === 'running_parallel' && parallelRun?.triageMs === null);
  const deepRunning = stage === 'running_deep_audit'
    || (stage === 'running_parallel' && parallelRun?.deepMs === null);

  return {
    state: {
      sessionId,
      documents,
      activeDocId,
      entitiesByDoc,
      vault,
      preFlight,
      zeroLeakProof,
      triage,
      deepAudit,
      chatHistory,
      telemetry,
      isOnline,
      nanoStatus,
      userPreference,
      remoteConfig,
      locale,
      translatedCache,
      stage,
      stageMessage,
      errorBanner,
      cloudFailure,
      lastRouterDecision,
      lastFirestorePayload,
      firestoreSync,
      savedSessions,
      isFirebaseConfigured: firebaseInfo.isConfigured,
      appCheckStatus,
      isInspectorOpen,
      isHistoryOpen,
      decisionCard,
      parallelRun,
      triageRunning,
      deepRunning,
      cancelledNotice,
    } satisfies WorkbenchState,
    combinedSanitizedPayload,
    actions: {
      setActiveDocId,
      setUserPreference,
      setIsInspectorOpen,
      setIsHistoryOpen,
      dismissError: () => setErrorBanner(null),
      retryCloudAction,
      refetchRemoteConfig,
      dismissCloudFailure: () => setCloudFailure(null),
      loadSamplePack,
      addCustomDocument,
      removeDocument,
      toggleEntityRedaction,
      addCustomTerm,
      setImageReviewed,
      addManualRegion,
      undoManualRegion,
      tryLeak,
      executeRapidTriage,
      executeDeepAudit,
      executeParallelHybrid,
      sendChatMessage,
      toggleLocaleWithAiTranslation,
      restoreSessionFromHistory,
      clearWorkspace,
      deleteSessions,
      cancelCurrentRun,
      dismissCancelledNotice,
      rehydrateLocal,
    },
  };
}
