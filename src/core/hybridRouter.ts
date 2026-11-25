import type { RouterContext, RouterDecision } from '../types/hybrid';

const unsanitized = 'Unsanitized payload blocked by Privacy Airlock. Run local redaction first.';
const strictLocal = 'Strict Local-Only mode is enabled. Switch to Auto Hybrid or Cloud Deep to escalate.';
const offline = 'Offline and Chrome Gemini Nano is unavailable.';

function blocked(reason: string): RouterDecision {
  return { recommendedMode: 'only_on_device', targetEngine: 'on_device', allowedToProceed: false,
    blockedReason: reason, reason, requiresChunking: false, estimatedCloudCallsSaved: 0 };
}

export function decideHybridRoute(ctx: RouterContext): RouterDecision {
  const nano = ctx.nanoStatus === 'available';
  const localOnly = ctx.userPreference === 'strict_local_only';
  const onDevice: RouterDecision = {
    recommendedMode: 'only_on_device', targetEngine: 'on_device', allowedToProceed: true,
    reason: 'Run locally with Chrome Gemini Nano.',
    requiresChunking: ctx.charLength > ctx.remoteConfig.maxOnDeviceChars, estimatedCloudCallsSaved: 1,
  };
  const cloud: RouterDecision = {
    recommendedMode: 'prefer_in_cloud', targetEngine: 'in_cloud', allowedToProceed: true,
    reason: 'Use cloud inference for this request.', requiresChunking: false, estimatedCloudCallsSaved: 0,
  };

  // Q-3: sensitivity policy from Remote Config. Stage 1 is always local; every later stage for a
  // restricted category may only run on-device, and never falls back to the cloud.
  const restricted = (ctx.categories ?? []).find(c => ctx.remoteConfig.routingPolicy?.[c] === 'on_device_only');
  if (restricted && ctx.task !== 'pii_scan') {
    const policy = `Policy: ${restricted} → on-device only.`;
    if (nano && (ctx.task === 'rapid_triage' || ctx.task === 'translate_ui_content')) {
      return { ...onDevice, recommendedMode: 'only_on_device', reason: `${policy} Run locally with Chrome Gemini Nano.` };
    }
    return blocked(`${policy} ${nano ? 'This task needs the cloud, which this policy forbids.' : 'Chrome Gemini Nano is unavailable, so this step cannot run.'}`);
  }

  if (ctx.task === 'pii_scan') {
    return nano ? onDevice : { ...onDevice, targetEngine: 'local_deterministic_fallback',
      requiresChunking: false, reason: 'Nano is unavailable. Use the local deterministic PII shield.' };
  }

  if (ctx.task !== 'rapid_triage' && ctx.task !== 'translate_ui_content') {
    if (ctx.remoteConfig.strictPiiBlockEnabled && !ctx.isPayloadSanitized) return blocked(unsanitized);
    if (localOnly) return blocked(strictLocal);
    if (!ctx.isOnline) return nano ? onDevice : blocked(offline);
    return cloud;
  }

  if (ctx.userPreference === 'cloud_deep' && ctx.isOnline && ctx.isPayloadSanitized) return cloud;
  if (nano) {
    return { ...onDevice, recommendedMode: localOnly || !ctx.isOnline ? 'only_on_device' : 'prefer_on_device' };
  }
  if (!ctx.isOnline) return blocked(offline);
  if (localOnly) return blocked(strictLocal);
  if (!ctx.isPayloadSanitized) return blocked(unsanitized);
  return { ...cloud, recommendedMode: 'prefer_on_device', reason: 'Nano is unavailable. Use the cloud fallback.' };
}

export function splitIntoLocalChunks(text: string, maxChunkChars: number): string[] {
  if (!Number.isSafeInteger(maxChunkChars) || maxChunkChars < 1) {
    throw new RangeError('maxChunkChars must be a positive integer.');
  }
  const chunks: string[] = [];
  let start = 0;
  while (text.length - start > maxChunkChars) {
    const window = text.slice(start, start + maxChunkChars);
    const paragraph = window.lastIndexOf('\n\n');
    let end = paragraph >= 0 ? paragraph + 2 : 0;
    if (!end) {
      let wordEnd = 0;
      for (const match of window.matchAll(/[.!?。！？](?=\s|$)|[。！？]|\s+/gu)) {
        const boundary = match.index! + match[0].length;
        if (match[0].trim()) end = boundary;
        else wordEnd = boundary;
      }
      end ||= wordEnd || window.length;
    }
    if (end > 1 && /[\uD800-\uDBFF]/u.test(window[end - 1]) && /[\uDC00-\uDFFF]/u.test(text[start + end])) end--;
    chunks.push(window.slice(0, end));
    start += end;
  }
  if (start < text.length) chunks.push(text.slice(start));
  return chunks;
}
