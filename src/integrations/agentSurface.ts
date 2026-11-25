/**
 * A10 + A11 · Entry points for other software on the user's machine.
 *
 * - Chrome extension intake (A10): the VeilBench extension posts a selected text to this page with
 *   window.postMessage({ type: 'veilbench.intake.v1', title, text }). The page only accepts messages
 *   from its own window (not iframes or other tabs), validates size, and runs the normal local airlock.
 *   Nothing is sent to the cloud until the user asks for a decision.
 * - WebMCP tools (A11): a browser agent can ask VeilBench to tokenize a contract and read the decision.
 *   Tool results contain tokens only — never the raw names or numbers the vault holds.
 */
import { runLocalAirlock } from '../core';
import type { DecisionCard } from '../core/decisionCard';

export const INTAKE_MESSAGE = 'veilbench.intake.v1';
export const READY_MESSAGE = 'veilbench.ready.v1';
export const MAX_INTAKE_CHARS = 200_000;

export interface IntakeDocument {
  title: string;
  text: string;
}

/** Strict validation of an intake message; anything unexpected is ignored. */
export function parseIntakeMessage(data: unknown): IntakeDocument | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.type !== INTAKE_MESSAGE || typeof d.text !== 'string') return null;
  const text = d.text.trim();
  if (!text || text.length > MAX_INTAKE_CHARS) return null;
  const rawTitle = typeof d.title === 'string' ? d.title.trim() : '';
  const title = (rawTitle || 'From browser selection').slice(0, 120);
  return { title: title.endsWith('.txt') ? title : `${title}.txt`, text };
}

/** Value-free summary of the decision for agents: verdict, rule, counts and tokens, never amounts. */
export function describeDecisionForAgent(card: DecisionCard | null): Record<string, unknown> {
  if (!card) return { status: 'no_decision_yet', hint: 'Call veilbench_check_contract, then ask the user to run the decision.' };
  return {
    status: 'ok',
    basis: card.basis,
    verdict: card.verdict,
    rule: card.rule,
    findings: card.counts,
    moneyGap: card.gap
      ? { between: [card.gap.a, card.gap.b], relation: card.gap.diff > 0 ? 'gt' : 'lt', exactValueShownOnDeviceOnly: true }
      : null,
    clausesToFix: card.clausesToFix.map(c => ({ title: c.title, severity: c.severity })),
  };
}

interface ModelContextLike {
  registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => Promise<void> | void;
}

function getModelContext(): ModelContextLike | null {
  const mc = (document as unknown as { modelContext?: ModelContextLike }).modelContext;
  return mc && typeof mc.registerTool === 'function' ? mc : null;
}

/**
 * Registers the WebMCP tools when the browser supports them (Chrome origin trial). Returns an
 * unregister function; a no-op where WebMCP is unavailable.
 */
export function registerWebMcpTools(params: {
  addDocument: (doc: IntakeDocument) => void;
  getDecision: () => DecisionCard | null;
}): () => void {
  const mc = getModelContext();
  if (!mc) return () => {};
  const controller = new AbortController();
  const tools = [
    {
      name: 'veilbench_check_contract',
      description:
        'Adds a contract or quote to the VeilBench workbench. Personal data is replaced with tokens on this device. '
        + 'Returns only the tokenized text, never the original names or numbers.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Document title, e.g. "Client quote".' },
          text: { type: 'string', description: 'Full text of the contract or quote.' },
        },
        required: ['text'],
      },
      annotations: { untrustedContentHint: true },
      execute: async (input: { title?: unknown; text?: unknown }) => {
        const doc = parseIntakeMessage({ type: INTAKE_MESSAGE, title: input?.title, text: input?.text });
        if (!doc) return 'Rejected: provide non-empty "text" up to 200,000 characters.';
        const { sanitizedText, stats } = runLocalAirlock({ documentId: 'webmcp_preview', rawText: doc.text });
        params.addDocument(doc);
        return JSON.stringify({ status: 'added', tokenizedText: sanitizedText, identifiersReplaced: stats.totalDetected });
      },
    },
    {
      name: 'veilbench_get_decision',
      description:
        'Returns the current sign-or-fix decision for the documents in the VeilBench workbench, with tokens instead of '
        + 'private values. The exact money gap is only shown to the user on this device.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => JSON.stringify(describeDecisionForAgent(params.getDecision())),
    },
  ];
  for (const tool of tools) {
    try {
      void Promise.resolve(mc.registerTool(tool, { signal: controller.signal })).catch(() => {});
    } catch {
      // WebMCP is an origin trial; never let it break the app.
    }
  }
  return () => controller.abort();
}
