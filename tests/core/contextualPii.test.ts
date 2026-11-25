import { describe, expect, it } from 'vitest';
import {
  applyRedactionWithToggles, assertPayloadZeroLeak, rehydrateText, runLocalAirlock, scanContextualPii,
  scanDeterministicPii,
} from '../../src/core';
import { SAMPLE_PACKS } from '../../src/data/sampleDocuments';

const contractPack = SAMPLE_PACKS.find(p => p.id === 'sample_contract_bundle')!;

function runPack(docs: Array<{ id: string; rawText: string }>) {
  let vault;
  const results = [];
  for (const doc of docs) {
    const res = runLocalAirlock({ documentId: doc.id, rawText: doc.rawText, existingVault: vault });
    vault = res.vault;
    results.push(res);
  }
  return { results, vault: vault! };
}

describe('contextual party / person / organization shield (no Gemini Nano)', () => {
  it('assigns defined-term party roles and labeled person names', () => {
    const text = 'between Northstar Ventures LLC ("Client"), represented by Marcus Vance (m@x.test), '
      + 'and Elena Rostova ("Contractor", SSN 987-65-4321).';
    expect(scanContextualPii(text)).toEqual([
      { role: 'PARTY_CLIENT', value: 'Northstar Ventures LLC' },
      { role: 'PARTY_CONTRACTOR', value: 'Elena Rostova' },
      { role: 'PERSON_NAME', value: 'Marcus Vance' },
    ]);
  });

  it('catches patients, physicians, account owners and suffixed organizations', () => {
    const text = 'Patient: David K. Lin | Ordering Physician: Dr. Priya Nair\n'
      + 'Account Owner: Hannah Park (x)\nCLOUDGRID ANALYTICS INC. — ENTERPRISE RENEWAL';
    const values = scanContextualPii(text).map(c => [c.role, c.value]);
    expect(values).toEqual(expect.arrayContaining([
      ['PERSON_NAME', 'David K. Lin'], ['PERSON_NAME', 'Priya Nair'], ['PERSON_NAME', 'Hannah Park'],
      ['ORGANIZATION', 'CLOUDGRID ANALYTICS INC.'],
    ]));
  });

  it('ignores ordinary contract prose and existing aliases', () => {
    const text = 'Contractor agrees to deliver. Client agrees to pay Contractor a total fee. '
      + 'represented by [PERSON_NAME_1] and Contractor: [PARTY_CONTRACTOR_1].';
    expect(scanContextualPii(text)).toEqual([]);
  });

  it('removes every party name from the cross-doc sample pack, including all-caps headers', () => {
    const { results, vault } = runPack(contractPack.documents);
    const payload = results.map(r => r.sanitizedText).join('\n');
    for (const name of ['Marcus Vance', 'Elena Rostova', 'Northstar Ventures LLC']) {
      expect(payload.toLowerCase()).not.toContain(name.toLowerCase());
    }
    expect(results[0].sanitizedText).toContain('[PARTY_CLIENT_1] ("Client")');
    expect(results[0].sanitizedText).toContain('[PARTY_CONTRACTOR_1] ("Contractor"');
    // Same people keep the same tokens across both documents.
    expect(results[1].sanitizedText).toContain('Contractor: [PARTY_CONTRACTOR_1]');
    expect(results[1].sanitizedText.startsWith('[PARTY_CLIENT_1] — STATEMENT OF WORK QUOTE')).toBe(true);
    expect(assertPayloadZeroLeak(payload, vault)).toMatchObject({ passed: true, leaks: [] });
  });

  it('keeps list numbering intact after a trailing currency code', () => {
    const quote = contractPack.documents[1].rawText;
    const money = scanDeterministicPii(quote).filter(c => c.role === 'MONEY_AMOUNT').map(c => c.value);
    expect(money).toEqual(['$42,000', '$1,500']);
    const { results } = runPack([contractPack.documents[1]]);
    expect(results[0].sanitizedText).toMatch(/\[MONEY_AMOUNT_1\] USD\n2\. Payment Schedule/);
  });

  it('round-trips the sample pack through toggles and rehydration', () => {
    const { results, vault } = runPack(contractPack.documents);
    const doc = contractPack.documents[0];
    expect(applyRedactionWithToggles(doc.rawText, results[0].entities)).toBe(results[0].sanitizedText);
    expect(rehydrateText(results[0].sanitizedText, vault)).toBe(doc.rawText);
  });
});

describe('every sample pack is zero-leak without Gemini Nano', () => {
  const leaks: Record<string, string[]> = {
    sample_contract_bundle: ['Marcus Vance', 'Elena Rostova', 'Northstar Ventures LLC', '021000021',
      'November 18, 2026', 'Q-2026-881', '987-65-4321', 'US89-4829-1104-8821', '$48,000', '$42,000'],
    sample_medical_lab: ['David K. Lin', 'Priya Nair', '742 Market St', 'MRN-884920', '1988-07-14',
      '2026-11-20', '+1-415-555-0148'],
    sample_saas_invoice: ['Hannah Park', 'CloudGrid Analytics Inc.', 'hannah.park@meridian-ops.example', 'AIza'],
  };
  it.each(SAMPLE_PACKS.map(p => [p.id, p] as const))('%s', (id, pack) => {
    const { results, vault } = runPack(pack.documents);
    const payload = results.map(r => r.sanitizedText).join('\n');
    for (const value of leaks[id]) expect(payload.toLowerCase()).not.toContain(value.toLowerCase());
    expect(assertPayloadZeroLeak(payload, vault)).toMatchObject({ passed: true, leaks: [] });
  });

  // Reverse proof: "0 LEAKS" is only meaningful if every raw value re-injected into the payload is caught.
  it.each(SAMPLE_PACKS.map(p => [p.id, p] as const))('%s: every vault original re-injected is BLOCKED', (_id, pack) => {
    const { results, vault } = runPack(pack.documents);
    const payload = results.map(r => r.sanitizedText).join('\n');
    for (const entry of Object.values(vault.byOriginal)) {
      const result = assertPayloadZeroLeak(`${payload}\nNote: ${entry.originalValue}`, vault);
      expect(result.passed, `${entry.role} ${entry.originalValue}`).toBe(false);
    }
  });
});

describe('Layer 3 name and identifier blocking', () => {
  it('blocks a context-anchored name Nano never reported, unless the user un-redacted it', () => {
    const { vault } = runLocalAirlock({ documentId: 'd', rawText: 'represented by Marcus Vance' });
    expect(assertPayloadZeroLeak('Invoice prepared for Jane Doe.', vault)).toMatchObject({ passed: false });
    const leaked = assertPayloadZeroLeak('represented by Marcus Vance', vault, new Set(['[PERSON_NAME_1]']));
    expect(leaked.passed).toBe(true);
  });

  it.each(['MRN-884920', 'A123456789'])('hard-blocks %s with an empty vault', value => {
    const { vault } = runLocalAirlock({ documentId: 'd', rawText: '' });
    const result = assertPayloadZeroLeak(`id ${value}`, vault);
    expect(result.passed).toBe(false);
    expect(result.leaks).toContainEqual(expect.objectContaining({ matchedSnippet: value }));
  });
});
