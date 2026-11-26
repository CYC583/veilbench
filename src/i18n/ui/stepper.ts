import type { Msg, MsgFn } from './types';

/** PipelineStepper strings. */
export const stepper = {
  navLabel: { en: 'Hybrid pipeline progress', zh: 'Hybrid 處理流程' },
  step1Title: { en: 'Local Airlock', zh: '本機脫敏氣閘' },
  planNano: { en: 'ON-DEVICE · Gemini Nano', zh: '端側 · Gemini Nano' },
  planDeterministic: { en: 'ON-DEVICE · Deterministic', zh: '端側 · 確定性規則' },
  step2Title: { en: 'Rapid Triage', zh: '快速風險篩檢' },
  planCloudFallback: { en: 'CLOUD FALLBACK', zh: '雲端備援' },
  step3Title: { en: 'Privacy Gate', zh: '隱私閘門' },
  step4Title: { en: 'Cloud Deep Audit', zh: '雲端深度稽核' },
  planCloudGemini: { en: 'IN_CLOUD · Gemini', zh: '雲端 · Gemini' },
  blocked: { en: 'BLOCKED', zh: '已阻擋' },
  retry: { en: 'RETRY AVAILABLE', zh: '可重試' },
} satisfies Record<string, Msg | MsgFn<never[]>>;
