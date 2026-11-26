import type { Msg, MsgFn } from './types';

/** PayloadInspectorModal strings. */
export const inspector = {
  dialogAria: { en: 'Live Outbound Payload Inspector', zh: '即時送出封包檢視器' },
  title: {
    en: 'Live Outbound Payload Inspector & SHA-256 Zero-Leak Proof',
    zh: '送雲端前封包透視與 SHA-256 零外洩憑證',
  },
  subtitle: {
    en: 'Exact sanitized payload cleared for Cloud Gemini escalation. Raw Local Vault never leaves your browser.',
    zh: '以下為即將發送給 Cloud Gemini 的完整位元組內容（零原始個資）。',
  },
  closeAria: { en: 'Close Inspector', zh: '關閉檢視器' },
  circuitPassed: {
    en: 'LAYER 3 PRE-FLIGHT CIRCUIT BREAKER: PASSED (0 LEAKS)',
    zh: 'LAYER 3 預檢斷路器：通過（0 項外洩）',
  },
  circuitBlocked: (n: number) => ({
    en: `LAYER 3 CIRCUIT BREAKER BLOCKED (${n} LEAKS FOUND)`,
    zh: `LAYER 3 斷路器已阻擋（發現 ${n} 項外洩）`,
  }),
  inspectedChars: (chars: string | number) => ({
    en: `Inspected ${chars} chars`,
    zh: `已檢查 ${chars} 字元`,
  }),
  proofTitle: { en: 'Web Crypto SHA-256 Boundary Proof', zh: 'Web Crypto SHA-256 邊界憑證' },
  vaultEntries: { en: 'Vault Entries', zh: '金庫項目' },
  rawHashLabel: { en: 'Raw Local Hash (Kept Local)', zh: '原始內容雜湊（僅留本機）' },
  sanitizedHashLabel: { en: 'Sanitized Outbound Hash (Cloud)', zh: '脫敏送出雜湊（雲端）' },
  imageAttachments: { en: 'Outbound Pixel-Burned Image Attachments', zh: '送出的像素塗黑影像附件' },
  imageAlt: (title: string) => ({
    en: `Outbound redacted ${title}`,
    zh: `送出的塗黑版 ${title}`,
  }),
  payloadTitle: { en: 'Exact Outbound Text Payload', zh: '實際送出的文字封包' },
  charsCount: (chars: string | number) => ({
    en: `${chars} chars`,
    zh: `${chars} 字元`,
  }),
  verifyTitle: { en: 'Verify yourself', zh: '自行驗證' },
  verifyBody: {
    en: 'Copy the payload above, then run this in a terminal — the digest must equal the outbound hash.',
    zh: '複製上方內容後，在終端機執行下列指令，結果應與「送出雜湊」完全相同。',
  },
  payloadCopied: { en: 'Payload copied', zh: '已複製送出內容' },
  copyPayload: { en: 'Copy exact payload', zh: '複製送出內容' },
  downloadPayload: { en: 'Download payload', zh: '下載送出內容' },
  tryLeak: { en: 'Try to leak: un-redact one token', zh: '試著外洩：關掉一個代號' },
  stage4Summary: {
    en: 'Stage 4 runs as 2 parallel calls, each appending one fixed task instruction (no document data)',
    zh: 'Stage 4 分成兩個平行呼叫：各自在上方內容後附加一段固定任務指示（不含任何文件資料）',
  },
  footerPassed: {
    en: 'Verified zero-leak. Safe to escalate via Firebase AI Logic + App Check.',
    zh: '已通過所有零外洩斷路器驗證，可安全送出。',
  },
  footerBlocked: {
    en: 'Re-enable redaction toggles in the Privacy Airlock to clear the circuit breaker.',
    zh: '請返回氣閘重新啟用被關閉的敏感詞脫敏。',
  },
  close: { en: 'Close', zh: '關閉' },
  approve: { en: 'Approve & Escalate to Cloud Gemini', zh: '核准並送雲端深度稽核' },
  ledgerTitle: { en: 'Network egress ledger (this session)', zh: '網路出口帳本（本次工作階段）' },
  ledgerDesc: (calls: number, bytes: string | number, unmatched: number) => ({
    en: `Every request that left this page: destination, bytes, SHA-256. AI Logic: ${calls} calls, ${bytes} bytes${unmatched ? `; ${unmatched} did not match this page's Layer 3 text (e.g. a separately sanitized follow-up)` : ''}. Bodies are never stored.`,
    zh: `每一個離開這個頁面的請求：目的地、位元組數、SHA-256。AI Logic：${calls} 次、${bytes} bytes${unmatched ? `，其中 ${unmatched} 次未對到本頁的 Layer 3 內容（例如另行脫敏的追問）` : ''}。不記錄內容。`,
  }),
  downloadJson: { en: 'Download outbound.json', zh: '下載 outbound.json' },
  ledgerEmpty: { en: 'Nothing has left this page yet.', zh: '還沒有任何請求離開這個頁面。' },
  colTime: { en: 'Time', zh: '時間' },
  colService: { en: 'Service', zh: '服務' },
  colHost: { en: 'Host', zh: '主機' },
  colLayer3: { en: 'Layer 3 text', zh: '已過 Layer 3' },
  yes: { en: 'yes', zh: '是' },
  noMatch: { en: 'no match', zh: '未對到' },
} satisfies Record<string, Msg | MsgFn<never[]>>;
