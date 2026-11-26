import type { Msg, MsgFn } from './types';

/** SessionHistoryDrawer strings. */
export const history = {
  dialogLabel: { en: 'Zero-PII Audit Session History', zh: 'Zero-PII 稽核紀錄' },
  title: { en: 'Zero-PII Firestore Session History', zh: 'Zero-PII 雲端／離線稽核紀錄' },
  confirmDeleteAll: (n: number): Msg => ({ en: `Delete all ${n}?`, zh: `確定刪除全部 ${n} 筆？` }),
  deleteAll: { en: 'Delete all', zh: '全部刪除' },
  close: { en: 'Close session history', zh: '關閉稽核紀錄' },
  empty: {
    en: 'No persisted sessions yet. Run Stage 2 Rapid Triage or Stage 4 Deep Audit to store Zero-PII records in Firestore (works offline via persistentLocalCache).',
    zh: '尚無已儲存的稽核紀錄。執行 Stage 2 快篩或 Stage 4 深度稽核後，脫敏紀錄將自動存入 Firestore（離線亦會快取）。',
  },
  docCount: (n: number): Msg => ({ en: `${n} doc(s)`, zh: `${n} 份文件` }),
  clickToRestore: { en: 'Click to restore', zh: '點擊載入' },
  deleteSession: (title: string): Msg => ({ en: `Delete session: ${title}`, zh: `刪除紀錄：${title}` }),
  confirmDelete: { en: 'Confirm delete', zh: '確定刪除？' },
  delete: { en: 'Delete', zh: '刪除' },
} satisfies Record<string, Msg | MsgFn<never[]>>;
