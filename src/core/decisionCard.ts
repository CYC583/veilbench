/**
 * A1 · Sign-or-fix decision card. Turns the audit into one pre-signature decision.
 *
 * Everything here runs on-device and is deterministic: the cloud only ever returned tokens and
 * {{DIFF:[A]-[B]}} placeholders; the verdict rule and the exact money gap are computed locally from the
 * vault. The rule is shown on the card so the user can see why it said what it said.
 */
import type { DeepAuditResult, RiskSeverity, TriageResult } from '../types/audit';
import type { VaultMap } from '../types/privacy';
import { computeLocalDiff, findDiffPlaceholders, type LocalDiff } from './relationalHints';

export type DecisionVerdict = 'sign' | 'fix_first' | 'walk_away';

export interface DecisionCard {
  verdict: DecisionVerdict;
  /** 'deep_audit' = full cross-document audit; 'triage' = preliminary first verdict. */
  basis: 'deep_audit' | 'triage';
  /** The largest exact money gap the audit points at, computed on-device. */
  gap: LocalDiff | null;
  /** Redlined clauses (or triage flags), most severe first. Tokenized; re-hydrate for display. */
  clausesToFix: Array<{ title: string; severity: RiskSeverity }>;
  counts: { high: number; medium: number; low: number };
  /** Which rule produced the verdict (stable id for i18n). */
  rule: 'walk_away_many_high' | 'walk_away_large_gap' | 'fix_any_issue' | 'sign_no_issue';
}

/**
 * Gaps of 30% or more of the larger amount, or 3+ high-severity cross-document contradictions, mean
 * "walk away". Redlines are not counted here: they usually restate the same conflict as a clause fix.
 */
export const WALK_AWAY_GAP_PCT = 30;
export const WALK_AWAY_HIGH_COUNT = 3;

/** Models often prefix clause titles with their own numbering ("3. LIABILITY"); drop it after sorting. */
function stripNumbering(title: string): string {
  return title.replace(/^\s*(?:\d+|[A-Z])[.)]\s+/, '').trim() || title;
}

const severityRank: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };

function largestGap(texts: string[], vault: VaultMap): LocalDiff | null {
  let best: LocalDiff | null = null;
  const seen = new Set<string>();
  for (const text of texts) {
    for (const [a, b] of findDiffPlaceholders(text)) {
      const key = `${a}|${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const d = computeLocalDiff(a, b, vault);
      if (d && (!best || Math.abs(d.diff) > Math.abs(best.diff))) best = d;
    }
  }
  return best;
}

function decide(
  counts: DecisionCard['counts'],
  highContradictions: number,
  gap: LocalDiff | null
): Pick<DecisionCard, 'verdict' | 'rule'> {
  if (highContradictions >= WALK_AWAY_HIGH_COUNT) return { verdict: 'walk_away', rule: 'walk_away_many_high' };
  if (gap && gap.pct >= WALK_AWAY_GAP_PCT) return { verdict: 'walk_away', rule: 'walk_away_large_gap' };
  if (counts.high + counts.medium > 0 || gap) return { verdict: 'fix_first', rule: 'fix_any_issue' };
  return { verdict: 'sign', rule: 'sign_no_issue' };
}

export function buildDecisionCard(params: {
  triage: TriageResult | null;
  deepAudit: DeepAuditResult | null;
  vault: VaultMap;
}): DecisionCard | null {
  const { triage, deepAudit, vault } = params;

  if (deepAudit && (deepAudit.contradictions.length || deepAudit.redlines.length
    || deepAudit.playbook.executiveSummary)) {
    const counts = { high: 0, medium: 0, low: 0 };
    for (const f of [...deepAudit.contradictions, ...deepAudit.redlines]) counts[f.severity] += 1;
    const gap = largestGap([
      ...deepAudit.contradictions.flatMap(c => [c.description, c.recommendation]),
      deepAudit.playbook.executiveSummary,
      ...deepAudit.playbook.counterpartyPushback.map(p => p.recommendedResponse),
      deepAudit.playbook.readyToSendEmailSanitized,
    ], vault);
    const clausesToFix = [...deepAudit.redlines]
      .sort((x, y) => severityRank[x.severity] - severityRank[y.severity])
      .map(r => ({ title: stripNumbering(r.clauseTitle), severity: r.severity }));
    const highContradictions = deepAudit.contradictions.filter(c => c.severity === 'high').length;
    return { ...decide(counts, highContradictions, gap), basis: 'deep_audit', gap, clausesToFix, counts };
  }

  if (triage) {
    const counts = { high: 0, medium: 0, low: 0 };
    for (const f of triage.flags) counts[f.severity] += 1;
    if (triage.overallRisk !== 'low' && counts.high + counts.medium === 0) counts[triage.overallRisk] += 1;
    // A first verdict never says "walk away": that needs the full cross-document audit.
    const verdict: DecisionVerdict = counts.high + counts.medium > 0 ? 'fix_first' : 'sign';
    return {
      verdict, rule: verdict === 'sign' ? 'sign_no_issue' : 'fix_any_issue', basis: 'triage', gap: null,
      clausesToFix: [...triage.flags]
        .sort((x, y) => severityRank[x.severity] - severityRank[y.severity])
        .map(f => ({ title: stripNumbering(f.title), severity: f.severity })),
      counts,
    };
  }
  return null;
}
