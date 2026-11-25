/**
 * Split-Knowledge Reasoning: the cloud reasons over tokens and *relations*; the device keeps the facts
 * and does the math. Hints carry only vault tokens and coarse buckets — never a raw amount or date —
 * so they pass the Layer 3 circuit breaker unchanged.
 */
import type { VaultMap } from '../types/privacy';
import { rehydrateText } from './piiShield';

export type PctBucket = '<5%' | '5-15%' | '15-30%' | '>30%';
export type GapBucket = '<7d' | '7-30d' | '>30d';

export type RelationalHint =
  | { kind: 'money_compare'; a: string; b: string; relation: 'gt' | 'lt' | 'eq'; pctDiffBucket: PctBucket }
  | { kind: 'date_order'; a: string; b: string; relation: 'before' | 'after' | 'same'; gapBucket: GapBucket };

const MAX_HINTS = 24;

export function parseMoneyAmount(value: string): number | null {
  const digits = value.replace(/NT\$|US\$|[$€£¥]|\b(?:USD|TWD|EUR|GBP)\b/gi, '').replace(/[,\s]/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(digits)) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

export function parseCalendarDate(value: string): number | null {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = iso ? Date.UTC(+iso[1], +iso[2] - 1, +iso[3]) : Date.parse(`${value} UTC`);
  return Number.isFinite(t) ? t : null;
}

function pctBucket(pct: number): PctBucket {
  if (pct < 5) return '<5%';
  if (pct < 15) return '5-15%';
  if (pct < 30) return '15-30%';
  return '>30%';
}

function gapBucket(days: number): GapBucket {
  if (days < 7) return '<7d';
  if (days <= 30) return '7-30d';
  return '>30d';
}

/** Deterministic, value-free relations between vault tokens (stable order: by token number). */
export function buildRelationalHints(vault: VaultMap): RelationalHint[] {
  const entries = Object.values(vault.byToken).sort((x, y) => x.token.localeCompare(y.token, 'en', { numeric: true }));
  const money = entries.flatMap(e => {
    const n = e.role === 'MONEY_AMOUNT' ? parseMoneyAmount(e.originalValue) : null;
    return n === null ? [] : [{ token: e.token, n }];
  });
  const dates = entries.flatMap(e => {
    const t = e.role === 'SENSITIVE_DATE' ? parseCalendarDate(e.originalValue) : null;
    return t === null ? [] : [{ token: e.token, t }];
  });
  const hints: RelationalHint[] = [];
  for (let i = 0; i < money.length; i++) {
    for (let j = i + 1; j < money.length; j++) {
      const { token: a, n: x } = money[i];
      const { token: b, n: y } = money[j];
      const base = Math.max(x, y) || 1;
      hints.push({ kind: 'money_compare', a, b, relation: x > y ? 'gt' : x < y ? 'lt' : 'eq',
        pctDiffBucket: pctBucket((Math.abs(x - y) / base) * 100) });
    }
  }
  for (let i = 0; i < dates.length; i++) {
    for (let j = i + 1; j < dates.length; j++) {
      const { token: a, t: x } = dates[i];
      const { token: b, t: y } = dates[j];
      hints.push({ kind: 'date_order', a, b, relation: x < y ? 'before' : x > y ? 'after' : 'same',
        gapBucket: gapBucket(Math.abs(x - y) / 86_400_000) });
    }
  }
  return hints.slice(0, MAX_HINTS);
}

const relationText = { gt: '>', lt: '<', eq: '=', before: 'is before', after: 'is after', same: 'is the same day as' };

export function formatRelationalHints(hints: RelationalHint[]): string {
  if (hints.length === 0) return '';
  const lines = hints.map(h => h.kind === 'money_compare'
    ? `- ${h.a} ${relationText[h.relation]} ${h.b} (difference ${h.pctDiffBucket} of the larger amount)`
    : `- ${h.a} ${relationText[h.relation]} ${h.b} (gap ${h.gapBucket})`);
  return [
    'LOCALLY COMPUTED RELATIONS (exact values never leave the device):',
    ...lines,
    'When an exact monetary difference matters, write the placeholder {{DIFF:[TOKEN_A]-[TOKEN_B]}};',
    'the user\'s browser computes it locally. Never guess real amounts.',
  ].join('\n');
}

const diffPattern = /\{\{DIFF:(\[[A-Z_]+_\d+\])-(\[[A-Z_]+_\d+\])\}\}/g;

function formatLikeSource(amount: number, sample: string): string {
  const symbol = sample.match(/NT\$|US\$|[$€£¥]/)?.[0] ?? '';
  const code = symbol ? '' : sample.match(/\b(?:USD|TWD|EUR|GBP)\b/i)?.[0];
  const body = amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return symbol ? `${symbol}${body}` : code ? `${code} ${body}` : body;
}

/**
 * Local re-hydration with on-device math: {{DIFF:[A]-[B]}} becomes "$6,000 (12.5%)" computed from the
 * vault, then every token is restored. Unknown or non-numeric tokens are left untouched.
 */
export function rehydrateWithLocalMath(text: string, vault: VaultMap): string {
  const withMath = text.replace(diffPattern, (match, a: string, b: string) => {
    const ea = vault.byToken[a];
    const eb = vault.byToken[b];
    const x = ea ? parseMoneyAmount(ea.originalValue) : null;
    const y = eb ? parseMoneyAmount(eb.originalValue) : null;
    if (x === null || y === null || Math.max(x, y) === 0) return match;
    const diff = x - y;
    const pct = (Math.abs(diff) / Math.max(x, y)) * 100;
    return `${diff < 0 ? '-' : ''}${formatLikeSource(Math.abs(diff), ea.originalValue)} (${pct.toFixed(1)}%)`;
  });
  return rehydrateText(withMath, vault);
}

export function countLocalMathPlaceholders(text: string): number {
  return Array.from(text.matchAll(diffPattern)).length;
}
