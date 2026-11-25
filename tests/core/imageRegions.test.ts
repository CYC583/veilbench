import { describe, expect, it } from 'vitest';
import { resolveImageRegions } from '../../src/core';
import type { ImageRedactionRegion, PiiEntity } from '../../src/types/privacy';

const bbox = { x: 0.1, y: 0.1, width: 0.2, height: 0.05 };
const entity = (originalValue: string, token: string, enabled = true): PiiEntity => ({
  id: `d:${token}`, documentId: 'd', originalValue, token, role: 'PERSON_NAME', layer: 'deterministic_regex', enabled,
});

describe('image regions bound to the Local Vault', () => {
  const regions: ImageRedactionRegion[] = [
    { id: 'r1', label: '[REDACTED]', bbox, originalValue: 'NORTHSTAR VENTURES LLC' },
    { id: 'r2', label: '[REDACTED]', bbox, originalValue: 'Marcus Vance' },
    { id: 'r3', label: '[REDACTED]', bbox, originalValue: 'not in vault' },
    { id: 'r4', label: '[HEADER_PII_MASKED]', bbox },
  ];

  it('labels with the exact text token (case-insensitive), fails closed and keeps unanchored regions', () => {
    const resolved = resolveImageRegions(regions, [
      entity('Northstar Ventures LLC', '[PARTY_CLIENT_1]'), entity('Marcus Vance', '[PERSON_NAME_1]'),
    ]);
    expect(resolved.map(r => [r.id, r.label])).toEqual([
      ['r1', '[PARTY_CLIENT_1]'], ['r2', '[PERSON_NAME_1]'], ['r3', '[REDACTED]'], ['r4', '[HEADER_PII_MASKED]'],
    ]);
  });

  it('drops the burn box when the user toggles that entity off', () => {
    const resolved = resolveImageRegions(regions, [
      entity('Northstar Ventures LLC', '[PARTY_CLIENT_1]'), entity('Marcus Vance', '[PERSON_NAME_1]', false),
    ]);
    expect(resolved.map(r => r.id)).toEqual(['r1', 'r3', 'r4']);
  });

  it('returns no regions when none are defined', () => {
    expect(resolveImageRegions(undefined, [])).toEqual([]);
  });
});
