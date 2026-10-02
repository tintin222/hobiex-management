"use client";

import { memo, type KeyboardEvent } from "react";
import { AlertOctagon, CalendarClock, Settings2, Timer, Wrench } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { cn } from "@/lib/cn";
import { MIN } from "@/lib/data/clock";
import type { Machine, WorkOrder, WorkOrderOperation } from "@/lib/data/types";
import { Card, IdLink, PersonChip, Progress, RingGauge, StatusBadge } from "@/components/ui";
import { messages } from "./messages";
import { paceTone, STATUS_STRIP } from "./bits";

export const MachineTile = memo(function MachineTile({
  machine: m,
  wo,
  op,
  sku,
  nextWoId,
  nextStart,
  moTitle,
  now,
  dayFrac,
  tv,
  onOpen,
}: {
  machine: Machine;
  wo?: WorkOrder;
  op?: WorkOrderOperation;
  sku?: string;
  nextWoId?: string;
  nextStart?: string;
  moTitle?: string;
  now: number;
  dayFrac: number;
  tv?: boolean;
  onOpen?: (id: string) => void;
}) {
  const t = useT(messages);
  const fmt = useFmt();
  const label = useLabel();
  const tx = useTx();
  const down = m.status === "down";
  const inStatus = Math.max(0, (now - Date.parse(m.statusSince)) / MIN);
  const progress = wo && op ? op.qtyDone / Math.max(1, wo.qty) : 0;
  const interactive = !!onOpen;
  const open = () => onOpen?.(m.id);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };

  let body;
  if (down) {
    body = (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-2 rounded-lg border border-critical/30 bg-surface px-2.5 py-2 text-xs font-medium text-critical-ink">
          <AlertOctagon className="mt-px size-3.5 shrink-0" />
          <span className="line-clamp-2">{m.downReason ? tx(m.downReason, m.downReasonTr) : label("machineStatus", "down")}</span>
        </div>
        {wo && (
          <div className="truncate text-[11px] text-ink-2">
            {t("tile.onHold")}:{" "}
            <IdLink href={`/work-orders/${wo.id}`}>{wo.id}</IdLink>
            {sku && <span className="text-ink-3"> · {sku}</span>}
          </div>
        )}
      </div>
    );
  } else if (m.status === "maintenance") {
    body = (
      <div className="flex items-start gap-2 rounded-lg bg-warn-soft px-2.5 py-2 text-xs font-medium text-warn-ink">
        <Wrench className="mt-px size-3.5 shrink-0" />
        <span className="line-clamp-2">{moTitle ?? t("tile.maint")}</span>
      </div>
    );
  } else if (wo && op) {
    body = (
      <div className="rounded-lg bg-surface-2 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <IdLink href={`/work-orders/${wo.id}`}>{wo.id}</IdLink>
          <span className="truncate font-medium text-ink-2">{sku}</span>
        </div>
        {m.status === "setup" ? (
          <div className="mt-1 flex items-center gap-1 truncate text-[11px] font-medium text-brand">
            <Settings2 className="size-3 shrink-0" />
            {t("tile.changeover", { sku: sku ?? "" })}
          </div>
        ) : (
          <div className="mt-1 truncate text-[11px] text-ink-3">
            {op.seq} · {label("op", op.operation)}
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <Progress value={progress} size="sm" tone={m.status === "setup" ? "brand" : "good"} />
          <span className="shrink-0 text-[11px] text-ink-2 tabular">
            {fmt.num(op.qtyDone)}/{fmt.num(wo.qty)}
          </span>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="rounded-lg border border-dashed border-line px-2.5 py-2 text-xs">
        <div className="font-medium text-ink-2">{t("tile.noJob")}</div>
        <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-ink-3">
          <CalendarClock className="size-3 shrink-0" />
          {nextWoId && nextStart ? t("tile.next", { wo: nextWoId, when: fmt.relative(nextStart, now) }) : t("tile.noQueue")}
        </div>
      </div>
    );
  }

  const target = m.targetToday;
  return (
    <Card
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `${m.id} · ${m.name} · ${label("machineStatus", m.status)}` : undefined}
      onClick={interactive ? open : undefined}
      onKeyDown={interactive ? onKey : undefined}
      className={cn(
        "flex flex-col overflow-hidden text-left transition-colors",
        interactive && "cursor-pointer hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        down && "border-critical/50 bg-critical-soft",
      )}
    >
      <div className={cn(tv ? "h-2" : "h-1.5", STATUS_STRIP[m.status], down && "pulse-dot")} aria-hidden />
      <div className={cn("flex flex-1 flex-col gap-2.5", tv ? "p-4" : "p-3.5")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {down && <span className="pulse-dot size-2 shrink-0 rounded-full bg-critical" aria-hidden />}
              <span className={cn("font-display font-semibold text-ink tabular", tv ? "text-xl" : "text-base")}>{m.id}</span>
            </div>
            <div className={cn("truncate text-ink-3", tv ? "text-sm" : "text-xs")}>{m.name}</div>
          </div>
          <RingGauge value={m.oee} size={tv ? 58 : 46} stroke={tv ? 6 : 5} label="OEE" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <StatusBadge kind="machineStatus" value={m.status} />
          <span className="flex items-center gap-1 text-[11px] text-ink-3 tabular" title={t("tile.inStatus")}>
            <Timer className="size-3" aria-hidden />
            {fmt.duration(inStatus)}
          </span>
        </div>
        <div className="flex-1">{body}</div>
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
            <span className="text-ink-3">{t("tile.output")}</span>
            <span className="text-ink-2 tabular">
              <span key={m.outputToday} className={cn("animate-fade-in inline-block font-semibold text-ink", tv && "text-sm")}>
                {fmt.num(m.outputToday)}
              </span>{" "}
              / {fmt.num(target)}
            </span>
          </div>
          <Progress value={target ? m.outputToday / target : 0} size="sm" tone={paceTone(m.outputToday, target, dayFrac)} />
        </div>
        <div className="flex min-h-5 items-center border-t border-line/70 pt-2">
          {m.operatorId ? <PersonChip id={m.operatorId} size={20} className="[&_span]:text-xs" /> : <span className="text-[11px] text-ink-3">{t("tile.noOperator")}</span>}
        </div>
      </div>
    </Card>
  );
});
