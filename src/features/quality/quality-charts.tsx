"use client";

import { BarChart3 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFmt, useT } from "@/i18n";
import type { DefectType } from "@/lib/data/types";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import { axisProps, barRadiusH, ChartLegend, cursorProps, gridProps, lineCursor, SERIES, yAxisProps } from "@/components/charts/theme";
import { messages } from "./messages";
import { TooltipCard } from "./parts";

export interface ParetoRow {
  defect: DefectType;
  name: string;
  count: number;
  cum: number; // cumulative share 0..1 including this bar
  vital: boolean;
}

const MUTED = "var(--chart-muted)";

/** Horizontal Pareto; cumulative share lives in the tooltip (no second axis). */
export function DefectParetoCard({ rows, active, onPick }: { rows: ParetoRow[]; active: DefectType | "all"; onPick: (d: DefectType) => void }) {
  const t = useT(messages);
  const fmt = useFmt();
  return (
    <Card>
      <CardHeader
        title={t("pareto.title")}
        subtitle={t("pareto.subtitle")}
        actions={
          <ChartLegend
            className="hidden sm:flex"
            items={[
              { label: t("pareto.vital"), color: SERIES[0] },
              { label: t("pareto.other"), color: MUTED },
            ]}
          />
        }
      />
      <CardBody>
        {rows.length === 0 ? (
          <EmptyState icon={<BarChart3 className="size-5" />} title={t("pareto.empty")} />
        ) : (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }}>
                  <CartesianGrid {...gridProps} horizontal={false} vertical />
                  <XAxis type="number" {...axisProps} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" {...yAxisProps} width={136} interval={0} />
                  <Tooltip
                    cursor={cursorProps}
                    content={({ active: on, payload }) => {
                      const r = on && payload?.[0]?.payload ? (payload[0].payload as ParetoRow) : null;
                      if (!r) return null;
                      return (
                        <TooltipCard
                          title={r.name}
                          rows={[
                            { label: t("pareto.ncrs"), value: fmt.num(r.count), color: r.vital ? SERIES[0] : MUTED },
                            { label: t("pareto.cum"), value: fmt.pct(r.cum, 1) },
                          ]}
                        />
                      );
                    }}
                  />
                  <Bar
                    dataKey="count"
                    name={t("pareto.ncrs")}
                    radius={barRadiusH}
                    maxBarSize={18}
                    className="cursor-pointer"
                    onClick={(d) => {
                      const row = d.payload as ParetoRow | undefined;
                      if (row) onPick(row.defect);
                    }}
                    label={{ position: "right", fill: "var(--ink-2)", fontSize: 11 }}
                  >
                    {rows.map((r) => (
                      <Cell key={r.defect} fill={r.vital ? SERIES[0] : MUTED} fillOpacity={active === "all" || active === r.defect ? 1 : 0.35} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-ink-3">{t("pareto.hint")}</p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

export interface FpyPoint {
  date: string;
  label: string;
  fpy: number | null;
  n: number;
}

export const FPY_TARGET = 0.97;

export function FpyTrendCard({ data }: { data: FpyPoint[] }) {
  const t = useT(messages);
  const fmt = useFmt();
  const values = data.map((d) => d.fpy).filter((v): v is number => v !== null);
  const lo = values.length ? Math.min(0.85, Math.floor(Math.min(...values) * 20) / 20) : 0.85;
  return (
    <Card>
      <CardHeader
        title={t("fpy.title")}
        subtitle={t("fpy.subtitle")}
        actions={
          <ChartLegend
            className="hidden sm:flex"
            items={[
              { label: t("fpy.fpy"), color: SERIES[0] },
              { label: t("fpy.target"), color: MUTED, dashed: true },
            ]}
          />
        }
      />
      <CardBody>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} interval={3} />
              <YAxis {...yAxisProps} domain={[lo, 1]} tickFormatter={(v) => fmt.pct(v)} />
              <Tooltip
                cursor={lineCursor}
                content={({ active, payload }) => {
                  const p = active && payload?.[0]?.payload ? (payload[0].payload as FpyPoint) : null;
                  if (!p) return null;
                  return (
                    <TooltipCard
                      title={fmt.weekday(p.date)}
                      rows={[
                        { label: t("fpy.fpy"), value: p.fpy === null ? "—" : fmt.pct(p.fpy, 1), color: SERIES[0] },
                        { label: t("fpy.inspections"), value: fmt.num(p.n) },
                        { label: t("fpy.target"), value: fmt.pct(FPY_TARGET) },
                      ]}
                    />
                  );
                }}
              />
              <ReferenceLine y={FPY_TARGET} stroke={MUTED} strokeDasharray="5 4" strokeWidth={1.5} ifOverflow="extendDomain" />
              <Line
                dataKey="fpy"
                name={t("fpy.fpy")}
                stroke={SERIES[0]}
                strokeWidth={2}
                type="monotone"
                connectNulls
                dot={{ r: 2.5, fill: SERIES[0], strokeWidth: 0 }}
                activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardBody>
    </Card>
  );
}
