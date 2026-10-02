"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "./primitives";

/** Tiny inline trend line; current period dot in brand, rest de-emphasised. */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  className,
  color = "var(--brand)",
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  color?: string;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 3;
  const pts = data.map((v, i) => [pad + (i / (data.length - 1)) * (width - pad * 2), pad + (1 - (v - min) / span) * (height - pad * 2)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <path d={d} fill="none" stroke="var(--chart-muted)" strokeOpacity={0.55} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3} fill={color} stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
}

/**
 * Stat tile: label · value · optional delta (signed, vs a named period) ·
 * optional sparkline. Delta color = direction × whether up is good.
 */
export function KpiTile({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  upIsGood = true,
  trend,
  icon,
  footer,
  className,
  onClick,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  delta?: number; // relative, e.g. 0.034 = +3.4 %
  deltaLabel?: ReactNode;
  upIsGood?: boolean;
  trend?: number[];
  icon?: ReactNode;
  footer?: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const good = delta === undefined ? undefined : delta === 0 ? undefined : delta > 0 === upIsGood;
  return (
    <Card className={cn("flex flex-col gap-2 p-4", onClick && "cursor-pointer transition-colors hover:border-line-strong", className)} onClick={onClick}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-2">{label}</span>
        {icon && <span className="text-ink-3">{icon}</span>}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1">
          <span className="font-display text-[28px] leading-none font-semibold tracking-tight text-ink">{value}</span>
          {unit && <span className="text-sm text-ink-3">{unit}</span>}
        </div>
        {trend && <Sparkline data={trend} />}
      </div>
      {(delta !== undefined || footer) && (
        <div className="flex items-center gap-1.5 text-xs">
          {delta !== undefined && (
            <span className={cn("inline-flex items-center gap-0.5 font-medium", good === undefined ? "text-ink-3" : good ? "text-good-ink" : "text-critical-ink")}>
              {delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {delta >= 0 ? "+" : "−"}
              {Math.abs(delta * 100).toFixed(1)}%
            </span>
          )}
          {deltaLabel && <span className="text-ink-3">{deltaLabel}</span>}
          {footer}
        </div>
      )}
    </Card>
  );
}

/** Ring gauge for OEE-type ratios. */
export function RingGauge({
  value,
  size = 72,
  stroke = 8,
  label,
  tone,
}: {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  label?: ReactNode;
  tone?: "good" | "warn" | "critical" | "brand";
}) {
  const v = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const auto = tone ?? (v >= 0.75 ? "good" : v >= 0.6 ? "warn" : "critical");
  const color = { good: "var(--good)", warn: "var(--warn)", critical: "var(--critical)", brand: "var(--brand)" }[auto];
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          className="transition-[stroke-dasharray] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-sm font-semibold text-ink tabular" style={{ fontSize: size * 0.22 }}>
          {Math.round(v * 100)}%
        </span>
        {label && <span className="text-[10px] text-ink-3">{label}</span>}
      </div>
    </div>
  );
}
