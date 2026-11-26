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
import { ACCEPTED_FILE_TYPES, IntakeError, readIntakeFile, type IntakeErrorCode } from '../services/fileIntake';
import { UI, translator } from '../i18n/ui';
import type { Msg } from '../i18n/ui/types';

const INTAKE_ERROR_MSG = {
  too_large: UI.intake.errTooLarge,
  unsupported: UI.intake.errUnsupported,
  unreadable: UI.intake.errUnreadable,
  empty: UI.intake.errEmpty,
} satisfies Record<IntakeErrorCode, Msg>;

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
  const t = translator(locale);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('contract');
  const [rawText, setRawText] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [dragActive, setDragActive] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [intakeInfo, setIntakeInfo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    setIntakeError(null);
    setIntakeInfo(null);
    setIsReading(true);
    try {
      // Parsed entirely in this browser: nothing is uploaded at this step.
      const result = await readIntakeFile(file);
      setTitle(result.title);
      setImageDataUrl(result.imageDataUrl);
      setRawText(
        result.text || t(UI.intake.scanPlaceholder(file.name))
      );
      const info: string[] = [];
      if (result.pages) info.push(t(UI.intake.pagesRead(result.pages)));
      if (result.scannedPdf) info.push(t(UI.intake.scannedPdf));
      if (result.scaledFrom) {
        info.push(t(UI.intake.imageScaled(result.scaledFrom.width, result.scaledFrom.height)));
      }
      setIntakeInfo(info.length ? info.join(' · ') : null);
      setShowCustomForm(true);
    } catch (err) {
      const code: IntakeErrorCode = err instanceof IntakeError ? err.code : 'unreadable';
      setIntakeError(
        isZh
          ? t(INTAKE_ERROR_MSG[code])
          : err instanceof Error
            ? err.message
            : t(UI.intake.errUnreadable),
      );
    } finally {
      setIsReading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    void handleFiles(e.dataTransfer.files);
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
              {t(UI.intake.workspaceDocs)} ({documents.length})
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
                    aria-label={t(UI.intake.removeDoc(doc.title))}
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
              <span>{t(UI.intake.addDoc)}</span>
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
                {t(UI.intake.heading)}
              </h1>
              <p className="mt-1 max-w-[65ch] text-[14px] leading-relaxed text-[#5C626E]">
                {t(UI.intake.intro)}
              </p>
            </div>
            {documents.length > 0 && (
              <button
                type="button"
                onClick={() => setShowCustomForm(false)}
                className="rounded-md border border-[#E2E5EA] px-2.5 py-1 text-[12px] text-[#5C626E] hover:text-[#141518]"
              >
                {t(UI.intake.backToWorkspace)}
              </button>
            )}
          </div>

          <div className="mt-4 space-y-2.5">
            <div className="font-mono text-[11px] font-medium uppercase tracking-wider text-[#5C626E]">
              {t(UI.intake.bundlesTitle)}
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
                        {t({ en: pack.label, zh: pack.labelZh })}
                      </span>
                      <span className="rounded border border-[#E2E5EA] bg-[#FFFFFF] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[#5C626E]">
                        {t(UI.intake.docCount(pack.documents.length))}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[13px] text-[#5C626E]">{t({ en: pack.subtitle, zh: pack.subtitleZh })}</p>
                  </div>
                </div>
                <span className="shrink-0 self-center font-mono text-[11px] font-medium text-[#0F766E] opacity-80 group-hover:opacity-100">
                  {t(UI.intake.load)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-md border border-[#E2E5EA] bg-[#F8F9FA] p-4 lg:col-span-5">
          <form onSubmit={handleSubmit} className="flex h-full flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-[#5C626E]">
                {t(UI.intake.customTitle)}
              </span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                aria-label={t(UI.intake.categoryLabel)}
                className="rounded border border-[#E2E5EA] bg-[#FFFFFF] px-2 py-1 text-[12px] text-[#141518] focus:border-[#0F766E] focus:outline-none"
              >
                <option value="contract">{t(UI.intake.catContract)}</option>
                <option value="medical">{t(UI.intake.catMedical)}</option>
                <option value="financial">{t(UI.intake.catFinancial)}</option>
                <option value="custom">{t(UI.intake.catOther)}</option>
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
                {imageDataUrl ? t(UI.intake.imageAttached) : t(UI.intake.dropHint)}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                onChange={(e) => void handleFiles(e.target.files)}
                className="hidden"
              />
            </div>
            {(isReading || intakeError || intakeInfo) && (
              <p
                role={intakeError ? 'alert' : 'status'}
                className={`text-[12px] leading-snug ${intakeError ? 'text-[#BE123C]' : 'text-[#5C626E]'}`}
              >
                {isReading ? t(UI.intake.reading) : intakeError ?? intakeInfo}
              </p>
            )}

            <div>
              <label
                htmlFor="doc-title-input"
                className="block text-[12px] font-medium text-[#141518]"
              >
                {t(UI.intake.docTitleLabel)}
              </label>
              <input
                id="doc-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t(UI.intake.docTitlePlaceholder)}
                className="mt-1 w-full rounded-md border border-[#E2E5EA] bg-[#FFFFFF] px-3 py-1.5 text-[13px] text-[#141518] placeholder:text-[#94A3B8] focus:border-[#0F766E] focus:outline-none"
              />
            </div>

            <div className="flex flex-1 flex-col">
              <label
                htmlFor="doc-text-input"
                className="block text-[12px] font-medium text-[#141518]"
              >
                {t(UI.intake.rawLabel)}
              </label>
              <textarea
                id="doc-text-input"
                rows={5}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={t(UI.intake.rawPlaceholder)}
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
                {t(UI.intake.runAirlock)}
              </span>
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
