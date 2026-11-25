import { useRef, useState, type PointerEvent } from 'react';
import type { BoundingBoxNormalized } from '../types/privacy';

interface ImageRegionDrawerProps {
  src: string;
  alt: string;
  /** Manual boxes already added (shown as dashed outlines on the raw local preview). */
  manualRegions: BoundingBoxNormalized[];
  drawing: boolean;
  onAddRegion: (bbox: BoundingBoxNormalized) => void;
}

const MIN_SIZE = 0.01;

/**
 * Raw local image with a pointer-driven box tool (mouse, touch and pen). Coordinates are normalized to
 * the image so they map 1:1 onto the Canvas burn-in, independent of the rendered size.
 */
export function ImageRegionDrawer({ src, alt, manualRegions, drawing, onAddRegion }: ImageRegionDrawerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);

  const toNormalized = (e: PointerEvent<HTMLDivElement>) => {
    const rect = frameRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const box = start && current
    ? {
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
        width: Math.abs(current.x - start.x),
        height: Math.abs(current.y - start.y),
      }
    : null;

  const pct = (b: BoundingBoxNormalized) => ({
    left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%`,
  });

  return (
    <div
      ref={frameRef}
      className={`relative select-none ${drawing ? 'cursor-crosshair touch-none' : ''}`}
      onPointerDown={(e) => {
        if (!drawing) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = toNormalized(e);
        setStart(p);
        setCurrent(p);
      }}
      onPointerMove={(e) => {
        if (drawing && start) setCurrent(toNormalized(e));
      }}
      onPointerUp={() => {
        if (box && box.width >= MIN_SIZE && box.height >= MIN_SIZE) onAddRegion(box);
        setStart(null);
        setCurrent(null);
      }}
      onPointerCancel={() => {
        setStart(null);
        setCurrent(null);
      }}
    >
      <img src={src} alt={alt} draggable={false} className="pointer-events-none h-auto w-full object-contain" />
      {manualRegions.map((r, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="absolute border-2 border-dashed border-[#BE123C] bg-[#BE123C]/10"
          style={pct(r)}
        />
      ))}
      {box && (
        <span aria-hidden="true" className="absolute border-2 border-[#0F766E] bg-[#0F766E]/15" style={pct(box)} />
      )}
    </div>
  );
}
