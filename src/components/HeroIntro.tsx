import { ArrowRight, Cloud, Cpu, PlayCircle } from 'lucide-react';
import type { SupportedLocale } from '../types/audit';
import { UI, translator } from '../i18n/ui';

export interface HeroIntroProps {
  locale: SupportedLocale;
  disabled: boolean;
  onRunDemo: () => void;
  onTryOwn: () => void;
}

/**
 * A9 · First screen. Leads with the decision and the money, not with "masking": redaction is one step on
 * the route, shown with where each step runs.
 */
export function HeroIntro({ locale, disabled, onRunDemo, onTryOwn }: HeroIntroProps) {
  const t = translator(locale);
  const route = [
    { where: 'ON_DEVICE', cloud: false, text: UI.hero.routeTokenize },
    { where: 'IN_CLOUD', cloud: true, text: UI.hero.routeCloud },
    { where: 'ON_DEVICE', cloud: false, text: UI.hero.routeDecide },
  ];

  return (
    <section className="rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-4 py-6 sm:px-8 sm:py-8" aria-labelledby="hero-title">
      <p className="font-mono text-[11px] uppercase tracking-wide text-[#5C626E]">
        {t(UI.hero.eyebrow)}
      </p>
      <h1 id="hero-title" className="mt-2 max-w-[22ch] text-[30px] font-semibold leading-[1.1] tracking-tight text-[#141518] sm:text-[40px]">
        {t(UI.hero.title)}
      </h1>
      <p className="mt-3 max-w-[62ch] text-[14.5px] leading-relaxed text-[#3B414B]">
        {t(UI.hero.lede)}
      </p>
      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
        <button
          type="button"
          data-testid="hero-run-demo"
          disabled={disabled}
          onClick={onRunDemo}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md bg-[#0F766E] px-5 text-[15px] font-medium text-[#FFFFFF] active:translate-y-px disabled:opacity-50"
        >
          <PlayCircle className="h-5 w-5" />
          {t(UI.hero.runDemo)}
        </button>
        <button
          type="button"
          onClick={onTryOwn}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-5 text-[15px] font-medium text-[#141518]"
        >
          {t(UI.hero.tryOwn)}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <ol className="mt-6 grid gap-2 md:grid-cols-3">
        {route.map((step, i) => (
          <li key={i} className="flex gap-3 rounded-md border border-[#E2E5EA] bg-[#F8F9FA] px-3 py-2.5">
            <span className="mt-0.5 font-mono text-[12px] text-[#5C626E]">{i + 1}</span>
            <div className="min-w-0">
              <span className={`inline-flex items-center gap-1 font-mono text-[10.5px] uppercase ${step.cloud ? 'text-[#1D4ED8]' : 'text-[#0F766E]'}`}>
                {step.cloud ? <Cloud className="h-3 w-3" /> : <Cpu className="h-3 w-3" />}
                {step.where}
              </span>
              <p className="mt-0.5 break-words text-[12.5px] leading-snug text-[#141518]">{t(step.text)}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11.5px] text-[#5C626E]">
        {t(UI.hero.disclaimer)}
      </p>
    </section>
  );
}
