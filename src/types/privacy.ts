/**
 * Locked TypeScript contract for 3-Layer Local Privacy Airlock & Cross-Document Vault.
 * Shared across Antigravity (UI/Firebase) and Codex (src/core/*).
 */

export type SemanticRole =
  | 'PARTY_CLIENT'
  | 'PARTY_CONTRACTOR'
  | 'PERSON_NAME'
  | 'ORGANIZATION'
  | 'EMAIL'
  | 'PHONE'
  | 'ADDRESS'
  | 'ID_NUMBER'
  | 'BANK_ACCOUNT'
  | 'MONEY_AMOUNT'
  | 'MEDICAL_ID'
  | 'SENSITIVE_DATE'
  | 'SECRET_KEY'
  | 'OTHER_PII';

export type DetectionLayer = 'gemini_nano' | 'deterministic_regex' | 'user_manual';

export interface BoundingBoxNormalized {
  /** Normalized coordinates in [0, 1] relative to image dimensions */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PiiEntity {
  id: string;
  originalValue: string;
  token: string; // e.g. "[PARTY_CLIENT_1]"
  role: SemanticRole;
  layer: DetectionLayer;
  documentId: string;
  enabled: boolean; // User can toggle individual redaction in Privacy Gate
  bbox?: BoundingBoxNormalized;
}

export interface VaultEntry {
  token: string;
  originalValue: string;
  role: SemanticRole;
  firstSeenDocumentId: string;
  occurrences: number;
}

export interface VaultMap {
  /** Maps normalized originalValue (trimmed) -> VaultEntry */
  byOriginal: Record<string, VaultEntry>;
  /** Maps token (e.g. "[PARTY_CLIENT_1]") -> VaultEntry */
  byToken: Record<string, VaultEntry>;
  /** Counter per SemanticRole for deterministic sequential numbering */
  roleCounters: Partial<Record<SemanticRole, number>>;
}

export interface RawNanoEntityCandidate {
  value: string;
  role: SemanticRole;
  bbox?: BoundingBoxNormalized;
}

export interface AirlockResult {
  documentId: string;
  sanitizedText: string;
  entities: PiiEntity[];
  vault: VaultMap;
  stats: {
    totalDetected: number;
    byNano: number;
    byRegex: number;
    rawChars: number;
    sanitizedChars: number;
  };
}

export interface PreFlightLeakMatch {
  reason: string;
  matchedSnippet: string;
  source: 'vault_original_leak' | 'regex_pattern_leak' | 'image_review_required';
}

export interface PreFlightAssertion {
  passed: boolean;
  checkedAt: string;
  leaks: PreFlightLeakMatch[];
  inspectedChars: number;
}

export interface ZeroLeakProof {
  algorithm: 'SHA-256';
  rawContentHash: string;
  sanitizedPayloadHash: string;
  vaultEntriesCount: number;
  preFlightPassed: boolean;
  generatedAt: string;
  /** SHA-256 of each pixel-burned PNG (data URL string) attached to the Stage 4 request. */
  outboundImageHashes?: Array<{ title: string; sha256: string }>;
}

export interface ImageRedactionRegion {
  id: string;
  label: string;
  bbox: BoundingBoxNormalized;
  /** Raw value drawn in this region; when set, the label is resolved live from the Local Vault token. */
  originalValue?: string;
}
