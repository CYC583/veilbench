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

describe('extension one-time receipt', () => {
  const g = globalThis as { chrome?: unknown };
  it('rejects intake when no extension can confirm it', async () => {
    delete g.chrome;
    const { verifyExtensionDelivery } = await import('../../src/integrations/agentSurface');
    expect(await verifyExtensionDelivery({ type: 'veilbench.intake.v1', title: 'a', text: 'b' })).toBe(false);
  });
  it('accepts only an exact true from the fixed extension ID', async () => {
    const { verifyExtensionDelivery, EXTENSION_ID } = await import('../../src/integrations/agentSurface');
    const seen: unknown[] = [];
    g.chrome = { runtime: { sendMessage: (id: string, msg: unknown, cb: (r: unknown) => void) => {
      seen.push([id, msg]);
      cb(id === EXTENSION_ID ? true : 'yes');
    } } };
    expect(await verifyExtensionDelivery({ title: 'Quote', text: 'Fee $42,000' })).toBe(true);
    expect(seen).toEqual([[EXTENSION_ID, { type: 'veilbench.verify.v1', title: 'Quote', text: 'Fee $42,000' }]]);
    g.chrome = { runtime: { sendMessage: (_: string, __: unknown, cb: (r: unknown) => void) => cb('true') } };
    expect(await verifyExtensionDelivery({ title: 'Quote', text: 'x' })).toBe(false);
    delete g.chrome;
  });
});
