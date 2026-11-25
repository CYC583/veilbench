import { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  Cloud,
  Copy,
  Cpu,
  Download,
  FileDiff,
  GitCompare,
  Mail,
  MessageSquare,
  RotateCw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import type { ActualInferenceSource } from '../types/hybrid';
import { localizeRuntimeMessage } from '../i18n/runtimeMessages';
import { logHybridAnalyticsEvent } from '../config/firebase';
import type {
  ChatTurn,
  DeepAuditResult,
  RiskSeverity,
  SupportedLocale,
  TriageResult,
} from '../types/audit';
import type {
  CloudFailureState,
  TranslatedAuditCache,
  WorkbenchStage,
} from '../state/useWorkbenchStore';

interface AuditWorkbenchProps {
  triage: TriageResult | null;
  deepAudit: DeepAuditResult | null;
  chatHistory: ChatTurn[];
  stage: WorkbenchStage;
  stageMessage: string;
  locale: SupportedLocale;
  translatedCache: TranslatedAuditCache;
  rehydrateLocal: (text: string) => string;
  onSendChat: (question: string) => void;
  cloudFailure: CloudFailureState | null;
  /** SHA-256 of the exact outbound payload, for the exported Zero-Leak receipt. */
  outboundPayloadHash?: string;
  outboundImageHashes?: Array<{ title: string; sha256: string }>;
  /** Once a workspace exists the workbench stays mounted (idle / loading / error / success states). */
  hasDocuments?: boolean;
  onRetryCloud: () => void;
  onDismissCloudFailure: () => void;
}

const failedStepLabel: Record<CloudFailureState['action'], { en: string; zh: string }> = {
  triage: { en: 'Stage 2 Rapid Triage', zh: 'Stage 2 快速風險篩檢' },
  deep_audit: { en: 'Stage 4 Cloud Redline Audit', zh: 'Stage 4 雲端紅線稽核' },
  chat: { en: 'Follow-Up Chat', zh: '多輪追問' },
};

function CloudFailureCard({
  failure,
  isZh,
  isBusy,
  onRetry,
  onDismiss,
}: {
  failure: CloudFailureState;
  isZh: boolean;
  isBusy: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const step = failedStepLabel[failure.action];
  return (
    <div
      role="alert"
      className="rounded-lg border border-[#B45309]/30 bg-[#FFFBEB] p-4 sm:p-5"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[14px] font-semibold text-[#141518]">
              {failure.partialPart
                ? isZh
                  ? `${step.zh} 部分完成：${failure.partialPart === 'playbook' ? '談判劇本與 Email' : '矛盾與紅線分析'}未完成`
                  : `${step.en} partially completed — ${failure.partialPart === 'playbook' ? 'negotiation playbook & email' : 'contradiction & redline analysis'} missing`
                : isZh
                  ? `${step.zh} 未完成`
                  : `${step.en} did not complete`}
            </h3>
            <span className="font-mono text-[10.5px] text-[#B45309]">
              {isZh
                ? `嘗試 ${failure.attempts} 次`
                : `${failure.attempts} ${failure.attempts === 1 ? 'ATTEMPT' : 'ATTEMPTS'}`}{' '}
              · IN_CLOUD
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#5C626E]">{failure.message}</p>
          <p className="mt-1 text-[12px] text-[#5C626E]">
            {isZh
              ? '本機脫敏、Local Vault 與 Layer 3 驗證結果都保留，重試只會送出同一份已脫敏內容。'
              : 'Local redaction, the Local Vault and the Layer 3 proof are untouched. Retry resends the same sanitized payload.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRetry}
              disabled={isBusy}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-[#0F766E] px-3.5 py-2 text-[13px] font-medium text-[#FFFFFF] transition-transform active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[36px]"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span>{isZh ? `重試 ${step.zh}` : `Retry ${step.en}`}</span>
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex min-h-[44px] items-center rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-3.5 py-2 text-[13px] font-medium text-[#141518] hover:border-[#B45309]/50 sm:min-h-[36px]"
            >
              {isZh ? '關閉' : 'Dismiss'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const severityZh: Record<RiskSeverity, string> = { high: '高', medium: '中', low: '低' };

function severityLabel(severity: RiskSeverity, isZh: boolean): string {
  return isZh ? severityZh[severity] ?? severity : severity;
}

function severityStyles(severity: RiskSeverity): string {
  switch (severity) {
    case 'high':
      return 'border-[#BE123C]/30 bg-[#FFF1F2] text-[#BE123C]';
    case 'medium':
      return 'border-[#B45309]/30 bg-[#FFFBEB] text-[#B45309]';
    case 'low':
      return 'border-[#0F766E]/30 bg-[#F0FDFA] text-[#0F766E]';
  }
}

/** Unmissable marker for results served from the recorded demo cache after a live cloud failure. */
function CachedBadge({
  audit,
  part,
  isZh = false,
}: {
  audit: DeepAuditResult;
  part: 'analysis' | 'playbook';
  isZh?: boolean;
}) {
  const info = audit.cacheInfo;
  const model = info
    ? part === 'analysis'
      ? info.analysisModel
      : info.playbookModel
    : isZh
      ? '雲端模型'
      : 'cloud model';
  const when = info ? new Date(info.recordedAt).toISOString().slice(0, 10) : '';
  return (
    <span
      title={
        isZh
          ? `這是先前錄製的 ${model} 真實輸出（${when}）。即時雲端呼叫失敗，可按重試取得最新結果。`
          : `Recorded real ${model} output (${when}). The live cloud call failed; use Retry for a fresh result.`
      }
      className="inline-flex items-center gap-1 rounded border border-[#B45309]/40 bg-[#FFFBEB] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-[#B45309]"
    >
      {isZh ? '快取示範結果' : 'Cached demo result'} · {model} · {when}
    </span>
  );
}

function SourceBadge({ source }: { source: ActualInferenceSource }) {
  const isLocal = source === 'ON_DEVICE' || source === 'LOCAL_DETERMINISTIC';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-medium uppercase ${
        isLocal
          ? 'border-[#0F766E]/30 bg-[#F0FDFA] text-[#0F766E]'
          : 'border-[#B45309]/30 bg-[#FFFBEB] text-[#B45309]'
      }`}
    >
      {isLocal ? <Cpu className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
      <span>{source}</span>
    </span>
  );
}

export function AuditWorkbench({
  triage,
  deepAudit,
  chatHistory,
  stage,
  stageMessage,
  locale,
  translatedCache,
  rehydrateLocal,
  onSendChat,
  cloudFailure,
  outboundPayloadHash,
  outboundImageHashes,
  hasDocuments = false,
  onRetryCloud,
  onDismissCloudFailure,
}: AuditWorkbenchProps) {
  const isZh = locale === 'zh-TW';
  const [rehydrateView, setRehydrateView] = useState<boolean>(true);
  const [copiedEmail, setCopiedEmail] = useState<boolean>(false);
  const [chatInput, setChatInput] = useState<string>('');

  const isLoadingTriage = stage === 'running_triage';
  const isLoadingDeep = stage === 'running_deep_audit';
  const isSendingChat = stage === 'sending_chat';

  // A cloud failure keeps the workbench (and the follow-up chat) mounted with an inline Retry.
  if (!hasDocuments && !triage && !deepAudit && !isLoadingTriage && !isLoadingDeep && !cloudFailure) {
    return null;
  }
  const showIdle = !triage && !deepAudit && !isLoadingTriage && !isLoadingDeep && !cloudFailure;

  const displayText = (sanitized: string) =>
    rehydrateView ? rehydrateLocal(sanitized) : sanitized;

  const emailContent = deepAudit
    ? displayText(deepAudit.playbook.readyToSendEmailSanitized)
    : '';

  const handleCopyEmail = async () => {
    if (!emailContent) return;
    try {
      await navigator.clipboard.writeText(emailContent);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      // ignore clipboard denial
    }
  };

  const handleExportZeroPiiMarkdown = () => {
    logHybridAnalyticsEvent('report_exported', { has_deep_audit: Boolean(deepAudit) });
    const lines: string[] = [
      '# VeilBench Zero-PII Audit Report',
      `Generated: ${new Date().toISOString()}`,
      'Privacy Guarantee: Strictly sanitized placeholder tokens only. Zero raw PII included.',
      '',
    ];
    if (triage) {
      lines.push(`## Rapid Risk Triage (${triage.overallRisk.toUpperCase()} — ${triage.inferenceSource})`);
      lines.push(triage.headline, '');
      for (const flag of triage.flags) {
        lines.push(`- **[${flag.severity.toUpperCase()}] ${flag.title}**: ${flag.plainSummary}`);
      }
      lines.push('');
    }
    if (deepAudit) {
      if (deepAudit.contradictions.length > 0) {
        lines.push('## Cross-Document Contradictions');
        for (const c of deepAudit.contradictions) {
          lines.push(
            `- **[${c.severity.toUpperCase()}] ${c.docATitle} vs ${c.docBTitle}**: ${c.description} (Recommendation: ${c.recommendation})`
          );
        }
        lines.push('');
      }
      if (deepAudit.redlines.length > 0) {
        lines.push('## Proposed Redline Revisions');
        for (const r of deepAudit.redlines) {
          lines.push(`### ${r.clauseTitle} [${r.severity.toUpperCase()}]`);
          lines.push(`- **Original**: ${r.originalExcerpt}`);
          lines.push(`- **Proposed**: ${r.proposedRevision}`);
          lines.push(`- **Rationale**: ${r.rationale}`, '');
        }
      }
      lines.push('## Sanitized Negotiation Email Draft');
      lines.push('```text', deepAudit.playbook.readyToSendEmailSanitized, '```');
    }
    // I-2: Zero-Leak receipt — what was sent (hash), when, by which engine, and whether any part was cached.
    lines.push(
      '',
      '## Zero-Leak Receipt',
      `- Outbound payload SHA-256: \`${outboundPayloadHash ?? 'not computed'}\``,
      ...(outboundImageHashes ?? []).map((h) => `- Burned image ${h.title} SHA-256: \`${h.sha256}\``),
      `- Report generated: ${new Date().toISOString()}`,
      ...(triage ? [`- Stage 2 inference source: ${triage.inferenceSource}`] : []),
      ...(deepAudit
        ? [
            `- Stage 4 inference source: ${deepAudit.inferenceSource} (generated ${deepAudit.generatedAt})`,
            `- Stage 4 cached demo parts: ${deepAudit.cachedParts?.join(', ') || 'none (live result)'}`,
          ]
        : []),
      '- Raw values and the Local Vault never leave the browser; tokens above are restored only on-device.'
    );

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `veilbench-zero-pii-report-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isSendingChat) return;
    onSendChat(chatInput);
    setChatInput('');
  };

  return (
    <section className="space-y-4">
      {/* Section Control Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E2E5EA] bg-[#FFFFFF] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <FileDiff className="h-4 w-4 text-[#0F766E]" />
          <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-[#141518]">
            {isZh ? '稽核分析與紅線談判工作台' : 'Audit Findings & Negotiation Workbench'}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle Re-hydration View */}
          <div className="inline-flex items-center rounded-md border border-[#E2E5EA] bg-[#F8F9FA] p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setRehydrateView(true)}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                rehydrateView
                  ? 'bg-[#FFFFFF] text-[#0F766E] ring-1 ring-[#E2E5EA]'
                  : 'text-[#5C626E] hover:text-[#141518]'
              }`}
            >
              {isZh ? '本機還原視圖' : 'On-Device Re-hydrated'}
            </button>
            <button
              type="button"
              onClick={() => setRehydrateView(false)}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                !rehydrateView
                  ? 'bg-[#FFFFFF] text-[#141518] ring-1 ring-[#E2E5EA]'
                  : 'text-[#5C626E] hover:text-[#141518]'
              }`}
            >
              {isZh ? '零個資脫敏視圖' : 'Zero-PII Sanitized'}
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportZeroPiiMarkdown}
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-2.5 py-1 text-[12px] font-medium text-[#141518] hover:border-[#0F766E]/60 hover:text-[#0F766E]"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isZh ? '匯出零個資報告 (.md)' : 'Export Zero-PII Report (.md)'}</span>
          </button>
        </div>
      </div>

      {/* Asymmetric 7fr / 5fr Workbench Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left 7 cols: Rapid Triage, Cross-Doc Contradictions, Interactive Redline Diff */}
        <div className="space-y-4 lg:col-span-7">
          {cloudFailure && stage === 'idle' && (
            <CloudFailureCard
              failure={{ ...cloudFailure, message: localizeRuntimeMessage(cloudFailure.message, locale) }}
              isZh={isZh}
              isBusy={stage !== 'idle'}
              onRetry={onRetryCloud}
              onDismiss={onDismissCloudFailure}
            />
          )}

          {showIdle && (
            <div className="rounded-lg border border-dashed border-[#E2E5EA] bg-[#FFFFFF] p-5">
              <h3 className="text-[14px] font-semibold text-[#141518]">
                {isZh ? '尚未執行 AI 分析' : 'No AI analysis yet'}
              </h3>
              <ol className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-[#5C626E]">
                <li>
                  <span className="font-mono text-[11px] text-[#0F766E]">STAGE 2</span>{' '}
                  {isZh
                    ? '快速風險篩檢：Nano 可用時在裝置端執行，否則使用已脫敏內容走雲端備援。'
                    : 'Rapid Triage runs on Gemini Nano when available, otherwise on the sanitized payload in the cloud.'}
                </li>
                <li>
                  <span className="font-mono text-[11px] text-[#B45309]">STAGE 4</span>{' '}
                  {isZh
                    ? '雲端深度稽核：通過 Layer 3 檢查後，才會把代號化內容送到 Cloud Gemini。'
                    : 'Cloud Redline Audit sends only the Layer 3-verified, tokenized payload to Cloud Gemini.'}
                </li>
              </ol>
            </div>
          )}

          {/* Loading Skeleton for Rapid Triage */}
          {isLoadingTriage && (
            <div className="rounded-lg border border-[#E2E5EA] bg-[#FFFFFF] p-5">
              <div className="mb-3 flex items-center gap-2 font-mono text-[12px] text-[#0F766E]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#0F766E]" />
                <span>{stageMessage}</span>
              </div>
              <div className="space-y-2.5">
                <div className="skeleton-shimmer h-5 w-2/3 rounded" />
                <div className="skeleton-shimmer h-16 w-full rounded" />
                <div className="skeleton-shimmer h-16 w-full rounded" />
              </div>
            </div>
          )}

          {/* Stage 2: Rapid Triage Card */}
          {triage && !isLoadingTriage && (
            <div className="rounded-lg border border-[#E2E5EA] bg-[#FFFFFF] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded border px-2 py-0.5 font-mono text-[11px] font-semibold uppercase ${severityStyles(triage.overallRisk)}`}
                  >
                    {isZh ? `${severityLabel(triage.overallRisk, true)}風險` : `${triage.overallRisk} RISK`}
                  </span>
                  <h3 className="text-[14px] font-semibold text-[#141518]">
                    {isZh ? 'Stage 2 快速風險篩檢' : 'Stage 2 Rapid Risk Triage'}
                  </h3>
                </div>
                <SourceBadge source={triage.inferenceSource} />
              </div>

              <p className="mt-2.5 text-[14px] leading-relaxed text-[#141518]">
                {isZh && translatedCache.triageHeadline
                  ? displayText(translatedCache.triageHeadline)
                  : displayText(triage.headline)}
              </p>

              <div className="mt-4 space-y-2.5">
                {triage.flags.map((flag) => (
                  <div
                    key={flag.id}
                    className="rounded-md border border-[#E2E5EA] bg-[#F8F9FA] p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-[#141518]">
                        {displayText(flag.title)}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${severityStyles(flag.severity)}`}
                      >
                        {severityLabel(flag.severity, isZh)}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-[#5C626E]">
                      {displayText(flag.plainSummary)}
                    </p>
                    {flag.excerpt && (
                      <div className="mt-2 rounded border border-[#E2E5EA] bg-[#FFFFFF] px-2.5 py-1.5 font-mono text-[11.5px] text-[#5C626E]">
                        “{displayText(flag.excerpt)}”
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loading Skeleton for Deep Audit */}
          {isLoadingDeep && (
            <div className="rounded-lg border border-[#E2E5EA] bg-[#FFFFFF] p-5">
              <div className="mb-3 flex items-center gap-2 font-mono text-[12px] text-[#B45309]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#B45309]" />
                <span>{stageMessage}</span>
              </div>
              <div className="space-y-3">
                <div className="skeleton-shimmer h-20 w-full rounded" />
                <div className="skeleton-shimmer h-28 w-full rounded" />
                <div className="skeleton-shimmer h-28 w-full rounded" />
              </div>
            </div>
          )}

          {/* Stage 4: Cross-Document Contradictions */}
          {deepAudit && deepAudit.contradictions.length > 0 && !isLoadingDeep && (
            <div className="rounded-lg border border-[#BE123C]/30 bg-[#FFFFFF] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <GitCompare className="h-4 w-4 text-[#BE123C]" />
                  <h3 className="text-[14px] font-semibold text-[#141518]">
                    {isZh
                      ? `跨文件矛盾稽核警示 (${deepAudit.contradictions.length})`
                      : `Cross-Document Contradictions (${deepAudit.contradictions.length})`}
                  </h3>
                </div>
                {deepAudit.cachedParts?.includes('analysis') ? (
                  <CachedBadge audit={deepAudit} part="analysis" isZh={isZh} />
                ) : (
                  <SourceBadge source={deepAudit.inferenceSource} />
                )}
              </div>

              <div className="mt-3 space-y-3">
                {deepAudit.contradictions.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-md border border-[#BE123C]/25 bg-[#FFF1F2]/50 p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[#BE123C]">
                        <AlertOctagon className="h-3.5 w-3.5" />
                        <span>
                          {displayText(item.docATitle)} ↔ {displayText(item.docBTitle)}
                        </span>
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${severityStyles(item.severity)}`}
                      >
                        {severityLabel(item.severity, isZh)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-[#141518]">
                      {displayText(item.description)}
                    </p>
                    <p className="mt-1.5 text-[12px] font-medium text-[#0F766E]">
                      {isZh ? '建議修正' : 'Recommended Fix'}: {displayText(item.recommendation)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stage 4: Interactive Redline Diff */}
          {deepAudit && deepAudit.redlines.length > 0 && !isLoadingDeep && (
            <div className="rounded-lg border border-[#E2E5EA] bg-[#FFFFFF] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-[#B45309]" />
                  <h3 className="text-[14px] font-semibold text-[#141518]">
                    {isZh
                      ? `互動式紅線修訂建議 (${deepAudit.redlines.length})`
                      : `Interactive Redline Diff (${deepAudit.redlines.length})`}
                  </h3>
                </div>
                {deepAudit.cachedParts?.includes('analysis') ? (
                  <CachedBadge audit={deepAudit} part="analysis" isZh={isZh} />
                ) : (
                  <SourceBadge source={deepAudit.inferenceSource} />
                )}
              </div>

              <div className="mt-3.5 space-y-4">
                {deepAudit.redlines.map((clause) => (
                  <div
                    key={clause.id}
                    className="overflow-hidden rounded-md border border-[#E2E5EA]"
                  >
                    <div className="flex items-center justify-between border-b border-[#E2E5EA] bg-[#F8F9FA] px-3.5 py-2">
                      <span className="text-[13px] font-semibold text-[#141518]">
                        {displayText(clause.clauseTitle)}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${severityStyles(clause.severity)}`}
                      >
                        {severityLabel(clause.severity, isZh)}
                      </span>
                    </div>
                    <div className="space-y-2 p-3.5 font-mono text-[12px] leading-relaxed">
                      <div className="rounded border border-[#BE123C]/20 bg-[#FFF1F2] px-3 py-2 text-[#BE123C] line-through">
                        - {displayText(clause.originalExcerpt)}
                      </div>
                      <div className="rounded border border-[#0F766E]/25 bg-[#F0FDFA] px-3 py-2 text-[#0F766E]">
                        + {displayText(clause.proposedRevision)}
                      </div>
                      <p className="pt-1 font-sans text-[12.5px] text-[#5C626E]">
                        <strong className="text-[#141518]">{isZh ? '理由：' : 'Rationale:'}</strong>{' '}
                        {displayText(clause.rationale)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right 5 cols: Negotiation Playbook, Ready-to-Send Re-hydrated Email, Multi-Turn Chat */}
        <div className="space-y-4 lg:col-span-5">
          {deepAudit && !isLoadingDeep && !deepAudit.incompleteParts?.includes('playbook') && (
            <>
              {/* Playbook Card */}
              <div className="rounded-lg border border-[#E2E5EA] bg-[#FFFFFF] p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[14px] font-semibold text-[#141518]">
                    {isZh ? '談判應對劇本' : 'Negotiation Playbook'}
                  </h3>
                  {deepAudit.cachedParts?.includes('playbook') && (
                    <CachedBadge audit={deepAudit} part="playbook" isZh={isZh} />
                  )}
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#0F766E]">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>
                      {rehydrateView
                        ? isZh
                          ? '本機還原'
                          : 'LOCAL RE-HYDRATED'
                        : isZh
                          ? '零個資'
                          : 'ZERO-PII'}
                    </span>
                  </span>
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-[#5C626E]">
                  {isZh && translatedCache.executiveSummary
                    ? displayText(translatedCache.executiveSummary)
                    : displayText(deepAudit.playbook.executiveSummary)}
                </p>

                {deepAudit.playbook.counterpartyPushback.length > 0 && (
                  <div className="mt-3.5 space-y-2.5">
                    <div className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#5C626E]">
                      {isZh ? '預期反對意見與應對話術' : 'Anticipated Pushback & Counter-Scripts'}
                    </div>
                    {deepAudit.playbook.counterpartyPushback.map((pb, idx) => (
                      <div
                        key={idx}
                        className="rounded-md border border-[#E2E5EA] bg-[#F8F9FA] p-3 text-[12.5px]"
                      >
                        <div className="font-medium text-[#141518]">
                          {isZh ? '若對方說' : 'If they say'}: “{displayText(pb.objection)}”
                        </div>
                        <div className="mt-1 text-[#0F766E]">
                          {isZh ? '回應' : 'Respond'}: {displayText(pb.recommendedResponse)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ready-to-Send Email Card */}
              <div className="rounded-lg border border-[#E2E5EA] bg-[#FFFFFF] p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-[#0F766E]" />
                    <h3 className="text-[14px] font-semibold text-[#141518]">
                      {isZh ? '一鍵還原談判 Email' : 'Ready-to-Send Negotiation Email'}
                    </h3>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                  <a
                    href={`mailto:?subject=${encodeURIComponent('Contract review before signing')}&body=${encodeURIComponent(emailContent)}`}
                    className="inline-flex min-h-[30px] items-center gap-1 rounded border border-[#E2E5EA] bg-[#F8F9FA] px-2.5 py-1 text-[11.5px] font-medium text-[#141518] hover:border-[#0F766E]/60 hover:text-[#0F766E]"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>{isZh ? '用郵件 App 開啟' : 'Open in mail app'}</span>
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="inline-flex min-h-[30px] items-center gap-1 rounded border border-[#E2E5EA] bg-[#F8F9FA] px-2.5 py-1 text-[11.5px] font-medium text-[#141518] hover:border-[#0F766E]/60 hover:text-[#0F766E]"
                  >
                    {copiedEmail ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#0F766E]" />
                        <span>{isZh ? '已複製' : 'Copied'}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>{isZh ? '複製' : 'Copy'}</span>
                      </>
                    )}
                  </button>
                  </div>
                </div>
                <pre className="mt-3 max-h-60 overflow-y-auto rounded-md border border-[#E2E5EA] bg-[#F8F9FA] p-3 font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap text-[#141518]">
                  {emailContent}
                </pre>
              </div>
            </>
          )}

          {/* Multi-Turn Follow-Up Negotiation Chat */}
          <div className="rounded-lg border border-[#E2E5EA] bg-[#FFFFFF] p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-[#0F766E]" />
                <h3 className="text-[14px] font-semibold text-[#141518]">
                  {isZh ? '多輪零外洩追問' : 'Zero-Leak Follow-Up Chat'}
                </h3>
              </div>
              <span className="font-mono text-[10px] text-[#5C626E]">
                {isZh ? '輸入自動脫敏' : 'Auto-Redacts Input'}
              </span>
            </div>

            <div className="mt-3 max-h-64 space-y-2.5 overflow-y-auto pr-1">
              {chatHistory.length === 0 ? (
                <p className="rounded-md border border-dashed border-[#E2E5EA] bg-[#F8F9FA] p-3 text-[12px] text-[#5C626E]">
                  {isZh
                    ? '可針對條款細節、賠償上限或談判策略追問；您輸入的任何名字或金額都會先在本機自動脫敏後才送出。'
                    : 'Ask follow-up questions on liability caps, IP carve-outs, or payment terms. Any names or amounts you type are redacted locally first.'}
                </p>
              ) : (
                chatHistory.map((turn) => (
                  <div
                    key={turn.id}
                    className={`rounded-md border p-3 text-[12.5px] leading-relaxed ${
                      turn.role === 'user'
                        ? 'border-[#E2E5EA] bg-[#F8F9FA] text-[#141518]'
                        : 'border-[#0F766E]/25 bg-[#F0FDFA]/50 text-[#141518]'
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase text-[#5C626E]">
                      <span>
                        {turn.role === 'user'
                          ? isZh
                            ? '您（本機）'
                            : 'You (Local)'
                          : isZh
                            ? 'VeilBench 稽核員'
                            : 'VeilBench Auditor'}
                      </span>
                      {turn.inferenceSource && <SourceBadge source={turn.inferenceSource} />}
                    </div>
                    <div className="whitespace-pre-wrap">
                      {rehydrateView ? turn.rehydratedContent : turn.sanitizedContent}
                    </div>
                  </div>
                ))
              )}
              {isSendingChat && (
                <div className="skeleton-shimmer h-14 w-full rounded-md" />
              )}
            </div>

            <form onSubmit={handleChatSubmit} className="mt-3 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isSendingChat}
                placeholder={
                  isZh
                    ? '例如：請幫我擬一段限制賠償上限為合約總額的條文...'
                    : 'e.g. Draft a 1x fee liability cap clause...'
                }
                className="flex-1 rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-3 py-2 text-[12.5px] text-[#141518] placeholder:text-[#94A3B8] focus:border-[#0F766E] focus:outline-none"
              />
              <button
                type="submit"
                disabled={isSendingChat || !chatInput.trim()}
                aria-label={isZh ? '送出追問' : 'Send follow-up question'}
                className="inline-flex min-h-[38px] items-center justify-center rounded-md bg-[#0F766E] px-3.5 text-white hover:bg-[#0D655E] active:translate-y-px disabled:opacity-45"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
