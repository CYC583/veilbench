import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Fingerprint,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useRef, useState, useSyncExternalStore } from 'react';
import { useDialogA11y } from './useDialogA11y';
import { getEgressEntries, subscribeEgress, type EgressEntry } from '../services/egressLedger';
import type { PreFlightAssertion, VaultMap, ZeroLeakProof } from '../types/privacy';
import type { SupportedLocale, WorkbenchDocument } from '../types/audit';
import { DEEP_AUDIT_TASK_ANALYSIS, DEEP_AUDIT_TASK_PLAYBOOK, redactWithVault } from '../core';
import { localizeRuntimeMessage } from '../i18n/runtimeMessages';
import { UI, translator } from '../i18n/ui';

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
  const ledger = useSyncExternalStore(subscribeEgress, getEgressEntries, getEgressEntries);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useDialogA11y(dialogRef, isOpen, onClose);
  if (!isOpen) return null;

  const t = translator(locale);
  const passed = Boolean(preFlight?.passed);
  const redactedImages = documents.filter((d) => Boolean(d.redactedImageDataUrl));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#141518]/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={t(UI.inspector.dialogAria)}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[#E2E5EA] bg-[#FFFFFF] outline-none"
      >
        <div className="flex items-center justify-between border-b border-[#E2E5EA] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Fingerprint className="h-5 w-5 text-[#0F766E]" />
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-[#141518]">
                {t(UI.inspector.title)}
              </h2>
              <p className="text-[12px] text-[#5C626E]">
                {t(UI.inspector.subtitle)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(UI.inspector.closeAria)}
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
                    ? t(UI.inspector.circuitPassed)
                    : t(UI.inspector.circuitBlocked(preFlight?.leaks.length ?? 0))}
                </span>
              </div>
              <span className="font-mono text-[11px] text-[#5C626E]">
                {t(UI.inspector.inspectedChars(preFlight?.inspectedChars.toLocaleString() ?? 0))}
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
                  <span>{t(UI.inspector.proofTitle)}</span>
                </span>
                <span className="font-mono text-[10px] text-[#5C626E]">
                  {t(UI.inspector.vaultEntries)}: {zeroLeakProof.vaultEntriesCount}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 font-mono text-[11px] sm:grid-cols-2">
                <div className="rounded border border-[#E2E5EA] bg-[#FFFFFF] p-2">
                  <div className="text-[10px] uppercase text-[#5C626E]">
                    {t(UI.inspector.rawHashLabel)}
                  </div>
                  <div className="mt-0.5 break-all text-[#141518]">
                    {zeroLeakProof.rawContentHash}
                  </div>
                </div>
                <div className="rounded border border-[#0F766E]/30 bg-[#FFFFFF] p-2">
                  <div className="text-[10px] uppercase text-[#0F766E]">
                    {t(UI.inspector.sanitizedHashLabel)}
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
                {t(UI.inspector.imageAttachments)} ({redactedImages.length})
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
                      alt={t(UI.inspector.imageAlt(redactWithVault(doc.title, vault)))}
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
                {t(UI.inspector.payloadTitle)}
              </span>
              <span className="font-mono text-[11px] text-[#5C626E]">
                {t(UI.inspector.charsCount(combinedSanitizedPayload.length.toLocaleString()))}
              </span>
            </div>
            <pre className="max-h-60 overflow-auto rounded-md border border-[#E2E5EA] bg-[#F1F3F5] p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-[#141518]">
              {combinedSanitizedPayload}
            </pre>
            <div className="mt-2 rounded-md border border-[#0F766E]/30 bg-[#F0FDFA] p-3">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#0F766E]">
                {t(UI.inspector.verifyTitle)}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#141518]">
                {t(UI.inspector.verifyBody)}
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
                  {copiedPayload ? t(UI.inspector.payloadCopied) : t(UI.inspector.copyPayload)}
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
                  {t(UI.inspector.downloadPayload)}
                </button>
                {onTryLeak && passed && (
                  <button
                    type="button"
                    onClick={onTryLeak}
                    className="inline-flex min-h-[44px] items-center rounded-md border border-[#BE123C]/40 bg-[#FFFFFF] px-3 text-[12px] font-medium text-[#BE123C] sm:min-h-[32px]"
                  >
                    {t(UI.inspector.tryLeak)}
                  </button>
                )}
              </div>
            </div>
            <details className="mt-2 rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-3 py-2">
              <summary className="cursor-pointer font-mono text-[11px] text-[#5C626E]">
                {t(UI.inspector.stage4Summary)}
              </summary>
              <pre className="mt-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-[#141518]">
                {`${DEEP_AUDIT_TASK_ANALYSIS}\n\n${DEEP_AUDIT_TASK_PLAYBOOK}`}
              </pre>
            </details>
            <EgressLedgerSection
              ledger={ledger}
              locale={locale}
              onDownload={() => downloadOutboundJson(combinedSanitizedPayload, zeroLeakProof, ledger)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2E5EA] bg-[#F8F9FA] px-5 py-3">
          <span className="text-[12px] text-[#5C626E]">
            {passed ? t(UI.inspector.footerPassed) : t(UI.inspector.footerBlocked)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[36px] rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-3.5 py-1.5 text-[12px] font-medium text-[#141518] hover:bg-[#F1F3F5]"
            >
              {t(UI.inspector.close)}
            </button>
            <button
              type="button"
              disabled={!passed || isBusy}
              onClick={onApproveAndEscalate}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md bg-[#0F766E] px-4 py-1.5 text-[12px] font-medium text-white hover:bg-[#0D655E] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              <span>{t(UI.inspector.approve)}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const channelLabel: Record<EgressEntry['channel'], string> = {
  ai_logic: 'AI Logic',
  firestore: 'Firestore',
  app_check: 'App Check',
  auth: 'Auth',
  remote_config: 'Remote Config',
  telemetry: 'Telemetry',
  other: 'Other',
};

/** A3: outbound.json = the audited payload, its hash, image hashes and the egress ledger (no bodies, no vault). */
function downloadOutboundJson(payload: string, proof: ZeroLeakProof | null, ledger: EgressEntry[]) {
  const doc = {
    schema: 'veilbench.outbound-receipt.v1',
    exportedAt: new Date().toISOString(),
    payloadSha256: proof?.sanitizedPayloadHash ?? null,
    payload,
    outboundImageHashes: proof?.outboundImageHashes ?? [],
    verify: 'Save "payload" exactly (UTF-8, no trailing newline) and run: shasum -a 256 <file>. It must equal payloadSha256.',
    egressLedger: ledger,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'veilbench-outbound.json';
  a.click();
  URL.revokeObjectURL(url);
}

function EgressLedgerSection({ ledger, locale, onDownload }: {
  ledger: EgressEntry[];
  locale: SupportedLocale;
  onDownload: () => void;
}) {
  const t = translator(locale);
  const aiCalls = ledger.filter(e => e.channel === 'ai_logic');
  const aiBytes = aiCalls.reduce((n, e) => n + e.bytes, 0);
  const unmatched = aiCalls.filter(e => e.carriesAuditedText === false).length;
  // Always keep every AI Logic call visible so the table reconciles 1:1 with the summary count and bytes,
  // alongside the most recent non-AI requests (up to 12 total non-AI rows).
  const nonAiRecent = ledger.filter(e => e.channel !== 'ai_logic').slice(-12);
  const visibleIds = new Set([...aiCalls.map(e => e.id), ...nonAiRecent.map(e => e.id)]);
  const recent = ledger.filter(e => visibleIds.has(e.id)).reverse();
  return (
    <div className="mt-3 rounded-md border border-[#E2E5EA] bg-[#FFFFFF]" data-testid="egress-ledger">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E5EA] px-3 py-2">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#141518]">
            {t(UI.inspector.ledgerTitle)}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-[#5C626E]">
            {t(UI.inspector.ledgerDesc(aiCalls.length, aiBytes.toLocaleString(), unmatched))}
          </p>
        </div>
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex min-h-[44px] shrink-0 items-center rounded-md border border-[#0F766E]/40 bg-[#FFFFFF] px-3 text-[12px] font-medium text-[#0F766E] sm:min-h-[32px]"
        >
          {t(UI.inspector.downloadJson)}
        </button>
      </div>
      {recent.length === 0 ? (
        <p className="px-3 py-2 text-[12px] text-[#5C626E]">
          {t(UI.inspector.ledgerEmpty)}
        </p>
      ) : (
        <div className="max-h-44 overflow-auto">
          <table className="w-full min-w-[520px] text-left font-mono text-[11px]">
            <thead className="sticky top-0 bg-[#F8F9FA] text-[#5C626E]">
              <tr>
                <th className="px-3 py-1.5 font-normal">{t(UI.inspector.colTime)}</th>
                <th className="px-2 py-1.5 font-normal">{t(UI.inspector.colService)}</th>
                <th className="px-2 py-1.5 font-normal">{t(UI.inspector.colHost)}</th>
                <th className="px-2 py-1.5 text-right font-normal">Bytes</th>
                <th className="px-3 py-1.5 font-normal">{t(UI.inspector.colLayer3)}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(e => (
                <tr key={e.id} className="border-t border-[#E2E5EA] text-[#141518]" title={e.sha256 ? `SHA-256 ${e.sha256}` : undefined}>
                  <td className="px-3 py-1">{e.at.slice(11, 19)}</td>
                  <td className="px-2 py-1">{channelLabel[e.channel]}</td>
                  <td className="max-w-[180px] truncate px-2 py-1 text-[#5C626E]">{e.host}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{e.bytes.toLocaleString()}</td>
                  <td className="px-3 py-1">
                    {e.carriesAuditedText === null ? '—' : e.carriesAuditedText ? t(UI.inspector.yes) : t(UI.inspector.noMatch)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
