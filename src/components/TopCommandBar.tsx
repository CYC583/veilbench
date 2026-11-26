import {
  Cpu,
  History,
  Languages,
  ShieldCheck,
  Wifi,
  WifiOff,
  RotateCcw,
} from 'lucide-react';
import type {
  NanoAvailabilityStatus,
  UserRoutingPreference,
} from '../types/hybrid';
import type { SupportedLocale } from '../types/audit';
import { UI, translator } from '../i18n/ui';

interface TopCommandBarProps {
  isOnline: boolean;
  nanoStatus: NanoAvailabilityStatus;
  userPreference: UserRoutingPreference;
  locale: SupportedLocale;
  isTranslating: boolean;
  hasDocuments: boolean;
  savedCount: number;
  onChangePreference: (pref: UserRoutingPreference) => void;
  onToggleLocale: () => void;
  onToggleHistory: () => void;
  onClearWorkspace: () => void;
}

const PREF_OPTIONS: Array<{ id: UserRoutingPreference; label: string; zhLabel: string }> = [
  { id: 'auto_hybrid', label: 'Auto Hybrid', zhLabel: '自動混合' },
  { id: 'strict_local_only', label: 'Local Only', zhLabel: '僅限本機' },
  { id: 'cloud_deep', label: 'Cloud Deep', zhLabel: '雲端深度' },
];

export function TopCommandBar({
  isOnline,
  nanoStatus,
  userPreference,
  locale,
  isTranslating,
  hasDocuments,
  savedCount,
  onChangePreference,
  onToggleLocale,
  onToggleHistory,
  onClearWorkspace,
}: TopCommandBarProps) {
  const t = translator(locale);

  const nanoLabel =
    nanoStatus === 'available'
      ? t(UI.commandBar.nanoReady)
      : nanoStatus === 'downloading'
        ? t(UI.commandBar.nanoDownloading)
        : nanoStatus === 'downloadable'
          ? t(UI.commandBar.nanoDownloadable)
          : t(UI.commandBar.deterministicShield);

  const nanoTone =
    nanoStatus === 'available'
      ? 'border-[#0F766E]/30 bg-[#F0FDFA] text-[#0F766E]'
      : 'border-[#E2E5EA] bg-[#F1F3F5] text-[#5C626E]';

  return (
    <header className="sticky top-0 z-30 border-b border-[#E2E5EA] bg-[#FFFFFF]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-[#0F766E]/25 bg-[#0F766E] text-white">
            <ShieldCheck className="h-4 w-4 stroke-[2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold tracking-[-0.025em] text-[#141518]">
                VeilBench
              </span>
              <span className="rounded border border-[#E2E5EA] bg-[#F8F9FA] px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-[#5C626E]">
                Zero-Leak Hybrid AI
              </span>
            </div>
            <p className="hidden text-[12px] text-[#5C626E] sm:block">
              {t(UI.commandBar.tagline)}
            </p>
          </div>
        </div>

        <div
          className="flex items-center rounded-md border border-[#E2E5EA] bg-[#F8F9FA] p-0.5"
          role="group"
          aria-label={t(UI.commandBar.routingModeAria)}
        >
          {PREF_OPTIONS.map((opt) => {
            const active = userPreference === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangePreference(opt.id)}
                className={`min-h-[34px] rounded px-2.5 py-1 text-[12px] font-medium transition-all active:translate-y-px ${
                  active
                    ? 'bg-[#FFFFFF] text-[#141518] shadow-[0_1px_2px_rgba(20,21,24,0.06)] ring-1 ring-[#E2E5EA]'
                    : 'text-[#5C626E] hover:text-[#141518]'
                }`}
              >
                {t({ en: opt.label, zh: opt.zhLabel })}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium ${
              isOnline
                ? 'border-[#0F766E]/25 bg-[#F0FDFA] text-[#0F766E]'
                : 'border-[#475569]/30 bg-[#F1F5F9] text-[#475569]'
            }`}
          >
            {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            <span>{isOnline ? t(UI.commandBar.online) : t(UI.commandBar.offline)}</span>
          </span>

          <span
            className={`hidden items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium md:inline-flex ${nanoTone}`}
          >
            <Cpu className="h-3.5 w-3.5" />
            <span>{nanoLabel}</span>
          </span>

          <button
            type="button"
            onClick={onToggleLocale}
            disabled={isTranslating}
            title={t(UI.commandBar.toggleLocaleTitle)}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-2.5 py-1 text-[12px] font-medium text-[#141518] transition-colors hover:border-[#0F766E]/50 hover:text-[#0F766E] active:translate-y-px disabled:opacity-60"
          >
            <Languages className="h-3.5 w-3.5 text-[#0F766E]" />
            <span className="font-mono text-[11px]">
              {isTranslating ? t(UI.commandBar.translating) : t(UI.commandBar.toggleLocaleLabel)}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleHistory}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-2.5 py-1 text-[12px] font-medium text-[#141518] transition-colors hover:border-[#0F766E]/50 active:translate-y-px"
          >
            <History className="h-3.5 w-3.5 text-[#5C626E]" />
            <span className="hidden sm:inline">{t(UI.commandBar.history)}</span>
            {savedCount > 0 && (
              <span className="rounded bg-[#F1F3F5] px-1.5 py-0.5 font-mono text-[10px] text-[#5C626E]">
                {savedCount}
              </span>
            )}
          </button>

          {hasDocuments && (
            <button
              type="button"
              onClick={onClearWorkspace}
              title={t(UI.commandBar.resetTitle)}
              aria-label={t(UI.commandBar.resetAria)}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-2 py-1 text-[12px] text-[#5C626E] transition-colors hover:border-[#BE123C]/40 hover:text-[#BE123C] active:translate-y-px"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t(UI.commandBar.reset)}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
