import type { SupportedLocale } from '../types/audit';

/**
 * Display-layer zh-TW localization for runtime messages produced in English by the store, router,
 * Layer 3 guard and cloud resilience layer. English (the judged default) passes through unchanged.
 * Patterns are matched in order; unknown messages fall back to the original English text.
 */
const RULES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^Layer 1\/2\/3: Scanning PII strictly on-device & locking Local Vault\.\.\.$/, () => 'Layer 1/2/3：在裝置端掃描個資並鎖定本機代號庫…'],
  [/^Stage 2: Running rapid risk triage on-device via Chrome Gemini Nano\.\.\.$/, () => 'Stage 2：在裝置端以 Chrome Gemini Nano 執行快速風險篩檢…'],
  [/^Stage 2: Running rapid risk triage via Firebase AI Logic \(Sanitized Payload\)\.\.\.$/, () => 'Stage 2：以脫敏內容透過 Firebase AI Logic 執行快速風險篩檢…'],
  [/^Stage 4: Running Cross-Document Contradiction & Redline Audit via Cloud Gemini \(Zero-PII Verified\)\.\.\.$/, () => 'Stage 4：Cloud Gemini 正在進行跨文件矛盾與紅線稽核（已驗證零個資）…'],
  [/^Stage 4: Synthesizing Interactive Redline Diff & Negotiation Playbook via Cloud Gemini\.\.\.$/, () => 'Stage 4：Cloud Gemini 正在產生紅線修訂與談判劇本…'],
  [/^Sending sanitized follow-up & re-hydrating response locally\.\.\.$/, () => '送出脫敏後的追問，並在本機還原回覆…'],
  [/^Translating audit insights to Traditional Chinese \(PREFER_ON_DEVICE\)\.\.\.$/, () => '正在把稽核內容翻譯成繁體中文（PREFER_ON_DEVICE）…'],
  [/^\[(analysis|playbook)\] Cloud Gemini returned (\S+) — retrying on (\S+) \(attempt (\d+)\)\.\.\.$/,
    m => `［${m[1] === 'analysis' ? '分析' : '談判劇本'}］Cloud Gemini 回應 ${m[2]}，改用 ${m[3]} 重試（第 ${m[4]} 次）…`],
  [/^Cloud Gemini returned (\S+) — retrying on (\S+) \(attempt (\d+)\)\.\.\.$/,
    m => `Cloud Gemini 回應 ${m[1]}，改用 ${m[2]} 重試（第 ${m[3]} 次）…`],
  [/^Layer 3 Pre-Flight Circuit Breaker BLOCKED cloud escalation: (\d+) unredacted leak\(s\) detected\.$/,
    m => `Layer 3 發送前斷路器已阻擋上雲：偵測到 ${m[1]} 處未脫敏內容。`],
  [/^Pre-Flight Guard blocked your follow-up message due to an unredacted sensitive token\.$/, () => '你的追問含有未脫敏的敏感資訊，已被發送前檢查擋下。'],
  [/^Unsanitized payload blocked by Privacy Airlock\. Run local redaction first\.$/, () => '內容尚未脫敏，已被隱私氣閘擋下。請先完成本機脫敏。'],
  [/^Strict Local-Only mode is enabled\. Switch to Auto Hybrid or Cloud Deep to escalate\.$/, () => '目前為「僅限本機」模式。若要上雲，請切換到 Auto Hybrid 或 Cloud Deep。'],
  [/^Offline and Chrome Gemini Nano is unavailable\.$/, () => '目前離線，且 Chrome Gemini Nano 無法使用。'],
  [/^Policy: (\S+) → on-device only\. (.*)$/, m => `政策：${m[1]} 類文件僅限裝置端處理。${m[2].startsWith('This task needs the cloud') ? '這個步驟需要雲端，政策不允許。' : 'Chrome Gemini Nano 無法使用，因此無法執行這個步驟。'}`],
  [/^Cloud Gemini is temporarily overloaded \((\d+) attempts? across (\d+) models?\)\. .*$/,
    m => `Cloud Gemini 暫時忙線（已在 ${m[2]} 個模型上嘗試 ${m[1]} 次）。已脫敏的內容與本機代號庫都完好，請稍後重試。`],
  [/^Cloud quota is temporarily exhausted \((\d+) attempts? across (\d+) models?\)\. .*$/,
    m => `雲端額度暫時用完（已在 ${m[2]} 個模型上嘗試 ${m[1]} 次）。資料仍留在本機，請稍後重試或切換為僅限本機。`],
  [/^The configured cloud model is unavailable .*$/, () => '設定的雲端模型目前無法使用。請重試，或切換為僅限本機模式。'],
  [/^Firebase App Check rejected the cloud request\. .*$/, () => 'Firebase App Check 拒絕了這次雲端請求。請重新整理頁面以更新驗證後再試。'],
  [/^The network dropped before Cloud Gemini responded\. .*$/, () => '在 Cloud Gemini 回應前網路中斷。請重新連線後再試；本機脫敏在離線時仍可運作。'],
  [/^Cloud Gemini request failed unexpectedly .*$/, () => 'Cloud Gemini 請求意外失敗。已脫敏的內容不受影響，請重試。'],
  [/^Original value for (\[[A-Z_]+_\d+\]) remains in payload\.$/, m => `${m[1]} 的原始值仍留在內容中。`],
  [/^Raw ([A-Z_]+) pattern remains in payload\.$/, m => `內容中仍有未脫敏的 ${m[1]} 格式資料。`],
  [/^Unredacted ([A-Z_]+) remains in payload\.$/, m => `內容中仍有未脫敏的 ${m[1]}。`],
  [/^Uploaded image "(.+)" has not been reviewed after pixel redaction\.$/, m => `上傳的圖片「${m[1]}」在像素塗黑後尚未經過人工確認。`],
];

export function localizeRuntimeMessage(text: string, locale: SupportedLocale): string {
  if (locale !== 'zh-TW' || !text) return text;
  for (const [pattern, render] of RULES) {
    const m = text.match(pattern);
    if (m) return render(m);
  }
  return text;
}
