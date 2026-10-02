"use client";

/**
 * Client-side demo store. The synthetic dataset is generated once in the
 * browser (see ClientGate) and every interaction — dragging a task, starting
 * an operation on the operator terminal, converting a B2B order into work
 * orders — mutates it immutably so all screens stay in sync.
 *
 * Selector rule (zustand v5): selectors must return stable references, e.g.
 * `useDb((db) => db.workOrders)`. Derive filtered/sorted arrays with useMemo
 * in the component, never inside the selector.
 */
import { create } from "zustand";
import { type Clock, DAY, HOUR, localDateOf, makeClock, MIN } from "./data/clock";
import { generateDataset } from "./data/generate";
import type {
  Dataset,
  MachineStatus,
  MaintenanceOrder,
  Ncr,
  Priority,
  SalesOrder,
  Task,
  TaskStatus,
  WorkOrder,
  WorkOrderOperation,
  WorkOrderStatus,
} from "./data/types";

export interface Toast {
  id: number;
  title: string;
  description?: string;
  tone?: "good" | "warn" | "critical" | "info";
}

interface State {
  ready: boolean;
  clock: Clock | null;
  db: Dataset | null;
  /** id of the employee "logged in" on the operator terminal */
  operatorId: string | null;
  toasts: Toast[];
}

export const useStore = create<State>(() => ({
  ready: false,
  clock: null,
  db: null,
  operatorId: null,
  toasts: [],
}));

export function initStore() {
  if (useStore.getState().ready) return;
  const clock = makeClock();
  const db = generateDataset(clock);
  useStore.setState({ ready: true, clock, db });
}

/** Read from the dataset. Only valid below <ClientGate>. */
export function useDb<T>(selector: (db: Dataset) => T): T {
  return useStore((s) => selector(s.db as Dataset));
}

export function useClock(): Clock {
  return useStore((s) => s.clock as Clock);
}

export function getDb(): Dataset {
  return useStore.getState().db as Dataset;
}

function patchDb(fn: (db: Dataset) => Partial<Dataset>) {
  const db = getDb();
  useStore.setState({ db: { ...db, ...fn(db) } });
}

let toastSeq = 1;
export function toast(t: Omit<Toast, "id">) {
  const id = toastSeq++;
  useStore.setState((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
  setTimeout(() => useStore.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), 4200);
}
export function dismissToast(id: number) {
  useStore.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
}

const nowIso = () => new Date().toISOString();

function updateWo(id: string, fn: (wo: WorkOrder) => WorkOrder) {
  patchDb((db) => ({ workOrders: db.workOrders.map((w) => (w.id === id ? fn(w) : w)) }));
}

/** Recompute a work order's status from its operations. */
function deriveWoStatus(wo: WorkOrder): WorkOrderStatus {
  if (wo.status === "on_hold") return "on_hold";
  if (wo.operations.every((o) => o.status === "done")) return "completed";
  const active = wo.operations.find((o) => o.status === "running" || o.status === "paused");
  if (active?.operation === "final_inspection") return "quality_check";
  if (wo.operations.some((o) => o.status !== "pending" && o.status !== "ready")) return "in_progress";
  return wo.status === "planned" ? "planned" : "released";
}

export const actions = {
  // ── Tasks ──
  moveTask(id: string, status: TaskStatus) {
    patchDb((db) => ({
      tasks: db.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              blockedReason: status === "blocked" ? t.blockedReason ?? "Flagged from board" : undefined,
              checklist: status === "done" ? t.checklist.map((c) => ({ ...c, done: true })) : t.checklist,
            }
          : t,
      ),
    }));
  },
  updateTask(id: string, patch: Partial<Task>) {
    patchDb((db) => ({ tasks: db.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  },
  toggleChecklist(id: string, index: number) {
    patchDb((db) => ({
      tasks: db.tasks.map((t) =>
        t.id === id ? { ...t, checklist: t.checklist.map((c, i) => (i === index ? { ...c, done: !c.done } : c)) } : t,
      ),
    }));
  },
  addTaskComment(id: string, authorId: string, text: string) {
    patchDb((db) => ({
      tasks: db.tasks.map((t) =>
        t.id === id ? { ...t, comments: [...t.comments, { id: `c-${Date.now()}`, authorId, at: nowIso(), text }] } : t,
      ),
    }));
  },
  createTask(input: Pick<Task, "title" | "type" | "priority" | "plantId"> & Partial<Task>): Task {
    const db = getDb();
    const maxNo = Math.max(...db.tasks.map((t) => Number(t.id.split("-")[1])));
    const reporter = db.employees.find((e) => e.plantId === input.plantId && e.role === "supervisor") ?? db.employees[0];
    const task: Task = {
      id: `TSK-${maxNo + 1}`,
      titleTr: input.title,
      status: "todo",
      reporterId: reporter.id,
      createdAt: nowIso(),
      dueAt: new Date(Date.now() + 2 * DAY).toISOString(),
      estimateHours: 2,
      loggedHours: 0,
      checklist: [],
      comments: [],
      tags: [],
      ...input,
    };
    patchDb((d) => ({ tasks: [task, ...d.tasks] }));
    return task;
  },

  // ── Work orders ──
  setWorkOrderStatus(id: string, status: WorkOrderStatus, holdReason?: string) {
    updateWo(id, (wo) => {
      const ops = wo.operations.map((o) => {
        if (status === "on_hold" && o.status === "running") return { ...o, status: "paused" as const };
        if (status === "in_progress" && o.status === "paused") return { ...o, status: "running" as const };
        if (status === "released" && wo.status === "planned" && o.seq === wo.operations[0].seq) return { ...o, status: "ready" as const };
        return o;
      });
      return { ...wo, status, operations: ops, holdReason: status === "on_hold" ? holdReason ?? wo.holdReason ?? "Put on hold" : undefined };
    });
  },
  setWorkOrderPriority(id: string, priority: Priority) {
    updateWo(id, (wo) => ({ ...wo, priority }));
  },
  startOperation(woId: string, opId: string, operatorId: string) {
    const now = nowIso();
    updateWo(woId, (wo) => {
      const operations: WorkOrderOperation[] = wo.operations.map((o) =>
        o.id === opId ? { ...o, status: "running", actualStart: o.actualStart ?? now, operatorId } : o,
      );
      const next = { ...wo, operations, actualStart: wo.actualStart ?? now };
      return { ...next, status: deriveWoStatus({ ...next, status: wo.status === "on_hold" ? "in_progress" : wo.status }) };
    });
    const op = getDb().workOrders.find((w) => w.id === woId)!.operations.find((o) => o.id === opId)!;
    actions.setMachineStatus(op.machineId, "running", { woId, opId, operatorId });
  },
  pauseOperation(woId: string, opId: string) {
    updateWo(woId, (wo) => ({ ...wo, operations: wo.operations.map((o) => (o.id === opId ? { ...o, status: "paused" } : o)) }));
    const op = getDb().workOrders.find((w) => w.id === woId)!.operations.find((o) => o.id === opId)!;
    actions.setMachineStatus(op.machineId, "idle");
  },
  reportQuantity(woId: string, opId: string, good: number, scrap: number) {
    updateWo(woId, (wo) => {
      const operations = wo.operations.map((o) => (o.id === opId ? { ...o, qtyDone: o.qtyDone + good, qtyScrap: o.qtyScrap + scrap } : o));
      return { ...wo, operations, qtyScrap: wo.qtyScrap + scrap };
    });
    if (good > 0) {
      patchDb((db) => ({
        machines: db.machines.map((m) => {
          const op = db.workOrders.find((w) => w.id === woId)!.operations.find((o) => o.id === opId)!;
          return m.id === op.machineId ? { ...m, outputToday: m.outputToday + good } : m;
        }),
      }));
    }
  },
  completeOperation(woId: string, opId: string) {
    const now = nowIso();
    let machineId = "";
    updateWo(woId, (wo) => {
      const idx = wo.operations.findIndex((o) => o.id === opId);
      const operations: WorkOrderOperation[] = wo.operations.map((o, i) => {
        if (i === idx) {
          machineId = o.machineId;
          const start = Date.parse(o.actualStart ?? now);
          return { ...o, status: "done", actualEnd: now, actualMinutes: Math.max(1, Math.round((Date.now() - start) / MIN)) };
        }
        if (i === idx + 1 && o.status === "pending") return { ...o, status: "ready" };
        return o;
      });
      const last = operations[operations.length - 1];
      const next: WorkOrder = { ...wo, operations, status: wo.status === "on_hold" ? "in_progress" : wo.status };
      const status = deriveWoStatus(next);
      return {
        ...next,
        status,
        qtyDone: status === "completed" ? last.qtyDone : wo.qtyDone,
        actualEnd: status === "completed" ? now : undefined,
      };
    });
    if (machineId) actions.setMachineStatus(machineId, "idle");
  },
  rescheduleOperation(woId: string, opId: string, deltaMinutes: number) {
    updateWo(woId, (wo) => {
      const idx = wo.operations.findIndex((o) => o.id === opId);
      const shift = deltaMinutes * MIN;
      const operations = wo.operations.map((o, i) =>
        i >= idx && o.status !== "done"
          ? { ...o, plannedStart: new Date(Date.parse(o.plannedStart) + shift).toISOString(), plannedEnd: new Date(Date.parse(o.plannedEnd) + shift).toISOString() }
          : o,
      );
      return { ...wo, operations, plannedStart: operations[0].plannedStart, plannedEnd: operations[operations.length - 1].plannedEnd };
    });
  },
  moveOperationToMachine(woId: string, opId: string, machineId: string) {
    updateWo(woId, (wo) => ({ ...wo, operations: wo.operations.map((o) => (o.id === opId ? { ...o, machineId } : o)) }));
  },

  // ── Machines ──
  setMachineStatus(id: string, status: MachineStatus, ctx?: { woId?: string; opId?: string; operatorId?: string; reason?: string }) {
    patchDb((db) => ({
      machines: db.machines.map((m) =>
        m.id === id
          ? {
              ...m,
              status,
              statusSince: nowIso(),
              downReason: status === "down" ? ctx?.reason ?? m.downReason ?? "Reported from shop floor" : undefined,
              currentWoId: status === "running" || status === "setup" ? ctx?.woId ?? m.currentWoId : status === "down" ? m.currentWoId : undefined,
              currentOpId: status === "running" || status === "setup" ? ctx?.opId ?? m.currentOpId : status === "down" ? m.currentOpId : undefined,
              operatorId: ctx?.operatorId ?? (status === "running" || status === "setup" ? m.operatorId : undefined),
            }
          : m,
      ),
    }));
  },
  reportDowntime(machineId: string, reason: string, operatorId?: string) {
    actions.setMachineStatus(machineId, "down", { reason });
    const db = getDb();
    const m = db.machines.find((x) => x.id === machineId)!;
    if (m.currentWoId && m.currentOpId) {
      updateWo(m.currentWoId, (wo) => ({ ...wo, operations: wo.operations.map((o) => (o.id === m.currentOpId ? { ...o, status: "paused" } : o)) }));
    }
    const tech = db.employees.find((e) => e.plantId === m.plantId && e.role === "maintenance_tech");
    actions.createMaintenance({
      machineId,
      type: "corrective",
      title: reason,
      titleTr: reason,
      priority: "urgent",
      technicianId: tech?.id ?? db.employees[0].id,
      plantId: m.plantId,
      status: "in_progress",
    });
    patchDb((d) => ({
      downtime: [
        { id: `DT-${Date.now()}`, machineId, start: nowIso(), minutes: 0, reason: "breakdown", note: reason + (operatorId ? ` (${operatorId})` : "") },
        ...d.downtime,
      ],
    }));
  },

  // ── Maintenance ──
  updateMaintenance(id: string, patch: Partial<MaintenanceOrder>) {
    patchDb((db) => ({ maintenance: db.maintenance.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  },
  completeMaintenance(id: string) {
    const db = getDb();
    const mo = db.maintenance.find((m) => m.id === id)!;
    actions.updateMaintenance(id, {
      status: "completed",
      completedDate: db.today,
      checklist: mo.checklist.map((c) => ({ ...c, done: true })),
      downtimeHours: mo.downtimeHours || mo.estHours,
    });
    const machine = db.machines.find((m) => m.id === mo.machineId)!;
    if (machine.status === "down" || machine.status === "maintenance") actions.setMachineStatus(machine.id, "idle");
  },
  createMaintenance(input: Pick<MaintenanceOrder, "machineId" | "type" | "title" | "priority" | "technicianId" | "plantId"> & Partial<MaintenanceOrder>) {
    const db = getDb();
    const maxNo = Math.max(...db.maintenance.map((m) => Number(m.id.split("-")[2])));
    const mo: MaintenanceOrder = {
      id: `MO-${db.today.slice(2, 4)}-${String(maxNo + 1).padStart(4, "0")}`,
      titleTr: input.title,
      status: "scheduled",
      scheduledDate: db.today,
      estHours: 2,
      downtimeHours: 0,
      parts: [],
      costEur: 0,
      checklist: [
        { label: "Lock-out / tag-out", labelTr: "Kilitle / etiketle (LOTO)", done: false },
        { label: "Diagnose fault", labelTr: "Arızayı teşhis et", done: false },
        { label: "Repair / replace", labelTr: "Onar / değiştir", done: false },
        { label: "Test run & sign-off", labelTr: "Test çalıştırması ve onay", done: false },
      ],
      ...input,
    };
    patchDb((d) => ({ maintenance: [mo, ...d.maintenance] }));
    return mo;
  },

  // ── Quality ──
  updateNcr(id: string, patch: Partial<Ncr>) {
    patchDb((db) => ({ ncrs: db.ncrs.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  },
  createNcr(input: Pick<Ncr, "title" | "defectType" | "severity" | "productId" | "qtyAffected" | "source" | "ownerId" | "plantId"> & Partial<Ncr>) {
    const db = getDb();
    const maxNo = Math.max(...db.ncrs.map((n) => Number(n.id.split("-")[2])));
    const ncr: Ncr = {
      id: `NCR-${db.today.slice(2, 4)}-${String(maxNo + 1).padStart(4, "0")}`,
      titleTr: input.title,
      status: "open",
      disposition: "pending",
      openedAt: db.today,
      targetDate: localDateOf(Date.now() + (input.severity === "critical" ? 10 : 30) * DAY),
      costEur: 0,
      method: input.severity === "minor" ? "5 Why" : "8D",
      ...input,
    };
    patchDb((d) => ({ ncrs: [ncr, ...d.ncrs] }));
    return ncr;
  },

  // ── Inventory ──
  adjustStock(materialId: string, delta: number, type: "receipt" | "issue" | "adjustment", ref: string, userId: string) {
    patchDb((db) => ({
      materials: db.materials.map((m) =>
        m.id === materialId ? { ...m, onHand: Math.max(0, m.onHand + delta), onOrder: type === "receipt" ? Math.max(0, m.onOrder - delta) : m.onOrder } : m,
      ),
      stockMovements: [{ id: `SM-${Date.now()}`, materialId, type, qty: delta, at: nowIso(), ref, userId }, ...db.stockMovements],
    }));
  },

  // ── Sales orders (B2B portal → production) ──
  convertSalesOrder(soId: string): string[] {
    const db = getDb();
    const so = db.salesOrders.find((s) => s.id === soId);
    if (!so || so.status !== "new") return [];
    const yy = db.today.slice(2, 4);
    let woNo = Math.max(...db.workOrders.map((w) => Number(w.id.split("-")[2]))) + 1;
    const created: WorkOrder[] = [];
    const busy = new Map<string, number>();
    for (const wo of db.workOrders)
      for (const op of wo.operations) {
        const e = Date.parse(op.plannedEnd);
        if (e > (busy.get(op.machineId) ?? 0)) busy.set(op.machineId, e);
      }
    for (const line of so.lines) {
      const product = db.products.find((p) => p.id === line.productId)!;
      const id = `WO-${yy}-${woNo++}`;
      let t = Date.now() + 2 * HOUR;
      const operations: WorkOrderOperation[] = product.routing.map((step) => {
        const candidates = db.machines.filter((m) => m.plantId === product.plantId && m.type === step.workCenterType);
        const m = candidates.reduce((a, b) => ((busy.get(a.id) ?? 0) <= (busy.get(b.id) ?? 0) ? a : b));
        const std = Math.round(step.setupMin + step.cycleMin * line.qty);
        const start = Math.max(t, busy.get(m.id) ?? 0);
        const end = start + std * 1.1 * MIN;
        busy.set(m.id, end);
        t = end + 20 * MIN;
        return {
          id: `${id}-${step.seq}`,
          seq: step.seq,
          operation: step.operation,
          machineId: m.id,
          status: "pending",
          plannedStart: new Date(start).toISOString(),
          plannedEnd: new Date(end).toISOString(),
          stdMinutes: std,
          actualMinutes: 0,
          qtyDone: 0,
          qtyScrap: 0,
        };
      });
      operations[0].status = "ready";
      const planner = db.employees.find((e) => e.plantId === product.plantId && e.role === "planner")!;
      created.push({
        id,
        productId: product.id,
        qty: line.qty,
        qtyDone: 0,
        qtyScrap: 0,
        salesOrderId: so.id,
        customerId: so.customerId,
        plantId: product.plantId,
        status: "released",
        priority: so.priority,
        createdAt: nowIso(),
        plannedStart: operations[0].plannedStart,
        plannedEnd: operations[operations.length - 1].plannedEnd,
        dueDate: so.promisedDate,
        operations,
        lotNo: `L${yy}${db.today.slice(5, 7)}-${String(woNo).slice(-4)}`,
        plannerId: planner.id,
        materialStatus: product.bom.some((b) => {
          const m = db.materials.find((x) => x.id === b.materialId)!;
          return m.onHand - m.reserved < b.qtyPerUnit * line.qty;
        })
          ? "partial"
          : "available",
      });
    }
    const latest = created.reduce((a, w) => (w.plannedEnd > a ? w.plannedEnd : a), "");
    const promised = localDateOf(Date.parse(latest) + DAY);
    patchDb((d) => ({
      workOrders: [...d.workOrders, ...created],
      salesOrders: d.salesOrders.map((s): SalesOrder =>
        s.id === soId ? { ...s, status: "confirmed", workOrderIds: created.map((w) => w.id), promisedDate: promised > s.promisedDate ? promised : s.promisedDate } : s,
      ),
    }));
    return created.map((w) => w.id);
  },

  // ── Session ──
  setOperator(id: string | null) {
    useStore.setState({ operatorId: id });
  },
  resetDemo() {
    const clock = makeClock();
    useStore.setState({ clock, db: generateDataset(clock), operatorId: null });
  },
};
