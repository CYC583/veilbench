import type { Msg, MsgFn } from './types';

/** NanoSetupBanner strings. JSX is split into pieces; leading/trailing spaces match the original JSX whitespace. */
export const nanoSetup = {
  cloudTitle: { en: 'Cloud-safe mode:', zh: '雲端安全模式：' },
  cloudBefore: { en: ' Gemini Nano is ', zh: '這個瀏覽器的 Gemini Nano 目前' },
  cloudAfter: {
    en: 'in this browser, so masking uses local rules and the quick check runs in the cloud on tokens only. Raw names and numbers still never leave this device.',
    zh: '，所以遮蔽改由本機規則完成，快速初判改在雲端用代號執行。原始姓名與數字仍不會離開這台裝置。',
  },
  localTitle: { en: 'Local Airlock Preview:', zh: '本機預覽模式：' },
  localBefore: {
    en: ' Firebase credentials are not configured in ',
    zh: '尚未設定 Firebase 憑證（',
  },
  localAfter: {
    en: ' yet. Local PII redaction, Canvas burn-in, and SHA-256 proofs work offline right now.',
    zh: '），本機隱私氣閘、Canvas 塗黑與 SHA-256 憑證皆可完整運作。',
  },
  enableButton: { en: 'Enable Chrome Gemini Nano', zh: '啟用 Chrome Gemini Nano 教學' },
  stepsIntro: {
    en: 'Enable on-device Gemini Nano in Chrome Desktop 139+ (free, offline-capable):',
    zh: '在 Chrome Desktop 139+ 啟用端側 Gemini Nano（完全免費、斷網可跑）：',
  },
  stepOpen: { en: 'Open ', zh: '開啟 ' },
  stepArrowSelect: { en: ' → select ', zh: ' → 選擇 ' },
  step1Sep: { en: ' — ', zh: '，即 ' },
  step1Tail: { en: ' (Gemini Nano 4 on-device model)', zh: '（Gemini Nano 4 端側模型）' },
  step3Tail: { en: ' (for local image inspection)', zh: '（用於本機影像檢查）' },
  step4Before: {
    en: 'Relaunch Chrome and check model download status at ',
    zh: '重新啟動 Chrome，並至 ',
  },
  step4Tail: { en: '', zh: ' 確認模型下載狀態' },
} satisfies Record<string, Msg | MsgFn<never[]>>;
