import { describe, expect, it } from 'vitest';
import {
  assertPayloadZeroLeak, buildDeepAuditPrompt, DEEP_AUDIT_TASK_ANALYSIS, DEEP_AUDIT_TASK_PLAYBOOK, buildRelationalHints, formatRelationalHints,
  generateZeroLeakProof, runLocalAirlock, sha256Hex,
} from '../../src/core';
import { SAMPLE_PACKS } from '../../src/data/sampleDocuments';

describe('Stage 4 outbound envelope', () => {
  it('is the single string that is checked, hashed and sent', async () => {
    let vault;
    const docs = [];
    for (const d of SAMPLE_PACKS[0].documents) {
      const r = runLocalAirlock({ documentId: d.id, rawText: d.rawText, existingVault: vault });
      vault = r.vault;
      docs.push({ id: d.id, title: d.title, category: d.category, sanitizedText: r.sanitizedText,
        hasBurnedImage: Boolean(d.generateImage) });
    }
    const prompt = buildDeepAuditPrompt({ documents: docs, relationalHints: formatRelationalHints(buildRelationalHints(vault!)), vault: vault! });

    const json = prompt.slice(prompt.indexOf('{'), prompt.indexOf('\n\nLOCALLY COMPUTED'));
    expect(JSON.parse(json)).toMatchObject({ schema: 'veilbench.outbound.v1', task: 'cross_doc_contradiction' });
    for (const raw of ['Q-2026-881', 'Marcus Vance', 'Elena Rostova', '$48,000', 'November 18, 2026', 'US89-4829-1104-8821']) {
      expect(prompt).not.toContain(raw);
    }
    const preFlight = assertPayloadZeroLeak(prompt, vault!);
    expect(preFlight.leaks).toEqual([]);
    const proof = await generateZeroLeakProof({ rawCombinedText: 'raw', sanitizedCombinedText: prompt, vault: vault!, preFlight });
    expect(proof.sanitizedPayloadHash).toBe(await sha256Hex(prompt));
    // The fixed per-call task suffixes carry no data, so each final request still passes Layer 3.
    for (const suffix of [DEEP_AUDIT_TASK_ANALYSIS, DEEP_AUDIT_TASK_PLAYBOOK]) {
      expect(assertPayloadZeroLeak(`${prompt}\n\n${suffix}`, vault!).leaks).toEqual([]);
    }
  });
});
