import type { Msg } from './types';

/** HeroIntro: the first screen when no documents are loaded. */
export const hero = {
  eyebrow: { en: 'For freelancers and small studios, before you sign a client contract', zh: '給接案者與小型工作室：簽客戶合約之前' },
  title: { en: 'Catch the $6,000 before you sign.', zh: '簽約前，抓出那 $6,000。' },
  lede: {
    en: "VeilBench cross-checks your client's contract and quote. Names and numbers stay on this device, the cloud reasons on relationships only, and you can verify every byte that left.",
    zh: 'VeilBench 交叉比對客戶的合約與報價。姓名和數字留在這台裝置上，雲端只推理關係；離開裝置的每一個位元組，你都能自己驗證。',
  },
  runDemo: { en: 'Run the 30-second demo', zh: '執行 30 秒示範' },
  tryOwn: { en: 'Try your own documents', zh: '用自己的文件試試' },
  routeTokenize: {
    en: 'Names, amounts, dates and IDs become tokens, in text and image pixels.',
    zh: '姓名、金額、日期、證號在文字與圖片像素中都換成代號。',
  },
  routeCloud: {
    en: 'Gemini reasons on tokens and relations only: [MONEY_AMOUNT_1] > [MONEY_AMOUNT_3], 5–15%.',
    zh: 'Gemini 只看代號與關係：[MONEY_AMOUNT_1] > [MONEY_AMOUNT_3]，差 5–15%。',
  },
  routeDecide: {
    en: 'Your device computes the exact gap and writes the sign-or-fix decision.',
    zh: '你的裝置算出確切差額，並給出「簽或先改」的決定。',
  },
  disclaimer: { en: 'Not legal advice. Sample documents are fictional.', zh: '不構成法律建議。範例文件皆為虛構。' },
} satisfies Record<string, Msg>;
