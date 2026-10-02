"use client";

import Link from "next/link";
import type { DragEvent } from "react";
import { AlertTriangle, Ban, Clock, Cog, ListChecks, MessageSquare, UserRound } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { cn } from "@/lib/cn";
import type { Task } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { Avatar, Progress, STATUS_STYLES } from "@/components/ui";
import { useReasonTx } from "@/features/work-orders/reasons";
import { messages } from "./messages";
import { isOverdue, TYPE_ICON } from "./task-utils";

const prioText: Record<string, string> = { urgent: "text-critical", high: "text-serious", low: "text-ink-3" };

export function TypeChip({ type, className }: { type: Task["type"]; className?: string }) {
  const label = useLabel();
  const Icon = TYPE_ICON[type];
  return (
    <span className={cn("inline-flex h-5 min-w-0 items-center gap-1 rounded-md bg-surface-3 px-1.5 text-[11px] font-medium text-ink-2", className)}>
      <Icon className="size-3 shrink-0" />
      <span className="truncate">{label("taskType", type)}</span>
    </span>
  );
}

/** Priority as icon (+ label for urgent/high); normal is the default and stays quiet. */
export function PriorityMark({ value, showLabel }: { value: Task["priority"]; showLabel?: boolean }) {
  const label = useLabel();
  const style = STATUS_STYLES.priority?.[value];
  if (value === "normal" || !style) return null;
  const Icon = style[1];
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium", value === "low" ? "text-ink-3" : "text-ink-2")} title={label("priority", value)}>
      <Icon className={cn("size-3.5", prioText[value])} aria-hidden />
      {showLabel ? label("priority", value) : <span className="sr-only">{label("priority", value)}</span>}
    </span>
  );
}

export function TaskCard({
  task,
  now,
  dragging,
  flash,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  now: number;
  dragging?: boolean;
  flash?: boolean;
  onOpen: (id: string) => void;
  onDragStart: (e: DragEvent<HTMLElement>, task: Task) => void;
  onDragEnd: () => void;
}) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const reasonTx = useReasonTx();
  const lk = useLookups();
  const assignee = task.assigneeId ? lk.employee.get(task.assigneeId) : undefined;
  const overdue = isOverdue(task, now);
  const done = task.checklist.filter((c) => c.done).length;
  const total = task.checklist.length;
  const title = tx(task.title, task.titleTr);
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <article
      id={`task-${task.id}`}
      draggable
      tabIndex={0}
      role="button"
      aria-label={`${task.id} · ${title}`}
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(task.id);
        }
      }}
      className={cn(
        "group cursor-grab rounded-lg border border-line bg-surface p-3 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-[border-color,box-shadow,opacity] hover:border-line-strong hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand active:cursor-grabbing",
        task.status === "blocked" && "border-l-[3px] border-l-critical",
        overdue && task.status !== "blocked" && "border-l-[3px] border-l-serious",
        dragging && "opacity-40",
        flash && "ring-2 ring-brand ring-offset-1 ring-offset-surface-2",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-ink-3 tabular">{task.id}</span>
        <div className="flex min-w-0 items-center gap-2">
          <PriorityMark value={task.priority} showLabel={task.priority === "urgent" || task.priority === "high"} />
          <TypeChip type={task.type} />
        </div>
      </div>

      <p className={cn("mt-1.5 line-clamp-2 text-[13px] leading-snug font-medium", task.status === "done" ? "text-ink-2" : "text-ink")}>{title}</p>

      {(task.workOrderId || task.machineId || task.tags.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {task.workOrderId && (
            <Link
              href={`/work-orders/${task.workOrderId}`}
              draggable={false}
              onClick={stop}
              className="inline-flex h-5 items-center rounded-md bg-brand-soft px-1.5 text-[11px] font-medium text-brand-soft-ink tabular hover:underline"
            >
              {task.workOrderId}
            </Link>
          )}
          {task.machineId && (
            <Link
              href={`/shop-floor?machine=${task.machineId}`}
              draggable={false}
              onClick={stop}
              className="inline-flex h-5 items-center gap-1 rounded-md bg-surface-3 px-1.5 text-[11px] font-medium text-ink-2 tabular hover:text-ink hover:underline"
            >
              <Cog className="size-3" />
              {task.machineId}
            </Link>
          )}
          {task.tags
            .filter((tag) => !task.workOrderId || !tag.startsWith("HBX-"))
            .slice(0, 3)
            .map((tag) => (
              <span key={tag} className="inline-flex h-5 items-center rounded-md border border-line px-1.5 text-[11px] text-ink-3">
                #{tag}
              </span>
            ))}
        </div>
      )}

      {task.status === "blocked" && task.blockedReason && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-critical-soft px-2 py-1.5 text-[11px] leading-snug text-critical-ink">
          <Ban className="mt-px size-3 shrink-0" />
          <span className="line-clamp-2">{reasonTx(task.blockedReason)}</span>
        </p>
      )}

      {total > 0 && (
        <div className="mt-2.5 flex items-center gap-2" title={t("card.checklist", { d: done, n: total })}>
          <ListChecks className="size-3.5 shrink-0 text-ink-3" />
          <Progress value={done / total} size="sm" tone={done === total ? "good" : "brand"} />
          <span className="text-[11px] text-ink-3 tabular">
            {done}/{total}
          </span>
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-line pt-2">
        <span
          className={cn("inline-flex min-w-0 items-center gap-1 text-[11px]", overdue ? "font-medium text-critical-ink" : "text-ink-3")}
          title={t("card.dueAt", { t: fmt.dateTime(task.dueAt) })}
        >
          {overdue ? <AlertTriangle className="size-3 shrink-0" /> : <Clock className="size-3 shrink-0" />}
          <span className="truncate">{task.status === "done" ? fmt.date(task.dueAt) : fmt.relative(task.dueAt, now)}</span>
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {task.comments.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-3" title={t("card.comments", { n: task.comments.length })}>
              <MessageSquare className="size-3" />
              {task.comments.length}
            </span>
          )}
          {assignee ? (
            <span title={assignee.name}>
              <Avatar name={assignee.name} hue={assignee.avatarHue} size={22} />
            </span>
          ) : (
            <span title={t("common.unassigned")} className="inline-flex size-[22px] items-center justify-center rounded-full border border-dashed border-line-strong text-ink-3">
              <UserRound className="size-3" />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
