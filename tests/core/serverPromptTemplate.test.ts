import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runDeepRedlineAudit } from '../../src/services/aiLogicService';
import { sha256Hex } from '../../src/core/proofGenerator';
import type { WorkbenchDocument } from '../../src/types/audit';

const { invoke, direct, enabled } = vi.hoisted(() => ({
  invoke: vi.fn(), direct: vi.fn(), enabled: vi.fn(),
}));
vi.mock('firebase/ai', async (actual) => ({
  ...await actual<typeof import('firebase/ai')>(),
  getTemplateGenerativeModel: () => ({ generateContent: invoke }),
  getGenerativeModel: () => ({ generateContent: direct }),
}));
vi.mock('firebase/remote-config', () => ({ getBoolean: enabled }));
vi.mock('../../src/config/firebase', () => ({
  getFirebaseServices: () => ({ ai: {}, remoteConfig: {} }), startHybridPerfTrace: () => null, logHybridAnalyticsEvent: vi.fn(),
}));
const prompt = 'Review payment terms for [PARTY_CLIENT_1].';
const image = 'data:image/png;base64,YWJj';
const doc: WorkbenchDocument = {
  id: 'sample', title: 'Contract', category: 'contract', createdAt: '', rawText: '', sanitizedText: prompt,
  redactedImageDataUrl: image, rawImageDataUrl: 'local', requiresImageReview: true, imageReviewed: true,
};
async function params() {
  return {
    prompt, documents: [doc], mode: 'only_in_cloud' as const,
    remoteConfig: { maxOnDeviceChars: 1000, cloudModelName: 'gemini-3.5-flash-lite', strictPiiBlockEnabled: true, configSource: 'default' as const },
    templateProof: { vault: { byToken: {}, byOriginal: {}, roleCounters: {} }, proof: {
      algorithm: 'SHA-256' as const, rawContentHash: '', sanitizedPayloadHash: await sha256Hex(prompt),
      vaultEntriesCount: 0, generatedAt: '', preFlightPassed: true, outboundImageHashes: [{ title: doc.title, sha256: await sha256Hex(image) }],
    } },
  };
}
const response = { response: { text: () => JSON.stringify({
  contradictions: [], redlines: [], executiveSummary: 'Review.', counterpartyPushback: [], readyToSendEmailSanitized: 'Review.',
}) } };
describe('Stage 4 server templates', () => {
  beforeEach(() => { enabled.mockReset().mockReturnValue(true); invoke.mockReset().mockResolvedValue(response); direct.mockReset().mockResolvedValue(response); });
  it('sends only approved input fields, images only for analysis, and fingerprints each whole SDK request body', async () => {
    const p = await params();
    const result = await runDeepRedlineAudit(p);
    expect(invoke.mock.calls.map(c => c[0])).toEqual(['veilbench-stage4-analysis-v1', 'veilbench-stage4-playbook-v1']);
    expect(invoke.mock.calls.map(c => c[1])).toEqual([
      { envelope: prompt, images: [{ mime_type: 'image/png', contents: 'YWJj' }] },
      { envelope: prompt, differenceSyntax: '{{DIFF:[TOKEN_A]-[TOKEN_B]}}' },
    ]);
    for (const [index, [, inputs]] of invoke.mock.calls.entries()) {
      const fingerprint = createHash('sha256').update(JSON.stringify({ inputs })).digest('hex');
      expect(result.telemetry[index].note).toContain(fingerprint);
    }
    expect(direct).not.toHaveBeenCalled();
  });
  it('blocks both requests when reviewed text, pixels or review status changes before sending', async () => {
    const p = await params();
    for (const change of [
      { prompt: prompt + ' changed' },
      { documents: [{ ...doc, imageReviewed: false }] },
      { documents: [{ ...doc, redactedImageDataUrl: 'data:image/png;base64,bmV3' }] },
      { templateProof: undefined },
    ]) {
      await expect(runDeepRedlineAudit({ ...p, ...change })).rejects.toThrow('Layer 3 blocked');
    }
    expect(invoke).not.toHaveBeenCalled();
    expect(direct).not.toHaveBeenCalled();
  });
  it('requires Layer 3 to pass even with a matching hash', async () => {
    const p = await params();
    p.prompt = 'Call 212-555-0143';
    p.templateProof.proof.sanitizedPayloadHash = await sha256Hex(p.prompt);
    await expect(runDeepRedlineAudit(p)).rejects.toThrow('Layer 3 blocked');
    expect(invoke).not.toHaveBeenCalled();
    expect(direct).not.toHaveBeenCalled();
  });
  it('retains explicit on-device routing and the default direct path', async () => {
    const p = await params();
    await runDeepRedlineAudit({ ...p, mode: 'only_on_device' });
    enabled.mockReturnValue(false);
    await runDeepRedlineAudit(p);
    expect(direct).toHaveBeenCalledTimes(4);
    expect(invoke).not.toHaveBeenCalled();
  });
});
