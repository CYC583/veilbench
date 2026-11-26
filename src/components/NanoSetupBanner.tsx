import { useState } from 'react';
import { ChevronDown, ChevronUp, Info, Terminal } from 'lucide-react';
import type { NanoAvailabilityStatus } from '../types/hybrid';
import type { SupportedLocale } from '../types/audit';
import { NANO_STATUS_ZH } from '../i18n/zhTW';
import { UI, translator } from '../i18n/ui';

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
  const t = translator(locale);

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
                <>
                  <strong>{t(UI.nanoSetup.cloudTitle)}</strong>
                  {t(UI.nanoSetup.cloudBefore)}
                  <code className="mx-1 rounded bg-[#F1F3F5] px-1.5 py-0.5 font-mono text-[12px]">
                    {t({ en: nanoStatus, zh: NANO_STATUS_ZH[nanoStatus] })}
                  </code>
                  {t(UI.nanoSetup.cloudAfter)}
                </>
              ) : (
                <>
                  <strong>{t(UI.nanoSetup.localTitle)}</strong>
                  {t(UI.nanoSetup.localBefore)}
                  <code className="rounded bg-[#F1F3F5] px-1.5 py-0.5 font-mono text-[12px]">
                    .env.local
                  </code>
                  {t(UI.nanoSetup.localAfter)}
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
              <span>{t(UI.nanoSetup.enableButton)}</span>
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>

        {expanded && nanoStatus !== 'available' && (
          <div className="mt-2.5 rounded-md border border-[#E2E5EA] bg-[#F8F9FA] p-3 font-mono text-[12px] text-[#141518]">
            <p className="mb-1.5 font-sans text-[12px] font-medium text-[#5C626E]">
              {t(UI.nanoSetup.stepsIntro)}
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-[12px] leading-relaxed">
              <li>
                {t(UI.nanoSetup.stepOpen)}
                <code>chrome://flags/#gemma4-for-built-in-ai</code>
                {t(UI.nanoSetup.step1Sep)}
                <strong>Gemma 4 for Built-in AI</strong>
                {t(UI.nanoSetup.stepArrowSelect)}
                <strong>Enabled</strong>
                {t(UI.nanoSetup.step1Tail)}
              </li>
              <li>
                {t(UI.nanoSetup.stepOpen)}
                <code>chrome://flags/#prompt-api-for-gemini-nano</code>
                {t(UI.nanoSetup.stepArrowSelect)}
                <strong>Enabled</strong>
              </li>
              <li>
                {t(UI.nanoSetup.stepOpen)}
                <code>chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</code>
                {t(UI.nanoSetup.stepArrowSelect)}
                <strong>Enabled</strong>
                {t(UI.nanoSetup.step3Tail)}
              </li>
              <li>
                {t(UI.nanoSetup.step4Before)}
                <code>chrome://on-device-internals</code>
                {t(UI.nanoSetup.step4Tail)}
              </li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
