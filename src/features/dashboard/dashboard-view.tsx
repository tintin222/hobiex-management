"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Factory,
  Gauge,
  Info,
  Sparkles,
  Timer,
  Trash2,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFmt, useLabel, useLang, useT, useTx } from "@/i18n";
import { addDays, DAY } from "@/lib/data/clock";
import type { DowntimeEvent } from "@/lib/data/types";
import { isLate, useByPlant, useInsights, useLookups, usePlantFilter } from "@/lib/hooks";
import { useClock, useDb } from "@/lib/store";
import { cn } from "@/lib/cn";
import { PageContainer } from "@/components/layout/app-shell";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  IdLink,
  KpiTile,
  PageHeader,
  Progress,
  RingGauge,
  StatusBadge,
} from "@/components/ui";
import { axisProps, barRadius, barRadiusH, ChartLegend, ChartTooltip, cursorProps, gridProps, lineCursor, yAxisProps } from "@/components/charts/theme";
import { messages } from "./messages";

export function DashboardView() {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const lang = useLang();
  const label = useLabel();
  const clock = useClock();
  const plantFilter = usePlantFilter();
  const lk = useLookups();

  const plantsAll = useDb((db) => db.plants);
  const machinesAll = useDb((db) => db.machines);
  const workOrdersAll = useDb((db) => db.workOrders);
  const dailyAll = useDb((db) => db.dailyProduction);
  const hourlyAll = useDb((db) => db.hourlyProduction);
  const downtimeAll = useDb((db) => db.downtime);
  const inspectionsAll = useDb((db) => db.inspections);

  const plants = useMemo(() => plantsAll.filter((p) => plantFilter === "all" || p.id === plantFilter), [plantsAll, plantFilter]);
  const machines = useByPlant(machinesAll);
  const workOrders = useByPlant(workOrdersAll);
  const daily = useByPlant(dailyAll);
  const hourly = useByPlant(hourlyAll);
  const inspections = useByPlant(inspectionsAll);
  const insights = useInsights();

  // ── KPIs ──
  const k = useMemo(() => {
    const today = clock.today;
    const sumBy = (date: string, f: (d: (typeof daily)[number]) => number) => daily.filter((d) => d.date === date).reduce((s, d) => s + f(d), 0);
    const producedToday = sumBy(today, (d) => d.produced);
    const targetToday = sumBy(today, (d) => d.target);
    const paceTarget = targetToday * ((clock.minuteOfDay + 1) / 1440);
    const last30 = Array.from({ length: 30 }, (_, i) => addDays(today, -30 + i));
    const producedSeries = last30.map((d) => sumBy(d, (x) => x.produced));
    const prev7 = producedSeries.slice(-7).reduce((a, b) => a + b, 0);
    const prior7 = producedSeries.slice(-14, -7).reduce((a, b) => a + b, 0);
    const oeeToday = machines.length ? machines.reduce((s, m) => s + m.oee, 0) / machines.length : 0;
    const oeeSeries = last30.map((d) => {
      const rows = daily.filter((x) => x.date === d);
      return rows.length ? rows.reduce((s, x) => s + x.oee, 0) / rows.length : 0;
    });
    const oee30 = oeeSeries.reduce((a, b) => a + b, 0) / oeeSeries.length;
    const otdSeries = last30.map((d) => {
      const rows = daily.filter((x) => x.date === d);
      return rows.length ? rows.reduce((s, x) => s + x.onTimePct, 0) / rows.length : 0;
    });
    const otd = otdSeries.slice(-30).reduce((a, b) => a + b, 0) / 30;
    const otdPrev = dailyAll.length ? otdSeries.slice(0, 15).reduce((a, b) => a + b, 0) / 15 : 0;
    const scrapSeries = last30.map((d) => {
      const p = sumBy(d, (x) => x.produced);
      return p ? sumBy(d, (x) => x.scrap) / p : 0;
    });
    const scrap7 = scrapSeries.slice(-7).reduce((a, b) => a + b, 0) / 7;
    const scrapPrior = scrapSeries.slice(-14, -7).reduce((a, b) => a + b, 0) / 7;
    const open = workOrders.filter((w) => w.status !== "completed" && w.status !== "planned");
    const late = workOrders.filter((w) => w.status !== "completed" && isLate(w, today));
    const running = machines.filter((m) => m.status === "running" || m.status === "setup").length;
    const down = machines.filter((m) => m.status === "down").length;
    const recentInsp = inspections.filter((i) => i.type !== "incoming" && Date.parse(i.at) > clock.now - 7 * DAY);
    const fpy = recentInsp.length ? recentInsp.filter((i) => i.result === "pass").length / recentInsp.length : 1;
    return { producedToday, targetToday, paceTarget, producedSeries, prev7, prior7, oeeToday, oee30, oeeSeries, otd, otdPrev, otdSeries, scrap7, scrapPrior, scrapSeries, open, late, running, down, fpy };
  }, [daily, dailyAll.length, machines, workOrders, inspections, clock]);

  // ── Hourly output today ──
  const hourlyData = useMemo(() => {
    const rows: { hour: string; produced: number; target: number }[] = [];
    for (let h = 0; h < 24; h++) {
      const hs = hourly.filter((x) => x.hour === h);
      const target = plants.reduce((s, p) => s + p.dailyTarget / 24, 0);
      rows.push({ hour: `${String(h).padStart(2, "0")}:00`, produced: hs.length ? hs.reduce((s, x) => s + x.produced, 0) : (null as unknown as number), target: Math.round(target) });
    }
    return rows;
  }, [hourly, plants]);

  // ── Daily output last 30 days ──
  const dailyData = useMemo(() => {
    const out: { date: string; label: string; produced: number; target: number }[] = [];
    for (let i = -29; i <= -1; i++) {
      const d = addDays(clock.today, i);
      const rows = daily.filter((x) => x.date === d);
      out.push({ date: d, label: fmt.date(d), produced: rows.reduce((s, x) => s + x.produced, 0), target: rows.reduce((s, x) => s + x.target, 0) });
    }
    return out;
  }, [daily, clock.today, fmt]);

  // ── Downtime Pareto, last 7 days ──
  const pareto = useMemo(() => {
    const ids = new Set(machines.map((m) => m.id));
    const by = new Map<DowntimeEvent["reason"], number>();
    for (const d of downtimeAll) {
      if (!ids.has(d.machineId) || Date.parse(d.start) < clock.now - 7 * DAY) continue;
      by.set(d.reason, (by.get(d.reason) ?? 0) + d.minutes);
    }
    return [...by.entries()].map(([reason, minutes]) => ({ reason, name: label("downtime", reason), hours: Math.round((minutes / 60) * 10) / 10 })).sort((a, b) => b.hours - a.hours);
  }, [downtimeAll, machines, clock.now, label]);

  // ── Due soon ──
  const dueSoon = useMemo(() => {
    const limit = addDays(clock.today, 2);
    return workOrders
      .filter((w) => w.status !== "completed" && w.status !== "planned" && w.dueDate <= limit)
      .sort((a, b) => (a.dueDate === b.dueDate ? (a.priority === "urgent" ? -1 : 1) : a.dueDate < b.dueDate ? -1 : 1))
      .slice(0, 7);
  }, [workOrders, clock.today]);

  // ── Plant cards ──
  const plantStats = useMemo(
    () =>
      plants.map((p) => {
        const ms = machinesAll.filter((m) => m.plantId === p.id);
        const today = dailyAll.find((d) => d.plantId === p.id && d.date === clock.today);
        const wip = workOrdersAll.filter((w) => w.plantId === p.id && (w.status === "in_progress" || w.status === "quality_check" || w.status === "on_hold")).length;
        return {
          plant: p,
          oee: ms.reduce((s, m) => s + m.oee, 0) / ms.length,
          produced: today?.produced ?? 0,
          pace: (p.dailyTarget * (clock.minuteOfDay + 1)) / 1440,
          running: ms.filter((m) => m.status === "running" || m.status === "setup").length,
          down: ms.filter((m) => m.status === "down").length,
          total: ms.length,
          wip,
        };
      }),
    [plants, machinesAll, dailyAll, workOrdersAll, clock],
  );

  const pace = k.paceTarget ? k.producedToday / k.paceTarget : 0;
  const hello = clock.hour < 12 ? t("greet.morning") : clock.hour < 18 ? t("greet.afternoon") : t("greet.evening");

  return (
    <PageContainer>
      <PageHeader
        title={hello}
        subtitle={t("subtitle", { date: fmt.weekday(clock.now), plants: plantFilter === "all" ? t("allPlants") : tx(plants[0]?.name ?? "", plants[0]?.nameTr) })}
        actions={
          <>
            <Link href="/tasks">
              <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium text-ink shadow-sm hover:bg-surface-2">
                <ClipboardList className="size-4" />
                {t("openTaskBoard")}
              </span>
            </Link>
            <Link href="/shop-floor">
              <span className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3.5 text-sm font-medium text-brand-ink shadow-sm hover:bg-brand-hover">
                <Factory className="size-4" />
                {t("liveFloor")}
              </span>
            </Link>
          </>
        }
      />

      {/* Hero + KPI row */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Card className="flex flex-col justify-between gap-3 bg-gradient-to-br from-[#0b2a52] to-[#0f5db8] p-5 text-white md:col-span-2 xl:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-white/80">{t("kpi.unitsToday")}</span>
            <Activity className="size-4 text-white/70" />
          </div>
          <div>
            <div className="font-display text-5xl leading-none font-semibold tracking-tight">{fmt.num(k.producedToday)}</div>
            <div className="mt-2 text-sm text-white/75">
              {t("kpi.ofTarget", { target: fmt.num(k.targetToday) })} · {t("kpi.pace", { pct: fmt.pct(pace) })}
            </div>
          </div>
          <div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, (k.producedToday / Math.max(1, k.targetToday)) * 100)}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-white/70">
              <span>{t("kpi.weekVsPrior", { pct: `${k.prev7 >= k.prior7 ? "+" : "−"}${fmt.pct(Math.abs((k.prev7 - k.prior7) / Math.max(1, k.prior7)), 1)}` })}</span>
              <span>{t("kpi.monthRunRate", { n: fmt.compact(k.producedSeries.reduce((a, b) => a + b, 0)) })}</span>
            </div>
          </div>
        </Card>
        <KpiTile label={t("kpi.oee")} value={fmt.pct(k.oeeToday, 1)} delta={k.oeeToday - k.oee30} deltaLabel={t("kpi.vs30")} trend={k.oeeSeries.slice(-14)} icon={<Gauge className="size-4" />} />
        <KpiTile label={t("kpi.otd")} value={fmt.pct(k.otd, 1)} delta={k.otd - k.otdPrev} deltaLabel={t("kpi.vsPrev")} trend={k.otdSeries.slice(-14)} icon={<Timer className="size-4" />} />
        <KpiTile label={t("kpi.scrap")} value={fmt.pct(k.scrap7, 2)} delta={k.scrapPrior ? (k.scrap7 - k.scrapPrior) / k.scrapPrior : 0} upIsGood={false} deltaLabel={t("kpi.vsPriorWeek")} trend={k.scrapSeries.slice(-14)} icon={<Trash2 className="size-4" />} />
        <KpiTile
          label={t("kpi.machines")}
          value={`${k.running}/${machines.length}`}
          icon={<Factory className="size-4" />}
          footer={
            <span className="flex items-center gap-2">
              {k.down > 0 ? (
                <Badge tone="critical" icon={<AlertOctagon className="size-3.5" />}>
                  {t("kpi.down", { n: k.down })}
                </Badge>
              ) : (
                <Badge tone="good" icon={<CheckCircle2 className="size-3.5" />}>
                  {t("kpi.allRunning")}
                </Badge>
              )}
              <span className="text-ink-3">{t("kpi.fpy", { pct: fmt.pct(k.fpy, 1) })}</span>
            </span>
          }
        />
      </div>

      {/* Hourly + insights */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="flex flex-col xl:col-span-2">
          <CardHeader
            title={t("hourly.title")}
            subtitle={t("hourly.subtitle")}
            actions={
              <ChartLegend
                items={[
                  { label: t("common.produced"), color: "var(--series-1)" },
                  { label: t("hourly.target"), color: "var(--chart-muted)", dashed: true },
                ]}
              />
            }
          />
          <CardBody className="flex-1">
            <div className="h-full min-h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={hourlyData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="hour" {...axisProps} interval={2} />
                  <YAxis {...yAxisProps} tickFormatter={(v) => fmt.num(v)} />
                  <Tooltip cursor={cursorProps} content={<ChartTooltip formatter={(v) => `${fmt.num(v)} ${t("common.pcs")}`} />} />
                  <Bar dataKey="produced" name={t("common.produced")} fill="var(--series-1)" radius={barRadius} maxBarSize={22} />
                  <Line dataKey="target" name={t("hourly.target")} stroke="var(--chart-muted)" strokeDasharray="5 4" strokeWidth={2} dot={false} type="stepAfter" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("insights.title")} subtitle={t("insights.subtitle")} icon={<Sparkles className="size-4 text-brand" />} />
          <div className="flex flex-col">
            {insights.slice(0, 5).map((i) => {
              const Icon = i.severity === "critical" ? AlertOctagon : i.severity === "warning" ? AlertTriangle : Info;
              return (
                <Link key={i.id} href={i.href} className="group flex gap-3 border-t border-line px-5 py-3 hover:bg-surface-2">
                  <Icon className={cn("mt-0.5 size-4 shrink-0", i.severity === "critical" ? "text-critical" : i.severity === "warning" ? "text-warn" : "text-brand")} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug font-medium text-ink">{lang === "tr" ? i.titleTr : i.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink-3">{lang === "tr" ? i.detailTr : i.detail}</p>
                  </div>
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Plants */}
      <div className={cn("mt-4 grid gap-4", plantStats.length > 1 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-1")}>
        {plantStats.map((s) => (
          <Card key={s.plant.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-sm" style={{ background: `var(--series-${Number(s.plant.id.slice(1))})` }} />
                  <span className="text-xs font-semibold text-ink-3">{s.plant.code}</span>
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-ink">{tx(s.plant.name, s.plant.nameTr).split("·")[1]?.trim()}</div>
                <div className="truncate text-xs text-ink-3">{tx(s.plant.focus, s.plant.focusTr)}</div>
              </div>
              <RingGauge value={s.oee} size={58} stroke={6} label="OEE" />
            </div>
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-ink-2">{t("plant.today")}</span>
                <span className="tabular font-medium text-ink">
                  {fmt.num(s.produced)} / {fmt.num(s.plant.dailyTarget)}
                </span>
              </div>
              <Progress value={s.produced / s.plant.dailyTarget} tone={s.produced >= s.pace * 0.95 ? "good" : s.produced >= s.pace * 0.85 ? "warn" : "critical"} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-surface-2 py-1.5">
                <div className="tabular text-sm font-semibold text-ink">
                  {s.running}/{s.total}
                </div>
                <div className="text-[11px] text-ink-3">{t("plant.running")}</div>
              </div>
              <div className="rounded-lg bg-surface-2 py-1.5">
                <div className={cn("tabular text-sm font-semibold", s.down ? "text-critical-ink" : "text-ink")}>{s.down}</div>
                <div className="text-[11px] text-ink-3">{t("plant.down")}</div>
              </div>
              <div className="rounded-lg bg-surface-2 py-1.5">
                <div className="tabular text-sm font-semibold text-ink">{s.wip}</div>
                <div className="text-[11px] text-ink-3">{t("plant.wip")}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Daily trend + pareto */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={t("daily.title")}
            subtitle={t("daily.subtitle")}
            actions={
              <ChartLegend
                items={[
                  { label: t("common.produced"), color: "var(--series-1)" },
                  { label: t("hourly.target"), color: "var(--chart-muted)", dashed: true },
                ]}
              />
            }
          />
          <CardBody>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" {...axisProps} interval={4} />
                  <YAxis {...yAxisProps} tickFormatter={(v) => fmt.compact(v)} />
                  <Tooltip cursor={lineCursor} content={<ChartTooltip formatter={(v) => fmt.num(v)} />} />
                  <Bar dataKey="produced" name={t("common.produced")} fill="var(--series-1)" radius={barRadius} maxBarSize={18} />
                  <Line dataKey="target" name={t("hourly.target")} stroke="var(--chart-muted)" strokeDasharray="5 4" strokeWidth={2} dot={false} type="monotone" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("pareto.title")} subtitle={t("pareto.subtitle")} />
          <CardBody>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pareto} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 0 }}>
                  <CartesianGrid {...gridProps} horizontal={false} vertical />
                  <XAxis type="number" {...axisProps} tickFormatter={(v) => `${v} h`} />
                  <YAxis type="category" dataKey="name" {...yAxisProps} width={128} />
                  <Tooltip cursor={cursorProps} content={<ChartTooltip formatter={(v) => `${fmt.num(v, 1)} h`} />} />
                  <Bar dataKey="hours" name={t("pareto.hours")} fill="var(--series-2)" radius={barRadiusH} maxBarSize={18} label={{ position: "right", fill: "var(--ink-2)", fontSize: 11, formatter: (v: unknown) => `${v}` }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Due soon + machine alerts */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={t("due.title")}
            subtitle={t("due.subtitle", { n: k.late.length })}
            actions={
              <Link href="/work-orders" className="text-[13px] font-medium text-brand hover:underline">
                {t("common.viewAll")}
              </Link>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line text-left text-xs text-ink-3">
                  <th className="px-5 py-2 font-medium">{t("common.workOrder")}</th>
                  <th className="px-3 py-2 font-medium">{t("common.product")}</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">{t("common.customer")}</th>
                  <th className="px-3 py-2 font-medium">{t("common.progress")}</th>
                  <th className="px-3 py-2 font-medium">{t("common.due")}</th>
                  <th className="px-5 py-2 font-medium">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {dueSoon.map((w) => {
                  const p = lk.product.get(w.productId)!;
                  const done = w.operations.filter((o) => o.status === "done").length;
                  const late = isLate(w, clock.today);
                  return (
                    <tr key={w.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5">
                        <IdLink href={`/work-orders/${w.id}`}>{w.id}</IdLink>
                      </td>
                      <td className="max-w-56 truncate px-3 py-2.5">
                        <span className="text-ink">{p.sku}</span> <span className="text-ink-3">· {w.qty}</span>
                      </td>
                      <td className="hidden max-w-48 truncate px-3 py-2.5 text-ink-2 md:table-cell">{w.customerId ? lk.customer.get(w.customerId)?.name : <span className="text-ink-3">{t("common.makeToStock")}</span>}</td>
                      <td className="w-36 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Progress value={done / w.operations.length} size="sm" tone={late ? "critical" : "brand"} />
                          <span className="tabular text-xs text-ink-3">
                            {done}/{w.operations.length}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={cn("tabular", late ? "font-medium text-critical-ink" : "text-ink-2")}>{fmt.date(w.dueDate)}</span>
                      </td>
                      <td className="px-5 py-2.5">
                        <StatusBadge kind="woStatus" value={w.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t("floor.title")}
            subtitle={t("floor.subtitle")}
            actions={
              <Link href="/shop-floor" className="text-[13px] font-medium text-brand hover:underline">
                {t("common.viewAll")}
              </Link>
            }
          />
          <CardBody className="flex flex-col gap-4">
            <MachineStatusBar machines={machines} />
            <div className="flex flex-col gap-2">
              {machines
                .filter((m) => m.status === "down" || m.status === "maintenance")
                .slice(0, 5)
                .map((m) => (
                  <Link key={m.id} href={`/shop-floor?machine=${m.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 hover:bg-surface-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink">
                        {m.id} <span className="font-normal text-ink-3">· {m.name}</span>
                      </div>
                      <div className="truncate text-xs text-ink-3">{m.downReason ?? label("machineStatus", m.status)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge kind="machineStatus" value={m.status} />
                      <span className="text-[11px] text-ink-3">{fmt.relative(m.statusSince, clock.now)}</span>
                    </div>
                  </Link>
                ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </PageContainer>
  );
}

function MachineStatusBar({ machines }: { machines: { status: string }[] }) {
  const label = useLabel();
  const order = ["running", "setup", "idle", "maintenance", "down"] as const;
  const color: Record<string, string> = { running: "var(--good)", setup: "var(--brand)", idle: "var(--chart-muted)", maintenance: "var(--warn)", down: "var(--critical)" };
  const counts = order.map((s) => [s, machines.filter((m) => m.status === s).length] as const);
  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {counts.map(([s, n]) => (n ? <div key={s} style={{ flex: n, background: color[s] }} title={`${label("machineStatus", s)}: ${n}`} /> : null))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
        {counts.map(([s, n]) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: color[s] }} />
            {label("machineStatus", s)} <span className="tabular font-medium text-ink">{n}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

