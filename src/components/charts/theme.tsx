"use client";

/**
 * Shared Recharts styling. Follows the data-viz rules used across the app:
 * thin marks (bars ≤ 24px, 4px rounded data-end, 2px lines), recessive
 * hairline grid, categorical colors in fixed order (never cycled), status
 * colors reserved for state, text always in ink tokens, hover tooltips on
 * every chart.
 */
import type { ReactNode } from "react";

export const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--series-8)"];

/** Plants always map to the same series slot so color follows the entity. */
export const PLANT_COLOR: Record<string, string> = { P1: SERIES[0], P2: SERIES[1], P3: SERIES[2], P4: SERIES[3] };

export const STATUS_COLOR = { good: "var(--good)", warn: "var(--warn)", serious: "var(--serious)", critical: "var(--critical)", neutral: "var(--chart-muted)" };

export const axisProps = {
  stroke: "var(--axis)",
  tick: { fill: "var(--ink-3)", fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: "var(--axis)" },
} as const;

export const yAxisProps = {
  ...axisProps,
  axisLine: false,
  width: 44,
} as const;

export const gridProps = {
  stroke: "var(--grid)",
  strokeDasharray: "0",
  vertical: false,
} as const;

export const barRadius: [number, number, number, number] = [4, 4, 0, 0];
export const barRadiusH: [number, number, number, number] = [0, 4, 4, 0];

export const cursorProps = { fill: "var(--surface-3)", opacity: 0.6 };
export const lineCursor = { stroke: "var(--line-strong)", strokeWidth: 1 };

interface TooltipPayloadItem {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

/** Tooltip body: series swatch + name in ink, value right-aligned. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  formatter?: (value: number, name: string, item: TooltipPayloadItem) => ReactNode;
  labelFormatter?: (label: string | number, payload?: TooltipPayloadItem[]) => ReactNode;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      {label !== undefined && <div className="mb-1.5 font-medium text-ink">{labelFormatter ? labelFormatter(label, payload) : label}</div>}
      <div className="flex flex-col gap-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink-2">
              <span className="size-2 rounded-sm" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="tabular font-medium text-ink">{formatter ? formatter(Number(p.value), String(p.name), p) : p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Legend row rendered in HTML above/below a chart (identity never color-alone). */
export function ChartLegend({ items, className }: { items: { label: ReactNode; color: string; dashed?: boolean }[]; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2 ${className ?? ""}`}>
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {it.dashed ? (
            <span className="h-0 w-3.5 border-t-2 border-dashed" style={{ borderColor: it.color }} />
          ) : (
            <span className="size-2.5 rounded-sm" style={{ background: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}
