import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every bilingual string in the UI is written as `isZh ? '中文' : 'English'`. This guard catches the two
 * ways that goes wrong: a Chinese branch that was never translated (no CJK at all) and an English branch
 * that leaked Chinese characters.
 */
const cjk = /[㐀-鿿＀-￯]/;
const pair = /isZh\s*\?\s*(['"`])((?:\\.|(?!\1).)*)\1\s*:\s*(['"`])((?:\\.|(?!\3).)*)\3/gs;

const files = readdirSync('src/components').filter(f => f.endsWith('.tsx')).map(f => join('src/components', f))
  .concat(['src/App.tsx']);

describe('zh-TW / English UI string pairs', () => {
  const pairs = files.flatMap(path => Array.from(readFileSync(path, 'utf8').matchAll(pair), m => ({
    path, zh: m[2], en: m[4],
  })));

  it('finds the bilingual strings', () => {
    expect(pairs.length).toBeGreaterThan(150);
  });

  it.each(pairs.map(p => [`${p.path}: ${p.en.slice(0, 60)}`, p] as const))('%s', (_, p) => {
    // Pure symbols/identifiers (e.g. "EN → 繁中" toggles, model names) are allowed in both.
    if (/^[\w\s.:/→·%$()[\]{}-]*$/.test(p.zh) && /^[\w\s.:/→·%$()[\]{}-]*$/.test(p.en)) return;
    expect(p.zh.trim(), 'empty Chinese string').not.toBe('');
    expect(p.en.trim(), 'empty English string').not.toBe('');
    expect(cjk.test(p.zh), `untranslated: ${p.zh}`).toBe(true);
    expect(cjk.test(p.en), `Chinese inside English: ${p.en}`).toBe(false);
  });
});
