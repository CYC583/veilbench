import { useEffect, useState } from 'react';
import { Check, Cloud, Copy, Cpu, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import type { DecisionCard as DecisionCardModel } from '../core/decisionCard';
import { pctBucket } from '../core/relationalHints';
import { UI, translator } from '../i18n/ui';
import type { DeepAuditResult, SupportedLocale, TriageResult } from '../types/audit';
import type { ParallelRunState } from '../state/useWorkbenchStore';

export interface DecisionCardProps {
  card: DecisionCardModel | null;
  triage: TriageResult | null;
  deepAudit: DeepAuditResult | null;
  parallelRun: ParallelRunState | null;
  triageRunning: boolean;
  deepRunning: boolean;
  isBusy: boolean;
  locale: SupportedLocale;
  rehydrateLocal: (sanitized: string) => string;
  onRunDecision: () => void;
  onVerify: () => void;
}

const VERDICT = {
  fix_first: {
    en: "Don't sign yet — fix first", zh: '先別簽：先談再簽',
    tone: 'border-[#B45309]/40 bg-[#FFFBEB] text-[#92400E]',
  },
  walk_away: {
    en: 'Walk away', zh: '建議不要簽',
    tone: 'border-[#BE123C]/40 bg-[#FFF1F2] text-[#9F1239]',
  },
  sign: {
    en: 'OK to sign', zh: '可以簽',
    tone: 'border-[#0F766E]/40 bg-[#F0FDFA] text-[#0F766E]',
  },
} as const;

const RULE = {
  fix_any_issue: {
    en: 'Rule (on-device): any high- or medium-severity finding, or a money gap, must be fixed before signing.',
    zh: '規則（裝置端）：只要有高／中風險項目或金額落差，就先修改再簽。',
  },
  walk_away_large_gap: {
    en: 'Rule (on-device): a money gap of 30% or more of the larger amount means walk away.',
    zh: '規則（裝置端）：金額落差達較大金額的 30% 以上，建議不要簽。',
  },
  walk_away_many_high: {
    en: 'Rule (on-device): 3 or more high-severity conflicts between the documents means walk away.',
    zh: '規則（裝置端）：文件之間有 3 項以上高風險矛盾，建議不要簽。',
  },
  sign_no_issue: {
    en: 'Rule (on-device): no high- or medium-severity finding and no money gap.',
    zh: '規則（裝置端）：沒有高／中風險項目，也沒有金額落差。',
  },
} as const;

const dot = { high: 'bg-[#BE123C]', medium: 'bg-[#B45309]', low: 'bg-[#5C626E]' } as const;

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** A2 timer row: ticks while running, freezes at the measured wall-clock time. */
function TimerRow(props: {
  icon: 'device' | 'cloud';
  label: string;
  ms: number | null;
  running: boolean;
  startedAt: number | null;
  source: string | null;
  waitingLabel: string;
}) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!props.running) return;
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, [props.running]);
  const value = props.ms !== null
    ? seconds(props.ms)
    : props.running && props.startedAt !== null ? seconds(Math.max(0, now - props.startedAt)) : '—';
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="inline-flex min-w-0 items-center gap-1.5 text-[12.5px] text-[#141518]">
        {(props.source ? props.source !== 'IN_CLOUD' : props.icon === 'device')
          ? <Cpu className="h-3.5 w-3.5 shrink-0 text-[#0F766E]" />
          : <Cloud className="h-3.5 w-3.5 shrink-0 text-[#1D4ED8]" />}
        <span className="truncate">{props.label}</span>
      </span>
      <span className="shrink-0 font-mono text-[12px] tabular-nums text-[#141518]">
        {value}
        <span className="ml-2 text-[10.5px] uppercase text-[#5C626E]">
          {props.ms !== null ? props.source ?? '' : props.running ? props.waitingLabel : ''}
        </span>
      </span>
    </div>
  );
}

/**
 * A1 · The pre-signature decision. First thing a user (and a judge) sees after the run:
 * verdict, exact money gap computed on-device, clauses to fix, the email, and a way to verify.
 */
export function DecisionCard(props: DecisionCardProps) {
  const t = translator(props.locale);
  const [copied, setCopied] = useState(false);
  const { card, deepAudit, parallelRun } = props;
  const running = props.triageRunning || props.deepRunning;

  if (!card && !running) {
    return (
      <section
        data-testid="decision-cta"
        className="flex flex-col gap-3 rounded-md border border-[#0F766E]/30 bg-[#FFFFFF] p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-[15px] font-semibold text-[#141518]">
            {t(UI.decision.ctaTitle)}
          </p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#5C626E]">
            {t(UI.decision.ctaBody)}
          </p>
        </div>
        <button
          type="button"
          data-testid="run-decision"
          disabled={props.isBusy}
          onClick={props.onRunDecision}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-md bg-[#0F766E] px-4 text-[13.5px] font-medium text-[#FFFFFF] active:translate-y-px disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {t(UI.decision.ctaButton)}
        </button>
      </section>
    );
  }

  const verdict = card ? VERDICT[card.verdict] : null;
  const email = deepAudit?.playbook.readyToSendEmailSanitized
    ? props.rehydrateLocal(deepAudit.playbook.readyToSendEmailSanitized)
    : '';
  const isCached = Boolean(deepAudit?.cachedParts?.length);
  const gap = card?.gap ?? null;

  const copyEmail = async () => {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      data-testid="decision-card"
      aria-live="polite"
      className="overflow-hidden rounded-md border border-[#E2E5EA] bg-[#FFFFFF]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E5EA] px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-[#5C626E]">
          {t(UI.decision.beforeYouSign)}
        </span>
        <span className="font-mono text-[10.5px] uppercase text-[#5C626E]">
          {card?.basis === 'deep_audit'
            ? t(UI.decision.basisFinal)
            : props.deepRunning
              ? t(UI.decision.basisDeepRunning)
              : t(UI.decision.firstVerdict)}
          {isCached && (
            <span className="ml-2 rounded-sm border border-[#B45309]/40 bg-[#FFFBEB] px-1.5 py-0.5 text-[#92400E]">
              {t(UI.decision.cachedDemo)}
            </span>
          )}
        </span>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          {verdict && card ? (
            <div>
              <p
                data-testid="decision-verdict"
                className={`inline-flex rounded-md border px-3 py-1.5 text-[19px] font-semibold leading-tight sm:text-[22px] ${verdict.tone}`}
              >
                {t(verdict)}
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-[#5C626E]">
                {t(RULE[card.rule])}
              </p>
            </div>
          ) : (
            <p className="text-[15px] text-[#5C626E]">
              {t(UI.decision.workingOnVerdict)}
            </p>
          )}

          {gap ? (
            <div data-testid="decision-gap" className="rounded-md border border-[#E2E5EA] bg-[#F8F9FA] px-3.5 py-3">
              <p className="text-[12px] text-[#5C626E]">
                {t(UI.decision.moneyDisagree)}
              </p>
              <p className="mt-0.5 font-mono text-[26px] font-semibold leading-tight tabular-nums text-[#141518]">
                {gap.amountText}
                <span className="ml-2 text-[15px] font-normal text-[#5C626E]">({gap.pct.toFixed(1)}%)</span>
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#5C626E]">
                {props.rehydrateLocal(gap.a)} vs {props.rehydrateLocal(gap.b)} ·{' '}
                {t(UI.decision.gapExplain(gap.a, gap.diff > 0 ? '>' : '<', gap.b, pctBucket(gap.pct)))}
              </p>
            </div>
          ) : props.deepRunning ? (
            <p className="text-[12.5px] text-[#5C626E]">
              {t(UI.decision.gapPending)}
            </p>
          ) : null}

          {card && card.clausesToFix.length > 0 && (
            <div>
              <p className="text-[12px] font-medium text-[#141518]">
                {card.basis === 'deep_audit'
                  ? t(UI.decision.clausesToFix(card.clausesToFix.length))
                  : t(UI.decision.risksFlagged(card.clausesToFix.length))}
              </p>
              <ul className="mt-1.5 space-y-1">
                {card.clausesToFix.slice(0, 4).map((c, i) => (
                  <li key={`${c.title}-${i}`} className="flex items-start gap-2 text-[13px] leading-snug text-[#141518]">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot[c.severity]}`} aria-hidden />
                    <span className="min-w-0 break-words">{props.rehydrateLocal(c.title)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          {parallelRun && (
            <div className="rounded-md border border-[#E2E5EA] px-3 py-1.5" data-testid="parallel-timers">
              <TimerRow
                icon="device"
                label={t(UI.decision.timerFirstVerdict)}
                ms={parallelRun.triageMs}
                running={props.triageRunning}
                startedAt={parallelRun.startedAt}
                source={parallelRun.triageSource}
                waitingLabel={t(UI.decision.timerRunning)}
              />
              <TimerRow
                icon="cloud"
                label={t(UI.decision.timerCloud)}
                ms={parallelRun.deepMs}
                running={props.deepRunning}
                startedAt={parallelRun.startedAt}
                source={parallelRun.deepSource}
                waitingLabel={t(UI.decision.timerRunning)}
              />
            </div>
          )}

          {email ? (
            <div className="rounded-md border border-[#E2E5EA]">
              <p className="border-b border-[#E2E5EA] px-3 py-1.5 text-[12px] font-medium text-[#141518]">
                {t(UI.decision.emailTitle)}
              </p>
              <p className="max-h-[132px] overflow-y-auto whitespace-pre-wrap px-3 py-2 text-[12.5px] leading-relaxed text-[#141518]">
                {email}
              </p>
              <div className="flex flex-wrap gap-2 border-t border-[#E2E5EA] px-3 py-2">
                <button
                  type="button"
                  onClick={() => void copyEmail()}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-[#E2E5EA] px-3 text-[12.5px] font-medium text-[#141518] sm:min-h-[32px]"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-[#0F766E]" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? t(UI.decision.copied) : t(UI.decision.copy)}
                </button>
                <a
                  href={`mailto:?subject=${encodeURIComponent('Contract review before signing')}&body=${encodeURIComponent(email)}`}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-[#E2E5EA] px-3 text-[12.5px] font-medium text-[#141518] sm:min-h-[32px]"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {t(UI.decision.openInMail)}
                </a>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            data-testid="decision-verify"
            onClick={props.onVerify}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md border border-[#0F766E]/40 bg-[#F0FDFA] px-3 text-[13px] font-medium text-[#0F766E] sm:min-h-[36px]"
          >
            <ShieldCheck className="h-4 w-4" />
            {t(UI.decision.verify)}
          </button>
        </div>
      </div>
    </section>
  );
}
