"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { addDays } from "@/lib/data/clock";
import type { MaintenanceOrder, MaintenanceType } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { useClock } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Button, EmptyState, IconButton, StatusBadge } from "@/components/ui";
import { effStatus, MAINT_TYPES, TYPE_COLOR } from "./lib";
import { messages } from "./messages";

const pad = (n: number) => String(n).padStart(2, "0");

function Chip({ mo, today, onOpen }: { mo: MaintenanceOrder; today: string; onOpen: (id: string) => void }) {
  const tx = useTx();
  const st = effStatus(mo, today);
  const overdue = st === "overdue";
  const done = st === "completed";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(mo.id);
      }}
      title={`${mo.id} · ${tx(mo.title, mo.titleTr)}`}
      className={cn(
        "flex w-full min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] leading-tight transition-colors",
        overdue ? "bg-critical-soft text-critical-ink hover:opacity-85" : "bg-surface-3 text-ink-2 hover:bg-line",
        done && "text-ink-3",
      )}
    >
      <span className="size-2 shrink-0 rounded-sm" style={{ background: TYPE_COLOR[mo.type] }} />
      <span className="tabular min-w-0 flex-1 truncate font-medium">{mo.machineId}</span>
      {overdue && <AlertTriangle className="size-3 shrink-0" />}
      {done && <CheckCircle2 className="size-3 shrink-0 text-good" />}
    </button>
  );
}

export function CalendarPanel({ rows, onOpen }: { rows: MaintenanceOrder[]; onOpen: (id: string) => void }) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const clock = useClock();
  const lk = useLookups();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(clock.today);
  const [hidden, setHidden] = useState<MaintenanceType[]>([]);

  const month = useMemo(() => {
    const [y0, m0] = clock.today.split("-").map(Number);
    const idx = m0 - 1 + offset;
    const y = y0 + Math.floor(idx / 12);
    const mi = ((idx % 12) + 12) % 12;
    const first = `${y}-${pad(mi + 1)}-01`;
    const dim = new Date(Date.UTC(y, mi + 1, 0)).getUTCDate();
    const lead = (new Date(Date.UTC(y, mi, 1)).getUTCDay() + 6) % 7; // Monday-first
    const cells = Math.ceil((lead + dim) / 7) * 7;
    const start = addDays(first, -lead);
    const days = Array.from({ length: cells }, (_, i) => addDays(start, i));
    const title = new Intl.DateTimeFormat(fmt.locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(Date.UTC(y, mi, 15));
    const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(fmt.locale, { weekday: "short", timeZone: "UTC" }).format(Date.UTC(2024, 0, 1 + i)));
    return { prefix: `${y}-${pad(mi + 1)}`, days, title, weekdays };
  }, [clock.today, offset, fmt.locale]);

  const byDate = useMemo(() => {
    const map = new Map<string, MaintenanceOrder[]>();
    for (const mo of rows) {
      if (hidden.includes(mo.type)) continue;
      let list = map.get(mo.scheduledDate);
      if (!list) map.set(mo.scheduledDate, (list = []));
      list.push(mo);
    }
    const rank = (mo: MaintenanceOrder) => (effStatus(mo, clock.today) === "overdue" ? 0 : mo.status === "completed" ? 2 : 1);
    for (const list of map.values()) list.sort((a, b) => rank(a) - rank(b) || MAINT_TYPES.indexOf(a.type) - MAINT_TYPES.indexOf(b.type));
    return map;
  }, [rows, hidden, clock.today]);

  const monthStats = useMemo(() => {
    let n = 0;
    let o = 0;
    for (const [d, list] of byDate) {
      if (!d.startsWith(month.prefix)) continue;
      n += list.length;
      o += list.filter((mo) => effStatus(mo, clock.today) === "overdue").length;
    }
    return { n, o };
  }, [byDate, month.prefix, clock.today]);

  const agenda = byDate.get(selected) ?? [];

  return (
    <div className="flex flex-col gap-4 px-5 py-4 xl:flex-row">
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <IconButton label={t("cal.prev")} onClick={() => setOffset((o) => o - 1)}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <h3 className="min-w-36 text-center font-display text-base font-semibold text-ink capitalize">{month.title}</h3>
            <IconButton label={t("cal.next")} onClick={() => setOffset((o) => o + 1)}>
              <ChevronRight className="size-4" />
            </IconButton>
            <Button
              size="sm"
              variant="ghost"
              className="ml-1"
              onClick={() => {
                setOffset(0);
                setSelected(clock.today);
              }}
            >
              {t("cal.today")}
            </Button>
          </div>
          <span className="text-xs text-ink-3">{t("cal.summary", { n: monthStats.n, o: monthStats.o })}</span>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-2">
          {MAINT_TYPES.map((type) => {
            const off = hidden.includes(type);
            return (
              <button
                key={type}
                type="button"
                aria-pressed={!off}
                title={t("cal.toggle", { type: label("maintType", type) })}
                onClick={() => setHidden((h) => (off ? h.filter((x) => x !== type) : [...h, type]))}
                className={cn("inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-surface-3", off && "text-ink-3 line-through opacity-60")}
              >
                <span className="size-2.5 rounded-sm" style={{ background: TYPE_COLOR[type] }} />
                {label("maintType", type)}
              </button>
            );
          })}
          <span className="inline-flex items-center gap-1 rounded bg-critical-soft px-1.5 py-0.5 text-critical-ink">
            <AlertTriangle className="size-3" />
            {t("cal.overdue")}
          </span>
          <span className="inline-flex items-center gap-1 text-ink-3">
            <CheckCircle2 className="size-3 text-good" />
            {t("cal.completed")}
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-line">
          <div className="grid grid-cols-7 border-b border-line bg-surface-2">
            {month.weekdays.map((w) => (
              <div key={w} className="px-1.5 py-1.5 text-center text-[11px] font-medium text-ink-3 capitalize sm:text-left">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {month.days.map((d, i) => {
              const inMonth = d.startsWith(month.prefix);
              const isToday = d === clock.today;
              const isSel = d === selected;
              const list = byDate.get(d) ?? [];
              const overdue = list.some((mo) => effStatus(mo, clock.today) === "overdue");
              return (
                <div
                  key={d}
                  onClick={() => setSelected(d)}
                  className={cn(
                    "relative flex min-h-14 cursor-pointer flex-col gap-1 border-line p-1 transition-colors hover:bg-surface-2 sm:min-h-24 sm:p-1.5",
                    i % 7 !== 6 && "border-r",
                    i < month.days.length - 7 && "border-b",
                    !inMonth && "bg-surface-2/60",
                    isSel && "bg-brand-soft/40 ring-2 ring-brand ring-inset",
                  )}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(d);
                    }}
                    aria-label={fmt.weekday(d)}
                    aria-current={isToday ? "date" : undefined}
                    className={cn(
                      "tabular inline-flex size-6 items-center justify-center self-start rounded-full text-xs",
                      isToday ? "bg-brand font-semibold text-brand-ink" : inMonth ? "text-ink-2" : "text-ink-3",
                    )}
                  >
                    {Number(d.slice(8))}
                  </button>
                  <div className="hidden min-w-0 flex-col gap-0.5 md:flex">
                    {list.slice(0, 3).map((mo) => (
                      <Chip key={mo.id} mo={mo} today={clock.today} onOpen={onOpen} />
                    ))}
                    {list.length > 3 && <span className="px-1 text-[11px] text-ink-3">{t("cal.more", { n: list.length - 3 })}</span>}
                  </div>
                  {list.length > 0 && (
                    <div className="flex flex-wrap items-center gap-0.5 md:hidden">
                      {list.slice(0, 4).map((mo) => (
                        <span key={mo.id} className="size-1.5 rounded-full" style={{ background: TYPE_COLOR[mo.type] }} />
                      ))}
                      {overdue && <AlertTriangle className="size-3 text-critical" />}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <aside className="xl:w-80 xl:shrink-0">
        <div className="rounded-xl border border-line">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <CalendarDays className="size-4 text-ink-3" />
            <h4 className="text-sm font-semibold text-ink">{t("cal.agenda", { date: fmt.weekday(selected) })}</h4>
          </div>
          {agenda.length === 0 ? (
            <EmptyState title={t("cal.empty")} />
          ) : (
            <ul className="divide-y divide-line">
              {agenda.map((mo) => (
                <li key={mo.id}>
                  <button type="button" onClick={() => onOpen(mo.id)} className="flex w-full flex-col gap-1.5 px-4 py-3 text-left hover:bg-surface-2">
                    <span className="flex items-center justify-between gap-2">
                      <span className="tabular text-[13px] font-medium text-brand">{mo.id}</span>
                      <StatusBadge kind="maintStatus" value={effStatus(mo, clock.today)} />
                    </span>
                    <span className="line-clamp-2 text-[13px] text-ink">{tx(mo.title, mo.titleTr)}</span>
                    <span className="flex items-center gap-2 text-xs text-ink-3">
                      <span className="size-2 rounded-sm" style={{ background: TYPE_COLOR[mo.type] }} />
                      {label("maintType", mo.type)} · <span className="tabular">{mo.machineId}</span> · {lk.employee.get(mo.technicianId)?.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
