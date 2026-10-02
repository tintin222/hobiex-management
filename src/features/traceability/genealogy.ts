/**
 * Lot genealogy over the synthetic dataset.
 *
 * The generator does not book material issues per work order, so lot
 * consumption is derived deterministically: a work order consumes, for each
 * BOM line, the latest lot of that material received on or before the WO
 * start date (or the oldest lot when none had arrived yet). Backward trace and
 * recall simulation both use this one rule so they always agree.
 */
import { addDays, localDateOf } from "@/lib/data/clock";
import type { Customer, Dataset, Inspection, Material, MaterialLot, Product, SalesOrder, WorkOrder } from "@/lib/data/types";

export const SERIAL_RE = /^(L\d{4}-\d{4})-(\d{1,5})$/;
const RECALL_WINDOW_DAYS = 45;

export const serialOf = (wo: WorkOrder, unit: number) => `${wo.lotNo}-${String(unit).padStart(4, "0")}`;
export const woStartDate = (wo: WorkOrder) => localDateOf(Date.parse(wo.actualStart ?? wo.plannedStart));

const sortedLots = new WeakMap<Material, MaterialLot[]>();
function lotsByReceipt(m: Material): MaterialLot[] {
  let v = sortedLots.get(m);
  if (!v) {
    v = [...m.lots].sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : a.receivedAt > b.receivedAt ? 1 : a.lotNo < b.lotNo ? -1 : 1));
    sortedLots.set(m, v);
  }
  return v;
}

/** Lot of `material` consumed by `wo` (latest received ≤ WO start, else oldest). */
export function consumedLot(material: Material, wo: WorkOrder): MaterialLot | undefined {
  const lots = lotsByReceipt(material);
  if (!lots.length) return undefined;
  const start = woStartDate(wo);
  let pick: MaterialLot | undefined;
  for (const l of lots) if (l.receivedAt <= start) pick = l;
  return pick ?? lots[0];
}

/** Incoming inspection that released a lot (same material, inspected on the receipt day). */
export function incomingInspectionFor(inspections: Inspection[], material: Material, lot: MaterialLot): Inspection | undefined {
  return inspections.find((i) => i.type === "incoming" && i.materialId === material.id && localDateOf(Date.parse(i.at)) === lot.receivedAt);
}

export interface LotHit {
  material: Material;
  lot: MaterialLot;
}

export type TraceResult =
  | { kind: "serial"; wo: WorkOrder; unit: number; serial: string }
  | { kind: "wo"; wo: WorkOrder }
  | { kind: "lot"; hits: LotHit[]; by: "heat" | "lot"; query: string }
  | { kind: "invalidSerial"; wo: WorkOrder; unit: number; serial: string; reason: "not_completed" | "out_of_range" }
  | { kind: "none"; query: string; suggestions: Suggestion[] };

export interface Suggestion {
  label: string;
  kind: "wo" | "lot" | "mlot" | "heat";
  q: string;
}

export function resolveQuery(db: Dataset, raw: string): TraceResult | null {
  const q = raw.trim().toUpperCase();
  if (!q) return null;

  const m = SERIAL_RE.exec(q);
  if (m) {
    const wo = db.workOrders.find((w) => w.lotNo === m[1]);
    if (wo) {
      const unit = Number(m[2]);
      const serial = serialOf(wo, unit);
      if (wo.status !== "completed") return { kind: "invalidSerial", wo, unit, serial, reason: "not_completed" };
      if (unit < 1 || unit > wo.qtyDone) return { kind: "invalidSerial", wo, unit, serial, reason: "out_of_range" };
      return { kind: "serial", wo, unit, serial };
    }
  }

  const wo = db.workOrders.find((w) => w.id === q || w.lotNo === q);
  if (wo) return { kind: "wo", wo };

  const hits: LotHit[] = [];
  let byHeat = false;
  for (const material of db.materials)
    for (const lot of material.lots)
      if (lot.lotNo === q || lot.heatNo === q) {
        hits.push({ material, lot });
        if (lot.heatNo === q) byHeat = true;
      }
  if (hits.length) return { kind: "lot", hits, by: byHeat ? "heat" : "lot", query: q };

  const suggestions: Suggestion[] = [];
  if (q.length >= 3) {
    for (const w of db.workOrders) {
      if (suggestions.length >= 4) break;
      if (w.id.includes(q)) suggestions.push({ label: w.id, kind: "wo", q: w.id });
      else if (w.lotNo.includes(q)) suggestions.push({ label: w.lotNo, kind: "lot", q: w.lotNo });
    }
    outer: for (const material of db.materials)
      for (const lot of material.lots) {
        if (suggestions.length >= 8) break outer;
        if (lot.heatNo?.includes(q)) suggestions.push({ label: lot.heatNo, kind: "heat", q: lot.heatNo });
        else if (lot.lotNo.includes(q)) suggestions.push({ label: lot.lotNo, kind: "mlot", q: lot.lotNo });
      }
  }
  return { kind: "none", query: raw.trim(), suggestions };
}

// ───────────────────────────── Recall simulation ─────────────────────────────
export type Bucket = "customer" | "fg" | "wip" | "planned";

export interface AffectedWo {
  wo: WorkOrder;
  product: Product;
  hit: LotHit;
  start: string;
  units: number;
  bucket: Bucket;
  so?: SalesOrder;
  customer?: Customer;
  unitPrice: number;
  value: number;
}

export interface AffectedCustomer {
  customer: Customer;
  units: number;
  value: number;
  wos: number;
  salesOrders: string[];
  shippedUnits: number;
  trackings: string[];
}

export interface Recall {
  rows: AffectedWo[];
  customers: AffectedCustomer[];
  countries: { code: string; name: string; nameTr: string; units: number }[];
  units: number; // produced or in production from this lot
  plannedUnits: number;
  value: number;
  byBucket: Record<Bucket, number>;
}

export function bucketOf(wo: WorkOrder, so?: SalesOrder): Bucket {
  if (wo.status === "completed") return so?.shipment ? "customer" : "fg";
  if (wo.status === "planned" || wo.status === "released") return "planned";
  return "wip";
}

export function recallFor(db: Dataset, hits: LotHit[]): Recall {
  const productById = new Map(db.products.map((p) => [p.id, p]));
  const soById = new Map(db.salesOrders.map((s) => [s.id, s]));
  const custById = new Map(db.customers.map((c) => [c.id, c]));
  const rows: AffectedWo[] = [];
  for (const wo of db.workOrders) {
    const product = productById.get(wo.productId);
    if (!product) continue;
    const start = woStartDate(wo);
    for (const hit of hits) {
      if (!product.bom.some((b) => b.materialId === hit.material.id)) continue;
      if (start > addDays(hit.lot.receivedAt, RECALL_WINDOW_DAYS)) continue;
      if (consumedLot(hit.material, wo)?.lotNo !== hit.lot.lotNo) continue;
      const so = wo.salesOrderId ? soById.get(wo.salesOrderId) : undefined;
      const customer = wo.customerId ? custById.get(wo.customerId) : undefined;
      const bucket = bucketOf(wo, so);
      const units = wo.status === "completed" ? wo.qtyDone : Math.max(0, wo.qty - wo.qtyScrap);
      const unitPrice = so?.lines.find((l) => l.productId === product.id)?.unitPriceEur ?? product.listPriceEur;
      rows.push({ wo, product, hit, start, units, bucket, so, customer, unitPrice, value: units * unitPrice });
      break;
    }
  }
  // containment order: what already left the plant first, then FG, WIP, planned
  const order: Record<Bucket, number> = { customer: 0, fg: 1, wip: 2, planned: 3 };
  rows.sort((a, b) => order[a.bucket] - order[b.bucket] || (a.start < b.start ? 1 : a.start > b.start ? -1 : 0));

  const byBucket: Record<Bucket, number> = { customer: 0, fg: 0, wip: 0, planned: 0 };
  const cust = new Map<string, AffectedCustomer>();
  const countries = new Map<string, { code: string; name: string; nameTr: string; units: number }>();
  let units = 0;
  let value = 0;
  for (const r of rows) {
    byBucket[r.bucket] += r.units;
    if (r.bucket === "planned") continue;
    units += r.units;
    value += r.value;
    if (!r.customer) continue;
    let c = cust.get(r.customer.id);
    if (!c) cust.set(r.customer.id, (c = { customer: r.customer, units: 0, value: 0, wos: 0, salesOrders: [], shippedUnits: 0, trackings: [] }));
    c.units += r.units;
    c.value += r.value;
    c.wos += 1;
    if (r.so && !c.salesOrders.includes(r.so.id)) c.salesOrders.push(r.so.id);
    if (r.bucket === "customer") c.shippedUnits += r.units;
    if (r.so?.shipment && !c.trackings.includes(r.so.shipment.tracking)) c.trackings.push(r.so.shipment.tracking);
    let k = countries.get(r.customer.countryCode);
    if (!k) countries.set(r.customer.countryCode, (k = { code: r.customer.countryCode, name: r.customer.country, nameTr: r.customer.countryTr, units: 0 }));
    k.units += r.units;
  }
  return {
    rows,
    customers: [...cust.values()].sort((a, b) => b.units - a.units),
    countries: [...countries.values()].sort((a, b) => b.units - a.units),
    units,
    plannedUnits: byBucket.planned,
    value,
    byBucket,
  };
}

/**
 * A heat number that makes a convincing recall demo: a handful of customers
 * and units spread across shipped, in-house and WIP stock.
 */
export function demoHeat(db: Dataset): LotHit | undefined {
  let best: { hit: LotHit; score: number } | undefined;
  for (const material of db.materials) {
    if (material.category !== "sheet_metal" && material.category !== "tube") continue;
    for (const lot of material.lots) {
      if (!lot.heatNo) continue;
      const r = recallFor(db, [{ material, lot }]);
      if (!r.rows.length) continue;
      const inRange = r.customers.length >= 4 && r.customers.length <= 12;
      const spread = r.byBucket.customer > 0 && r.byBucket.fg > 0 && r.byBucket.wip > 0;
      const score = (inRange ? 1e7 : 0) + (spread ? 1e6 : 0) + r.units;
      if (!best || score > best.score) best = { hit: { material, lot }, score };
    }
  }
  return best?.hit;
}

/** RFC 4180 CSV with a BOM so Excel opens Turkish characters correctly. */
export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
