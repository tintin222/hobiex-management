"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertOctagon, CheckCircle2, ClipboardCheck, ClipboardList, MapPin, PackagePlus, ShoppingCart } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { addDays, DAY, localDateOf } from "@/lib/data/clock";
import type { Material, PlantId, Priority, Product, StockMovement } from "@/lib/data/types";
import { useLookups, usePlantFilter } from "@/lib/hooks";
import { useClock, useDb } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Badge, Button, Drawer, IdLink, KeyValue, PersonChip, Progress, SectionTitle } from "@/components/ui";
import { axisProps, ChartLegend, ChartTooltip, gridProps, lineCursor, yAxisProps } from "@/components/charts/theme";
import { ProductThumb } from "@/features/products/product-thumb";
import { messages } from "./messages";
import { CountModal, PurchaseModal, ReceiveModal } from "./material-modals";
import { materialCover, materialState, StockBadge, useUnit } from "./stock";
import { MovementTypeBadge, SignedQty } from "./movement-bits";

type ModalState = null | { kind: "receive"; lotNo: string; poRef: string } | { kind: "count" } | { kind: "purchase" };

export function MaterialDrawer({ material, onClose }: { material: Material; onClose: () => void }) {
  const tx = useTx();
  const label = useLabel();
  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-2xl"
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="tabular">{material.code}</span>
          <StockBadge state={materialState(material)} />
        </span>
      }
      subtitle={
        <span>
          {tx(material.name, material.nameTr)} · {label("materialCategory", material.category)}
        </span>
      }
      footer={<DrawerActions material={material} />}
    >
      <MaterialDetail key={material.id} material={material} />
    </Drawer>
  );
}

/** Footer actions live in their own component so modal state survives drawer re-renders. */
function DrawerActions({ material }: { material: Material }) {
  const t = useT(messages);
  const clock = useClock();
  const plant = usePlantFilter();
  const products = useDb((db) => db.products);
  const workOrders = useDb((db) => db.workOrders);
  const [modal, setModal] = useState<ModalState>(null);
  const [created, setCreated] = useState<string | null>(null);

  const pr = useMemo(() => {
    const state = materialState(material);
    const step = material.unit === "kg" ? 10 : 1;
    const need = Math.max(material.dailyUsage * material.leadTimeDays * 1.2, material.reorderPoint * 2 - material.onHand - material.onOrder);
    const suggested = Math.max(step, Math.ceil(need / step) * step);
    const priority: Priority = state === "critical" ? "urgent" : state === "warn" ? "high" : "normal";
    const users = products.filter((p) => p.bom.some((b) => b.materialId === material.id));
    const plantId: PlantId = plant !== "all" ? plant : (users[0]?.plantId ?? "P1");
    const shortage = projectShortage(material, products, workOrders);
    const needBy = shortage ? Date.parse(shortage.wo.plannedStart) - DAY : clock.now + material.leadTimeDays * DAY;
    return { suggested, priority, plantId, needBy: Math.max(clock.now + DAY, needBy) };
  }, [material, products, workOrders, plant, clock.now]);

  const openReceive = () => {
    const stamp = String(Date.now());
    const today = localDateOf(Date.now());
    setModal({ kind: "receive", lotNo: `RL${today.slice(2, 4)}${today.slice(5, 7)}-${stamp.slice(-4)}`, poRef: `PO-${today.slice(2, 4)}-${stamp.slice(-6, -2)}` });
  };

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
      {created && (
        <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-ink-2">
          <CheckCircle2 className="size-3.5 text-good" />
          <Link href={`/tasks?task=${created}`} className="hover:underline">
            {t("d.prCreated", { id: created })}
          </Link>
        </span>
      )}
      <Button size="sm" onClick={() => setModal({ kind: "count" })} icon={<ClipboardCheck className="size-3.5" />}>
        {t("act.count")}
      </Button>
      <Button size="sm" onClick={() => setModal({ kind: "purchase" })} icon={<ShoppingCart className="size-3.5" />}>
        {t("act.purchase")}
      </Button>
      <Button size="sm" variant="primary" onClick={openReceive} icon={<PackagePlus className="size-3.5" />}>
        {t("act.receive")}
      </Button>
      {modal?.kind === "receive" && <ReceiveModal material={material} lotNo={modal.lotNo} poRef={modal.poRef} onClose={() => setModal(null)} />}
      {modal?.kind === "count" && <CountModal material={material} onClose={() => setModal(null)} />}
      {modal?.kind === "purchase" && (
        <PurchaseModal
          material={material}
          plantId={pr.plantId}
          priority={pr.priority}
          suggested={pr.suggested}
          needBy={pr.needBy}
          onClose={() => setModal(null)}
          onCreated={setCreated}
        />
      )}
    </div>
  );
}

interface DemandRow {
  wo: { id: string; plannedStart: string; qty: number; status: string; productId: string };
  product?: Product;
  required: number;
  cumulative: number;
}

/** Walk planned/released work orders in start order and find where cumulative demand exceeds available stock. */
function demandRows(material: Material, products: Product[], workOrders: { id: string; productId: string; status: string; plannedStart: string; qty: number }[]) {
  const perUnit = new Map<string, number>();
  for (const p of products) {
    const line = p.bom.find((b) => b.materialId === material.id);
    if (line) perUnit.set(p.id, line.qtyPerUnit);
  }
  const wos = workOrders.filter((w) => (w.status === "planned" || w.status === "released") && perUnit.has(w.productId)).sort((a, b) => (a.plannedStart < b.plannedStart ? -1 : 1));
  let cum = 0;
  return wos.map((wo) => {
    const required = perUnit.get(wo.productId)! * wo.qty;
    cum += required;
    return { wo, required, cumulative: cum };
  });
}

function projectShortage(material: Material, products: Product[], workOrders: { id: string; productId: string; status: string; plannedStart: string; qty: number }[]) {
  const available = material.onHand - material.reserved;
  return demandRows(material, products, workOrders).find((r) => r.cumulative > available);
}

function MaterialDetail({ material: m }: { material: Material }) {
  const t = useT(messages);
  const fmt = useFmt();
  const clock = useClock();
  const lk = useLookups();
  const unit = useUnit();
  const products = useDb((db) => db.products);
  const workOrders = useDb((db) => db.workOrders);
  const movementsAll = useDb((db) => db.stockMovements);

  const available = m.onHand - m.reserved;
  const cover = materialCover(m);
  const u = unit(m.unit);
  const q = (n: number, dp = 0) => `${fmt.num(n, dp)} ${u}`;

  const history = useMemo(
    () =>
      m.history.map((v, i) => {
        const d = addDays(clock.today, -29 + i);
        return { label: fmt.date(d), onHand: i === m.history.length - 1 ? m.onHand : v };
      }),
    [m.history, m.onHand, clock.today, fmt],
  );
  const yMax = Math.max(m.reorderPoint, ...history.map((h) => h.onHand)) * 1.08;

  const demand = useMemo(() => {
    const rows: DemandRow[] = demandRows(m, products, workOrders).map((r) => ({ ...r, product: lk.product.get(r.wo.productId) }));
    const total = rows[rows.length - 1]?.cumulative ?? 0;
    const shortage = rows.find((r) => r.cumulative > available);
    return { rows, total, shortage };
  }, [m, products, workOrders, lk, available]);

  const whereUsed = useMemo(
    () =>
      products
        .map((p) => ({ product: p, perUnit: p.bom.find((b) => b.materialId === m.id)?.qtyPerUnit ?? 0 }))
        .filter((x) => x.perUnit > 0)
        .sort((a, b) => b.perUnit * b.product.monthlyDemand - a.perUnit * a.product.monthlyDemand),
    [products, m.id],
  );

  const movements = useMemo(() => movementsAll.filter((x) => x.materialId === m.id).slice(0, 8), [movementsAll, m.id]);

  const figures: { label: string; value: string; tone?: "critical" | "warn" }[] = [
    { label: t("col.onHand"), value: q(m.onHand) },
    { label: t("col.available"), value: q(available) },
    { label: t("col.reserved"), value: q(m.reserved) },
    { label: t("col.onOrder"), value: q(m.onOrder) },
    { label: t("d.rop"), value: q(m.reorderPoint), tone: m.onHand < m.reorderPoint ? "warn" : undefined },
    { label: t("d.safety"), value: q(m.safetyStock), tone: m.onHand < m.safetyStock ? "critical" : undefined },
    { label: t("d.usage"), value: q(m.dailyUsage) },
    { label: t("col.cover"), value: t("daysN", { n: fmt.num(cover, 1) }), tone: m.onHand < m.safetyStock ? "critical" : m.onHand < m.reorderPoint ? "warn" : undefined },
  ];

  return (
    <div className="flex flex-col gap-6 px-5 py-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {figures.map((f) => (
          <div
            key={f.label}
            className={cn(
              "rounded-lg border px-3 py-2",
              f.tone === "critical" ? "border-critical/30 bg-critical-soft" : f.tone === "warn" ? "border-warn/40 bg-warn-soft" : "border-line bg-surface-2",
            )}
          >
            <div className="truncate text-[11px] text-ink-3">{f.label}</div>
            <div className={cn("tabular mt-0.5 truncate text-sm font-semibold", f.tone === "critical" ? "text-critical-ink" : f.tone === "warn" ? "text-warn-ink" : "text-ink")}>{f.value}</div>
          </div>
        ))}
      </div>

      <KeyValue
        cols={4}
        items={[
          { label: t("col.leadTime"), value: t("daysN", { n: m.leadTimeDays }) },
          { label: t("d.unitCost"), value: fmt.eur(m.unitCostEur, true) },
          { label: t("d.value"), value: fmt.eur(m.onHand * m.unitCostEur) },
          {
            label: t("col.location"),
            value: (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5 text-ink-3" />
                {m.location}
              </span>
            ),
          },
          { label: t("col.supplier"), value: <span title={m.supplier}>{m.supplier}</span> },
        ]}
      />

      {/* 30-day history */}
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-ink">{t("d.history")}</h4>
            <p className="text-xs text-ink-3">{t("d.historySub", { unit: u })}</p>
          </div>
          <ChartLegend
            items={[
              { label: t("d.onHandSeries"), color: "var(--series-1)" },
              { label: t("d.rop"), color: "var(--warn)", dashed: true },
              { label: t("d.safety"), color: "var(--critical)", dashed: true },
            ]}
          />
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} interval={6} />
              <YAxis {...yAxisProps} width={52} domain={[0, Math.ceil(yMax)]} tickFormatter={(v) => fmt.compact(v)} />
              <Tooltip cursor={lineCursor} content={<ChartTooltip formatter={(v) => q(v)} />} />
              <ReferenceLine y={m.reorderPoint} stroke="var(--warn)" strokeDasharray="5 4" strokeWidth={1.5} ifOverflow="extendDomain" />
              <ReferenceLine y={m.safetyStock} stroke="var(--critical)" strokeDasharray="5 4" strokeWidth={1.5} ifOverflow="extendDomain" />
              <Line dataKey="onHand" name={t("d.onHandSeries")} stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} type="monotone" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Upcoming demand */}
      <section>
        <SectionTitle>{t("d.demand")}</SectionTitle>
        {demand.rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-[13px] text-ink-3">{t("d.noDemand")}</p>
        ) : (
          <div className="rounded-xl border border-line">
            <div className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="text-xs text-ink-3">{t("d.demandSub", { n: demand.rows.length })}</div>
                  <div className="font-display text-xl font-semibold text-ink">
                    {q(demand.total)} <span className="text-sm font-normal text-ink-3">{t("d.vsAvailable", { qty: q(available) })}</span>
                  </div>
                </div>
              </div>
              <Progress value={available / Math.max(1, demand.total)} tone={demand.shortage ? "critical" : "good"} />
              {demand.shortage ? (
                <div className="flex items-start gap-2.5 rounded-lg bg-critical-soft px-3 py-2.5">
                  <AlertOctagon className="mt-0.5 size-4 shrink-0 text-critical" />
                  <div className="text-[13px]">
                    <p className="font-medium text-critical-ink">{t("d.shortage", { date: fmt.weekday(demand.shortage.wo.plannedStart) })}</p>
                    <p className="mt-0.5 text-ink-2">
                      {t("d.shortageDetail", { wo: demand.shortage.wo.id, qty: q(demand.shortage.cumulative - available) })}{" "}
                      {demand.total <= available + m.onOrder ? t("d.coveredByPo", { qty: q(m.onOrder), lt: m.leadTimeDays }) : t("d.notCovered", { qty: q(m.onOrder) })}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 rounded-lg bg-good-soft px-3 py-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" />
                  <div className="text-[13px]">
                    <p className="font-medium text-good-ink">{t("d.noShortage")}</p>
                    <p className="mt-0.5 text-ink-2">{t("d.noShortageDetail", { qty: q(available - demand.total) })}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto border-t border-line scroll-thin">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-2">
                  <tr className="text-left text-xs text-ink-3">
                    <th className="px-4 py-2 font-medium">{t("common.workOrder")}</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">{t("common.product")}</th>
                    <th className="px-3 py-2 font-medium">{t("common.start")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("d.required")}</th>
                    <th className="px-4 py-2 text-right font-medium">{t("d.cumulative")}</th>
                  </tr>
                </thead>
                <tbody>
                  {demand.rows.map((r) => {
                    const over = r.cumulative > available;
                    return (
                      <tr key={r.wo.id} className="border-t border-line">
                        <td className="px-4 py-2">
                          <IdLink href={`/work-orders/${r.wo.id}`}>{r.wo.id}</IdLink>
                        </td>
                        <td className="hidden px-3 py-2 text-ink-2 sm:table-cell">
                          {r.product?.sku} <span className="text-ink-3">× {fmt.num(r.wo.qty)}</span>
                        </td>
                        <td className="tabular px-3 py-2 whitespace-nowrap text-ink-2">{fmt.dateTime(r.wo.plannedStart)}</td>
                        <td className="tabular px-3 py-2 text-right">{fmt.num(r.required, r.required < 100 ? 1 : 0)}</td>
                        <td className={cn("tabular px-4 py-2 text-right", over ? "font-medium text-critical-ink" : "text-ink-2")}>{fmt.num(r.cumulative)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Lots */}
      <section>
        <SectionTitle>{t("d.lots")}</SectionTitle>
        <div className="overflow-x-auto rounded-xl border border-line scroll-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left text-xs text-ink-3">
                <th className="px-4 py-2 font-medium">{t("common.lot")}</th>
                <th className="px-3 py-2 font-medium">{t("d.heatNo")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("common.qty")}</th>
                <th className="px-3 py-2 font-medium">{t("d.received")}</th>
                <th className="px-4 py-2 font-medium">{t("d.certificate")}</th>
              </tr>
            </thead>
            <tbody>
              {m.lots.map((l) => (
                <tr key={l.lotNo} className="border-b border-line last:border-0">
                  <td className="tabular px-4 py-2 font-medium whitespace-nowrap text-ink">{l.lotNo}</td>
                  <td className="tabular px-3 py-2 text-ink-2">{l.heatNo ?? <span className="text-ink-3">—</span>}</td>
                  <td className="tabular px-3 py-2 text-right whitespace-nowrap">{q(l.qty)}</td>
                  <td className="tabular px-3 py-2 whitespace-nowrap text-ink-2">{fmt.date(l.receivedAt)}</td>
                  <td className="px-4 py-2">
                    <Badge tone="neutral">{l.certificate}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Where used */}
      <section>
        <SectionTitle>{t("d.whereUsed")}</SectionTitle>
        <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {whereUsed.map(({ product, perUnit }) => (
            <Link key={product.id} href={`/products/${product.id}`} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2">
              <ProductThumb product={product} width={40} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-brand">{product.sku}</div>
                <div className="truncate text-xs text-ink-3">{product.name}</div>
              </div>
              <div className="text-right">
                <div className="tabular text-sm text-ink">
                  {fmt.num(perUnit, 2)} {u}
                </div>
                <div className="text-[11px] text-ink-3">{t("d.perMonth", { qty: q(perUnit * product.monthlyDemand) })}</div>
              </div>
            </Link>
          ))}
          {whereUsed.length === 0 && <p className="px-4 py-4 text-center text-[13px] text-ink-3">—</p>}
        </div>
      </section>

      {/* Movements */}
      <section>
        <SectionTitle>{t("d.movements")}</SectionTitle>
        {movements.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-[13px] text-ink-3">{t("d.noMovements")}</p>
        ) : (
          <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {movements.map((mv) => (
              <MovementLine key={mv.id} mv={mv} unitLabel={u} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MovementLine({ mv, unitLabel }: { mv: StockMovement; unitLabel: string }) {
  const fmt = useFmt();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3.5 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <MovementTypeBadge type={mv.type} />
        <span className="tabular text-xs text-ink-3">{fmt.dateTime(mv.at)}</span>
      </div>
      <div className="flex items-center gap-4">
        <MovementRef value={mv.ref} />
        <SignedQty qty={mv.qty} type={mv.type} unit={unitLabel} />
        <PersonChip id={mv.userId} size={20} className="hidden sm:inline-flex" />
      </div>
    </div>
  );
}

export function MovementRef({ value }: { value: string }) {
  const t = useT(messages);
  if (value.startsWith("WO-")) return <IdLink href={`/work-orders/${value}`}>{value}</IdLink>;
  const count = value === "Cycle count";
  return (
    <span className="inline-flex items-center gap-1 text-[13px] whitespace-nowrap text-ink-2">
      {count && <ClipboardList className="size-3.5 text-ink-3" />}
      {count ? t("ref.cycleCount") : value}
    </span>
  );
}
