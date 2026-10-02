"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  Boxes,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Cog,
  Factory,
  Flame,
  PlayCircle,
  Plane,
  Ship,
  ShieldCheck,
  Siren,
  Truck,
  TrendingUp,
  Warehouse,
  Clock,
  XCircle,
} from "lucide-react";
import { useFmt, useLabel, useLang, useT, useTx } from "@/i18n";
import type { Inspection, Material, MaterialLot, WorkOrder } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { useDb } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Badge, Button, Card, IdLink, PersonChip, SeverityBadge, StatusBadge } from "@/components/ui";
import { decimalsOf, inTolerance, measurementName } from "@/features/quality/lib";
import { consumedLot, incomingInspectionFor } from "./genealogy";
import { messages } from "./messages";

interface MatRow {
  material: Material;
  qtyPerUnit: number;
  lot?: MaterialLot;
  insp?: Inspection;
}

function Stage({ n, icon, title, subtitle, children, className }: { n: number; icon: ReactNode; title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-ink">{n}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <span className="text-ink-3">{icon}</span>
            <span className="truncate">{title}</span>
          </div>
          {subtitle && <div className="truncate text-xs text-ink-3">{subtitle}</div>}
        </div>
      </div>
      <div className="flex-1 p-3">{children}</div>
    </Card>
  );
}

function Connector() {
  return (
    <div className="relative flex justify-center py-1.5 xl:w-7 xl:items-center xl:py-0" aria-hidden>
      <span className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-line-strong xl:top-1/2 xl:right-0 xl:bottom-auto xl:left-0 xl:h-px xl:w-auto xl:translate-x-0" />
      <span className="relative flex size-6 items-center justify-center rounded-full border border-line-strong bg-surface text-ink-3">
        <ArrowDown className="size-3.5 xl:hidden" />
        <ArrowRight className="hidden size-3.5 xl:block" />
      </span>
    </div>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-[13px] last:border-0">
      <span className="shrink-0 text-ink-3">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-ink">{children}</span>
    </div>
  );
}

const MODE_ICON = { truck: Truck, sea: Ship, air: Plane } as const;

export function GenealogyView({ wo, unit, serial, onTrace }: { wo: WorkOrder; unit?: number; serial?: string; onTrace: (q: string) => void }) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const lang = useLang();
  const lk = useLookups();
  const inspections = useDb((db) => db.inspections);
  const ncrsAll = useDb((db) => db.ncrs);

  const product = lk.product.get(wo.productId)!;
  const plant = lk.plant.get(wo.plantId);
  const so = wo.salesOrderId ? lk.salesOrder.get(wo.salesOrderId) : undefined;
  const customer = wo.customerId ? lk.customer.get(wo.customerId) : undefined;

  const mats = useMemo<MatRow[]>(() => {
    const out: MatRow[] = [];
    for (const b of product.bom) {
      const material = lk.material.get(b.materialId);
      if (!material) continue;
      const lot = consumedLot(material, wo);
      out.push({ material, qtyPerUnit: b.qtyPerUnit, lot, insp: lot ? incomingInspectionFor(inspections, material, lot) : undefined });
    }
    return out;
  }, [product, wo, lk, inspections]);
  const insps = useMemo(() => inspections.filter((i) => i.workOrderId === wo.id).sort((a, b) => (a.at < b.at ? -1 : 1)), [inspections, wo.id]);
  const ncrs = useMemo(() => ncrsAll.filter((n) => n.workOrderId === wo.id), [ncrsAll, wo.id]);

  const lotUnits = wo.status === "completed" ? wo.qtyDone : wo.qty;
  const mainHeat = mats.find((m) => m.lot?.heatNo)?.lot?.heatNo;
  const opsDone = wo.operations.filter((o) => o.status === "done").length;
  const qtyFmt = (q: number) => fmt.num(q, q < 10 ? 2 : q < 100 ? 1 : 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className="hidden size-16 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2 sm:block">
              <Image src={product.image} alt="" width={64} height={64} className="size-full object-cover" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{serial ? t("sum.serial") : t("sum.wo")}</div>
              <div className="tabular font-display text-2xl font-semibold tracking-tight break-all text-ink sm:text-3xl">{serial ?? wo.lotNo}</div>
              <div className="mt-1 text-sm text-ink-2">
                <IdLink href={`/products/${product.id}`}>{product.sku}</IdLink> <span className="text-ink-3">·</span> {product.name}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <Badge tone="brand" icon={<Boxes className="size-3.5" />}>
                  {unit ? t("sum.unitOf", { n: fmt.num(unit), total: fmt.num(wo.qtyDone) }) : t("sum.units", { n: fmt.num(lotUnits) })}
                </Badge>
                <StatusBadge kind="woStatus" value={wo.status} />
                {plant && (
                  <Badge tone="neutral" icon={<Factory className="size-3.5" />}>
                    {plant.code}
                  </Badge>
                )}
                {wo.actualEnd ? (
                  <span className="text-xs text-ink-3">{t("sum.finished", { date: fmt.dateLong(wo.actualEnd) })}</span>
                ) : (
                  <span className="text-xs text-ink-3">{t("sum.inProgress")}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {mainHeat && (
              <Button icon={<Siren className="size-4" />} onClick={() => onTrace(mainHeat)}>
                {t("sum.recall", { heat: mainHeat })}
              </Button>
            )}
            <Link href={`/work-orders/${wo.id}`} className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3.5 text-sm font-medium text-brand-ink shadow-sm hover:bg-brand-hover">
              <ClipboardList className="size-4" />
              {t("sum.openWo")}
            </Link>
          </div>
        </div>
      </Card>

      {/* Chain */}
      <div className="flex flex-col xl:grid xl:grid-cols-[minmax(0,1.3fr)_auto_minmax(0,0.95fr)_auto_minmax(0,1.3fr)_auto_minmax(0,1.1fr)_auto_minmax(0,1fr)]">
        {/* 1 · materials */}
        <Stage n={1} icon={<Flame className="size-4" />} title={t("st.materials")} subtitle={t("st.materialsSub", { n: mats.length })}>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {mats.map(({ material, qtyPerUnit, lot, insp }) => (
              <li key={material.id} className="rounded-lg border border-line p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-ink" title={tx(material.name, material.nameTr)}>
                      {tx(material.name, material.nameTr)}
                    </div>
                    <div className="truncate text-[11px] text-ink-3">
                      <IdLink href={`/inventory?material=${material.id}`} className="text-[11px]">
                        {material.id}
                      </IdLink>{" "}
                      · {unit ? t("mat.perUnit", { qty: qtyFmt(qtyPerUnit), unit: material.unit }) : t("mat.total", { qty: qtyFmt(qtyPerUnit * lotUnits), unit: material.unit })}
                    </div>
                  </div>
                  {insp && <StatusBadge kind="inspectionResult" value={insp.result} className="shrink-0" />}
                </div>
                {lot && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <button type="button" onClick={() => onTrace(lot.lotNo)} className="tabular rounded px-1 text-ink-2 hover:bg-surface-3 hover:text-ink" title={t("mat.traceHeat")}>
                      {t("mat.lot")} {lot.lotNo}
                    </button>
                    {lot.heatNo && (
                      <button
                        type="button"
                        onClick={() => onTrace(lot.heatNo!)}
                        className="tabular inline-flex items-center gap-1 rounded bg-brand-soft px-1.5 py-0.5 font-medium text-brand-soft-ink hover:opacity-85"
                        title={t("mat.traceHeat")}
                      >
                        <Flame className="size-3" />
                        {lot.heatNo}
                      </button>
                    )}
                  </div>
                )}
                <div className="mt-1 truncate text-[11px] text-ink-3" title={material.supplier}>
                  {material.supplier} · {lot?.certificate}
                  {!insp && lot && ` · ${t("mat.noIncoming")}`}
                </div>
              </li>
            ))}
          </ul>
        </Stage>
        <Connector />

        {/* 2 · work order */}
        <Stage n={2} icon={<ClipboardList className="size-4" />} title={t("st.wo")} subtitle={wo.id}>
          <div className="flex flex-col">
            <Row label={t("wo.lot")}>
              <span className="tabular">{wo.lotNo}</span>
            </Row>
            <Row label={t("st.wo")}>
              <IdLink href={`/work-orders/${wo.id}`}>{wo.id}</IdLink>
            </Row>
            <Row label={t("wo.product")}>
              <span className="tabular">{product.sku}</span>
            </Row>
            <Row label={t("wo.qty")}>
              <span className="tabular">
                {fmt.num(wo.status === "completed" ? wo.qtyDone : wo.operations[wo.operations.length - 1].qtyDone)} / {fmt.num(wo.qty)}
              </span>
            </Row>
            <Row label={t("wo.scrap")}>
              <span className={cn("tabular", wo.qtyScrap > 0 && "text-serious-ink")}>{fmt.num(wo.qtyScrap)}</span>
            </Row>
            <Row label={wo.actualStart ? t("wo.start") : t("wo.plannedStart")}>
              <span className="tabular">{fmt.dateTime(wo.actualStart ?? wo.plannedStart)}</span>
            </Row>
            {wo.actualEnd && (
              <Row label={t("wo.end")}>
                <span className="tabular">{fmt.dateTime(wo.actualEnd)}</span>
              </Row>
            )}
            <Row label={t("wo.plant")}>{plant ? `${plant.code} · ${tx(plant.name, plant.nameTr).split("·")[1]?.trim() ?? ""}` : wo.plantId}</Row>
            <div className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
              <span className="shrink-0 text-ink-3">{t("wo.planner")}</span>
              <PersonChip id={wo.plannerId} size={18} className="min-w-0" />
            </div>
          </div>
        </Stage>
        <Connector />

        {/* 3 · operations */}
        <Stage n={3} icon={<Cog className="size-4" />} title={t("st.ops")} subtitle={t("st.opsSub", { done: opsDone, n: wo.operations.length })}>
          <ol className="flex flex-col">
            {wo.operations.map((op, i) => {
              const over = op.status === "done" && op.actualMinutes > op.stdMinutes * 1.15;
              const Icon = op.status === "done" ? CheckCircle2 : op.status === "running" ? PlayCircle : CircleDashed;
              return (
                <li key={op.id} className="relative flex gap-2.5 pb-3 last:pb-0">
                  {i < wo.operations.length - 1 && <span className="absolute top-5 bottom-0 left-[7px] w-px bg-line" aria-hidden />}
                  <Icon className={cn("relative mt-0.5 size-4 shrink-0 bg-surface", op.status === "done" ? "text-good" : op.status === "running" ? "text-brand" : "text-ink-3")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[13px] leading-tight font-medium text-ink">
                        <span className="tabular text-ink-3">{op.seq}</span> {label("op", op.operation)}
                      </span>
                      {op.status !== "done" && <StatusBadge kind="opStatus" value={op.status} className="h-5 shrink-0 text-[11px]" />}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                      <IdLink href={`/shop-floor?machine=${op.machineId}`} className="text-xs">
                        {op.machineId}
                      </IdLink>
                      {op.actualStart ? (
                        <span className="tabular">
                          {fmt.dateTime(op.actualStart)}
                          {op.actualEnd ? ` → ${fmt.time(op.actualEnd)}` : ""}
                        </span>
                      ) : (
                        <span>{t("op.notStarted")}</span>
                      )}
                    </div>
                    {op.actualStart && (
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                        <PersonChip id={op.operatorId} size={18} className="min-w-0 [&_span]:text-xs" />
                        <span className={cn("tabular inline-flex items-center gap-1 text-[11px] whitespace-nowrap", over ? "text-serious-ink" : "text-ink-3")} title={over ? t("op.over") : undefined}>
                          {over && <TrendingUp className="size-3" />}
                          {t("op.stdAct", { std: fmt.duration(op.stdMinutes), act: fmt.duration(op.actualMinutes) })}
                        </span>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Stage>
        <Connector />

        {/* 4 · quality */}
        <Stage n={4} icon={<ShieldCheck className="size-4" />} title={t("st.quality")} subtitle={t("st.qualitySub", { n: insps.length })}>
          {insps.length === 0 && ncrs.length === 0 ? (
            <p className="px-1 py-2 text-[13px] text-ink-3">{t("q.none")}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {insps.map((i) => (
                <Link key={i.id} href={`/quality?insp=${i.id}`} className="block rounded-lg border border-line p-2.5 hover:bg-surface-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-ink">{label("inspectionType", i.type)}</div>
                      <div className="tabular text-[11px] text-ink-3">
                        {i.id} · {fmt.dateTime(i.at)}
                      </div>
                    </div>
                    <StatusBadge kind="inspectionResult" value={i.result} className="shrink-0" />
                  </div>
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    {i.measurements.slice(0, 3).map((m) => {
                      const ok = inTolerance(m);
                      return (
                        <div key={m.name} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="truncate text-ink-3">{measurementName(m.name, lang)}</span>
                          <span className={cn("tabular inline-flex shrink-0 items-center gap-1 font-medium", ok ? "text-ink-2" : "text-critical-ink")}>
                            {!ok && <XCircle className="size-3" />}
                            {fmt.num(m.value, decimalsOf(m))} {m.unit}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-1.5 truncate text-[11px] text-ink-3">{lk.employee.get(i.inspectorId)?.name}</div>
                </Link>
              ))}
              {ncrs.length > 0 && (
                <div className="mt-1">
                  <div className="mb-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{t("q.ncrs")}</div>
                  {ncrs.map((n) => (
                    <Link key={n.id} href={`/quality?ncr=${n.id}`} className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 hover:bg-surface-2">
                      <span className="min-w-0">
                        <span className="tabular block text-xs font-medium text-brand">{n.id}</span>
                        <span className="block truncate text-[11px] text-ink-3">{tx(n.title, n.titleTr)}</span>
                      </span>
                      <SeverityBadge value={n.severity} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </Stage>
        <Connector />

        {/* 5 · delivery */}
        <Stage n={5} icon={<Truck className="size-4" />} title={t("st.delivery")} subtitle={customer ? customer.name : t("mts")}>
          {so && customer ? (
            <div className="flex flex-col">
              <Row label={t("del.so")}>
                <IdLink href={`/orders?id=${so.id}`}>{so.id}</IdLink>
              </Row>
              <div className="border-b border-line py-2">
                <div className="text-[13px] font-medium text-ink">{customer.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
                  <span className="rounded bg-surface-3 px-1 text-[10px] font-semibold text-ink-2">{customer.countryCode}</span>
                  {customer.city}, {tx(customer.country, customer.countryTr)}
                </div>
              </div>
              <Row label={t("del.promised")}>
                <span className="tabular">{fmt.dateLong(so.promisedDate)}</span>
              </Row>
              <div className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-[13px]">
                <span className="text-ink-3">{t("common.status")}</span>
                <StatusBadge kind="soStatus" value={so.status} />
              </div>
              {so.shipment ? (
                (() => {
                  const ModeIcon = MODE_ICON[so.shipment.mode];
                  return (
                    <div className="mt-2 rounded-lg bg-surface-2 p-2.5">
                      <div className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                        <ModeIcon className="size-4 text-ink-3" />
                        {t(`mode.${so.shipment.mode}`)} · {so.shipment.carrier}
                      </div>
                      <div className="tabular mt-1 text-xs text-ink-2">
                        {t("del.tracking")}: <span className="font-medium text-ink">{so.shipment.tracking}</span>
                      </div>
                      <div className="mt-1 flex justify-between gap-2 text-xs text-ink-3">
                        <span>
                          {t("del.shipped")} <span className="tabular text-ink-2">{fmt.date(so.shipment.shippedAt)}</span>
                        </span>
                        <span>
                          {t("del.eta")} <span className="tabular text-ink-2">{fmt.date(so.shipment.eta)}</span>
                        </span>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <p className="mt-2 flex items-center gap-1.5 text-[13px] text-ink-3">
                  <Clock className="size-4" />
                  {wo.status === "completed" ? t("del.notShipped") : t("del.notDone")}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-2 p-1">
              <span className="rounded-lg bg-surface-3 p-2 text-ink-3">
                <Warehouse className="size-5" />
              </span>
              <p className="text-[13px] font-medium text-ink">{t("del.mts")}</p>
              <p className="text-xs text-ink-3">{t("del.mtsHint", { n: fmt.num(product.stockQty) })}</p>
              {wo.status !== "completed" && <p className="text-xs text-ink-3">{t("del.notDone")}</p>}
            </div>
          )}
        </Stage>
      </div>
      <p className="text-xs text-ink-3">{t("sum.footnote")}</p>
    </div>
  );
}
