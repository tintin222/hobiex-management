"use client";

import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useLabel, useT } from "@/i18n";
import { cn } from "@/lib/cn";
import type { Task, TaskStatus } from "@/lib/data/types";
import { STATUS_STYLES, toneDot, type Tone } from "@/components/ui";
import { messages } from "./messages";
import { TaskCard } from "./task-card";
import { isOverdue, PRIORITY_RANK, STATUSES } from "./task-utils";

export interface Lane {
  key: string;
  title?: ReactNode;
  icon?: ReactNode;
  sub?: ReactNode;
  tasks: Task[];
}

const toneText: Record<Tone, string> = {
  neutral: "text-ink-3",
  brand: "text-brand",
  good: "text-good",
  warn: "text-warn",
  serious: "text-serious",
  critical: "text-critical",
};

interface DragInfo {
  id: string;
  lane: string;
  status: TaskStatus;
}

/**
 * Kanban with native HTML5 drag & drop. Cards move between status columns of
 * their own swimlane; the target column is highlighted while dragging.
 */
export function TaskBoard({
  lanes,
  now,
  doneAt,
  flashId,
  onOpen,
  onMove,
}: {
  lanes: Lane[];
  now: number;
  doneAt: (t: Task) => number;
  flashId?: string | null;
  onOpen: (id: string) => void;
  onMove: (id: string, status: TaskStatus) => void;
}) {
  const t = useT(messages);
  const label = useLabel();
  const dragRef = useRef<DragInfo | null>(null);
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const columns = useMemo(
    () =>
      lanes.map((lane) => {
        const by = new Map<TaskStatus, Task[]>(STATUSES.map((s) => [s, []]));
        for (const task of lane.tasks) by.get(task.status)!.push(task);
        for (const [s, list] of by) {
          if (s === "done") list.sort((a, b) => doneAt(b) - doneAt(a));
          else
            list.sort(
              (a, b) =>
                Number(isOverdue(b, now)) - Number(isOverdue(a, now)) ||
                (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) ||
                Date.parse(a.dueAt) - Date.parse(b.dueAt),
            );
        }
        return { lane, by };
      }),
    [lanes, now, doneAt],
  );

  const startDrag = (lane: string) => (e: DragEvent<HTMLElement>, task: Task) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", task.id);
    const info = { id: task.id, lane, status: task.status };
    dragRef.current = info;
    // defer the visual state so the browser snapshots the card at full opacity
    setTimeout(() => {
      if (dragRef.current === info) setDrag(info);
    }, 0);
  };
  const endDrag = () => {
    dragRef.current = null;
    setDrag(null);
    setOver(null);
  };

  const grouped = lanes.length > 1 || lanes[0]?.title !== undefined;

  return (
    <div className="flex flex-col gap-5">
      {columns.map(({ lane, by }) => {
        const isCollapsed = collapsed.has(lane.key);
        return (
          <section key={lane.key} aria-label={typeof lane.title === "string" ? lane.title : undefined}>
            {grouped && (
              <button
                type="button"
                onClick={() =>
                  setCollapsed((c) => {
                    const n = new Set(c);
                    if (n.has(lane.key)) n.delete(lane.key);
                    else n.add(lane.key);
                    return n;
                  })
                }
                aria-expanded={!isCollapsed}
                title={t("lane.toggle")}
                className="mb-2 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-surface-3/60"
              >
                <ChevronDown className={cn("size-4 text-ink-3 transition-transform", isCollapsed && "-rotate-90")} />
                {lane.icon}
                <span className="text-sm font-semibold text-ink">{lane.title}</span>
                {lane.sub && <span className="hidden truncate text-xs text-ink-3 sm:inline">{lane.sub}</span>}
                <span className="ml-auto flex shrink-0 items-center gap-3 text-xs text-ink-3">
                  {STATUSES.filter((s) => s !== "done" && by.get(s)!.length).map((s) => {
                    const [tone, Icon] = STATUS_STYLES.taskStatus![s];
                    return (
                      <span key={s} className="hidden items-center gap-1 md:inline-flex" title={label("taskStatus", s)}>
                        <Icon className={cn("size-3.5", toneText[tone])} />
                        <span className="tabular">{by.get(s)!.length}</span>
                      </span>
                    );
                  })}
                  <span className="tabular">{t("lane.count", { n: lane.tasks.length })}</span>
                </span>
              </button>
            )}
            {!isCollapsed && (
              <div className="overflow-x-auto pb-1 scroll-thin">
                <div className="grid min-w-[1120px] grid-cols-5 gap-3">
                  {STATUSES.map((s) => {
                    const [tone, Icon] = STATUS_STYLES.taskStatus![s];
                    const list = by.get(s)!;
                    const key = `${lane.key}:${s}`;
                    const canDrop = !!drag && drag.lane === lane.key && drag.status !== s;
                    const isOver = canDrop && over === key;
                    return (
                      <div
                        key={s}
                        role="group"
                        aria-label={label("taskStatus", s)}
                        onDragOver={(e) => {
                          const d = dragRef.current;
                          if (!d || d.lane !== lane.key || d.status === s) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (over !== key) setOver(key);
                        }}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === key ? null : o));
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const d = dragRef.current;
                          endDrag();
                          if (d && d.status !== s) onMove(d.id, s);
                        }}
                        className={cn(
                          "flex min-w-0 flex-col overflow-hidden rounded-xl border bg-surface-2 transition-[border-color,background-color,box-shadow]",
                          isOver ? "border-brand bg-brand-soft/60 ring-2 ring-brand/25" : canDrop ? "border-dashed border-line-strong" : "border-line",
                        )}
                      >
                        <div className={cn("h-1", toneDot[tone])} aria-hidden />
                        <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-2">
                          <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-ink">
                            <Icon className={cn("size-4 shrink-0", toneText[tone])} />
                            <span className="truncate">{label("taskStatus", s)}</span>
                          </span>
                          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-ink-2 tabular">{list.length}</span>
                        </div>
                        <div className="flex min-h-28 flex-1 flex-col gap-2 px-2 pb-2">
                          {isOver && (
                            <div className="flex h-14 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-brand/60 text-[11px] font-medium text-brand">
                              {t("col.drop")}
                            </div>
                          )}
                          {list.map((task) => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              now={now}
                              dragging={drag?.id === task.id}
                              flash={flashId === task.id}
                              onOpen={onOpen}
                              onDragStart={startDrag(lane.key)}
                              onDragEnd={endDrag}
                            />
                          ))}
                          {list.length === 0 && !isOver && (
                            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line py-6 text-xs text-ink-3">{t("col.empty")}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
