"use client";

import Link from "next/link";
import { CheckCircle2, PackageCheck, PackageX } from "lucide-react";
import { useFmt, useT, useTx } from "@/i18n";
import type { Product, WorkOrder } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { Badge, Card, CardHeader } from "@/components/ui";
import { messages } from "./messages";
import { MaterialStatusBadge } from "./ui";

/** BOM × order quantity against current stock (on hand − reserved). */
export function WoMaterials({ wo, product }: { wo: WorkOrder; product: Product }) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const lk = useLookups();
  const issued = wo.operations.some((o) => o.status !== "pending" && o.status !== "ready");
  const q = (v: number) => fmt.num(v, v < 10 ? 2 : v < 100 ? 1 : 0);

  return (
    <Card>
      <CardHeader
        title={t("mat.title")}
        subtitle={t("mat.subtitle", { qty: fmt.num(wo.qty) })}
        actions={wo.status !== "completed" && !issued ? <MaterialStatusBadge value={wo.materialStatus} long /> : undefined}
      />
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-y border-line text-left text-xs text-ink-3">
              <th className="h-9 pl-5 font-medium">{t("mat.col.material")}</th>
              <th className="px-3 text-right font-medium">{t("mat.col.required")}</th>
              <th className="px-3 text-right font-medium">{t("mat.col.onHand")}</th>
              <th className="px-3 text-right font-medium">{t("mat.col.available")}</th>
              <th className="pr-5 pl-3 font-medium">{t("common.status")}</th>
            </tr>
          </thead>
          <tbody>
            {product.bom.map((b) => {
              const m = lk.material.get(b.materialId);
              if (!m) return null;
              const required = b.qtyPerUnit * wo.qty;
              const available = m.onHand - m.reserved;
              const short = Math.max(0, required - available);
              return (
                <tr key={b.materialId} className="border-b border-line last:border-b-0">
                  <td className="max-w-72 py-2.5 pl-5">
                    <Link href={`/inventory?material=${m.id}`} className="font-medium text-brand tabular hover:underline">
                      {m.id}
                    </Link>
                    <div className="truncate text-xs text-ink-3" title={tx(m.name, m.nameTr)}>
                      {tx(m.name, m.nameTr)}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap tabular">
                    <span className="font-medium text-ink">{q(required)}</span> <span className="text-xs text-ink-3">{m.unit}</span>
                    <div className="text-[11px] text-ink-3">
                      {q(b.qtyPerUnit)} × {fmt.num(wo.qty)}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap text-ink-2 tabular">{q(m.onHand)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap tabular">
                    <span className={available < required && !issued && wo.status !== "completed" ? "font-medium text-critical-ink" : "text-ink-2"}>{q(available)}</span>
                  </td>
                  <td className="py-2.5 pr-5 pl-3">
                    {wo.status === "completed" ? (
                      <Badge icon={<CheckCircle2 className="size-3.5" />}>{t("mat.consumed")}</Badge>
                    ) : issued ? (
                      <Badge tone="good" icon={<PackageCheck className="size-3.5" />}>
                        {t("mat.issued")}
                      </Badge>
                    ) : short > 0 ? (
                      <Badge tone="critical" icon={<PackageX className="size-3.5" />}>
                        {t("mat.shortBy", { n: `${q(short)} ${m.unit}` })}
                      </Badge>
                    ) : (
                      <Badge tone="good" icon={<CheckCircle2 className="size-3.5" />}>
                        {t("mat.ok")}
                      </Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
