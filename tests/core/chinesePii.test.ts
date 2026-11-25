import { describe, expect, it } from 'vitest';
import {
  assertPayloadZeroLeak, buildRelationalHints, rehydrateText, rehydrateWithLocalMath, runLocalAirlock,
} from '../../src/core';

const contract = [
  '服務合約書',
  '甲方：北辰創投股份有限公司（以下簡稱甲方）',
  '乙方：林小雨（以下簡稱乙方）',
  '聯絡人：陳大文　電話：0912-345-678',
  '地址：臺北市信義區松仁路100號12樓',
  '統一編號：12345678',
  '總報酬為新臺幣480,000元，簽約日 2026年3月1日，交付日 民國115年4月15日。',
  '報價單金額：新臺幣420,000元。',
].join('\n');

describe('Chinese contracts without Gemini Nano', () => {
  const result = runLocalAirlock({ documentId: 'zh', rawText: contract });

  it('masks parties, people, organization, address, phone, tax ID, money and dates', () => {
    for (const raw of ['北辰創投股份有限公司', '林小雨', '陳大文', '0912-345-678', '臺北市信義區松仁路100號12樓',
      '12345678', '新臺幣480,000元', '新臺幣420,000元', '2026年3月1日', '民國115年4月15日']) {
      expect(result.sanitizedText, raw).not.toContain(raw);
    }
    expect(result.sanitizedText).toContain('[PARTY_CLIENT_1]');
    expect(result.sanitizedText).toContain('[PARTY_CONTRACTOR_1]');
    expect(rehydrateText(result.sanitizedText, result.vault)).toBe(contract);
    expect(assertPayloadZeroLeak(result.sanitizedText, result.vault).passed).toBe(true);
  });

  it('keeps Split-Knowledge math working for 新臺幣 amounts and ROC dates', () => {
    const hints = buildRelationalHints(result.vault);
    expect(hints.some(h => h.kind === 'money_compare' && h.pctDiffBucket === '5-15%')).toBe(true);
    expect(hints.some(h => h.kind === 'date_order')).toBe(true);
    const money = Object.values(result.vault.byToken).filter(e => e.role === 'MONEY_AMOUNT').map(e => e.token);
    expect(rehydrateWithLocalMath(`{{DIFF:${money[0]}-${money[1]}}}`, result.vault)).toBe('新臺幣60,000元 (12.5%)');
  });

  it('masks a user-added term everywhere, in any casing', () => {
    const r = runLocalAirlock({ documentId: 'm', rawText: 'Project Bluebird and project bluebird',
      manualCandidates: [{ value: 'Project Bluebird', role: 'OTHER_PII' }] });
    expect(r.sanitizedText.toLowerCase()).not.toContain('bluebird');
    expect(r.entities.every(e => e.layer === 'user_manual')).toBe(true);
  });
});
