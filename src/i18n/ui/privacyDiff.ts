import type { Msg, MsgFn } from './types';

/** PrivacyDiffPane strings. */
export const privacyDiff = {
  title: { en: '3-Layer Local Privacy Airlock', zh: '3 層本機隱私氣閘比對' },
  sharedVault: (n: number) => ({
    en: `Shared Vault: ${n} ${n === 1 ? 'entity' : 'entities'}`,
    zh: `共享金庫：${n} 個實體`,
  }),
  preflightPass: { en: 'PRE-FLIGHT ZERO-LEAK PASS', zh: '預檢通過 · 零外洩' },
  leakDetected: (n: number) => ({
    en: `LEAK DETECTED (${n}) — CLOUD BLOCKED`,
    zh: `偵測到外洩（${n}）— 已阻擋上雲`,
  }),
  inspectPayload: { en: 'Inspect Payload & Proof', zh: '檢視送雲端封包 & SHA-256' },
  stage2Nano: { en: 'Stage 2 · Rapid Triage (On-Device)', zh: 'Stage 2 · 本機快速風險篩檢（Gemini Nano）' },
  stage2Cloud: { en: 'Stage 2 · Rapid Triage (Cloud Fallback)', zh: 'Stage 2 · 快速風險篩檢（雲端備援）' },
  blockedByBreaker: {
    en: 'Blocked by Layer 3 Pre-Flight Circuit Breaker until all leaks are redacted',
    zh: 'Layer 3 預檢斷路器已阻擋，所有外洩項目脫敏後才能送出',
  },
  sendSanitized: {
    en: 'Send strictly sanitized payload to Cloud Gemini',
    zh: '僅將嚴格脫敏後的封包送至雲端 Gemini',
  },
  stage4Multi: (n: number) => ({
    en: `Stage 4 · Cross-Doc Redline Audit (${n} Docs)`,
    zh: `Stage 4 · 跨文件矛盾與紅線稽核 (${n} 份)`,
  }),
  stage4Single: { en: 'Stage 4 · Cloud Redline Audit', zh: 'Stage 4 · 送雲端深度紅線談判稽核' },
  offline: { en: 'OFFLINE', zh: '離線' },
  toggleRedactions: (enabled: number, total: number) => ({
    en: `Toggle Redactions (${enabled}/${total}):`,
    zh: `點擊切換脫敏 (${enabled}/${total}):`,
  }),
  noEntities: {
    en: 'No raw PII entities detected in this document.',
    zh: '本文件未偵測到額外敏感實體。',
  },
  entityTitle: (layer: string, original: string) => ({
    en: `Layer: ${layer} | Original: ${original}`,
    zh: `層級：${layer} | 原始值：${original}`,
  }),
  manual: { en: 'Manual', zh: '手動' },
  missedTerm: { en: 'Missed something?', zh: '漏掉的詞：' },
  termPlaceholder: {
    en: 'Type a word to always mask, e.g. a name or project code',
    zh: '輸入要遮蔽的字詞，例如人名或專案代號',
  },
  typeLabel: { en: 'Type', zh: '類型' },
  rolePerson: { en: 'Person', zh: '人名' },
  roleOrganization: { en: 'Organization', zh: '公司／組織' },
  roleAddress: { en: 'Address', zh: '地址' },
  roleOther: { en: 'Other', zh: '其他' },
  maskIt: { en: 'Mask it', zh: '遮蔽' },
  statusAdded: {
    en: 'Masked in every document; the outbound check was re-run.',
    zh: '已遮蔽，並重新檢查送出內容。',
  },
  statusNotFound: {
    en: 'That word does not appear in these documents.',
    zh: '文件裡找不到這個詞。',
  },
  statusTooShort: { en: 'Enter at least 2 characters.', zh: '請至少輸入 2 個字。' },
  originalScan: { en: 'Original Local Scan (Never Uploaded)', zh: '本機原始掃描（絕不上傳）' },
  rawImageType: { en: 'RAW PNG/JPEG', zh: '原始 PNG/JPEG' },
  originalScanAlt: (title: string) => ({
    en: `Original local scan of ${title}`,
    zh: `${title} 的本機原始掃描`,
  }),
  doneDrawing: { en: 'Done drawing', zh: '完成框選' },
  drawBox: { en: 'Draw redaction box', zh: '手動框選塗黑' },
  undo: (n: number) => ({ en: `Undo (${n})`, zh: `復原（${n}）` }),
  drawHint: {
    en: 'Drag on the image to cover anything the detectors missed.',
    zh: '在上方圖片拖曳出要塗黑的範圍。',
  },
  burnedImage: { en: 'Canvas Pixel-Burned Safe Image', zh: 'Canvas 像素塗黑安全影像' },
  regionsBurned: (n: number) => ({ en: `${n} REGIONS BURNED`, zh: `已塗黑 ${n} 個區域` }),
  viewBurnedFull: { en: 'View burned image full screen', zh: '全螢幕檢視塗黑影像' },
  safeImageAlt: (title: string) => ({
    en: `Pixel-redacted safe version of ${title}`,
    zh: `${title} 的像素塗黑安全版本`,
  }),
  previewPending: { en: 'Pixel redaction preview pending', zh: '像素塗黑預覽處理中' },
  reviewConfirm: {
    en: 'I reviewed the burned preview above and no names, account numbers or other identifiers remain. Until checked, Layer 3 keeps this image on-device.',
    zh: '我已檢查上方塗黑預覽，圖片中沒有殘留的姓名、帳號或其他識別資訊。未勾選前，Layer 3 不允許這張圖片離開裝置。',
  },
  tabRaw: { en: 'Raw (local)', zh: '本機原文' },
  tabOutbound: { en: 'Outbound (sanitized)', zh: '送出內容（脫敏）' },
  rawDocument: { en: 'Raw Local Document (Stays in Browser)', zh: '本機原始文件（絕不離開瀏覽器）' },
  chars: (n: string) => ({ en: `${n} chars`, zh: `${n} 字元` }),
  safePayload: { en: 'Sanitized Safe Payload (Cloud-Cleared)', zh: '脫敏安全封包（僅此版本允許送雲端）' },
  burnedDialog: { en: 'Burned image full screen', zh: '塗黑影像全螢幕檢視' },
  close: { en: 'Close', zh: '關閉' },
} satisfies Record<string, Msg | MsgFn<never[]>>;
