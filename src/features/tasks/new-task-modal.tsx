"use client";

import { useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { useLabel, useT, useTx } from "@/i18n";
import { cn } from "@/lib/cn";
import { addDays } from "@/lib/data/clock";
import type { EmployeeRole, PlantId, Priority, Task, TaskType } from "@/lib/data/types";
import { useLookups, usePlantFilter } from "@/lib/hooks";
import { useClock, useDb } from "@/lib/store";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { taskActions } from "./actions";
import { messages } from "./messages";
import { DEFAULT_CHECKLIST, TASK_TYPES } from "./task-utils";

const PRIORITIES: Priority[] = ["urgent", "high", "normal", "low"];
const ROLE_ORDER: EmployeeRole[] = ["operator", "welder", "team_lead", "qc_inspector", "maintenance_tech", "warehouse", "planner", "supervisor"];
/** Who usually picks up each type of task — listed first in the assignee picker. */
const TYPE_ROLES: Record<TaskType, EmployeeRole[]> = {
  production: ["operator", "welder", "team_lead"],
  setup: ["team_lead", "operator", "welder"],
  quality: ["qc_inspector"],
  maintenance: ["maintenance_tech"],
  material: ["warehouse", "planner"],
  logistics: ["warehouse", "planner"],
  engineering: ["planner", "supervisor"],
};

/** Mount only while open so each opening starts from a clean form. */
export function NewTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: (task: Task) => void }) {
  const t = useT(messages);
  const tx = useTx();
  const label = useLabel();
  const clock = useClock();
  const lk = useLookups();
  const plantFilter = usePlantFilter();
  const plants = useDb((db) => db.plants);
  const employees = useDb((db) => db.employees);
  const workOrders = useDb((db) => db.workOrders);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TaskType>("production");
  const [priority, setPriority] = useState<Priority>("normal");
  const [plantId, setPlantId] = useState<PlantId>(plantFilter === "all" ? "P1" : plantFilter);
  const [assigneeId, setAssigneeId] = useState("");
  const [due, setDue] = useState(() => addDays(clock.today, 2));
  const [estimate, setEstimate] = useState("2");
  const [woId, setWoId] = useState("");
  const [touched, setTouched] = useState(false);

  const staff = useMemo(() => {
    const preferred = TYPE_ROLES[type];
    const order = [...preferred, ...ROLE_ORDER.filter((r) => !preferred.includes(r))];
    const inPlant = employees.filter((e) => e.plantId === plantId);
    return order.map((role) => ({ role, people: inPlant.filter((e) => e.role === role).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.people.length);
  }, [employees, plantId, type]);

  const openWos = useMemo(
    () => workOrders.filter((w) => w.plantId === plantId && w.status !== "completed").sort((a, b) => (a.dueDate === b.dueDate ? a.id.localeCompare(b.id) : a.dueDate < b.dueDate ? -1 : 1)),
    [workOrders, plantId],
  );

  const est = Number(estimate);
  const valid = title.trim().length > 0 && !!due && Number.isFinite(est) && est > 0;

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    const task = taskActions.create({
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      priority,
      plantId,
      assigneeId: assigneeId || undefined,
      dueAt: new Date(`${due}T17:00:00+03:00`).toISOString(),
      estimateHours: Math.round(est * 10) / 10,
      workOrderId: woId || undefined,
    });
    onCreated(task);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t("new.title")}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={submit} disabled={touched && !valid}>
            {t("new.create")}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label={t("new.taskTitle")} hint={touched && !title.trim() ? t("new.required") : undefined}>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("new.titlePh")}
            aria-invalid={touched && !title.trim()}
            className={cn(touched && !title.trim() && "border-critical focus:border-critical focus:ring-critical/20")}
          />
        </Field>
        <Field label={t("new.description")}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("common.type")}>
            <Select value={type} onChange={(e) => setType(e.target.value as TaskType)}>
              {TASK_TYPES.map((x) => (
                <option key={x} value={x}>
                  {label("taskType", x)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("common.priority")}>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {label("priority", p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("common.plant")}>
            <Select
              value={plantId}
              onChange={(e) => {
                const next = e.target.value as PlantId;
                setPlantId(next);
                if (assigneeId && lk.employee.get(assigneeId)?.plantId !== next) setAssigneeId("");
                if (woId && lk.workOrder.get(woId)?.plantId !== next) setWoId("");
              }}
            >
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {tx(p.name, p.nameTr).split("·")[1]?.trim()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("common.assignee")}>
            <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">{t("common.unassigned")}</option>
              {staff.map((g) => (
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
          <Field label={t("common.dueDate")}>
            <Input type="date" value={due} min={clock.today} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label={t("new.estimate")}>
            <Input type="number" min={0.5} step={0.5} inputMode="decimal" value={estimate} onChange={(e) => setEstimate(e.target.value)} />
          </Field>
        </div>
        <Field label={t("new.wo")}>
          <Select value={woId} onChange={(e) => setWoId(e.target.value)}>
            <option value="">{t("new.noWo")}</option>
            {openWos.map((w) => (
              <option key={w.id} value={w.id}>
                {w.id} · {lk.product.get(w.productId)?.sku} · {label("woStatus", w.status)}
              </option>
            ))}
          </Select>
        </Field>
        <p className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-3">
          <ListChecks className="size-4 shrink-0" />
          {t("new.checklistHint", { type: label("taskType", type), n: DEFAULT_CHECKLIST[type].length })}
        </p>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
