"use client";

import { memo, type ReactNode } from "react";
import { CalendarCheck2, Lightbulb, Wand2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Rectangle, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type BarShapeProps } from "recharts";
import { useFmt, useLabel, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import type { WorkCenterType } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { Button, Card, CardHeader, EmptyState, IdLink, PriorityBadge } from "@/components/ui";
import { axisProps, barRadiusH, ChartLegend, ChartTooltip, cursorProps, gridProps, STATUS_COLOR, yAxisProps } from "@/components/charts/theme";
import { messages } from "./messages";
import { dueEndOf, isUnavailable, type LateRow, loadTone, stillLate } from "./schedule";

export interface CapacityDatum {
  type: WorkCenterType;
  name: string;
  load: number;
  hours: number;
  machines: number;
}

const loadColor = (x: number) => STATUS_COLOR[loadTone(x)];

type TipItem = { name?: string | number; value?: number | string; color?: string; payload?: Record<string, unknown> };

/** ChartTooltip with the swatch tinted by each bar's load band. */
function CapacityTooltip(props: { active?: boolean; payload?: TipItem[]; label?: string | number; formatter?: (v: number, n: string, item: TipItem) => ReactNode }) {
  const payload = props.payload?.map((p) => ({ ...p, color: loadColor(Number(p.value)) }));
  return <ChartTooltip {...props} payload={payload} />;
}

export const CapacityCard = memo(function CapacityCard({ data, className }: { data: CapacityDatum[]; className?: string }) {
  const t = useT(messages);
  const fmt = useFmt();
  const max = Math.max(1, ...data.map((d) => d.load));
  const domainMax = Math.ceil(max * 10) / 10;
  return (
    <Card className={className}>
      <CardHeader title={t("cap.title")} subtitle={t("cap.subtitle")} />
      <div className="px-5">
        <ChartLegend
          items={[
            { label: t("cap.lt75"), color: STATUS_COLOR.good },
            { label: t("cap.75to90"), color: STATUS_COLOR.warn },
            { label: t("cap.90to100"), color: STATUS_COLOR.serious },
            { label: t("cap.gt100"), color: STATUS_COLOR.critical },
            { label: t("cap.target"), color: "var(--ink-3)", dashed: true },
          ]}
        />
      </div>
      <div className="px-3 pt-3 pb-4">
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * 28 + 36)}>
          <BarChart data={data} layout="vertical" margin={{ top: 14, right: 44, bottom: 0, left: 4 }}>
            <CartesianGrid {...gridProps} horizontal={false} vertical />
            <XAxis type="number" {...axisProps} domain={[0, domainMax]} tickFormatter={(v: number) => fmt.pct(v)} />
            <YAxis type="category" dataKey="name" {...yAxisProps} width={124} interval={0} />
            <Tooltip
              cursor={cursorProps}
              content={
                <CapacityTooltip
                  formatter={(v, _n, item) => {
                    const d = item.payload as unknown as CapacityDatum | undefined;
                    return d ? `${fmt.pct(v)} · ${t("cap.booked", { h: fmt.num(d.hours), n: d.machines })}` : fmt.pct(v);
                  }}
                />
              }
            />
            <ReferenceLine x={0.85} stroke="var(--ink-3)" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: fmt.pct(0.85), position: "top", fill: "var(--ink-3)", fontSize: 10 }} />
            <Bar
              dataKey="load"
              name={t("cap.load")}
              radius={barRadiusH}
              maxBarSize={16}
              fill="var(--chart-muted)"
              shape={(p: BarShapeProps) => <Rectangle {...p} radius={barRadiusH} fill={loadColor(Number(p.value))} />}
              label={{ position: "right", fill: "var(--ink-2)", fontSize: 11, formatter: (v: unknown) => fmt.pct(Number(v)) }}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
});

function suggestionText(row: LateRow, t: (k: string, v?: Record<string, string | number>) => string, fmt: ReturnType<typeof useFmt>, label: ReturnType<typeof useLabel>) {
  const s = row.suggestion;
  switch (s.kind) {
    case "move":
      return t("late.suggest.move", {
        seq: s.moveOp!.seq,
        op: label("op", s.moveOp!.operation),
        from: s.from!.id,
        fromLoad: isUnavailable(s.from!) ? label("machineStatus", s.from!.status) : fmt.pct(s.fromLoad ?? 0),
        to: s.to!.id,
        toLoad: fmt.pct(s.toLoad ?? 0),
        pull: fmt.duration(s.pullMin),
      });
    case "expedite":
      return t("late.suggest.expedite", { pull: fmt.duration(s.pullMin) });
    case "overtime":
      return t("late.suggest.overtime", { pull: fmt.duration(s.pullMin) });
    case "priority":
      return t("late.suggest.priority");
    default:
      return t("late.suggest.notify");
  }
}

export const LateCard = memo(function LateCard({ rows, onApply, className }: { rows: LateRow[]; onApply: (row: LateRow) => void; className?: string }) {
  const t = useT(messages);
  const fmt = useFmt();
  const label = useLabel();
  const lk = useLookups();
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader title={t("late.title")} subtitle={rows.length ? t("late.subtitle", { n: rows.length }) : undefined} />
      {rows.length === 0 ? (
        <EmptyState icon={<CalendarCheck2 className="size-5" />} title={t("late.none")} hint={t("late.noneHint")} />
      ) : (
        <div className="max-h-[560px] overflow-y-auto scroll-thin">
          {rows.map((row) => {
            const { wo, suggestion: s } = row;
            const product = lk.product.get(wo.productId);
            const customer = wo.customerId ? lk.customer.get(wo.customerId) : undefined;
            const pulls = s.kind === "move" || s.kind === "expedite" || s.kind === "overtime";
            const still = pulls && stillLate(s.newEnd, wo.dueDate);
            return (
              <div key={wo.id} className="grid gap-x-5 gap-y-2.5 border-t border-line px-5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <IdLink href={`/work-orders/${wo.id}`}>{wo.id}</IdLink>
                    <PriorityBadge value={wo.priority} compact />
                  </div>
                  <div className="mt-0.5 truncate text-xs text-ink-3">
                    {product?.sku} · {customer?.name ?? t("common.makeToStock")}
                  </div>
                </div>
                <div className="flex gap-5 text-xs tabular">
                  <div>
                    <div className="text-ink-3">{t("late.due")}</div>
                    <div className="font-medium text-ink">{fmt.date(wo.dueDate)}</div>
                  </div>
                  <div>
                    <div className="text-ink-3">{t("late.plannedEnd")}</div>
                    <div className="text-ink">{fmt.dateTime(row.plannedEnd)}</div>
                  </div>
                  <div>
                    <div className="text-ink-3">{t("late.delay")}</div>
                    <div className="font-semibold text-critical-ink">{row.overdue ? t("late.overdue") : t("late.hours", { n: fmt.num(row.delayMin / 60, 1) })}</div>
                  </div>
                </div>
                <div className="flex min-w-0 items-start gap-3 rounded-lg bg-surface-2 px-3 py-2 sm:col-span-2">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  <div className="min-w-0 flex-1 text-[13px] leading-snug text-ink-2">
                    {suggestionText(row, t, fmt, label)}
                    {pulls && (
                      <div className={cn("mt-0.5 text-xs font-medium tabular", still ? "text-warn-ink" : "text-good-ink")}>
                        {still
                          ? t("late.result.still", { end: fmt.dateTime(s.newEnd), h: fmt.duration((s.newEnd - dueEndOf(wo.dueDate)) / 60000) })
                          : t("late.result.onTime", { end: fmt.dateTime(s.newEnd) })}
                      </div>
                    )}
                  </div>
                  <Button size="xs" variant="subtle" icon={<Wand2 className="size-3.5" />} onClick={() => onApply(row)}>
                    {t("late.apply")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
});
