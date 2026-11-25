import { describe, expect, it } from 'vitest';
import { describeDecisionForAgent, parseIntakeMessage } from '../../src/integrations/agentSurface';

describe('A10/A11 agent surface', () => {
  it('accepts only well-formed intake messages', () => {
    expect(parseIntakeMessage({ type: 'veilbench.intake.v1', title: 'Quote', text: ' Fee $42,000 ' }))
      .toEqual({ title: 'Quote.txt', text: 'Fee $42,000' });
    expect(parseIntakeMessage({ type: 'other', text: 'x' })).toBeNull();
    expect(parseIntakeMessage({ type: 'veilbench.intake.v1', text: '   ' })).toBeNull();
    expect(parseIntakeMessage({ type: 'veilbench.intake.v1', text: 'x'.repeat(200_001) })).toBeNull();
    expect(parseIntakeMessage('veilbench.intake.v1')).toBeNull();
  });

  it('never gives agents the exact amounts', () => {
    const out = describeDecisionForAgent({ verdict: 'fix_first', basis: 'deep_audit', rule: 'fix_any_issue',
      counts: { high: 1, medium: 0, low: 0 }, clausesToFix: [],
      gap: { a: '[MONEY_AMOUNT_1]', b: '[MONEY_AMOUNT_3]', diff: 6000, pct: 12.5, amountText: '$6,000' } });
    expect(JSON.stringify(out)).not.toMatch(/6,?000|12\.5/);
    expect(describeDecisionForAgent(null).status).toBe('no_decision_yet');
  });
});
