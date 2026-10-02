/**
 * Maintenance mutations on top of the shared store actions.
 */
import { addDays } from "@/lib/data/clock";
import type { MaintenanceOrder } from "@/lib/data/types";
import { actions, getDb, patchDb } from "@/lib/store";
import { CHECKLISTS, LABOUR_EUR_PER_HOUR, partsCost } from "./lib";

const PM_INTERVAL_DAYS = 30;

/** Start work; an idle machine is flagged as "in maintenance" on the shop floor. */
export function startMaintenance(id: string) {
  const db = getDb();
  const mo = db.maintenance.find((m) => m.id === id);
  if (!mo) return;
  actions.updateMaintenance(id, { status: "in_progress" });
  const machine = db.machines.find((m) => m.id === mo.machineId);
  if (machine && machine.status === "idle") actions.setMachineStatus(machine.id, "maintenance");
}

export function waitForParts(id: string) {
  actions.updateMaintenance(id, { status: "waiting_parts" });
}

/** Complete the job, book labour cost and roll the PM cycle forward. */
export function completeMaintenanceOrder(id: string) {
  actions.completeMaintenance(id);
  const db = getDb();
  const mo = db.maintenance.find((m) => m.id === id);
  if (!mo) return;
  if (!mo.costEur) actions.updateMaintenance(id, { costEur: Math.round(partsCost(mo) + mo.downtimeHours * LABOUR_EUR_PER_HOUR) });
  if (mo.type === "preventive") {
    patchDb((d) => ({
      machines: d.machines.map((m) => (m.id === mo.machineId ? { ...m, lastPm: d.today, nextPm: addDays(d.today, PM_INTERVAL_DAYS) } : m)),
    }));
  }
}

export function toggleChecklistItem(id: string, index: number) {
  const mo = getDb().maintenance.find((m) => m.id === id);
  if (!mo) return;
  actions.updateMaintenance(id, { checklist: mo.checklist.map((c, i) => (i === index ? { ...c, done: !c.done } : c)) });
}

export function createWorkRequest(input: Pick<MaintenanceOrder, "machineId" | "type" | "title" | "titleTr" | "priority" | "technicianId" | "plantId" | "scheduledDate" | "estHours">) {
  return actions.createMaintenance({
    ...input,
    checklist: CHECKLISTS[input.type].map(([label, labelTr]) => ({ label, labelTr, done: false })),
  });
}
