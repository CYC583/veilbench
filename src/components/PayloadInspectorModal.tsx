import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Fingerprint,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { PreFlightAssertion, VaultMap, ZeroLeakProof } from '../types/privacy';
import type { SupportedLocale, WorkbenchDocument } from '../types/audit';
import { DEEP_AUDIT_TASK_ANALYSIS, DEEP_AUDIT_TASK_PLAYBOOK, redactWithVault } from '../core';
import { localizeRuntimeMessage } from '../i18n/runtimeMessages';

interface PayloadInspectorModalProps {
  isOpen: boolean;
  documents: WorkbenchDocument[];
  combinedSanitizedPayload: string;
  /** Used to show titles exactly as tokenized in the outbound envelope (file names can embed IDs). */
  vault: VaultMap;
  preFlight: PreFlightAssertion | null;
  zeroLeakProof: ZeroLeakProof | null;
  isBusy: boolean;
  locale: SupportedLocale;
  onClose: () => void;
  onApproveAndEscalate: () => void;
  /** Q-2: un-redacts one token so the user can watch Layer 3 block the escalation live. */
  onTryLeak?: () => void;
}

export function PayloadInspectorModal({
  isOpen,
  documents,
  combinedSanitizedPayload,
  vault,
  preFlight,
  zeroLeakProof,
  isBusy,
  locale,
  onClose,
  onApproveAndEscalate,
  onTryLeak,
}: PayloadInspectorModalProps) {
  // Hooks must run before the early return below.
  const [copiedPayload, setCopiedPayload] = useState(false);
  if (!isOpen) return null;

  const isZh = locale === 'zh-TW';
  const passed = Boolean(preFlight?.passed);
  const redactedImages = documents.filter((d) => Boolean(d.redactedImageDataUrl));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#141518]/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={isZh ? '即時送出封包檢視器' : 'Live Outbound Payload Inspector'}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[#E2E5EA] bg-[#FFFFFF]">
        <div className="flex items-center justify-between border-b border-[#E2E5EA] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Fingerprint className="h-5 w-5 text-[#0F766E]" />
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[#141518]">
                {isZh
                  ? '送雲端前封包透視與 SHA-256 零外洩憑證'
                  : 'Live Outbound Payload Inspector & SHA-256 Zero-Leak Proof'}
              </h2>
              <p className="text-[12px] text-[#5C626E]">
                {isZh
                  ? '以下為即將發送給 Cloud Gemini 的完整位元組內容（零原始個資）。'
                  : 'Exact sanitized payload cleared for Cloud Gemini escalation. Raw Local Vault never leaves your browser.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isZh ? '關閉檢視器' : 'Close Inspector'}
            className="rounded-md p-1.5 text-[#5C626E] hover:bg-[#F1F3F5] hover:text-[#141518]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div
            className={`rounded-md border p-3.5 ${
              passed
                ? 'border-[#0F766E]/30 bg-[#F0FDFA]'
                : 'border-[#BE123C]/35 bg-[#FFF1F2]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {passed ? (
                  <CheckCircle2 className="h-4 w-4 text-[#0F766E]" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-[#BE123C]" />
                )}
                <span
                  className={`font-mono text-[12px] font-semibold ${
                    passed ? 'text-[#0F766E]' : 'text-[#BE123C]'
                  }`}
                >
                  {passed
                    ? isZh
                      ? 'LAYER 3 預檢斷路器：通過（0 項外洩）'
                      : 'LAYER 3 PRE-FLIGHT CIRCUIT BREAKER: PASSED (0 LEAKS)'
                    : isZh
                      ? `LAYER 3 斷路器已阻擋（發現 ${preFlight?.leaks.length ?? 0} 項外洩）`
                      : `LAYER 3 CIRCUIT BREAKER BLOCKED (${preFlight?.leaks.length ?? 0} LEAKS FOUND)`}
                </span>
              </div>
              <span className="font-mono text-[11px] text-[#5C626E]">
                {isZh
                  ? `已檢查 ${preFlight?.inspectedChars.toLocaleString() ?? 0} 字元`
                  : `Inspected ${preFlight?.inspectedChars.toLocaleString() ?? 0} chars`}
              </span>
            </div>

            {!passed && preFlight && preFlight.leaks.length > 0 && (
              <ul className="mt-2.5 space-y-1.5 border-t border-[#BE123C]/20 pt-2.5 font-mono text-[11px] text-[#BE123C]">
                {preFlight.leaks.map((leak, idx) => (
                  <li key={idx}>
                    • [{leak.source}] {localizeRuntimeMessage(leak.reason, locale)}:{' '}
                    <code className="rounded bg-[#FFFFFF] px-1 py-0.5">
                      {leak.matchedSnippet}
                    </code>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {zeroLeakProof && (
            <div className="rounded-md border border-[#E2E5EA] bg-[#F8F9FA] p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#141518]">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#0F766E]" />
                  <span>{isZh ? 'Web Crypto SHA-256 邊界憑證' : 'Web Crypto SHA-256 Boundary Proof'}</span>
                </span>
                <span className="font-mono text-[10px] text-[#5C626E]">
                  {isZh ? '金庫項目' : 'Vault Entries'}: {zeroLeakProof.vaultEntriesCount}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 font-mono text-[11px] sm:grid-cols-2">
                <div className="rounded border border-[#E2E5EA] bg-[#FFFFFF] p-2">
                  <div className="text-[10px] uppercase text-[#5C626E]">
                    {isZh ? '原始內容雜湊（僅留本機）' : 'Raw Local Hash (Kept Local)'}
                  </div>
                  <div className="mt-0.5 break-all text-[#141518]">
                    {zeroLeakProof.rawContentHash}
                  </div>
                </div>
                <div className="rounded border border-[#0F766E]/30 bg-[#FFFFFF] p-2">
                  <div className="text-[10px] uppercase text-[#0F766E]">
                    {isZh ? '脫敏送出雜湊（雲端）' : 'Sanitized Outbound Hash (Cloud)'}
                  </div>
                  <div className="mt-0.5 break-all text-[#141518]">
                    {zeroLeakProof.sanitizedPayloadHash}
                  </div>
                </div>
              </div>
            </div>
          )}

          {redactedImages.length > 0 && (
            <div>
              <div className="mb-1.5 font-mono text-[11px] font-medium uppercase tracking-wider text-[#5C626E]">
                {isZh ? '送出的像素塗黑影像附件' : 'Outbound Pixel-Burned Image Attachments'} ({redactedImages.length})
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {redactedImages.map((doc) => (
                  <div
                    key={doc.id}
                    className="overflow-hidden rounded border border-[#E2E5EA] bg-[#F8F9FA] p-2"
                  >
                    <div className="mb-1 truncate font-mono text-[11px] text-[#141518]">
                      {redactWithVault(doc.title, vault)}
                    </div>
                    <img
                      src={doc.redactedImageDataUrl}
                      alt={
                        isZh
                          ? `送出的塗黑版 ${redactWithVault(doc.title, vault)}`
                          : `Outbound redacted ${redactWithVault(doc.title, vault)}`
                      }
                      className="max-h-40 w-full rounded object-contain"
                    />
                    {(() => {
                      const hash = zeroLeakProof?.outboundImageHashes?.find(
                        (h) => h.title === redactWithVault(doc.title, vault)
                      )?.sha256;
                      return hash ? (
                        <p className="mt-1 break-all font-mono text-[10px] text-[#5C626E]">
                          SHA-256 {hash}
                        </p>
                      ) : null;
                    })()}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-[#5C626E]">
                {isZh ? '實際送出的文字封包' : 'Exact Outbound Text Payload'}
              </span>
              <span className="font-mono text-[11px] text-[#5C626E]">
                {isZh
                  ? `${combinedSanitizedPayload.length.toLocaleString()} 字元`
                  : `${combinedSanitizedPayload.length.toLocaleString()} chars`}
              </span>
            </div>
            <pre className="max-h-60 overflow-auto rounded-md border border-[#E2E5EA] bg-[#F1F3F5] p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-[#141518]">
              {combinedSanitizedPayload}
            </pre>
            <div className="mt-2 rounded-md border border-[#0F766E]/30 bg-[#F0FDFA] p-3">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#0F766E]">
                {isZh ? '自行驗證' : 'Verify yourself'}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#141518]">
                {isZh
                  ? '複製上方內容後，在終端機執行下列指令，結果應與「送出雜湊」完全相同。'
                  : 'Copy the payload above, then run this in a terminal — the digest must equal the outbound hash.'}
              </p>
              <code className="mt-1.5 block break-all rounded bg-[#FFFFFF] px-2 py-1 font-mono text-[11.5px] text-[#141518]">
                shasum -a 256 veilbench-outbound-payload.txt
              </code>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(combinedSanitizedPayload);
                      setCopiedPayload(true);
                      window.setTimeout(() => setCopiedPayload(false), 2000);
                    } catch {
                      setCopiedPayload(false);
                    }
                  }}
                  className="inline-flex min-h-[44px] items-center rounded-md border border-[#0F766E]/40 bg-[#FFFFFF] px-3 text-[12px] font-medium text-[#0F766E] sm:min-h-[32px]"
                >
                  {copiedPayload
                    ? isZh ? '已複製送出內容' : 'Payload copied'
                    : isZh ? '複製送出內容' : 'Copy exact payload'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Exact bytes of the outbound envelope (UTF-8, no trailing newline) for offline hashing.
                    const url = URL.createObjectURL(
                      new Blob([combinedSanitizedPayload], { type: 'text/plain;charset=utf-8' })
                    );
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'veilbench-outbound-payload.txt';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="inline-flex min-h-[44px] items-center rounded-md border border-[#0F766E]/40 bg-[#FFFFFF] px-3 text-[12px] font-medium text-[#0F766E] sm:min-h-[32px]"
                >
                  {isZh ? '下載送出內容' : 'Download payload'}
                </button>
                {onTryLeak && passed && (
                  <button
                    type="button"
                    onClick={onTryLeak}
                    className="inline-flex min-h-[44px] items-center rounded-md border border-[#BE123C]/40 bg-[#FFFFFF] px-3 text-[12px] font-medium text-[#BE123C] sm:min-h-[32px]"
                  >
                    {isZh ? '試著外洩：關掉一個代號' : 'Try to leak: un-redact one token'}
                  </button>
                )}
              </div>
            </div>
            <details className="mt-2 rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-3 py-2">
              <summary className="cursor-pointer font-mono text-[11px] text-[#5C626E]">
                {isZh
                  ? 'Stage 4 分成兩個平行呼叫：各自在上方內容後附加一段固定任務指示（不含任何文件資料）'
                  : 'Stage 4 runs as 2 parallel calls, each appending one fixed task instruction (no document data)'}
              </summary>
              <pre className="mt-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-[#141518]">
                {`${DEEP_AUDIT_TASK_ANALYSIS}\n\n${DEEP_AUDIT_TASK_PLAYBOOK}`}
              </pre>
            </details>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E5EA] bg-[#F8F9FA] px-5 py-3">
          <span className="text-[12px] text-[#5C626E]">
            {passed
              ? isZh
                ? '已通過所有零外洩斷路器驗證，可安全送出。'
                : 'Verified zero-leak. Safe to escalate via Firebase AI Logic + App Check.'
              : isZh
                ? '請返回氣閘重新啟用被關閉的敏感詞脫敏。'
                : 'Re-enable redaction toggles in the Privacy Airlock to clear the circuit breaker.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[36px] rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-3.5 py-1.5 text-[12px] font-medium text-[#141518] hover:bg-[#F1F3F5]"
            >
              {isZh ? '關閉' : 'Close'}
            </button>
            <button
              type="button"
              disabled={!passed || isBusy}
              onClick={onApproveAndEscalate}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md bg-[#0F766E] px-4 py-1.5 text-[12px] font-medium text-white hover:bg-[#0D655E] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span>
                {isZh ? '核准並送雲端深度稽核' : 'Approve & Escalate to Cloud Gemini'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
