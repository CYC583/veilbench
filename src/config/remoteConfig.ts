import { fetchAndActivate, getBoolean, getNumber, getString, getValue } from 'firebase/remote-config';
import type { RemoteHybridConfig } from '../types/hybrid';
import { getFirebaseServices } from './firebase';

export const DEFAULT_REMOTE_HYBRID_CONFIG: RemoteHybridConfig = {
  maxOnDeviceChars: 7500,
  cloudModelName: 'gemini-3.5-flash-lite',
  // Failover must not depend on the Remote Config fetch succeeding (observed: a session without the
  // fetched value hit a 500 on the primary and had no model to fail over to).
  cloudFallbackModelName: 'gemini-3.6-flash',
  strictPiiBlockEnabled: true,
  configSource: 'default',
};

/** Accepts a JSON array of model names; anything malformed falls back to "no extra models". */
function parseModelList(raw: string): string[] | undefined {
  if (!raw.trim()) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return undefined;
    const names = parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
    return names.length ? names.map((n) => n.trim()) : undefined;
  } catch {
    return undefined;
  }
}

/** {"medical":"on_device_only"} — unknown values are ignored so a typo can never widen access. */
function parseRoutingPolicy(raw: string): RemoteHybridConfig['routingPolicy'] {
  if (!raw.trim()) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const entries = Object.entries(parsed).filter(([, v]) => v === 'on_device_only');
    return entries.length ? (Object.fromEntries(entries) as RemoteHybridConfig['routingPolicy']) : undefined;
  } catch {
    return undefined;
  }
}

export const REMOTE_CONFIG_KEYS = [
  'cloud_model_name',
  'cloud_fallback_model_name',
  'cloud_model_fallbacks',
  'max_on_device_chars',
  'strict_pii_block_enabled',
  'routing_policy',
] as const;

export interface RemoteConfigParamView {
  key: string;
  value: string;
  /** Where the active value came from: 'remote' (Console), 'default' (in-app), or 'static' (unset). */
  source: 'remote' | 'default' | 'static';
}

/** Read-only view of the active Remote Config parameters for the X-Ray panel. */
export function describeRemoteConfig(): RemoteConfigParamView[] {
  const { remoteConfig } = getFirebaseServices();
  if (!remoteConfig) return [];
  return REMOTE_CONFIG_KEYS.map((key) => {
    const v = getValue(remoteConfig, key);
    return { key, value: v.asString(), source: v.getSource() };
  });
}

export async function loadRemoteHybridConfig(): Promise<RemoteHybridConfig> {
  const { remoteConfig } = getFirebaseServices();
  if (!remoteConfig) {
    return DEFAULT_REMOTE_HYBRID_CONFIG;
  }

  try {
    await fetchAndActivate(remoteConfig);
    const maxOnDeviceChars = getNumber(remoteConfig, 'max_on_device_chars') || 7500;
    const cloudModelName = getString(remoteConfig, 'cloud_model_name') || 'gemini-3.5-flash-lite';
    const strictPiiBlockEnabled = getBoolean(remoteConfig, 'strict_pii_block_enabled');
    const cloudFallbackModelName = getString(remoteConfig, 'cloud_fallback_model_name').trim() || undefined;
    const cloudModelFallbacks = parseModelList(getString(remoteConfig, 'cloud_model_fallbacks'));
    const routingPolicy = parseRoutingPolicy(getString(remoteConfig, 'routing_policy'));

    return {
      maxOnDeviceChars,
      cloudModelName,
      cloudFallbackModelName,
      cloudModelFallbacks,
      routingPolicy,
      strictPiiBlockEnabled,
      configSource: 'remote',
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return DEFAULT_REMOTE_HYBRID_CONFIG;
  }
}
