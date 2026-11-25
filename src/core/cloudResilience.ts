/**
 * Cloud resilience for Firebase AI Logic calls: bounded retry with exponential backoff on transient
 * failures (429 / 5xx / timeouts), then a Remote Config fallback model. Pure and deterministic so it
 * can be unit-tested; it never surfaces raw endpoint URLs or project identifiers to the UI.
 */

export type CloudFailureKind =
  | 'overloaded'
  | 'rate_limited'
  | 'quota'
  | 'timeout'
  | 'model_unavailable'
  | 'app_check'
  | 'network'
  | 'unknown';

export interface ClassifiedCloudError {
  kind: CloudFailureKind;
  status?: number;
  /** Worth retrying the same model after a backoff. */
  retrySameModel: boolean;
  /** Worth switching to the fallback model. */
  tryNextModel: boolean;
}

export interface CloudAttempt {
  model: string;
  attempt: number;
  kind: CloudFailureKind;
  status?: number;
}

export function classifyAiError(err: unknown): ClassifiedCloudError {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const custom = (err as { customErrorData?: { status?: unknown } } | null)?.customErrorData;
  const statusMatch = message.match(/\[(\d{3})\b/);
  const status = typeof custom?.status === 'number' ? custom.status : statusMatch ? Number(statusMatch[1]) : undefined;
  const transient = { retrySameModel: true, tryNextModel: true };

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { kind: 'network', status, retrySameModel: false, tryNextModel: false };
  }
  // Exhausted quota will not recover within a backoff window, but each model has its own quota bucket.
  if (status === 429 && /quota|billing/i.test(message)) {
    return { kind: 'quota', status, retrySameModel: false, tryNextModel: true };
  }
  if (status === 429) return { kind: 'rate_limited', status, ...transient };
  if (status !== undefined && [500, 502, 503, 504].includes(status)) return { kind: 'overloaded', status, ...transient };
  if (status === 401 || status === 403) return { kind: 'app_check', status, retrySameModel: false, tryNextModel: false };
  if (status === 404) return { kind: 'model_unavailable', status, retrySameModel: false, tryNextModel: true };
  if ((err as { name?: string } | null)?.name === 'AbortError' || /timed? ?out|aborted/i.test(message)) {
    return { kind: 'timeout', ...transient };
  }
  if (/failed to fetch|networkerror|network request failed/i.test(message)) {
    return { kind: 'network', retrySameModel: false, tryNextModel: false };
  }
  return { kind: 'unknown', status, retrySameModel: false, tryNextModel: false };
}

export function cloudModelChain(primary: string, fallbacks: string | string[] = []): string[] {
  const list = Array.isArray(fallbacks) ? fallbacks : [fallbacks];
  const chain: string[] = [];
  for (const name of [primary, ...list]) {
    const model = name?.trim();
    if (model && !chain.includes(model)) chain.push(model);
  }
  return chain;
}

export function describeCloudFailure(kind: CloudFailureKind, attempts: CloudAttempt[]): string {
  const models = new Set(attempts.map(a => a.model)).size;
  const tried = `${attempts.length} attempt${attempts.length === 1 ? '' : 's'} across ${models} model${models === 1 ? '' : 's'}`;
  switch (kind) {
    case 'overloaded':
    case 'rate_limited':
    case 'timeout':
      return `Cloud Gemini is temporarily overloaded (${tried}). Your sanitized workspace and Local Vault are intact — retry in a moment.`;
    case 'quota':
      return `Cloud quota is temporarily exhausted (${tried}). Your sanitized data stayed local — retry later or switch to Local Only mode.`;
    case 'model_unavailable':
      return `The configured cloud model is unavailable (${tried}). Retry, or switch to Local Only mode.`;
    case 'app_check':
      return 'Firebase App Check rejected the cloud request. Reload the page to refresh the attestation token, then retry.';
    case 'network':
      return 'The network dropped before Cloud Gemini responded. Reconnect and retry — local redaction keeps working offline.';
    default:
      return `Cloud Gemini request failed unexpectedly (${tried}). Your sanitized workspace is intact — please retry.`;
  }
}

export class CloudInferenceError extends Error {
  readonly kind: CloudFailureKind;
  readonly attempts: CloudAttempt[];

  constructor(kind: CloudFailureKind, attempts: CloudAttempt[]) {
    super(describeCloudFailure(kind, attempts));
    this.name = 'CloudInferenceError';
    this.kind = kind;
    this.attempts = attempts;
  }
}

export interface CloudResilienceOptions {
  retriesPerModel?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (next: { model: string; attempt: number; previous: CloudAttempt }) => void;
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export async function runWithCloudResilience<T>(
  models: string[],
  run: (model: string) => Promise<T>,
  options: CloudResilienceOptions = {},
): Promise<{ value: T; model: string; attempts: CloudAttempt[] }> {
  const { retriesPerModel = 1, baseDelayMs = 1000, sleep = defaultSleep, onRetry } = options;
  if (models.length === 0) throw new Error('No cloud model configured.');
  const attempts: CloudAttempt[] = [];
  let lastKind: CloudFailureKind = 'unknown';

  for (let m = 0; m < models.length; m++) {
    const model = models[m];
    for (let attempt = 1; attempt <= retriesPerModel + 1; attempt++) {
      try {
        return { value: await run(model), model, attempts };
      } catch (err) {
        const classified = classifyAiError(err);
        const record: CloudAttempt = { model, attempt, kind: classified.kind, status: classified.status };
        attempts.push(record);
        lastKind = classified.kind;
        const canRetrySame = classified.retrySameModel && attempt <= retriesPerModel;
        if (canRetrySame) {
          await sleep(baseDelayMs * 2 ** (attempt - 1));
          onRetry?.({ model, attempt: attempt + 1, previous: record });
          continue;
        }
        if (!classified.tryNextModel || m === models.length - 1) {
          throw new CloudInferenceError(lastKind, attempts);
        }
        onRetry?.({ model: models[m + 1], attempt: 1, previous: record });
        break;
      }
    }
  }
  throw new CloudInferenceError(lastKind, attempts);
}
