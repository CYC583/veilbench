import { useEffect, useState } from 'react';
import { Copy, Smartphone } from 'lucide-react';
import type { SupportedLocale } from '../types/audit';
import { readRelayAudit, type RelayAudit, type RelayReadResult } from '../services/sessionStore';
import { onRelayLink, parseRelayId, takeCapturedRelayId } from '../integrations/relayLink';

const dot = { high: 'bg-[#BE123C]', medium: 'bg-[#B45309]', low: 'bg-[#5C626E]' } as const;

const MESSAGES: Record<Exclude<RelayReadResult['status'], 'ok'>, { en: string; zh: string }> = {
  invalid_link: { en: 'Paste the link shared from VeilBench Pocket on your iPhone.', zh: '請貼上 iPhone 上 VeilBench Pocket 分享的連結。' },
  not_found: { en: 'No audit for that link, or it has expired.', zh: '找不到這個連結的稽核結果，或已過期。' },
  offline: { en: 'You are offline. Reconnect and try again.', zh: '目前離線，請連線後再試。' },
  error: { en: 'Could not open that audit. Try again.', zh: '無法開啟這份稽核，請再試一次。' },
};

/**
 * Cross-device handoff from VeilBench Pocket (iOS). The phone masks with Apple's on-device model, audits
 * the tokens in the cloud, and shares a link whose fragment carries an unguessable 128-bit ID (it never
 * reaches a server; main.tsx strips it from the URL before any SDK loads). The vault never leaves the
 * phone, so this page shows tokens, never the real names or numbers.
 */
export function RelayOpener({ locale }: { locale: SupportedLocale }) {
  const isZh = locale === 'zh-TW';
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<RelayAudit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const openRelay = async (id: string) => {
    setBusy(true);
    setError(null);
    setAudit(null);
    const result = await readRelayAudit(id);
    setBusy(false);
    if (result.status === 'ok') setAudit(result.audit);
    else setError(isZh ? MESSAGES[result.status].zh : MESSAGES[result.status].en);
  };

  // Opened from a shared link: main.tsx already captured the ID and cleaned the address bar.
  useEffect(() => {
    const show = (id: string | null) => {
      setOpen(true);
      if (id) void openRelay(id);
      else setError(isZh ? MESSAGES.invalid_link.zh : MESSAGES.invalid_link.en);
    };
    const id = takeCapturedRelayId();
    if (id) show(id);
    // A link opened later in the same tab: relayLink already stripped it from the URL.
    return onRelayLink(show);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseRelayId(link);
    if (!id) {
      setError(isZh ? MESSAGES.invalid_link.zh : MESSAGES.invalid_link.en);
      return;
    }
    // Never keep the secret in the field after use.
    setLink('');
    void openRelay(id);
  };

  if (!open) {
    return (
      <button
        type="button"
        data-testid="relay-open"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center gap-2 text-[13px] font-medium text-[#0F766E] underline-offset-2 hover:underline sm:min-h-[32px]"
      >
        <Smartphone className="h-4 w-4" />
        {isZh ? '開啟 iPhone（VeilBench Pocket）上的稽核' : 'Open an audit from your iPhone (VeilBench Pocket)'}
      </button>
    );
  }

  return (
    <section className="rounded-md border border-[#E2E5EA] bg-[#FFFFFF] p-4" data-testid="relay-panel">
      <div className="flex items-center gap-2">
        <Smartphone className="h-4 w-4 text-[#0F766E]" />
        <h2 className="text-[14px] font-semibold text-[#141518]">
          {isZh ? '從 iPhone 接續' : 'Continue from iPhone'}
        </h2>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[#5C626E]">
        {isZh
          ? 'iPhone 用 Apple 裝置端模型遮蔽文件，再用代號做雲端稽核，然後分享一個連結。這裡只會看到代號：真正的姓名和數字只在你的 iPhone 上。'
          : 'Your iPhone masked the document with Apple’s on-device model, audited the tokens in the cloud and shared a link. You see tokens here; the real names and numbers stay on your iPhone.'}
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor="relay-link" className="sr-only">{isZh ? '分享連結' : 'Shared link'}</label>
        <input
          id="relay-link"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setError(null);
          }}
          placeholder={isZh ? '貼上 iPhone 分享的連結' : 'Paste the link shared from your iPhone'}
          className="min-h-[44px] min-w-0 flex-1 rounded border border-[#E2E5EA] px-3 font-mono text-[12.5px] text-[#141518] sm:max-w-[460px]"
        />
        <button
          type="submit"
          disabled={busy || !link.trim()}
          className="min-h-[44px] rounded-md bg-[#0F766E] px-4 text-[13px] font-medium text-[#FFFFFF] disabled:opacity-50"
        >
          {busy ? (isZh ? '開啟中…' : 'Opening…') : isZh ? '開啟' : 'Open'}
        </button>
        {error && <span role="alert" className="text-[12.5px] text-[#BE123C]">{error}</span>}
      </form>

      {audit && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2" data-testid="relay-result">
          <div>
            <p className="text-[12px] font-medium text-[#141518]">
              {isZh ? `iPhone 找到的風險（${audit.flags.length}）` : `Risks found on iPhone (${audit.flags.length})`}
            </p>
            <ul className="mt-1.5 space-y-2">
              {audit.flags.map((f, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-snug text-[#141518]">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot[f.severity]}`} aria-hidden />
                  <span className="min-w-0 break-words">
                    <span className="font-medium">{f.title}</span>
                    <span className="block text-[12.5px] text-[#5C626E]">{f.summary}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {audit.emailSanitized && (
            <div className="rounded-md border border-[#E2E5EA]">
              <p className="border-b border-[#E2E5EA] px-3 py-1.5 text-[12px] font-medium text-[#141518]">
                {isZh ? '信件草稿（代號版）' : 'Email draft (tokens)'}
              </p>
              <p className="max-h-[160px] overflow-y-auto whitespace-pre-wrap px-3 py-2 font-mono text-[12px] leading-relaxed text-[#141518]">
                {audit.emailSanitized}
              </p>
              <div className="border-t border-[#E2E5EA] px-3 py-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(audit.emailSanitized);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 2000);
                    } catch {
                      setCopied(false);
                    }
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-[#E2E5EA] px-3 text-[12.5px] font-medium text-[#141518] sm:min-h-[32px]"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? (isZh ? '已複製' : 'Copied') : isZh ? '複製代號版' : 'Copy (tokens)'}
                </button>
              </div>
            </div>
          )}
          {audit.expiresAt && (
            <p className="text-[11.5px] text-[#5C626E] lg:col-span-2">
              {isZh
                ? `這個連結將於 ${audit.expiresAt.toLocaleString()} 失效。`
                : `This link expires at ${audit.expiresAt.toLocaleString()}.`}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
