import type { SupportedLocale } from '../../types/audit';

/** One UI string in both languages. English is the judged default; zh is Traditional Chinese (Taiwan). */
export interface Msg {
  en: string;
  zh: string;
}

/** A UI string with values filled in at render time (counts, names, times). */
export type MsgFn<A extends unknown[]> = (...args: A) => Msg;

/** Returns the string for the current locale. */
export function pick(locale: SupportedLocale, msg: Msg): string {
  return locale === 'zh-TW' ? msg.zh : msg.en;
}

/** Binds a locale once per component: `const t = translator(locale); t(UI.hero.title)`. */
export function translator(locale: SupportedLocale): (msg: Msg) => string {
  return (msg) => pick(locale, msg);
}
