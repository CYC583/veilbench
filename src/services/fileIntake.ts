/**
 * Local file intake: everything is parsed in the browser; no file is uploaded.
 *
 * - Text (.txt, .md): read as UTF-8.
 * - Images (PNG/JPEG): scaled to at most MAX_IMAGE_EDGE px on the longest side (phone photos are often
 *   4000×3000), then handed to the pixel burn-in flow.
 * - PDF: text-based PDFs are extracted page by page with pdf.js; a PDF with almost no text layer is
 *   treated as a scan and its first page is rendered to an image for pixel redaction.
 * - DOCX: raw text extracted with mammoth.
 */
import { MAX_IMAGE_EDGE, scaleToFit } from '../core/canvasRedactor';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 30;
/** Below this many characters per page, a PDF is treated as a scan. */
export const SCANNED_PDF_CHARS_PER_PAGE = 25;

export type IntakeKind = 'text' | 'image' | 'pdf' | 'docx' | 'unsupported';
export type IntakeErrorCode = 'too_large' | 'unsupported' | 'unreadable' | 'empty';

export class IntakeError extends Error {
  constructor(public readonly code: IntakeErrorCode, message: string) {
    super(message);
    this.name = 'IntakeError';
  }
}

export interface IntakeResult {
  title: string;
  text: string;
  imageDataUrl?: string;
  kind: IntakeKind;
  /** Facts about what was done, for the UI (e.g. pages read, image scaled). */
  pages?: number;
  scaledFrom?: { width: number; height: number };
  scannedPdf?: boolean;
}

export const ACCEPTED_FILE_TYPES =
  '.txt,.md,.pdf,.docx,image/png,image/jpeg,application/pdf,'
  + 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function classifyFile(name: string, type: string): IntakeKind {
  const lower = name.toLowerCase();
  if (type === 'image/png' || type === 'image/jpeg' || /\.(png|jpe?g)$/.test(lower)) return 'image';
  if (type === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx') || type.includes('wordprocessingml')) return 'docx';
  if (type.startsWith('text/') || /\.(txt|md)$/.test(lower)) return 'text';
  return 'unsupported';
}

/** True when a PDF's extracted text is too thin to be a real text layer. */
export function looksScanned(text: string, pages: number): boolean {
  return text.replace(/\s+/g, '').length < Math.max(1, pages) * SCANNED_PDF_CHARS_PER_PAGE;
}

function canvasToPng(canvas: HTMLCanvasElement): string {
  const png = canvas.toDataURL('image/png');
  if (!png.startsWith('data:image/png;')) throw new IntakeError('unreadable', 'Could not export the image.');
  return png;
}

async function readImage(file: File): Promise<Pick<IntakeResult, 'imageDataUrl' | 'scaledFrom'>> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new IntakeError('unreadable', 'This image could not be decoded.');
  }
  const size = scaleToFit(bitmap.width, bitmap.height, MAX_IMAGE_EDGE);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new IntakeError('unreadable', 'Canvas is unavailable in this browser.');
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);
  const scaled = size.width !== bitmap.width;
  const result = {
    imageDataUrl: canvasToPng(canvas),
    scaledFrom: scaled ? { width: bitmap.width, height: bitmap.height } : undefined,
  };
  bitmap.close();
  return result;
}

async function readPdf(file: File): Promise<Pick<IntakeResult, 'text' | 'imageDataUrl' | 'pages' | 'scannedPdf'>> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch {
    throw new IntakeError('unreadable', 'This PDF could not be opened (it may be encrypted or damaged).');
  }
  try {
    const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
    const parts: string[] = [];
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const line = content.items
        .map(item => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ''}` : ''))
        .join('');
      parts.push(line.trim());
    }
    const text = parts.filter(Boolean).join('\n\n');
    if (!looksScanned(text, pages)) return { text, pages, scannedPdf: false };

    // Scan: render page 1 to an image for pixel redaction.
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const { width, height } = scaleToFit(base.width * 3, base.height * 3, MAX_IMAGE_EDGE);
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new IntakeError('unreadable', 'Canvas is unavailable in this browser.');
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return { text, pages, scannedPdf: true, imageDataUrl: canvasToPng(canvas) };
  } finally {
    void doc.loadingTask.destroy();
  }
}

async function readDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  try {
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return value.trim();
  } catch {
    throw new IntakeError('unreadable', 'This Word file could not be read.');
  }
}

export async function readIntakeFile(file: File): Promise<IntakeResult> {
  if (file.size > MAX_FILE_BYTES) {
    throw new IntakeError('too_large', `Files up to ${MAX_FILE_BYTES / 1024 / 1024} MB are supported.`);
  }
  const kind = classifyFile(file.name, file.type);
  switch (kind) {
    case 'image':
      return { title: file.name, text: '', kind, ...(await readImage(file)) };
    case 'pdf': {
      const pdf = await readPdf(file);
      if (!pdf.text && !pdf.imageDataUrl) throw new IntakeError('empty', 'No text or pages found in this PDF.');
      return { title: file.name, kind, ...pdf };
    }
    case 'docx': {
      const text = await readDocx(file);
      if (!text) throw new IntakeError('empty', 'No text found in this Word file.');
      return { title: file.name, text, kind };
    }
    case 'text': {
      const text = await file.text();
      if (!text.trim()) throw new IntakeError('empty', 'This file is empty.');
      return { title: file.name, text, kind };
    }
    default:
      throw new IntakeError('unsupported', 'Supported files: PDF, Word (.docx), text, PNG and JPEG.');
  }
}
