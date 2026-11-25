import type { ImageRedactionRegion, PiiEntity } from '../types/privacy';

const padding = 4;

/**
 * Binds value-anchored image regions to the document's current redaction toggles:
 * the burn label becomes the exact text token, a region whose entity is toggled off is skipped,
 * and a value missing from the vault still burns as [REDACTED] (fail closed).
 */
export function resolveImageRegions(
  regions: ImageRedactionRegion[] | undefined, entities: PiiEntity[],
): ImageRedactionRegion[] {
  if (!regions) return [];
  return regions.flatMap(region => {
    if (!region.originalValue) return [region];
    const needle = region.originalValue.toLowerCase();
    const entity = entities.find(e => e.originalValue.toLowerCase() === needle);
    if (!entity) return [{ ...region, label: '[REDACTED]' }];
    return entity.enabled ? [{ ...region, label: entity.token }] : [];
  });
}

export async function redactImageRegionsOnCanvas(
  imageDataUrl: string, regions: ImageRedactionRegion[],
): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('Image redaction requires a browser DOM and Canvas.');
  }
  if (!/^data:image\/(?:jpeg|png)[;,]/i.test(imageDataUrl)) {
    throw new Error('Expected a local JPEG or PNG image data URL.');
  }
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not decode the image for redaction.'));
    image.src = imageDataUrl;
  });

  const canvas = document.createElement('canvas');
  const w = canvas.width = image.naturalWidth;
  const h = canvas.height = image.naturalHeight;
  if (!w || !h) throw new Error('Image has no pixels to redact.');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable for image redaction.');
  ctx.drawImage(image, 0, 0);
  for (const { bbox: { x, y, width, height }, label } of regions) {
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      throw new Error('Invalid redaction region dimensions.');
    }
    const left = Math.max(0, x);
    const top = Math.max(0, y);
    const right = Math.min(1, x + width);
    const bottom = Math.min(1, y + height);
    if (left >= right || top >= bottom) throw new Error('Redaction region is outside the image.');
    const x0 = Math.max(0, Math.floor(left * w) - padding);
    const y0 = Math.max(0, Math.floor(top * h) - padding);
    const y1 = Math.min(h, Math.ceil(bottom * h) + padding);
    ctx.font = `bold ${Math.min(13, y1 - y0)}px monospace`;
    // Widen (never shrink) short boxes so the vault token stays legible; extra coverage is fail-safe.
    const labelWidth = typeof ctx.measureText === 'function' ? ctx.measureText(label).width + 8 : 0;
    const x1 = Math.min(w, Math.max(Math.ceil(right * w) + padding, x0 + labelWidth));
    ctx.fillStyle = '#141518';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = '#F8F9FA';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0);
  }
  const png = canvas.toDataURL('image/png');
  if (!png.startsWith('data:image/png;')) throw new Error('Canvas failed to export a redacted PNG.');
  return png;
}
