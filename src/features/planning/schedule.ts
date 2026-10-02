/**
 * Pure scheduling helpers for the planning board: bar extraction, machine
 * load over a horizon and late-order analysis with a one-click suggestion.
 */
import { DAY, localDateOf, MIN } from "@/lib/data/clock";
import type { Machine, Priority, WorkOrder, WorkOrderOperation } from "@/lib/data/types";

export interface Bar {
  key: string;
  wo: WorkOrder;
  op: WorkOrderOperation;
  start: number;
  end: number;
  late: boolean;
}

/** Operations intersecting [from, to), grouped by machine and sorted by start. */
export function collectBars(workOrders: WorkOrder[], from: number, to: number, lateIds: Set<string>): Map<string, Bar[]> {
  const out = new Map<string, Bar[]>();
  for (const wo of workOrders) {
    const late = lateIds.has(wo.id);
    for (const op of wo.operations) {
      const start = Date.parse(op.plannedStart);
      const end = Date.parse(op.plannedEnd);
      if (end <= from || start >= to) continue;
      let list = out.get(op.machineId);
      if (!list) {
        list = [];
        out.set(op.machineId, list);
      }
      list.push({ key: op.id, wo, op, start, end, late });
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.start - b.start);
  return out;
}

/** Planned minutes per machine intersecting [from, to). Finished operations are ignored. */
export function bookedMinutes(workOrders: WorkOrder[], from: number, to: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const wo of workOrders) {
    if (wo.status === "completed") continue;
    for (const op of wo.operations) {
      if (op.status === "done") continue;
      const s = Math.max(Date.parse(op.plannedStart), from);
      const e = Math.min(Date.parse(op.plannedEnd), to);
      if (e <= s) continue;
      out.set(op.machineId, (out.get(op.machineId) ?? 0) + (e - s) / MIN);
    }
  }
  return out;
}

/** Planned minutes per machine per local day, for `days` days from `windowStart` (all statuses). */
export function dailyMinutes(workOrders: WorkOrder[], windowStart: number, days: number): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const windowEnd = windowStart + days * DAY;
  for (const wo of workOrders) {
    for (const op of wo.operations) {
      const s0 = Date.parse(op.plannedStart);
      const e0 = Date.parse(op.plannedEnd);
      if (e0 <= windowStart || s0 >= windowEnd) continue;
      let arr = out.get(op.machineId);
      if (!arr) {
        arr = new Array(days).fill(0);
        out.set(op.machineId, arr);
      }
      const first = Math.max(0, Math.floor((s0 - windowStart) / DAY));
      const last = Math.min(days - 1, Math.floor((e0 - 1 - windowStart) / DAY));
      for (let d = first; d <= last; d++) {
        const ds = windowStart + d * DAY;
        const s = Math.max(s0, ds);
        const e = Math.min(e0, ds + DAY);
        if (e > s) arr[d] += (e - s) / MIN;
      }
    }
  }
  return out;
}

export type LoadTone = "good" | "warn" | "serious" | "critical";
export function loadTone(x: number): LoadTone {
  return x < 0.75 ? "good" : x < 0.9 ? "warn" : x < 1 ? "serious" : "critical";
}

export const isMovable = (op: WorkOrderOperation) => op.status === "pending" || op.status === "ready";
export const isUnavailable = (m: Machine) => m.status === "down" || m.status === "maintenance";

const ceil15 = (min: number) => Math.ceil(min / 15) * 15;
const floor15 = (min: number) => Math.floor(min / 15) * 15;

export type SuggestionKind = "move" | "expedite" | "overtime" | "priority" | "notify";

export interface Suggestion {
  kind: SuggestionKind;
  /** minutes the remaining chain is pulled forward (move / expedite / overtime) */
  pullMin: number;
  /** first not-yet-started operation; the reschedule anchor */
  firstOp?: WorkOrderOperation;
  /** operation to re-assign (move) */
  moveOp?: WorkOrderOperation;
  from?: Machine;
  to?: Machine;
  fromLoad?: number;
  toLoad?: number;
  /** projected planned end after applying */
  newEnd: number;
}

export interface LateRow {
  wo: WorkOrder;
  plannedEnd: number;
  delayMin: number;
  overdue: boolean;
  suggestion: Suggestion;
}

/** End of the due date in factory time. */
export const dueEndOf = (dueDate: string) => Date.parse(`${dueDate}T23:59:59+03:00`);

/**
 * Why is this order late, and what single change would help most?
 * - If an operation sits on a busy (or stopped) machine and a lighter sibling
 *   exists, move it there and pull the remaining chain forward.
 * - Otherwise expedite (raise priority / approve overtime) if there is slack.
 * - With no slack left, raise priority, then fall back to customer communication.
 */
export function analyzeLate(
  wo: WorkOrder,
  now: number,
  today: string,
  machineById: Map<string, Machine>,
  siblings: Map<string, Machine[]>,
  load7: Map<string, number>,
): LateRow {
  const plannedEnd = Date.parse(wo.plannedEnd);
  const dueEnd = dueEndOf(wo.dueDate);
  const overdue = today > wo.dueDate;
  const delayMin = Math.max(0, (Math.max(plannedEnd, now) - dueEnd) / MIN);

  const fi = wo.operations.findIndex(isMovable);
  const firstOp = fi >= 0 ? wo.operations[fi] : undefined;
  let maxPull = 0;
  if (firstOp) {
    const prev = fi > 0 ? wo.operations[fi - 1] : undefined;
    const earliest = Math.max(now + 15 * MIN, prev ? Date.parse(prev.plannedEnd) : 0);
    maxPull = Math.max(0, (Date.parse(firstOp.plannedStart) - earliest) / MIN);
  }
  const pullMin = overdue ? 0 : floor15(Math.min(ceil15(delayMin + 30), maxPull));

  const loadOf = (id: string) => load7.get(id) ?? 0;
  let move: Pick<Suggestion, "moveOp" | "from" | "to" | "fromLoad" | "toLoad"> | undefined;
  let bestScore = 0.1;
  if (fi >= 0) {
    for (const op of wo.operations.slice(fi)) {
      if (!isMovable(op)) continue;
      const cur = machineById.get(op.machineId);
      if (!cur) continue;
      const alts = (siblings.get(`${cur.plantId}:${cur.type}`) ?? []).filter((m) => m.id !== cur.id && !isUnavailable(m));
      if (!alts.length) continue;
      const best = alts.reduce((a, b) => (loadOf(a.id) <= loadOf(b.id) ? a : b));
      const score = loadOf(cur.id) - loadOf(best.id) + (isUnavailable(cur) ? 1 : 0);
      if (score >= bestScore) {
        bestScore = score;
        move = { moveOp: op, from: cur, to: best, fromLoad: loadOf(cur.id), toLoad: loadOf(best.id) };
      }
    }
  }

  const urgent = (wo.priority as Priority) === "urgent";
  let suggestion: Suggestion;
  if (!overdue && pullMin >= 15 && firstOp) {
    const newEnd = plannedEnd - pullMin * MIN;
    if (move) suggestion = { kind: "move", pullMin, firstOp, newEnd, ...move };
    else suggestion = { kind: urgent ? "overtime" : "expedite", pullMin, firstOp, newEnd };
  } else if (!urgent) suggestion = { kind: "priority", pullMin: 0, newEnd: plannedEnd };
  else suggestion = { kind: "notify", pullMin: 0, newEnd: plannedEnd };

  return { wo, plannedEnd, delayMin, overdue, suggestion };
}

/** Is the projected end (after a suggestion) still beyond the due date? */
export const stillLate = (end: number, dueDate: string) => localDateOf(end) > dueDate;
