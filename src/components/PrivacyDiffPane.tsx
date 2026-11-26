import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  Lock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SquareDashedMousePointer,
  Undo2,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { ImageRegionDrawer } from './ImageRegionDrawer';
import type {
  BoundingBoxNormalized,
  PiiEntity,
  PreFlightAssertion,
  SemanticRole,
  VaultMap,
  ZeroLeakProof,
} from '../types/privacy';
import type { SupportedLocale, WorkbenchDocument } from '../types/audit';
import { resolveImageRegions } from '../core';
import { UI, translator } from '../i18n/ui';

interface PrivacyDiffPaneProps {
  document: WorkbenchDocument;
  totalDocuments: number;
  entities: PiiEntity[];
  vault: VaultMap;
  preFlight: PreFlightAssertion | null;
  zeroLeakProof: ZeroLeakProof | null;
  isBusy: boolean;
  isOnline: boolean;
  /** Chrome Gemini Nano is ready; otherwise Stage 2 honestly reports the cloud fallback. */
  nanoAvailable?: boolean;
  locale: SupportedLocale;
  onToggleEntity: (docId: string, entityId: string) => void;
  /** Human-in-the-loop: always mask a word the detectors missed. */
  onAddCustomTerm?: (value: string, role: SemanticRole) => Promise<'added' | 'too_short' | 'not_found'>;
  onSetImageReviewed?: (docId: string, reviewed: boolean) => void;
  onAddManualRegion?: (docId: string, bbox: BoundingBoxNormalized) => void;
  onUndoManualRegion?: (docId: string) => void;
  onOpenInspector: () => void;
  onRunRapidTriage: () => void;
  onRunDeepAudit: () => void;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlightedRaw(text: string, entities: PiiEntity[]) {
  const activeEntities = entities
    .filter((e) => e.enabled && e.originalValue.length >= 2)
    .sort((a, b) => b.originalValue.length - a.originalValue.length);

  if (activeEntities.length === 0) {
    return <span>{text}</span>;
  }

  const pattern = new RegExp(
    `(${activeEntities.map((e) => escapeRegExp(e.originalValue)).join('|')})`,
    'g'
  );
  const parts = text.split(pattern);
  const matchedValues = new Set(activeEntities.map((e) => e.originalValue));

  return parts.map((part, idx) => {
    if (matchedValues.has(part)) {
      return (
        <mark
          key={idx}
          className="rounded border border-[#BE123C]/30 bg-[#FFF1F2] px-1 py-0.5 font-mono text-[12px] font-medium text-[#BE123C]"
        >
          {part}
        </mark>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function renderHighlightedSanitized(text: string) {
  const parts = text.split(/(\[[A-Z_]+_\d+\])/g);
  return parts.map((part, idx) => {
    if (/^\[[A-Z_]+_\d+\]$/.test(part)) {
      return (
        <span
          key={idx}
          className="inline-block rounded border border-[#0F766E]/30 bg-[#F0FDFA] px-1 py-0.5 font-mono text-[12px] font-medium text-[#0F766E]"
        >
          {part}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export function PrivacyDiffPane({
  document: doc,
  totalDocuments,
  entities,
  vault,
  preFlight,
  zeroLeakProof,
  isBusy,
  isOnline,
  nanoAvailable = false,
  locale,
  onToggleEntity,
  onAddCustomTerm,
  onSetImageReviewed,
  onAddManualRegion,
  onUndoManualRegion,
  onOpenInspector,
  onRunRapidTriage,
  onRunDeepAudit,
}: PrivacyDiffPaneProps) {
  const t = translator(locale);
  const [drawingBoxes, setDrawingBoxes] = useState(false);
  const [mobilePane, setMobilePane] = useState<'raw' | 'safe'>('safe');
  const [zoomImage, setZoomImage] = useState(false);
  const [customTerm, setCustomTerm] = useState('');
  const [customRole, setCustomRole] = useState<SemanticRole>('PERSON_NAME');
  const [customStatus, setCustomStatus] = useState<'added' | 'too_short' | 'not_found' | null>(null);
  const submitCustomTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddCustomTerm) return;
    const result = await onAddCustomTerm(customTerm, customRole);
    setCustomStatus(result);
    if (result === 'added') setCustomTerm('');
  };
  const manualRegions = (doc.imageRegions ?? []).filter((r) => r.id.startsWith('manual_'));
  const enabledCount = entities.filter((e) => e.enabled).length;
  const vaultSize = Object.keys(vault.byOriginal).length;
  const passed = Boolean(preFlight?.passed);

  return (
    <section className="rounded-lg border border-[#E2E5EA] bg-[#FFFFFF]">
      {/* Airlock Header & 3-Layer Defense Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E5EA] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-[14px] font-semibold tracking-[-0.02em] text-[#141518]">
            <Lock className="h-4 w-4 text-[#0F766E]" />
            <span>{t(UI.privacyDiff.title)}</span>
          </div>

          <span className="rounded border border-[#E2E5EA] bg-[#F8F9FA] px-2 py-0.5 font-mono text-[11px] text-[#5C626E]">
            {t(UI.privacyDiff.sharedVault(vaultSize))}
          </span>

          {passed ? (
            <span className="inline-flex items-center gap-1 rounded border border-[#0F766E]/30 bg-[#F0FDFA] px-2 py-0.5 font-mono text-[11px] font-medium text-[#0F766E]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{t(UI.privacyDiff.preflightPass)}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded border border-[#BE123C]/30 bg-[#FFF1F2] px-2 py-0.5 font-mono text-[11px] font-medium text-[#BE123C]">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>
                {t(UI.privacyDiff.leakDetected(preFlight?.leaks.length ?? 0))}
              </span>
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenInspector}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-3 py-1.5 text-[12px] font-medium text-[#141518] transition-colors hover:border-[#0F766E]/60 hover:text-[#0F766E] active:translate-y-px"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{t(UI.privacyDiff.inspectPayload)}</span>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={onRunRapidTriage}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-[#0F766E]/40 bg-[#F0FDFA] px-3 py-1.5 text-[12px] font-medium text-[#0F766E] transition-colors hover:bg-[#CCFBF1]/60 active:translate-y-px disabled:opacity-50"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>
              {nanoAvailable ? t(UI.privacyDiff.stage2Nano) : t(UI.privacyDiff.stage2Cloud)}
            </span>
          </button>

          <button
            type="button"
            disabled={isBusy || !passed}
            onClick={onRunDeepAudit}
            title={
              !passed ? t(UI.privacyDiff.blockedByBreaker) : t(UI.privacyDiff.sendSanitized)
            }
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md bg-[#0F766E] px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#0D655E] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>
              {totalDocuments > 1 ? t(UI.privacyDiff.stage4Multi(totalDocuments)) : t(UI.privacyDiff.stage4Single)}
            </span>
            {!isOnline && (
              <span className="rounded bg-white/15 px-1 font-mono text-[10px]">
                {t(UI.privacyDiff.offline)}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Interactive PII Entity Control Bar (Human-in-the-Loop Privacy Gate) */}
      <div className="border-b border-[#E2E5EA] bg-[#F8F9FA] px-4 py-2.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-[11px] font-medium uppercase tracking-wider text-[#5C626E]">
            {t(UI.privacyDiff.toggleRedactions(enabledCount, entities.length))}
          </span>
          {entities.length === 0 ? (
            <span className="text-[12px] text-[#5C626E]">
              {t(UI.privacyDiff.noEntities)}
            </span>
          ) : (
            entities.map((ent) => (
              <button
                key={ent.id}
                type="button"
                onClick={() => onToggleEntity(doc.id, ent.id)}
                title={t(UI.privacyDiff.entityTitle(ent.layer, ent.originalValue))}
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] transition-all active:translate-y-px ${
                  ent.enabled
                    ? 'border-[#0F766E]/35 bg-[#F0FDFA] text-[#0F766E]'
                    : 'border-[#BE123C]/40 bg-[#FFF1F2] text-[#BE123C] line-through'
                }`}
              >
                <span>{ent.token}</span>
                <span className="text-[10px] opacity-70">
                  {ent.layer === 'gemini_nano' ? 'Nano' : ent.layer === 'user_manual' ? t(UI.privacyDiff.manual) : 'Regex'}
                </span>
              </button>
            ))
          )}
        </div>
        {onAddCustomTerm && (
          <form onSubmit={(e) => void submitCustomTerm(e)} className="mt-2 flex flex-wrap items-center gap-1.5">
            <label htmlFor="custom-term" className="font-mono text-[11px] uppercase tracking-wider text-[#5C626E]">
              {t(UI.privacyDiff.missedTerm)}
            </label>
            <input
              id="custom-term"
              value={customTerm}
              onChange={(e) => {
                setCustomTerm(e.target.value);
                setCustomStatus(null);
              }}
              placeholder={t(UI.privacyDiff.termPlaceholder)}
              className="min-h-[36px] min-w-0 flex-1 rounded border border-[#E2E5EA] bg-[#FFFFFF] px-2.5 text-[12.5px] text-[#141518] sm:max-w-[320px]"
            />
            <select
              aria-label={t(UI.privacyDiff.typeLabel)}
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value as SemanticRole)}
              className="min-h-[36px] rounded border border-[#E2E5EA] bg-[#FFFFFF] px-2 text-[12.5px] text-[#141518]"
            >
              <option value="PERSON_NAME">{t(UI.privacyDiff.rolePerson)}</option>
              <option value="ORGANIZATION">{t(UI.privacyDiff.roleOrganization)}</option>
              <option value="ADDRESS">{t(UI.privacyDiff.roleAddress)}</option>
              <option value="OTHER_PII">{t(UI.privacyDiff.roleOther)}</option>
            </select>
            <button
              type="submit"
              disabled={isBusy || customTerm.trim().length < 2}
              className="min-h-[36px] rounded border border-[#0F766E]/40 bg-[#FFFFFF] px-3 text-[12.5px] font-medium text-[#0F766E] disabled:opacity-50"
            >
              {t(UI.privacyDiff.maskIt)}
            </button>
            {customStatus && (
              <span role="status" className={`text-[12px] ${customStatus === 'added' ? 'text-[#0F766E]' : 'text-[#BE123C]'}`}>
                {customStatus === 'added'
                  ? t(UI.privacyDiff.statusAdded)
                  : customStatus === 'not_found'
                    ? t(UI.privacyDiff.statusNotFound)
                    : t(UI.privacyDiff.statusTooShort)}
              </span>
            )}
          </form>
        )}
      </div>

      {/* Multimodal Canvas Pixel Burn-In Comparison (when image scan is present) */}
      {doc.rawImageDataUrl && (
        <div className="grid grid-cols-1 divide-y divide-[#E2E5EA] border-b border-[#E2E5EA] md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[#BE123C]">
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>{t(UI.privacyDiff.originalScan)}</span>
              </span>
              <span className="font-mono text-[10px] text-[#5C626E]">{t(UI.privacyDiff.rawImageType)}</span>
            </div>
            <div className="overflow-hidden rounded border border-[#E2E5EA] bg-[#F8F9FA]">
              <ImageRegionDrawer
                src={doc.rawImageDataUrl}
                alt={t(UI.privacyDiff.originalScanAlt(doc.title))}
                manualRegions={manualRegions.map((r) => r.bbox)}
                drawing={drawingBoxes}
                onAddRegion={(bbox) => onAddManualRegion?.(doc.id, bbox)}
              />
            </div>
            {onAddManualRegion && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={drawingBoxes}
                  onClick={() => setDrawingBoxes((v) => !v)}
                  className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium sm:min-h-[32px] ${
                    drawingBoxes
                      ? 'border-[#0F766E] bg-[#F0FDFA] text-[#0F766E]'
                      : 'border-[#E2E5EA] bg-[#FFFFFF] text-[#141518] hover:border-[#0F766E]/60'
                  }`}
                >
                  <SquareDashedMousePointer className="h-3.5 w-3.5" />
                  <span>
                    {drawingBoxes ? t(UI.privacyDiff.doneDrawing) : t(UI.privacyDiff.drawBox)}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={manualRegions.length === 0}
                  onClick={() => onUndoManualRegion?.(doc.id)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-3 py-1.5 text-[12px] font-medium text-[#141518] disabled:opacity-40 sm:min-h-[32px]"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  <span>{t(UI.privacyDiff.undo(manualRegions.length))}</span>
                </button>
                {drawingBoxes && (
                  <span className="text-[12px] text-[#5C626E]">
                    {t(UI.privacyDiff.drawHint)}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[#0F766E]">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>{t(UI.privacyDiff.burnedImage)}</span>
              </span>
              <span className="font-mono text-[10px] text-[#0F766E]">
                {t(UI.privacyDiff.regionsBurned(resolveImageRegions(doc.imageRegions, entities).length))}
              </span>
            </div>
            <div className="overflow-hidden rounded border border-[#0F766E]/30 bg-[#F8F9FA]">
              {doc.redactedImageDataUrl ? (
                <button
                  type="button"
                  onClick={() => setZoomImage(true)}
                  className="block w-full cursor-zoom-in"
                  aria-label={t(UI.privacyDiff.viewBurnedFull)}
                >
                  <img
                    src={doc.redactedImageDataUrl}
                    alt={t(UI.privacyDiff.safeImageAlt(doc.title))}
                    className="h-auto w-full object-contain"
                  />
                </button>
              ) : (
                <div className="flex h-48 items-center justify-center text-[12px] text-[#5C626E]">
                  {t(UI.privacyDiff.previewPending)}
                </div>
              )}
            </div>
            {doc.requiresImageReview && (
              <label className="mt-3 flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-md border border-[#B45309]/30 bg-[#FFFBEB] px-3 py-2.5 text-[12.5px] leading-relaxed text-[#141518] sm:min-h-0">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#0F766E]"
                  checked={Boolean(doc.imageReviewed)}
                  onChange={(e) => onSetImageReviewed?.(doc.id, e.target.checked)}
                />
                <span>
                  {t(UI.privacyDiff.reviewConfirm)}
                </span>
              </label>
            )}
          </div>
        </div>
      )}

      {/* D-7: on small screens the two text panes become tabs instead of a very long stack. */}
      <div role="tablist" className="flex gap-1 border-b border-[#E2E5EA] px-4 pt-3 lg:hidden">
        {(['raw', 'safe'] as const).map((pane) => (
          <button
            key={pane}
            type="button"
            role="tab"
            aria-selected={mobilePane === pane}
            onClick={() => setMobilePane(pane)}
            className={`min-h-[44px] flex-1 rounded-t-md border-b-2 px-3 text-[12.5px] font-medium ${
              mobilePane === pane
                ? pane === 'raw'
                  ? 'border-[#BE123C] text-[#BE123C]'
                  : 'border-[#0F766E] text-[#0F766E]'
                : 'border-transparent text-[#5C626E]'
            }`}
          >
            {pane === 'raw' ? t(UI.privacyDiff.tabRaw) : t(UI.privacyDiff.tabOutbound)}
          </button>
        ))}
      </div>

      {/* Split-Pane Text Diff: Left Raw Local vs Right Sanitized Safe Payload */}
      <div className="grid grid-cols-1 divide-y divide-[#E2E5EA] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        {/* Left Pane: Raw Local Document */}
        <div className={`${mobilePane === 'raw' ? 'flex' : 'hidden'} flex-col p-4 sm:p-5 lg:flex`}>
          <div className="mb-2.5 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#BE123C]">
              <Shield className="h-3.5 w-3.5" />
              <span>{t(UI.privacyDiff.rawDocument)}</span>
            </span>
            <span className="font-mono text-[11px] text-[#5C626E]">
              {t(UI.privacyDiff.chars(doc.rawText.length.toLocaleString()))}
            </span>
          </div>
          <div className="max-h-[320px] overflow-y-auto rounded-md border border-[#E2E5EA] bg-[#F8F9FA] p-3.5 text-[13px] leading-[1.65] whitespace-pre-wrap text-[#141518]">
            {renderHighlightedRaw(doc.rawText, entities)}
          </div>
        </div>

        {/* Right Pane: Sanitized Safe Payload */}
        <div className={`${mobilePane === 'safe' ? 'flex' : 'hidden'} flex-col p-4 sm:p-5 lg:flex`}>
          <div className="mb-2.5 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#0F766E]">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{t(UI.privacyDiff.safePayload)}</span>
            </span>
            {zeroLeakProof && (
              <span className="font-mono text-[11px] text-[#5C626E]">
                SHA-256: {zeroLeakProof.sanitizedPayloadHash.slice(0, 12)}…
              </span>
            )}
          </div>
          <div className="max-h-[320px] overflow-y-auto rounded-md border border-[#0F766E]/25 bg-[#FFFFFF] p-3.5 text-[13px] leading-[1.65] whitespace-pre-wrap text-[#141518]">
            {renderHighlightedSanitized(doc.sanitizedText)}
          </div>
        </div>
      </div>
      {zoomImage && doc.redactedImageDataUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t(UI.privacyDiff.burnedDialog)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141518]/80 p-4"
          onClick={() => setZoomImage(false)}
        >
          <img
            src={doc.redactedImageDataUrl}
            alt={t(UI.privacyDiff.safeImageAlt(doc.title))}
            className="max-h-full max-w-full rounded bg-[#FFFFFF] object-contain"
          />
          <button
            type="button"
            onClick={() => setZoomImage(false)}
            className="absolute right-4 top-4 min-h-[44px] rounded-md bg-[#FFFFFF] px-3 text-[13px] font-medium text-[#141518]"
          >
            {t(UI.privacyDiff.close)}
          </button>
        </div>
      )}
    </section>
  );
}
