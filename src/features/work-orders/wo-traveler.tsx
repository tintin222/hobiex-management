"use client";

import Image from "next/image";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import type { Product, WorkOrder } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { useClock } from "@/lib/store";
import { messages } from "./messages";

/**
 * Print-only shop traveler (hidden on screen). `window.print()` shows just
 * this sheet: the print rules hide everything that is not the traveler or one
 * of its ancestors, and force black-on-white regardless of theme.
 */
const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  html, body { background: white !important; }
  body *:not(:has(#wo-traveler)):not(#wo-traveler):not(#wo-traveler *) { display: none !important; }
  body *:has(#wo-traveler) {
    display: block !important; height: auto !important; min-height: 0 !important; max-width: none !important;
    overflow: visible !important; padding: 0 !important; margin: 0 !important; border: 0 !important;
    box-shadow: none !important; background: none !important;
  }
  #wo-traveler { display: block !important; color: black; font-size: 11px; }
  #wo-traveler * { border-color: rgb(0 0 0 / 0.35) !important; }
  #wo-traveler table { width: 100%; border-collapse: collapse; }
  #wo-traveler th, #wo-traveler td { border: 1px solid rgb(0 0 0 / 0.35); padding: 4px 6px; text-align: left; vertical-align: top; }
  #wo-traveler th { background: rgb(0 0 0 / 0.06) !important; font-weight: 600; }
  #wo-traveler tr { break-inside: avoid; }
}
`;

export function WoTraveler({ wo, product }: { wo: WorkOrder; product: Product }) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const clock = useClock();
  const lk = useLookups();
  const plant = lk.plant.get(wo.plantId);
  const customer = wo.customerId ? lk.customer.get(wo.customerId) : undefined;
  const q = (v: number) => fmt.num(v, v < 10 ? 2 : v < 100 ? 1 : 0);

  return (
    <div id="wo-traveler" className="hidden print:block">
      <style>{PRINT_CSS}</style>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 12 }}>
        <div>
          <Image src="/brand/logo.png" alt="Hobiex" width={150} height={30} loading="eager" />
          <div style={{ marginTop: 6, fontSize: 16, fontWeight: 700 }}>{t("tr.title")}</div>
          <div style={{ opacity: 0.7 }}>{t("tr.printed", { t: fmt.dateTime(clock.now) })}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 0.5 }}>{wo.id}</div>
          <div style={{ fontSize: 13 }}>
            {t("common.lot")}: <b>{wo.lotNo}</b>
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 18, letterSpacing: 2, marginTop: 2 }}>*{wo.lotNo}*</div>
        </div>
      </header>

      <table style={{ marginBottom: 12 }}>
        <tbody>
          <tr>
            <th>{t("common.product")}</th>
            <td colSpan={3}>
              <b>{product.sku}</b> · {product.name}
            </td>
          </tr>
          <tr>
            <th>{t("card.oemRef")}</th>
            <td>
              {product.oem} {product.model} · {product.oemRef}
            </td>
            <th>{t("card.drawing")}</th>
            <td>{product.drawingRev}</td>
          </tr>
          <tr>
            <th>{t("common.quantity")}</th>
            <td>
              <b>{fmt.num(wo.qty)}</b> {t("common.pcs")}
            </td>
            <th>{t("common.dueDate")}</th>
            <td>
              <b>{fmt.dateLong(wo.dueDate)}</b>
            </td>
          </tr>
          <tr>
            <th>{t("common.plant")}</th>
            <td>{plant ? `${plant.code} · ${tx(plant.name, plant.nameTr)}` : wo.plantId}</td>
            <th>{t("common.priority")}</th>
            <td>{label("priority", wo.priority)}</td>
          </tr>
          <tr>
            <th>{t("common.customer")}</th>
            <td>{customer ? `${customer.name} (${customer.countryCode})` : t("common.makeToStock")}</td>
            <th>{t("common.salesOrder")}</th>
            <td>{wo.salesOrderId ?? "—"}</td>
          </tr>
          <tr>
            <th>{t("card.planner")}</th>
            <td>{lk.employee.get(wo.plannerId)?.name ?? "—"}</td>
            <th>{t("card.plannedStart")}</th>
            <td>
              {fmt.dateTime(wo.plannedStart)} → {fmt.dateTime(wo.plannedEnd)}
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ marginBottom: 12 }}>
        <thead>
          <tr>
            <th>{t("ops.col.seq")}</th>
            <th>{t("ops.col.operation")}</th>
            <th>{t("ops.plan")}</th>
            <th>{t("tr.std")}</th>
            <th>{t("card.good")}</th>
            <th>{t("common.scrap")}</th>
            <th style={{ width: "24%" }}>{t("tr.signOff")}</th>
          </tr>
        </thead>
        <tbody>
          {wo.operations.map((op) => (
            <tr key={op.id} style={{ height: 30 }}>
              <td>{op.seq}</td>
              <td>
                <b>{label("op", op.operation)}</b>
                <div style={{ opacity: 0.7 }}>{op.machineId}</div>
              </td>
              <td>{fmt.dateTime(op.plannedStart)}</td>
              <td>{fmt.num(op.stdMinutes)}</td>
              <td>{op.status === "done" ? fmt.num(op.qtyDone) : ""}</td>
              <td>{op.status === "done" ? fmt.num(op.qtyScrap) : ""}</td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>

      <table style={{ marginBottom: 18 }}>
        <thead>
          <tr>
            <th>{t("mat.col.material")}</th>
            <th>{t("mat.col.required")}</th>
            <th style={{ width: "34%" }}>{t("tr.lotHeat")}</th>
          </tr>
        </thead>
        <tbody>
          {product.bom.map((b) => {
            const m = lk.material.get(b.materialId);
            return (
              <tr key={b.materialId} style={{ height: 26 }}>
                <td>
                  {b.materialId} · {m ? tx(m.name, m.nameTr) : ""}
                </td>
                <td>
                  {q(b.qtyPerUnit * wo.qty)} {m?.unit}
                </td>
                <td />
              </tr>
            );
          })}
        </tbody>
      </table>

      <table>
        <tbody>
          <tr style={{ height: 48 }}>
            <th style={{ width: "18%" }}>{t("tr.qcRelease")}</th>
            <td />
            <th style={{ width: "18%" }}>{t("tr.supervisor")}</th>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
