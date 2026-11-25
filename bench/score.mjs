import { runLocalAirlock } from '../src/core/piiShield.ts';
import { assertPayloadZeroLeak } from '../src/core/preFlightGuard.ts';
import { buildDeepAuditPrompt, DEEP_AUDIT_TASK_ANALYSIS, DEEP_AUDIT_TASK_PLAYBOOK } from '../src/core/outboundEnvelope.ts';

export function score(doc, nanoCandidates = []) {
  const { vault, sanitizedText } = runLocalAirlock({ documentId: doc.id, rawText: doc.text, nanoCandidates });
  const base = buildDeepAuditPrompt({ documents: [{ id: doc.id, title: doc.id, category: 'contract', sanitizedText, hasBurnedImage: false }], relationalHints: '', vault });
  const payloads = [DEEP_AUDIT_TASK_ANALYSIS, DEEP_AUDIT_TASK_PLAYBOOK].map(task => base + '\n\n' + task);
  const guarded = payloads.filter(payload => assertPayloadZeroLeak(payload, vault).passed);
  const countLeaks = candidates => doc.expected.filter(value => candidates.some(payload => payload.toLowerCase().includes(value.toLowerCase()))).length;
  return { id: doc.id, total: doc.expected.length, missed: countLeaks(payloads), guardedMissed: countLeaks(guarded), blockedParts: 2 - guarded.length };
}

export function sum(rows, field) {
  return rows.reduce((n, row) => n + row[field], 0);
}
