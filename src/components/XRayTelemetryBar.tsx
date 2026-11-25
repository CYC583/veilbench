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

const syncLabel: Record<FirestoreSyncState, { en: string; zh: string; tone: string }> = {
  pending: { en: 'Pending sync (offline cache)', zh: '等待同步（離線快取）', tone: 'text-[#B45309] border-[#B45309]/30 bg-[#FFFBEB]' },
  synced: { en: 'Synced to Cloud Firestore', zh: '已同步至 Cloud Firestore', tone: 'text-[#0F766E] border-[#0F766E]/30 bg-[#F0FDFA]' },
  failed: { en: 'Sync failed — kept in local cache', zh: '同步失敗（保留於本機快取）', tone: 'text-[#BE123C] border-[#BE123C]/30 bg-[#FFF1F2]' },
  local_only: { en: 'Local only (Firestore not configured)', zh: '僅本機（未設定 Firestore）', tone: 'text-[#475569] border-[#475569]/30 bg-[#F1F5F9]' },
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
  const isZh = locale === 'zh-TW';

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

  const appCheckLabel = (
    isZh
      ? {
          verified: 'App Check：已驗證',
          debug: 'App Check：除錯模式',
          pending: 'App Check：驗證中...',
          failed: 'App Check：失敗',
          unconfigured: 'App Check：未設定',
        }
      : {
          verified: 'App Check: Verified',
          debug: 'App Check: Debug',
          pending: 'App Check: Verifying...',
          failed: 'App Check: Failed',
          unconfigured: 'App Check: Not configured',
        }
  )[appCheckStatus];

  const statusLabel = (status: string) => {
    if (!isZh) return status.toUpperCase();
    if (status === 'ok') return '成功';
    if (status === 'error') return '錯誤';
    if (status === 'blocked') return '已阻擋';
    if (status === 'cached') return '快取';
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
              {isZh ? 'Hybrid AI X-Ray 遙測透視' : 'Hybrid AI X-Ray Telemetry'}
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
              <span>{isZh ? '本機／節省' : 'Local/Saved'}: {localCalls}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[#B45309]">
              <Cloud className="h-3.5 w-3.5" />
              <span>{isZh ? '雲端' : 'Cloud'}: {cloudCalls}</span>
            </span>
            <span
              className="inline-flex items-center gap-1 text-[#5C626E]"
              title={
                isZh
                  ? '本工作階段雲端呼叫實際消耗的 token（SDK usageMetadata）'
                  : 'Metered cloud tokens this session (SDK usageMetadata)'
              }
            >
              <span>{isZh ? '雲端 token' : 'Cloud tokens'}: {cloudTokens.toLocaleString()}</span>
            </span>
            {latestEvent && (
              <span className="hidden sm:inline">
                {isZh ? '最近' : 'Last'}: <strong>{latestEvent.actualSource}</strong> ({latestEvent.latencyMs}ms)
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
                <span>{isZh ? '推論紀錄' : 'Inference Log'} ({telemetry.length})</span>
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
                <span>{isZh ? '本機共享金庫' : 'Local Shared Vault'} ({vaultEntries.length})</span>
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
                <span>{isZh ? 'Cloud Firestore 零 PII JSON' : 'Cloud Firestore Zero-PII JSON'}</span>
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
                      {isZh
                        ? '尚無推論事件。載入範例文件組即可觀察即時 Hybrid 遙測。'
                        : 'No inference events recorded yet. Load a sample bundle to observe live hybrid telemetry.'}
                    </p>
                  ) : (
                    <table className="w-full min-w-[640px] text-left font-mono text-[11px]">
                      <thead className="border-b border-[#E2E5EA] text-[#5C626E]">
                        <tr>
                          <th className="pb-1.5 pr-3">{isZh ? '任務' : 'Task'}</th>
                          <th className="pb-1.5 pr-3">{isZh ? '請求模式' : 'Requested'}</th>
                          <th className="pb-1.5 pr-3">{isZh ? '實際來源' : 'Actual Source'}</th>
                          <th className="pb-1.5 pr-3">{isZh ? '狀態' : 'Status'}</th>
                          <th className="pb-1.5 pr-3">{isZh ? '模型' : 'Model'}</th>
                          <th className="pb-1.5 pr-3">Tokens</th>
                          <th className="pb-1.5 pr-3">{isZh ? '延遲' : 'Latency'}</th>
                          <th className="pb-1.5 pr-3">App Check</th>
                          <th className="pb-1.5">{isZh ? '備註' : 'Note'}</th>
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
                            <td className="py-1.5 pr-3 text-[#5C626E]">{evt.appCheckStatus}</td>
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
                      {isZh
                        ? '本機共享金庫目前是空的。所有偵測到的 PII 對應僅保存在瀏覽器記憶體中。'
                        : 'Local Shared Vault is empty. All detected PII mappings stay strictly in browser RAM.'}
                    </p>
                  ) : (
                    <>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-[11px] text-[#5C626E]">
                        {isZh
                          ? '原始值只存在瀏覽器記憶體，預設遮罩顯示。'
                          : 'Raw values live only in browser memory and are masked by default.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => setRevealVault((v) => !v)}
                        aria-pressed={revealVault}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded border border-[#E2E5EA] bg-[#FFFFFF] px-2.5 py-1 font-mono text-[11px] text-[#141518] hover:border-[#0F766E]/50 sm:min-h-[30px]"
                      >
                        {revealVault ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        <span>
                          {revealVault
                            ? isZh ? '遮罩原始值' : 'Mask raw values'
                            : isZh ? '顯示原始值（僅本機）' : 'Reveal raw values (local only)'}
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
                        ? isZh
                          ? `取得時間 ${new Date(remoteConfig.fetchedAt).toLocaleTimeString()} · 來源：${remoteConfig.configSource}`
                          : `Fetched ${new Date(remoteConfig.fetchedAt).toLocaleTimeString()} · source: ${remoteConfig.configSource}`
                        : isZh
                          ? `使用內建預設值（${remoteConfig.configSource}）`
                          : `Using in-app defaults (${remoteConfig.configSource})`}
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
                      {rcRefreshing ? (isZh ? '重新取得中...' : 'Refetching...') : isZh ? '重新取得' : 'Refetch'}
                    </button>
                  </div>
                  {rcParams.length === 0 ? (
                    <p className="font-mono text-[11.5px] text-[#5C626E]">
                      {isZh ? '尚未設定 Remote Config。' : 'Remote Config is not configured.'}
                    </p>
                  ) : (
                    <table className="w-full text-left font-mono text-[11px]">
                      <thead className="border-b border-[#E2E5EA] text-[#5C626E]">
                        <tr>
                          <th className="pb-1.5 pr-3">{isZh ? '參數' : 'Parameter'}</th>
                          <th className="pb-1.5 pr-3">{isZh ? '生效值' : 'Active value'}</th>
                          <th className="pb-1.5">{isZh ? '來源' : 'Source'}</th>
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
                    {isZh ? syncLabel[firestoreSync].zh : syncLabel[firestoreSync].en}
                  </span>
                </div>
              )}
              {activeTab === 'firestore' && (
                <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-[#141518]">
                  {lastFirestorePayload
                    ? JSON.stringify(lastFirestorePayload, null, 2)
                    : isZh
                      ? '// 執行快速篩檢或雲端稽核後，即可檢視實際寫入 Cloud Firestore 的零 PII JSON（persistentLocalCache）。'
                      : '// Run Rapid Triage or Cloud Audit to inspect the exact Zero-PII JSON persisted to Cloud Firestore (persistentLocalCache).'}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </footer>
  );
}
