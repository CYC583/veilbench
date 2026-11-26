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
import { UI, translator } from '../i18n/ui';
import type { Msg } from '../i18n/ui/types';
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
  /** Explicit running flags (A2 parallel run); default to deriving from `stage`. */
  triageRunning?: boolean;
  deepRunning?: boolean;
}

const failedStepLabel: Record<CloudFailureState['action'], Msg> = {
  triage: UI.workbench.stepTriage,
  deep_audit: UI.workbench.stepDeepAudit,
  chat: UI.workbench.stepChat,
};

function CloudFailureCard({
  failure,
  locale,
  isBusy,
  onRetry,
  onDismiss,
}: {
  failure: CloudFailureState;
  locale: SupportedLocale;
  isBusy: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const t = translator(locale);
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
                ? t(
                    UI.workbench.failurePartial(
                      step,
                      failure.partialPart === 'playbook'
                        ? UI.workbench.partialPlaybook
                        : UI.workbench.partialAnalysis,
                    ),
                  )
                : t(UI.workbench.failureDidNotComplete(step))}
            </h3>
            <span className="font-mono text-[10.5px] text-[#B45309]">
              {t(UI.workbench.attempts(failure.attempts))}{' '}
              · IN_CLOUD
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#5C626E]">{failure.message}</p>
          <p className="mt-1 text-[12px] text-[#5C626E]">
            {t(UI.workbench.failureReassurance)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRetry}
              disabled={isBusy}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-[#0F766E] px-3.5 py-2 text-[13px] font-medium text-[#FFFFFF] transition-transform active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[36px]"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span>{t(UI.workbench.retryStep(step))}</span>
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex min-h-[44px] items-center rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-3.5 py-2 text-[13px] font-medium text-[#141518] hover:border-[#B45309]/50 sm:min-h-[36px]"
            >
              {t(UI.workbench.dismiss)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const severityMsg: Record<RiskSeverity, Msg> = {
  high: UI.workbench.severityHigh,
  medium: UI.workbench.severityMedium,
  low: UI.workbench.severityLow,
};

function severityLabel(severity: RiskSeverity, locale: SupportedLocale): string {
  const msg = severityMsg[severity];
  return msg ? translator(locale)(msg) : severity;
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
  locale = 'en',
}: {
  audit: DeepAuditResult;
  part: 'analysis' | 'playbook';
  locale?: SupportedLocale;
}) {
  const t = translator(locale);
  const info = audit.cacheInfo;
  const model = info
    ? part === 'analysis'
      ? info.analysisModel
      : info.playbookModel
    : t(UI.workbench.cloudModel);
  const when = info ? new Date(info.recordedAt).toISOString().slice(0, 10) : '';
  return (
    <span
      title={t(UI.workbench.cachedTitle(model, when))}
      className="inline-flex items-center gap-1 rounded border border-[#B45309]/40 bg-[#FFFBEB] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-[#B45309]"
    >
      {t(UI.workbench.cachedDemoResult)} · {model} · {when}
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
  triageRunning,
  deepRunning,
}: AuditWorkbenchProps) {
  const t = translator(locale);
  const isZh = locale === 'zh-TW';
  const [rehydrateView, setRehydrateView] = useState<boolean>(true);
  const [copiedEmail, setCopiedEmail] = useState<boolean>(false);
  const [chatInput, setChatInput] = useState<string>('');

  const isLoadingTriage = triageRunning ?? stage === 'running_triage';
  const isLoadingDeep = deepRunning ?? stage === 'running_deep_audit';
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
      'Privacy note: placeholder tokens only; raw values were replaced on-device before export.',
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
            {t(UI.workbench.title)}
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
              {t(UI.workbench.viewRehydrated)}
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
              {t(UI.workbench.viewSanitized)}
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportZeroPiiMarkdown}
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-2.5 py-1 text-[12px] font-medium text-[#141518] hover:border-[#0F766E]/60 hover:text-[#0F766E]"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{t(UI.workbench.exportReport)}</span>
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
              locale={locale}
              isBusy={stage !== 'idle'}
              onRetry={onRetryCloud}
              onDismiss={onDismissCloudFailure}
            />
          )}

          {showIdle && (
            <div className="rounded-lg border border-dashed border-[#E2E5EA] bg-[#FFFFFF] p-5">
              <h3 className="text-[14px] font-semibold text-[#141518]">
                {t(UI.workbench.emptyTitle)}
              </h3>
              <ol className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-[#5C626E]">
                <li>
                  <span className="font-mono text-[11px] text-[#0F766E]">STAGE 2</span>{' '}
                  {t(UI.workbench.emptyStage2)}
                </li>
                <li>
                  <span className="font-mono text-[11px] text-[#B45309]">STAGE 4</span>{' '}
                  {t(UI.workbench.emptyStage4)}
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
                    {t(UI.workbench.overallRisk(triage.overallRisk, severityLabel(triage.overallRisk, 'zh-TW')))}
                  </span>
                  <h3 className="text-[14px] font-semibold text-[#141518]">
                    {t(UI.workbench.triageTitle)}
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
                        {severityLabel(flag.severity, locale)}
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
                    {t(UI.workbench.contradictionsTitle(deepAudit.contradictions.length))}
                  </h3>
                </div>
                {deepAudit.cachedParts?.includes('analysis') ? (
                  <CachedBadge audit={deepAudit} part="analysis" locale={locale} />
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
                        {severityLabel(item.severity, locale)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-[#141518]">
                      {displayText(item.description)}
                    </p>
                    <p className="mt-1.5 text-[12px] font-medium text-[#0F766E]">
                      {t(UI.workbench.recommendedFix)}: {displayText(item.recommendation)}
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
                    {t(UI.workbench.redlinesTitle(deepAudit.redlines.length))}
                  </h3>
                </div>
                {deepAudit.cachedParts?.includes('analysis') ? (
                  <CachedBadge audit={deepAudit} part="analysis" locale={locale} />
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
                        {severityLabel(clause.severity, locale)}
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
                        <strong className="text-[#141518]">{t(UI.workbench.rationale)}</strong>{' '}
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
                    {t(UI.workbench.playbookTitle)}
                  </h3>
                  {deepAudit.cachedParts?.includes('playbook') && (
                    <CachedBadge audit={deepAudit} part="playbook" locale={locale} />
                  )}
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#0F766E]">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>
                      {t(rehydrateView ? UI.workbench.localRehydrated : UI.workbench.zeroPii)}
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
                      {t(UI.workbench.pushbackTitle)}
                    </div>
                    {deepAudit.playbook.counterpartyPushback.map((pb, idx) => (
                      <div
                        key={idx}
                        className="rounded-md border border-[#E2E5EA] bg-[#F8F9FA] p-3 text-[12.5px]"
                      >
                        <div className="font-medium text-[#141518]">
                          {t(UI.workbench.ifTheySay)}: “{displayText(pb.objection)}”
                        </div>
                        <div className="mt-1 text-[#0F766E]">
                          {t(UI.workbench.respond)}: {displayText(pb.recommendedResponse)}
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
                      {t(UI.workbench.emailTitle)}
                    </h3>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                  <a
                    href={`mailto:?subject=${encodeURIComponent('Contract review before signing')}&body=${encodeURIComponent(emailContent)}`}
                    className="inline-flex min-h-[30px] items-center gap-1 rounded border border-[#E2E5EA] bg-[#F8F9FA] px-2.5 py-1 text-[11.5px] font-medium text-[#141518] hover:border-[#0F766E]/60 hover:text-[#0F766E]"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span>{t(UI.workbench.openInMail)}</span>
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="inline-flex min-h-[30px] items-center gap-1 rounded border border-[#E2E5EA] bg-[#F8F9FA] px-2.5 py-1 text-[11.5px] font-medium text-[#141518] hover:border-[#0F766E]/60 hover:text-[#0F766E]"
                  >
                    {copiedEmail ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#0F766E]" />
                        <span>{t(UI.workbench.copied)}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>{t(UI.workbench.copy)}</span>
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
                  {t(UI.workbench.chatTitle)}
                </h3>
              </div>
              <span className="font-mono text-[10px] text-[#5C626E]">
                {t(UI.workbench.autoRedacts)}
              </span>
            </div>

            <div className="mt-3 max-h-64 space-y-2.5 overflow-y-auto pr-1">
              {chatHistory.length === 0 ? (
                <p className="rounded-md border border-dashed border-[#E2E5EA] bg-[#F8F9FA] p-3 text-[12px] text-[#5C626E]">
                  {t(UI.workbench.chatEmpty)}
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
                        {t(turn.role === 'user' ? UI.workbench.roleUser : UI.workbench.roleAuditor)}
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
                placeholder={t(UI.workbench.chatPlaceholder)}
                className="flex-1 rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-3 py-2 text-[12.5px] text-[#141518] placeholder:text-[#94A3B8] focus:border-[#0F766E] focus:outline-none"
              />
              <button
                type="submit"
                disabled={isSendingChat || !chatInput.trim()}
                aria-label={t(UI.workbench.sendFollowUp)}
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
