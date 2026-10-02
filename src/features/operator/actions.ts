"use client";

/**
 * Operator-terminal mutations. They wrap the shared store actions and add
 * what the shop floor needs on top: a run-time clock per operation that
 * stops while paused, bilingual breakdown titles, andon calls routed to the
 * right person on shift, and scrap → NCR.
 */
import { create } from "zustand";
import { MIN } from "@/lib/data/clock";
import type { DefectType, Employee, EmployeeRole, MaintenanceOrder, Ncr, PlantId, Task, WorkOrderOperation } from "@/lib/data/types";
import { actions, getDb, patchDb } from "@/lib/store";
import type { L } from "./instructions";

// ───────────────────────────── Run-time clock ─────────────────────────────
interface RunRecord {
  /** run time accumulated before the last resume */
  accMs: number;
  /** epoch ms of the last start/resume; null while stopped */
  resumedAt: number | null;
}

export const useRunLog = create<{ log: Record<string, RunRecord> }>(() => ({ log: {} }));

/** Productive run time of an operation (pauses excluded once tracked here). */
export function runMs(op: WorkOrderOperation, rec: RunRecord | undefined, now: number): number {
  if (rec) return rec.accMs + (rec.resumedAt !== null && op.status === "running" ? Math.max(0, now - rec.resumedAt) : 0);
  if (!op.actualStart) return 0;
  if (op.status === "running") return Math.max(0, now - Date.parse(op.actualStart));
  return op.actualMinutes * MIN;
}

function findOp(woId: string, opId: string) {
  return getDb()
    .workOrders.find((w) => w.id === woId)
    ?.operations.find((o) => o.id === opId);
}

function setRecord(opId: string, rec: RunRecord) {
  useRunLog.setState((s) => ({ log: { ...s.log, [opId]: rec } }));
}

/** Stop the run clock and return the accumulated run time. */
function freeze(woId: string, opId: string): number {
  const op = findOp(woId, opId);
  if (!op) return 0;
  const ms = runMs(op, useRunLog.getState().log[opId], Date.now());
  setRecord(opId, { accMs: ms, resumedAt: null });
  return ms;
}

function setActualMinutes(woId: string, opId: string, minutes: number) {
  patchDb((db) => ({
    workOrders: db.workOrders.map((w) => (w.id === woId ? { ...w, operations: w.operations.map((o) => (o.id === opId ? { ...o, actualMinutes: minutes } : o)) } : w)),
  }));
}

// ───────────────────────────── People on shift ─────────────────────────────
/** Best person of a role for a call: same plant, on shift now, same shift as the caller. */
export function pickOnShift(plantId: PlantId, role: EmployeeRole, shift?: Employee["shift"]): Employee | undefined {
  const pool = getDb().employees.filter((e) => e.plantId === plantId && e.role === role);
  return (
    pool.find((e) => e.status === "on_shift" && (!shift || e.shift === shift)) ??
    pool.find((e) => e.status === "on_shift") ??
    pool.find((e) => !shift || e.shift === shift) ??
    pool[0]
  );
}

export type CallKind = "team_lead" | "maintenance" | "material";

export interface CallContext {
  operator: Employee;
  machineId: string;
  woId?: string;
  sku?: string;
  opLabel?: L;
}

// ───────────────────────────── Actions ─────────────────────────────
export const terminal = {
  start(woId: string, opId: string, operatorId: string) {
    const op = findOp(woId, opId);
    const now = Date.now();
    const acc = op ? runMs(op, useRunLog.getState().log[opId], now) : 0;
    actions.startOperation(woId, opId, operatorId);
    setRecord(opId, { accMs: acc, resumedAt: now });
  },

  pause(woId: string, opId: string) {
    const ms = freeze(woId, opId);
    actions.pauseOperation(woId, opId);
    setActualMinutes(woId, opId, Math.round(ms / MIN));
  },

  /** Book good parts; returns the booking time. */
  reportGood(woId: string, opId: string, qty: number): number {
    if (qty > 0) actions.reportQuantity(woId, opId, qty, 0);
    return Date.now();
  },

  /** Book scrap; optionally raise an NCR for quality. */
  reportScrap(input: { woId: string; opId: string; qty: number; defect: DefectType; defectLabel: L; openNcr: boolean; productId: string; sku: string; plantId: PlantId }): Ncr | undefined {
    actions.reportQuantity(input.woId, input.opId, 0, input.qty);
    if (!input.openNcr) return undefined;
    const owner = pickOnShift(input.plantId, "qc_inspector") ?? pickOnShift(input.plantId, "supervisor");
    const severe = input.defect === "weld_crack" || input.defect === "leak" || input.qty >= 20;
    return actions.createNcr({
      title: `${input.defectLabel.en} — ${input.sku} (${input.qty} pcs)`,
      titleTr: `${input.defectLabel.tr} — ${input.sku} (${input.qty} adet)`,
      defectType: input.defect,
      severity: severe ? "major" : "minor",
      productId: input.productId,
      workOrderId: input.woId,
      qtyAffected: input.qty,
      source: "internal",
      ownerId: owner?.id ?? getDb().employees[0].id,
      plantId: input.plantId,
    });
  },

  complete(woId: string, opId: string) {
    const ms = freeze(woId, opId);
    actions.completeOperation(woId, opId);
    setActualMinutes(woId, opId, Math.max(1, Math.round(ms / MIN)));
  },

  /** Stop the machine, open a corrective maintenance order and log downtime. */
  reportBreakdown(machineId: string, reason: L, operatorId: string): MaintenanceOrder | undefined {
    const m = getDb().machines.find((x) => x.id === machineId);
    const cur = m?.currentWoId && m.currentOpId ? findOp(m.currentWoId, m.currentOpId) : undefined;
    const running = cur?.status === "running" ? { woId: m!.currentWoId!, opId: cur.id } : undefined;
    const ms = running ? freeze(running.woId, running.opId) : 0;
    actions.reportDowntime(machineId, reason.en, operatorId);
    if (running) setActualMinutes(running.woId, running.opId, Math.round(ms / MIN));
    // reportDowntime pauses the machine's current op; one that was only being set up never started
    if (cur && (cur.status === "ready" || cur.status === "pending")) {
      const prev = cur.status;
      patchDb((db) => ({
        workOrders: db.workOrders.map((w) => (w.id === m!.currentWoId ? { ...w, operations: w.operations.map((o) => (o.id === cur.id ? { ...o, status: prev } : o)) } : w)),
      }));
    }
    patchDb((db) => ({ machines: db.machines.map((x) => (x.id === machineId ? { ...x, downReasonTr: reason.tr } : x)) }));
    const mo = getDb().maintenance.find((x) => x.machineId === machineId && x.type === "corrective" && x.title === reason.en && x.status !== "completed");
    if (mo) actions.updateMaintenance(mo.id, { titleTr: reason.tr });
    return mo;
  },

  /** Maintenance signs the machine back to production from the terminal. */
  releaseMachine(machineId: string) {
    const db = getDb();
    const open = db.maintenance.filter((x) => x.machineId === machineId && x.type === "corrective" && x.status !== "completed");
    for (const mo of open) actions.completeMaintenance(mo.id);
    const m = getDb().machines.find((x) => x.id === machineId);
    if (m && (m.status === "down" || m.status === "maintenance")) actions.setMachineStatus(machineId, "idle");
    const now = Date.now();
    patchDb((d) => ({
      downtime: d.downtime.map((ev) => (ev.machineId === machineId && ev.minutes === 0 ? { ...ev, minutes: Math.max(1, Math.round((now - Date.parse(ev.start)) / MIN)) } : ev)),
    }));
  },

  /** Andon call → task for the responsible person on shift. */
  call(kind: CallKind, ctx: CallContext): { task: Task; assignee?: Employee } {
    const { operator, machineId, woId, sku, opLabel } = ctx;
    const role: EmployeeRole = kind === "team_lead" ? "team_lead" : kind === "maintenance" ? "maintenance_tech" : "warehouse";
    const assignee = pickOnShift(operator.plantId, role, operator.shift);
    const job = woId ? ` · ${woId}${opLabel ? ` / ${opLabel.en}` : ""}` : "";
    const jobTr = woId ? ` · ${woId}${opLabel ? ` / ${opLabel.tr}` : ""}` : "";
    const due = (min: number) => new Date(Date.now() + min * MIN).toISOString();
    const base = {
      plantId: operator.plantId,
      machineId,
      workOrderId: woId,
      assigneeId: assignee?.id,
      reporterId: operator.id,
      estimateHours: 0.5,
      description: `Raised from the operator terminal by ${operator.name} (${operator.id}).`,
    };
    const task =
      kind === "team_lead"
        ? actions.createTask({
            ...base,
            type: "production",
            priority: "urgent",
            title: `Andon: team lead needed at ${machineId}${job}`,
            titleTr: `Andon: ${machineId} başına takım lideri çağrıldı${jobTr}`,
            dueAt: due(15),
            tags: ["andon"],
          })
        : kind === "maintenance"
          ? actions.createTask({
              ...base,
              type: "maintenance",
              priority: "high",
              title: `Andon: maintenance check at ${machineId}`,
              titleTr: `Andon: ${machineId} için bakım kontrolü`,
              dueAt: due(30),
              tags: ["andon", "TPM"],
            })
          : actions.createTask({
              ...base,
              type: "material",
              priority: "high",
              title: `Material request at ${machineId}${sku ? ` — ${sku}` : ""}${woId ? ` (${woId})` : ""}`,
              titleTr: `${machineId} malzeme talebi${sku ? ` — ${sku}` : ""}${woId ? ` (${woId})` : ""}`,
              dueAt: due(45),
              tags: ["andon", "kitting"],
            });
    return { task, assignee };
  },
};
