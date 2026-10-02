"use client";

import { AlertOctagon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useFmt, useT } from "@/i18n";
import type { Product } from "@/lib/data/types";
import { cn } from "@/lib/cn";
import { Progress } from "@/components/ui";
import { fgState, type StockState } from "@/features/inventory/stock";
import { messages as inventoryMessages } from "@/features/inventory/messages";
import { messages } from "./messages";

const ICON = { critical: AlertOctagon, warn: AlertTriangle, ok: CheckCircle2 };
const ICON_CLS = { critical: "text-critical", warn: "text-warn", ok: "text-good" };
const TONE = { critical: "critical", warn: "warn", ok: "good" } as const;

/** Finished-goods stock vs. safety stock: bar scaled to 3× safety, icon carries the state. */
export function StockMini({ product: p, state, className }: { product: Pick<Product, "stockQty" | "safetyStock">; state?: StockState; className?: string }) {
  const t = useT(messages);
  const ti = useT(inventoryMessages);
  const fmt = useFmt();
  const s = state ?? fgState(p);
  const Icon = ICON[s];
  const stateLabel = ti(s === "critical" ? "stock.critical" : s === "warn" ? "stock.low" : "stock.ok");
  return (
    <div className={cn("min-w-0", className)} title={stateLabel}>
      <span className="sr-only">{stateLabel}</span>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1 text-ink-2">
          <Icon className={cn("size-3.5 shrink-0", ICON_CLS[s])} />
          <span className="tabular font-medium text-ink">{fmt.num(p.stockQty)}</span>
        </span>
        <span className="tabular truncate text-ink-3">{t("card.safety", { n: fmt.num(p.safetyStock) })}</span>
      </div>
      <Progress value={p.stockQty / Math.max(1, p.safetyStock * 3)} size="sm" tone={TONE[s]} className="mt-1" />
    </div>
  );
}
