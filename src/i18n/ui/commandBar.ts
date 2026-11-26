import type { Msg, MsgFn } from './types';

/** TopCommandBar strings. */
export const commandBar = {
  nanoReady: { en: 'Gemini Nano Ready', zh: 'Gemini Nano 就緒' },
  nanoDownloading: { en: 'Nano Downloading', zh: 'Nano 下載中' },
  nanoDownloadable: { en: 'Nano Downloadable', zh: 'Nano 可下載' },
  deterministicShield: { en: 'Deterministic Shield', zh: '確定性防禦盾' },
  tagline: {
    en: 'Multimodal On-Device Privacy Airlock & Cloud Redline Workbench',
    zh: '多模態零外洩混合 AI 文件稽核與談判工作台',
  },
  routingModeAria: { en: 'Hybrid Inference Routing Mode', zh: 'Hybrid 推論路由模式' },
  online: { en: 'ONLINE', zh: '連線中' },
  offline: { en: 'OFFLINE', zh: '離線' },
  toggleLocaleTitle: {
    en: 'Toggle English / Traditional Chinese (On-Device AI Semantic Translation)',
    zh: '切換英文／繁體中文（端側 AI 語意翻譯）',
  },
  translating: { en: 'Translating...', zh: '翻譯中...' },
  toggleLocaleLabel: { en: 'EN → 繁中', zh: '繁中 → EN' },
  history: { en: 'History', zh: '紀錄' },
  resetTitle: { en: 'Reset Workspace', zh: '重設工作區' },
  resetAria: { en: 'Reset workspace', zh: '重設工作區' },
  reset: { en: 'Reset', zh: '重設' },
} satisfies Record<string, Msg | MsgFn<never[]>>;
