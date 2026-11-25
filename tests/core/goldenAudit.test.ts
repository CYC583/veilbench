import { describe, expect, it } from 'vitest';
import { findAliases, rehydrateWithLocalMath, runLocalAirlock } from '../../src/core';
import { SAMPLE_PACKS } from '../../src/data/sampleDocuments';
import { SAMPLE_GOLDEN_AUDITS } from '../../src/data/sampleGoldenAudits';

describe('T-3 recorded demo cache', () => {
  for (const [packId, golden] of Object.entries(SAMPLE_GOLDEN_AUDITS)) {
    const pack = SAMPLE_PACKS.find(p => p.id === packId)!;
    let vault;
    for (const d of pack.documents) vault = runLocalAirlock({ documentId: d.id, rawText: d.rawText, existingVault: vault }).vault;
    const text = JSON.stringify(golden);

    it(`${packId}: holds tokens only — no raw sample value is stored`, () => {
      for (const entry of Object.values(vault!.byOriginal)) {
        expect(text.toLowerCase(), entry.originalValue).not.toContain(entry.originalValue.toLowerCase());
      }
    });

    it(`${packId}: every token resolves in the sample vault and local math fills the difference`, () => {
      for (const [token] of Array.from(findAliases(text))) expect(vault!.byToken[token], token).toBeDefined();
      const email = rehydrateWithLocalMath(golden.playbook.readyToSendEmailSanitized, vault!);
      expect(email).toContain('$6,000 (12.5%)');
      expect(email).not.toMatch(/\[[A-Z_]+_\d+\]|\{\{DIFF/);
    });
  }
});
