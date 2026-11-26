import type { Msg, MsgFn } from './types';

/** App strings. */
export const app = {
  dismissError: { en: 'Dismiss error', zh: '關閉錯誤訊息' },
  demoPrompt: {
    en: 'Want the walkthrough? The 30-second guided demo runs from sample to decision.',
    zh: '想再看一次？30 秒導覽會從載入範例一路跑到簽約決定。',
  },
  guidedDemo: { en: 'Guided demo', zh: '開始導覽' },
  stopDemo: { en: 'Stop', zh: '結束導覽' },
  intakeReceived: (name: string) => ({
    en: `Received "${name}". It is being masked on this device; nothing goes to the cloud until you ask.`,
    zh: `已收到「${name}」，正在本機遮蔽。要上雲前會先請你確認。`,
  }),
  dismiss: { en: 'Dismiss', zh: '關閉' },
  cancel: { en: 'Cancel', zh: '取消' },
  cancelled: {
    en: 'Cancelled. Nothing more was sent; run it again whenever you are ready.',
    zh: '已取消。沒有再送出任何內容；需要時可以重新執行。',
  },
} satisfies Record<string, Msg | MsgFn<never[]>>;
