import { describe, expect, it } from 'vitest';
import {
  assertPayloadZeroLeak, buildRelationalHints, formatRelationalHints, parseCalendarDate, parseMoneyAmount,
  rehydrateWithLocalMath, runLocalAirlock,
} from '../../src/core';
import { SAMPLE_PACKS } from '../../src/data/sampleDocuments';

function contractVault() {
  let vault;
  const texts: string[] = [];
  for (const doc of SAMPLE_PACKS[0].documents) {
    const r = runLocalAirlock({ documentId: doc.id, rawText: doc.rawText, existingVault: vault });
    vault = r.vault;
    texts.push(r.sanitizedText);
  }
  return { vault: vault!, payload: texts.join('\n') };
}

describe('split-knowledge reasoning', () => {
  it('parses amounts and dates locally', () => {
    expect(parseMoneyAmount('$48,000')).toBe(48000);
    expect(parseMoneyAmount('USD 12,000.50')).toBe(12000.5);
    expect(parseMoneyAmount('NT$331,000')).toBe(331000);
    expect(parseMoneyAmount('call me')).toBeNull();
    expect(parseCalendarDate('2026-11-18')).toBe(Date.UTC(2026, 10, 18));
    expect(parseCalendarDate('November 18, 2026')).toBe(Date.UTC(2026, 10, 18));
  });

  it('describes the MSA vs Schedule B fee conflict without any raw amount', () => {
    const { vault, payload } = contractVault();
    const hints = buildRelationalHints(vault);
    const fee = vault.byOriginal['$48,000'].token;
    const quote = vault.byOriginal['$42,000'].token;
    expect(hints).toContainEqual({ kind: 'money_compare', a: fee, b: quote, relation: 'gt', pctDiffBucket: '5-15%' });
    const text = formatRelationalHints(hints);
    expect(text).not.toMatch(/\d{2},\d{3}|\$\d/);
    // The hint block itself must pass the Layer 3 breaker alongside the sanitized payload.
    expect(assertPayloadZeroLeak(`${payload}\n${text}`, vault).passed).toBe(true);
  });

  it('computes the exact difference on-device during re-hydration', () => {
    const { vault } = contractVault();
    const fee = vault.byOriginal['$48,000'].token;
    const quote = vault.byOriginal['$42,000'].token;
    const out = rehydrateWithLocalMath(`Schedule B undercuts the MSA by {{DIFF:${fee}-${quote}}}.`, vault);
    expect(out).toBe('Schedule B undercuts the MSA by $6,000 (12.5%).');
    expect(rehydrateWithLocalMath('{{DIFF:[MONEY_AMOUNT_99]-[MONEY_AMOUNT_1]}}', vault))
      .toBe('{{DIFF:[MONEY_AMOUNT_99]-$48,000}}');
  });

  it('orders dates without revealing them', () => {
    const { vault } = runLocalAirlock({ documentId: 'd', rawText: 'Signed November 18, 2026; due 2026-12-30.' });
    expect(buildRelationalHints(vault)).toEqual([
      { kind: 'date_order', a: '[SENSITIVE_DATE_1]', b: '[SENSITIVE_DATE_2]', relation: 'before', gapBucket: '>30d' },
    ]);
  });
});
