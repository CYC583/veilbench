import { describe, expect, it } from 'vitest';
import { assertPayloadZeroLeak, generateZeroLeakProof, runLocalAirlock, sha256Hex } from '../../src/core';

describe('SHA-256 proof', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ])('matches the standard digest for %j', async (input, expected) => {
    expect(await sha256Hex(input)).toBe(expected);
  });
  it('binds the exact raw and sanitized UTF-8 text, vault size and actual assertion result', async () => {
    const raw = '收件人 a@example.test、a@example.test、b@example.test。';
    const { vault, sanitizedText } = runLocalAirlock({ documentId: 'd', rawText: raw });
    for (const payload of [sanitizedText, raw]) {
      const proof = await generateZeroLeakProof({ rawCombinedText: raw, sanitizedCombinedText: payload, vault,
        preFlight: assertPayloadZeroLeak(payload, vault) });
      expect(proof).toEqual({ algorithm: 'SHA-256', rawContentHash: await sha256Hex(raw),
        sanitizedPayloadHash: await sha256Hex(payload), vaultEntriesCount: 2,
        preFlightPassed: payload === sanitizedText, generatedAt: new Date(proof.generatedAt).toISOString() });
      expect(proof.rawContentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(proof.rawContentHash === proof.sanitizedPayloadHash).toBe(payload === raw);
    }
  });
});
