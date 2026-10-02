import type { PlantId, Product, SalesOrder, SalesOrderStatus, WorkOrder } from "@/lib/data/types";

export const SO_FLOW: SalesOrderStatus[] = ["new", "confirmed", "in_production", "ready", "shipped", "delivered"];

/** Orders that still have to be produced and/or shipped. */
export const isOpenForProduction = (so: SalesOrder) => so.status !== "shipped" && so.status !== "delivered";

/** Fraction of a work order's standard work content that is done (0..1). */
export function woFraction(wo: WorkOrder): number {
  if (wo.status === "completed") return 1;
  const total = wo.operations.reduce((s, o) => s + o.stdMinutes, 0);
  if (!total || wo.qty <= 0) return 0;
  const done = wo.operations.reduce((s, o) => s + o.stdMinutes * (o.status === "done" ? 1 : Math.min(1, o.qtyDone / wo.qty)), 0);
  return Math.min(0.99, done / total);
}

/** Finished (packed) units of a work order so far. */
export function woFinished(wo: WorkOrder): number {
  if (wo.status === "completed") return wo.qtyDone;
  return wo.operations[wo.operations.length - 1]?.qtyDone ?? 0;
}

/** The work order that produces a given order line (same index, else same product). */
export function lineWorkOrder(so: SalesOrder, index: number, woMap: Map<string, WorkOrder>): WorkOrder | undefined {
  const line = so.lines[index];
  const byIndex = so.workOrderIds[index] ? woMap.get(so.workOrderIds[index]) : undefined;
  if (byIndex && byIndex.productId === line.productId) return byIndex;
  for (const id of so.workOrderIds) {
    const wo = woMap.get(id);
    if (wo && wo.productId === line.productId) return wo;
  }
  return undefined;
}

export interface LineProgress {
  fraction: number;
  produced: number;
  wo?: WorkOrder;
}

export function lineProgress(so: SalesOrder, index: number, woMap: Map<string, WorkOrder>): LineProgress {
  const line = so.lines[index];
  const wo = lineWorkOrder(so, index, woMap);
  if (so.status === "ready" || so.status === "shipped" || so.status === "delivered") {
    return { fraction: 1, produced: wo ? woFinished(wo) : line.qtyProduced || line.qty, wo };
  }
  if (!wo) return { fraction: line.qtyProduced / Math.max(1, line.qty), produced: line.qtyProduced };
  return { fraction: woFraction(wo), produced: woFinished(wo), wo };
}

/** Quantity-weighted production progress of a whole order (0..1). */
export function orderProgress(so: SalesOrder, woMap: Map<string, WorkOrder>): number {
  const total = so.lines.reduce((s, l) => s + l.qty, 0);
  if (!total) return 0;
  return so.lines.reduce((s, l, i) => s + l.qty * lineProgress(so, i, woMap).fraction, 0) / total;
}

/** Units still to be produced for an order. */
export function orderBacklogUnits(so: SalesOrder, woMap: Map<string, WorkOrder>): number {
  if (!isOpenForProduction(so) || so.status === "ready") return 0;
  return so.lines.reduce((s, l, i) => s + Math.max(0, l.qty - lineProgress(so, i, woMap).produced), 0);
}

export function orderInPlant(so: SalesOrder, plant: PlantId | "all", productMap: Map<string, Product>): boolean {
  return plant === "all" || so.lines.some((l) => productMap.get(l.productId)?.plantId === plant);
}
