"use client";

/**
 * ILUO skill glyph. Level is encoded by shape (quarters of a circle), so it
 * reads without color: 0 = dashed empty ring, 1 = quarter "I", 2 = half "L",
 * 3 = three-quarter "U", 4 = full circle "O".
 */
import { cn } from "@/lib/cn";

export const ILUO_LETTER = ["–", "I", "L", "U", "O"] as const;

function sectorPath(c: number, r: number, frac: number) {
  const a = frac * 2 * Math.PI;
  const x = c + r * Math.sin(a);
  const y = c - r * Math.cos(a);
  const large = frac > 0.5 ? 1 : 0;
  return `M${c},${c} L${c},${c - r} A${r},${r} 0 ${large} 1 ${x.toFixed(2)},${y.toFixed(2)} Z`;
}

export function IluoGlyph({ level, size = 18, title, className }: { level: number; size?: number; title?: string; className?: string }) {
  const lv = Math.max(0, Math.min(4, Math.round(level)));
  const c = size / 2;
  const r = size / 2 - 1.25;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn("shrink-0", className)} role="img" aria-label={title ?? `${lv}`}>
      {title && <title>{title}</title>}
      {lv === 0 ? (
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line-strong)" strokeWidth={1.25} strokeDasharray="2 2" />
      ) : (
        <>
          <circle cx={c} cy={c} r={r} fill="var(--surface)" stroke="var(--brand)" strokeWidth={1.25} />
          {lv === 4 ? <circle cx={c} cy={c} r={r} fill="var(--brand)" /> : <path d={sectorPath(c, r, lv / 4)} fill="var(--brand)" />}
        </>
      )}
    </svg>
  );
}
