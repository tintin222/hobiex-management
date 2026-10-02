"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useFmt, useLabel, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { DAY, localDateOf, MIN } from "@/lib/data/clock";
import type { WorkOrder, WorkOrderOperation } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { useClock } from "@/lib/store";
import { Card, CardHeader, PersonChip, StatusBadge } from "@/components/ui";
import { ChartLegend } from "@/components/charts/theme";
import { messages } from "./messages";

const BAR: Partial<Record<WorkOrderOperation["status"], string>> = {
  done: "bg-good",
  running: "bg-brand",
  paused: "bg-warn",
};

/** Routing table with a per-operation mini Gantt inside the order's own time window. */
export function WoOperations({ wo }: { wo: WorkOrder }) {
  const t = useT(messages);
  const fmt = useFmt();
  const label = useLabel();
  const clock = useClock();
  const lk = useLookups();

  const win = useMemo(() => {
    let a = Infinity;
    let b = -Infinity;
    for (const o of wo.operations) {
      a = Math.min(a, Date.parse(o.plannedStart), o.actualStart ? Date.parse(o.actualStart) : Infinity);
      b = Math.max(b, Date.parse(o.plannedEnd), o.actualEnd ? Date.parse(o.actualEnd) : -Infinity);
      if (o.status === "running" || o.status === "paused") b = Math.max(b, clock.now);
    }
    const pad = Math.max((b - a) * 0.02, 10 * MIN);
    const start = a - pad;
    const end = b + pad;
    // local midnights inside the window, drawn as faint day separators
    const days: number[] = [];
    for (let d = Date.parse(`${localDateOf(start)}T00:00:00+03:00`) + DAY; d < end && days.length < 30; d += DAY) days.push(d);
    return { start, end, days };
  }, [wo.operations, clock.now]);

  const pos = (ms: number) => ((ms - win.start) / (win.end - win.start)) * 100;
  const nowPct = clock.now > win.start && clock.now < win.end ? pos(clock.now) : null;

  /** "02 Oct 08:30 → 11:10" (end date only when it differs) */
  const range = (a: string, b?: string) => {
    if (!b) return `${fmt.dateTime(a)} → …`;
    const same = localDateOf(Date.parse(a)) === localDateOf(Date.parse(b));
    return `${fmt.dateTime(a)} → ${same ? fmt.time(b) : fmt.dateTime(b)}`;
  };

  const done = wo.operations.filter((o) => o.status === "done");
  const stdTotal = wo.operations.reduce((s, o) => s + o.stdMinutes, 0);
  const stdDone = done.reduce((s, o) => s + o.stdMinutes, 0);
  const actDone = done.reduce((s, o) => s + o.actualMinutes, 0);
  const scrapTotal = wo.operations.reduce((s, o) => s + o.qtyScrap, 0);
  const last = wo.operations[wo.operations.length - 1];

  return (
    <Card>
      <CardHeader title={t("ops.title")} subtitle={t("ops.subtitle", { done: done.length, total: wo.operations.length, std: fmt.duration(stdTotal) })} />
      <div className="px-5 pb-3">
        <ChartLegend
          items={[
            { label: t("ops.legend.planned"), color: "var(--line-strong)" },
            { label: t("ops.legend.done"), color: "var(--good)" },
            { label: t("ops.legend.running"), color: "var(--brand)" },
            { label: t("ops.legend.paused"), color: "var(--warn)" },
            { label: t("ops.legend.now"), color: "var(--critical)", dashed: true },
          ]}
        />
      </div>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[1080px] border-collapse text-sm">
          <thead>
            <tr className="border-y border-line text-left text-xs text-ink-3">
              <th className="h-9 pr-2 pl-5 font-medium">{t("ops.col.seq")}</th>
              <th className="px-3 font-medium">{t("ops.col.operation")}</th>
              <th className="px-3 font-medium">{t("common.status")}</th>
              <th className="px-3 font-medium">{t("common.operator")}</th>
              <th className="px-3 font-medium">{t("ops.col.window")}</th>
              <th className="px-3 text-right font-medium">{t("ops.col.time")}</th>
              <th className="px-3 text-right font-medium">{t("ops.col.qty")}</th>
              <th className="w-[26%] min-w-60 pr-5 pl-3 font-medium">
                <div className="flex justify-between gap-2 tabular">
                  <span>{fmt.dateTime(win.start)}</span>
                  <span>{fmt.dateTime(win.end)}</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {wo.operations.map((op) => {
              const m = lk.machine.get(op.machineId);
              const running = op.status === "running";
              const ps = Date.parse(op.plannedStart);
              const pe = Date.parse(op.plannedEnd);
              const as = op.actualStart ? Date.parse(op.actualStart) : undefined;
              const ae = op.actualEnd ? Date.parse(op.actualEnd) : as !== undefined ? Math.max(as, clock.now) : undefined;
              const eff = op.status === "done" && op.actualMinutes > 0 ? op.stdMinutes / op.actualMinutes : undefined;
              const elapsed = as !== undefined && !op.actualEnd ? Math.max(0, (clock.now - as) / MIN) : 0;
              return (
                <tr
                  key={op.id}
                  className={cn(
                    "border-b border-line last:border-b-0",
                    running && "bg-brand-soft/50 shadow-[inset_3px_0_0_var(--brand)]",
                    op.status === "paused" && "bg-warn-soft/40 shadow-[inset_3px_0_0_var(--warn)]",
                  )}
                >
                  <td className="py-2.5 pr-2 pl-5 align-top font-medium text-ink-3 tabular">{op.seq}</td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="flex items-center gap-1.5 font-medium text-ink">
                      {running && <span className="pulse-dot size-2 rounded-full bg-good" aria-hidden />}
                      {label("op", op.operation)}
                    </div>
                    <div className="mt-0.5 text-xs whitespace-nowrap">
                      <Link href={`/shop-floor?machine=${op.machineId}`} className="font-medium text-brand tabular hover:underline">
                        {op.machineId}
                      </Link>
                      {m && <span className="text-ink-3"> · {m.name}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <StatusBadge kind="opStatus" value={op.status} />
                  </td>
                  <td className="max-w-44 px-3 py-2.5 align-top">{op.operatorId ? <PersonChip id={op.operatorId} size={20} /> : <span className="text-ink-3">—</span>}</td>
                  <td className="px-3 py-2.5 align-top text-xs whitespace-nowrap tabular">
                    <div className="text-ink-2">
                      <span className="inline-block w-12 text-ink-3">{t("ops.plan")}</span>
                      {range(op.plannedStart, op.plannedEnd)}
                    </div>
                    <div className="mt-0.5 text-ink">
                      <span className="inline-block w-12 text-ink-3">{t("ops.act")}</span>
                      {op.actualStart ? range(op.actualStart, op.actualEnd) : <span className="text-ink-3">{t("ops.notStarted")}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right align-top text-xs whitespace-nowrap tabular">
                    <div>
                      <span className="text-ink-2">{fmt.duration(op.stdMinutes)}</span>
                      <span className="text-ink-3"> / </span>
                      <span className="font-medium text-ink">{op.status === "done" ? fmt.duration(op.actualMinutes) : elapsed ? fmt.duration(elapsed) : "—"}</span>
                    </div>
                    {eff !== undefined ? (
                      <div className={cn("mt-0.5", eff >= 0.95 ? "text-good-ink" : eff >= 0.8 ? "text-ink-3" : "text-serious-ink")}>{t("ops.eff", { pct: fmt.pct(eff) })}</div>
                    ) : running ? (
                      <div className="mt-0.5 text-ink-3">{t("ops.runningFor", { d: fmt.duration(elapsed) })}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top text-xs whitespace-nowrap tabular">
                    <span className="font-medium text-ink">{fmt.num(op.qtyDone)}</span>
                    <span className="text-ink-3"> / </span>
                    <span className={op.qtyScrap > 0 ? "font-medium text-serious-ink" : "text-ink-3"}>{fmt.num(op.qtyScrap)}</span>
                  </td>
                  <td className="relative pr-5 pl-3">
                    <div className="absolute inset-y-0 right-5 left-3">
                      {win.days.map((d) => (
                        <span key={d} className="absolute inset-y-0 w-px bg-line" style={{ left: `${pos(d)}%` }} aria-hidden />
                      ))}
                      <span
                        className="absolute top-[calc(50%-9px)] h-2 rounded-sm border border-line-strong bg-surface-3"
                        style={{ left: `${pos(ps)}%`, width: `max(3px, ${pos(pe) - pos(ps)}%)` }}
                        title={`${t("ops.plan")}: ${range(op.plannedStart, op.plannedEnd)}`}
                      />
                      {as !== undefined && ae !== undefined && (
                        <span
                          className={cn("absolute top-[calc(50%+1px)] h-2.5 rounded-sm", BAR[op.status] ?? "bg-ink-3", running && "pulse-dot")}
                          style={{ left: `${pos(as)}%`, width: `max(3px, ${pos(ae) - pos(as)}%)` }}
                          title={`${t("ops.act")}: ${range(op.actualStart!, op.actualEnd)}`}
                        />
                      )}
                      {nowPct !== null && <span className="absolute inset-y-0 border-l border-dashed border-critical" style={{ left: `${nowPct}%` }} aria-hidden />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-line bg-surface-2 text-xs">
              <td className="py-2.5 pl-5" />
              <td className="px-3 py-2.5 font-semibold text-ink" colSpan={4}>
                {t("ops.total")}
              </td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap tabular">
                <span className="text-ink-2">{fmt.duration(stdDone)}</span>
                <span className="text-ink-3"> / </span>
                <span className="font-medium text-ink">{actDone ? fmt.duration(actDone) : "—"}</span>
                {actDone > 0 && <div className="mt-0.5 text-ink-3">{t("ops.eff", { pct: fmt.pct(stdDone / actDone) })}</div>}
              </td>
              <td className="px-3 py-2.5 text-right whitespace-nowrap tabular">
                <span className="font-medium text-ink">{fmt.num(last.qtyDone)}</span>
                <span className="text-ink-3"> / </span>
                <span className={scrapTotal ? "font-medium text-serious-ink" : "text-ink-3"}>{fmt.num(scrapTotal)}</span>
              </td>
              <td className="pr-5" />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
