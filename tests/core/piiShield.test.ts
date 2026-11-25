import { describe, expect, it } from 'vitest';
import {
  applyRedactionWithToggles, createEmptyVault, parseNanoEntitiesDefensive, rehydrateText,
  runLocalAirlock, scanDeterministicPii,
} from '../../src/core';
import type { RawNanoEntityCandidate, SemanticRole } from '../../src/types/privacy';

describe('defensive Nano output parser', () => {
  it('extracts fenced, prose-wrapped JSON and repairs only structural trailing commas', () => {
    const raw = '[Nano result] Result:\n```json\n{"entities":[{"value":" Acme,} [HQ] ","role":"party-client",}, null,'
      + '{"value":"x"},{"value":"  "},{"value":32},{"value":"ユキ","role":"NEW_ROLE"},],}\n```\n[done]';
    expect(parseNanoEntitiesDefensive(raw)).toEqual([
      { value: 'Acme,} [HQ]', role: 'PARTY_CLIENT' }, { value: 'ユキ', role: 'OTHER_PII' },
    ]);
  });
  it('reads arrays and individual objects, preserving escaped quotes and valid boxes', () => {
    const bbox = { x: 0.1, y: 0, width: 0.5, height: 0.2 };
    const candidate = { value: 'Dr. "[A]" \\ Lin', role: 'PERSON_NAME', bbox };
    for (const shape of [candidate, [candidate], { entities: [candidate] }]) {
      expect(parseNanoEntitiesDefensive(JSON.stringify(shape))).toEqual([candidate]);
    }
    expect(parseNanoEntitiesDefensive('{"value":"Ada","bbox":{"x":"bad"}}')).toEqual([{ value: 'Ada', role: 'OTHER_PII' }]);
  });
  it.each(['', 'no JSON', '{broken}', '[{"value":"leaked"}', '{"entities":{}}', '[null, 2, {}]', '{}'])(
    'returns no candidates for %j', input => expect(parseNanoEntitiesDefensive(input)).toEqual([]));
});

const fixtures: Array<[SemanticRole, string, string?]> = [
  ['EMAIL', 'elena+team@example.co.uk'], ['PHONE', '+1-415-555-0199'], ['PHONE', '(415) 555-0199'],
  ['PHONE', '0912-345-678'], ['PHONE', '+44 20 7946 0958'], ['PHONE', '+886-912-345-678'],
  ['PHONE', '(02) 2345-6789'], ['OTHER_PII', '192.0.2.42'],
  ['ID_NUMBER', '123-45-6789'], ['ID_NUMBER', 'A123456789'], ['ID_NUMBER', 'AB1234567'], ['ID_NUMBER', 'INV-2026-9918'],
  ['MEDICAL_ID', 'MRN-884920'], ['BANK_ACCOUNT', '4829-1104-8821', 'Acct #'], ['BANK_ACCOUNT', '021000021', 'Routing '],
  ['BANK_ACCOUNT', 'GB82 WEST 1234 5698 7654 32'], ['BANK_ACCOUNT', 'DE89370400440532013000'],
  ['BANK_ACCOUNT', 'US89-4829-1104-8821', 'IBAN '], ['BANK_ACCOUNT', '4111 1111 1111 1111'],
  ['BANK_ACCOUNT', '4111111111111111'], ['MONEY_AMOUNT', '$48,500'], ['MONEY_AMOUNT', 'USD 12,000.00'],
  ['MONEY_AMOUNT', 'NT$331,000'], ['MONEY_AMOUNT', '€2,400'], ['SECRET_KEY', 'sk-example_only_12345'],
  ['SECRET_KEY', 'AIza' + 'DEMO'.repeat(8)], ['SECRET_KEY', 'ghp_' + 'demo'.repeat(9)],
  ['SENSITIVE_DATE', '1991-04-18', 'DOB: '], ['SENSITIVE_DATE', '04/18/1991', 'Date of Birth: '],
];
describe('deterministic formats', () => {
  it.each(fixtures)('detects %s %s and replaces its complete literal value', (role, value, prefix = '') => {
    const rawText = prefix + value + '.';
    expect(scanDeterministicPii(rawText)).toContainEqual({ role, value });
    const { sanitizedText, vault } = runLocalAirlock({ documentId: 'doc', rawText });
    expect(sanitizedText).toBe(prefix + '[' + role + '_1].');
    expect(rehydrateText(sanitizedText, vault)).toBe(rawText);
  });
  it('leaves ordinary prose, unrelated dates, reference numbers and aliases alone', () => {
    const text = 'Review invoice by 04/18/1991. Net-90. Risk-adjusted at 22%. Account Owner [ID_NUMBER_1].';
    expect(scanDeterministicPii(text)).toEqual([]);
  });
});

const name = (value: string): RawNanoEntityCandidate => ({ value, role: 'PERSON_NAME' });
describe('local vault and selective redaction', () => {
  it('reuses stable tokens across documents, counts literal occurrences, and isolates the input vault', () => {
    const first = runLocalAirlock({ documentId: 'A', rawText: 'Elena Rostova / Elena Rostova',
      nanoCandidates: [{ value: ' Elena Rostova ', role: 'PARTY_CONTRACTOR' }] });
    const snapshot = structuredClone(first.vault);
    const second = runLocalAirlock({ documentId: 'B', rawText: 'Elena Rostova & Jo Lee',
      existingVault: first.vault, nanoCandidates: [{ value: 'Jo Lee', role: 'PARTY_CONTRACTOR' }] });
    expect(first.sanitizedText).toBe('[PARTY_CONTRACTOR_1] / [PARTY_CONTRACTOR_1]');
    expect(second.sanitizedText).toBe('[PARTY_CONTRACTOR_1] & [PARTY_CONTRACTOR_2]');
    expect(second.vault.byOriginal['Elena Rostova']).toEqual({ token: '[PARTY_CONTRACTOR_1]',
      originalValue: 'Elena Rostova', role: 'PARTY_CONTRACTOR', firstSeenDocumentId: 'A', occurrences: 3 });
    expect(second.vault.byToken['[PARTY_CONTRACTOR_1]']).toEqual(second.vault.byOriginal['Elena Rostova']);
    expect(first.vault).toEqual(snapshot);
  });
  it('resolves longest spans globally and still redacts standalone shorter matches', () => {
    const rawText = 'Alice Chen, Alice / XAlice Chen / Chen';
    const result = runLocalAirlock({ documentId: 'A', rawText,
      nanoCandidates: ['Chen', 'Alice', 'XAlice', 'Alice Chen', 'Alice Chen', 'missing'].map(name) });
    expect(result.sanitizedText).toBe('[PERSON_NAME_1], [PERSON_NAME_2] / X[PERSON_NAME_1] / [PERSON_NAME_3]');
    expect(result.entities.map(e => e.originalValue)).toEqual(['Alice Chen', 'Alice', 'Chen']);
    expect(result.stats).toEqual({ totalDetected: 3, byNano: 3, byRegex: 0, rawChars: rawText.length,
      sanitizedChars: result.sanitizedText.length });
    expect(applyRedactionWithToggles(rawText, result.entities)).toBe(result.sanitizedText);
    expect(rehydrateText(result.sanitizedText, result.vault)).toBe(rawText);
  });
  it('gives specific formats priority, retains image coordinates, and deduplicates identical layers', () => {
    const bbox = { x: 0, y: 0, width: 0.5, height: 0.5 };
    const { entities, stats } = runLocalAirlock({ documentId: 'A', rawText: 'a@example.test and 123-45-6789',
      nanoCandidates: [{ value: 'a@example.test', role: 'OTHER_PII', bbox },
        { value: '123-45-6789', role: 'MEDICAL_ID' }, { value: 'image only', role: 'ADDRESS', bbox }] });
    expect(entities).toHaveLength(3);
    expect(entities[0]).toMatchObject({ role: 'EMAIL', layer: 'deterministic_regex', bbox, enabled: true });
    expect(entities[1]).toMatchObject({ role: 'MEDICAL_ID', layer: 'gemini_nano' });
    expect(entities[2]).toMatchObject({ originalValue: 'image only', bbox });
    expect(stats).toMatchObject({ byNano: 2, byRegex: 1 });
  });
  it('treats punctuation, replacement strings, prototype keys and unknown brackets literally', () => {
    const values = ['constructor', '__proto__', 'A.(B)+$&', 'PERSON_NAME'];
    const rawText = values.join(' • ') + ' [unchanged]';
    const result = runLocalAirlock({ rawText, documentId: 'A', nanoCandidates: values.map(name) });
    const toggled = result.entities.map(e => ({ ...e, enabled: e.originalValue !== '__proto__' }));
    expect(applyRedactionWithToggles(rawText, toggled)).toBe('[PERSON_NAME_1] • __proto__ • [PERSON_NAME_3] • [PERSON_NAME_4] [unchanged]');
    expect(rehydrateText(result.sanitizedText, result.vault)).toBe(rawText);
    expect(rehydrateText('[[PERSON_NAME_1]] [UNKNOWN_2]', result.vault)).toBe('[constructor] [UNKNOWN_2]');
  });
  it('reserves aliases already present literally in source text', () => {
    const rawText = '[PERSON_NAME_1] and Jane';
    const result = runLocalAirlock({ rawText, documentId: 'A', nanoCandidates: [name('Jane')] });
    expect(result.sanitizedText).toBe('[PERSON_NAME_1] and [PERSON_NAME_2]');
    expect(rehydrateText(result.sanitizedText, result.vault)).toBe(rawText);
  });
  it('vaults a short Nano value even when the model changed its casing', () => {
    const rawText = 'Paid to Ada by wire.';
    const result = runLocalAirlock({ rawText, documentId: 'A', nanoCandidates: [name('ada')] });
    expect(result.sanitizedText).toBe('Paid to [PERSON_NAME_1] by wire.');
    expect(rehydrateText(result.sanitizedText, result.vault)).toBe(rawText);
  });
  it('returns independent empty vaults and zero counts for empty input', () => {
    const a = createEmptyVault();
    a.roleCounters.EMAIL = 5;
    expect(createEmptyVault().roleCounters).toEqual({});
    expect(runLocalAirlock({ documentId: 'empty', rawText: '' })).toEqual({ documentId: 'empty',
      sanitizedText: '', entities: [], vault: createEmptyVault(),
      stats: { totalDetected: 0, byNano: 0, byRegex: 0, rawChars: 0, sanitizedChars: 0 } });
  });
});
