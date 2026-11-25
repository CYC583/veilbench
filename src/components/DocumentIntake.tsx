import { useRef, useState, type DragEvent } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Layers,
  Plus,
  ShieldAlert,
  Stethoscope,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  DocumentCategory,
  SupportedLocale,
  WorkbenchDocument,
} from '../types/audit';
import { SAMPLE_PACKS } from '../data/sampleDocuments';

interface DocumentIntakeProps {
  documents: WorkbenchDocument[];
  activeDocId: string | null;
  isBusy: boolean;
  locale: SupportedLocale;
  onSelectDoc: (docId: string) => void;
  onLoadSample: (packId: string) => void;
  onAddDocument: (params: {
    title: string;
    category: DocumentCategory;
    rawText: string;
    rawImageDataUrl?: string;
  }) => void;
  onRemoveDocument: (docId: string) => void;
}

export function DocumentIntake({
  documents,
  activeDocId,
  isBusy,
  locale,
  onSelectDoc,
  onLoadSample,
  onAddDocument,
  onRemoveDocument,
}: DocumentIntakeProps) {
  const isZh = locale === 'zh-TW';
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('contract');
  const [rawText, setRawText] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setImageDataUrl(reader.result);
          if (!title) setTitle(file.name);
          if (!rawText) {
            setRawText(
              isZh
                ? `已上傳掃描件：${file.name}\n（可在此補充 OCR 筆記或敏感欄位，與影像像素塗黑一併處理。）`
                : `Uploaded scan: ${file.name}\n(Add optional OCR notes or sensitive fields here to combine with visual pixel redaction.)`
            );
          }
          setShowCustomForm(true);
        }
      };
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setTitle(file.name);
        setRawText(reader.result);
        setShowCustomForm(true);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawText.trim() && !imageDataUrl) return;
    onAddDocument({
      title: title.trim() || 'Uploaded Document.txt',
      category,
      rawText: rawText.trim(),
      rawImageDataUrl: imageDataUrl,
    });
    setTitle('');
    setRawText('');
    setImageDataUrl(undefined);
    setShowCustomForm(false);
  };

  const getSampleIcon = (cat: DocumentCategory) => {
    switch (cat) {
      case 'contract':
        return <Layers className="h-4 w-4 text-[#0F766E]" />;
      case 'medical':
        return <Stethoscope className="h-4 w-4 text-[#0F766E]" />;
      default:
        return <ShieldAlert className="h-4 w-4 text-[#0F766E]" />;
    }
  };

  if (documents.length > 0 && !showCustomForm) {
    return (
      <section className="rounded-lg border border-[#E2E5EA] bg-[#FFFFFF] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-[#5C626E]">
              {isZh ? '共享工作區文件' : 'Workspace Documents'} ({documents.length})
            </span>
            {documents.map((doc) => {
              const active = doc.id === activeDocId;
              return (
                <div
                  key={doc.id}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
                    active
                      ? 'border-[#0F766E] bg-[#F0FDFA] font-medium text-[#141518]'
                      : 'border-[#E2E5EA] bg-[#F8F9FA] text-[#5C626E] hover:text-[#141518]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectDoc(doc.id)}
                    className="inline-flex items-center gap-1.5"
                  >
                    {doc.rawImageDataUrl ? (
                      <ImageIcon className="h-3.5 w-3.5 text-[#0F766E]" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 text-[#5C626E]" />
                    )}
                    <span className="max-w-[220px] truncate">{doc.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveDocument(doc.id)}
                    aria-label={isZh ? `移除 ${doc.title}` : `Remove ${doc.title}`}
                    className="ml-1 rounded p-0.5 text-[#5C626E] hover:text-[#BE123C]"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setShowCustomForm(true)}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-3 py-1.5 text-[12px] font-medium text-[#141518] transition-colors hover:border-[#0F766E]/60 hover:text-[#0F766E] active:translate-y-px"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{isZh ? '加入文件做跨檔稽核' : 'Add Document for Cross-Doc Audit'}</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[#E2E5EA] bg-[#FFFFFF] p-5 sm:p-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-[20px] font-semibold tracking-[-0.025em] text-[#141518]">
                {isZh
                  ? '本機零外洩隱私氣閘 — 開始稽核文件'
                  : 'Inspect sensitive documents without leaking raw PII to the cloud.'}
              </h1>
              <p className="mt-1 max-w-[65ch] text-[14px] leading-relaxed text-[#5C626E]">
                {isZh
                  ? '選擇下方任一真實範例（含合約＋報價單圖片跨文件矛盾組），或直接拖曳文字／掃描件。所有個資皆在瀏覽器端以 3 層防禦先行鎖定與塗黑。'
                  : 'Load a realistic sample bundle below or drop your own text/image scan. Every personal identifier, secret key, and image region is redacted locally before any cloud escalation.'}
              </p>
            </div>
            {documents.length > 0 && (
              <button
                type="button"
                onClick={() => setShowCustomForm(false)}
                className="rounded-md border border-[#E2E5EA] px-2.5 py-1 text-[12px] text-[#5C626E] hover:text-[#141518]"
              >
                {isZh ? '返回工作區' : 'Back to Workspace'}
              </button>
            )}
          </div>

          <div className="mt-4 space-y-2.5">
            <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-[#5C626E]">
              {isZh ? '一鍵載入評審示範包（含程式生成掃描圖）' : 'One-Click Evaluation Bundles (Zero Setup)'}
            </div>
            {SAMPLE_PACKS.map((pack) => (
              <button
                key={pack.id}
                type="button"
                disabled={isBusy}
                onClick={() => onLoadSample(pack.id)}
                className="group flex w-full items-start justify-between gap-3 rounded-md border border-[#E2E5EA] bg-[#F8F9FA] p-3.5 text-left transition-all hover:border-[#0F766E] hover:bg-[#FFFFFF] active:translate-y-px disabled:opacity-60"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#E2E5EA] bg-[#FFFFFF] group-hover:border-[#0F766E]/40">
                    {getSampleIcon(pack.category)}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-semibold text-[#141518]">
                        {isZh ? pack.labelZh : pack.label}
                      </span>
                      <span className="rounded border border-[#E2E5EA] bg-[#FFFFFF] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[#5C626E]">
                        {isZh
                          ? `${pack.documents.length} 份文件`
                          : `${pack.documents.length} ${pack.documents.length > 1 ? 'DOCS' : 'DOC'}`}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[13px] text-[#5C626E]">{isZh ? pack.subtitleZh : pack.subtitle}</p>
                  </div>
                </div>
                <span className="shrink-0 self-center font-mono text-[11px] font-medium text-[#0F766E] opacity-80 group-hover:opacity-100">
                  {isZh ? '載入 →' : 'Load →'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-md border border-[#E2E5EA] bg-[#F8F9FA] p-4 lg:col-span-5">
          <form onSubmit={handleSubmit} className="flex h-full flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-[#5C626E]">
                {isZh ? '上傳或貼上自訂文件' : 'Drop Scan or Paste Sensitive Text'}
              </span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                aria-label={isZh ? '文件類別' : 'Document Category'}
                className="rounded border border-[#E2E5EA] bg-[#FFFFFF] px-2 py-1 text-[12px] text-[#141518] focus:border-[#0F766E] focus:outline-none"
              >
                <option value="contract">{isZh ? '合約／法務' : 'Contract / Legal'}</option>
                <option value="medical">{isZh ? '醫療／檢驗' : 'Medical / Lab'}</option>
                <option value="financial">{isZh ? '財務／發票' : 'Financial / Invoice'}</option>
                <option value="custom">{isZh ? '其他' : 'Other'}</option>
              </select>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-[12px] transition-colors ${
                dragActive
                  ? 'border-[#0F766E] bg-[#F0FDFA] text-[#0F766E]'
                  : 'border-[#CBD5E1] bg-[#FFFFFF] text-[#5C626E] hover:border-[#0F766E]/60'
              }`}
            >
              <Upload className="h-4 w-4 text-[#0F766E]" />
              <span>
                {imageDataUrl
                  ? isZh
                    ? '已附加圖片掃描件（點擊可更換）'
                    : 'Image scan attached (click to replace)'
                  : isZh
                    ? '拖曳 .txt / .png / .jpg 掃描件至此，或點擊選擇'
                    : 'Drop .txt, .png, or .jpg scan here, or click to browse'}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,image/png,image/jpeg"
                onChange={(e) => handleFiles(e.target.files)}
                className="hidden"
              />
            </div>

            <div>
              <label
                htmlFor="doc-title-input"
                className="block text-[12px] font-medium text-[#141518]"
              >
                {isZh ? '文件標題' : 'Document Title'}
              </label>
              <input
                id="doc-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isZh ? '例如：顧問合約草稿.txt' : 'e.g. Consulting Agreement Draft.txt'}
                className="mt-1 w-full rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-3 py-1.5 text-[13px] text-[#141518] placeholder:text-[#94A3B8] focus:border-[#0F766E] focus:outline-none"
              />
            </div>

            <div className="flex flex-1 flex-col">
              <label
                htmlFor="doc-text-input"
                className="block text-[12px] font-medium text-[#141518]"
              >
                {isZh ? '原始敏感內容（僅留存本機瀏覽器）' : 'Raw Local Content (Stays in Browser)'}
              </label>
              <textarea
                id="doc-text-input"
                rows={5}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={
                  isZh
                    ? '貼上合約條款、Email、身分證號、IBAN 或 API 金鑰...'
                    : 'Paste contract clauses, emails, SSN, IBAN, or API keys...'
                }
                className="mt-1 w-full flex-1 resize-y rounded-md border border-[#E2E5EA] bg-[#FFFFFF] p-2.5 font-mono text-[12px] leading-relaxed text-[#141518] placeholder:text-[#94A3B8] focus:border-[#0F766E] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isBusy || (!rawText.trim() && !imageDataUrl)}
              className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-md bg-[#0F766E] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#0D655E] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShieldAlert className="h-4 w-4" />
              <span>
                {isZh ? '執行本機 3 層隱私氣閘掃描' : 'Run Local 3-Layer Privacy Airlock'}
              </span>
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
