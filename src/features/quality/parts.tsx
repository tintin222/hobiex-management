"use client";

import type { ReactNode } from "react";
import { AlertOctagon, AlertTriangle, Building2, Factory, Truck } from "lucide-react";
import { useT } from "@/i18n";
import type { Ncr } from "@/lib/data/types";
import { cn } from "@/lib/cn";
import { messages } from "./messages";

/** Tooltip body styled like the shared ChartTooltip, for multi-row custom content. */
export function TooltipCard({ title, rows }: { title?: ReactNode; rows: { label: ReactNode; value: ReactNode; color?: string }[] }) {
  return (
    <div className="min-w-40 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      {title !== undefined && <div className="mb-1.5 font-medium text-ink">{title}</div>}
      <div className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-ink-2">
              {r.color && <span className="size-2 rounded-sm" style={{ background: r.color }} />}
              {r.label}
            </span>
            <span className="tabular font-medium text-ink">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SOURCE_ICON = { internal: Factory, customer: Building2, supplier: Truck } as const;

/** NCR source as icon + label. */
export function SourceLabel({ source, className }: { source: Ncr["source"]; className?: string }) {
  const t = useT(messages);
  const Icon = SOURCE_ICON[source];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap text-ink-2", className)}>
      <Icon className="size-3.5 text-ink-3" />
      {t(`src.${source}`)}
    </span>
  );
}

/** "3 critical" style count with a severity icon (never color alone). */
export function SeverityCount({ severity, n }: { severity: Ncr["severity"]; n: number }) {
  const t = useT(messages);
  const Icon = severity === "critical" ? AlertOctagon : AlertTriangle;
  const color = severity === "critical" ? "text-critical" : severity === "major" ? "text-serious" : "text-warn";
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Icon className={cn("size-3.5", color)} />
      <span className="tabular font-medium text-ink">{n}</span>
      <span className="text-ink-3">{t(`sev.${severity}`)}</span>
    </span>
  );
}
