import { describe, expect, it } from 'vitest';
import { decideHybridRoute, splitIntoLocalChunks } from '../../src/core';
import type { RouterContext } from '../../src/types/hybrid';

const base: RouterContext = {
  task: 'rapid_triage', charLength: 100, hasImage: false, isOnline: true,
  nanoStatus: 'available', userPreference: 'auto_hybrid', isPayloadSanitized: true,
  remoteConfig: { maxOnDeviceChars: 100, strictPiiBlockEnabled: true, configSource: 'default', cloudModelName: 'demo' },
};
const route = (overrides: Partial<RouterContext>) => decideHybridRoute({ ...base, ...overrides });
const airlock = 'Unsanitized payload blocked by Privacy Airlock. Run local redaction first.';
const strict = 'Strict Local-Only mode is enabled. Switch to Auto Hybrid or Cloud Deep to escalate.';
const offline = 'Offline and Chrome Gemini Nano is unavailable.';

describe('Q-3 routing policy', () => {
  const policy = { ...base.remoteConfig, routingPolicy: { medical: 'on_device_only' as const } };
  it('keeps a restricted category on-device and never falls back to the cloud', () => {
    expect(route({ remoteConfig: policy, categories: ['medical'] })).toMatchObject({
      allowedToProceed: true, targetEngine: 'on_device', recommendedMode: 'only_on_device' });
    expect(route({ remoteConfig: policy, categories: ['medical'], nanoStatus: 'unavailable' }).blockedReason)
      .toMatch(/^Policy: medical → on-device only\./);
    expect(route({ remoteConfig: policy, categories: ['medical'], task: 'cross_doc_contradiction' }))
      .toMatchObject({ allowedToProceed: false });
    expect(route({ remoteConfig: policy, categories: ['medical'], task: 'pii_scan', isPayloadSanitized: false }))
      .toMatchObject({ allowedToProceed: true });
  });
  it('leaves other categories untouched', () => {
    expect(route({ remoteConfig: policy, categories: ['contract'], nanoStatus: 'unavailable' }))
      .toMatchObject({ allowedToProceed: true, targetEngine: 'in_cloud' });
  });
});

describe('PII scan', () => {
  it.each(['available', 'downloadable', 'downloading', 'unavailable', 'unsupported_browser'] as const)(
    'keeps raw image and text local when Nano is %s', nanoStatus => {
      const result = route({ task: 'pii_scan', nanoStatus, hasImage: true, isPayloadSanitized: false, userPreference: 'cloud_deep' });
      expect(result).toMatchObject({ recommendedMode: 'only_on_device', allowedToProceed: true,
        targetEngine: nanoStatus === 'available' ? 'on_device' : 'local_deterministic_fallback', estimatedCloudCallsSaved: 1 });
      if (nanoStatus !== 'available') expect(result.reason).toMatch(/local deterministic/i);
    });
});

describe.each(['deep_redline_audit', 'cross_doc_contradiction', 'negotiation_chat'] as const)('%s', task => {
  it('checks the airlock before local-only and connectivity', () => {
    expect(route({ task, isPayloadSanitized: false, userPreference: 'strict_local_only', isOnline: false }))
      .toMatchObject({ allowedToProceed: false, blockedReason: airlock });
  });
  it('blocks escalation in strict local-only mode', () => {
    expect(route({ task, userPreference: 'strict_local_only' })).toMatchObject({ allowedToProceed: false, blockedReason: strict });
  });
  it('runs online in the cloud and degrades offline only with Nano', () => {
    expect(route({ task })).toMatchObject({ allowedToProceed: true, recommendedMode: 'prefer_in_cloud', targetEngine: 'in_cloud',
      estimatedCloudCallsSaved: 0, requiresChunking: false });
    expect(route({ task, isOnline: false, charLength: 101 })).toMatchObject({ allowedToProceed: true, recommendedMode: 'only_on_device',
      targetEngine: 'on_device', requiresChunking: true, estimatedCloudCallsSaved: 1 });
    expect(route({ task, isOnline: false, nanoStatus: 'downloading' })).toMatchObject({ allowedToProceed: false, blockedReason: offline });
  });
  it('honors the remote airlock flag for cloud-bound tasks', () => {
    expect(route({ task, isPayloadSanitized: false, remoteConfig: { ...base.remoteConfig, strictPiiBlockEnabled: false } }))
      .toMatchObject({ allowedToProceed: true, targetEngine: 'in_cloud' });
  });
});

describe.each(['rapid_triage', 'translate_ui_content'] as const)('%s', task => {
  it('prefers Nano, chunks strictly above the limit and enforces offline/local-only mode', () => {
    expect(route({ task })).toMatchObject({ requiresChunking: false, targetEngine: 'on_device', recommendedMode: 'prefer_on_device' });
    expect(route({ task, charLength: 101, isOnline: false, userPreference: 'cloud_deep' })).toMatchObject({
      requiresChunking: true, allowedToProceed: true, recommendedMode: 'only_on_device', estimatedCloudCallsSaved: 1 });
    expect(route({ task, userPreference: 'strict_local_only' }).recommendedMode).toBe('only_on_device');
  });
  it('applies Cloud Deep only to online sanitized requests', () => {
    expect(route({ task, userPreference: 'cloud_deep' })).toMatchObject({ recommendedMode: 'prefer_in_cloud', targetEngine: 'in_cloud' });
    expect(route({ task, userPreference: 'cloud_deep', isPayloadSanitized: false }).targetEngine).toBe('on_device');
  });
  it('allows SDK fallback only for sanitized online requests with cloud permission', () => {
    const fallback = { task, nanoStatus: 'unsupported_browser' } as const;
    expect(route(fallback)).toMatchObject({ allowedToProceed: true, recommendedMode: 'prefer_on_device',
      targetEngine: 'in_cloud', estimatedCloudCallsSaved: 0 });
    for (const overrides of [{ isPayloadSanitized: false }, { isOnline: false }, { userPreference: 'strict_local_only' }] as const) {
      expect(route({ ...fallback, ...overrides })).toMatchObject({ allowedToProceed: false, blockedReason: expect.any(String) });
    }
  });
});

describe('lossless chunking', () => {
  it.each([
    ['a. b\n\nc. delta', 8, 'a. b\n\n'], ['First. Next word', 10, 'First.'],
    ['word next tail', 8, 'word '], ['abcdefghij', 4, 'abcd'], ['一二。三四五六七', 5, '一二。'],
  ] as const)('uses the best available boundary in %j', (text, size, first) => {
    const parts = splitIntoLocalChunks(text, size);
    expect(parts[0]).toBe(first);
    expect(parts.join('')).toBe(text);
    expect(parts.every(p => p.length > 0 && p.length <= size)).toBe(true);
  });
  it('preserves whitespace, Unicode, and exact-limit input', () => {
    const text = '  abc\r\n\r\n💻中文!  ';
    for (let max = 1; max <= text.length; max++) {
      const parts = splitIntoLocalChunks(text, max);
      expect(parts.join('')).toBe(text);
      expect(Math.max(...parts.map(s => s.length))).toBeLessThanOrEqual(max);
    }
    expect(splitIntoLocalChunks(text, text.length)).toEqual([text]);
    expect(splitIntoLocalChunks('x💻💻', 2)).toEqual(['x', '💻', '💻']);
    expect(splitIntoLocalChunks('', 5)).toEqual([]);
  });
  it.each([0, -1, 2.5, Infinity, NaN])('rejects invalid limit %s', size => {
    expect(() => splitIntoLocalChunks('text', size)).toThrow(RangeError);
  });
});
