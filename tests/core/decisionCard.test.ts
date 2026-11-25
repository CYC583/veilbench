import { describe, expect, it } from 'vitest';
import { buildDecisionCard, runLocalAirlock } from '../../src/core';
import { SAMPLE_PACKS } from '../../src/data/sampleDocuments';
import { SAMPLE_GOLDEN_AUDITS } from '../../src/data/sampleGoldenAudits';
import type { DeepAuditResult, TriageResult } from '../../src/types/audit';

const pack = SAMPLE_PACKS.find(p => p.id === 'sample_contract_bundle')!;
let vault = runLocalAirlock({ documentId: pack.documents[0].id, rawText: pack.documents[0].rawText }).vault;
for (const d of pack.documents.slice(1)) {
  vault = runLocalAirlock({ documentId: d.id, rawText: d.rawText, existingVault: vault }).vault;
}
const golden = SAMPLE_GOLDEN_AUDITS.sample_contract_bundle;
const audit: DeepAuditResult = { ...golden.analysis, playbook: golden.playbook, inferenceSource: 'IN_CLOUD',
  generatedAt: '2026-11-26T00:00:00Z' };

describe('A1 decision card (computed on-device)', () => {
  it('turns the contract + quote audit into "fix first" with the exact $6,000 gap', () => {
    const card = buildDecisionCard({ triage: null, deepAudit: audit, vault })!;
    expect(card.basis).toBe('deep_audit');
    expect(card.verdict).toBe('fix_first');
    expect(card.gap?.amountText).toBe('$6,000');
    expect(card.gap?.pct).toBeCloseTo(12.5, 5);
    expect(card.clausesToFix[0].severity).toBe('high');
  });

  it('says walk away for a gap of 30% or more', () => {
    const big = structuredClone(vault);
    big.byToken['[MONEY_AMOUNT_3]'] = { ...big.byToken['[MONEY_AMOUNT_3]'], originalValue: '$20,000' };
    expect(buildDecisionCard({ triage: null, deepAudit: audit, vault: big })!.rule).toBe('walk_away_large_gap');
  });

  it('does not double-count a conflict that is also a redline, and strips model numbering', () => {
    const noisy: DeepAuditResult = { ...audit, redlines: [1, 2, 3].map(n => ({ id: `r${n}`, clauseTitle: `${n}. CLAUSE ${n}`,
      severity: 'high' as const, originalExcerpt: '', proposedRevision: '', rationale: '' })) };
    const card = buildDecisionCard({ triage: null, deepAudit: noisy, vault })!;
    expect(card.verdict).toBe('fix_first');
    expect(card.clausesToFix.map(c => c.title)).toEqual(['CLAUSE 1', 'CLAUSE 2', 'CLAUSE 3']);
  });

  it('says walk away for 3+ high-severity cross-document conflicts', () => {
    const many: DeepAuditResult = { ...audit, contradictions: [1, 2, 3].map(n => ({ ...audit.contradictions[0], id: `c${n}` })) };
    expect(buildDecisionCard({ triage: null, deepAudit: many, vault })!.rule).toBe('walk_away_many_high');
  });

  it('says sign when the audit found nothing', () => {
    const clean: DeepAuditResult = { ...audit, contradictions: [], redlines: [],
      playbook: { executiveSummary: 'No issues found.', counterpartyPushback: [], readyToSendEmailSanitized: '' } };
    expect(buildDecisionCard({ triage: null, deepAudit: clean, vault })!.verdict).toBe('sign');
  });

  it('gives a preliminary first verdict from on-device triage, never "walk away"', () => {
    const triage: TriageResult = { overallRisk: 'high', headline: 'h', inferenceSource: 'ON_DEVICE',
      generatedAt: 'now', flags: Array.from({ length: 6 }, (_, i) =>
        ({ id: `f${i}`, title: `t${i}`, severity: 'high' as const, plainSummary: '', excerpt: '' })) };
    const card = buildDecisionCard({ triage, deepAudit: null, vault })!;
    expect(card.basis).toBe('triage');
    expect(card.verdict).toBe('fix_first');
    expect(card.gap).toBeNull();
  });

  it('returns null before any analysis ran', () => {
    expect(buildDecisionCard({ triage: null, deepAudit: null, vault })).toBeNull();
  });
});
