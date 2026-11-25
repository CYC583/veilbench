import { describe, expect, it } from 'vitest';
import { scaleToFit } from '../../src/core/canvasRedactor';
import { classifyFile, looksScanned } from '../../src/services/fileIntake';

describe('local file intake', () => {
  it('classifies supported files by type or extension', () => {
    expect(classifyFile('Quote.PDF', '')).toBe('pdf');
    expect(classifyFile('msa.docx', '')).toBe('docx');
    expect(classifyFile('scan.jpg', 'image/jpeg')).toBe('image');
    expect(classifyFile('notes.md', '')).toBe('text');
    expect(classifyFile('macro.xlsm', 'application/vnd.ms-excel')).toBe('unsupported');
  });

  it('scales phone photos down to the max edge without upscaling', () => {
    expect(scaleToFit(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(scaleToFit(800, 600, 2000)).toEqual({ width: 800, height: 600 });
    expect(scaleToFit(0, 600, 2000)).toEqual({ width: 0, height: 0 });
  });

  it('treats a PDF with almost no text layer as a scan', () => {
    expect(looksScanned('   ', 3)).toBe(true);
    expect(looksScanned('Quote total $42,000 payable Net-90 after acceptance.', 1)).toBe(false);
  });
});
