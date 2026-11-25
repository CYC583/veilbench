import { useEffect } from 'react';
import { Clock, Database, ShieldCheck, X } from 'lucide-react';
import type { SanitizedFirestoreSession, SupportedLocale } from '../types/audit';

interface SessionHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSession: (session: SanitizedFirestoreSession) => void;
  sessions: SanitizedFirestoreSession[];
  locale: SupportedLocale;
}

export function SessionHistoryDrawer({
  isOpen,
  onClose,
  onSelectSession,
  sessions,
  locale,
}: SessionHistoryDrawerProps) {
  const isZh = locale === 'zh-TW';

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
        className="flex h-full w-full max-w-md flex-col border-l border-[#E2E5EA] bg-[#FFFFFF]"
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
          <button
            type="button"
            onClick={onClose}
            aria-label={isZh ? '關閉稽核紀錄' : 'Close session history'}
            className="flex h-11 w-11 items-center justify-center rounded-md border border-[#E2E5EA] bg-[#FFFFFF] text-[#5C626E] hover:text-[#141518] sm:h-8 sm:w-8"
          >
            <X className="h-4 w-4" />
          </button>
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
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectSession(s)}
                className="w-full rounded-md border border-[#E2E5EA] bg-[#FFFFFF] p-3.5 text-left transition-colors hover:border-[#0F766E] hover:bg-[#F8F9FA]"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[13.5px] font-semibold text-[#141518]">{s.title}</span>
                  <span className="rounded bg-[#F1F3F5] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[#5C626E]">
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}
