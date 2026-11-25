import type {
  AirlockResult, BoundingBoxNormalized, DetectionLayer, PiiEntity, RawNanoEntityCandidate,
  SemanticRole, VaultEntry, VaultMap,
} from '../types/privacy';

const roles: readonly SemanticRole[] = [
  'PARTY_CLIENT', 'PARTY_CONTRACTOR', 'PERSON_NAME', 'ORGANIZATION', 'EMAIL', 'PHONE', 'ADDRESS',
  'ID_NUMBER', 'BANK_ACCOUNT', 'MONEY_AMOUNT', 'MEDICAL_ID', 'SENSITIVE_DATE', 'SECRET_KEY', 'OTHER_PII',
];

const aliasPattern = new RegExp(`\\[(?:${roles.join('|')})_[1-9]\\d*\\]`, 'g');

export function findAliases(text: string) {
  return text.matchAll(aliasPattern);
}

export function createEmptyVault(): VaultMap {
  return { byOriginal: Object.create(null), byToken: Object.create(null), roleCounters: {} };
}

function readBox(value: unknown): BoundingBoxNormalized | undefined {
  if (!value || typeof value !== 'object') return;
  const { x, y, width, height } = value as BoundingBoxNormalized;
  if ([x, y, width, height].every(Number.isFinite) && width > 0 && height > 0) {
    return { x, y, width, height };
  }
}

export function parseNanoEntitiesDefensive(rawOutput: string): RawNanoEntityCandidate[] {
  if (typeof rawOutput !== 'string') return [];
  let start = 0;
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < rawOutput.length; i++) {
    const char = rawOutput[i];
    if (depth === 0) {
      if (char !== '[' && char !== '{') continue;
      start = i;
      depth = 1;
    } else if (quoted && char === '\\') {
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted) {
      if (char === '[' || char === '{') depth++;
      if (char === ']' || char === '}') depth--;
      if (depth === 0) {
        const candidates = parseCandidateList(rawOutput.slice(start, i + 1));
        if (candidates.length) return candidates;
      }
    }
  }
  return [];
}

function parseCandidateList(fragment: string): RawNanoEntityCandidate[] {
  try {
    // Consume whole JSON strings so comma repair never changes a quoted original value.
    const json = fragment.replace(/"(?:\\.|[^"\\])*"|,(?=\s*[}\]])/g,
      match => match === ',' ? '' : match);
    const parsed = JSON.parse(json);
    const items = Array.isArray(parsed) ? parsed : parsed?.entities ?? [parsed];
    if (!Array.isArray(items)) return [];
    return items.flatMap(item => {
      const value = typeof item?.value === 'string' ? item.value.trim() : '';
      if (value.length < 2) return [];
      const role = typeof item.role === 'string' ? item.role.trim().toUpperCase().replace(/[-\s]+/g, '_') : '';
      const bbox = readBox(item.bbox);
      return [{ value, role: roles.includes(role) ? role : 'OTHER_PII', ...(bbox && { bbox }) }];
    });
  } catch {
    return [];
  }
}

// Capture group 1, when present, isolates the sensitive value from its context label.
const patterns: ReadonlyArray<[SemanticRole, RegExp]> = [
  ['EMAIL', /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,63}\b/gi],
  ['SECRET_KEY', /\b(?:sk-[\w-]{8,}|AIza[\w-]{12,}|ghp_[A-Za-z0-9]{8,})/g],
  ['MEDICAL_ID', /\bMRN-\d{4,}\b/gi],
  ['ID_NUMBER', /\b(?:\d{3}-\d{2}-\d{4}|[A-Z][12]\d{8}|[A-Z]{1,2}\d{7,8}|INV-\d{4}-\d{3,})\b/g],
  ['BANK_ACCOUNT', /\b[A-Z]{2}\d{2}(?:[A-Z0-9]{11,30}|(?:[ -][A-Z0-9]{4}){2,7}(?:[ -][A-Z0-9]{1,4})?)\b/g],
  ['BANK_ACCOUNT', /\b(?:acct|account|routing)(?:\s+(?:number|no\.?))?[ \t]*[:#]?[ \t]*(\d(?:[ -]?\d){7,17})\b/gi],
  ['BANK_ACCOUNT', /(?<!\d)\b\d{4}(?:[ -]?\d{4}){3}\b(?!\d)/g],
  // Horizontal whitespace only: a trailing "USD" must never swallow the next line's list number.
  ['MONEY_AMOUNT', /(?:NT\$|US\$|[$€£¥]|\b(?:USD|TWD|EUR|GBP))[ \t]*\d+(?:,\d{3})*(?:\.\d+)?/gi],
  ['OTHER_PII', /(?<![\w.])(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}(?!\w|\.\d)/g],
  ['SENSITIVE_DATE', /\b(?:DOB|(?:date of )?birth(?:\s*date)?)\s*[:=]?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{4})\b/gi],
  // Calendar dates are HIPAA Safe Harbor identifiers; T-6 relational hints keep their ordering for the cloud.
  ['SENSITIVE_DATE', /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?[ \t]+\d{1,2},[ \t]*\d{4}\b/g],
  ['SENSITIVE_DATE', /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g],
  ['ADDRESS', /\b\d{1,6}[ \t]+(?:[A-Z][a-z]+[ \t]+){1,4}(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Lane|Ln|Dr|Drive|Way|Ct|Court)\.?(?:,[ \t]*(?:Apt|Suite|Ste|Unit)\.?[ \t]*\w+)?(?:,[ \t]*[A-Z][a-zA-Z .]+)?(?:,[ \t]*[A-Z]{2}[ \t]+\d{5}(?:-\d{4})?)?/g],
  ['ID_NUMBER', /\b(?:Q|PO|SOW)-\d{4}-\d{2,}\b/g],
  ['PHONE', /(?<![\w+])(?:\+\d{1,3}[ .-]?(?:\(\d{1,4}\)|\d{1,4})(?:[ .-]?\d){5,10}|(?:\(\d{3}\)[ .-]?|\d{3}[ .-])\d{3}[ .-]\d{4}|(?:\(0[2-8]\) ?|0[2-8]-)\d{3,4}-\d{4}|09\d{2}[- ]?\d{3}[- ]?\d{3})\b/g],
];

export function scanDeterministicPii(text: string): RawNanoEntityCandidate[] {
  const candidates: RawNanoEntityCandidate[] = [];
  for (const [role, pattern] of patterns) {
    for (const match of text.matchAll(pattern)) candidates.push({ role, value: match[1] ?? match[0] });
  }
  return candidates;
}

// Layer 2b: contextual rules that find parties, people and organizations without Gemini Nano.
// Order matters: defined-term party roles win over generic PERSON_NAME / ORGANIZATION labels.
const capWord = `[A-Z][\\w&'.-]*`;
const personName = `[A-Z][a-z'-]+(?:[ \\t]+[A-Z]\\.)?(?:[ \\t]+[A-Z][a-z'-]+){1,2}`;
const orgSuffix = `(?:LLC|L\\.L\\.C\\.|Inc\\.?|INC\\.?|Incorporated|Ltd\\.?|LTD\\.?|Limited|Corp\\.?|CORP\\.?|Corporation|GmbH|PLC|LLP)`;
const contextualPatterns: ReadonlyArray<[SemanticRole, RegExp]> = [
  ['PARTY_CLIENT', new RegExp(`(${capWord}(?:[ \\t]+${capWord}){0,5})[ \\t]*\\([ \\t]*["“](?:Client|Customer|Company|Buyer|Licensee)["”]`, 'g')],
  ['PARTY_CONTRACTOR', new RegExp(`(${capWord}(?:[ \\t]+${capWord}){0,5})[ \\t]*\\([ \\t]*["“](?:Contractor|Consultant|Vendor|Supplier|Provider|Licensor|Seller)["”]`, 'g')],
  ['PERSON_NAME', new RegExp(`\\b(?:Client Representative|Representative|represented by|Contractor|Patient|Account Owner|Attention|Attn|Ordering (?:MD|Physician)|[Ss]igned by|[Pp]repared for)[ \\t]*:?[ \\t]+(?:Dr\\.[ \\t]+)?(${personName})`, 'g')],
  ['PERSON_NAME', new RegExp(`\\bDr\\.[ \\t]+(${personName.replace('{1,2}', '{0,2}')})`, 'g')],
  ['ORGANIZATION', new RegExp(`\\b([A-Z][A-Za-z&'-]*(?:[ \\t]+[A-Z][A-Za-z&'-]*){0,4}[ \\t]+${orgSuffix})(?![A-Za-z])`, 'g')],
  // Labeled street addresses: the value must contain a digit and ends at a column separator or line end.
  ['ADDRESS', /\b(?:Address|Addr\.|Residence|Mailing Address)[ \t]*:[ \t]*([^\n|]*?\d[^\n|]*?)(?=[ \t]*(?:\||\n|$))/g],
];

/** Context-anchored names, parties and organizations (case-insensitive equivalence is handled by locate). */
export function scanContextualPii(text: string): RawNanoEntityCandidate[] {
  const candidates: RawNanoEntityCandidate[] = [];
  const seen = new Set<string>();
  for (const [role, pattern] of contextualPatterns) {
    for (const match of text.matchAll(pattern)) {
      const value = (match[1] ?? match[0]).trim();
      const key = value.toLowerCase();
      // Already-tokenized text (e.g. "Address: [ADDRESS_1]") is never a fresh finding.
      if (value.length < 3 || value.includes('[') || seen.has(key)) continue;
      seen.add(key);
      candidates.push({ role, value });
    }
  }
  return candidates;
}

const caseInsensitiveRoles: readonly SemanticRole[] = ['EMAIL', 'PERSON_NAME', 'PARTY_CLIENT', 'PARTY_CONTRACTOR', 'ORGANIZATION'];

/** Names, parties and emails of 4+ chars also match all-caps / lower-case variants (e.g. document headers). */
export function matchesCaseInsensitively(role: SemanticRole, value: string): boolean {
  return value.length >= 4 && caseInsensitiveRoles.includes(role);
}

/** Every distinct casing of `value` that occurs in `text` (case-insensitive scan, exact slices). */
export function casingsInText(text: string, value: string): string[] {
  const needle = value.toLowerCase();
  if (!needle || needle.length !== value.length) return [];
  const lowered = text.toLowerCase();
  if (lowered.length !== text.length) return [];
  const found = new Set<string>();
  for (let at = lowered.indexOf(needle); at >= 0; at = lowered.indexOf(needle, at + 1)) {
    found.add(text.slice(at, at + value.length));
  }
  return [...found];
}

interface Span<T> { start: number; end: number; candidate: T }

// Claim longest literal spans first, even when a shorter value starts earlier.
// Matching the original buffer also avoids interpreting '$' or re-scanning generated aliases.
function locate<T extends { value: string; role?: SemanticRole }>(text: string, candidates: T[]): Span<T>[] {
  const occupied = new Uint8Array(text.length);
  const spans: Span<T>[] = [];
  // Lower-casing must preserve offsets; otherwise fall back to exact matching for safety.
  const lowered = text.toLowerCase();
  const foldable = lowered.length === text.length;
  for (const candidate of [...candidates].sort((a, b) => b.value.length - a.value.length)) {
    const { value, role } = candidate;
    if (!value) continue;
    const fold = foldable && role !== undefined && matchesCaseInsensitively(role, value)
      && value.toLowerCase().length === value.length;
    const haystack = fold ? lowered : text;
    const needle = fold ? value.toLowerCase() : value;
    let start = haystack.indexOf(needle);
    while (start >= 0) {
      const end = start + needle.length;
      if (!occupied.subarray(start, end).includes(1)) {
        occupied.fill(1, start, end);
        spans.push({ start, end, candidate });
        start = haystack.indexOf(needle, end);
      } else {
        start = haystack.indexOf(needle, start + 1);
      }
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

function substitute<T>(text: string, spans: Span<T>[], token: (candidate: T) => string): string {
  const pieces: string[] = [];
  let end = 0;
  for (const span of spans) {
    pieces.push(text.slice(end, span.start), token(span.candidate));
    end = span.end;
  }
  return pieces.join('') + text.slice(end);
}

interface Candidate extends RawNanoEntityCandidate { layer: DetectionLayer }

export function runLocalAirlock(params: {
  documentId: string; rawText: string; nanoCandidates?: RawNanoEntityCandidate[]; existingVault?: VaultMap;
}): AirlockResult {
  const { documentId, rawText, nanoCandidates = [], existingVault } = params;
  const vault = createEmptyVault();
  const candidates = new Map<string, Candidate>();
  if (existingVault) {
    Object.assign(vault.roleCounters, existingVault.roleCounters);
    for (const entry of Object.values(existingVault.byOriginal)) {
      vault.byOriginal[entry.originalValue] = vault.byToken[entry.token] = { ...entry };
      candidates.set(entry.originalValue, { value: entry.originalValue, role: entry.role, layer: 'deterministic_regex' });
    }
  }
  for (const candidate of nanoCandidates) {
    const trimmed = candidate.value.trim();
    if (trimmed.length < 2) continue;
    candidates.set(trimmed, { ...candidate, value: trimmed, layer: 'gemini_nano' });
    // `locate` is literal for short values, so add every other casing that actually occurs in the text
    // ("ada" and "ADA" for "Ada"); each one is vaulted, none is dropped.
    if (!matchesCaseInsensitively(candidate.role, trimmed)) {
      for (const variant of casingsInText(rawText, trimmed)) {
        if (!candidates.has(variant)) candidates.set(variant, { ...candidate, value: variant, layer: 'gemini_nano' });
      }
    }
  }
  for (const candidate of scanDeterministicPii(rawText)) {
    const prior = candidates.get(candidate.value);
    const specificFormat = prior?.role === 'OTHER_PII' || ['EMAIL', 'BANK_ACCOUNT', 'SECRET_KEY', 'MEDICAL_ID'].includes(candidate.role);
    if (!prior || (prior.role !== candidate.role && specificFormat)) {
      candidates.set(candidate.value, { ...prior, ...candidate, layer: 'deterministic_regex' });
    }
  }
  // Contextual names only fill gaps: a Nano or vault entry for the same name (any casing) keeps its role/token.
  const knownNames = new Set(Array.from(candidates.values(),
    c => matchesCaseInsensitively(c.role, c.value) ? c.value.toLowerCase() : c.value));
  for (const candidate of scanContextualPii(rawText)) {
    const key = candidate.value.toLowerCase();
    if (knownNames.has(key) || knownNames.has(candidate.value)) continue;
    knownNames.add(key);
    candidates.set(candidate.value, { ...candidate, layer: 'deterministic_regex' });
  }

  const spans = locate(rawText, [...candidates.values()]);
  const counts = new Map<Candidate, number>();
  for (const { candidate } of spans) counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  for (const candidate of candidates.values()) {
    if (candidate.bbox && !counts.has(candidate)) counts.set(candidate, 1);
  }
  const reserved = new Set(Array.from(findAliases(rawText), match => match[0]));
  const entities: PiiEntity[] = [];
  for (const [candidate, count] of counts) {
    const { value, role, layer, bbox } = candidate;
    let entry: VaultEntry | undefined = vault.byOriginal[value];
    if (!entry) {
      let number = vault.roleCounters[role] ?? 0;
      let token: string;
      do { token = `[${role}_${++number}]`; } while (reserved.has(token) || vault.byToken[token]);
      vault.roleCounters[role] = number;
      entry = { token, role, originalValue: value, firstSeenDocumentId: documentId, occurrences: 0 };
      vault.byOriginal[value] = vault.byToken[token] = entry;
    }
    entry.occurrences += count;
    entities.push({ id: `${documentId}:${entry.token}`, documentId, originalValue: value, token: entry.token,
      role: entry.role, layer, enabled: true, ...(bbox && { bbox: { ...bbox } }) });
  }
  const sanitizedText = substitute(rawText, spans, c => vault.byOriginal[c.value].token);
  const byRegex = entities.filter(e => e.layer === 'deterministic_regex').length;
  return { documentId, sanitizedText, entities, vault, stats: {
    totalDetected: entities.length, byNano: entities.length - byRegex, byRegex,
    rawChars: rawText.length, sanitizedChars: sanitizedText.length,
  } };
}

export function applyRedactionWithToggles(rawText: string, entities: PiiEntity[]): string {
  const active = entities.filter(e => e.enabled).map(e => ({ value: e.originalValue, token: e.token, role: e.role }));
  return substitute(rawText, locate(rawText, active), e => e.token);
}

/**
 * Replaces every value already in the vault (and any fresh deterministic/contextual finding) with its
 * token. Used for metadata such as document titles, which never pass through the per-document airlock.
 */
export function redactWithVault(text: string, vault: VaultMap): string {
  return runLocalAirlock({ documentId: 'metadata', rawText: text, existingVault: vault }).sanitizedText;
}

export function rehydrateText(sanitizedText: string, vault: VaultMap): string {
  return sanitizedText.replace(/\[[^\[\]]+\]/g, token => vault.byToken[token]?.originalValue ?? token);
}
