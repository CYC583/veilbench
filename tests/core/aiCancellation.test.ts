import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteHybridConfig } from '../../src/types/hybrid';
import { runDeepRedlineAudit, runNegotiationChatTurn, runRapidTriage, translateTextToZhTw } from '../../src/services/aiLogicService';

const { generate, stream } = vi.hoisted(() => ({
  generate: vi.fn(), stream: vi.fn(),
}));
vi.mock('firebase/ai', async (actual) => ({
  ...await actual<typeof import('firebase/ai')>(),
  getGenerativeModel: () => ({ generateContent: generate, generateContentStream: stream }),
}));
vi.mock('../../src/config/firebase', () => ({
  getFirebaseServices: () => ({ ai: {} }), startHybridPerfTrace: () => null, logHybridAnalyticsEvent: vi.fn(),
}));

const config: RemoteHybridConfig = {
  maxOnDeviceChars: 1000, cloudModelName: 'test', strictPiiBlockEnabled: true, configSource: 'default',
};
const common = { remoteConfig: config, mode: 'only_in_cloud' as const };

describe('AI Logic per-request cancellation', () => {
  beforeEach(() => {
    generate.mockReset().mockImplementation(() => new Promise(() => {}));
    stream.mockReset().mockImplementation(() => new Promise(() => {}));
  });
  it.each([
    { stage: 'triage', run: (signal: AbortSignal) => runRapidTriage({ ...common, signal, sanitizedText: 'Example' }), sdk: generate, calls: 1 },
    { stage: 'both audit halves', run: (signal: AbortSignal) => runDeepRedlineAudit({ ...common, signal, prompt: 'Example', documents: [] }), sdk: generate, calls: 2 },
    { stage: 'streaming chat', run: (signal: AbortSignal) => runNegotiationChatTurn({ ...common, signal, sanitizedContext: 'Example', sanitizedUserQuestion: 'Terms?', history: [] }), sdk: stream, calls: 1 },
    { stage: 'translation', run: (signal: AbortSignal) => translateTextToZhTw({ ...common, signal, englishText: 'Example' }), sdk: generate, calls: 1 },
  ])('passes the same signal into each $stage request and discards the result on abort', async ({ run, sdk, calls }) => {
    const controller = new AbortController();
    const result = run(controller.signal);
    await vi.waitFor(() => expect(sdk).toHaveBeenCalledTimes(calls));
    for (const [, options] of sdk.mock.calls) expect(options.signal).toBe(controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ kind: 'aborted' });
    expect(sdk).toHaveBeenCalledTimes(calls);
  });
});
