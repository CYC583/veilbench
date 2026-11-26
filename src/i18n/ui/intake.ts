import type { Msg, MsgFn } from './types';

/** DocumentIntake strings. */
export const intake = {
  // Shown for the zh locale; English shows the service's own error message.
  errTooLarge: { en: 'Files up to 20 MB are supported.', zh: '檔案超過 20 MB，請改用較小的檔案。' },
  errUnsupported: { en: 'Supported files: PDF, Word (.docx), text, PNG and JPEG.', zh: '支援的檔案：PDF、Word（.docx）、文字檔、PNG 與 JPEG。' },
  errUnreadable: { en: 'This file could not be read.', zh: '這個檔案無法讀取（可能已加密或損毀）。' },
  errEmpty: { en: 'This file is empty.', zh: '這個檔案裡沒有可讀的文字。' },
  scanPlaceholder: (name: string): Msg => ({
    en: `Uploaded scan: ${name}\n(Add optional OCR notes or sensitive fields here to combine with visual pixel redaction.)`,
    zh: `已上傳掃描件：${name}\n（可在此補充 OCR 筆記或敏感欄位，與影像像素塗黑一併處理。）`,
  }),
  pagesRead: (pages: number): Msg => ({
    en: `Read ${pages} page(s) on this device`,
    zh: `已在本機讀取 ${pages} 頁`,
  }),
  scannedPdf: {
    en: 'Looks scanned: page 1 was turned into an image for pixel redaction',
    zh: '偵測為掃描檔，第 1 頁轉成圖片以便像素塗黑',
  },
  imageScaled: (width: number, height: number): Msg => ({
    en: `Image scaled down from ${width}×${height}`,
    zh: `圖片已從 ${width}×${height} 縮小`,
  }),
  workspaceDocs: { en: 'Workspace Documents', zh: '共享工作區文件' },
  removeDoc: (title: string): Msg => ({ en: `Remove ${title}`, zh: `移除 ${title}` }),
  addDoc: { en: 'Add Document for Cross-Doc Audit', zh: '加入文件做跨檔稽核' },
  heading: {
    en: 'Inspect sensitive documents without leaking raw PII to the cloud.',
    zh: '本機零外洩隱私氣閘 — 開始稽核文件',
  },
  intro: {
    en: 'For freelancers and small studios reviewing client contracts and quotes. Load a sample below or drop your own text/image scan — every identifier, secret key and image region is redacted locally before any cloud escalation.',
    zh: '給審閱客戶合約與報價單的自由工作者與小型工作室。選擇下方範例，或直接拖曳文字／掃描件；所有個資都會先在瀏覽器端以 3 層防禦鎖定與塗黑，再決定是否上雲。',
  },
  backToWorkspace: { en: 'Back to Workspace', zh: '返回工作區' },
  bundlesTitle: { en: 'One-Click Evaluation Bundles (Zero Setup)', zh: '一鍵載入評審示範包（含程式生成掃描圖）' },
  docCount: (n: number): Msg => ({
    en: `${n} ${n > 1 ? 'DOCS' : 'DOC'}`,
    zh: `${n} 份文件`,
  }),
  load: { en: 'Load →', zh: '載入 →' },
  customTitle: { en: 'Drop Scan or Paste Sensitive Text', zh: '上傳或貼上自訂文件' },
  categoryLabel: { en: 'Document Category', zh: '文件類別' },
  catContract: { en: 'Contract / Legal', zh: '合約／法務' },
  catMedical: { en: 'Medical / Lab', zh: '醫療／檢驗' },
  catFinancial: { en: 'Financial / Invoice', zh: '財務／發票' },
  catOther: { en: 'Other', zh: '其他' },
  imageAttached: { en: 'Image scan attached (click to replace)', zh: '已附加圖片掃描件（點擊可更換）' },
  dropHint: {
    en: 'Drop a PDF, Word file, text file or PNG/JPEG here, or click to browse (read on this device only)',
    zh: '拖曳 PDF、Word、文字檔或 PNG／JPEG 至此，或點擊選擇（只在本機讀取）',
  },
  reading: { en: 'Reading the file on this device…', zh: '正在本機讀取檔案…' },
  docTitleLabel: { en: 'Document Title', zh: '文件標題' },
  docTitlePlaceholder: { en: 'e.g. Consulting Agreement Draft.txt', zh: '例如：顧問合約草稿.txt' },
  rawLabel: { en: 'Raw Local Content (Stays in Browser)', zh: '原始敏感內容（僅留存本機瀏覽器）' },
  rawPlaceholder: {
    en: 'Paste contract clauses, emails, SSN, IBAN, or API keys...',
    zh: '貼上合約條款、Email、身分證號、IBAN 或 API 金鑰...',
  },
  runAirlock: { en: 'Run Local 3-Layer Privacy Airlock', zh: '執行本機 3 層隱私氣閘掃描' },
} satisfies Record<string, Msg | MsgFn<never[]>>;
