import type { Msg, MsgFn } from './types';

/** AuditWorkbench strings. */
export const workbench = {
  stepTriage: { en: 'Stage 2 Rapid Triage', zh: 'Stage 2 快速風險篩檢' },
  stepDeepAudit: { en: 'Stage 4 Cloud Redline Audit', zh: 'Stage 4 雲端紅線稽核' },
  stepChat: { en: 'Follow-Up Chat', zh: '多輪追問' },
  partialPlaybook: { en: 'negotiation playbook & email', zh: '談判劇本與 Email' },
  partialAnalysis: { en: 'contradiction & redline analysis', zh: '矛盾與紅線分析' },
  failurePartial: (step: Msg, part: Msg) => ({
    en: `${step.en} partially completed — ${part.en} missing`,
    zh: `${step.zh} 部分完成：${part.zh}未完成`,
  }),
  failureDidNotComplete: (step: Msg) => ({
    en: `${step.en} did not complete`,
    zh: `${step.zh} 未完成`,
  }),
  attempts: (n: number) => ({
    en: `${n} ${n === 1 ? 'ATTEMPT' : 'ATTEMPTS'}`,
    zh: `嘗試 ${n} 次`,
  }),
  failureReassurance: {
    en: 'Local redaction, the Local Vault and the Layer 3 proof are untouched. Retry resends the same sanitized payload.',
    zh: '本機脫敏、Local Vault 與 Layer 3 驗證結果都保留，重試只會送出同一份已脫敏內容。',
  },
  retryStep: (step: Msg) => ({ en: `Retry ${step.en}`, zh: `重試 ${step.zh}` }),
  dismiss: { en: 'Dismiss', zh: '關閉' },
  severityHigh: { en: 'high', zh: '高' },
  severityMedium: { en: 'medium', zh: '中' },
  severityLow: { en: 'low', zh: '低' },
  cloudModel: { en: 'cloud model', zh: '雲端模型' },
  cachedTitle: (model: string, when: string) => ({
    en: `Recorded real ${model} output (${when}). The live cloud call failed; use Retry for a fresh result.`,
    zh: `這是先前錄製的 ${model} 真實輸出（${when}）。即時雲端呼叫失敗，可按重試取得最新結果。`,
  }),
  cachedDemoResult: { en: 'Cached demo result', zh: '快取示範結果' },
  title: { en: 'Audit Findings & Negotiation Workbench', zh: '稽核分析與紅線談判工作台' },
  viewRehydrated: { en: 'On-Device Re-hydrated', zh: '本機還原視圖' },
  viewSanitized: { en: 'Zero-PII Sanitized', zh: '零個資脫敏視圖' },
  exportReport: { en: 'Export Zero-PII Report (.md)', zh: '匯出零個資報告 (.md)' },
  emptyTitle: { en: 'No AI analysis yet', zh: '尚未執行 AI 分析' },
  emptyStage2: {
    en: 'Rapid Triage runs on Gemini Nano when available, otherwise on the sanitized payload in the cloud.',
    zh: '快速風險篩檢：Nano 可用時在裝置端執行，否則使用已脫敏內容走雲端備援。',
  },
  emptyStage4: {
    en: 'Cloud Redline Audit sends only the Layer 3-verified, tokenized payload to Cloud Gemini.',
    zh: '雲端深度稽核：通過 Layer 3 檢查後，才會把代號化內容送到 Cloud Gemini。',
  },
  overallRisk: (severityEn: string, severityZh: string) => ({
    en: `${severityEn} RISK`,
    zh: `${severityZh}風險`,
  }),
  triageTitle: { en: 'Stage 2 Rapid Risk Triage', zh: 'Stage 2 快速風險篩檢' },
  contradictionsTitle: (n: number) => ({
    en: `Cross-Document Contradictions (${n})`,
    zh: `跨文件矛盾稽核警示 (${n})`,
  }),
  recommendedFix: { en: 'Recommended Fix', zh: '建議修正' },
  redlinesTitle: (n: number) => ({
    en: `Interactive Redline Diff (${n})`,
    zh: `互動式紅線修訂建議 (${n})`,
  }),
  rationale: { en: 'Rationale:', zh: '理由：' },
  playbookTitle: { en: 'Negotiation Playbook', zh: '談判應對劇本' },
  localRehydrated: { en: 'LOCAL RE-HYDRATED', zh: '本機還原' },
  zeroPii: { en: 'ZERO-PII', zh: '零個資' },
  pushbackTitle: { en: 'Anticipated Pushback & Counter-Scripts', zh: '預期反對意見與應對話術' },
  ifTheySay: { en: 'If they say', zh: '若對方說' },
  respond: { en: 'Respond', zh: '回應' },
  emailTitle: { en: 'Ready-to-Send Negotiation Email', zh: '一鍵還原談判 Email' },
  openInMail: { en: 'Open in mail app', zh: '用郵件 App 開啟' },
  copied: { en: 'Copied', zh: '已複製' },
  copy: { en: 'Copy', zh: '複製' },
  chatTitle: { en: 'Zero-Leak Follow-Up Chat', zh: '多輪零外洩追問' },
  autoRedacts: { en: 'Auto-Redacts Input', zh: '輸入自動脫敏' },
  chatEmpty: {
    en: 'Ask follow-up questions on liability caps, IP carve-outs, or payment terms. Any names or amounts you type are redacted locally first.',
    zh: '可針對條款細節、賠償上限或談判策略追問；您輸入的任何名字或金額都會先在本機自動脫敏後才送出。',
  },
  roleUser: { en: 'You (Local)', zh: '您（本機）' },
  roleAuditor: { en: 'VeilBench Auditor', zh: 'VeilBench 稽核員' },
  chatPlaceholder: {
    en: 'e.g. Draft a 1x fee liability cap clause...',
    zh: '例如：請幫我擬一段限制賠償上限為合約總額的條文...',
  },
  sendFollowUp: { en: 'Send follow-up question', zh: '送出追問' },
} satisfies Record<string, Msg | MsgFn<never[]>>;
