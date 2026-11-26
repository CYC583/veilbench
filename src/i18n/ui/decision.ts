import type { Msg, MsgFn } from './types';

/** DecisionCard strings. */
export const decision = {
  ctaTitle: { en: 'Get your sign-or-fix decision', zh: '簽約前，先拿到一個決定' },
  ctaBody: {
    en: 'An on-device first verdict and the cloud deep audit start together. The cloud only receives tokens and relations.',
    zh: '裝置端初判與雲端深度稽核同時開跑；雲端只會收到代號與關係。',
  },
  ctaButton: { en: 'Get the decision', zh: '產生簽約決定' },
  beforeYouSign: { en: 'Before you sign', zh: '簽約前決定' },
  basisFinal: { en: 'Cross-document audit · final', zh: '跨文件稽核 · 已完成' },
  basisDeepRunning: { en: 'First verdict · deep audit running', zh: '裝置端初判 · 雲端深度稽核進行中' },
  firstVerdict: { en: 'First verdict', zh: '初判' },
  cachedDemo: { en: 'Cached demo result', zh: '預錄示範結果' },
  workingOnVerdict: { en: 'Working on the first verdict…', zh: '正在產生初判…' },
  moneyDisagree: { en: 'Money your documents disagree on', zh: '合約與報價對不上的金額' },
  gapExplain: (a: string, op: string, b: string, bucket: string) => ({
    en: `Computed on this device. The cloud only saw ${a} ${op} ${b}, a ${bucket} gap.`,
    zh: `在這台裝置上算出。雲端只看到 ${a} ${op} ${b}，差距 ${bucket}。`,
  }),
  gapPending: {
    en: 'The exact money gap is computed locally once the cloud audit returns.',
    zh: '確切金額落差會在雲端稽核回來後，於本機算出。',
  },
  clausesToFix: (n: number) => ({ en: `Clauses to fix (${n})`, zh: `要修改的條款（${n}）` }),
  risksFlagged: (n: number) => ({ en: `Risks flagged so far (${n})`, zh: `初判發現的風險（${n}）` }),
  timerFirstVerdict: { en: 'First verdict', zh: '初判（先回來的答案）' },
  timerRunning: { en: 'running', zh: '執行中' },
  timerCloud: { en: 'Cloud deep audit (tokens only)', zh: '雲端深度稽核（只送代號）' },
  emailTitle: { en: 'Email to send (from you)', zh: '準備寄出的信（以你的身分）' },
  copied: { en: 'Copied', zh: '已複製' },
  copy: { en: 'Copy', zh: '複製' },
  openInMail: { en: 'Open in mail', zh: '用郵件開啟' },
  verify: { en: 'Verify what left this device', zh: '自己驗證送出了什麼' },
} satisfies Record<string, Msg | MsgFn<never[]>>;
