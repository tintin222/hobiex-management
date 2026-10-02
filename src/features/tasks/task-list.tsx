"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { useFmt, useT, useTx } from "@/i18n";
import { cn } from "@/lib/cn";
import type { Task } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { DataTable, PersonChip, PriorityBadge, Progress, StatusBadge, type Column } from "@/components/ui";
import { messages } from "./messages";
import { TypeChip } from "./task-card";
import { isOverdue, PRIORITY_RANK, STATUSES } from "./task-utils";

/** Sortable table view of the same filtered tasks. */
export function TaskList({ tasks, now, onOpen }: { tasks: Task[]; now: number; onOpen: (id: string) => void }) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const lk = useLookups();

  const columns = useMemo<Column<Task>[]>(
    () => [
      {
        key: "id",
        header: "ID",
        sortValue: (r) => Number(r.id.split("-")[1]),
        cell: (r) => <span className="font-medium whitespace-nowrap text-brand tabular">{r.id}</span>,
      },
      {
        key: "task",
        header: t("list.col.task"),
        sortValue: (r) => tx(r.title, r.titleTr),
        cell: (r) => (
          <div className="max-w-md min-w-56">
            <div className="truncate font-medium text-ink" title={tx(r.title, r.titleTr)}>
              {tx(r.title, r.titleTr)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <TypeChip type={r.type} />
              {r.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="inline-flex h-5 items-center rounded-md border border-line px-1.5 text-[11px] text-ink-3">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        ),
      },
      {
        key: "status",
        header: t("common.status"),
        sortValue: (r) => STATUSES.indexOf(r.status),
        cell: (r) => <StatusBadge kind="taskStatus" value={r.status} />,
      },
      {
        key: "priority",
        header: t("common.priority"),
        sortValue: (r) => 3 - PRIORITY_RANK[r.priority],
        cell: (r) => <PriorityBadge value={r.priority} compact />,
      },
      {
        key: "assignee",
        header: t("common.assignee"),
        hideBelow: "md",
        sortValue: (r) => (r.assigneeId ? lk.employee.get(r.assigneeId)?.name ?? "" : "~"),
        cell: (r) => (r.assigneeId ? <PersonChip id={r.assigneeId} size={20} className="max-w-44" /> : <span className="text-xs text-ink-3 italic">{t("common.unassigned")}</span>),
      },
      {
        key: "plant",
        header: t("common.plant"),
        hideBelow: "lg",
        sortValue: (r) => r.plantId,
        cell: (r) => <span className="text-xs text-ink-2">{lk.plant.get(r.plantId)?.code}</span>,
      },
      {
        key: "due",
        header: t("common.due"),
        sortValue: (r) => r.dueAt,
        cell: (r) => {
          const late = isOverdue(r, now);
          return (
            <div className="whitespace-nowrap" title={fmt.dateTime(r.dueAt)}>
              <span className={cn("inline-flex items-center gap-1 text-[13px]", late ? "font-medium text-critical-ink" : "text-ink-2")}>
                {late && <AlertTriangle className="size-3.5" />}
                {r.status === "done" ? fmt.date(r.dueAt) : fmt.relative(r.dueAt, now)}
              </span>
              <div className="text-[11px] text-ink-3 tabular">{fmt.dateTime(r.dueAt)}</div>
            </div>
          );
        },
      },
      {
        key: "checklist",
        header: t("common.checklist"),
        hideBelow: "lg",
        sortValue: (r) => (r.checklist.length ? r.checklist.filter((c) => c.done).length / r.checklist.length : -1),
        cell: (r) => {
          const d = r.checklist.filter((c) => c.done).length;
          const n = r.checklist.length;
          return n ? (
            <div className="flex w-28 items-center gap-2">
              <Progress value={d / n} size="sm" tone={d === n ? "good" : "brand"} />
              <span className="text-[11px] text-ink-3 tabular">
                {d}/{n}
              </span>
            </div>
          ) : (
            <span className="text-ink-3">—</span>
          );
        },
      },
      {
        key: "wo",
        header: t("common.workOrder"),
        hideBelow: "xl",
        sortValue: (r) => r.workOrderId ?? "~",
        cell: (r) =>
          r.workOrderId ? (
            <span className="text-xs whitespace-nowrap text-ink-2 tabular">
              {r.workOrderId}
              {r.machineId && <span className="text-ink-3"> · {r.machineId}</span>}
            </span>
          ) : r.machineId ? (
            <span className="text-xs text-ink-2 tabular">{r.machineId}</span>
          ) : (
            <span className="text-ink-3">—</span>
          ),
      },
    ],
    [t, tx, fmt, lk, now],
  );

  return (
    <DataTable
      rows={tasks}
      columns={columns}
      rowKey={(r) => r.id}
      onRowClick={(r) => onOpen(r.id)}
      pageSize={25}
      initialSort={{ key: "due", dir: "asc" }}
      rowClassName={(r) => (r.status === "blocked" ? "bg-critical-soft/30" : undefined)}
    />
  );
}
