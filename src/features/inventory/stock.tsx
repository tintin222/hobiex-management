"use client";

import { useCallback } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2, type LucideIcon } from "lucide-react";
import { useFmt, useT } from "@/i18n";
import type { Material, Product } from "@/lib/data/types";
import { cn } from "@/lib/cn";
import { Badge, Progress, type Tone } from "@/components/ui";
import { messages } from "./messages";

export type StockState = "critical" | "warn" | "ok";

/** critical < safety stock ≤ warn < reorder point ≤ ok */
export function materialState(m: Pick<Material, "onHand" | "safetyStock" | "reorderPoint">): StockState {
  if (m.onHand < m.safetyStock) return "critical";
  if (m.onHand < m.reorderPoint) return "warn";
  return "ok";
}

/** Finished goods: below safety stock is critical, below 2× safety is low. */
export function fgState(p: Pick<Product, "stockQty" | "safetyStock">): StockState {
  if (p.stockQty < p.safetyStock) return "critical";
  if (p.stockQty < p.safetyStock * 2) return "warn";
  return "ok";
}

export const materialCover = (m: Pick<Material, "onHand" | "dailyUsage">) => (m.dailyUsage > 0 ? m.onHand / m.dailyUsage : 999);

/** Working days (26 / month) of finished-goods cover. */
export const fgCover = (p: Pick<Product, "stockQty" | "monthlyDemand">) => (p.monthlyDemand > 0 ? p.stockQty / (p.monthlyDemand / 26) : 999);

const STATE_STYLE: Record<StockState, [Tone, LucideIcon]> = {
  critical: ["critical", AlertOctagon],
  warn: ["warn", AlertTriangle],
  ok: ["good", CheckCircle2],
};

const STATE_TEXT: Record<StockState, string> = { critical: "text-critical-ink", warn: "text-warn-ink", ok: "text-good-ink" };

function stateLabelKey(state: StockState, fg?: boolean) {
  return state === "critical" ? "stock.critical" : state === "warn" ? (fg ? "stock.low" : "stock.warn") : "stock.ok";
}

export function StockBadge({ state, fg }: { state: StockState; fg?: boolean }) {
  const t = useT(messages);
  const [tone, Icon] = STATE_STYLE[state];
  return (
    <Badge tone={tone} icon={<Icon className="size-3.5" />}>
      {t(stateLabelKey(state, fg))}
    </Badge>
  );
}

/** Days of cover with a coverage bar (scale = `scaleDays`) colored by stock state, plus icon + label. */
export function CoverCell({ days, state, fg, scaleDays = 30, className }: { days: number; state: StockState; fg?: boolean; scaleDays?: number; className?: string }) {
  const t = useT(messages);
  const fmt = useFmt();
  const [tone, Icon] = STATE_STYLE[state];
  return (
    <div className={cn("w-36", className)}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="tabular font-medium text-ink">{days >= 999 ? "—" : t("daysN", { n: fmt.num(days, 1) })}</span>
        <span className={cn("inline-flex items-center gap-1 truncate", STATE_TEXT[state])}>
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{t(stateLabelKey(state, fg))}</span>
        </span>
      </div>
      <Progress value={days / scaleDays} size="sm" tone={tone} className="mt-1" />
    </div>
  );
}

/** Localized unit label for a material unit. */
export function useUnit() {
  const t = useT(messages);
  return useCallback((unit: Material["unit"]) => t(`unit.${unit}`), [t]);
}
