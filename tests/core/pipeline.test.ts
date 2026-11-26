import { describe, expect, it, vi } from 'vitest';

const onDeviceScan = vi.fn();
vi.mock('../../src/services/aiLogicService', () => ({
  runOnDevicePiiScan: (...args: unknown[]) => onDeviceScan(...args),
  CloudStageError: class CloudStageError extends Error {},
}));

import { DEFAULT_REMOTE_HYBRID_CONFIG } from '../../src/config/remoteConfig';
import { createEmptyVault } from '../../src/core';
import { buildSecurityProof, buildSessionRecord, scanIncomingDocuments, type RoutingInputs } from '../../src/pipeline/airlock';
import { deepAuditTask, layer3BlockedEvent, mergeRetriedAudit, routeSanitizedTask } from '../../src/pipeline/cloudAudit';
import type { DeepAuditResult, WorkbenchDocument } from '../../src/types/audit';
import type { TelemetryEvent } from '../../src/types/hybrid';

const routing: RoutingInputs = {
  isOnline: true,
  nanoStatus: 'unavailable',
  userPreference: 'auto_hybrid',
  remoteConfig: DEFAULT_REMOTE_HYBRID_CONFIG,
};

function doc(id: string, rawText: string, extra: Partial<WorkbenchDocument> = {}): WorkbenchDocument {
  return { id, title: `${id}.txt`, category: 'contract', rawText, sanitizedText: '', createdAt: '2026-11-26T00:00:00Z', ...extra };
}

// Rules alone catch a name in this phrasing; "Client: Jane Smith" needs on-device Nano (see docs/BENCHMARK.md).
const CONTRACT = 'Prepared for Jane Smith (Client), jane.smith@example.com. Total fee: $48,000 due 2026-12-15.';
const QUOTE = 'Quote for Jane Smith: $42,000 total, contact jane.smith@example.com.';

async function scan(docs: WorkbenchDocument[]) {
  const events: TelemetryEvent[] = [];
  const res = await scanIncomingDocuments({
    incomingDocs: docs,
    startVault: createEmptyVault(),
    startEntitiesByDoc: {},
    existingCategories: [],
    routing,
    pushTelemetry: (e) => events.push(e),
  });
  return { ...res, events };
}

describe('scanIncomingDocuments (Stage 1, no React)', () => {
  it('tokenizes every document with one shared vault and never calls the on-device model when Nano is unavailable', async () => {
    const { processed, vault, entitiesByDoc, events } = await scan([doc('a', CONTRACT), doc('b', QUOTE)]);
    expect(onDeviceScan).not.toHaveBeenCalled();
    for (const d of processed) {
      expect(d.sanitizedText).not.toContain('jane.smith@example.com');
      expect(d.sanitizedText).not.toContain('$48,000');
    }
    // Same email → same token in both documents.
    const emailToken = (text: string) => text.match(/\[EMAIL[A-Z_]*_\d+\]/)?.[0];
    expect(emailToken(processed[0].sanitizedText)).toBeDefined();
    expect(emailToken(processed[0].sanitizedText)).toBe(emailToken(processed[1].sanitizedText));
    expect(Object.keys(entitiesByDoc)).toEqual(['a', 'b']);
    expect(Object.keys(vault.byToken).length).toBeGreaterThan(0);
    expect(events.map((e) => e.actualSource)).toEqual(['LOCAL_DETERMINISTIC', 'LOCAL_DETERMINISTIC']);
  });
});

describe('buildSecurityProof (Layer 3)', () => {
  it('passes a fully tokenized envelope and hashes exactly the payload it checked', async () => {
    const { processed, vault, entitiesByDoc } = await scan([doc('a', CONTRACT)]);
    const res = await buildSecurityProof(processed, vault, entitiesByDoc);
    expect(res.assertion?.passed).toBe(true);
    expect(res.proof?.preFlightPassed).toBe(true);
    expect(res.payload).not.toContain('Jane Smith');
  });

  it('blocks while an uploaded image has not been reviewed', async () => {
    const { processed, vault, entitiesByDoc } = await scan([
      doc('a', CONTRACT, { rawImageDataUrl: 'data:image/png;base64,AAAA', requiresImageReview: true, imageReviewed: false }),
    ]);
    const res = await buildSecurityProof(processed, vault, entitiesByDoc);
    expect(res.assertion?.passed).toBe(false);
    expect(res.assertion?.leaks.some((l) => l.source === 'image_review_required')).toBe(true);
  });

  it('returns an empty result for an empty workspace', async () => {
    const res = await buildSecurityProof([], createEmptyVault(), {});
    expect(res).toMatchObject({ assertion: null, proof: null, payload: '' });
  });
});

describe('buildSessionRecord (Firestore boundary)', () => {
  it('saves only token-form titles and excerpts after Layer 3 passed', async () => {
    const { processed, vault, entitiesByDoc } = await scan([doc('a', CONTRACT, { title: 'Contract for jane.smith@example.com' })]);
    const { proof } = await buildSecurityProof(processed, vault, entitiesByDoc);
    const record = buildSessionRecord({ sessionId: 's1', docs: processed, vault, proof, triage: null, deepAudit: null });
    expect(record).not.toBeNull();
    expect(JSON.stringify(record)).not.toContain('Jane Smith');
    expect(JSON.stringify(record)).not.toContain('jane.smith@example.com');
    expect(record?.zeroLeakProofHash).toBe(proof?.sanitizedPayloadHash);
  });

  it('saves nothing when Layer 3 did not pass', async () => {
    const { processed, vault } = await scan([doc('a', CONTRACT)]);
    expect(buildSessionRecord({ sessionId: 's1', docs: processed, vault, proof: null, triage: null, deepAudit: null })).toBeNull();
  });
});

describe('cloud audit helpers', () => {
  const base: DeepAuditResult = {
    contradictions: [{ id: 'old' } as never],
    redlines: [],
    playbook: { executiveSummary: 'old playbook', counterpartyPushback: [], readyToSendEmailSanitized: '' },
    inferenceSource: 'IN_CLOUD' as never,
    generatedAt: 't0',
    incompleteParts: ['playbook'],
    cachedParts: ['playbook'],
    cacheInfo: { recordedAt: 'r', analysisModel: 'm', playbookModel: 'm' },
  };
  const fresh: DeepAuditResult = {
    ...base,
    contradictions: [{ id: 'new' } as never],
    playbook: { executiveSummary: 'new playbook', counterpartyPushback: [], readyToSendEmailSanitized: '' },
    generatedAt: 't1',
    incompleteParts: undefined,
    cachedParts: undefined,
    cacheInfo: undefined,
  };

  it('a playbook retry keeps the earlier analysis and drops the cache badge for the re-run half', () => {
    const merged = mergeRetriedAudit(base, fresh, 'playbook');
    expect(merged.contradictions).toEqual([{ id: 'old' }]);
    expect(merged.playbook.executiveSummary).toBe('new playbook');
    expect(merged.generatedAt).toBe('t1');
    expect(merged.incompleteParts).toBeUndefined();
    expect(merged.cachedParts).toBeUndefined();
    expect(merged.cacheInfo).toBeUndefined();
  });

  it('without a retry uses the fresh audit and does not mutate it', () => {
    const input = { ...fresh, incompleteParts: [] as Array<'analysis' | 'playbook'> };
    const merged = mergeRetriedAudit(base, input);
    expect(merged.contradictions).toEqual([{ id: 'new' }]);
    expect(merged.incompleteParts).toBeUndefined();
    expect(input.incompleteParts).toEqual([]);
  });

  it('picks the cross-document task for two or more documents', () => {
    expect(deepAuditTask([doc('a', '')])).toBe('deep_redline_audit');
    expect(deepAuditTask([doc('a', ''), doc('b', '')])).toBe('cross_doc_contradiction');
  });

  it('keeps a medical document on-device for every later stage', () => {
    const decision = routeSanitizedTask({
      task: 'deep_redline_audit',
      docs: [doc('a', '', { category: 'medical', sanitizedText: 'x' })],
      routing: { ...routing, remoteConfig: { ...DEFAULT_REMOTE_HYBRID_CONFIG, routingPolicy: { medical: 'on_device_only' } } },
      isPayloadSanitized: true,
    });
    expect(decision.targetEngine).toBe('on_device');
  });

  it('records a Layer 3 block as local and blocked', () => {
    const evt = layer3BlockedEvent([doc('a', '')], { passed: false, leaks: [{}, {}] } as never, 10);
    expect(evt).toMatchObject({ status: 'blocked', actualSource: 'LOCAL_DETERMINISTIC', piiInterceptedCount: 2, errorKind: 'layer3_preflight' });
  });
});
