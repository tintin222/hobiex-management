/**
 * Shop-floor mutations that the shared store does not cover. They compose
 * `actions.*` where possible and use `patchDb` for the rest.
 */
import { MIN } from "@/lib/data/clock";
import type { Machine, MaintenanceOrder } from "@/lib/data/types";
import { actions, getDb, patchDb } from "@/lib/store";

const round = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

function jitterSensors(sensors: Machine["sensors"]): Machine["sensors"] {
  return sensors.map((s) => (s.value === 0 ? s : { ...s, value: round(s.value * (1 + (Math.random() - 0.5) * 0.03), Number.isInteger(s.value) ? 0 : 2) }));
}

/**
 * Simulated PLC counters: a handful of running machines report 1–3 more good
 * parts (machine output and the running operation's quantity both move).
 * The selected machine's sensors drift slightly so the drawer feels live.
 */
export function tickProduction(selectedId?: string | null) {
  const db = getDb();
  const running = db.machines.filter((m) => m.status === "running");
  const inc = new Map<string, number>();
  if (running.length) {
    const n = Math.min(running.length, 2 + Math.floor(Math.random() * 4));
    for (let i = 0; i < n; i++) {
      const m = running[Math.floor(Math.random() * running.length)];
      inc.set(m.id, (inc.get(m.id) ?? 0) + 1 + Math.floor(Math.random() * 3));
    }
  }
  const opInc = new Map<string, number>();
  for (const m of running) if (inc.has(m.id) && m.currentOpId) opInc.set(m.currentOpId, inc.get(m.id)!);
  const jitterId = selectedId && db.machines.find((m) => m.id === selectedId && m.status === "running") ? selectedId : null;
  if (!inc.size && !jitterId) return;

  patchDb((d) => ({
    machines: d.machines.map((m) => {
      const add = inc.get(m.id);
      if (!add && m.id !== jitterId) return m;
      return { ...m, outputToday: m.outputToday + (add ?? 0), sensors: m.id === jitterId ? jitterSensors(m.sensors) : m.sensors };
    }),
    workOrders: opInc.size
      ? d.workOrders.map((wo) =>
          wo.operations.some((o) => opInc.has(o.id))
            ? { ...wo, operations: wo.operations.map((o) => (opInc.has(o.id) ? { ...o, qtyDone: Math.min(wo.qty, o.qtyDone + opInc.get(o.id)!) } : o)) }
            : wo,
        )
      : d.workOrders,
  }));
}

/** Close the open downtime events of a machine (those started in its current status). Returns minutes stopped. */
function closeOpenDowntime(machine: Machine): number {
  const since = Date.parse(machine.statusSince) - MIN;
  const now = Date.now();
  let longest = Math.max(0, Math.round((now - Date.parse(machine.statusSince)) / MIN));
  patchDb((d) => ({
    downtime: d.downtime.map((e) => {
      if (e.machineId !== machine.id || Date.parse(e.start) < since) return e;
      const minutes = Math.max(e.minutes, Math.round((now - Date.parse(e.start)) / MIN));
      longest = Math.max(longest, minutes);
      return { ...e, minutes };
    }),
  }));
  return longest;
}

/** Breakdown reported from the floor; returns the corrective maintenance order id. */
export function reportBreakdown(machineId: string, reason: string): string | undefined {
  actions.reportDowntime(machineId, reason);
  return getDb().maintenance.find((mo) => mo.machineId === machineId && mo.type === "corrective" && mo.status === "in_progress")?.id;
}

/** Down / maintenance → back in service: close open MOs and downtime, machine goes idle. */
export function markRepaired(machineId: string): { minutes: number; closed: string[] } {
  const db = getDb();
  const machine = db.machines.find((m) => m.id === machineId);
  if (!machine) return { minutes: 0, closed: [] };
  const wasDown = machine.status === "down";
  const minutes = closeOpenDowntime(machine);
  const open = db.maintenance.filter(
    (mo) => mo.machineId === machineId && (mo.status === "in_progress" || mo.status === "waiting_parts") && (wasDown ? mo.type === "corrective" : true),
  );
  for (const mo of open) actions.completeMaintenance(mo.id);
  actions.setMachineStatus(machineId, "idle");
  return { minutes, closed: open.map((mo) => mo.id) };
}

/** Take a machine down for its planned PM: pause its job, start (or open) the PM order. */
export function startPlannedMaintenance(machineId: string): string | undefined {
  const db = getDb();
  const machine = db.machines.find((m) => m.id === machineId);
  if (!machine) return undefined;
  if (machine.currentWoId && machine.currentOpId) {
    const { currentWoId, currentOpId } = machine;
    patchDb((d) => ({
      workOrders: d.workOrders.map((wo) =>
        wo.id === currentWoId ? { ...wo, operations: wo.operations.map((o) => (o.id === currentOpId && o.status === "running" ? { ...o, status: "paused" as const } : o)) } : wo,
      ),
    }));
  }
  let mo: MaintenanceOrder | undefined = db.maintenance.find(
    (x) => x.machineId === machineId && x.type === "preventive" && (x.status === "scheduled" || x.status === "overdue"),
  );
  if (mo) actions.updateMaintenance(mo.id, { status: "in_progress", scheduledDate: db.today });
  else {
    const tech = db.employees.find((e) => e.plantId === machine.plantId && e.role === "maintenance_tech");
    mo = actions.createMaintenance({
      machineId,
      type: "preventive",
      title: "Planned maintenance (started from shop floor)",
      titleTr: "Planlı bakım (atölyeden başlatıldı)",
      priority: "normal",
      technicianId: tech?.id ?? db.employees[0].id,
      plantId: machine.plantId,
      status: "in_progress",
    });
  }
  actions.setMachineStatus(machineId, "maintenance");
  const note = mo.title;
  patchDb((d) => ({
    downtime: [{ id: `DT-${Date.now()}`, machineId, start: new Date().toISOString(), minutes: 0, reason: "planned_maintenance" as const, note }, ...d.downtime],
  }));
  return mo.id;
}
