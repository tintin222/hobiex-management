/**
 * Feature-local inventory mutations. Stock quantities and movements go
 * through the shared `actions.adjustStock`; lot bookkeeping and purchase
 * requests are layered on top here.
 */
import { DAY } from "@/lib/data/clock";
import type { MaterialLot, PlantId, Priority, Task } from "@/lib/data/types";
import { actions, getDb, patchDb } from "@/lib/store";

/** Warehouse user that posts movements from the office UI. */
export function warehouseUserId(plantId: PlantId = "P1"): string {
  const db = getDb();
  return (db.employees.find((e) => e.role === "warehouse" && e.plantId === plantId) ?? db.employees.find((e) => e.role === "warehouse") ?? db.employees[0]).id;
}

/** Post a goods receipt: stock + movement (shared action) and a new lot on the material. */
export function receiveGoods(input: { materialId: string; qty: number; poRef: string; lotNo: string; heatNo?: string; certificate: string; userId: string }) {
  const { materialId, qty, poRef, lotNo, heatNo, certificate, userId } = input;
  if (!(qty > 0)) return;
  actions.adjustStock(materialId, qty, "receipt", poRef, userId);
  const lot: MaterialLot = { lotNo, heatNo: heatNo || undefined, qty, receivedAt: getDb().today, certificate };
  patchDb((db) => ({
    materials: db.materials.map((m) => (m.id === materialId ? { ...m, lots: [lot, ...m.lots] } : m)),
  }));
}

/**
 * Cycle count: post the difference between counted and system quantity as an
 * adjustment and true-up the newest lot so lot totals keep matching on-hand.
 * Returns the posted delta (0 = nothing posted).
 */
export function postCycleCount(materialId: string, counted: number, userId: string): number {
  const mat = getDb().materials.find((m) => m.id === materialId);
  if (!mat || !(counted >= 0)) return 0;
  const delta = Math.round((counted - mat.onHand) * 100) / 100;
  if (delta === 0) return 0;
  actions.adjustStock(materialId, delta, "adjustment", "Cycle count", userId);
  patchDb((db) => ({
    materials: db.materials.map((m) => {
      if (m.id !== materialId) return m;
      let rest = delta;
      const lots = m.lots.map((l) => {
        if (rest === 0) return l;
        const next = Math.max(0, l.qty + rest);
        rest -= next - l.qty;
        return { ...l, qty: next };
      });
      return { ...m, reserved: Math.min(m.reserved, m.onHand), lots: lots.filter((l) => l.qty > 0) };
    }),
  }));
  return delta;
}

/** Create a purchase request as a "material" task on the task board. */
export function createPurchaseRequest(input: { materialId: string; qty: number; unitLabel: { en: string; tr: string }; plantId: PlantId; priority: Priority; needBy: number }): Task | undefined {
  const db = getDb();
  const mat = db.materials.find((m) => m.id === input.materialId);
  if (!mat || !(input.qty > 0)) return undefined;
  const planner = db.employees.find((e) => e.plantId === input.plantId && e.role === "planner");
  const qtyEn = `${input.qty.toLocaleString("en-GB")} ${input.unitLabel.en}`;
  const qtyTr = `${input.qty.toLocaleString("tr-TR")} ${input.unitLabel.tr}`;
  return actions.createTask({
    title: `Purchase request: ${mat.code} ${mat.name} — ${qtyEn}`,
    titleTr: `Satın alma talebi: ${mat.code} ${mat.nameTr} — ${qtyTr}`,
    description: `Supplier: ${mat.supplier} · lead time ${mat.leadTimeDays} d · est. €${Math.round(input.qty * mat.unitCostEur).toLocaleString("en-GB")}`,
    type: "material",
    priority: input.priority,
    plantId: input.plantId,
    assigneeId: planner?.id,
    dueAt: new Date(Math.min(input.needBy, Date.now() + 3 * DAY)).toISOString(),
    estimateHours: 1,
    tags: [mat.code, "purchasing"],
    checklist: [
      { label: "Request quotation from supplier", labelTr: "Tedarikçiden teklif iste", done: false },
      { label: "Approve purchase order", labelTr: "Satın alma siparişini onayla", done: false },
      { label: "Confirm delivery date", labelTr: "Teslim tarihini teyit et", done: false },
    ],
  });
}
