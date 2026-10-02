import type { WorkOrder, WorkOrderOperation, WorkOrderStatus } from "@/lib/data/types";

/** The operation the order is "at": running, paused, ready, else next pending. */
export function currentOp(wo: WorkOrder): WorkOrderOperation | undefined {
  return (
    wo.operations.find((o) => o.status === "running") ??
    wo.operations.find((o) => o.status === "paused") ??
    wo.operations.find((o) => o.status === "ready") ??
    wo.operations.find((o) => o.status === "pending")
  );
}

export function opsDone(wo: WorkOrder) {
  return wo.operations.filter((o) => o.status === "done").length;
}

/** Share of standard work content completed (running ops count pro rata by quantity). */
export function workProgress(wo: WorkOrder) {
  const total = wo.operations.reduce((s, o) => s + o.stdMinutes, 0) || 1;
  const done = wo.operations.reduce((s, o) => {
    if (o.status === "done") return s + o.stdMinutes;
    if (o.status === "running" || o.status === "paused") return s + o.stdMinutes * Math.min(1, (o.qtyDone + o.qtyScrap) / Math.max(1, wo.qty));
    return s;
  }, 0);
  return done / total;
}

/** Good units out of the last finished operation (finished goods so far). */
export function goodOutput(wo: WorkOrder) {
  if (wo.status === "completed") return wo.qtyDone;
  return wo.operations[wo.operations.length - 1].qtyDone;
}

export type WoView = "open" | "in_progress" | "released" | "planned" | "on_hold" | "late" | "completed";
export const WO_VIEWS: WoView[] = ["open", "in_progress", "released", "planned", "on_hold", "late", "completed"];

export function parseView(v: string | null): WoView {
  return WO_VIEWS.includes(v as WoView) ? (v as WoView) : "open";
}

export function inView(view: WoView, status: WorkOrderStatus, late: boolean) {
  switch (view) {
    case "open":
      return status !== "completed";
    case "in_progress":
      return status === "in_progress" || status === "quality_check";
    case "late":
      return status !== "completed" && late;
    default:
      return status === view;
  }
}

export const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
