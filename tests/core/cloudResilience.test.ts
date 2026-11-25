import { describe, expect, it, vi } from 'vitest';
import {
  CloudInferenceError, classifyAiError, cloudModelChain, describeCloudFailure, runWithCloudResilience,
} from '../../src/core';

const httpError = (status: number) => Object.assign(
  new Error(`AI: Error fetching from https://example.invalid/v1beta/projects/demo-project/models/m:generateContent: [${status} ] high demand (AI/fetch-error)`),
  { name: 'FirebaseError' });

describe('classifyAiError', () => {
  it.each([
    [500, 'overloaded', true], [503, 'overloaded', true], [429, 'rate_limited', true],
    [403, 'app_check', false], [404, 'model_unavailable', false],
  ] as const)('maps HTTP %s to %s', (status, kind, retrySameModel) => {
    expect(classifyAiError(httpError(status))).toMatchObject({ kind, status, retrySameModel });
  });
  it('treats exhausted quota as switch-model-only, and a plain 429 as retryable', () => {
    const quota = Object.assign(new Error('[429 ] You exceeded your current quota, please check your plan and billing details.'));
    expect(classifyAiError(quota)).toMatchObject({ kind: 'quota', retrySameModel: false, tryNextModel: true });
    expect(classifyAiError(httpError(429))).toMatchObject({ kind: 'rate_limited', retrySameModel: true });
  });
  it('fails over (without same-model retry) on an unreadable structured answer', () => {
    expect(classifyAiError(new Error('Cloud Gemini returned an unreadable Stage 2 triage answer.')))
      .toMatchObject({ kind: 'invalid_output', retrySameModel: false, tryNextModel: true });
  });
  it('prefers structured customErrorData status and detects timeouts / network loss', () => {
    expect(classifyAiError(Object.assign(new Error('x'), { customErrorData: { status: 503 } }))).toMatchObject({ kind: 'overloaded' });
    expect(classifyAiError(Object.assign(new Error('signal'), { name: 'AbortError' }))).toMatchObject({ kind: 'timeout' });
    expect(classifyAiError(new TypeError('Failed to fetch'))).toMatchObject({ kind: 'network', tryNextModel: false });
    expect(classifyAiError('weird')).toMatchObject({ kind: 'unknown', retrySameModel: false });
  });
});

describe('runWithCloudResilience', () => {
  const sleep = vi.fn(async () => {});

  it('retries transient failures with backoff, then succeeds on the fallback model', async () => {
    sleep.mockClear();
    const seen: string[] = [];
    const run = vi.fn(async (model: string) => {
      seen.push(model);
      if (model === 'primary') throw httpError(500);
      return 'ok';
    });
    const onRetry = vi.fn();
    const res = await runWithCloudResilience(['primary', 'fallback'], run, { sleep, onRetry, baseDelayMs: 100 });
    expect(res).toMatchObject({ value: 'ok', model: 'fallback' });
    expect(seen).toEqual(['primary', 'primary', 'fallback']);
    expect(sleep.mock.calls).toEqual([[100]]);
    expect(res.attempts.map(a => [a.model, a.attempt, a.kind])).toEqual([
      ['primary', 1, 'overloaded'], ['primary', 2, 'overloaded'],
    ]);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('never retries an App Check rejection and never leaks the endpoint in the message', async () => {
    const run = vi.fn(async () => { throw httpError(403); });
    const err = await runWithCloudResilience(['primary', 'fallback'], run, { sleep }).catch(e => e);
    expect(err).toBeInstanceOf(CloudInferenceError);
    expect(err.kind).toBe('app_check');
    expect(run).toHaveBeenCalledTimes(1);
    expect(err.message).not.toMatch(/https?:|projects\/|demo-project/);
  });

  it('gives up after exhausting every model and reports a friendly summary', async () => {
    const run = vi.fn(async () => { throw httpError(500); });
    const err = await runWithCloudResilience(['a', 'b'], run, { sleep }).catch(e => e);
    expect(run).toHaveBeenCalledTimes(4);
    expect(err.message).toBe(describeCloudFailure('overloaded', err.attempts));
    expect(err.message).toContain('4 attempts across 2 models');
  });

  it('skips straight to the fallback when the primary model does not exist', async () => {
    const run = vi.fn(async (model: string) => {
      if (model === 'gone') throw httpError(404);
      return model;
    });
    await expect(runWithCloudResilience(['gone', 'next'], run, { sleep })).resolves.toMatchObject({ value: 'next' });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('builds a de-duplicated model chain', () => {
    expect(cloudModelChain('m1', 'm2')).toEqual(['m1', 'm2']);
    expect(cloudModelChain('m1', ' m1 ')).toEqual(['m1']);
    expect(cloudModelChain('m1', '')).toEqual(['m1']);
    expect(cloudModelChain('m1', ['m2', 'm1', ' m3 ', 'm2'])).toEqual(['m1', 'm2', 'm3']);
  });
});

describe('caller cancellation', () => {
  it('skips every model if cancelled before dispatch', async () => {
    const run = vi.fn(async () => 'unexpected');
    await expect(runWithCloudResilience(['a', 'b'], run, { signal: AbortSignal.abort() }))
      .rejects.toMatchObject({ kind: 'aborted', attempts: [] });
    expect(run).not.toHaveBeenCalled();
  });

  it('settles during a pending request and never runs the fallback', async () => {
    const controller = new AbortController();
    const run = vi.fn(() => new Promise<string>(() => {}));
    const result = runWithCloudResilience(['a', 'b'], run, { signal: controller.signal });
    controller.abort();
    await expect(result).rejects.toMatchObject({ kind: 'aborted', attempts: [{ kind: 'aborted', model: 'a' }] });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('cancels during backoff without waiting or announcing another attempt', async () => {
    const controller = new AbortController();
    const run = vi.fn(async () => { throw httpError(500); });
    const onRetry = vi.fn();
    const sleep = () => {
      controller.abort();
      return new Promise<void>(() => {});
    };
    await expect(runWithCloudResilience(['a', 'b'], run, { signal: controller.signal, sleep, onRetry }))
      .rejects.toMatchObject({ kind: 'aborted', attempts: [{ kind: 'overloaded' }] });
    expect(onRetry).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
