"use client";

/**
 * Work-order mutations that go beyond the shared store actions: creating a
 * make-to-stock order with a forward-scheduled routing, plus thin wrappers
 * around release / hold / resume / priority that also record the step in a
 * session activity log shown on the detail page.
 */
import { create } from "zustand";
import { HOUR, localDateOf, MIN } from "@/lib/data/clock";
import type { Dataset, Material, Priority, Product, WorkOrder, WorkOrderOperation } from "@/lib/data/types";
import { actions, getDb, patchDb } from "@/lib/store";

// ───────────────────────────── Session activity log ─────────────────────────────

export type WoEventKind = "created" | "released" | "hold" | "resumed" | "priority";

export interface WoEvent {
  id: number;
  woId: string;
  kind: WoEventKind;
  at: number;
  detail?: string;
  /** dataset the event belongs to — "Reset demo data" starts a fresh log */
  dataset: string;
}

export const useWoLog = create<{ events: WoEvent[]; seq: number }>(() => ({ events: [], seq: 1 }));

function logEvent(e: Pick<WoEvent, "woId" | "kind" | "detail">) {
  const dataset = getDb().generatedAt;
  useWoLog.setState((s) => ({ seq: s.seq + 1, events: [...s.events, { ...e, id: s.seq, at: Date.now(), dataset }] }));
}

// ───────────────────────────── Scheduling ─────────────────────────────

export interface PlannedOp {
  seq: number;
  operation: WorkOrderOperation["operation"];
  machineId: string;
  plannedStart: number;
  plannedEnd: number;
  stdMinutes: number;
}

/**
 * Forward-schedule a product's routing from `startMs`: every step books the
 * least-loaded machine of its work-center type in the product's plant (same
 * approach as converting a B2B sales order).
 */
export function scheduleRouting(db: Dataset, product: Product, qty: number, startMs: number): PlannedOp[] {
  const busy = new Map<string, number>();
  for (const wo of db.workOrders)
    for (const op of wo.operations) {
      const e = Date.parse(op.plannedEnd);
      if (e > (busy.get(op.machineId) ?? 0)) busy.set(op.machineId, e);
    }
  let t = startMs;
  return product.routing.map((step) => {
    let candidates = db.machines.filter((m) => m.plantId === product.plantId && m.type === step.workCenterType);
    if (!candidates.length) candidates = db.machines.filter((m) => m.type === step.workCenterType);
    const m = candidates.reduce((a, b) => ((busy.get(a.id) ?? 0) <= (busy.get(b.id) ?? 0) ? a : b));
    const std = Math.round(step.setupMin + step.cycleMin * qty);
    const start = Math.max(t, busy.get(m.id) ?? 0);
    const end = start + std * 1.1 * MIN;
    busy.set(m.id, end);
    t = end + 20 * MIN;
    return { seq: step.seq, operation: step.operation, machineId: m.id, plannedStart: start, plannedEnd: end, stdMinutes: std };
  });
}

export interface MaterialNeed {
  material: Material;
  required: number;
  available: number;
  short: number;
}

/** BOM × qty against current stock (on hand − reserved). */
export function materialNeeds(db: Dataset, product: Product, qty: number): MaterialNeed[] {
  return product.bom.map((b) => {
    const material = db.materials.find((m) => m.id === b.materialId)!;
    const required = b.qtyPerUnit * qty;
    const available = material.onHand - material.reserved;
    return { material, required, available, short: Math.max(0, required - available) };
  });
}

export function materialStatusOf(needs: MaterialNeed[]): WorkOrder["materialStatus"] {
  if (needs.some((n) => n.short > 0 && n.available <= 0)) return "short";
  if (needs.some((n) => n.short > 0)) return "partial";
  return "available";
}

// ───────────────────────────── Actions ─────────────────────────────

export const woActions = {
  /** Create a released make-to-stock work order and schedule it from now + 2 h. */
  create(input: { productId: string; qty: number; priority: Priority; dueDate: string; notes?: string }): WorkOrder {
    const db = getDb();
    const product = db.products.find((p) => p.id === input.productId)!;
    const yy = db.today.slice(2, 4);
    const woNo = Math.max(...db.workOrders.map((w) => Number(w.id.split("-")[2]))) + 1;
    const id = `WO-${yy}-${woNo}`;
    const plan = scheduleRouting(db, product, input.qty, Date.now() + 2 * HOUR);
    const operations: WorkOrderOperation[] = plan.map((p, i) => ({
      id: `${id}-${p.seq}`,
      seq: p.seq,
      operation: p.operation,
      machineId: p.machineId,
      status: i === 0 ? "ready" : "pending",
      plannedStart: new Date(p.plannedStart).toISOString(),
      plannedEnd: new Date(p.plannedEnd).toISOString(),
      stdMinutes: p.stdMinutes,
      actualMinutes: 0,
      qtyDone: 0,
      qtyScrap: 0,
    }));
    const planner = db.employees.find((e) => e.plantId === product.plantId && e.role === "planner") ?? db.employees[0];
    const wo: WorkOrder = {
      id,
      productId: product.id,
      qty: input.qty,
      qtyDone: 0,
      qtyScrap: 0,
      plantId: product.plantId,
      status: "released",
      priority: input.priority,
      createdAt: new Date().toISOString(),
      plannedStart: operations[0].plannedStart,
      plannedEnd: operations[operations.length - 1].plannedEnd,
      dueDate: input.dueDate,
      operations,
      lotNo: `L${yy}${db.today.slice(5, 7)}-${String(woNo).slice(-4)}`,
      plannerId: planner.id,
      notes: input.notes,
      materialStatus: materialStatusOf(materialNeeds(db, product, input.qty)),
    };
    patchDb((d) => ({ workOrders: [...d.workOrders, wo] }));
    logEvent({ woId: id, kind: "created" });
    return wo;
  },

  release(id: string) {
    actions.setWorkOrderStatus(id, "released");
    logEvent({ woId: id, kind: "released" });
  },

  hold(id: string, reason: string) {
    actions.setWorkOrderStatus(id, "on_hold", reason);
    logEvent({ woId: id, kind: "hold", detail: reason });
  },

  /** Back to work: in progress if any operation has started, otherwise released. */
  resume(id: string) {
    const wo = getDb().workOrders.find((w) => w.id === id);
    if (!wo) return;
    const paused = wo.operations.find((o) => o.status === "paused");
    const started = wo.operations.some((o) => o.status === "done" || o.actualStart);
    actions.setWorkOrderStatus(id, started ? "in_progress" : "released");
    if (paused?.operation === "final_inspection") {
      patchDb((db) => ({ workOrders: db.workOrders.map((w) => (w.id === id ? { ...w, status: "quality_check" } : w)) }));
    }
    logEvent({ woId: id, kind: "resumed" });
  },

  setPriority(id: string, priority: Priority) {
    actions.setWorkOrderPriority(id, priority);
    logEvent({ woId: id, kind: "priority", detail: priority });
  },
};

/** Local calendar date (Istanbul) n days after `ms`. */
export function dateAfter(ms: number, days: number) {
  return localDateOf(ms + days * 24 * HOUR);
}
