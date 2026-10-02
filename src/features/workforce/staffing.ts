/**
 * Staffing & skill-coverage rules shared by the Workforce page and the
 * operator terminal. Pure functions over the dataset — no React.
 */
import { OP_CENTER } from "@/lib/data/catalog";
import { OP_LABELS } from "@/lib/data/labels";
import type { Employee, EmployeeRole, OperationType, PlantId, Product, ShiftId, WorkCenterType } from "@/lib/data/types";

export const SHIFTS: ShiftId[] = ["A", "B", "C"];

/** Roles that run machines (direct labour). */
export const DIRECT_ROLES: EmployeeRole[] = ["operator", "welder", "team_lead"];
/** Direct labour plus QC and warehouse — everyone who performs routing operations. */
export const SHOP_FLOOR_ROLES: EmployeeRole[] = ["operator", "welder", "team_lead", "qc_inspector", "warehouse"];

/** Planned machine utilisation per shift. */
export const UTILISATION = 0.9;
/**
 * Operators needed per running machine. Robot cells, lasers, saws and test
 * benches are semi-automatic, so on average one operator tends two machines.
 * Set to 1 for a strict one-operator-per-machine rule.
 */
export const OPERATORS_PER_MACHINE = 0.5;

/** Direct operators required per shift for a plant with `machineCount` machines. */
export function requiredDirect(machineCount: number) {
  return Math.ceil(machineCount * UTILISATION * OPERATORS_PER_MACHINE);
}

export const isAbsent = (e: Employee) => e.status === "leave" || e.status === "sick";

export const isCertifiedWelder = (e: Employee) => e.role === "welder" && e.certifications.some((c) => c.startsWith("EN ISO 9606"));

/** Canonical process order (laser → … → packing). */
const OP_ORDER = Object.keys(OP_LABELS) as OperationType[];

/** Operations that appear in the routings of a plant's products, in process order. */
export function plantOperations(products: Product[], plantId: PlantId): OperationType[] {
  const ops = new Set<OperationType>();
  for (const p of products) if (p.plantId === plantId) for (const r of p.routing) ops.add(r.operation);
  return OP_ORDER.filter((o) => ops.has(o));
}

/** Operations a work-center type can perform. */
export function opsForWorkCenter(type: WorkCenterType): OperationType[] {
  return OP_ORDER.filter((o) => OP_CENTER[o] === type);
}

/** Highest skill level an employee has across the given operations. */
export function bestLevel(e: Employee, ops: OperationType[]) {
  return ops.reduce((m, o) => Math.max(m, e.skills[o] ?? 0), 0);
}

/** People at level ≥ 3 (U/O) per shift and operation. */
export function coverageByShift(employees: Employee[], ops: OperationType[]) {
  const out = new Map<OperationType, Record<ShiftId, number>>();
  for (const op of ops) out.set(op, { A: 0, B: 0, C: 0 });
  for (const e of employees)
    for (const op of ops) if ((e.skills[op] ?? 0) >= 3) out.get(op)![e.shift] += 1;
  return out;
}

/** An operation is a coverage risk when any shift has fewer than 2 qualified people. */
export const MIN_QUALIFIED = 2;
export const isRisk = (c: Record<ShiftId, number>) => SHIFTS.some((s) => c[s] < MIN_QUALIFIED);

/** Whole years and remaining months between two ISO dates. */
export function tenure(hireDate: string, today: string) {
  const [y1, m1, d1] = hireDate.split("-").map(Number);
  const [y2, m2, d2] = today.split("-").map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  months = Math.max(0, months);
  return { years: Math.floor(months / 12), months: months % 12 };
}
