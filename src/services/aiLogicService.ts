import {
  getGenerativeModel,
  getTemplateGenerativeModel,
  InferenceMode,
  InferenceSource,
  Schema,
  type Part,
  type UsageMetadata,
} from 'firebase/ai';
import {
  DEEP_AUDIT_TASK_ANALYSIS,
  DEEP_AUDIT_TASK_PLAYBOOK,
} from '../core/outboundEnvelope';
import {
  CloudInferenceError,
  cloudModelChain,
  runWithCloudResilience,
  withInferenceSignal,
} from '../core/cloudResilience';
import type {
  ActualInferenceSource,
  HybridInferenceMode,
  HybridTaskType,
  NanoAvailabilityStatus,
  RemoteHybridConfig,
  TelemetryEvent,
} from '../types/hybrid';
import { getBoolean } from 'firebase/remote-config';
import { assertPayloadZeroLeak } from '../core/preFlightGuard';
import { sha256Hex } from '../core/proofGenerator';
import type { RawNanoEntityCandidate, VaultMap, ZeroLeakProof } from '../types/privacy';
import type {
  ChatTurn,
  DeepAuditResult,
  TriageResult,
  WorkbenchDocument,
} from '../types/audit';
import {
  getFirebaseServices,
  logHybridAnalyticsEvent,
  startHybridPerfTrace,
} from '../config/firebase';

declare global {
  interface Window {
    LanguageModel?: {
      availability: (options?: Record<string, unknown>) => Promise<string>;
    };
  }
}

const SEVERITY = Schema.enumString({ enum: ['high', 'medium', 'low'] });

/** Stage 4 call A: contradictions + redlines (Native Firebase AI Logic responseSchema). */
const ANALYSIS_RESPONSE_SCHEMA = Schema.object({
  properties: {
    contradictions: Schema.array({
      items: Schema.object({
        properties: {
          id: Schema.string(),
          docATitle: Schema.string(),
          docBTitle: Schema.string(),
          severity: SEVERITY,
          description: Schema.string(),
          recommendation: Schema.string(),
        },
      }),
    }),
    redlines: Schema.array({
      items: Schema.object({
        properties: {
          id: Schema.string(),
          clauseTitle: Schema.string(),
          severity: SEVERITY,
          originalExcerpt: Schema.string(),
          proposedRevision: Schema.string(),
          rationale: Schema.string(),
        },
      }),
    }),
  },
});

/** Stage 4 call B: negotiation playbook + ready-to-send email. */
const PLAYBOOK_RESPONSE_SCHEMA = Schema.object({
  properties: {
    executiveSummary: Schema.string(),
    counterpartyPushback: Schema.array({
      items: Schema.object({
        properties: {
          objection: Schema.string(),
          recommendedResponse: Schema.string(),
        },
      }),
    }),
    readyToSendEmailSanitized: Schema.string(),
  },
});

const PII_ROLES = [
  'PARTY_CLIENT', 'PARTY_CONTRACTOR', 'PERSON_NAME', 'ORGANIZATION', 'EMAIL', 'PHONE', 'ADDRESS',
  'ID_NUMBER', 'BANK_ACCOUNT', 'MONEY_AMOUNT', 'MEDICAL_ID', 'SENSITIVE_DATE', 'SECRET_KEY', 'OTHER_PII',
];

/** JSON Schema for Chrome Prompt API `responseConstraint` (on-device structured output). */
const PII_ENTITY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: { value: { type: 'string' }, role: { type: 'string', enum: PII_ROLES } },
        required: ['value', 'role'],
      },
    },
  },
  required: ['entities'],
};

const TRIAGE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    overallRisk: { type: 'string', enum: ['high', 'medium', 'low'] },
    headline: { type: 'string' },
    flags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          plainSummary: { type: 'string' },
          excerpt: { type: 'string' },
        },
        required: ['id', 'title', 'severity', 'plainSummary'],
      },
    },
  },
  required: ['overallRisk', 'headline', 'flags'],
};

function toSdkInferenceMode(mode: HybridInferenceMode): InferenceMode {
  switch (mode) {
    case 'only_on_device':
      return InferenceMode.ONLY_ON_DEVICE;
    case 'prefer_on_device':
      return InferenceMode.PREFER_ON_DEVICE;
    case 'prefer_in_cloud':
      return InferenceMode.PREFER_IN_CLOUD;
    case 'only_in_cloud':
      return InferenceMode.ONLY_IN_CLOUD;
  }
}

function mapActualSource(source?: InferenceSource): ActualInferenceSource {
  return source === InferenceSource.ON_DEVICE ? 'ON_DEVICE' : 'IN_CLOUD';
}

function dataUrlToInlinePart(dataUrl: string): Part | null {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/);
  if (!match) return null;
  const mimeType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
  return {
    inlineData: {
      mimeType,
      data: match[2],
    },
  };
}

function safeJsonParse<T>(raw: string): T | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Fail fast on a hung request so the resilience layer can retry or fail over (SDK default is 180s). */
const CLOUD_REQUEST_OPTIONS = { timeout: 45_000 };
/** Stage 4 halves are longer generations: the fallback model was measured at ~78s for the playbook. */
const STAGE4_REQUEST_OPTIONS = { timeout: 90_000 };

/** A cloud stage failure with a user-safe message plus a telemetry event for the X-Ray Inference Log. */
export class CloudStageError extends Error {
  readonly failure: CloudInferenceError;
  readonly telemetry: TelemetryEvent;
  /** Telemetry of sibling calls in the same stage (e.g. the other half of a split Stage 4). */
  readonly relatedTelemetry: TelemetryEvent[];

  constructor(failure: CloudInferenceError, telemetry: TelemetryEvent, relatedTelemetry: TelemetryEvent[] = []) {
    super(failure.message);
    this.name = 'CloudStageError';
    this.failure = failure;
    this.telemetry = telemetry;
    this.relatedTelemetry = relatedTelemetry;
  }
}

async function callWithResilience<T>(
  ctx: {
    remoteConfig: RemoteHybridConfig;
    mode: HybridInferenceMode;
    task: HybridTaskType;
    inputChars: number;
    started: number;
    signal?: AbortSignal;
    onRetryNotice?: (message: string) => void;
    /** Override same-model retries (Stage 4 fails over to the next model immediately). */
    retriesPerModel?: number;
  },
  run: (modelName: string) => Promise<T>
): Promise<{ value: T; modelUsed: string }> {
  const onDeviceOnly = ctx.mode === 'only_on_device';
  const models = onDeviceOnly
    ? [ctx.remoteConfig.cloudModelName]
    : cloudModelChain(ctx.remoteConfig.cloudModelName, [
        ...(ctx.remoteConfig.cloudModelFallbacks ?? []),
        ...(ctx.remoteConfig.cloudFallbackModelName ? [ctx.remoteConfig.cloudFallbackModelName] : []),
      ]);
  try {
    const { value, model } = await runWithCloudResilience(models, run, {
      signal: ctx.signal,
      retriesPerModel: onDeviceOnly ? 0 : (ctx.retriesPerModel ?? 1),
      onRetry: ({ model: nextModel, attempt, previous }) =>
        ctx.onRetryNotice?.(
          `Cloud Gemini returned ${previous.status ?? previous.kind} — retrying on ${nextModel} (attempt ${attempt})...`
        ),
    });
    return { value, modelUsed: model };
  } catch (err) {
    if (!(err instanceof CloudInferenceError) || err.kind === 'aborted') throw err;
    // Log only the classified attempts; the raw SDK message embeds endpoint and project identifiers.
    console.warn('[VeilBench] Cloud inference failed after resilience policy:', err.attempts);
    const last = err.attempts[err.attempts.length - 1];
    throw new CloudStageError(
      err,
      makeTelemetry({
        task: ctx.task,
        requestedMode: ctx.mode,
        actualSource: 'IN_CLOUD',
        latencyMs: Math.round(performance.now() - ctx.started),
        inputChars: ctx.inputChars,
        piiInterceptedCount: 0,
        cloudModelUsed: last?.model,
        status: 'error',
        errorKind: err.kind,
        note: `FAILED (${err.kind}) after ${err.attempts.length} attempt(s): ${err.attempts
          .map((a) => `${a.model} ${a.status ?? a.kind}`)
          .join(', ')}`,
      })
    );
  }
}

/** Real token usage reported by the SDK (absent for on-device inference, which has no metered tokens). */
function tokensFrom(usage?: UsageMetadata): TelemetryEvent['tokens'] {
  if (!usage) return undefined;
  return {
    prompt: usage.promptTokenCount ?? 0,
    output: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    total: usage.totalTokenCount ?? 0,
  };
}

function makeTelemetry(
  params: Omit<TelemetryEvent, 'id' | 'timestamp' | 'appCheckStatus'>
): TelemetryEvent {
  const { appCheckStatus } = getFirebaseServices();
  const evt: TelemetryEvent = {
    ...params,
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    appCheckStatus:
      params.actualSource === 'ON_DEVICE' || params.actualSource === 'LOCAL_DETERMINISTIC'
        ? 'offline_bypass'
        : appCheckStatus,
  };

  logHybridAnalyticsEvent('hybrid_inference_completed', {
    task: evt.task,
    requested_mode: evt.requestedMode,
    actual_source: evt.actualSource,
    latency_ms: evt.latencyMs,
    pii_intercepted: evt.piiInterceptedCount,
  });

  return evt;
}

/**
 * Checks Chrome Built-in AI (Gemini Nano) availability without throwing in non-Chrome browsers.
 */
export async function detectChromeNanoStatus(): Promise<NanoAvailabilityStatus> {
  if (typeof window === 'undefined' || !window.LanguageModel) {
    return 'unsupported_browser';
  }
  try {
    // Declare modalities/languages: an option-less availability() call makes Chrome log an
    // "output language not specified" warning on every page load.
    const status = await window.LanguageModel.availability({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
    if (status === 'available' || status === 'readily') return 'available';
    if (status === 'downloadable' || status === 'after-download') return 'downloadable';
    if (status === 'downloading') return 'downloading';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/**
 * Stage 1: Strictly On-Device PII & Semantic Role Detection via Firebase AI Logic (ONLY_ON_DEVICE).
 * Supports both text and JPEG/PNG multimodal inputs. Never transmits raw data to the cloud.
 */
export async function runOnDevicePiiScan(params: {
  rawText: string;
  rawImageDataUrl?: string;
  remoteConfig: RemoteHybridConfig;
  parseDefensive: (raw: string) => RawNanoEntityCandidate[];
}): Promise<{
  candidates: RawNanoEntityCandidate[];
  telemetry: TelemetryEvent;
}> {
  const started = performance.now();
  const perfTrace = startHybridPerfTrace('hybrid_stage1_pii_scan');
  const { ai } = getFirebaseServices();

  if (!ai) {
    perfTrace?.stop();
    return {
      candidates: [],
      telemetry: makeTelemetry({
        task: 'pii_scan',
        requestedMode: 'only_on_device',
        actualSource: 'LOCAL_DETERMINISTIC',
        latencyMs: Math.round(performance.now() - started),
        inputChars: params.rawText.length,
        piiInterceptedCount: 0,
        note: 'Firebase config pending — executed deterministic local shield.',
      }),
    };
  }

  try {
    // Native Prompt API structured output: Nano is constrained to the entity schema instead of relying
    // solely on the defensive JSON repair parser; images are declared as an expected input modality.
    const model = getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_ON_DEVICE,
      inCloudParams: { model: params.remoteConfig.cloudModelName },
      onDeviceParams: {
        createOptions: {
          expectedInputs: params.rawImageDataUrl
            ? [{ type: 'text', languages: ['en'] }, { type: 'image' }]
            : [{ type: 'text', languages: ['en'] }],
          expectedOutputs: [{ type: 'text', languages: ['en'] }],
        },
        promptOptions: { responseConstraint: PII_ENTITY_JSON_SCHEMA },
      },
    });

    const prompt = [
      'You are a strict local PII detector. Extract every sensitive entity from the document.',
      'Return ONLY JSON of the form {"entities":[{"value": exact substring, "role": role}]}.',
      'Allowed roles: PARTY_CLIENT, PARTY_CONTRACTOR, PERSON_NAME, ORGANIZATION, EMAIL, PHONE, ADDRESS, ID_NUMBER, BANK_ACCOUNT, MONEY_AMOUNT, MEDICAL_ID, SENSITIVE_DATE, SECRET_KEY, OTHER_PII.',
      'Do not include explanations or markdown.',
      '',
      'DOCUMENT:',
      params.rawText.slice(0, params.remoteConfig.maxOnDeviceChars),
    ].join('\n');

    const parts: Array<string | Part> = [prompt];
    if (params.rawImageDataUrl) {
      const imgPart = dataUrlToInlinePart(params.rawImageDataUrl);
      if (imgPart) parts.push(imgPart);
    }

    const result = await model.generateContent(parts);
    const rawOutput = result.response.text();
    const candidates = params.parseDefensive(rawOutput);
    const actualSource = mapActualSource(result.response.inferenceSource);

    perfTrace?.putAttribute('inference_source', actualSource);
    perfTrace?.putMetric('pii_detected', candidates.length);
    perfTrace?.stop();

    return {
      candidates,
      telemetry: makeTelemetry({
        tokens: tokensFrom(result.response.usageMetadata),
        task: 'pii_scan',
        requestedMode: 'only_on_device',
        actualSource,
        latencyMs: Math.round(performance.now() - started),
        inputChars: params.rawText.length,
        piiInterceptedCount: candidates.length,
        note: 'On-device Gemini Nano semantic PII scan completed.',
      }),
    };
  } catch (err) {
    perfTrace?.putAttribute('inference_source', 'LOCAL_DETERMINISTIC');
    perfTrace?.stop();
    return {
      candidates: [],
      telemetry: makeTelemetry({
        task: 'pii_scan',
        requestedMode: 'only_on_device',
        actualSource: 'LOCAL_DETERMINISTIC',
        latencyMs: Math.round(performance.now() - started),
        inputChars: params.rawText.length,
        piiInterceptedCount: 0,
        note: `On-device Nano unavailable (${err instanceof Error ? err.message : 'fallback'}); deterministic shield active.`,
      }),
    };
  }
}

/**
 * Stage 2: Rapid Offline-Ready Triage via Firebase AI Logic (PREFER_ON_DEVICE or ONLY_ON_DEVICE).
 */
export async function runRapidTriage(params: {
  signal?: AbortSignal;
  sanitizedText: string;
  mode: HybridInferenceMode;
  remoteConfig: RemoteHybridConfig;
  onRetryNotice?: (message: string) => void;
}): Promise<{ triage: TriageResult; telemetry: TelemetryEvent }> {
  const started = performance.now();
  const perfTrace = startHybridPerfTrace('hybrid_stage2_rapid_triage');
  const { ai } = getFirebaseServices();

  if (!ai) {
    perfTrace?.stop();
    throw new Error('Firebase AI Logic is not configured yet. Add your Firebase credentials to .env.local.');
  }

  const prompt = [
    'Analyze this sanitized document and return ONLY valid JSON with this exact schema:',
    '{ "overallRisk": "high" | "medium" | "low", "headline": string, "flags": [{ "id": string, "title": string, "severity": "high"|"medium"|"low", "plainSummary": string, "excerpt": string }] }',
    'Keep all placeholder tokens like [PARTY_CLIENT_1] or [MONEY_AMOUNT_1] intact. Provide 3 concise, high-impact risk flags in English.',
    '',
    'SANITIZED DOCUMENT:',
    params.sanitizedText.slice(0, params.remoteConfig.maxOnDeviceChars),
  ].join('\n');

  try {
    const { value: triageCall, modelUsed } = await callWithResilience(
      {
        remoteConfig: params.remoteConfig,
        mode: params.mode,
        task: 'rapid_triage',
        inputChars: params.sanitizedText.length,
        started,
        signal: params.signal,
        onRetryNotice: params.onRetryNotice,
      },
      async (modelName) => {
        const res = await getGenerativeModel(
          ai,
          {
            mode: toSdkInferenceMode(params.mode),
            inCloudParams: {
              model: modelName,
              generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
            },
            // Same contract on-device: Nano is schema-constrained, so Stage 2 JSON parses without repair.
            onDeviceParams: {
              createOptions: { signal: params.signal, expectedOutputs: [{ type: 'text', languages: ['en'] }] },
              promptOptions: { responseConstraint: TRIAGE_JSON_SCHEMA },
            },
          },
          CLOUD_REQUEST_OPTIONS
        ).generateContent(prompt, { signal: params.signal });
        const json = safeJsonParse<Omit<TriageResult, 'inferenceSource' | 'generatedAt'>>(
          res.response.text()
        );
        // An unreadable answer is a failed call (retried / failed over), never a placeholder flag.
        if (!json?.overallRisk || !Array.isArray(json.flags) || json.flags.length === 0) {
          throw new Error('Cloud Gemini returned an unreadable Stage 2 triage answer.');
        }
        return { result: res, parsed: json };
      }
    );
    const { result, parsed } = triageCall;
    const actualSource = mapActualSource(result.response.inferenceSource);

    perfTrace?.putAttribute('inference_source', actualSource);
    perfTrace?.stop();

    const triage: TriageResult = {
      overallRisk: parsed.overallRisk,
      headline: parsed.headline ?? '',
      flags: parsed.flags,
      inferenceSource: actualSource,
      generatedAt: new Date().toISOString(),
    };

    return {
      triage,
      telemetry: makeTelemetry({
        tokens: tokensFrom(result.response.usageMetadata),
        task: 'rapid_triage',
        requestedMode: params.mode,
        actualSource,
        latencyMs: Math.round(performance.now() - started),
        inputChars: params.sanitizedText.length,
        piiInterceptedCount: 0,
        cloudModelUsed: actualSource === 'IN_CLOUD' ? modelUsed : undefined,
        note: `Rapid triage executed via ${actualSource}.`,
      }),
    };
  } catch (err) {
    perfTrace?.stop();
    throw err;
  }
}

/**
 * Stage 4: Deep Cloud Escalation — Uses native Firebase AI Logic Schema (responseSchema)
 * for deterministic JSON Cross-Document Contradiction Audit, Redlines & Negotiation Playbook.
 * Strictly receives sanitized text and pixel-burned redacted images ONLY.
 */
export type DeepAuditPart = 'analysis' | 'playbook';

// These versioned server templates have a fixed model in their Dotprompt frontmatter.
const TEMPLATE_MODEL = 'gemini-3.5-flash-lite';

interface TemplateProof {
  vault: VaultMap;
  disabledTokens?: Set<string>;
  proof: ZeroLeakProof;
}

async function checkedTemplateRequests(
  envelope: string,
  docs: WorkbenchDocument[],
  checked?: TemplateProof,
) {
  const reject = () => new Error('Layer 3 blocked Stage 4: template inputs do not match the approved outbound proof.');
  if (!checked?.proof.preFlightPassed || await sha256Hex(envelope) !== checked.proof.sanitizedPayloadHash) {
    throw reject();
  }
  const { vault, disabledTokens } = checked;
  const images: Array<{ mime_type: string; contents: string }> = [];
  const hashes = checked.proof.outboundImageHashes ?? [];
  for (const doc of docs) {
    if (doc.rawImageDataUrl && doc.requiresImageReview && !doc.imageReviewed) throw reject();
    const burned = doc.redactedImageDataUrl;
    if (!burned) continue;
    const part = dataUrlToInlinePart(burned);
    if (!part?.inlineData || await sha256Hex(burned) !== hashes[images.length]?.sha256) throw reject();
    images.push({ mime_type: part.inlineData.mimeType, contents: part.inlineData.data });
  }
  if (images.length !== hashes.length) throw reject();

  async function prepare(inputs: Record<string, unknown>, task: string) {
    // The SDK serializes exactly {inputs} for templateGenerateContent. Audit the semantic text
    // as well as the serialized body (including its escaping) and fingerprint the actual bytes.
    const wireBody = JSON.stringify({ inputs });
    for (const text of [envelope + '\n\n' + task, wireBody]) {
      if (!assertPayloadZeroLeak(text, vault, disabledTokens).passed) throw reject();
    }
    return { inputs, sha256: await sha256Hex(wireBody) };
  }
  return {
    analysis: await prepare({ envelope, images }, DEEP_AUDIT_TASK_ANALYSIS),
    playbook: await prepare({ envelope, differenceSyntax: '{{DIFF:[TOKEN_A]-[TOKEN_B]}}' }, DEEP_AUDIT_TASK_PLAYBOOK),
  };
}


/** Marker for a Stage 4 half intentionally not requested in a partial retry. */
class SkippedPart extends Error {}

export async function runDeepRedlineAudit(params: {
  signal?: AbortSignal;
  documents: WorkbenchDocument[];
  mode: HybridInferenceMode;
  remoteConfig: RemoteHybridConfig;
  onRetryNotice?: (message: string) => void;
  /** Approval and reviewed image hashes captured together with this exact envelope. */
  templateProof?: TemplateProof;
  /** Exact outbound envelope from buildDeepAuditPrompt, already Layer 3-verified by the caller. */
  prompt: string;
  /** Re-run only these halves (partial retry); the caller merges them into the previous result. */
  onlyParts?: DeepAuditPart[];
}): Promise<{
  audit: DeepAuditResult;
  telemetry: TelemetryEvent[];
  /** Set when exactly one of the two Stage 4 calls failed; the other half is still returned. */
  partialFailure?: { part: DeepAuditPart; error: CloudStageError };
}> {
  const perfTrace = startHybridPerfTrace('hybrid_stage4_deep_audit');
  const { ai } = getFirebaseServices();

  if (!ai) {
    perfTrace?.stop();
    throw new Error('Firebase AI Logic is not configured yet. Add your Firebase credentials to .env.local.');
  }

  const task = params.documents.length > 1 ? 'cross_doc_contradiction' : 'deep_redline_audit';
  // Burned images only help the analysis call; the playbook call stays text-only and lighter.
  const imageParts = params.documents.flatMap((doc) => {
    const part = doc.redactedImageDataUrl ? dataUrlToInlinePart(doc.redactedImageDataUrl) : null;
    return part ? [part] : [];
  });

  const serviceConfig = getFirebaseServices().remoteConfig;
  const useTemplate = (params.mode === 'prefer_in_cloud' || params.mode === 'only_in_cloud') &&
    params.remoteConfig.cloudModelName === TEMPLATE_MODEL &&
    serviceConfig && getBoolean(serviceConfig, 'use_server_prompt_template');
  let templates: Awaited<ReturnType<typeof checkedTemplateRequests>> | undefined;
  try {
    if (useTemplate) templates = await checkedTemplateRequests(params.prompt, params.documents, params.templateProof);
  } catch (error) {
    perfTrace?.stop();
    throw error;
  }

  const runPart = async <T,>(
    part: DeepAuditPart,
    schema: typeof ANALYSIS_RESPONSE_SCHEMA,
    taskSuffix: string,
    liteMaxOutputTokens: number,
    withImages: boolean
  ) => {
    // Measured: flash-lite answers within the tight cap; non-lite Flash models spend part of the budget
    // on thinking and returned finishReason=MAX_TOKENS (truncated JSON) at the same cap.
    const capFor = (modelName: string) => (/lite/i.test(modelName) ? liteMaxOutputTokens : 8192);
    const started = performance.now();
    const text = `${params.prompt}\n\n${taskSuffix}`;
    const { value, modelUsed } = await callWithResilience(
      {
        remoteConfig: params.remoteConfig,
        mode: params.mode,
        task,
        inputChars: text.length,
        started,
        signal: params.signal,
        onRetryNotice: (msg) => params.onRetryNotice?.(`[${part}] ${msg}`),
        // Measured: a 500 on the primary rarely clears within seconds, but the fallback model usually
        // answers — so fail over immediately instead of re-queueing a long generation on the same model.
        retriesPerModel: 0,
      },
      async (modelName) => {
        const template = modelName === TEMPLATE_MODEL ? templates?.[part] : undefined;
        const result = template
          ? await getTemplateGenerativeModel(ai, STAGE4_REQUEST_OPTIONS).generateContent(
              `veilbench-stage4-${part}-v1`, template.inputs, { signal: params.signal },
            )
          : await getGenerativeModel(
              ai,
              {
                mode: toSdkInferenceMode(params.mode),
                onDeviceParams: { createOptions: { signal: params.signal } },
                inCloudParams: {
                  model: modelName,
                  generationConfig: {
                    responseMimeType: 'application/json',
                    responseSchema: schema,
                    temperature: 0.2,
                    maxOutputTokens: capFor(modelName),
                  },
                },
              },
              STAGE4_REQUEST_OPTIONS
            ).generateContent(withImages ? [text, ...imageParts] : [text], { signal: params.signal });
        const parsed = safeJsonParse<T>(result.response.text());
        // Never invent a placeholder result: a malformed answer is a failed call.
        if (!parsed) throw new Error(`Cloud Gemini returned malformed JSON for Stage 4 ${part}.`);
        return {
          parsed,
          wireHash: template?.sha256,
          source: mapActualSource(result.response.inferenceSource),
          usage: result.response.usageMetadata,
        };
      }
    );
    const telemetry = makeTelemetry({
      tokens: tokensFrom(value.usage),
      task,
      requestedMode: params.mode,
      actualSource: value.source,
      latencyMs: Math.round(performance.now() - started),
      inputChars: text.length,
      piiInterceptedCount: 0,
      cloudModelUsed: value.source === 'IN_CLOUD' ? modelUsed : undefined,
      status: 'ok',
      note: value.wireHash
        ? `Stage 4 ${part} (server template) completed via ${value.source}. Request SHA-256: ${value.wireHash}`
        : `Stage 4 ${part} (schema-enforced) completed via ${value.source}.`,
    });
    return { parsed: value.parsed, source: value.source, telemetry };
  };

  // Measured caps: analysis completed in ~15s at 2048; the playbook truncated at 1536 (thinking tokens count
  // toward the cap on Gemini 3.x Flash) and 8192 slowed generation into timeouts. Word limits do the rest.
  const wants = (part: DeepAuditPart) => !params.onlyParts || params.onlyParts.includes(part);
  const skipped = Promise.reject(new SkippedPart());
  skipped.catch(() => undefined);
  const [analysis, playbook] = await Promise.allSettled([
    wants('analysis')
      ? runPart<Pick<DeepAuditResult, 'contradictions' | 'redlines'>>(
          'analysis', ANALYSIS_RESPONSE_SCHEMA, DEEP_AUDIT_TASK_ANALYSIS, 2048, true
        )
      : skipped,
    wants('playbook')
      ? runPart<DeepAuditResult['playbook']>(
          'playbook', PLAYBOOK_RESPONSE_SCHEMA, DEEP_AUDIT_TASK_PLAYBOOK, 3072, false
        )
      : skipped,
  ]);
  perfTrace?.stop();

  const failureOf = (r: PromiseSettledResult<unknown>) =>
    r.status === 'rejected' && !(r.reason instanceof SkippedPart) ? (r.reason as unknown) : null;
  const aErr = failureOf(analysis);
  const bErr = failureOf(playbook);

  if (params.signal?.aborted) throw new CloudInferenceError('aborted', []);
  if (aErr && bErr) {
    if (aErr instanceof CloudStageError) {
      throw new CloudStageError(
        aErr.failure,
        aErr.telemetry,
        bErr instanceof CloudStageError ? [bErr.telemetry] : []
      );
    }
    throw aErr;
  }
  // A non-cloud error (e.g. SDK misconfiguration) in either half is a real failure, not a partial result.
  for (const err of [aErr, bErr]) {
    if (err && !(err instanceof CloudStageError)) throw err;
  }

  const a = analysis.status === 'fulfilled' ? analysis.value : null;
  const b = playbook.status === 'fulfilled' ? playbook.value : null;
  const incompleteParts: DeepAuditPart[] = [
    ...(a || !wants('analysis') ? [] : ['analysis' as const]),
    ...(b || !wants('playbook') ? [] : ['playbook' as const]),
  ];

  const audit: DeepAuditResult = {
    contradictions: a?.parsed.contradictions ?? [],
    redlines: a?.parsed.redlines ?? [],
    playbook: {
      executiveSummary: b?.parsed.executiveSummary ?? '',
      counterpartyPushback: b?.parsed.counterpartyPushback ?? [],
      readyToSendEmailSanitized: b?.parsed.readyToSendEmailSanitized ?? '',
    },
    inferenceSource: (a ?? b)!.source,
    generatedAt: new Date().toISOString(),
    ...(incompleteParts.length ? { incompleteParts } : {}),
  };

  const failed = (aErr ?? bErr) as CloudStageError | null;
  return {
    audit,
    telemetry: [...(a ? [a.telemetry] : []), ...(b ? [b.telemetry] : []), ...(failed ? [failed.telemetry] : [])],
    ...(failed ? { partialFailure: { part: aErr ? 'analysis' : 'playbook', error: failed } } : {}),
  };
}

/**
 * Stage 4 Follow-up: Streaming multi-turn negotiation chat using generateContentStream()
 * with strictly sanitized context only.
 */
export async function runNegotiationChatTurn(params: {
  signal?: AbortSignal;
  sanitizedContext: string;
  history: ChatTurn[];
  sanitizedUserQuestion: string;
  mode: HybridInferenceMode;
  remoteConfig: RemoteHybridConfig;
  onChunk?: (accumulatedSanitized: string) => void;
  onRetryNotice?: (message: string) => void;
}): Promise<{ sanitizedReply: string; actualSource: ActualInferenceSource; telemetry: TelemetryEvent }> {
  const started = performance.now();
  const perfTrace = startHybridPerfTrace('hybrid_stage4_chat_stream');
  const { ai } = getFirebaseServices();
  if (!ai) {
    perfTrace?.stop();
    throw new Error('Firebase AI Logic is not configured yet.');
  }

  const transcript = params.history
    .slice(-6)
    .map((t) => `${t.role === 'user' ? 'User' : 'Auditor'}: ${t.sanitizedContent}`)
    .join('\n');

  const prompt = [
    'You are VeilBench Audit Assistant. Answer concisely and practically in English.',
    'Keep all placeholder tokens like [PARTY_CLIENT_1] intact.',
    '',
    'SANITIZED CONTEXT:',
    params.sanitizedContext.slice(0, 12000),
    '',
    transcript ? `CONVERSATION SO FAR:\n${transcript}\n` : '',
    `User: ${params.sanitizedUserQuestion}`,
  ].join('\n');

  try {
    // Retry covers the whole stream: a mid-stream 5xx restarts the turn instead of returning a truncated reply.
    const {
      value: { accumulated, finalResponse },
      modelUsed,
    } = await callWithResilience(
      {
        remoteConfig: params.remoteConfig,
        mode: params.mode,
        task: 'negotiation_chat',
        inputChars: prompt.length,
        started,
        signal: params.signal,
        onRetryNotice: params.onRetryNotice,
      },
      async (modelName) => {
        const streamResult = await getGenerativeModel(
          ai,
          { mode: toSdkInferenceMode(params.mode), inCloudParams: { model: modelName },
            onDeviceParams: { createOptions: { signal: params.signal } } },
          CLOUD_REQUEST_OPTIONS
        ).generateContentStream(prompt, { signal: params.signal });
        // The SDK aggregates a second promise which can reject alongside the iterator on abort.
        void streamResult.response.catch(() => undefined);
        let text = '';
        for await (const chunk of streamResult.stream) {
          params.signal?.throwIfAborted();
          const textPart = chunk.text();
          if (textPart) {
            text += textPart;
            params.onChunk?.(text);
          }
        }
        return { accumulated: text, finalResponse: await streamResult.response };
      }
    );
    const actualSource = mapActualSource(finalResponse.inferenceSource);
    const sanitizedReply = (accumulated || finalResponse.text()).trim();

    perfTrace?.putAttribute('inference_source', actualSource);
    perfTrace?.stop();

    return {
      sanitizedReply,
      actualSource,
      telemetry: makeTelemetry({
        tokens: tokensFrom(finalResponse.usageMetadata),
        task: 'negotiation_chat',
        requestedMode: params.mode,
        actualSource,
        latencyMs: Math.round(performance.now() - started),
        inputChars: prompt.length,
        piiInterceptedCount: 0,
        cloudModelUsed: actualSource === 'IN_CLOUD' ? modelUsed : undefined,
        note: `Streaming follow-up turn served via ${actualSource}.`,
      }),
    };
  } catch (err) {
    perfTrace?.stop();
    throw err;
  }
}

/**
 * On-Device First Semantic Translation (EN -> Traditional Chinese zh-TW) via Firebase AI Logic (PREFER_ON_DEVICE).
 * Preserves semantic meaning and placeholder tokens without leaking data when running locally on Gemini Nano.
 */
export async function translateTextToZhTw(params: {
  signal?: AbortSignal;
  englishText: string;
  remoteConfig: RemoteHybridConfig;
}): Promise<{ translatedText: string; actualSource: ActualInferenceSource; telemetry: TelemetryEvent }> {
  const started = performance.now();
  const perfTrace = startHybridPerfTrace('hybrid_translate_zhtw');
  const { ai } = getFirebaseServices();
  if (!ai) {
    perfTrace?.stop();
    throw new Error('Firebase AI Logic is not configured yet.');
  }

  const model = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions: { signal: params.signal } },
    inCloudParams: { model: params.remoteConfig.cloudModelName },
  });

  const prompt = [
    'Translate the following English professional audit text into natural, accurate Traditional Chinese (繁體中文, Taiwan usage).',
    'Preserve all placeholder tokens like [PARTY_CLIENT_1] and markdown structure exactly as-is. Return ONLY the translated text.',
    '',
    params.englishText.slice(0, params.remoteConfig.maxOnDeviceChars),
  ].join('\n');

  try {
    const result = await withInferenceSignal(params.signal, () => model.generateContent(prompt, { signal: params.signal }));
    const actualSource = mapActualSource(result.response.inferenceSource);

    perfTrace?.putAttribute('inference_source', actualSource);
    perfTrace?.stop();

    return {
      translatedText: result.response.text().trim(),
      actualSource,
      telemetry: makeTelemetry({
        tokens: tokensFrom(result.response.usageMetadata),
        task: 'translate_ui_content',
        requestedMode: 'prefer_on_device',
        actualSource,
        latencyMs: Math.round(performance.now() - started),
        inputChars: params.englishText.length,
        piiInterceptedCount: 0,
        cloudModelUsed: actualSource === 'IN_CLOUD' ? params.remoteConfig.cloudModelName : undefined,
        note: `Semantic zh-TW translation completed via ${actualSource}.`,
      }),
    };
  } catch (err) {
    perfTrace?.stop();
    throw err;
  }
}
