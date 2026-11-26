import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UI, type Msg } from '../../src/i18n/ui';

/**
 * Every UI string lives in the central dictionary (src/i18n/ui) as an { en, zh } pair. This guard catches
 * a Chinese entry that was never translated (no CJK at all), an English entry that leaked Chinese, and
 * a component that went back to writing inline `isZh ? '…' : '…'` pairs.
 */
const cjk = /[㐀-鿿＀-￯]/;
const symbolsOnly = /^[\w\s.:/→·%$()[\]{}<>=,'"+-]*$/;
const inlinePair = /(isZh|locale === 'zh-TW')\s*\?\s*['"`]/;
/**
 * Intentional exceptions, each with its reason:
 * - the language toggle names both languages on purpose;
 * - step4Tail is the end of a sentence split around a <code> link; English word order needs no tail.
 */
const BILINGUAL_ON_PURPOSE = new Set(['commandBar.toggleLocaleLabel']);
const EMPTY_EN_ON_PURPOSE = new Set(['nanoSetup.step4Tail']);
/** Owned by the relay workstream; converted separately. */
const EXEMPT = new Set(['src/components/RelayOpener.tsx']);

function sampleArgs(fn: (...a: never[]) => Msg): Msg {
  for (const v of [2, '2', true]) {
    try {
      return fn(...(Array(fn.length).fill(v) as never[]));
    } catch {
      // try the next argument type
    }
  }
  throw new Error('could not render with sample arguments');
}

const entries: Array<{ key: string; msg: Msg }> = Object.entries(UI).flatMap(([section, dict]) =>
  Object.entries(dict as Record<string, Msg | ((...a: never[]) => Msg)>).map(([k, v]) => ({
    key: `${section}.${k}`,
    msg: typeof v === 'function' ? sampleArgs(v) : v,
  }))
);

describe('central UI dictionary (en / zh-TW)', () => {
  it('holds the UI strings', () => {
    expect(entries.length).toBeGreaterThan(250);
  });

  it.each(entries.map((e) => [e.key, e] as const))('%s', (_, { key, msg }) => {
    if (BILINGUAL_ON_PURPOSE.has(key)) return;
    if (!EMPTY_EN_ON_PURPOSE.has(key)) expect(msg.en.trim(), 'empty English string').not.toBe('');
    expect(msg.zh.trim(), 'empty Chinese string').not.toBe('');
    if (symbolsOnly.test(msg.zh) && symbolsOnly.test(msg.en)) return; // e.g. model names, "OK"
    expect(cjk.test(msg.zh), `untranslated: ${msg.zh}`).toBe(true);
    expect(cjk.test(msg.en), `Chinese inside English: ${msg.en}`).toBe(false);
  });

  it('components read strings from the dictionary, not inline pairs', () => {
    const files = readdirSync('src/components').filter((f) => f.endsWith('.tsx')).map((f) => join('src/components', f))
      .concat(['src/App.tsx'])
      .filter((f) => !EXEMPT.has(f));
    const offenders = files.flatMap((path) =>
      readFileSync(path, 'utf8').split('\n').flatMap((line, i) => (inlinePair.test(line) ? [`${path}:${i + 1}`] : []))
    );
    expect(offenders).toEqual([]);
  });
});
