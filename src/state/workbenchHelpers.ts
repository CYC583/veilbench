/**
 * Pure helpers used by the workbench store (no React state). Kept separate so the store file holds only
 * orchestration, and these stay easy to read and test.
 */
import type { DeepAuditResult, WorkbenchDocument } from '../types/audit';
import type { PiiEntity, VaultMap } from '../types/privacy';
import {
  buildDeepAuditPrompt,
  buildRelationalHints,
  formatRelationalHints,
  redactImageRegionsOnCanvas,
  resolveImageRegions,
} from '../core';
import { CloudStageError } from '../services/aiLogicService';
import type { GoldenAuditRecord } from '../data/sampleGoldenAudits';

/** True when a request stopped because the user cancelled it (never shown as an error). */
export function isAbortError(err: unknown): boolean {
  if (err instanceof CloudStageError) return (err.failure.kind as string) === 'aborted';
  const e = err as { name?: string; kind?: string } | null;
  return e?.name === 'AbortError' || e?.kind === 'aborted';
}

/** Strips endpoint URLs and project paths from any non-classified error before it reaches the UI. */
export function toUserSafeMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error) || !err.message) return fallback;
  return err.message
    .replace(/https?:\/\/\S+/g, '[endpoint]')
    .replace(/projects\/[\w-]+/g, 'projects/[id]');
}

/** The exact Stage 4 outbound text: JSON envelope of sanitized docs + locally computed relations. */
export function buildOutboundPayload(docs: WorkbenchDocument[], vault: VaultMap): string {
  return buildDeepAuditPrompt({
    documents: docs.map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      sanitizedText: d.sanitizedText,
      hasBurnedImage: Boolean(d.redactedImageDataUrl),
    })),
    relationalHints: formatRelationalHints(buildRelationalHints(vault)),
    vault,
  });
}

export type AuditPart = 'analysis' | 'playbook';

/** Fills the given Stage 4 halves from a recorded real result, marking them as cached (never silent). */
export function fillFromGolden(base: DeepAuditResult | null, golden: GoldenAuditRecord, parts: AuditPart[]): DeepAuditResult {
  const result: DeepAuditResult = base
    ? { ...base }
    : {
        contradictions: [],
        redlines: [],
        playbook: { executiveSummary: '', counterpartyPushback: [], readyToSendEmailSanitized: '' },
        inferenceSource: 'IN_CLOUD',
        generatedAt: golden.recordedAt,
      };
  if (parts.includes('analysis')) Object.assign(result, golden.analysis);
  if (parts.includes('playbook')) result.playbook = golden.playbook;
  result.cachedParts = Array.from(new Set([...(base?.cachedParts ?? []), ...parts]));
  result.incompleteParts = (result.incompleteParts ?? []).filter((p) => !parts.includes(p));
  if (!result.incompleteParts.length) delete result.incompleteParts;
  result.cacheInfo = {
    recordedAt: golden.recordedAt,
    analysisModel: golden.analysisModel,
    playbookModel: golden.playbookModel,
  };
  return result;
}

export function makeSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function combineDocumentsText(
  docs: WorkbenchDocument[],
  field: 'rawText' | 'sanitizedText'
): string {
  return docs
    .map((d, i) => `=== DOCUMENT ${i + 1}: ${d.title} ===\n${d[field]}`)
    .join('\n\n');
}

/**
 * Burns the document image using regions bound to the current entity toggles.
 * Fails closed: if burning fails, no image is attached to any outbound payload.
 */
export async function burnImageForEntities(
  doc: WorkbenchDocument,
  entities: PiiEntity[]
): Promise<string | undefined> {
  if (!doc.rawImageDataUrl) return undefined;
  // Value-anchored regions plus any boxes Gemini Nano reported for enabled entities.
  const nanoRegions = entities
    .filter((e) => e.enabled && e.bbox)
    .map((e) => ({ id: `nano_${e.id}`, label: e.token, bbox: e.bbox! }));
  const regions = [...resolveImageRegions(doc.imageRegions, entities), ...nanoRegions];
  // Every burn box was explicitly toggled off by the user; Layer 3 still audits the matching text.
  if (regions.length === 0) return doc.rawImageDataUrl;
  try {
    return await redactImageRegionsOnCanvas(doc.rawImageDataUrl, regions);
  } catch {
    return undefined;
  }
}

export function collectDisabledTokens(entitiesByDoc: Record<string, PiiEntity[]>): Set<string> {
  const disabled = new Set<string>();
  const enabled = new Set<string>();
  for (const list of Object.values(entitiesByDoc)) {
    for (const ent of list) {
      if (ent.enabled) enabled.add(ent.token);
      else disabled.add(ent.token);
    }
  }
  for (const token of enabled) {
    disabled.delete(token);
  }
  return disabled;
}

