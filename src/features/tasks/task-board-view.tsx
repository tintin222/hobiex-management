"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, ClipboardList, Eye, KanbanSquare, List, Plus } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { DAY } from "@/lib/data/clock";
import type { Priority, Task, TaskStatus, TaskType } from "@/lib/data/types";
import { useByPlant, useLookups, usePlantFilter } from "@/lib/hooks";
import { toast, useClock, useDb } from "@/lib/store";
import { PageContainer } from "@/components/layout/app-shell";
import { Button, Card, PageHeader, SearchInput, Segmented, Select } from "@/components/ui";
import { useReasonTx } from "@/features/work-orders/reasons";
import { StatCard } from "@/features/work-orders/ui";
import { taskActions, useTaskSession } from "./actions";
import { BlockReasonModal } from "./block-reason-modal";
import { messages } from "./messages";
import { NewTaskModal } from "./new-task-modal";
import { TaskBoard, type Lane } from "./task-board";
import { TaskDrawer } from "./task-drawer";
import { TaskList } from "./task-list";
import { completedAt, isOverdue, normalizeTask, TASK_TYPES, TYPE_ICON } from "./task-utils";

type View = "board" | "list";
type Group = "none" | "plant" | "type";
type Quick = "open" | "overdue" | "blocked" | "review" | "done24";

const PRIORITIES: Priority[] = ["urgent", "high", "normal", "low"];
const NO_SESSION: Record<string, number> = {};

export function TaskBoardView() {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const reasonTx = useReasonTx();
  const clock = useClock();
  const lk = useLookups();
  const plantFilter = usePlantFilter();
  const searchParams = useSearchParams();

  const tasksAll = useDb((db) => db.tasks);
  const plantsAll = useDb((db) => db.plants);
  const generatedAt = useDb((db) => db.generatedAt);
  const tasksInPlant = useByPlant(tasksAll);
  const tasks = useMemo(() => tasksInPlant.map(normalizeTask), [tasksInPlant]);
  const sessionDataset = useTaskSession((s) => s.dataset);
  const sessionDone = useTaskSession((s) => s.doneAt);
  const doneMap = sessionDataset === generatedAt ? sessionDone : NO_SESSION;
  const doneAt = useCallback((task: Task) => completedAt(task, clock.now, doneMap), [clock.now, doneMap]);

  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | TaskType>("all");
  const [assignee, setAssignee] = useState<string>("all");
  const [priority, setPriority] = useState<"all" | Priority>("all");
  const [view, setView] = useState<View>("board");
  const [group, setGroup] = useState<Group>("none");
  const [quick, setQuick] = useState<Quick | null>(null);
  const [creating, setCreating] = useState(false);
  const [blockFor, setBlockFor] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  // The open task lives in the URL (?task=TSK-5012) so links from search,
  // the dashboard or other screens open the drawer directly.
  const openId = searchParams.get("task");
  const openRaw = openId ? lk.task.get(openId) : undefined;
  const openTask = openRaw ? normalizeTask(openRaw) : undefined;
  const setOpenId = useCallback(
    (id: string | null) => {
      const p = new URLSearchParams(searchParams.toString());
      if (id) p.set("task", id);
      else p.delete("task");
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    },
    [searchParams],
  );

  // ── Summary ──
  const stats = useMemo(() => {
    const open = tasks.filter((x) => x.status !== "done");
    return {
      open: open.length,
      openHours: open.reduce((s, x) => s + Math.max(0, x.estimateHours - x.loggedHours), 0),
      overdue: tasks.filter((x) => isOverdue(x, clock.now)).length,
      blocked: tasks.filter((x) => x.status === "blocked").length,
      review: tasks.filter((x) => x.status === "review").length,
      done24: tasks.filter((x) => x.status === "done" && doneAt(x) >= clock.now - DAY).length,
    };
  }, [tasks, clock.now, doneAt]);

  // ── Filters ──
  const matches = useCallback(
    (x: Task) => {
      if (type !== "all" && x.type !== type) return false;
      if (priority !== "all" && x.priority !== priority) return false;
      if (assignee === "none" ? !!x.assigneeId : assignee !== "all" && x.assigneeId !== assignee) return false;
      const s = q.trim().toLowerCase();
      if (!s) return true;
      return x.id.toLowerCase().includes(s) || x.title.toLowerCase().includes(s) || x.titleTr.toLowerCase().includes(s) || x.tags.some((tag) => tag.toLowerCase().includes(s));
    },
    [q, type, priority, assignee],
  );
  const quickMatch = useCallback(
    (x: Task) => {
      switch (quick) {
        case "open":
          return x.status !== "done";
        case "overdue":
          return isOverdue(x, clock.now);
        case "blocked":
          return x.status === "blocked";
        case "review":
          return x.status === "review";
        case "done24":
          return x.status === "done" && doneAt(x) >= clock.now - DAY;
        default:
          return true;
      }
    },
    [quick, clock.now, doneAt],
  );
  const filtered = useMemo(() => tasks.filter((x) => matches(x) && quickMatch(x)), [tasks, matches, quickMatch]);
  const hasFilters = q !== "" || type !== "all" || assignee !== "all" || priority !== "all" || quick !== null;
  const clearFilters = () => {
    setQ("");
    setType("all");
    setAssignee("all");
    setPriority("all");
    setQuick(null);
  };

  const assignees = useMemo(() => {
    const ids = new Set(tasks.map((x) => x.assigneeId).filter((x): x is string => !!x));
    return [...ids].map((id) => lk.employee.get(id)).filter((e) => !!e).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, lk]);

  const lanes = useMemo<Lane[]>(() => {
    if (group === "plant")
      return plantsAll
        .filter((p) => plantFilter === "all" || p.id === plantFilter)
        .map((p) => ({
          key: p.id,
          title: `${p.code} · ${tx(p.name, p.nameTr).split("·")[1]?.trim() ?? ""}`,
          sub: tx(p.focus, p.focusTr),
          icon: <span className="size-2.5 rounded-sm" style={{ background: `var(--series-${Number(p.id.slice(1))})` }} aria-hidden />,
          tasks: filtered.filter((x) => x.plantId === p.id),
        }))
        .filter((l) => l.tasks.length);
    if (group === "type")
      return TASK_TYPES.map((ty) => {
        const Icon = TYPE_ICON[ty];
        return { key: ty, title: label("taskType", ty), icon: <Icon className="size-4 text-ink-3" />, tasks: filtered.filter((x) => x.type === ty) };
      }).filter((l) => l.tasks.length);
    return [{ key: "all", tasks: filtered }];
  }, [group, plantsAll, plantFilter, filtered, tx, label]);

  // ── Mutations ──
  const move = (id: string, status: TaskStatus) => {
    if (status === "blocked") {
      setBlockFor(id);
      return;
    }
    taskActions.move(id, status);
    toast({ title: t("toast.moved", { id, status: label("taskStatus", status) }), tone: status === "done" ? "good" : "info" });
  };
  const confirmBlock = (reason: string) => {
    if (!blockFor) return;
    taskActions.block(blockFor, reason);
    toast({ title: t("toast.blocked", { id: blockFor }), description: reasonTx(reason), tone: "warn" });
    setBlockFor(null);
  };
  const onCreated = (task: Task) => {
    setCreating(false);
    if (!matches(task) || !quickMatch(task)) clearFilters();
    setFlashId(task.id);
    setTimeout(() => setFlashId((id) => (id === task.id ? null : id)), 2600);
    setTimeout(() => document.getElementById(`task-${task.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
    toast({ title: t("toast.created", { id: task.id }), description: t("toast.createdDesc", { plant: lk.plant.get(task.plantId)?.code ?? task.plantId }), tone: "good" });
  };

  const toggleQuick = (k: Quick) => setQuick((cur) => (cur === k ? null : k));
  const selPlant = plantFilter === "all" ? undefined : lk.plant.get(plantFilter);
  const plantName = selPlant ? tx(selPlant.name, selPlant.nameTr) : t("allPlants");

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", { plants: plantName })}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            {t("newTask")}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label={t("stat.open")}
          value={fmt.num(stats.open)}
          hint={t("stat.openHint", { h: t("hours", { n: fmt.num(stats.openHours) }) })}
          icon={<ClipboardList className="size-5" />}
          tone="brand"
          active={quick === "open"}
          onClick={() => toggleQuick("open")}
        />
        <StatCard
          label={t("stat.overdue")}
          value={fmt.num(stats.overdue)}
          hint={t("stat.overdueHint")}
          icon={<AlertTriangle className="size-5" />}
          tone={stats.overdue ? "critical" : "good"}
          active={quick === "overdue"}
          onClick={() => toggleQuick("overdue")}
        />
        <StatCard
          label={t("stat.blocked")}
          value={fmt.num(stats.blocked)}
          hint={t("stat.blockedHint")}
          icon={<Ban className="size-5" />}
          tone={stats.blocked ? "critical" : "neutral"}
          active={quick === "blocked"}
          onClick={() => toggleQuick("blocked")}
        />
        <StatCard
          label={t("stat.review")}
          value={fmt.num(stats.review)}
          hint={t("stat.reviewHint")}
          icon={<Eye className="size-5" />}
          tone="warn"
          active={quick === "review"}
          onClick={() => toggleQuick("review")}
        />
        <StatCard
          label={t("stat.done24")}
          value={fmt.num(stats.done24)}
          hint={t("stat.done24Hint")}
          icon={<CheckCircle2 className="size-5" />}
          tone="good"
          active={quick === "done24"}
          onClick={() => toggleQuick("done24")}
        />
      </div>

      <div className="mt-4 flex flex-col gap-2 xl:flex-row xl:items-center">
        <SearchInput value={q} onChange={setQ} placeholder={t("search")} className="w-full xl:max-w-xs" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:flex">
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="xl:w-48" aria-label={t("common.type")}>
            <option value="all">{t("allTypes")}</option>
            {TASK_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {label("taskType", ty)}
              </option>
            ))}
          </Select>
          <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="xl:w-52" aria-label={t("common.assignee")}>
            <option value="all">{t("allAssignees")}</option>
            <option value="none">{t("common.unassigned")}</option>
            {assignees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className="col-span-2 sm:col-span-1 xl:w-40" aria-label={t("common.priority")}>
            <option value="all">{t("allPriorities")}</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {label("priority", p)}
              </option>
            ))}
          </Select>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="self-start xl:self-auto">
            {t("clearFilters")}
          </Button>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 xl:ml-auto">
          <span className="text-xs text-ink-3 tabular">{t("resultCount", { n: filtered.length })}</span>
          {view === "board" && (
            <span className="flex items-center gap-2">
              <span className="text-xs text-ink-3">{t("group.label")}</span>
              <Segmented
                value={group}
                onChange={setGroup}
                options={[
                  { value: "none", label: t("group.none") },
                  { value: "plant", label: t("group.plant") },
                  { value: "type", label: t("group.type") },
                ]}
              />
            </span>
          )}
          <Segmented
            value={view}
            onChange={setView}
            options={[
              {
                value: "board",
                label: (
                  <>
                    <KanbanSquare className="size-3.5" />
                    {t("view.board")}
                  </>
                ),
              },
              {
                value: "list",
                label: (
                  <>
                    <List className="size-3.5" />
                    {t("view.list")}
                  </>
                ),
              },
            ]}
          />
        </div>
      </div>

      <div className="mt-4">
        {view === "board" ? (
          <TaskBoard lanes={lanes} now={clock.now} doneAt={doneAt} flashId={flashId} onOpen={setOpenId} onMove={move} />
        ) : (
          <Card>
            <TaskList tasks={filtered} now={clock.now} onOpen={setOpenId} />
          </Card>
        )}
      </div>

      {openTask && <TaskDrawer key={openTask.id} task={openTask} now={clock.now} onClose={() => setOpenId(null)} onMove={move} onBlock={setBlockFor} />}
      {blockFor && <BlockReasonModal key={blockFor} taskId={blockFor} onClose={() => setBlockFor(null)} onConfirm={confirmBlock} />}
      {creating && <NewTaskModal onClose={() => setCreating(false)} onCreated={onCreated} />}
    </PageContainer>
  );
}
