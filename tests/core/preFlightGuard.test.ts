import { describe, expect, it } from 'vitest';
import { assertPayloadZeroLeak, createEmptyVault, runLocalAirlock } from '../../src/core';
import type { SemanticRole } from '../../src/types/privacy';

describe('pre-flight privacy assertion', () => {
  it('accepts the sanitized payload even when a name occurs inside a valid alias', () => {
    const { vault, sanitizedText } = runLocalAirlock({ documentId: 'd', rawText: 'Email to abc@example.test',
      nanoCandidates: [{ value: 'Email', role: 'PERSON_NAME' }] });
    const result = assertPayloadZeroLeak(sanitizedText, vault);
    expect(result).toEqual({ passed: true, leaks: [], inspectedChars: sanitizedText.length,
      checkedAt: new Date(result.checkedAt).toISOString() });
    expect(assertPayloadZeroLeak(sanitizedText + ' Email', vault).passed).toBe(false);
  });
  it.each([
    ['PARTY_CLIENT', 'Alice Chen', 'ALICE CHEN', false], ['EMAIL', 'alice@example.test', 'ALICE@EXAMPLE.TEST', false],
    ['PERSON_NAME', 'Li', 'LI', true], ['PERSON_NAME', 'Li', 'Li', false],
    ['ADDRESS', 'Maple St', 'MAPLE ST', true], ['OTHER_PII', 'A.*B', 'AxB', true], ['OTHER_PII', 'A.*B', 'A.*B', false],
  ] as Array<[SemanticRole, string, string, boolean]>)('applies literal matching rules for %s %j in %j', (role, value, text, passed) => {
    const { vault } = runLocalAirlock({ documentId: 'd', rawText: value, nanoCandidates: [{ value, role }] });
    const result = assertPayloadZeroLeak(text, vault);
    expect(result.passed).toBe(passed);
    if (!passed) expect(result.leaks).toContainEqual(expect.objectContaining({ source: 'vault_original_leak', matchedSnippet: text }));
  });
  it.each(['unlisted@example.test', 'sk-testOnly_secretFixture', '123-45-6789', '4111-1111-1111-1111',
    'DE89370400440532013000', 'AIza' + 'example'.repeat(5), 'ghp_' + 'example'.repeat(6)])(
    'catches a high-confidence format with an empty vault: %s', value => {
      const result = assertPayloadZeroLeak(JSON.stringify({ message: value }), createEmptyVault());
      expect(result.passed).toBe(false);
      expect(result.leaks).toContainEqual(expect.objectContaining({ source: 'regex_pattern_leak', matchedSnippet: value }));
    });
  it('honors disabled aliases individually while keeping independent format checks active', () => {
    const { vault } = runLocalAirlock({ documentId: 'd', rawText: 'Ada Cheng, May Lin, a@example.test',
      nanoCandidates: [{ value: 'Ada Cheng', role: 'PERSON_NAME' }, { value: 'May Lin', role: 'PERSON_NAME' }] });
    const disabled = new Set(['[PERSON_NAME_1]', '[EMAIL_1]']);
    expect(assertPayloadZeroLeak('Ada Cheng', vault, disabled).passed).toBe(true);
    const result = assertPayloadZeroLeak('Ada Cheng, May Lin, a@example.test', vault, disabled);
    expect(result.leaks.map(({ matchedSnippet, source }) => [matchedSnippet, source])).toEqual([
      ['May Lin', 'vault_original_leak'], ['a@example.test', 'regex_pattern_leak'],
    ]);
  });
});
