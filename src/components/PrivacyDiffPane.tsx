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
  VaultMap,
  ZeroLeakProof,
} from '../types/privacy';
import type { SupportedLocale, WorkbenchDocument } from '../types/audit';
import { resolveImageRegions } from '../core';

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
  onSetImageReviewed,
  onAddManualRegion,
  onUndoManualRegion,
  onOpenInspector,
  onRunRapidTriage,
  onRunDeepAudit,
}: PrivacyDiffPaneProps) {
  const isZh = locale === 'zh-TW';
  const [drawingBoxes, setDrawingBoxes] = useState(false);
  const [mobilePane, setMobilePane] = useState<'raw' | 'safe'>('safe');
  const [zoomImage, setZoomImage] = useState(false);
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
            <span>{isZh ? '3 層本機隱私氣閘比對' : '3-Layer Local Privacy Airlock'}</span>
          </div>

          <span className="rounded border border-[#E2E5EA] bg-[#F8F9FA] px-2 py-0.5 font-mono text-[11px] text-[#5C626E]">
            {isZh
              ? `共享金庫：${vaultSize} 個實體`
              : `Shared Vault: ${vaultSize} ${vaultSize === 1 ? 'entity' : 'entities'}`}
          </span>

          {passed ? (
            <span className="inline-flex items-center gap-1 rounded border border-[#0F766E]/30 bg-[#F0FDFA] px-2 py-0.5 font-mono text-[11px] font-medium text-[#0F766E]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{isZh ? '預檢通過 · 零外洩' : 'PRE-FLIGHT ZERO-LEAK PASS'}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded border border-[#BE123C]/30 bg-[#FFF1F2] px-2 py-0.5 font-mono text-[11px] font-medium text-[#BE123C]">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>
                {isZh
                  ? `偵測到外洩（${preFlight?.leaks.length ?? 0}）— 已阻擋上雲`
                  : `LEAK DETECTED (${preFlight?.leaks.length ?? 0}) — CLOUD BLOCKED`}
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
            <span>{isZh ? '檢視送雲端封包 & SHA-256' : 'Inspect Payload & Proof'}</span>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={onRunRapidTriage}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-[#0F766E]/40 bg-[#F0FDFA] px-3 py-1.5 text-[12px] font-medium text-[#0F766E] transition-colors hover:bg-[#CCFBF1]/60 active:translate-y-px disabled:opacity-50"
          >
            <Zap className="h-3.5 w-3.5" />
            <span>
              {nanoAvailable
                ? isZh
                  ? 'Stage 2 · 本機快速風險篩檢（Gemini Nano）'
                  : 'Stage 2 · Rapid Triage (On-Device)'
                : isZh
                  ? 'Stage 2 · 快速風險篩檢（雲端備援）'
                  : 'Stage 2 · Rapid Triage (Cloud Fallback)'}
            </span>
          </button>

          <button
            type="button"
            disabled={isBusy || !passed}
            onClick={onRunDeepAudit}
            title={
              !passed
                ? isZh
                  ? 'Layer 3 預檢斷路器已阻擋，所有外洩項目脫敏後才能送出'
                  : 'Blocked by Layer 3 Pre-Flight Circuit Breaker until all leaks are redacted'
                : isZh
                  ? '僅將嚴格脫敏後的封包送至雲端 Gemini'
                  : 'Send strictly sanitized payload to Cloud Gemini'
            }
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md bg-[#0F766E] px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#0D655E] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>
              {totalDocuments > 1
                ? isZh
                  ? `Stage 4 · 跨文件矛盾與紅線稽核 (${totalDocuments} 份)`
                  : `Stage 4 · Cross-Doc Redline Audit (${totalDocuments} Docs)`
                : isZh
                  ? 'Stage 4 · 送雲端深度紅線談判稽核'
                  : 'Stage 4 · Cloud Redline Audit'}
            </span>
            {!isOnline && (
              <span className="rounded bg-white/15 px-1 font-mono text-[10px]">
                {isZh ? '離線' : 'OFFLINE'}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Interactive PII Entity Control Bar (Human-in-the-Loop Privacy Gate) */}
      <div className="border-b border-[#E2E5EA] bg-[#F8F9FA] px-4 py-2.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-mono text-[11px] font-medium uppercase tracking-wider text-[#5C626E]">
            {isZh
              ? `點擊切換脫敏 (${enabledCount}/${entities.length}):`
              : `Toggle Redactions (${enabledCount}/${entities.length}):`}
          </span>
          {entities.length === 0 ? (
            <span className="text-[12px] text-[#5C626E]">
              {isZh ? '本文件未偵測到額外敏感實體。' : 'No raw PII entities detected in this document.'}
            </span>
          ) : (
            entities.map((ent) => (
              <button
                key={ent.id}
                type="button"
                onClick={() => onToggleEntity(doc.id, ent.id)}
                title={
                  isZh
                    ? `層級：${ent.layer} | 原始值：${ent.originalValue}`
                    : `Layer: ${ent.layer} | Original: ${ent.originalValue}`
                }
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] transition-all active:translate-y-px ${
                  ent.enabled
                    ? 'border-[#0F766E]/35 bg-[#F0FDFA] text-[#0F766E]'
                    : 'border-[#BE123C]/40 bg-[#FFF1F2] text-[#BE123C] line-through'
                }`}
              >
                <span>{ent.token}</span>
                <span className="text-[10px] opacity-70">
                  {ent.layer === 'gemini_nano' ? 'Nano' : 'Regex'}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Multimodal Canvas Pixel Burn-In Comparison (when image scan is present) */}
      {doc.rawImageDataUrl && (
        <div className="grid grid-cols-1 divide-y divide-[#E2E5EA] border-b border-[#E2E5EA] md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[#BE123C]">
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>{isZh ? '本機原始掃描（絕不上傳）' : 'Original Local Scan (Never Uploaded)'}</span>
              </span>
              <span className="font-mono text-[10px] text-[#5C626E]">{isZh ? '原始 PNG/JPEG' : 'RAW PNG/JPEG'}</span>
            </div>
            <div className="overflow-hidden rounded border border-[#E2E5EA] bg-[#F8F9FA]">
              <ImageRegionDrawer
                src={doc.rawImageDataUrl}
                alt={isZh ? `${doc.title} 的本機原始掃描` : `Original local scan of ${doc.title}`}
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
                    {drawingBoxes
                      ? isZh ? '完成框選' : 'Done drawing'
                      : isZh ? '手動框選塗黑' : 'Draw redaction box'}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={manualRegions.length === 0}
                  onClick={() => onUndoManualRegion?.(doc.id)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-3 py-1.5 text-[12px] font-medium text-[#141518] disabled:opacity-40 sm:min-h-[32px]"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  <span>{isZh ? `復原（${manualRegions.length}）` : `Undo (${manualRegions.length})`}</span>
                </button>
                {drawingBoxes && (
                  <span className="text-[12px] text-[#5C626E]">
                    {isZh ? '在上方圖片拖曳出要塗黑的範圍。' : 'Drag on the image to cover anything the detectors missed.'}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[#0F766E]">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>{isZh ? 'Canvas 像素塗黑安全影像' : 'Canvas Pixel-Burned Safe Image'}</span>
              </span>
              <span className="font-mono text-[10px] text-[#0F766E]">
                {isZh
                  ? `已塗黑 ${resolveImageRegions(doc.imageRegions, entities).length} 個區域`
                  : `${resolveImageRegions(doc.imageRegions, entities).length} REGIONS BURNED`}
              </span>
            </div>
            <div className="overflow-hidden rounded border border-[#0F766E]/30 bg-[#F8F9FA]">
              {doc.redactedImageDataUrl ? (
                <button
                  type="button"
                  onClick={() => setZoomImage(true)}
                  className="block w-full cursor-zoom-in"
                  aria-label={isZh ? '全螢幕檢視塗黑影像' : 'View burned image full screen'}
                >
                  <img
                    src={doc.redactedImageDataUrl}
                    alt={isZh ? `${doc.title} 的像素塗黑安全版本` : `Pixel-redacted safe version of ${doc.title}`}
                    className="h-auto w-full object-contain"
                  />
                </button>
              ) : (
                <div className="flex h-48 items-center justify-center text-[12px] text-[#5C626E]">
                  {isZh ? '像素塗黑預覽處理中' : 'Pixel redaction preview pending'}
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
                  {isZh
                    ? '我已檢查上方塗黑預覽，圖片中沒有殘留的姓名、帳號或其他識別資訊。未勾選前，Layer 3 不允許這張圖片離開裝置。'
                    : 'I reviewed the burned preview above and no names, account numbers or other identifiers remain. Until checked, Layer 3 keeps this image on-device.'}
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
            {pane === 'raw'
              ? isZh ? '本機原文' : 'Raw (local)'
              : isZh ? '送出內容（脫敏）' : 'Outbound (sanitized)'}
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
              <span>{isZh ? '本機原始文件（絕不離開瀏覽器）' : 'Raw Local Document (Stays in Browser)'}</span>
            </span>
            <span className="font-mono text-[11px] text-[#5C626E]">
              {isZh
                ? `${doc.rawText.length.toLocaleString()} 字元`
                : `${doc.rawText.length.toLocaleString()} chars`}
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
              <span>
                {isZh ? '脫敏安全封包（僅此版本允許送雲端）' : 'Sanitized Safe Payload (Cloud-Cleared)'}
              </span>
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
          aria-label={isZh ? '塗黑影像全螢幕檢視' : 'Burned image full screen'}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141518]/80 p-4"
          onClick={() => setZoomImage(false)}
        >
          <img
            src={doc.redactedImageDataUrl}
            alt={isZh ? `${doc.title} 的像素塗黑安全版本` : `Pixel-redacted safe version of ${doc.title}`}
            className="max-h-full max-w-full rounded bg-[#FFFFFF] object-contain"
          />
          <button
            type="button"
            onClick={() => setZoomImage(false)}
            className="absolute right-4 top-4 min-h-[44px] rounded-md bg-[#FFFFFF] px-3 text-[13px] font-medium text-[#141518]"
          >
            {isZh ? '關閉' : 'Close'}
          </button>
        </div>
      )}
    </section>
  );
}
