import { useState } from 'react';
import { ChevronDown, ChevronUp, Info, Terminal } from 'lucide-react';
import type { NanoAvailabilityStatus } from '../types/hybrid';
import type { SupportedLocale } from '../types/audit';
import { NANO_STATUS_ZH } from '../i18n/zhTW';

interface NanoSetupBannerProps {
  nanoStatus: NanoAvailabilityStatus;
  isFirebaseConfigured: boolean;
  locale: SupportedLocale;
}

export function NanoSetupBanner({
  nanoStatus,
  isFirebaseConfigured,
  locale,
}: NanoSetupBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const isZh = locale === 'zh-TW';

  if (nanoStatus === 'available' && isFirebaseConfigured) {
    return null;
  }

  return (
    <div className="border-b border-[#E2E5EA] bg-[#FFFFFF]">
      <div className="mx-auto max-w-[1440px] px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <div className="flex items-center gap-2 text-[#141518]">
            <Info className="h-4 w-4 shrink-0 text-[#B45309]" />
            <span>
              {nanoStatus !== 'available' ? (
                isZh ? (
                  <>
                    <strong>雲端安全模式：</strong>這個瀏覽器的 Gemini Nano 目前
                    <code className="mx-1 rounded bg-[#F1F3F5] px-1.5 py-0.5 font-mono text-[12px]">
                      {NANO_STATUS_ZH[nanoStatus]}
                    </code>
                    ，所以遮蔽改由本機規則完成，快速初判改在雲端用代號執行。原始姓名與數字仍不會離開這台裝置。
                  </>
                ) : (
                  <>
                    <strong>Cloud-safe mode:</strong> Gemini Nano is{' '}
                    <code className="mx-1 rounded bg-[#F1F3F5] px-1.5 py-0.5 font-mono text-[12px]">
                      {nanoStatus}
                    </code>
                    in this browser, so masking uses local rules and the quick check runs in the cloud on
                    tokens only. Raw names and numbers still never leave this device.
                  </>
                )
              ) : isZh ? (
                <>
                  <strong>本機預覽模式：</strong>尚未設定 Firebase 憑證（<code>.env.local</code>
                  ），本機隱私氣閘、Canvas 塗黑與 SHA-256 憑證皆可完整運作。
                </>
              ) : (
                <>
                  <strong>Local Airlock Preview:</strong> Firebase credentials are not configured in{' '}
                  <code className="rounded bg-[#F1F3F5] px-1.5 py-0.5 font-mono text-[12px]">
                    .env.local
                  </code>{' '}
                  yet. Local PII redaction, Canvas burn-in, and SHA-256 proofs work offline right now.
                </>
              )}
            </span>
          </div>

          {nanoStatus !== 'available' && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 rounded border border-[#E2E5EA] bg-[#F8F9FA] px-2.5 py-1 font-mono text-[11px] font-medium text-[#141518] hover:bg-[#F1F3F5]"
            >
              <Terminal className="h-3 w-3 text-[#0F766E]" />
              <span>{isZh ? '啟用 Chrome Gemini Nano 教學' : 'Enable Chrome Gemini Nano'}</span>
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>

        {expanded && nanoStatus !== 'available' && (
          <div className="mt-2.5 rounded-md border border-[#E2E5EA] bg-[#F8F9FA] p-3 font-mono text-[12px] text-[#141518]">
            <p className="mb-1.5 font-sans text-[12px] font-medium text-[#5C626E]">
              {isZh
                ? '在 Chrome Desktop 139+ 啟用端側 Gemini Nano（完全免費、斷網可跑）：'
                : 'Enable on-device Gemini Nano in Chrome Desktop 139+ (free, offline-capable):'}
            </p>
            {isZh ? (
              <ol className="list-decimal space-y-1 pl-5 text-[12px] leading-relaxed">
                <li>
                  開啟 <code>chrome://flags/#gemma4-for-built-in-ai</code>，即 <strong>Gemma 4 for Built-in AI</strong> →
                  選擇 <strong>Enabled</strong>（Gemini Nano 4 端側模型）
                </li>
                <li>
                  開啟 <code>chrome://flags/#prompt-api-for-gemini-nano</code> → 選擇{' '}
                  <strong>Enabled</strong>
                </li>
                <li>
                  開啟 <code>chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</code> →
                  選擇 <strong>Enabled</strong>（用於本機影像檢查）
                </li>
                <li>
                  重新啟動 Chrome，並至{' '}
                  <code>chrome://on-device-internals</code> 確認模型下載狀態
                </li>
              </ol>
            ) : (
              <ol className="list-decimal space-y-1 pl-5 text-[12px] leading-relaxed">
                <li>
                  Open <code>chrome://flags/#gemma4-for-built-in-ai</code> — <strong>Gemma 4 for Built-in AI</strong> →
                  select <strong>Enabled</strong> (Gemini Nano 4 on-device model)
                </li>
                <li>
                  Open <code>chrome://flags/#prompt-api-for-gemini-nano</code> → select{' '}
                  <strong>Enabled</strong>
                </li>
                <li>
                  Open <code>chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</code> →
                  select <strong>Enabled</strong> (for local image inspection)
                </li>
                <li>
                  Relaunch Chrome and check model download status at{' '}
                  <code>chrome://on-device-internals</code>
                </li>
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
