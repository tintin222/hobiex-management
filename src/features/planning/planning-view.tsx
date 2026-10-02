"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Crosshair, EyeOff } from "lucide-react";
import { useFmt, useLabel, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { DAY, HOUR, MIN } from "@/lib/data/clock";
import type { Machine, WorkCenterType } from "@/lib/data/types";
import { isLate, useByPlant, useLookups, usePlantFilter, usePlantStore } from "@/lib/hooks";
import { actions, getDb, toast, useClock, useDb } from "@/lib/store";
import { PageContainer } from "@/components/layout/app-shell";
import { Button, Card, PageHeader, SearchInput, Segmented, Select } from "@/components/ui";
import { CapacityCard, LateCard, type CapacityDatum } from "./capacity";
import { GanttChart, ROW_H, type DowntimeBlock, type GanttGroup } from "./gantt";
import { messages } from "./messages";
import { OpDrawer, type OpSelection } from "./op-drawer";
import { analyzeLate, type Bar, bookedMinutes, collectBars, dailyMinutes, type LateRow } from "./schedule";

type Zoom = "day" | "3d" | "week";
const ZOOM_H: Record<Zoom, number> = { day: 24, "3d": 72, week: 168 };
const MIN_PX: Record<Zoom, number> = { day: 28, "3d": 10, week: 4.5 };
const FALLBACK_PX: Record<Zoom, number> = { day: 48, "3d": 16, week: 7 };
/** yesterday 00:00 → end of today + 6 */
const DAYS = 8;

/** Dataset "now" that keeps moving while the page is open. */
function useTickingNow(base: number) {
  const [tick, setTick] = useState(base);
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return Math.max(base, tick);
}

const toFraction = (minutes: Map<string, number>, capacityMin: number) => {
  const out = new Map<string, number>();
  for (const [k, v] of minutes) out.set(k, v / capacityMin);
  return out;
};

export function PlanningView() {
  const t = useT(messages);
  const fmt = useFmt();
  const label = useLabel();
  const clock = useClock();
  const lk = useLookups();
  const params = useSearchParams();
  const machineParam = params.get("machine");
  const plantFilter = usePlantFilter();
  const setPlant = usePlantStore((s) => s.setPlant);

  const plantsAll = useDb((db) => db.plants);
  const machinesAll = useDb((db) => db.machines);
  const workOrdersAll = useDb((db) => db.workOrders);
  const maintenance = useDb((db) => db.maintenance);
  const machinesInPlant = useByPlant(machinesAll);
  const workOrders = useByPlant(workOrdersAll);

  const [zoom, setZoom] = useState<Zoom>("3d");
  const [wc, setWc] = useState<WorkCenterType | "all">("all");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [sel, setSel] = useState<OpSelection | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [view, setView] = useState({ w: 0, left: 228 });
  const now = useTickingNow(clock.now);

  const windowStart = clock.dayStart - DAY;
  const windowEnd = windowStart + DAYS * DAY;
  const pxPerHour = view.w ? Math.max(MIN_PX[zoom], (view.w - view.left) / ZOOM_H[zoom]) : FALLBACK_PX[zoom];

  // ── scroll geometry (DOM only — no state on scroll) ──
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cornerRef = useRef<HTMLDivElement>(null);
  const anchor = useRef({ ms: clock.now, frac: 0.2 });
  const expectedLeft = useRef<number | null>(null);
  const matchCursor = useRef(-1);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const left = cornerRef.current?.offsetWidth ?? 228;
      setView((v) => (v.w === w && v.left === left ? v : { w, left }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  // keep the anchored instant (initially "now" at 20 %) in place across zoom / resize
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const vw = el.clientWidth - (cornerRef.current?.offsetWidth ?? 0);
    const target = Math.max(0, Math.round(((anchor.current.ms - windowStart) / HOUR) * pxPerHour - anchor.current.frac * vw));
    expectedLeft.current = target;
    el.scrollLeft = target;
  }, [pxPerHour, windowStart]);

  // ?machine=XYZ → bring the row into view
  useLayoutEffect(() => {
    if (!machineParam) return;
    const el = scrollerRef.current;
    const row = el?.querySelector<HTMLElement>(`[data-machine-row="${CSS.escape(machineParam)}"]`);
    if (!el || !row) return;
    el.scrollTop = Math.max(0, row.offsetTop - el.clientHeight / 2 + ROW_H / 2);
  }, [machineParam, plantFilter, wc]);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (expectedLeft.current !== null && Math.abs(el.scrollLeft - expectedLeft.current) <= 1) {
      expectedLeft.current = null;
      return;
    }
    expectedLeft.current = null;
    const vw = el.clientWidth - (cornerRef.current?.offsetWidth ?? 0);
    anchor.current = { ms: windowStart + ((el.scrollLeft + vw / 2) / pxPerHour) * HOUR, frac: 0.5 };
  }, [windowStart, pxPerHour]);

  const scrollTo = (ms: number, machineId?: string) => {
    const el = scrollerRef.current;
    if (!el) return;
    const vw = el.clientWidth - (cornerRef.current?.offsetWidth ?? 0);
    const row = machineId ? el.querySelector<HTMLElement>(`[data-machine-row="${CSS.escape(machineId)}"]`) : null;
    anchor.current = { ms, frac: 0.2 };
    el.scrollTo({
      left: Math.max(0, ((ms - windowStart) / HOUR) * pxPerHour - 0.2 * vw),
      top: row ? Math.max(0, row.offsetTop - el.clientHeight / 2 + ROW_H / 2) : el.scrollTop,
      behavior: "smooth",
    });
  };

  const flash = useCallback((key: string) => {
    setFlashKey(key);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashKey(null), 2600);
  }, []);

  // ── structure ──
  const groups = useMemo<GanttGroup[]>(() => {
    const plants = plantsAll.filter((p) => plantFilter === "all" || p.id === plantFilter);
    return plants
      .map((plant) => {
        const types: GanttGroup["types"] = [];
        for (const m of machinesAll) {
          if (m.plantId !== plant.id || (wc !== "all" && m.type !== wc)) continue;
          let g = types.find((x) => x.type === m.type);
          if (!g) {
            g = { type: m.type, machines: [] };
            types.push(g);
          }
          g.machines.push(m);
        }
        return { plant, types };
      })
      .filter((g) => g.types.length > 0);
  }, [plantsAll, machinesAll, plantFilter, wc]);
  const visibleMachines = useMemo(() => groups.flatMap((g) => g.types.flatMap((x) => x.machines)), [groups]);
  const typeOptions = useMemo(() => [...new Set(machinesInPlant.map((m) => m.type))], [machinesInPlant]);
  const siblings = useMemo(() => {
    const out = new Map<string, Machine[]>();
    for (const m of machinesAll) {
      const k = `${m.plantId}:${m.type}`;
      out.set(k, [...(out.get(k) ?? []), m]);
    }
    return out;
  }, [machinesAll]);

  // ── schedule data ──
  const lateIds = useMemo(() => new Set(workOrdersAll.filter((w) => w.status !== "completed" && isLate(w, clock.today)).map((w) => w.id)), [workOrdersAll, clock.today]);
  const bars = useMemo(() => collectBars(workOrdersAll, windowStart, windowEnd, lateIds), [workOrdersAll, windowStart, windowEnd, lateIds]);
  const horizonH = ZOOM_H[zoom];
  const horizonLoad = useMemo(() => toFraction(bookedMinutes(workOrdersAll, now, now + horizonH * HOUR), horizonH * 60), [workOrdersAll, now, horizonH]);
  const booked7 = useMemo(() => bookedMinutes(workOrdersAll, now, now + 7 * DAY), [workOrdersAll, now]);
  const load7 = useMemo(() => toFraction(booked7, 7 * 1440), [booked7]);
  const dayLoad = useMemo(() => dailyMinutes(workOrdersAll, windowStart, DAYS), [workOrdersAll, windowStart]);
  const downtime = useMemo(() => {
    const out = new Map<string, DowntimeBlock>();
    for (const m of machinesAll) {
      if (m.status !== "down" && m.status !== "maintenance") continue;
      const start = Date.parse(m.statusSince);
      const mo = maintenance.find(
        (x) => x.machineId === m.id && (x.status === "in_progress" || x.status === "waiting_parts") && (m.status === "down" ? x.type === "corrective" : x.type !== "corrective"),
      );
      const est = (mo?.estHours ?? m.mttrHours) * HOUR;
      out.set(m.id, { start, end: Math.max(start + est, now + 30 * MIN), status: m.status });
    }
    return out;
  }, [machinesAll, maintenance, now]);

  const opsInView = useMemo(() => visibleMachines.reduce((s, m) => s + (bars.get(m.id)?.length ?? 0), 0), [visibleMachines, bars]);

  // ── search highlight ──
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null;
    const out = new Set<string>();
    for (const wo of workOrdersAll) {
      const sku = lk.product.get(wo.productId)?.sku.toLowerCase() ?? "";
      const customer = wo.customerId ? (lk.customer.get(wo.customerId)?.name.toLowerCase() ?? "") : "";
      if (wo.id.toLowerCase().includes(q) || wo.lotNo.toLowerCase().includes(q) || sku.includes(q) || customer.includes(q)) out.add(wo.id);
    }
    return out;
  }, [query, workOrdersAll, lk]);
  const matchBars = useMemo(() => {
    if (!matches) return [];
    const list = visibleMachines.flatMap((m) => (bars.get(m.id) ?? []).filter((b) => matches.has(b.wo.id)));
    return list.sort((a, b) => a.start - b.start);
  }, [matches, visibleMachines, bars]);

  const jumpToMatch = () => {
    if (!matchBars.length) return;
    if (matchCursor.current < 0) {
      const firstUpcoming = matchBars.findIndex((b) => b.end >= now);
      matchCursor.current = firstUpcoming >= 0 ? firstUpcoming : 0;
    } else matchCursor.current = (matchCursor.current + 1) % matchBars.length;
    const target = matchBars[matchCursor.current];
    const m = lk.machine.get(target.op.machineId);
    if (m && (collapsed.has(m.plantId) || collapsed.has(`${m.plantId}:${m.type}`))) {
      setCollapsed((prev) => {
        const n = new Set(prev);
        n.delete(m.plantId);
        n.delete(`${m.plantId}:${m.type}`);
        return n;
      });
    }
    requestAnimationFrame(() => scrollTo(target.start, target.op.machineId));
    flash(target.key);
  };

  // ── mutations ──
  const shift = useCallback(
    (woId: string, opId: string, minutes: number) => {
      const op = getDb()
        .workOrders.find((w) => w.id === woId)
        ?.operations.find((o) => o.id === opId);
      actions.rescheduleOperation(woId, opId, minutes);
      toast({
        title: t("toast.shifted", { wo: woId }),
        description: t("toast.shiftedDesc", { seq: op?.seq ?? "", delta: `${minutes < 0 ? "−" : "+"}${fmt.duration(Math.abs(minutes))}` }),
        tone: "good",
      });
      flash(opId);
    },
    [t, fmt, flash],
  );

  const move = useCallback(
    (woId: string, opId: string, machineId: string) => {
      const op = getDb()
        .workOrders.find((w) => w.id === woId)
        ?.operations.find((o) => o.id === opId);
      actions.moveOperationToMachine(woId, opId, machineId);
      toast({
        title: t("toast.moved", { machine: machineId }),
        description: t("toast.movedDesc", { wo: woId, seq: op?.seq ?? "", op: op ? label("op", op.operation) : "" }),
        tone: "good",
      });
      flash(opId);
      requestAnimationFrame(() => {
        const el = scrollerRef.current;
        const row = el?.querySelector<HTMLElement>(`[data-machine-row="${CSS.escape(machineId)}"]`);
        if (!el || !row) return;
        const top = row.offsetTop - el.scrollTop;
        if (top < 60 || top > el.clientHeight - ROW_H) el.scrollTo({ top: row.offsetTop - el.clientHeight / 2, behavior: "smooth" });
      });
    },
    [t, label, flash],
  );

  const onSelectBar = useCallback((bar: Bar) => setSel({ woId: bar.wo.id, opId: bar.op.id }), []);
  const onRescheduleBar = useCallback((bar: Bar, minutes: number) => shift(bar.wo.id, bar.op.id, minutes), [shift]);
  const onToggle = useCallback(
    (key: string) =>
      setCollapsed((prev) => {
        const n = new Set(prev);
        if (n.has(key)) n.delete(key);
        else n.add(key);
        return n;
      }),
    [],
  );

  // ── capacity + late orders ──
  const capacity = useMemo<CapacityDatum[]>(() => {
    const by = new Map<WorkCenterType, { min: number; n: number }>();
    for (const m of machinesInPlant) {
      const e = by.get(m.type) ?? { min: 0, n: 0 };
      by.set(m.type, { min: e.min + (booked7.get(m.id) ?? 0), n: e.n + 1 });
    }
    return [...by.entries()]
      .map(([type, e]) => ({ type, name: label("wc", type), load: e.min / (e.n * 7 * 1440), hours: e.min / 60, machines: e.n }))
      .sort((a, b) => b.load - a.load);
  }, [machinesInPlant, booked7, label]);

  const lateRows = useMemo(
    () =>
      workOrders
        .filter((w) => lateIds.has(w.id))
        .map((w) => analyzeLate(w, now, clock.today, lk.machine, siblings, load7))
        .sort((a, b) => (a.wo.dueDate === b.wo.dueDate ? b.delayMin - a.delayMin : a.wo.dueDate < b.wo.dueDate ? -1 : 1)),
    [workOrders, lateIds, now, clock.today, lk, siblings, load7],
  );

  const applySuggestion = useCallback(
    (row: LateRow) => {
      const { wo, suggestion: s } = row;
      const planned = () => toast({ title: t("late.toast.applied", { wo: wo.id }), description: t("late.toast.appliedDesc", { end: fmt.dateTime(s.newEnd) }), tone: "good" });
      if (s.kind === "move" && s.moveOp && s.to && s.firstOp) {
        actions.moveOperationToMachine(wo.id, s.moveOp.id, s.to.id);
        actions.rescheduleOperation(wo.id, s.firstOp.id, -s.pullMin);
        flash(s.moveOp.id);
        planned();
      } else if ((s.kind === "expedite" || s.kind === "overtime") && s.firstOp) {
        if (s.kind === "expedite") actions.setWorkOrderPriority(wo.id, "urgent");
        actions.rescheduleOperation(wo.id, s.firstOp.id, -s.pullMin);
        flash(s.firstOp.id);
        planned();
      } else if (s.kind === "priority") {
        actions.setWorkOrderPriority(wo.id, "urgent");
        toast({ title: t("late.toast.priority", { wo: wo.id }), description: t("late.toast.priorityDesc"), tone: "good" });
      } else {
        const task = actions.createTask({
          title: messages.en["late.taskTitle"].replace("{wo}", wo.id),
          titleTr: messages.tr["late.taskTitle"].replace("{wo}", wo.id),
          type: "logistics",
          priority: "high",
          plantId: wo.plantId,
          workOrderId: wo.id,
          assigneeId: wo.plannerId,
          dueAt: new Date(now + DAY).toISOString(),
          tags: ["late-order"],
        });
        toast({ title: t("late.toast.task", { id: task.id }), description: t("late.toast.taskDesc", { wo: wo.id }), tone: "info" });
      }
    },
    [t, fmt, flash, now],
  );

  // ── deep link to a machine hidden by filters ──
  const paramMachine = machineParam ? lk.machine.get(machineParam) : undefined;
  const paramHidden = paramMachine && !visibleMachines.some((m) => m.id === paramMachine.id);

  return (
    <PageContainer wide>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", { ops: fmt.num(opsInView), machines: visibleMachines.length })}
        actions={
          <>
            <Segmented
              value={zoom}
              onChange={setZoom}
              options={[
                { value: "day", label: t("zoom.day") },
                { value: "3d", label: t("zoom.3d") },
                { value: "week", label: t("zoom.week") },
              ]}
            />
            <Button icon={<Crosshair className="size-4" />} onClick={() => scrollTo(now)}>
              {t("gantt.today")}
            </Button>
            <Select value={wc} onChange={(e) => setWc(e.target.value as WorkCenterType | "all")} className="w-auto min-w-44" aria-label={t("allCenters")}>
              <option value="all">{t("allCenters")}</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {label("wc", type)}
                </option>
              ))}
            </Select>
            <form
              role="search"
              className="w-full sm:w-64"
              onSubmit={(e) => {
                e.preventDefault();
                jumpToMatch();
              }}
            >
              <SearchInput
                value={query}
                onChange={(v) => {
                  matchCursor.current = -1;
                  setQuery(v);
                }}
                placeholder={t("searchPlaceholder")}
              />
            </form>
          </>
        }
      />

      {paramHidden && paramMachine && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand-soft px-4 py-2.5 text-[13px] text-brand-soft-ink">
          <span className="flex items-center gap-2">
            <EyeOff className="size-4 shrink-0" />
            {t("gantt.hiddenByFilter", { id: paramMachine.id, plant: lk.plant.get(paramMachine.plantId)?.code ?? paramMachine.plantId })}
          </span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setPlant("all");
              setWc("all");
            }}
          >
            {t("gantt.showAllPlants")}
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-ink">{t("gantt.title")}</h3>
            <p className="mt-0.5 text-[13px] text-ink-3">{t("gantt.subtitle", { from: fmt.date(windowStart + 12 * HOUR), to: fmt.date(windowEnd - 12 * HOUR) })}</p>
          </div>
          <GanttLegend />
        </div>
        <GanttChart
          scrollerRef={scrollerRef}
          cornerRef={cornerRef}
          onScroll={onScroll}
          groups={groups}
          bars={bars}
          windowStart={windowStart}
          days={DAYS}
          pxPerHour={pxPerHour}
          now={now}
          today={clock.today}
          horizonLoad={horizonLoad}
          horizonLabel={t(`horizon.${zoom}`)}
          dayLoad={dayLoad}
          downtime={downtime}
          matches={matches}
          selectedKey={sel?.opId ?? null}
          flashKey={flashKey}
          highlightMachine={machineParam}
          collapsed={collapsed}
          onToggle={onToggle}
          onSelect={onSelectBar}
          onReschedule={onRescheduleBar}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-2 text-xs text-ink-3">
          <span>{t("gantt.hint")}</span>
          {matches && (
            <span className={cn("font-medium", matchBars.length ? "text-brand" : "text-warn-ink")}>
              {matchBars.length ? t("matches", { n: matchBars.length }) : t("noMatches")}
            </span>
          )}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <CapacityCard data={capacity} className="xl:col-span-2" />
        <LateCard rows={lateRows} onApply={applySuggestion} className="xl:col-span-3" />
      </div>

      <OpDrawer sel={sel} onClose={() => setSel(null)} onSelect={setSel} onShift={shift} onMove={move} load7={load7} today={clock.today} />
    </PageContainer>
  );
}

function GanttLegend() {
  const t = useT(messages);
  const items: [string, string][] = [
    ["legend.running", "bg-good"],
    ["legend.ready", "bg-brand"],
    ["legend.pending", "border border-brand/35 border-l-[3px] border-l-brand bg-brand-soft"],
    ["legend.paused", "border border-warn bg-warn-soft"],
    ["legend.done", "border border-line bg-surface-3"],
    ["legend.late", "bg-surface ring-[1.5px] ring-critical"],
    ["legend.downtime", "hatch border border-critical/40"],
    ["legend.night", "border border-line bg-surface-2"],
  ];
  return (
    <div className="flex max-w-3xl flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-ink-2">
      {items.map(([key, cls]) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2.5 w-4 rounded-[3px]", cls)} aria-hidden />
          {t(key)}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-0.5 rounded bg-critical" aria-hidden />
        {t("gantt.now")}
      </span>
    </div>
  );
}
