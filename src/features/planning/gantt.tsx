"use client";

/**
 * Custom finite-capacity Gantt: absolutely positioned bars inside a single
 * scroll container with a sticky time header and a sticky machine column.
 * Position = (ms − windowStart) × px/ms, all in factory time (UTC+3).
 *
 * Hover state lives in <GanttChart>, the heavy grid is memoised, and bar
 * dragging moves the DOM node directly (no React state per pointer move).
 */
import { memo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { ChevronRight, LayoutList } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { cn } from "@/lib/cn";
import { DAY, HOUR, localDateOf, MIN } from "@/lib/data/clock";
import type { Machine, MachineStatus, OperationStatus, Plant, WorkCenterType } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { PLANT_COLOR } from "@/components/charts/theme";
import { EmptyState, PriorityBadge, StatusBadge } from "@/components/ui";
import { messages } from "./messages";
import { type Bar, isMovable, loadTone } from "./schedule";
import { StatusMini, toneFill, toneSoft, toneText } from "./bits";

export const ROW_H = 36;
const TYPE_H = 26;
const PLANT_H = 34;
const HEADER_H = 46;
const TICK_STEPS = [1, 2, 3, 6, 12, 24];

export interface GanttGroup {
  plant: Plant;
  types: { type: WorkCenterType; machines: Machine[] }[];
}
export interface DowntimeBlock {
  start: number;
  end: number;
  status: MachineStatus;
}
export interface HoverInfo {
  bar: Bar;
  left: number;
  top: number;
  above: boolean;
}

const BAR_STYLE: Record<OperationStatus, string> = {
  done: "border border-line bg-surface-3 text-ink-3",
  running: "bg-good text-white",
  paused: "border border-warn bg-warn-soft text-warn-ink",
  ready: "bg-brand text-brand-ink",
  pending: "border border-brand/35 border-l-[3px] border-l-brand bg-brand-soft text-brand-soft-ink",
};

interface GridProps {
  groups: GanttGroup[];
  bars: Map<string, Bar[]>;
  windowStart: number;
  days: number;
  pxPerHour: number;
  now: number;
  today: string;
  /** booked share of the zoom horizon, 0..1+ */
  horizonLoad: Map<string, number>;
  horizonLabel: string;
  /** booked minutes per machine per window day */
  dayLoad: Map<string, number[]>;
  downtime: Map<string, DowntimeBlock>;
  /** matching work-order ids while searching, otherwise null */
  matches: Set<string> | null;
  selectedKey: string | null;
  flashKey: string | null;
  highlightMachine: string | null;
  collapsed: Set<string>;
  onToggle: (key: string) => void;
  onSelect: (bar: Bar) => void;
  onReschedule: (bar: Bar, minutes: number) => void;
  cornerRef: RefObject<HTMLDivElement | null>;
}

export function GanttChart({
  scrollerRef,
  onScroll,
  ...grid
}: GridProps & { scrollerRef: RefObject<HTMLDivElement | null>; onScroll: () => void }) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  return (
    <>
      <div
        ref={scrollerRef}
        onScroll={() => {
          onScroll();
          setHover(null);
        }}
        className="relative overflow-auto overscroll-x-contain scroll-thin"
        style={{ maxHeight: "max(440px, calc(100dvh - 300px))" }}
      >
        <GanttGrid {...grid} onHover={setHover} />
      </div>
      {hover && <BarTooltip info={hover} today={grid.today} />}
    </>
  );
}

interface DragState {
  pointerId: number;
  el: HTMLElement;
  bar: Bar;
  x0: number;
  moved: boolean;
  snap: number;
}

const GanttGrid = memo(function GanttGrid({
  groups,
  bars,
  windowStart,
  days,
  pxPerHour,
  now,
  today,
  horizonLoad,
  horizonLabel,
  dayLoad,
  downtime,
  matches,
  selectedKey,
  flashKey,
  highlightMachine,
  collapsed,
  onToggle,
  onSelect,
  onReschedule,
  onHover,
  cornerRef,
}: GridProps & { onHover: (h: HoverInfo | null) => void }) {
  const t = useT(messages);
  const fmt = useFmt();
  const label = useLabel();
  const tx = useTx();
  const lk = useLookups();
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const indicator = useRef<HTMLDivElement>(null);

  const pxPerMs = pxPerHour / HOUR;
  const pxPerDay = pxPerHour * 24;
  const windowEnd = windowStart + days * DAY;
  const timelineW = Math.round(days * pxPerDay);
  const xOf = (ms: number) => (ms - windowStart) * pxPerMs;
  const step = TICK_STEPS.find((s) => s * pxPerHour >= 34) ?? 24;
  const tickFull = step * pxPerHour >= 44;
  const ticks = Array.from({ length: (days * 24) / step }, (_, i) => i * step);
  const dayIdx = Array.from({ length: days }, (_, i) => i);
  const nights: [number, number][] = [];
  for (let d = -1; d < days; d++) {
    const s = Math.max(0, d * 24 + 22);
    const e = Math.min(days * 24, d * 24 + 30);
    if (e > s) nights.push([s, e]);
  }
  const nowX = xOf(now);
  const nowVisible = now >= windowStart && now <= windowEnd;

  // ── pointer drag (mouse only; touch keeps native panning) ──
  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>, bar: Bar) => {
    if (e.button !== 0 || e.pointerType !== "mouse" || !isMovable(bar.op)) return;
    drag.current = { pointerId: e.pointerId, el: e.currentTarget, bar, x0: e.clientX, moved: false, snap: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < 4) return;
    if (!d.moved) {
      d.moved = true;
      onHover(null);
    }
    const pxPerMin = pxPerHour / 60;
    d.snap = Math.round(dx / pxPerMin / 15) * 15;
    d.el.style.transform = `translateX(${d.snap * pxPerMin}px)`;
    d.el.dataset.dragging = "true";
    const ind = indicator.current;
    if (ind) {
      const sign = d.snap > 0 ? "+" : d.snap < 0 ? "−" : "±";
      ind.textContent = `${sign}${fmt.duration(Math.abs(d.snap))} → ${fmt.dateTime(d.bar.start + d.snap * MIN)}`;
      ind.style.left = `${e.clientX + 14}px`;
      ind.style.top = `${e.clientY - 34}px`;
      ind.style.display = "block";
    }
  };
  const endDrag = (e: ReactPointerEvent<HTMLButtonElement>, commit: boolean) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    d.el.style.transform = "";
    delete d.el.dataset.dragging;
    if (indicator.current) indicator.current.style.display = "none";
    if (d.moved) {
      suppressClick.current = true;
      if (commit && d.snap !== 0) onReschedule(d.bar, d.snap);
    }
  };
  const onBarClick = (bar: Bar) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onHover(null);
    onSelect(bar);
  };
  const onBarEnter = (e: ReactMouseEvent<HTMLButtonElement>, bar: Bar) => {
    if (drag.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const W = 300;
    const H = 250;
    const left = Math.min(Math.max(8, e.clientX - W / 2), window.innerWidth - W - 8);
    const above = r.bottom + H + 8 > window.innerHeight;
    onHover({ bar, left, top: above ? r.top - 8 : r.bottom + 8, above });
  };

  const renderBar = (bar: Bar) => {
    const { wo, op } = bar;
    const left = xOf(Math.max(bar.start, windowStart));
    const width = Math.max(3, xOf(Math.min(bar.end, windowEnd)) - left);
    const match = matches?.has(wo.id) ?? false;
    const dim = matches !== null && !match;
    const selected = selectedKey === bar.key;
    const flash = flashKey === bar.key;
    const movable = isMovable(op);
    const sku = lk.product.get(wo.productId)?.sku ?? "";
    const text = width >= 150 ? `${wo.id} · ${sku}` : width >= 84 ? wo.id : width >= 46 ? wo.id.slice(3) : "";
    const progress = op.status === "running" && wo.qty ? Math.min(1, op.qtyDone / wo.qty) : 0;
    return (
      <button
        key={bar.key}
        type="button"
        data-bar={bar.key}
        data-wo={wo.id}
        aria-label={`${wo.id} · ${sku} · ${label("op", op.operation)} · ${label("opStatus", op.status)}`}
        className={cn(
          "absolute top-1.5 flex h-6 items-center overflow-hidden rounded-[5px] text-left text-[11px] leading-none font-medium whitespace-nowrap transition-[opacity,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand",
          BAR_STYLE[op.status],
          bar.late && "ring-[1.5px] ring-critical",
          movable && "cursor-grab active:cursor-grabbing",
          dim && "opacity-20",
          match && "z-[2] shadow-md ring-2 ring-ink",
          flash && "z-[3] animate-pulse ring-2 ring-brand ring-offset-1 ring-offset-surface",
          selected && "z-[3] ring-2 ring-ink ring-offset-1 ring-offset-surface",
          "data-[dragging=true]:z-[4] data-[dragging=true]:opacity-90 data-[dragging=true]:shadow-lg",
        )}
        style={{ left, width }}
        onPointerDown={(e) => onPointerDown(e, bar)}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, true)}
        onPointerCancel={(e) => endDrag(e, false)}
        onClick={() => onBarClick(bar)}
        onMouseEnter={(e) => onBarEnter(e, bar)}
        onMouseLeave={() => onHover(null)}
      >
        {progress > 0 && <span className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${progress * 100}%` }} aria-hidden />}
        {text && <span className="relative truncate px-1.5 tabular">{text}</span>}
      </button>
    );
  };

  const renderMachine = (m: Machine) => {
    const load = horizonLoad.get(m.id) ?? 0;
    const tone = loadTone(load);
    const highlighted = highlightMachine === m.id;
    const dt = downtime.get(m.id);
    const dtLeft = dt ? xOf(Math.max(dt.start, windowStart)) : 0;
    const dtWidth = dt ? Math.max(0, xOf(Math.min(dt.end, windowEnd)) - dtLeft) : 0;
    return (
      <div key={m.id} data-machine-row={m.id} className={cn("flex border-b border-line/70", highlighted && "bg-brand-soft/70")} style={{ height: ROW_H }}>
        <div
          className={cn(
            "sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line bg-surface pr-3 pl-3",
            highlighted && "bg-brand-soft shadow-[inset_3px_0_0_var(--brand)]",
          )}
          style={{ width: "var(--gl)" }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="text-[13px] font-semibold text-ink tabular">{m.id}</span>
              <StatusMini status={m.status} compactOnMobile />
            </div>
            <div className="truncate text-[11px] leading-tight text-ink-3" title={`${m.name} · ${m.model}`}>
              {m.model}
            </div>
          </div>
          <div className="w-10 shrink-0 text-right" title={t("gantt.loadTitle", { h: horizonLabel })}>
            <div className={cn("text-[11px] leading-tight font-semibold tabular", toneText[tone])}>{fmt.pct(load)}</div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3">
              <div className={cn("h-full rounded-full", toneFill[tone])} style={{ width: `${Math.min(1, load) * 100}%` }} />
            </div>
          </div>
        </div>
        <div className="relative shrink-0" style={{ width: timelineW }}>
          {dt && dtWidth > 0 && (
            <div
              className="hatch absolute inset-y-1 flex items-center overflow-hidden rounded-md border border-critical/40"
              style={{ left: dtLeft, width: dtWidth }}
              title={t("gantt.downUntil", { status: label("machineStatus", dt.status), t: fmt.dateTime(dt.end) })}
            >
              <span className="truncate px-1.5 text-[10px] font-semibold text-critical-ink">
                {t("gantt.downUntil", { status: label("machineStatus", dt.status), t: fmt.time(dt.end) })}
              </span>
            </div>
          )}
          {(bars.get(m.id) ?? []).map(renderBar)}
        </div>
      </div>
    );
  };

  return (
    <div className="relative isolate [--gl:156px] sm:[--gl:228px]" style={{ width: `calc(var(--gl) + ${timelineW}px)` }}>
      {/* ── time header ── */}
      <div className="sticky top-0 z-20 flex border-b border-line bg-surface" style={{ height: HEADER_H }}>
        <div
          ref={cornerRef}
          className="sticky left-0 z-30 flex shrink-0 items-end justify-between gap-2 border-r border-line bg-surface px-3 pb-1.5 text-[11px] font-medium text-ink-3"
          style={{ width: "var(--gl)" }}
        >
          <span>{t("gantt.machine")}</span>
          <span title={t("gantt.loadTitle", { h: horizonLabel })}>{t("gantt.load", { h: horizonLabel })}</span>
        </div>
        <div className="relative shrink-0" style={{ width: timelineW }}>
          {dayIdx.map((d) => {
            const ms = windowStart + d * DAY;
            const isToday = localDateOf(ms + 12 * HOUR) === today;
            return (
              <div key={d} className="absolute top-0 h-6 border-l border-line" style={{ left: d * pxPerDay, width: pxPerDay }}>
                <span
                  className={cn("sticky inline-flex h-6 items-center gap-1.5 px-2 text-xs font-semibold whitespace-nowrap", isToday ? "text-brand" : "text-ink")}
                  style={{ left: "var(--gl)" }}
                >
                  {fmt.weekday(ms + 12 * HOUR)}
                  {isToday && <span className="rounded bg-brand-soft px-1 text-[10px] text-brand-soft-ink">{t("gantt.today")}</span>}
                </span>
              </div>
            );
          })}
          {ticks.map((h) => (
            <div
              key={h}
              className={cn("absolute bottom-0 h-[22px] border-l pl-1 text-[10px] leading-[22px] text-ink-3 tabular", h % 24 === 0 ? "border-line" : "border-line/60")}
              style={{ left: h * pxPerHour }}
            >
              {String(h % 24).padStart(2, "0")}
              {tickFull ? ":00" : ""}
            </div>
          ))}
          {nowVisible && (
            <div className="absolute bottom-0.5 z-[1] -translate-x-1/2 rounded bg-critical px-1 text-[10px] leading-4 font-semibold text-white tabular" style={{ left: nowX }}>
              {fmt.time(now)}
            </div>
          )}
        </div>
      </div>

      {/* ── background: night shift bands, day lines, hour ticks ── */}
      <div className="pointer-events-none absolute bottom-0 -z-10" style={{ top: HEADER_H, left: "var(--gl)", width: timelineW }} aria-hidden>
        {nights.map(([s, e]) => (
          <div key={s} className="absolute inset-y-0 bg-surface-2" style={{ left: s * pxPerHour, width: (e - s) * pxPerHour }} />
        ))}
        {step <= 3 &&
          ticks.map((h) => (h % 24 === 0 ? null : <div key={h} className="absolute inset-y-0 w-px bg-line/40" style={{ left: h * pxPerHour }} />))}
        {dayIdx.map((d) => (
          <div key={d} className="absolute inset-y-0 w-px bg-line" style={{ left: d * pxPerDay }} />
        ))}
      </div>

      {/* ── rows ── */}
      {groups.length === 0 && (
        <div className="sticky left-0" style={{ width: "min(100%, 100vw)" }}>
          <EmptyState icon={<LayoutList className="size-5" />} title={t("gantt.empty")} />
        </div>
      )}
      {groups.map(({ plant, types }) => {
        const plantOpen = !collapsed.has(plant.id);
        const count = types.reduce((s, g) => s + g.machines.length, 0);
        return (
          <div key={plant.id}>
            <div className="flex border-b border-line bg-surface-3" style={{ height: PLANT_H }}>
              <button
                type="button"
                onClick={() => onToggle(plant.id)}
                aria-expanded={plantOpen}
                title={plantOpen ? t("gantt.collapse") : t("gantt.expand")}
                className="sticky left-0 z-10 flex items-center gap-2 bg-surface-3 px-3 text-left hover:text-brand"
              >
                <ChevronRight className={cn("size-4 shrink-0 text-ink-3 transition-transform", plantOpen && "rotate-90")} aria-hidden />
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: PLANT_COLOR[plant.id] }} aria-hidden />
                <span className="text-xs font-semibold whitespace-nowrap text-ink">
                  {plant.code} · {tx(plant.name, plant.nameTr)}
                </span>
                <span className="text-[11px] whitespace-nowrap text-ink-3">{t("gantt.machines", { n: count })}</span>
              </button>
            </div>
            {plantOpen &&
              types.map(({ type, machines }) => {
                const key = `${plant.id}:${type}`;
                const open = !collapsed.has(key);
                const cap = machines.length * 1440;
                return (
                  <div key={key}>
                    <div className="flex border-b border-line bg-surface-2" style={{ height: TYPE_H }}>
                      <button
                        type="button"
                        onClick={() => onToggle(key)}
                        aria-expanded={open}
                        title={open ? t("gantt.collapse") : t("gantt.expand")}
                        className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-line bg-surface-2 px-3 text-left text-[11px] font-semibold tracking-wide text-ink-2 uppercase hover:text-ink"
                        style={{ width: "var(--gl)" }}
                      >
                        <ChevronRight className={cn("size-3.5 shrink-0 text-ink-3 transition-transform", open && "rotate-90")} aria-hidden />
                        <span className="truncate">{label("wc", type)}</span>
                        <span className="ml-auto font-medium text-ink-3 tabular">{machines.length}</span>
                      </button>
                      <div className="relative shrink-0" style={{ width: timelineW }}>
                        {dayIdx.map((d) => {
                          const min = machines.reduce((s, m) => s + (dayLoad.get(m.id)?.[d] ?? 0), 0);
                          const x = min / cap;
                          if (x < 0.005) return null;
                          const dayMs = windowStart + d * DAY + 12 * HOUR;
                          return (
                            <span
                              key={d}
                              className={cn("absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded px-1.5 text-[10px] leading-4 font-semibold tabular", toneSoft[loadTone(x)])}
                              style={{ left: d * pxPerDay + pxPerDay / 2 }}
                              title={t("gantt.dayLoad", { wc: label("wc", type), day: fmt.weekday(dayMs), pct: fmt.pct(x) })}
                            >
                              {fmt.pct(x)}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    {open && machines.map(renderMachine)}
                  </div>
                );
              })}
          </div>
        );
      })}

      {/* ── now line ── */}
      {nowVisible && (
        <div
          className="pointer-events-none absolute bottom-0 z-[5] w-0.5 -translate-x-1/2 bg-critical"
          style={{ top: HEADER_H, left: `calc(var(--gl) + ${nowX}px)` }}
          aria-hidden
        />
      )}

      {/* drag readout, positioned imperatively */}
      <div
        ref={indicator}
        className="pointer-events-none fixed z-40 rounded-md bg-ink px-2 py-1 text-[11px] font-medium whitespace-nowrap text-surface shadow-lg tabular"
        style={{ display: "none" }}
        aria-live="polite"
      />
    </div>
  );
});

function BarTooltip({ info, today }: { info: HoverInfo; today: string }) {
  const t = useT(messages);
  const fmt = useFmt();
  const label = useLabel();
  const lk = useLookups();
  const { wo, op, late, start, end } = info.bar;
  const product = lk.product.get(wo.productId);
  const customer = wo.customerId ? lk.customer.get(wo.customerId) : undefined;
  const machine = lk.machine.get(op.machineId);
  const sameDay = localDateOf(start) === localDateOf(end);
  const overdue = today > wo.dueDate;
  return (
    <div
      className="animate-fade-in pointer-events-none fixed z-40 w-[300px] rounded-xl border border-line bg-surface p-3 text-xs shadow-xl"
      style={{ left: info.left, top: info.top, transform: info.above ? "translateY(-100%)" : undefined }}
      role="tooltip"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink tabular">{wo.id}</span>
        <PriorityBadge value={wo.priority} compact />
      </div>
      <div className="mt-0.5 truncate text-[13px] text-ink">
        <span className="font-medium">{product?.sku}</span> <span className="text-ink-2">· {product?.name}</span>
      </div>
      <div className="mt-0.5 truncate text-ink-3">
        {customer?.name ?? t("common.makeToStock")} · {fmt.num(wo.qty)} {t("common.pcs")}
      </div>
      <div className="my-2 h-px bg-line" />
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
        <dt className="text-ink-3">{t("common.status")}</dt>
        <dd>
          <StatusBadge kind="opStatus" value={op.status} />
        </dd>
        <dt className="text-ink-3">{t("tip.operation")}</dt>
        <dd className="truncate text-ink">
          {op.seq} · {label("op", op.operation)}
        </dd>
        <dt className="text-ink-3">{t("tip.machine")}</dt>
        <dd className="truncate text-ink">
          {machine?.id} · {machine?.name}
        </dd>
        <dt className="text-ink-3">{t("tip.planned")}</dt>
        <dd className="text-ink tabular">
          {fmt.dateTime(start)} – {sameDay ? fmt.time(end) : fmt.dateTime(end)}
        </dd>
        <dt className="text-ink-3">{t("tip.duration")}</dt>
        <dd className="text-ink tabular">{fmt.duration((end - start) / MIN)}</dd>
        <dt className="text-ink-3">{t("common.due")}</dt>
        <dd className={cn("tabular", late || overdue ? "font-medium text-critical-ink" : "text-ink")}>
          {late || overdue ? t("tip.lateBy", { date: fmt.date(wo.dueDate) }) : t("tip.dueOn", { date: fmt.date(wo.dueDate) })}
        </dd>
      </dl>
      {isMovable(op) && <div className="mt-2 border-t border-line pt-2 text-[11px] text-ink-3">{t("tip.drag")}</div>}
    </div>
  );
}
