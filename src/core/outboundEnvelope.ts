/**
 * The exact outbound text for Stage 4. One pure function builds it so the Payload Inspector shows,
 * the SHA-256 proof hashes, Layer 3 audits, and Firebase AI Logic sends the *same* string.
 */
import type { DocumentCategory } from '../types/audit';
import type { VaultMap } from '../types/privacy';
import { redactWithVault } from './piiShield';

export interface OutboundDocumentInput {
  id: string;
  title: string;
  category: DocumentCategory;
  sanitizedText: string;
  hasBurnedImage: boolean;
}

export const OUTBOUND_SCHEMA_VERSION = 'veilbench.outbound.v1';

export const DEEP_AUDIT_INSTRUCTIONS = [
  'You are an elite legal, clinical, and financial document auditor.',
  'All sensitive PII has been replaced with semantic role tokens such as [PARTY_CLIENT_1], [PARTY_CONTRACTOR_1], [MONEY_AMOUNT_1].',
  'NEVER invent real names or amounts—always preserve the exact placeholder tokens so the user browser can re-hydrate them locally.',
  'Complete ONLY the TASK given after the envelope. Be concise: long answers are cut off.',
].join('\n');

/**
 * Stage 4 runs as two short, parallel calls over the SAME envelope (long single generations were being
 * shed by the cloud under load). The suffixes are fixed instructions that carry no document data.
 */
export const DEEP_AUDIT_TASK_ANALYSIS = [
  'TASK A — Return JSON with:',
  '"contradictions": every cross-document conflict (use the locally computed relations; cite tokens, never guess values);',
  '"redlines": up to 3 surgical clause rewrites that protect the USER\'s interests (in a contract, the contractor [PARTY_CONTRACTOR_1]; otherwise the person or account owner reviewing the documents).',
  'NEVER propose conceding to a lower fee, worse payment terms, or harsher counterparty schedule—always rewrite clauses to enforce the user-favorable terms and cap/remove toxic traps (e.g., unlimited liability, excessive non-compete, punitive penalties) so redlines match the negotiation playbook.',
  'Keep every string under 60 words.',
].join('\n');

export const DEEP_AUDIT_TASK_PLAYBOOK = [
  'TASK B — Return JSON with:',
  '"executiveSummary": under 80 words;',
  '"counterpartyPushback": exactly 2 items, each field under 50 words;',
  '"readyToSendEmailSanitized": a polite, firm email under 160 words that keeps placeholder tokens and writes',
  'money differences as {{DIFF:[TOKEN_A]-[TOKEN_B]}}.',
  'Perspective: the USER is the person reviewing these documents — in a contract, the contractor',
  '([PARTY_CONTRACTOR_1]); otherwise the person or account owner the documents are about. Write the email FROM',
  'the user TO the counterparty or its representative, argue for the user\'s interests, and sign it with the',
  'user\'s token (e.g. [PARTY_CONTRACTOR_1]) — never with the counterparty\'s token.',
].join('\n');

/** Deterministic JSON envelope (fixed key order) followed by the locally computed relations. */
export function buildDeepAuditPrompt(params: {
  documents: OutboundDocumentInput[];
  relationalHints: string;
  /** Titles are user metadata (file names often embed quote numbers or names) and are tokenized too. */
  vault: VaultMap;
}): string {
  const envelope = {
    schema: OUTBOUND_SCHEMA_VERSION,
    task: params.documents.length > 1 ? 'cross_doc_contradiction' : 'deep_redline_audit',
    documents: params.documents.map((d, idx) => ({
      index: idx + 1,
      title: redactWithVault(d.title, params.vault),
      category: d.category,
      attachedImage: d.hasBurnedImage ? 'pixel-burned PNG (attached separately)' : null,
      sanitizedText: d.sanitizedText,
    })),
  };
  return [
    DEEP_AUDIT_INSTRUCTIONS,
    '',
    'SANITIZED DOCUMENT ENVELOPE (JSON):',
    JSON.stringify(envelope, null, 2),
    ...(params.relationalHints ? ['', params.relationalHints] : []),
  ].join('\n');
}
