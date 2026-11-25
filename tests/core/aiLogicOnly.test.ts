import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Contest rule: every AI inference goes through Firebase AI Logic. The Chrome Prompt API global may be
 * touched only to *check availability* (to show setup help), never to create a session or prompt it. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('all inference goes through Firebase AI Logic', () => {
  const files = sources('src').map(path => ({ path, text: readFileSync(path, 'utf8') }));

  it('uses window.LanguageModel only for availability()', () => {
    for (const { path, text } of files) {
      for (const m of text.matchAll(/LanguageModel\.(\w+)/g)) {
        expect(`${path}: LanguageModel.${m[1]}`).toBe(`${path}: LanguageModel.availability`);
      }
      expect(text, path).not.toMatch(/LanguageModel\.create|\.prompt\(|promptStreaming\(/);
    }
  });

  it('imports no other model SDK', () => {
    for (const { path, text } of files) {
      expect(text, path).not.toMatch(/@google\/genai|@google\/generative-ai|openai|anthropic/);
    }
  });

  it('calls Gemini only via firebase/ai getGenerativeModel', () => {
    const ai = files.filter(f => /from 'firebase\/ai'/.test(f.text)).map(f => f.path);
    // firebase.ts creates the AI Logic instance (getAI); aiLogicService.ts runs every inference.
    expect(ai.sort()).toEqual([join('src', 'config', 'firebase.ts'), join('src', 'services', 'aiLogicService.ts')]);
  });
});
