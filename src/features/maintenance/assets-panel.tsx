"use client";

import { useMemo } from "react";
import { AlertOctagon, AlertTriangle, CalendarPlus, CheckCircle2 } from "lucide-react";
import { useFmt, useLabel, useT } from "@/i18n";
import type { Machine, MaintenanceOrder } from "@/lib/data/types";
import { useClock } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Badge, Button, DataTable, IdLink, Progress, StatusBadge, type Column } from "@/components/ui";
import { healthScore, type Health } from "./lib";
import { messages } from "./messages";

export interface AssetRow {
  machine: Machine;
  openJobs: number;
  openCorrective: number;
  sensorWarns: number;
  pmOverdue: boolean;
  health: Health;
}

const HEALTH_ICON = { good: CheckCircle2, warn: AlertTriangle, critical: AlertOctagon } as const;

export function useAssetRows(machines: Machine[], maintenance: MaintenanceOrder[]): AssetRow[] {
  const clock = useClock();
  return useMemo(() => {
    const open = new Map<string, { all: number; corrective: number }>();
    for (const mo of maintenance) {
      if (mo.status === "completed") continue;
      const v = open.get(mo.machineId) ?? { all: 0, corrective: 0 };
      v.all++;
      if (mo.type === "corrective") v.corrective++;
      open.set(mo.machineId, v);
    }
    return machines.map((m) => {
      const o = open.get(m.id) ?? { all: 0, corrective: 0 };
      const sensorWarns = m.sensors.filter((s) => s.warn).length;
      const pmOverdue = m.nextPm < clock.today;
      return { machine: m, openJobs: o.all, openCorrective: o.corrective, sensorWarns, pmOverdue, health: healthScore(m, { openCorrective: o.corrective, pmOverdue, sensorWarns }) };
    });
  }, [machines, maintenance, clock.today]);
}

export function HealthCell({ health }: { health: Health }) {
  const t = useT(messages);
  const Icon = HEALTH_ICON[health.tone];
  return (
    <div className="flex min-w-40 items-center gap-2.5">
      <span className="tabular w-7 text-right text-sm font-semibold text-ink">{health.score}</span>
      <Progress value={health.score / 100} tone={health.tone} size="sm" className="w-16" />
      <span className={cn("inline-flex items-center gap-1 text-xs whitespace-nowrap", health.tone === "good" ? "text-good-ink" : health.tone === "warn" ? "text-warn-ink" : "text-critical-ink")}>
        <Icon className="size-3.5" />
        {t(`health.${health.tone}`)}
      </span>
    </div>
  );
}

export function AssetsPanel({ rows, onSchedule }: { rows: AssetRow[]; onSchedule: (machineId: string) => void }) {
  const t = useT(messages);
  const fmt = useFmt();
  const label = useLabel();

  const counts = useMemo(() => {
    const c = { good: 0, warn: 0, critical: 0 };
    for (const r of rows) c[r.health.tone]++;
    return c;
  }, [rows]);

  const columns = useMemo<Column<AssetRow>[]>(
    () => [
      {
        key: "machine",
        header: t("col.machine"),
        cell: (r) => (
          <span className="block min-w-0">
            <IdLink href={`/shop-floor?machine=${r.machine.id}`}>{r.machine.id}</IdLink>
            <span className="block max-w-44 truncate text-xs text-ink-3">
              {r.machine.name} · {r.machine.line}
            </span>
          </span>
        ),
        sortValue: (r) => r.machine.id,
      },
      { key: "type", header: t("col.type"), cell: (r) => <span className="whitespace-nowrap text-ink-2">{label("wc", r.machine.type)}</span>, sortValue: (r) => r.machine.type, hideBelow: "xl" },
      { key: "state", header: t("col.machineStatus"), cell: (r) => <StatusBadge kind="machineStatus" value={r.machine.status} />, sortValue: (r) => r.machine.status, hideBelow: "md" },
      { key: "mtbf", header: t("col.mtbf"), cell: (r) => `${fmt.num(r.machine.mtbfHours)} ${t("kpi.hours")}`, sortValue: (r) => r.machine.mtbfHours, align: "right", hideBelow: "lg" },
      { key: "mttr", header: t("col.mttr"), cell: (r) => `${fmt.num(r.machine.mttrHours, 1)} ${t("kpi.hours")}`, sortValue: (r) => r.machine.mttrHours, align: "right", hideBelow: "lg" },
      { key: "lastPm", header: t("col.lastPm"), cell: (r) => <span className="tabular whitespace-nowrap text-ink-2">{fmt.date(r.machine.lastPm)}</span>, sortValue: (r) => r.machine.lastPm, hideBelow: "xl" },
      {
        key: "nextPm",
        header: t("col.nextPm"),
        cell: (r) =>
          r.pmOverdue ? (
            <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap text-critical-ink" title={t("overdue")}>
              <AlertTriangle className="size-3.5" />
              <span className="tabular">{fmt.date(r.machine.nextPm)}</span>
            </span>
          ) : (
            <span className="tabular whitespace-nowrap text-ink-2">{fmt.date(r.machine.nextPm)}</span>
          ),
        sortValue: (r) => r.machine.nextPm,
        hideBelow: "sm",
      },
      {
        key: "open",
        header: t("col.openJobs"),
        cell: (r) => <span className={cn("tabular", r.openCorrective > 0 ? "font-medium text-critical-ink" : r.openJobs ? "text-ink" : "text-ink-3")}>{fmt.num(r.openJobs)}</span>,
        sortValue: (r) => r.openJobs,
        align: "right",
        hideBelow: "md",
      },
      { key: "avail", header: t("col.availability"), cell: (r) => fmt.pct(r.machine.availability, 1), sortValue: (r) => r.machine.availability, align: "right", hideBelow: "lg" },
      {
        key: "health",
        header: t("col.health"),
        cell: (r) => (
          <span className="block" title={r.sensorWarns ? t("health.sensorWarn", { n: r.sensorWarns }) : undefined}>
            <HealthCell health={r.health} />
          </span>
        ),
        sortValue: (r) => r.health.score,
      },
      {
        key: "action",
        header: t("col.action"),
        cell: (r) => (
          <Button
            size="xs"
            variant={r.pmOverdue ? "subtle" : "ghost"}
            icon={<CalendarPlus className="size-3.5" />}
            title={t("health.schedulePm")}
            aria-label={t("health.schedulePm")}
            onClick={(e) => {
              e.stopPropagation();
              onSchedule(r.machine.id);
            }}
          >
            <span className="hidden sm:inline">{t("health.schedulePm")}</span>
          </Button>
        ),
        align: "right",
      },
    ],
    [t, fmt, label, onSchedule],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <p className="text-xs text-ink-3">{t("health.hint")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="critical" icon={<AlertOctagon className="size-3.5" />}>
            {fmt.num(counts.critical)} {t("health.critical")}
          </Badge>
          <Badge tone="warn" icon={<AlertTriangle className="size-3.5" />}>
            {fmt.num(counts.warn)} {t("health.warn")}
          </Badge>
          <Badge tone="good" icon={<CheckCircle2 className="size-3.5" />}>
            {fmt.num(counts.good)} {t("health.good")}
          </Badge>
        </div>
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.machine.id} initialSort={{ key: "health", dir: "asc" }} pageSize={20} rowClassName={(r) => (r.machine.status === "down" ? "bg-critical-soft/30" : undefined)} />
    </div>
  );
}
