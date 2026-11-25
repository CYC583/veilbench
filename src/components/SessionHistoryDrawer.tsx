import { useRef, useState } from 'react';
import { Clock, Database, ShieldCheck, Trash2, X } from 'lucide-react';
import { useDialogA11y } from './useDialogA11y';
import type { SanitizedFirestoreSession, SupportedLocale } from '../types/audit';

interface SessionHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSession: (session: SanitizedFirestoreSession) => void;
  /** Deletes the given sessions, or all of them when ids is omitted. */
  onDeleteSessions?: (ids?: string[]) => void;
  sessions: SanitizedFirestoreSession[];
  locale: SupportedLocale;
}

export function SessionHistoryDrawer({
  isOpen,
  onClose,
  onSelectSession,
  onDeleteSessions,
  sessions,
  locale,
}: SessionHistoryDrawerProps) {
  const isZh = locale === 'zh-TW';

  const panelRef = useRef<HTMLDivElement | null>(null);
  // Two-step delete: the first click arms it, the second confirms ('all' or a session id).
  const [armed, setArmed] = useState<string | null>(null);
  useDialogA11y(panelRef, isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#141518]/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={isZh ? 'Zero-PII 稽核紀錄' : 'Zero-PII Audit Session History'}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex h-full w-full max-w-md flex-col border-l border-[#E2E5EA] bg-[#FFFFFF] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E2E5EA] bg-[#F8F9FA] px-5 py-4">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-[#0F766E]" />
            <div>
              <h2 className="text-[14px] font-semibold text-[#141518]">
                {isZh ? 'Zero-PII 雲端／離線稽核紀錄' : 'Zero-PII Firestore Session History'}
              </h2>
              <p className="font-mono text-[11px] text-[#5C626E]">
                Anonymous Auth · persistentLocalCache
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
          {onDeleteSessions && sessions.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (armed === 'all') {
                  onDeleteSessions();
                  setArmed(null);
                } else {
                  setArmed('all');
                }
              }}
              className={`min-h-[44px] rounded-md border px-2.5 text-[12px] font-medium sm:min-h-[32px] ${
                armed === 'all' ? 'border-[#BE123C] bg-[#BE123C] text-[#FFFFFF]' : 'border-[#E2E5EA] bg-[#FFFFFF] text-[#BE123C]'
              }`}
            >
              {armed === 'all'
                ? isZh ? `確定刪除全部 ${sessions.length} 筆？` : `Delete all ${sessions.length}?`
                : isZh ? '全部刪除' : 'Delete all'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={isZh ? '關閉稽核紀錄' : 'Close session history'}
            className="flex h-11 w-11 items-center justify-center rounded-md border border-[#E2E5EA] bg-[#FFFFFF] text-[#5C626E] hover:text-[#141518] sm:h-8 sm:w-8"
          >
            <X className="h-4 w-4" />
          </button>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {sessions.length === 0 ? (
            <div className="rounded-md border border-dashed border-[#E2E5EA] bg-[#F8F9FA] p-4 text-[13px] text-[#5C626E]">
              {isZh
                ? '尚無已儲存的稽核紀錄。執行 Stage 2 快篩或 Stage 4 深度稽核後，脫敏紀錄將自動存入 Firestore（離線亦會快取）。'
                : 'No persisted sessions yet. Run Stage 2 Rapid Triage or Stage 4 Deep Audit to store Zero-PII records in Firestore (works offline via persistentLocalCache).'}
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className="rounded-md border border-[#E2E5EA] bg-[#FFFFFF] transition-colors hover:border-[#0F766E]"
              >
                <button
                  type="button"
                  onClick={() => onSelectSession(s)}
                  className="w-full p-3.5 text-left hover:bg-[#F8F9FA]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words text-[13.5px] font-semibold text-[#141518]">{s.title}</span>
                    <span className="shrink-0 rounded bg-[#F1F3F5] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[#5C626E]">
                      {s.category}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#5C626E]">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {s.updatedAt.slice(0, 16).replace('T', ' ')}
                    </span>
                    <span>· {isZh ? `${s.documentCount} 份文件` : `${s.documentCount} doc(s)`}</span>
                    <span className="text-[#0F766E]">· {isZh ? '點擊載入' : 'Click to restore'}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 rounded bg-[#F0FDFA] px-2 py-1 font-mono text-[10.5px] text-[#0F766E]">
                    <ShieldCheck className="h-3 w-3 shrink-0" />
                    <span className="truncate">SHA-256: {s.zeroLeakProofHash}</span>
                  </div>
                </button>
                {onDeleteSessions && (
                  <div className="flex justify-end border-t border-[#E2E5EA] px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (armed === s.id) {
                          onDeleteSessions([s.id]);
                          setArmed(null);
                        } else {
                          setArmed(s.id);
                        }
                      }}
                      aria-label={isZh ? `刪除紀錄：${s.title}` : `Delete session: ${s.title}`}
                      className={`inline-flex min-h-[40px] items-center gap-1 rounded px-2 text-[12px] font-medium sm:min-h-[28px] ${
                        armed === s.id ? 'bg-[#BE123C] text-[#FFFFFF]' : 'text-[#BE123C] hover:bg-[#FFF1F2]'
                      }`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {armed === s.id ? (isZh ? '確定刪除？' : 'Confirm delete') : isZh ? '刪除' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
