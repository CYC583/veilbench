import { describe, expect, it } from 'vitest';
import { assertPayloadZeroLeak, decideHybridRoute, describeCloudFailure, runLocalAirlock } from '../../src/core';
import { localizeRuntimeMessage } from '../../src/i18n/runtimeMessages';
import type { RouterContext } from '../../src/types/hybrid';

const cjk = /[一-鿿]/;
const base: RouterContext = {
  task: 'cross_doc_contradiction', charLength: 10, hasImage: false, isOnline: true, nanoStatus: 'unavailable',
  userPreference: 'auto_hybrid', isPayloadSanitized: true,
  remoteConfig: { maxOnDeviceChars: 100, strictPiiBlockEnabled: true, configSource: 'default', cloudModelName: 'm' },
};

describe('zh-TW runtime message localization stays in sync with the real producers', () => {
  const produced = [
    decideHybridRoute({ ...base, isPayloadSanitized: false }).blockedReason!,
    decideHybridRoute({ ...base, userPreference: 'strict_local_only' }).blockedReason!,
    decideHybridRoute({ ...base, isOnline: false }).blockedReason!,
    decideHybridRoute({ ...base, categories: ['medical'],
      remoteConfig: { ...base.remoteConfig, routingPolicy: { medical: 'on_device_only' } } }).blockedReason!,
    ...(['overloaded', 'quota', 'model_unavailable', 'invalid_output', 'app_check', 'network', 'unknown'] as const)
      .map(kind => describeCloudFailure(kind, [{ model: 'm', attempt: 1, kind }])),
    ...assertPayloadZeroLeak('Ada Cheng a@example.test represented by Jane Doe',
      runLocalAirlock({ documentId: 'd', rawText: 'Ada Cheng', nanoCandidates: [{ value: 'Ada Cheng', role: 'PERSON_NAME' }] }).vault)
      .leaks.map(l => l.reason),
  ];

  it.each(produced)('translates %j', message => {
    expect(localizeRuntimeMessage(message, 'zh-TW')).toMatch(cjk);
    expect(localizeRuntimeMessage(message, 'en')).toBe(message);
  });
});
