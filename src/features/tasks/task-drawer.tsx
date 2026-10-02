"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Ban, CheckCircle2, Cog, Eye, Play, RotateCcw, Square, SquareCheckBig, Timer, Undo2 } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { cn } from "@/lib/cn";
import { localDateOf, TZ_OFFSET_MS } from "@/lib/data/clock";
import type { Employee, EmployeeRole, Priority, Task, TaskStatus } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { actions, toast, useDb } from "@/lib/store";
import { Avatar, Badge, Button, Drawer, Field, IdLink, Input, KeyValue, PersonChip, Progress, SectionTitle, Select, StatusBadge, Textarea } from "@/components/ui";
import { useReasonTx } from "@/features/work-orders/reasons";
import { taskActions } from "./actions";
import { messages } from "./messages";
import { PriorityMark, TypeChip } from "./task-card";
import { COMMENT_TR, isOverdue, STATUSES } from "./task-utils";

const PRIORITIES: Priority[] = ["urgent", "high", "normal", "low"];
const ROLE_ORDER: EmployeeRole[] = ["supervisor", "team_lead", "planner", "operator", "welder", "qc_inspector", "maintenance_tech", "warehouse"];

/** Detail panel for one task. Mount with `key={task.id}` so the composer resets per task. */
export function TaskDrawer({
  task,
  now,
  onClose,
  onMove,
  onBlock,
}: {
  task: Task;
  now: number;
  onClose: () => void;
  onMove: (id: string, status: TaskStatus) => void;
  onBlock: (id: string) => void;
}) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const reasonTx = useReasonTx();
  const lk = useLookups();
  const employees = useDb((db) => db.employees);
  const [comment, setComment] = useState("");

  const staffByRole = useMemo(() => {
    const staff = employees.filter((e) => e.plantId === task.plantId);
    return ROLE_ORDER.map((role) => ({ role, people: staff.filter((e) => e.role === role).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.people.length);
  }, [employees, task.plantId]);
  const author: Employee | undefined = staffByRole.find((g) => g.role === "supervisor")?.people[0] ?? staffByRole.find((g) => g.role === "team_lead")?.people[0];

  const plant = lk.plant.get(task.plantId);
  const wo = task.workOrderId ? lk.workOrder.get(task.workOrderId) : undefined;
  const product = wo ? lk.product.get(wo.productId) : undefined;
  const machine = task.machineId ? lk.machine.get(task.machineId) : undefined;
  const overdue = isOverdue(task, now);
  const doneCount = task.checklist.filter((c) => c.done).length;
  const over = task.loggedHours - task.estimateHours;
  const hours = (n: number) => t("hours", { n: fmt.num(n, Number.isInteger(n) ? 0 : 1) });
  const dueLocalTime = new Date(Date.parse(task.dueAt) + TZ_OFFSET_MS).toISOString().slice(11, 16);

  const setPriority = (p: Priority) => {
    actions.updateTask(task.id, { priority: p });
    toast({ title: t("toast.priority", { id: task.id, p: label("priority", p) }), tone: "info" });
  };
  const setAssignee = (id: string) => {
    actions.updateTask(task.id, { assigneeId: id || undefined });
    const name = id ? lk.employee.get(id)?.name : undefined;
    toast({ title: name ? t("toast.assigned", { id: task.id, name }) : t("toast.unassigned", { id: task.id }), tone: "info" });
  };
  const setDue = (date: string) => {
    if (!date) return;
    actions.updateTask(task.id, { dueAt: new Date(`${date}T${dueLocalTime}:00+03:00`).toISOString() });
    toast({ title: t("toast.due", { id: task.id, d: fmt.date(date) }), tone: "info" });
  };
  const logTime = (h: number) => {
    taskActions.logTime(task.id, h);
    toast({ title: t("toast.logged", { id: task.id, h: hours(h) }), tone: "good" });
  };
  const send = () => {
    const text = comment.trim();
    if (!text || !author) return;
    actions.addTaskComment(task.id, author.id, text);
    setComment("");
    toast({ title: t("toast.comment", { id: task.id }), tone: "good" });
  };

  const flow: { label: string; icon: ReactNode; to: TaskStatus; variant: "primary" | "secondary" | "ghost" }[] =
    task.status === "todo"
      ? [{ label: t("flow.start"), icon: <Play className="size-4" />, to: "in_progress", variant: "primary" }]
      : task.status === "in_progress"
        ? [
            { label: t("flow.block"), icon: <Ban className="size-4" />, to: "blocked", variant: "ghost" },
            { label: t("flow.review"), icon: <Eye className="size-4" />, to: "review", variant: "primary" },
          ]
        : task.status === "blocked"
          ? [{ label: t("flow.unblock"), icon: <Play className="size-4" />, to: "in_progress", variant: "primary" }]
          : task.status === "review"
            ? [
                { label: t("flow.sendBack"), icon: <Undo2 className="size-4" />, to: "in_progress", variant: "ghost" },
                { label: t("flow.approve"), icon: <CheckCircle2 className="size-4" />, to: "done", variant: "primary" },
              ]
            : [{ label: t("flow.reopen"), icon: <RotateCcw className="size-4" />, to: "todo", variant: "secondary" }];

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-2xl"
      title={<span className="line-clamp-2">{tx(task.title, task.titleTr)}</span>}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-ink-2 tabular">{task.id}</span>
          <span aria-hidden>·</span>
          <span>{plant?.code}</span>
          <span aria-hidden>·</span>
          <span>{t("drawer.createdRel", { t: fmt.relative(task.createdAt, now) })}</span>
        </span>
      }
      footer={
        <>
          {wo && (
            <Link href={`/work-orders/${wo.id}`} className="mr-auto inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline">
              {t("drawer.openWo")}
              <ArrowRight className="size-3.5" />
            </Link>
          )}
          {flow.map((f) => (
            <Button key={f.to} variant={f.variant} icon={f.icon} onClick={() => onMove(task.id, f.to)}>
              {f.label}
            </Button>
          ))}
        </>
      }
    >
      <div className="flex flex-col gap-6 px-5 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge kind="taskStatus" value={task.status} />
          <TypeChip type={task.type} className="h-6 px-2 text-xs" />
          <PriorityMark value={task.priority} showLabel />
          {overdue && (
            <Badge tone="critical" icon={<AlertTriangle className="size-3.5" />}>
              {t("drawer.overdue")}
            </Badge>
          )}
        </div>

        {task.status === "blocked" && (
          <div className="flex items-start gap-3 rounded-xl border border-critical/40 bg-critical-soft px-4 py-3">
            <Ban className="mt-0.5 size-4 shrink-0 text-critical-ink" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold tracking-wide text-critical-ink uppercase">{t("drawer.blockedReason")}</p>
              <p className="mt-0.5 text-sm text-ink">{reasonTx(task.blockedReason) || "—"}</p>
            </div>
            <Button size="xs" variant="ghost" onClick={() => onBlock(task.id)}>
              {t("drawer.changeReason")}
            </Button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("common.status")}>
            <Select value={task.status} onChange={(e) => onMove(task.id, e.target.value as TaskStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {label("taskStatus", s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("common.priority")}>
            <Select value={task.priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {label("priority", p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("common.assignee")}>
            <Select value={task.assigneeId ?? ""} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">{t("common.unassigned")}</option>
              {staffByRole.map((g) => (
                <optgroup key={g.role} label={label("role", g.role)}>
                  {g.people.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`due-${task.id}`} className="text-xs font-medium text-ink-2">
              {t("common.dueDate")}
            </label>
            <div className="flex items-center gap-2">
              <Input
                id={`due-${task.id}`}
                type="date"
                value={localDateOf(Date.parse(task.dueAt))}
                onChange={(e) => setDue(e.target.value)}
                className={cn("min-w-0 flex-1", overdue && "border-critical text-critical-ink")}
              />
              <span className={cn("shrink-0 text-xs tabular", overdue ? "font-medium text-critical-ink" : "text-ink-3")}>
                {dueLocalTime} · {fmt.relative(task.dueAt, now)}
              </span>
            </div>
          </div>
        </div>

        <KeyValue
          cols={3}
          items={[
            { label: t("drawer.reporter"), value: <PersonChip id={task.reporterId} size={20} /> },
            { label: t("drawer.created"), value: <span className="tabular">{fmt.dateTime(task.createdAt)}</span> },
            { label: t("common.plant"), value: plant ? `${plant.code} · ${tx(plant.name, plant.nameTr).split("·")[1]?.trim() ?? ""}` : task.plantId },
          ]}
        />

        {(wo || machine) && (
          <section>
            <SectionTitle>{t("drawer.links")}</SectionTitle>
            <div className="flex flex-col gap-2">
              {wo && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-2.5">
                  <IdLink href={`/work-orders/${wo.id}`}>{wo.id}</IdLink>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
                    {product?.sku} · {fmt.num(wo.qty)} {t("common.pcs")} · {t("common.due")} {fmt.date(wo.dueDate)}
                  </span>
                  <StatusBadge kind="woStatus" value={wo.status} />
                </div>
              )}
              {machine && (
                <Link href={`/shop-floor?machine=${machine.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line px-3 py-2.5 hover:bg-surface-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand tabular">
                    <Cog className="size-4" />
                    {machine.id}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
                    {machine.name} · {machine.line}
                  </span>
                  <StatusBadge kind="machineStatus" value={machine.status} />
                </Link>
              )}
            </div>
          </section>
        )}

        <section>
          <SectionTitle>{t("drawer.time")}</SectionTitle>
          <div className="rounded-lg border border-line p-3">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <span className="inline-flex items-center gap-1.5 text-ink-2">
                <Timer className="size-4 text-ink-3" />
                {t("drawer.logged", { logged: hours(task.loggedHours), est: hours(task.estimateHours) })}
              </span>
              {over > 0 && <span className="text-xs font-medium text-serious-ink">{t("drawer.over", { h: hours(Math.round(over * 10) / 10) })}</span>}
            </div>
            <Progress value={task.estimateHours ? task.loggedHours / task.estimateHours : 0} tone={over > 0 ? "serious" : "brand"} />
            <div className="mt-2.5 flex gap-1.5">
              {[0.5, 1, 2].map((h) => (
                <Button key={h} size="xs" variant="secondary" onClick={() => logTime(h)} disabled={task.status === "done"}>
                  +{hours(h)}
                </Button>
              ))}
            </div>
          </div>
        </section>

        {task.description && (
          <section>
            <SectionTitle>{t("drawer.description")}</SectionTitle>
            <p className="text-sm whitespace-pre-line text-ink-2">{task.description}</p>
          </section>
        )}

        {task.checklist.length > 0 && (
          <section>
            <SectionTitle
              actions={
                <span className="text-xs text-ink-3 tabular">
                  {doneCount}/{task.checklist.length}
                </span>
              }
            >
              {t("common.checklist")}
            </SectionTitle>
            <Progress value={doneCount / task.checklist.length} size="sm" tone={doneCount === task.checklist.length ? "good" : "brand"} className="mb-2" />
            <ul className="flex flex-col">
              {task.checklist.map((c, i) => (
                <li key={i}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={c.done}
                    onClick={() => actions.toggleChecklist(task.id, i)}
                    className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left text-sm hover:bg-surface-2"
                  >
                    {c.done ? <SquareCheckBig className="size-4 shrink-0 text-good" /> : <Square className="size-4 shrink-0 text-ink-3" />}
                    <span className={c.done ? "text-ink-3 line-through" : "text-ink"}>{tx(c.label, c.labelTr)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {task.tags.length > 0 && (
          <section>
            <SectionTitle>{t("drawer.tags")}</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {task.tags.map((tag) => (
                <span key={tag} className="inline-flex h-6 items-center rounded-md border border-line px-2 text-xs text-ink-2">
                  #{tag}
                </span>
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionTitle actions={<span className="text-xs text-ink-3 tabular">{task.comments.length}</span>}>{t("common.comments")}</SectionTitle>
          {task.comments.length === 0 ? (
            <p className="rounded-lg bg-surface-2 px-3 py-3 text-[13px] text-ink-3">{t("drawer.noComments")}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {task.comments.map((c) => {
                const e = lk.employee.get(c.authorId);
                return (
                  <li key={c.id} className="flex gap-2.5">
                    {e ? <Avatar name={e.name} hue={e.avatarHue} size={28} /> : <span className="size-7 rounded-full bg-surface-3" />}
                    <div className="min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[13px] font-medium text-ink">{e?.name ?? c.authorId}</span>
                        {e && <span className="text-[11px] text-ink-3">{label("role", e.role)}</span>}
                        <span className="ml-auto text-[11px] text-ink-3" title={fmt.dateTime(c.at)}>
                          {fmt.relative(Math.min(Date.parse(c.at), now), now)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm break-words whitespace-pre-line text-ink-2">{tx(c.text, COMMENT_TR[c.text])}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {author && (
            <div className="mt-3 flex gap-2.5">
              <Avatar name={author.name} hue={author.avatarHue} size={28} />
              <div className="min-w-0 flex-1">
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={t("drawer.commentPh")}
                  className="min-h-16"
                />
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-ink-3">{t("drawer.postingAs", { name: author.name, role: label("role", author.role) })}</span>
                  <Button size="sm" variant="primary" onClick={send} disabled={!comment.trim()}>
                    {t("drawer.send")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </Drawer>
  );
}
