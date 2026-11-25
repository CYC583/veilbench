/**
 * Locked TypeScript contract for Hybrid Inference Routing & Telemetry.
 * Shared across Antigravity (UI/Firebase) and Codex (src/core/*).
 */

export type HybridInferenceMode =
  | 'only_on_device'
  | 'prefer_on_device'
  | 'prefer_in_cloud'
  | 'only_in_cloud';

export type ActualInferenceSource = 'ON_DEVICE' | 'IN_CLOUD' | 'LOCAL_DETERMINISTIC';

export type NanoAvailabilityStatus =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  | 'unsupported_browser';

export type HybridTaskType =
  | 'pii_scan'
  | 'rapid_triage'
  | 'translate_ui_content'
  | 'deep_redline_audit'
  | 'cross_doc_contradiction'
  | 'negotiation_chat';

export type UserRoutingPreference = 'auto_hybrid' | 'strict_local_only' | 'cloud_deep';

export interface RemoteHybridConfig {
  maxOnDeviceChars: number;
  cloudModelName: string;
  /** Remote Config `cloud_fallback_model_name`: used after the primary model keeps failing. */
  cloudFallbackModelName?: string;
  /** Remote Config `cloud_model_fallbacks` (JSON array), tried in order after the primary model. */
  cloudModelFallbacks?: string[];
  strictPiiBlockEnabled: boolean;
  /** Remote Config `routing_policy` (JSON), e.g. {"medical":"on_device_only"}: per-category data residency. */
  routingPolicy?: Partial<Record<string, 'on_device_only'>>;
  configSource: 'remote' | 'default';
  fetchedAt?: string;
}

export interface RouterContext {
  task: HybridTaskType;
  charLength: number;
  hasImage: boolean;
  isOnline: boolean;
  nanoStatus: NanoAvailabilityStatus;
  userPreference: UserRoutingPreference;
  remoteConfig: RemoteHybridConfig;
  isPayloadSanitized: boolean;
  /** Document categories in the workspace, matched against remoteConfig.routingPolicy. */
  categories?: string[];
}

export interface RouterDecision {
  recommendedMode: HybridInferenceMode;
  targetEngine: 'on_device' | 'in_cloud' | 'local_deterministic_fallback';
  allowedToProceed: boolean;
  blockedReason?: string;
  reason: string;
  requiresChunking: boolean;
  estimatedCloudCallsSaved: number;
}

export interface TelemetryEvent {
  id: string;
  timestamp: string;
  task: HybridTaskType;
  requestedMode: HybridInferenceMode;
  actualSource: ActualInferenceSource;
  latencyMs: number;
  inputChars: number;
  piiInterceptedCount: number;
  cloudModelUsed?: string;
  /** Outcome of the event; failures and Layer 3 blocks are logged too, never only successes. */
  status?: 'ok' | 'error' | 'blocked' | 'cached';
  errorKind?: string;
  /** Metered cloud tokens from response.usageMetadata (output includes thinking tokens). */
  tokens?: { prompt: number; output: number; total: number };
  appCheckStatus: 'pending' | 'verified' | 'debug' | 'failed' | 'unconfigured' | 'offline_bypass';
  note?: string;
}
