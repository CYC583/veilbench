import { afterEach, describe, expect, it, vi } from 'vitest';
import { redactImageRegionsOnCanvas } from '../../src/core';
import type { BoundingBoxNormalized } from '../../src/types/privacy';

const input = 'data:image/jpeg;base64,dGVzdA==';
const png = 'data:image/png;base64,cmVkYWN0ZWQ=';
const region = (bbox: BoundingBoxNormalized) => ({ id: 'field', label: '[REDACTED]', bbox });

function installCanvas() {
  const ctx = { fillStyle: '', font: '', textAlign: '', textBaseline: '',
    drawImage: vi.fn(), fillRect: vi.fn(), fillText: vi.fn() };
  const canvas = { width: 0, height: 0, getContext: vi.fn((): typeof ctx | null => ctx),
    toDataURL: vi.fn(() => png) };
  class FakeImage {
    naturalWidth = 100;
    naturalHeight = 80;
    onload!: () => void;
    onerror!: () => void;
    set src(url: string) { if (url === input) this.onload(); else this.onerror(); }
  }
  vi.stubGlobal('document', { createElement: (tag: string) => { expect(tag).toBe('canvas'); return canvas; } });
  vi.stubGlobal('Image', FakeImage);
  return { ctx, canvas, FakeImage };
}

afterEach(() => vi.unstubAllGlobals());

describe('Canvas pixel burn-in', () => {
  it('rejects calls without a browser DOM', async () => {
    await expect(redactImageRegionsOnCanvas(input, [])).rejects.toThrow(/browser DOM/);
  });
  it('draws at natural resolution, covers outward-rounded padded pixels, clamps and labels before PNG export', async () => {
    const { ctx, canvas, FakeImage } = installCanvas();
    const operations: string[] = [];
    ctx.drawImage.mockImplementation(() => operations.push('image'));
    ctx.fillRect.mockImplementation(() => operations.push(ctx.fillStyle));
    ctx.fillText.mockImplementation(() => operations.push(ctx.fillStyle));
    canvas.toDataURL.mockImplementation(() => { operations.push('png'); return png; });
    const result = await redactImageRegionsOnCanvas(input, [
      region({ x: 0.251, y: 0.25, width: 0.25, height: 0.25 }),
      region({ x: -0.1, y: 0.75, width: 0.3, height: 0.5 }),
    ]);
    expect(result).toBe(png);
    expect(canvas).toMatchObject({ width: 100, height: 80 });
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 0, 0);
    expect(ctx.fillRect.mock.calls).toEqual([[21, 16, 34, 28], [0, 56, 24, 24]]);
    expect(ctx.fillText.mock.calls).toEqual([['[REDACTED]', 38, 30, 34], ['[REDACTED]', 12, 68, 24]]);
    expect(ctx).toMatchObject({ textAlign: 'center', textBaseline: 'middle', font: expect.stringContaining('monospace') });
    expect(operations).toEqual(['image', '#141518', '#F8F9FA', '#141518', '#F8F9FA', 'png']);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
  });
  it('re-encodes even when the region list is empty', async () => {
    const { ctx } = installCanvas();
    await expect(redactImageRegionsOnCanvas(input, [])).resolves.toBe(png);
    expect(ctx.drawImage).toHaveBeenCalledOnce();
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
  it('rejects invalid or unreadable images and unavailable Canvas operations', async () => {
    const { canvas } = installCanvas();
    await expect(redactImageRegionsOnCanvas('https://example.test/img', [])).rejects.toThrow(/data URL/);
    await expect(redactImageRegionsOnCanvas('data:image/png;base64,invalid', [])).rejects.toThrow(/decode/);
    canvas.getContext.mockReturnValueOnce(null);
    await expect(redactImageRegionsOnCanvas(input, [])).rejects.toThrow(/2D context/);
    canvas.toDataURL.mockReturnValueOnce('data:,');
    await expect(redactImageRegionsOnCanvas(input, [])).rejects.toThrow(/export/);
  });
  it.each([
    { x: NaN, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 0, height: 1 },
    { x: 2, y: 0.5, width: 1, height: 1 },
  ])('fails closed on unusable box %j', async bbox => {
    const { canvas } = installCanvas();
    await expect(redactImageRegionsOnCanvas(input, [region(bbox)])).rejects.toThrow(/region/i);
    expect(canvas.toDataURL).not.toHaveBeenCalled();
  });
});
