"use client";

import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { useFmt, useT } from "@/i18n";
import type { StockMovement } from "@/lib/data/types";
import { cn } from "@/lib/cn";
import { Badge, type Tone } from "@/components/ui";
import { messages } from "./messages";

export const MOVEMENT_TYPES: StockMovement["type"][] = ["receipt", "issue", "adjustment", "transfer"];

const MV_STYLE: Record<StockMovement["type"], [Tone, LucideIcon]> = {
  receipt: ["good", ArrowDownToLine],
  issue: ["brand", ArrowUpFromLine],
  adjustment: ["warn", SlidersHorizontal],
  transfer: ["neutral", ArrowLeftRight],
};

export function MovementTypeBadge({ type }: { type: StockMovement["type"] }) {
  const t = useT(messages);
  const [tone, Icon] = MV_STYLE[type];
  return (
    <Badge tone={tone} icon={<Icon className="size-3.5" />}>
      {t(`mv.${type}`)}
    </Badge>
  );
}

/** Signed quantity: receipts / positive adjustments in good ink, issues in secondary ink. */
export function SignedQty({ qty, type, unit, className }: { qty: number; type: StockMovement["type"]; unit?: string; className?: string }) {
  const fmt = useFmt();
  const positive = qty > 0;
  const sign = type === "transfer" ? "" : positive ? "+" : qty < 0 ? "−" : "";
  return (
    <span className={cn("tabular font-medium whitespace-nowrap", positive && type !== "transfer" ? "text-good-ink" : "text-ink-2", className)}>
      {sign}
      {fmt.num(Math.abs(qty), Math.abs(qty) < 100 && !Number.isInteger(qty) ? 1 : 0)}
      {unit && <span className="ml-1 text-xs font-normal text-ink-3">{unit}</span>}
    </span>
  );
}
