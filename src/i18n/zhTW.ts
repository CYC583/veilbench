import type { NanoAvailabilityStatus } from '../types/hybrid';

/** Traditional Chinese (zh-TW) labels for Chrome Gemini Nano availability states. */
export const NANO_STATUS_ZH: Record<NanoAvailabilityStatus, string> = {
  available: '可用',
  downloadable: '可下載',
  downloading: '下載中',
  unavailable: '無法使用',
  unsupported_browser: '瀏覽器不支援',
};
