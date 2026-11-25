import type { PreFlightAssertion, VaultMap, ZeroLeakProof } from '../types/privacy';

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function generateZeroLeakProof(params: {
  rawCombinedText: string;
  sanitizedCombinedText: string;
  vault: VaultMap;
  preFlight: PreFlightAssertion;
}): Promise<ZeroLeakProof> {
  const [rawContentHash, sanitizedPayloadHash] = await Promise.all([
    sha256Hex(params.rawCombinedText), sha256Hex(params.sanitizedCombinedText),
  ]);
  return {
    algorithm: 'SHA-256', rawContentHash, sanitizedPayloadHash,
    vaultEntriesCount: Object.keys(params.vault.byOriginal).length,
    preFlightPassed: params.preFlight.passed, generatedAt: new Date().toISOString(),
  };
}
