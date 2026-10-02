"use client";

import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, AlertOctagon, CheckCircle2, Factory, LayoutGrid, Minimize2, PlayCircle, Table2, Tv, Wrench } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { cn } from "@/lib/cn";
import { MIN, SHIFT_HOURS } from "@/lib/data/clock";
import type { Machine, MachineStatus } from "@/lib/data/types";
import { useByPlant, useLookups, usePlantFilter } from "@/lib/hooks";
import { useClock, useDb } from "@/lib/store";
import { PageContainer } from "@/components/layout/app-shell";
import {
  Badge,
  Button,
  Card,
  type Column,
  DataTable,
  EmptyState,
  IdLink,
  PageHeader,
  PersonChip,
  Progress,
  RingGauge,
  Segmented,
  STATUS_STYLES,
  StatusBadge,
} from "@/components/ui";
import { PLANT_COLOR } from "@/components/charts/theme";
import { tickProduction } from "./actions";
import { factoryClock, paceTone, shiftInfo, STATUS_ORDER, toneIcon, useTickingNow } from "./bits";
import { MachineDrawer } from "./machine-drawer";
import { MachineTile } from "./machine-tile";
import { messages } from "./messages";

type View = "tiles" | "table";
type Filter = MachineStatus | "all";

const STATUS_RANK: Record<MachineStatus, number> = { down: 0, maintenance: 1, setup: 2, running: 3, idle: 4 };

export function ShopFloorView() {
  const t = useT(messages);
  const fmt = useFmt();
  const tx = useTx();
  const clock = useClock();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.get("machine");
  const plantFilter = usePlantFilter();
  const lk = useLookups();

  const plantsAll = useDb((db) => db.plants);
  const machinesAll = useDb((db) => db.machines);
  const workOrdersAll = useDb((db) => db.workOrders);
  const maintenance = useDb((db) => db.maintenance);
  const machines = useByPlant(machinesAll);

  const [view, setView] = useState<View>("tiles");
  const [filter, setFilter] = useState<Filter>("all");
  const [tv, setTv] = useState(false);
  const now = useTickingNow(clock.now, 30_000);
  const { dayFrac } = shiftInfo(now);

  // ── live counters: a few running machines report parts every ~8 s ──
  const selectedRef = useRef<string | null>(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    const id = setInterval(() => tickProduction(selectedRef.current), 8000);
    return () => clearInterval(id);
  }, []);

  // ── URL-driven drawer (/shop-floor?machine=ID is shareable) ──
  const openMachine = useCallback((id: string) => router.replace(`${pathname}?machine=${encodeURIComponent(id)}`, { scroll: false }), [router, pathname]);
  const closeMachine = useCallback(() => router.replace(pathname, { scroll: false }), [router, pathname]);

  // ── TV mode: fullscreen + dark andon styling ──
  const wrapRef = useRef<HTMLDivElement>(null);
  const prevTheme = useRef<string | null>(null);
  const restoreTheme = useCallback(() => {
    if (prevTheme.current === null) return;
    document.documentElement.dataset.theme = prevTheme.current;
    prevTheme.current = null;
  }, []);
  const exitTv = useCallback(() => {
    setTv(false);
    restoreTheme();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  }, [restoreTheme]);
  const enterTv = () => {
    if (selected) closeMachine();
    prevTheme.current = document.documentElement.dataset.theme ?? "light";
    document.documentElement.dataset.theme = "dark";
    setTv(true);
    wrapRef.current?.requestFullscreen?.().catch(() => undefined);
  };
  useEffect(() => {
    if (!tv) return;
    const onFullscreen = () => {
      if (!document.fullscreenElement) {
        setTv(false);
        restoreTheme();
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && exitTv();
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("keydown", onKey);
    };
  }, [tv, exitTv, restoreTheme]);
  useEffect(() => () => restoreTheme(), [restoreTheme]);

  // ── derived ──
  const plants = useMemo(() => plantsAll.filter((p) => plantFilter === "all" || p.id === plantFilter), [plantsAll, plantFilter]);
  const counts = useMemo(() => {
    const c: Record<MachineStatus, number> = { running: 0, setup: 0, idle: 0, maintenance: 0, down: 0 };
    for (const m of machines) c[m.status]++;
    return c;
  }, [machines]);
  const filtered = useMemo(() => (filter === "all" ? machines : machines.filter((m) => m.status === filter)), [machines, filter]);

  const nextOps = useMemo(() => {
    const out = new Map<string, { woId: string; start: string }>();
    for (const wo of workOrdersAll)
      for (const op of wo.operations) {
        if (op.status !== "pending" && op.status !== "ready") continue;
        const cur = out.get(op.machineId);
        if (!cur || op.plannedStart < cur.start) out.set(op.machineId, { woId: wo.id, start: op.plannedStart });
      }
    return out;
  }, [workOrdersAll]);
  const moTitles = useMemo(() => {
    const out = new Map<string, string>();
    for (const mo of maintenance) if (mo.status === "in_progress" && mo.type !== "corrective" && !out.has(mo.machineId)) out.set(mo.machineId, tx(mo.title, mo.titleTr));
    return out;
  }, [maintenance, tx]);

  const sections = useMemo(
    () =>
      plants
        .map((plant) => {
          const all = machines.filter((m) => m.plantId === plant.id);
          return {
            plant,
            producing: all.filter((m) => m.status === "running" || m.status === "setup").length,
            down: all.filter((m) => m.status === "down").length,
            total: all.length,
            output: all.reduce((s, m) => s + m.outputToday, 0),
            target: all.reduce((s, m) => s + m.targetToday, 0),
            lines: plant.lines.map((line) => ({ line, machines: filtered.filter((m) => m.plantId === plant.id && m.line === line) })).filter((l) => l.machines.length > 0),
          };
        })
        .filter((s) => s.lines.length > 0),
    [plants, machines, filtered],
  );

  const tileProps = (m: Machine) => {
    const wo = m.currentWoId ? lk.workOrder.get(m.currentWoId) : undefined;
    const op = wo?.operations.find((o) => o.id === m.currentOpId);
    const next = nextOps.get(m.id);
    return {
      machine: m,
      wo,
      op,
      sku: wo ? lk.product.get(wo.productId)?.sku : undefined,
      nextWoId: next?.woId,
      nextStart: next?.start,
      moTitle: moTitles.get(m.id),
      now,
      dayFrac,
    };
  };

  const plantName = plantFilter === "all" ? t("tv.allPlants") : tx(plants[0]?.name ?? "", plants[0]?.nameTr);

  return (
    <PageContainer wide>
      <div ref={wrapRef} className={cn(tv && "fixed inset-0 z-[55] overflow-y-auto bg-bg p-5 md:p-8 scroll-thin")}>
        {tv ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Image src="/brand/logo.png" alt="Hobiex" width={150} height={30} className="h-7 w-auto brightness-0 invert" />
              <div>
                <div className="font-display text-2xl font-semibold tracking-tight text-ink">{t("tv.title")}</div>
                <div className="text-sm text-ink-3">{plantName}</div>
              </div>
            </div>
            <Button icon={<Minimize2 className="size-4" />} onClick={exitTv}>
              {t("tvExit")}
            </Button>
          </div>
        ) : (
          <PageHeader
            title={t("title")}
            subtitle={t("subtitle", { n: machines.length })}
            actions={
              <>
                <Segmented
                  value={view}
                  onChange={setView}
                  options={[
                    {
                      value: "tiles",
                      label: (
                        <>
                          <LayoutGrid className="size-3.5" />
                          {t("view.tiles")}
                        </>
                      ),
                    },
                    {
                      value: "table",
                      label: (
                        <>
                          <Table2 className="size-3.5" />
                          {t("view.table")}
                        </>
                      ),
                    },
                  ]}
                />
                <Button variant="primary" icon={<Tv className="size-4" />} onClick={enterTv}>
                  {t("tv")}
                </Button>
              </>
            }
          />
        )}

        <Summary machines={machines} counts={counts} now={now} initialClock={clock.now} tv={tv} />

        {!tv && <StatusFilter value={filter} onChange={setFilter} counts={counts} total={machines.length} />}

        {view === "table" && !tv ? (
          <MachineTable machines={filtered} now={now} onOpen={openMachine} />
        ) : sections.length === 0 ? (
          <Card className="mt-5">
            <EmptyState icon={<Factory className="size-5" />} title={t("empty")} hint={t("emptyHint")} />
          </Card>
        ) : (
          <div className="mt-6 flex flex-col gap-8">
            {sections.map((s) => (
              <section key={s.plant.id}>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="size-2.5 rounded-sm" style={{ background: PLANT_COLOR[s.plant.id] }} aria-hidden />
                      <span className="text-xs font-semibold text-ink-3">{s.plant.code}</span>
                    </div>
                    <h2 className={cn("mt-0.5 font-semibold text-ink", tv ? "text-xl" : "text-base")}>{tx(s.plant.name, s.plant.nameTr)}</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-2">
                    <span className="flex items-center gap-1.5">
                      <PlayCircle className="size-3.5 text-good" aria-hidden />
                      {t("plant.running", { n: s.producing, total: s.total })}
                    </span>
                    {s.down > 0 && (
                      <span className="flex items-center gap-1.5 font-medium text-critical-ink">
                        <AlertOctagon className="size-3.5" aria-hidden />
                        {t("kpi.down", { n: s.down })}
                      </span>
                    )}
                    <span className="flex items-center gap-2">
                      <span className="text-ink-3">{t("tile.output")}</span>
                      <span className="font-medium text-ink tabular">{t("plant.output", { done: fmt.num(s.output), target: fmt.num(s.target) })}</span>
                      <Progress className="w-20" value={s.target ? s.output / s.target : 0} size="sm" tone={paceTone(s.output, s.target, dayFrac)} />
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  {s.lines.map(({ line, machines: ms }) => (
                    <div key={line}>
                      <div className="mb-2 flex items-center gap-3 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
                        <span>{line.replace("Line", t("common.line"))}</span>
                        <span className="font-normal tracking-normal normal-case">{t("line.machines", { n: ms.length })}</span>
                        <span className="h-px flex-1 bg-line" aria-hidden />
                      </div>
                      <div className={cn("grid gap-3", tv ? "grid-cols-[repeat(auto-fill,minmax(270px,1fr))]" : "grid-cols-[repeat(auto-fill,minmax(232px,1fr))]")}>
                        {ms.map((m) => (
                          <MachineTile key={m.id} {...tileProps(m)} tv={tv} onOpen={tv ? undefined : openMachine} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {tv && <TvAlerts machines={machines} now={now} />}
      </div>

      {!tv && <MachineDrawer machineId={selected} now={now} onClose={closeMachine} />}
    </PageContainer>
  );
}

function LiveClock({ initial, className }: { initial: number; className?: string }) {
  const [ms, setMs] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => setMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className={className} suppressHydrationWarning>
      {factoryClock(ms)}
    </span>
  );
}

function Summary({ machines, counts, now, initialClock, tv }: { machines: Machine[]; counts: Record<MachineStatus, number>; now: number; initialClock: number; tv: boolean }) {
  const t = useT(messages);
  const fmt = useFmt();
  const { shift, left, elapsed, dayFrac } = shiftInfo(now);
  const units = machines.reduce((s, m) => s + m.outputToday, 0);
  const target = machines.reduce((s, m) => s + m.targetToday, 0);
  const n = Math.max(1, machines.length);
  const avg = (f: (m: Machine) => number) => machines.reduce((s, m) => s + f(m), 0) / n;
  const oee = avg((m) => m.oee);
  const producing = counts.running + counts.setup;
  const big = tv ? "text-[44px]" : "text-[32px]";
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="flex flex-col justify-between gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-ink-2">{t("kpi.clock")}</span>
          <Badge tone="good" icon={<span className="pulse-dot size-1.5 rounded-full bg-good" />}>
            {t("live")}
          </Badge>
        </div>
        <div>
          <LiveClock initial={initialClock} className={cn("font-display leading-none font-semibold tracking-tight text-ink tabular", big)} />
          <div className="mt-1.5 text-xs text-ink-3">{fmt.weekday(now)}</div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-ink">{t("kpi.shift", { s: shift, hours: SHIFT_HOURS[shift] })}</span>
            <span className="text-ink-3">{t("kpi.shiftLeft", { d: fmt.duration(left) })}</span>
          </div>
          <Progress value={elapsed / 480} size="sm" />
        </div>
      </Card>

      <Card className="flex flex-col justify-between gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-ink-2">{t("kpi.units")}</span>
          <Activity className="size-4 text-ink-3" />
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span key={units} className={cn("animate-fade-in font-display leading-none font-semibold tracking-tight text-ink tabular", big)}>
            {fmt.num(units)}
          </span>
          <span className="text-sm text-ink-3">{t("kpi.ofTarget", { n: fmt.num(target) })}</span>
        </div>
        <div>
          <Progress value={target ? units / target : 0} tone={paceTone(units, target, dayFrac)} />
          <div className="mt-1.5 flex justify-between gap-2 text-xs text-ink-3">
            <span className="truncate">{t("kpi.unitsSub")}</span>
            <span className="font-medium whitespace-nowrap text-ink-2 tabular">{t("kpi.pace", { pct: fmt.pct(target ? units / (target * dayFrac) : 0) })}</span>
          </div>
        </div>
      </Card>

      <Card className="flex items-center gap-4 p-4">
        <RingGauge value={oee} size={tv ? 104 : 84} stroke={tv ? 10 : 8} label={t("common.oee")} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-ink-2">{t("kpi.oee")}</div>
          <dl className="mt-2 flex flex-col gap-1.5 text-xs">
            {(
              [
                ["common.availability", avg((m) => m.availability)],
                ["common.performance", avg((m) => m.performance)],
                ["common.quality", avg((m) => m.quality)],
              ] as const
            ).map(([key, v]) => (
              <div key={key} className="flex items-center gap-2">
                <dt className="w-[92px] shrink-0 truncate text-ink-3">{t(key)}</dt>
                <dd className="flex min-w-0 flex-1 items-center gap-2">
                  <Progress value={v} size="sm" />
                  <span className="w-9 shrink-0 text-right text-ink tabular">{fmt.pct(v)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>

      <Card className="flex flex-col justify-between gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-ink-2">{t("kpi.machines")}</span>
          <Factory className="size-4 text-ink-3" />
        </div>
        <div className={cn("font-display leading-none font-semibold tracking-tight text-ink tabular", big)}>
          {producing}
          <span className="text-ink-3">/{machines.length}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {counts.down > 0 ? (
            <Badge tone="critical" icon={<AlertOctagon className="size-3.5" />}>
              {t("kpi.down", { n: counts.down })}
            </Badge>
          ) : (
            <Badge tone="good" icon={<CheckCircle2 className="size-3.5" />}>
              {t("kpi.noneDown")}
            </Badge>
          )}
          {counts.maintenance > 0 && (
            <Badge tone="warn" icon={<Wrench className="size-3.5" />}>
              {t("kpi.maint", { n: counts.maintenance })}
            </Badge>
          )}
        </div>
      </Card>
    </div>
  );
}

function StatusFilter({ value, onChange, counts, total }: { value: Filter; onChange: (f: Filter) => void; counts: Record<MachineStatus, number>; total: number }) {
  const t = useT(messages);
  const label = useLabel();
  return (
    <div role="group" aria-label={t("filter.label")} className="mt-5 flex flex-wrap items-center gap-2">
      <Chip active={value === "all"} onClick={() => onChange("all")} count={total}>
        <Factory className="size-4 text-ink-3" aria-hidden />
        {t("filter.all")}
      </Chip>
      {STATUS_ORDER.map((s) => {
        const [tone, Icon] = STATUS_STYLES.machineStatus![s];
        return (
          <Chip key={s} active={value === s} onClick={() => onChange(value === s ? "all" : s)} count={counts[s]} alert={s === "down" && counts[s] > 0}>
            <Icon className={cn("size-4", toneIcon[tone])} aria-hidden />
            {label("machineStatus", s)}
          </Chip>
        );
      })}
    </div>
  );
}

function Chip({ active, onClick, count, alert, children }: { active: boolean; onClick: () => void; count: number; alert?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        active ? "border-brand bg-brand-soft text-brand-soft-ink" : "border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      {children}
      <span className={cn("rounded-md px-1.5 text-xs leading-5 font-semibold tabular", alert ? "bg-critical text-white" : active ? "bg-surface text-ink" : "bg-surface-3 text-ink")}>{count}</span>
    </button>
  );
}

function MachineTable({ machines, now, onOpen }: { machines: Machine[]; now: number; onOpen: (id: string) => void }) {
  const t = useT(messages);
  const fmt = useFmt();
  const tx = useTx();
  const lk = useLookups();
  const columns = useMemo<Column<Machine>[]>(
    () => [
      {
        key: "machine",
        header: t("table.machine"),
        sortValue: (m) => m.id,
        cell: (m) => (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium text-ink tabular">
              {m.status === "down" && <span className="pulse-dot size-2 rounded-full bg-critical" aria-hidden />}
              {m.id}
            </div>
            <div className="max-w-48 truncate text-xs text-ink-3">{m.name}</div>
          </div>
        ),
      },
      {
        key: "location",
        header: t("table.location"),
        hideBelow: "md",
        sortValue: (m) => `${m.plantId}${m.line}`,
        cell: (m) => (
          <span className="text-ink-2 whitespace-nowrap">
            {lk.plant.get(m.plantId)?.code} · {m.line.replace("Line", t("common.line"))}
          </span>
        ),
      },
      { key: "status", header: t("common.status"), sortValue: (m) => STATUS_RANK[m.status], cell: (m) => <StatusBadge kind="machineStatus" value={m.status} /> },
      {
        key: "since",
        header: t("table.since"),
        hideBelow: "sm",
        sortValue: (m) => -Date.parse(m.statusSince),
        cell: (m) => <span className="text-ink-2 tabular whitespace-nowrap">{fmt.duration(Math.max(0, (now - Date.parse(m.statusSince)) / MIN))}</span>,
      },
      {
        key: "job",
        header: t("table.job"),
        hideBelow: "lg",
        cell: (m) => {
          if (m.status === "down") return <span className="line-clamp-1 max-w-64 text-xs text-critical-ink">{m.downReason ? tx(m.downReason, m.downReasonTr) : "—"}</span>;
          const wo = m.currentWoId ? lk.workOrder.get(m.currentWoId) : undefined;
          const op = wo?.operations.find((o) => o.id === m.currentOpId);
          if (!wo || !op) return <span className="text-ink-3">—</span>;
          return (
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <IdLink href={`/work-orders/${wo.id}`}>{wo.id}</IdLink>
                <span className="truncate text-xs text-ink-2">{lk.product.get(wo.productId)?.sku}</span>
              </div>
              <div className="mt-1 flex w-40 items-center gap-2">
                <Progress value={op.qtyDone / Math.max(1, wo.qty)} size="sm" tone={m.status === "setup" ? "brand" : "good"} />
                <span className="text-[11px] text-ink-3 tabular">
                  {op.qtyDone}/{wo.qty}
                </span>
              </div>
            </div>
          );
        },
      },
      { key: "operator", header: t("common.operator"), hideBelow: "xl", cell: (m) => <PersonChip id={m.operatorId} size={20} /> },
      {
        key: "output",
        header: t("table.output"),
        align: "right",
        sortValue: (m) => (m.targetToday ? m.outputToday / m.targetToday : 0),
        cell: (m) => (
          <div className="ml-auto flex w-28 flex-col items-end gap-1">
            <span className="text-ink tabular">
              {fmt.num(m.outputToday)} <span className="text-ink-3">/ {fmt.num(m.targetToday)}</span>
            </span>
            <Progress value={m.targetToday ? m.outputToday / m.targetToday : 0} size="sm" tone="brand" />
          </div>
        ),
      },
      {
        key: "oee",
        header: t("common.oee"),
        align: "right",
        sortValue: (m) => m.oee,
        cell: (m) => <span className={cn("font-medium tabular", m.oee >= 0.75 ? "text-good-ink" : m.oee >= 0.6 ? "text-warn-ink" : "text-critical-ink")}>{fmt.pct(m.oee, 1)}</span>,
      },
    ],
    [t, fmt, tx, lk, now],
  );
  return (
    <Card className="mt-5">
      <DataTable
        rows={machines}
        columns={columns}
        rowKey={(m) => m.id}
        onRowClick={(m) => onOpen(m.id)}
        pageSize={100}
        rowClassName={(m) => (m.status === "down" ? "bg-critical-soft/60" : undefined)}
        empty={<EmptyState icon={<Factory className="size-5" />} title={t("empty")} hint={t("emptyHint")} />}
      />
    </Card>
  );
}

function TvAlerts({ machines, now }: { machines: Machine[]; now: number }) {
  const t = useT(messages);
  const fmt = useFmt();
  const label = useLabel();
  const tx = useTx();
  const stopped = machines.filter((m) => m.status === "down" || m.status === "maintenance").sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
  if (!stopped.length)
    return (
      <div className="sticky bottom-0 mt-8 flex items-center gap-3 rounded-xl border border-good/40 bg-good-soft px-5 py-3 text-good-ink">
        <CheckCircle2 className="size-5" />
        <span className="text-base font-semibold">{t("tv.allClear")}</span>
      </div>
    );
  return (
    <div className="sticky bottom-0 mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-critical/40 bg-critical-soft px-5 py-3">
      <span className="flex items-center gap-2 text-base font-semibold text-critical-ink">
        <span className="pulse-dot size-2.5 rounded-full bg-critical" aria-hidden />
        {t("tv.attention")}
      </span>
      {stopped.map((m) => (
        <span key={m.id} className="flex items-center gap-2 text-sm text-ink">
          {m.status === "down" ? <AlertOctagon className="size-4 text-critical" /> : <Wrench className="size-4 text-warn" />}
          <span className="font-semibold tabular">{m.id}</span>
          <span className="text-ink-2">{m.status === "down" && m.downReason ? tx(m.downReason, m.downReasonTr) : label("machineStatus", m.status)}</span>
          <span className="text-ink-3 tabular">· {fmt.duration(Math.max(0, (now - Date.parse(m.statusSince)) / MIN))}</span>
        </span>
      ))}
    </div>
  );
}
