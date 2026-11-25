import { ArrowRight, Cloud, Cpu, PlayCircle } from 'lucide-react';
import type { SupportedLocale } from '../types/audit';

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
  const isZh = locale === 'zh-TW';
  const route = [
    {
      where: 'ON_DEVICE', cloud: false,
      en: 'Names, amounts, dates and IDs become tokens, in text and image pixels.',
      zh: '姓名、金額、日期、證號在文字與圖片像素中都換成代號。',
    },
    {
      where: 'IN_CLOUD', cloud: true,
      en: 'Gemini reasons on tokens and relations only: [MONEY_AMOUNT_1] > [MONEY_AMOUNT_3], 5–15%.',
      zh: 'Gemini 只看代號與關係：[MONEY_AMOUNT_1] > [MONEY_AMOUNT_3]，差 5–15%。',
    },
    {
      where: 'ON_DEVICE', cloud: false,
      en: 'Your device computes the exact gap and writes the sign-or-fix decision.',
      zh: '你的裝置算出確切差額，並給出「簽或先改」的決定。',
    },
  ];

  return (
    <section className="rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-4 py-6 sm:px-8 sm:py-8" aria-labelledby="hero-title">
      <p className="font-mono text-[11px] uppercase tracking-wide text-[#5C626E]">
        {isZh ? '給接案者與小型工作室：簽客戶合約之前' : 'For freelancers and small studios, before you sign a client contract'}
      </p>
      <h1 id="hero-title" className="mt-2 max-w-[22ch] text-[30px] font-semibold leading-[1.1] tracking-tight text-[#141518] sm:text-[40px]">
        {isZh ? '簽約前，抓出那 $6,000。' : 'Catch the $6,000 before you sign.'}
      </h1>
      <p className="mt-3 max-w-[62ch] text-[14.5px] leading-relaxed text-[#3B414B]">
        {isZh
          ? 'VeilBench 交叉比對客戶的合約與報價。姓名和數字留在這台裝置上，雲端只推理關係；離開裝置的每一個位元組，你都能自己驗證。'
          : "VeilBench cross-checks your client's contract and quote. Names and numbers stay on this device, the cloud reasons on relationships only, and you can verify every byte that left."}
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
          {isZh ? '執行 30 秒示範' : 'Run the 30-second demo'}
        </button>
        <button
          type="button"
          onClick={onTryOwn}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-5 text-[15px] font-medium text-[#141518]"
        >
          {isZh ? '用自己的文件試試' : 'Try your own documents'}
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
              <p className="mt-0.5 break-words text-[12.5px] leading-snug text-[#141518]">{isZh ? step.zh : step.en}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11.5px] text-[#5C626E]">
        {isZh ? '不構成法律建議。範例文件皆為虛構。' : 'Not legal advice. Sample documents are fictional.'}
      </p>
    </section>
  );
}
