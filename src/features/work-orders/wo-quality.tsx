"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ClipboardCheck } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { cn } from "@/lib/cn";
import type { Measurement, WorkOrder } from "@/lib/data/types";
import { useDb } from "@/lib/store";
import { Card, CardHeader, EmptyState, IdLink, PersonChip, SectionTitle, SeverityBadge, StatusBadge } from "@/components/ui";
import { messages } from "./messages";

const decimals = (...nums: number[]) => Math.min(3, Math.max(...nums.map((n) => (String(n).split(".")[1] ?? "").length)));
const outOfTol = (m: Measurement) => m.value < m.nominal - m.tolMinus - 1e-9 || m.value > m.nominal + m.tolPlus + 1e-9;

/** Inspections booked against the order (expandable measurements) and linked NCRs. */
export function WoQuality({ wo }: { wo: WorkOrder }) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const inspectionsAll = useDb((db) => db.inspections);
  const ncrsAll = useDb((db) => db.ncrs);
  const inspections = useMemo(() => inspectionsAll.filter((i) => i.workOrderId === wo.id).sort((a, b) => (a.at < b.at ? 1 : -1)), [inspectionsAll, wo.id]);
  const ncrs = useMemo(() => ncrsAll.filter((n) => n.workOrderId === wo.id), [ncrsAll, wo.id]);
  const [open, setOpen] = useState<string | null>(() => inspections.find((i) => i.result !== "pass")?.id ?? null);

  const tol = (m: Measurement, dp: number) => {
    if (m.tolMinus === m.tolPlus) return `±${fmt.num(m.tolPlus, dp)}`;
    if (m.tolMinus === 0) return `+${fmt.num(m.tolPlus, dp)}`;
    if (m.tolPlus === 0) return `−${fmt.num(m.tolMinus, dp)}`;
    return `−${fmt.num(m.tolMinus, dp)} / +${fmt.num(m.tolPlus, dp)}`;
  };

  return (
    <Card>
      <CardHeader title={t("q.title")} subtitle={t("q.subtitle", { n: inspections.length, ncr: ncrs.length })} icon={<ClipboardCheck className="size-4" />} />
      {inspections.length === 0 ? (
        <div className="border-t border-line">
          <EmptyState icon={<ClipboardCheck className="size-5" />} title={t("q.none")} hint={t("q.noneHint")} />
        </div>
      ) : (
        <ul className="border-t border-line">
          {inspections.map((i) => {
            const expanded = open === i.id;
            const fails = i.measurements.filter(outOfTol).length;
            return (
              <li key={i.id} className="border-b border-line last:border-b-0">
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : i.id)}
                  aria-expanded={expanded}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-left hover:bg-surface-2"
                >
                  <div className="min-w-40 flex-1">
                    <div className="text-sm font-medium text-ink">{label("inspectionType", i.type)}</div>
                    <div className="text-xs text-ink-3 tabular">
                      {i.id} · {fmt.dateTime(i.at)} · {t("q.sample", { n: i.sampleSize })}
                    </div>
                  </div>
                  <PersonChip id={i.inspectorId} size={20} className="hidden max-w-44 sm:inline-flex" />
                  <span className={cn("text-xs tabular", i.defectsFound ? "font-medium text-critical-ink" : "text-ink-3")}>
                    {i.defectsFound ? t("q.defects", { n: i.defectsFound }) : t("q.noDefects")}
                  </span>
                  <StatusBadge kind="inspectionResult" value={i.result} />
                  <ChevronDown className={cn("size-4 text-ink-3 transition-transform", expanded && "rotate-180")} />
                </button>
                {expanded && (
                  <div className="px-5 pb-4">
                    <div className="overflow-x-auto rounded-lg border border-line scroll-thin">
                      <table className="w-full min-w-[480px] text-xs">
                        <thead>
                          <tr className="bg-surface-2 text-left text-ink-3">
                            <th className="px-3 py-2 font-medium">{t("q.m.name")}</th>
                            <th className="px-3 py-2 text-right font-medium">{t("q.m.nominal")}</th>
                            <th className="px-3 py-2 text-right font-medium">{t("q.m.tol")}</th>
                            <th className="px-3 py-2 text-right font-medium">{t("q.m.value")}</th>
                            <th className="w-8 px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {i.measurements.map((m) => {
                            const bad = outOfTol(m);
                            const dp = decimals(m.nominal, m.tolMinus, m.tolPlus, m.value);
                            return (
                              <tr key={m.name} className={cn("border-t border-line", bad && "bg-critical-soft")}>
                                <td className={cn("px-3 py-2", bad ? "font-medium text-critical-ink" : "text-ink")}>{m.name}</td>
                                <td className="px-3 py-2 text-right text-ink-2 tabular">
                                  {fmt.num(m.nominal, dp)} <span className="text-ink-3">{m.unit}</span>
                                </td>
                                <td className="px-3 py-2 text-right text-ink-2 tabular">{tol(m, dp)}</td>
                                <td className={cn("px-3 py-2 text-right font-medium tabular", bad ? "text-critical-ink" : "text-ink")}>{fmt.num(m.value, dp)}</td>
                                <td className="px-3 py-2">
                                  {bad ? (
                                    <AlertTriangle className="size-3.5 text-critical" aria-label={t("q.outOfTol")} />
                                  ) : (
                                    <CheckCircle2 className="size-3.5 text-good" aria-label={t("q.inTol")} />
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {fails > 0 && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-critical-ink">
                        <AlertTriangle className="size-3.5" />
                        {t("q.outOfTol")}: {fails}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {ncrs.length > 0 && (
        <div className="border-t border-line px-5 pt-4 pb-5">
          <SectionTitle>{t("q.ncrs")}</SectionTitle>
          <ul className="flex flex-col gap-2">
            {ncrs.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line px-3 py-2.5">
                <IdLink href={`/quality?ncr=${n.id}`}>{n.id}</IdLink>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{tx(n.title, n.titleTr)}</span>
                <span className="text-xs text-ink-3 tabular">{t("q.qtyAffected", { n: n.qtyAffected })}</span>
                <SeverityBadge value={n.severity} />
                <StatusBadge kind="ncrStatus" value={n.status} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
