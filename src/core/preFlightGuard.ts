import type { PreFlightAssertion, PreFlightLeakMatch, SemanticRole, VaultMap } from '../types/privacy';
import { findAliases, scanContextualPii, scanDeterministicPii } from './piiShield';

// Formats that can never legitimately appear raw in an outbound payload, regardless of toggles.
const hardBlockRoles: SemanticRole[] = [
  'EMAIL', 'BANK_ACCOUNT', 'SECRET_KEY', 'MEDICAL_ID', 'SENSITIVE_DATE', 'ADDRESS', 'PHONE',
];
const nameOrEmail: SemanticRole[] = ['EMAIL', 'PERSON_NAME', 'PARTY_CLIENT', 'PARTY_CONTRACTOR', 'ORGANIZATION'];

export function assertPayloadZeroLeak(
  sanitizedPayload: string, vault: VaultMap, disabledTokens?: Set<string>,
): PreFlightAssertion {
  const leaks: PreFlightLeakMatch[] = [];
  const aliases = Array.from(findAliases(sanitizedPayload), m => ({
    start: m.index!, end: m.index! + m[0].length,
  }));
  for (const entry of Object.values(vault.byOriginal)) {
    const { originalValue, token, role } = entry;
    if (!originalValue || disabledTokens?.has(token)) continue;
    const flags = originalValue.length >= 4 && nameOrEmail.includes(role) ? 'giu' : 'gu';
    const literal = originalValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const match of sanitizedPayload.matchAll(new RegExp(literal, flags))) {
      if (aliases.some(a => a.start <= match.index! && match.index! + match[0].length <= a.end)) continue;
      leaks.push({ source: 'vault_original_leak', reason: `Original value for ${token} remains in payload.`,
        matchedSnippet: match[0] });
      break;
    }
  }
  // Disabling a vault token exempts only that lookup. Independent format checks still run.
  for (const { value, role } of scanDeterministicPii(sanitizedPayload)) {
    if (hardBlockRoles.includes(role) ||
        (role === 'ID_NUMBER' && /^(?:\d{3}-\d{2}-\d{4}|[A-Z][12]\d{8})$/.test(value))) {
      leaks.push({ source: 'regex_pattern_leak', reason: `Raw ${role} pattern remains in payload.`, matchedSnippet: value });
    }
  }
  // Context-anchored names ("represented by Jane Doe", "Acme Corp ("Client")") are blocked even when
  // Nano never saw them, unless the user explicitly un-redacted that exact name.
  const allowedNames = new Set(Array.from(disabledTokens ?? [],
    token => vault.byToken[token]?.originalValue.toLowerCase()).filter(Boolean));
  for (const { value, role } of scanContextualPii(sanitizedPayload)) {
    if (allowedNames.has(value.toLowerCase())) continue;
    if (leaks.some(l => l.matchedSnippet.toLowerCase() === value.toLowerCase())) continue;
    leaks.push({ source: 'regex_pattern_leak', reason: `Unredacted ${role} remains in payload.`, matchedSnippet: value });
  }
  return { passed: leaks.length === 0, checkedAt: new Date().toISOString(), leaks,
    inspectedChars: sanitizedPayload.length };
}
