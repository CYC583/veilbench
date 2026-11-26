import { useState } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Cloud,
  Cpu,
  Database,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import type { RemoteHybridConfig, TelemetryEvent } from '../types/hybrid';
import type { VaultMap } from '../types/privacy';
import type { FirestoreSyncState } from '../services/sessionStore';
import type { AppCheckUiStatus } from '../config/firebase';
import { describeRemoteConfig } from '../config/remoteConfig';
import type { SanitizedFirestoreSession, SupportedLocale } from '../types/audit';
import { UI, translator } from '../i18n/ui';
import type { Msg } from '../i18n/ui/types';

interface XRayTelemetryBarProps {
  telemetry: TelemetryEvent[];
  vault: VaultMap;
  remoteConfig: RemoteHybridConfig;
  appCheckStatus: AppCheckUiStatus;
  lastFirestorePayload: SanitizedFirestoreSession | null;
  firestoreSync?: FirestoreSyncState | null;
  onRefetchRemoteConfig?: () => Promise<unknown>;
  locale: SupportedLocale;
}

const syncLabel: Record<FirestoreSyncState, { msg: Msg; tone: string }> = {
  pending: { msg: UI.telemetry.syncPending, tone: 'text-[#B45309] border-[#B45309]/30 bg-[#FFFBEB]' },
  synced: { msg: UI.telemetry.syncSynced, tone: 'text-[#0F766E] border-[#0F766E]/30 bg-[#F0FDFA]' },
  failed: { msg: UI.telemetry.syncFailed, tone: 'text-[#BE123C] border-[#BE123C]/30 bg-[#FFF1F2]' },
  local_only: { msg: UI.telemetry.syncLocalOnly, tone: 'text-[#475569] border-[#475569]/30 bg-[#F1F5F9]' },
};

const appCheckMsg: Record<AppCheckUiStatus, Msg> = {
  verified: UI.telemetry.appCheckVerified,
  debug: UI.telemetry.appCheckDebug,
  pending: UI.telemetry.appCheckPending,
  failed: UI.telemetry.appCheckFailed,
  unconfigured: UI.telemetry.appCheckUnconfigured,
};

type XRayTab = 'telemetry' | 'vault' | 'firestore' | 'remote_config';

/** Keeps the shape recognisable (first char + length) without exposing the value. */
function maskValue(value: string): string {
  if (value.length <= 2) return '••';
  return `${value[0]}${'•'.repeat(Math.min(10, value.length - 1))}`;
}

export function XRayTelemetryBar({
  telemetry,
  vault,
  remoteConfig,
  appCheckStatus,
  lastFirestorePayload,
  firestoreSync = null,
  onRefetchRemoteConfig,
  locale,
}: XRayTelemetryBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<XRayTab>('telemetry');
  // Raw vault values are masked by default (shoulder-surfing / screen-share safety); reveal is local-only.
  const [revealVault, setRevealVault] = useState(false);
  const [rcRefreshing, setRcRefreshing] = useState(false);
  const rcParams = activeTab === 'remote_config' ? describeRemoteConfig() : [];
  const t = translator(locale);

  const localCalls = telemetry.filter(
    (e) => e.actualSource === 'ON_DEVICE' || e.actualSource === 'LOCAL_DETERMINISTIC'
  ).length;
  // Only successful cloud inferences count; failures and Layer 3 blocks appear in the log with their status.
  const cloudCalls = telemetry.filter(
    (e) => e.actualSource === 'IN_CLOUD' && (e.status ?? 'ok') === 'ok'
  ).length;
  // Real metered usage only (SDK usageMetadata); on-device and local steps consume no cloud tokens.
  const cloudTokens = telemetry.reduce((sum, e) => sum + (e.tokens?.total ?? 0), 0);
  const latestEvent = telemetry[0];
  const vaultEntries = Object.values(vault.byToken);

  const appCheckLabel = t(appCheckMsg[appCheckStatus]);

  const statusLabel = (status: string) => {
    if (status === 'ok') return t(UI.telemetry.statusOk);
    if (status === 'error') return t(UI.telemetry.statusError);
    if (status === 'blocked') return t(UI.telemetry.statusBlocked);
    if (status === 'cached') return t(UI.telemetry.statusCached);
    return status.toUpperCase();
  };

  return (
    <footer className="sticky bottom-0 z-30 border-t border-[#E2E5EA] bg-[#F1F3F5]/95 backdrop-blur-sm">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
        {/* Collapsed Summary Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#141518] hover:text-[#0F766E]"
          >
            <Activity className="h-4 w-4 text-[#0F766E]" />
            <span className="font-mono uppercase tracking-wider">
              {t(UI.telemetry.title)}
            </span>
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-[#5C626E]" />
            ) : (
              <ChevronUp className="h-4 w-4 text-[#5C626E]" />
            )}
          </button>

          {/* Real Runtime Metrics Only (Zero Fabricated Numbers) */}
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-[#5C626E]">
            <span className="inline-flex items-center gap-1 text-[#0F766E]">
              <Cpu className="h-3.5 w-3.5" />
              <span>{t(UI.telemetry.localSaved)}: {localCalls}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[#B45309]">
              <Cloud className="h-3.5 w-3.5" />
              <span>{t(UI.telemetry.cloud)}: {cloudCalls}</span>
            </span>
            <span
              className="inline-flex items-center gap-1 text-[#5C626E]"
              title={t(UI.telemetry.cloudTokensHint)}
            >
              <span>{t(UI.telemetry.cloudTokens)}: {cloudTokens.toLocaleString()}</span>
            </span>
            {latestEvent && (
              <span className="hidden sm:inline">
                {t(UI.telemetry.last)}: <strong>{latestEvent.actualSource}</strong> ({latestEvent.latencyMs}ms)
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${
                appCheckStatus === 'verified'
                  ? 'border-[#0F766E]/30 bg-[#F0FDFA] text-[#0F766E]'
                  : appCheckStatus === 'failed'
                    ? 'border-[#BE123C]/30 bg-[#FFF1F2] text-[#BE123C]'
                    : 'border-[#E2E5EA] bg-[#FFFFFF] text-[#5C626E]'
              }`}
            >
              <ShieldCheck className="h-3 w-3" />
              <span>{appCheckLabel}</span>
            </span>
            <span className="hidden items-center gap-1 md:inline-flex">
              <Sliders className="h-3 w-3" />
              <span>
                RC({remoteConfig.configSource}): {remoteConfig.cloudModelName}
                {remoteConfig.cloudFallbackModelName
                  ? ` → ${remoteConfig.cloudFallbackModelName}`
                  : ''}{' '}
                / {remoteConfig.maxOnDeviceChars}c
              </span>
            </span>
          </div>
        </div>

        {/* Expanded X-Ray Drawer */}
        {expanded && (
          <div className="border-t border-[#E2E5EA] py-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('telemetry')}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium ${
                  activeTab === 'telemetry'
                    ? 'border-[#0F766E] bg-[#FFFFFF] text-[#0F766E]'
                    : 'border-[#E2E5EA] bg-[#F8F9FA] text-[#5C626E]'
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                <span>{t(UI.telemetry.tabInferenceLog)} ({telemetry.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('vault')}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium ${
                  activeTab === 'vault'
                    ? 'border-[#0F766E] bg-[#FFFFFF] text-[#0F766E]'
                    : 'border-[#E2E5EA] bg-[#F8F9FA] text-[#5C626E]'
                }`}
              >
                <Lock className="h-3.5 w-3.5" />
                <span>{t(UI.telemetry.tabVault)} ({vaultEntries.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('firestore')}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium ${
                  activeTab === 'firestore'
                    ? 'border-[#0F766E] bg-[#FFFFFF] text-[#0F766E]'
                    : 'border-[#E2E5EA] bg-[#F8F9FA] text-[#5C626E]'
                }`}
              >
                <Database className="h-3.5 w-3.5" />
                <span>{t(UI.telemetry.tabFirestore)}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('remote_config')}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium ${
                  activeTab === 'remote_config'
                    ? 'border-[#0F766E] bg-[#FFFFFF] text-[#0F766E]'
                    : 'border-[#E2E5EA] bg-[#F8F9FA] text-[#5C626E]'
                }`}
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>Remote Config</span>
              </button>
            </div>

            <div className="max-h-56 overflow-auto rounded-md border border-[#E2E5EA] bg-[#FFFFFF] p-3">
              {activeTab === 'telemetry' && (
                <>
                  {telemetry.length === 0 ? (
                    <p className="font-mono text-[11.5px] text-[#5C626E]">
                      {t(UI.telemetry.noEvents)}
                    </p>
                  ) : (
                    <table className="w-full min-w-[640px] text-left font-mono text-[11px]">
                      <thead className="border-b border-[#E2E5EA] text-[#5C626E]">
                        <tr>
                          <th className="pb-1.5 pr-3">{t(UI.telemetry.colTask)}</th>
                          <th className="pb-1.5 pr-3">{t(UI.telemetry.colRequested)}</th>
                          <th className="pb-1.5 pr-3">{t(UI.telemetry.colActualSource)}</th>
                          <th className="pb-1.5 pr-3">{t(UI.telemetry.colStatus)}</th>
                          <th className="pb-1.5 pr-3">{t(UI.telemetry.colModel)}</th>
                          <th className="pb-1.5 pr-3">Tokens</th>
                          <th className="pb-1.5 pr-3">{t(UI.telemetry.colLatency)}</th>
                          <th className="pb-1.5 pr-3">App Check</th>
                          <th className="pb-1.5">{t(UI.telemetry.colNote)}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F3F5] text-[#141518]">
                        {telemetry.map((evt) => (
                          <tr key={evt.id}>
                            <td className="py-1.5 pr-3 font-medium">{evt.task}</td>
                            <td className="py-1.5 pr-3 text-[#5C626E]">{evt.requestedMode}</td>
                            <td className="py-1.5 pr-3">
                              <span
                                className={
                                  evt.actualSource === 'IN_CLOUD'
                                    ? 'font-semibold text-[#B45309]'
                                    : 'font-semibold text-[#0F766E]'
                                }
                              >
                                {evt.actualSource}
                              </span>
                            </td>
                            <td className="py-1.5 pr-3">
                              <span
                                className={
                                  evt.status === 'error' || evt.status === 'cached'
                                    ? 'font-semibold text-[#B45309]'
                                    : evt.status === 'blocked'
                                      ? 'font-semibold text-[#BE123C]'
                                      : 'text-[#0F766E]'
                                }
                              >
                                {statusLabel(evt.status ?? 'ok')}
                              </span>
                            </td>
                            <td className="py-1.5 pr-3 text-[#5C626E]">{evt.cloudModelUsed ?? '—'}</td>
                            <td
                              className="py-1.5 pr-3 text-[#5C626E]"
                              title={evt.tokens ? `in ${evt.tokens.prompt} / out ${evt.tokens.output}` : undefined}
                            >
                              {evt.tokens ? evt.tokens.total.toLocaleString() : '—'}
                            </td>
                            <td className="py-1.5 pr-3">{evt.latencyMs}ms</td>
                            <td
                              className="py-1.5 pr-3 text-[#5C626E]"
                              title={evt.appCheckStatus === 'offline_bypass' ? 'No network request, so no App Check token is needed.' : undefined}
                            >
                              {/* `offline_bypass` means "no cloud request was made"; show it as not applicable so it never reads as a bypass. */}
                              {evt.appCheckStatus === 'offline_bypass' ? t(UI.telemetry.appCheckNa) : evt.appCheckStatus}
                            </td>
                            <td className="py-1.5 text-[#5C626E]">{evt.note ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              )}

              {activeTab === 'vault' && (
                <>
                  {vaultEntries.length === 0 ? (
                    <p className="font-mono text-[11.5px] text-[#5C626E]">
                      {t(UI.telemetry.vaultEmpty)}
                    </p>
                  ) : (
                    <>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-[11px] text-[#5C626E]">
                        {t(UI.telemetry.vaultNote)}
                      </p>
                      <button
                        type="button"
                        onClick={() => setRevealVault((v) => !v)}
                        aria-pressed={revealVault}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded border border-[#E2E5EA] bg-[#FFFFFF] px-2.5 py-1 font-mono text-[11px] text-[#141518] hover:border-[#0F766E]/50 sm:min-h-[30px]"
                      >
                        {revealVault ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        <span>
                          {revealVault ? t(UI.telemetry.maskRaw) : t(UI.telemetry.revealRaw)}
                        </span>
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {vaultEntries.map((entry) => (
                        <div
                          key={entry.token}
                          className="flex items-center justify-between rounded border border-[#E2E5EA] bg-[#F8F9FA] px-2.5 py-1.5 font-mono text-[11px]"
                        >
                          <span className="font-semibold text-[#0F766E]">{entry.token}</span>
                          <span
                            className="max-w-[180px] truncate text-[#BE123C]"
                            title={revealVault ? entry.originalValue : undefined}
                          >
                            {revealVault ? entry.originalValue : maskValue(entry.originalValue)}
                          </span>
                          <span className="text-[10px] text-[#5C626E]">×{entry.occurrences}</span>
                        </div>
                      ))}
                    </div>
                    </>
                  )}
                </>
              )}

              {activeTab === 'remote_config' && (
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-[11px] text-[#5C626E]">
                      {remoteConfig.fetchedAt
                        ? t(
                            UI.telemetry.fetched(
                              new Date(remoteConfig.fetchedAt).toLocaleTimeString(),
                              remoteConfig.configSource,
                            ),
                          )
                        : t(UI.telemetry.usingDefaults(remoteConfig.configSource))}
                    </p>
                    <button
                      type="button"
                      disabled={rcRefreshing || !onRefetchRemoteConfig}
                      onClick={async () => {
                        setRcRefreshing(true);
                        try {
                          await onRefetchRemoteConfig?.();
                        } finally {
                          setRcRefreshing(false);
                        }
                      }}
                      className="inline-flex min-h-[44px] items-center rounded border border-[#E2E5EA] bg-[#FFFFFF] px-2.5 py-1 font-mono text-[11px] text-[#141518] hover:border-[#0F766E]/50 disabled:opacity-50 sm:min-h-[30px]"
                    >
                      {rcRefreshing ? t(UI.telemetry.refetching) : t(UI.telemetry.refetch)}
                    </button>
                  </div>
                  {rcParams.length === 0 ? (
                    <p className="font-mono text-[11.5px] text-[#5C626E]">
                      {t(UI.telemetry.rcNotConfigured)}
                    </p>
                  ) : (
                    <table className="w-full text-left font-mono text-[11px]">
                      <thead className="border-b border-[#E2E5EA] text-[#5C626E]">
                        <tr>
                          <th className="pb-1.5 pr-3">{t(UI.telemetry.colParameter)}</th>
                          <th className="pb-1.5 pr-3">{t(UI.telemetry.colActiveValue)}</th>
                          <th className="pb-1.5">{t(UI.telemetry.colSource)}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F1F3F5]">
                        {rcParams.map((p) => (
                          <tr key={p.key}>
                            <td className="py-1.5 pr-3 text-[#141518]">{p.key}</td>
                            <td className="max-w-[320px] truncate py-1.5 pr-3 text-[#0F766E]" title={p.value}>
                              {p.value || '—'}
                            </td>
                            <td className="py-1.5 text-[#5C626E]">{p.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === 'firestore' && firestoreSync && (
                <div className="mb-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10.5px] uppercase ${syncLabel[firestoreSync].tone}`}
                  >
                    {firestoreSync === 'pending' && (
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                    )}
                    {t(syncLabel[firestoreSync].msg)}
                  </span>
                </div>
              )}
              {activeTab === 'firestore' && (
                <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-[#141518]">
                  {lastFirestorePayload
                    ? JSON.stringify(lastFirestorePayload, null, 2)
                    : t(UI.telemetry.firestoreHint)}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </footer>
  );
}
