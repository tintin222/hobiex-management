"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, ArrowLeft, Boxes, ClipboardList, Factory, Flame, PackageCheck, PackageSearch, ShieldCheck, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { addDays } from "@/lib/data/clock";
import type { Product } from "@/lib/data/types";
import { isLate, useLookups } from "@/lib/hooks";
import { useClock, useDb } from "@/lib/store";
import { cn } from "@/lib/cn";
import { PageContainer } from "@/components/layout/app-shell";
import { Badge, Card, CardBody, CardHeader, EmptyState, IdLink, KeyValue, KpiTile, PageHeader, SeverityBadge, StatusBadge } from "@/components/ui";
import { axisProps, barRadiusH, ChartLegend, ChartTooltip, cursorProps, gridProps, SERIES, yAxisProps } from "@/components/charts/theme";
import { fgCover, materialState, StockBadge, useUnit } from "@/features/inventory/stock";
import { messages } from "./messages";

const LABOUR_RATE = 0.62; // € per standard minute

export function ProductDetailView({ id }: { id: string }) {
  const t = useT(messages);
  const lk = useLookups();
  const product = lk.product.get(id);

  if (!product)
    return (
      <PageContainer>
        <PageHeader title={t("notFound.title")} breadcrumbs={[{ label: t("title"), href: "/products" }, { label: id }]} />
        <Card>
          <EmptyState
            icon={<PackageSearch className="size-5" />}
            title={t("notFound.title")}
            hint={t("notFound.hint", { id })}
            action={
              <Link href="/products" className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3.5 text-sm font-medium text-brand-ink shadow-sm hover:bg-brand-hover">
                <ArrowLeft className="size-4" />
                {t("notFound.back")}
              </Link>
            }
          />
        </Card>
      </PageContainer>
    );

  return <ProductDetail product={product} />;
}

function ProductDetail({ product: p }: { product: Product }) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const clock = useClock();
  const lk = useLookups();
  const unit = useUnit();

  const workOrdersAll = useDb((db) => db.workOrders);
  const inspectionsAll = useDb((db) => db.inspections);
  const ncrsAll = useDb((db) => db.ncrs);
  const ordersAll = useDb((db) => db.salesOrders);
  const machinesAll = useDb((db) => db.machines);

  const plant = lk.plant.get(p.plantId);

  // ── Derived figures ──
  const bom = useMemo(
    () =>
      p.bom.map((b) => {
        const m = lk.material.get(b.materialId);
        return { line: b, material: m, ext: m ? b.qtyPerUnit * m.unitCostEur : 0 };
      }),
    [p.bom, lk],
  );
  const materialCost = bom.reduce((s, b) => s + b.ext, 0);
  const cycleTotal = p.routing.reduce((s, r) => s + r.cycleMin, 0);
  const setupTotal = p.routing.reduce((s, r) => s + r.setupMin, 0);
  const labourCost = cycleTotal * LABOUR_RATE;
  const overhead = Math.max(0, p.unitCostEur - materialCost - labourCost);
  const stdCost = materialCost + labourCost + overhead;
  const margin = p.listPriceEur - stdCost;

  const k = useMemo(() => {
    const wos = workOrdersAll.filter((w) => w.productId === p.id);
    const open = wos.filter((w) => w.status !== "completed");
    const insp = inspectionsAll.filter((i) => i.productId === p.id && i.type !== "incoming");
    const since = addDays(clock.today, -90);
    const ncrs = ncrsAll.filter((n) => n.productId === p.id);
    const ncr90 = ncrs.filter((n) => n.openedAt >= since);
    let openOrderUnits = 0;
    let soldQty = 0;
    let soldValue = 0;
    let soldLines = 0;
    for (const o of ordersAll) {
      for (const l of o.lines) {
        if (l.productId !== p.id) continue;
        if (o.status !== "shipped" && o.status !== "delivered") openOrderUnits += l.qty;
        soldQty += l.qty;
        soldValue += l.qty * l.unitPriceEur;
        soldLines += 1;
      }
    }
    const recent = [...wos].sort((a, b) => (a.plannedStart < b.plannedStart ? 1 : -1)).slice(0, 10);
    return {
      openWos: open.length,
      wipUnits: open.reduce((s, w) => s + Math.max(0, w.qty - w.qtyDone), 0),
      fpy: insp.length ? insp.filter((i) => i.result === "pass").length / insp.length : 1,
      inspections: insp.length,
      ncr90: ncr90.length,
      ncrOpen: ncrs.filter((n) => n.status !== "closed").length,
      ncrs: [...ncrs].sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1)),
      openOrderUnits,
      avgPrice: soldQty ? soldValue / soldQty : 0,
      soldLines,
      recent,
    };
  }, [workOrdersAll, inspectionsAll, ncrsAll, ordersAll, p.id, clock.today]);

  const machinesByType = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const x of machinesAll) {
      if (x.plantId !== p.plantId) continue;
      m.set(x.type, [...(m.get(x.type) ?? []), x.id]);
    }
    return m;
  }, [machinesAll, p.plantId]);

  const routingChart = useMemo(() => p.routing.map((r) => ({ name: `${r.seq} · ${label("op", r.operation)}`, min: r.cycleMin })), [p.routing, label]);

  const cover = fgCover(p);
  const marginPct = margin / p.listPriceEur;
  const realizedPct = k.avgPrice ? (k.avgPrice - stdCost) / k.avgPrice : 0;
  const costParts = [
    { key: "material", label: t("cost.material"), value: materialCost, color: SERIES[0] },
    { key: "labour", label: t("cost.labour"), value: labourCost, color: SERIES[1] },
    { key: "overhead", label: t("cost.overhead"), value: overhead, color: SERIES[2] },
  ];

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ label: t("title"), href: "/products" }, { label: label("category", p.category), href: `/products?category=${p.category}` }, { label: p.sku }]}
        title={p.name}
        subtitle={`${p.sku} · ${label("category", p.category)}`}
        actions={
          <Link href="/products" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium text-ink shadow-sm hover:bg-surface-2">
            <ArrowLeft className="size-4" />
            {t("notFound.back")}
          </Link>
        }
      />

      {/* Hero */}
      <Card className="overflow-hidden">
        <div className="grid md:grid-cols-[minmax(0,440px)_1fr]">
          <div className="relative aspect-[4/3] bg-surface-3 md:aspect-auto md:min-h-80">
            <Image src={p.image} alt={p.name} fill preload sizes="(min-width: 768px) 440px, 100vw" className="object-cover" />
          </div>
          <div className="flex flex-col gap-5 p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tabular rounded-md bg-surface-3 px-2 py-0.5 text-sm font-semibold text-ink">{p.sku}</span>
              <Badge tone="neutral">{label("category", p.category)}</Badge>
              <Badge tone="neutral">{p.oem === "Universal" ? t("d.universal") : p.oem}</Badge>
              {p.euroNorm !== "—" && <Badge tone="brand">{p.euroNorm}</Badge>}
              <Badge tone="neutral" icon={<Factory className="size-3.5" />}>
                {plant?.code}
              </Badge>
            </div>
            <KeyValue
              cols={3}
              items={[
                { label: t("d.model"), value: p.model ? `${p.oem} ${p.model}` : t("d.universal") },
                { label: t("d.oemRef"), value: <span className="tabular">{p.oemRef}</span> },
                { label: t("d.drawing"), value: p.drawingRev },
                { label: t("d.plant"), value: <span title={plant ? tx(plant.name, plant.nameTr) : ""}>{plant ? tx(plant.name, plant.nameTr) : p.plantId}</span> },
                { label: t("d.weight"), value: `${fmt.num(p.weightKg, 1)} kg` },
                { label: t("d.stdTime"), value: `${fmt.num(cycleTotal, 1)} ${t("routing.min")}` },
              ]}
            />
            <div className="mt-auto grid grid-cols-3 gap-3 rounded-xl bg-surface-2 p-4">
              <div>
                <div className="text-xs text-ink-3">{t("d.listPrice")}</div>
                <div className="tabular font-display text-2xl font-semibold text-ink">{fmt.eur(p.listPriceEur)}</div>
              </div>
              <div>
                <div className="text-xs text-ink-3">{t("d.unitCost")}</div>
                <div className="tabular font-display text-2xl font-semibold text-ink-2">{fmt.eur(p.unitCostEur)}</div>
              </div>
              <div>
                <div className="text-xs text-ink-3">{t("d.margin")}</div>
                <div className="tabular font-display text-2xl font-semibold text-ink">{fmt.pct(marginPct, 1)}</div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile
          label={t("kpi.demand")}
          value={fmt.num(p.monthlyDemand)}
          unit={t("common.pcs")}
          icon={<TrendingUp className="size-4" />}
          footer={<span className="text-ink-3">{t("kpi.demandFoot", { n: fmt.num(k.openOrderUnits) })}</span>}
        />
        <KpiTile
          label={t("kpi.stock")}
          value={fmt.num(p.stockQty)}
          unit={t("common.pcs")}
          icon={<PackageCheck className="size-4" />}
          footer={
            <span className={cn("inline-flex items-center gap-1", p.stockQty < p.safetyStock ? "text-critical-ink" : "text-ink-3")}>
              {p.stockQty < p.safetyStock && <AlertTriangle className="size-3.5" />}
              {t("kpi.stockFoot", { d: fmt.num(cover, 1), s: fmt.num(p.safetyStock) })}
            </span>
          }
        />
        <KpiTile
          label={t("kpi.openWo")}
          value={fmt.num(k.openWos)}
          icon={<ClipboardList className="size-4" />}
          footer={<span className="text-ink-3">{t("kpi.openWoFoot", { n: fmt.num(k.wipUnits) })}</span>}
        />
        <KpiTile
          label={t("kpi.fpy")}
          value={fmt.pct(k.fpy, 1)}
          icon={<ShieldCheck className="size-4" />}
          footer={<span className="text-ink-3">{t("kpi.fpyFoot", { n: fmt.num(k.inspections) })}</span>}
        />
        <KpiTile
          label={t("kpi.ncr")}
          value={fmt.num(k.ncr90)}
          icon={<Flame className="size-4" />}
          className="col-span-2 md:col-span-1"
          footer={
            k.ncrOpen > 0 ? (
              <Badge tone="critical" icon={<Flame className="size-3.5" />}>
                {t("kpi.ncrFoot", { n: k.ncrOpen })}
              </Badge>
            ) : (
              <span className="text-ink-3">{t("kpi.ncrFoot", { n: 0 })}</span>
            )
          }
        />
      </div>

      {/* BOM + cost */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t("bom.title")} subtitle={t("bom.subtitle", { n: p.bom.length })} icon={<Boxes className="size-4" />} />
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line text-left text-xs text-ink-3">
                  <th className="px-5 py-2 font-medium">{t("bom.material")}</th>
                  <th className="hidden px-3 py-2 font-medium 2xl:table-cell">{t("common.category")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("bom.qty")}</th>
                  <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">{t("bom.unitCost")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("bom.ext")}</th>
                  <th className="hidden px-5 py-2 font-medium md:table-cell">{t("bom.stock")}</th>
                </tr>
              </thead>
              <tbody>
                {bom.map(({ line, material: m, ext }) => (
                  <tr key={line.materialId} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5">
                      <IdLink href={`/inventory?material=${line.materialId}`}>{line.materialId}</IdLink>
                      <div className="max-w-64 truncate text-xs text-ink-3">{m ? tx(m.name, m.nameTr) : ""}</div>
                    </td>
                    <td className="hidden px-3 py-2.5 text-xs text-ink-2 2xl:table-cell">{m ? label("materialCategory", m.category) : ""}</td>
                    <td className="tabular px-3 py-2.5 text-right whitespace-nowrap">
                      {fmt.num(line.qtyPerUnit, 2)} <span className="text-xs text-ink-3">{m ? unit(m.unit) : ""}</span>
                    </td>
                    <td className="tabular hidden px-3 py-2.5 text-right text-ink-2 sm:table-cell">{m ? fmt.eur(m.unitCostEur, true) : "—"}</td>
                    <td className="tabular px-3 py-2.5 text-right font-medium">{fmt.eur(ext, true)}</td>
                    <td className="hidden px-5 py-2.5 md:table-cell">
                      {m && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="tabular text-xs whitespace-nowrap text-ink-2">
                            {fmt.compact(m.onHand)} / {fmt.compact(m.onHand - m.reserved)}
                          </span>
                          <StockBadge state={materialState(m)} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line bg-surface-2">
                  <td className="px-5 py-2.5 text-[13px] font-medium whitespace-nowrap text-ink-2">{t("bom.total")}</td>
                  <td className="hidden 2xl:table-cell" />
                  <td />
                  <td className="hidden sm:table-cell" />
                  <td className="tabular px-3 py-2.5 text-right font-semibold text-ink">{fmt.eur(materialCost, true)}</td>
                  <td className="hidden md:table-cell" />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("cost.title")} subtitle={t("cost.subtitle")} />
          <CardBody className="flex flex-col gap-5">
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-xs text-ink-3">{t("cost.unitCost")}</span>
                <span className="tabular font-display text-2xl font-semibold text-ink">{fmt.eur(stdCost, true)}</span>
              </div>
              <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={t("cost.title")}>
                {costParts.map((c) =>
                  c.value > 0 ? <div key={c.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ flex: c.value, background: c.color }} title={`${c.label}: ${fmt.eur(c.value, true)}`} /> : null,
                )}
              </div>
              <ChartLegend className="mt-2.5" items={costParts.map((c) => ({ label: c.label, color: c.color }))} />
            </div>
            <dl className="flex flex-col divide-y divide-line text-sm">
              {costParts.map((c) => (
                <div key={c.key} className="flex items-center justify-between py-2">
                  <dt className="flex items-center gap-2 text-ink-2">
                    <span className="size-2.5 rounded-sm" style={{ background: c.color }} />
                    {c.label}
                  </dt>
                  <dd className="tabular text-ink">
                    {fmt.eur(c.value, true)} <span className="ml-1 text-xs text-ink-3">{fmt.pct(c.value / Math.max(0.01, stdCost))}</span>
                  </dd>
                </div>
              ))}
              <div className="flex items-center justify-between py-2">
                <dt className="text-ink-2">{t("cost.listPrice")}</dt>
                <dd className="tabular font-medium text-ink">{fmt.eur(p.listPriceEur, true)}</dd>
              </div>
              <div className="flex items-center justify-between py-2">
                <dt className="font-medium text-ink">{t("cost.margin")}</dt>
                <dd className="tabular font-semibold text-ink">
                  {fmt.eur(margin, true)} <span className="ml-1 text-xs font-normal text-ink-3">{fmt.pct(marginPct, 1)}</span>
                </dd>
              </div>
              {k.avgPrice > 0 && (
                <>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-ink-2">
                      {t("cost.realized")}
                      <span className="block text-[11px] text-ink-3">{t("cost.realizedHint", { n: k.soldLines })}</span>
                    </dt>
                    <dd className="tabular text-ink">{fmt.eur(k.avgPrice, true)}</dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-ink-2">{t("cost.realizedMargin")}</dt>
                    <dd className="tabular font-medium text-ink">{fmt.pct(realizedPct, 1)}</dd>
                  </div>
                </>
              )}
            </dl>
          </CardBody>
        </Card>
      </div>

      {/* Routing */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={t("routing.title")}
            subtitle={t("routing.subtitle", { n: p.routing.length, min: fmt.num(cycleTotal, 1) })}
            icon={<Factory className="size-4" />}
            actions={<span className="hidden text-xs text-ink-3 sm:inline">{t("routing.rate")}</span>}
          />
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line text-left text-xs text-ink-3">
                  <th className="px-5 py-2 font-medium">{t("routing.seq")}</th>
                  <th className="px-3 py-2 font-medium">{t("routing.op")}</th>
                  <th className="hidden px-3 py-2 font-medium lg:table-cell">{t("routing.wc")}</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">{t("routing.machines")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("routing.setup")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("routing.cycle")}</th>
                  <th className="px-5 py-2 text-right font-medium">{t("routing.labour")}</th>
                </tr>
              </thead>
              <tbody>
                {p.routing.map((r) => (
                  <tr key={r.seq} className="border-b border-line last:border-0">
                    <td className="tabular px-5 py-2.5 text-ink-3">{r.seq}</td>
                    <td className="px-3 py-2.5 font-medium text-ink">{label("op", r.operation)}</td>
                    <td className="hidden px-3 py-2.5 text-ink-2 lg:table-cell">{label("wc", r.workCenterType)}</td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                        {(machinesByType.get(r.workCenterType) ?? []).map((mid) => (
                          <IdLink key={mid} href={`/shop-floor?machine=${mid}`} className="text-xs">
                            {mid}
                          </IdLink>
                        ))}
                      </span>
                    </td>
                    <td className="tabular px-3 py-2.5 text-right whitespace-nowrap text-ink-2">
                      {fmt.num(r.setupMin)} {t("routing.min")}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right whitespace-nowrap">
                      {fmt.num(r.cycleMin, 2)} {t("routing.min")}
                    </td>
                    <td className="tabular px-5 py-2.5 text-right">{fmt.eur(r.cycleMin * LABOUR_RATE, true)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line bg-surface-2 font-medium">
                  <td className="px-5 py-2.5 text-[13px] text-ink-2" colSpan={2}>
                    {t("routing.total")}
                  </td>
                  <td className="hidden lg:table-cell" />
                  <td className="hidden md:table-cell" />
                  <td className="tabular px-3 py-2.5 text-right text-ink-2">
                    {fmt.num(setupTotal)} {t("routing.min")}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right text-ink">
                    {fmt.num(cycleTotal, 2)} {t("routing.min")}
                  </td>
                  <td className="tabular px-5 py-2.5 text-right font-semibold text-ink">{fmt.eur(labourCost, true)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("routing.chart")} subtitle={t("routing.chartSub")} />
          <CardBody>
            <div style={{ height: Math.max(180, routingChart.length * 30 + 30) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={routingChart} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }}>
                  <CartesianGrid {...gridProps} horizontal={false} vertical />
                  <XAxis type="number" {...axisProps} tickFormatter={(v) => `${v}`} />
                  <YAxis type="category" dataKey="name" {...yAxisProps} width={150} interval={0} />
                  <Tooltip cursor={cursorProps} content={<ChartTooltip formatter={(v) => `${fmt.num(v, 2)} ${t("routing.min")}`} />} />
                  <Bar
                    dataKey="min"
                    name={t("routing.cycle")}
                    fill="var(--series-1)"
                    radius={barRadiusH}
                    maxBarSize={18}
                    label={{ position: "right", fill: "var(--ink-2)", fontSize: 11, formatter: (v: unknown) => `${fmt.num(Number(v), 1)} ${t("routing.min")}` }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Work orders + NCRs */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t("wo.title")} subtitle={t("wo.subtitle", { n: k.recent.length })} />
          {k.recent.length === 0 ? (
            <EmptyState icon={<ClipboardList className="size-5" />} title={t("wo.empty")} />
          ) : (
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-line text-left text-xs text-ink-3">
                    <th className="px-5 py-2 font-medium">{t("common.workOrder")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("common.qty")}</th>
                    <th className="hidden px-3 py-2 font-medium md:table-cell">{t("common.customer")}</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">{t("wo.planned")}</th>
                    <th className="px-3 py-2 font-medium">{t("common.due")}</th>
                    <th className="px-5 py-2 font-medium">{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {k.recent.map((w) => {
                    const late = w.status !== "completed" && isLate(w, clock.today);
                    const customer = w.customerId ? lk.customer.get(w.customerId) : undefined;
                    return (
                      <tr key={w.id} className="border-b border-line last:border-0">
                        <td className="px-5 py-2.5">
                          <IdLink href={`/work-orders/${w.id}`}>{w.id}</IdLink>
                        </td>
                        <td className="tabular px-3 py-2.5 text-right whitespace-nowrap">
                          {w.status === "completed" ? fmt.num(w.qtyDone) : fmt.num(w.qty)}
                          {w.status === "completed" && <span className="text-xs text-ink-3"> / {fmt.num(w.qty)}</span>}
                        </td>
                        <td className="hidden max-w-52 truncate px-3 py-2.5 text-ink-2 md:table-cell">{customer?.name ?? <span className="text-ink-3">{t("common.makeToStock")}</span>}</td>
                        <td className="tabular hidden px-3 py-2.5 whitespace-nowrap text-ink-2 sm:table-cell">
                          {fmt.date(w.plannedStart)} → {fmt.date(w.actualEnd ?? w.plannedEnd)}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={cn("tabular inline-flex items-center gap-1", late ? "font-medium text-critical-ink" : "text-ink-2")}>
                            {late && <AlertTriangle className="size-3.5" aria-label={t("common.late")} />}
                            {fmt.date(w.dueDate)}
                          </span>
                        </td>
                        <td className="px-5 py-2.5">
                          <StatusBadge kind="woStatus" value={w.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title={t("ncr.title")} subtitle={t("ncr.subtitle", { n: k.ncrs.length, open: k.ncrOpen })} />
          {k.ncrs.length === 0 ? (
            <EmptyState icon={<ShieldCheck className="size-5" />} title={t("ncr.empty")} />
          ) : (
            <div className="flex flex-col">
              {k.ncrs.slice(0, 6).map((n) => (
                <Link key={n.id} href={`/quality?ncr=${n.id}`} className="flex flex-col gap-1.5 border-t border-line px-5 py-3 hover:bg-surface-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="tabular text-sm font-medium text-brand">{n.id}</span>
                    <span className="tabular text-xs text-ink-3">{fmt.date(n.openedAt)}</span>
                  </div>
                  <p className="line-clamp-1 text-[13px] text-ink">{tx(n.title, n.titleTr)}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SeverityBadge value={n.severity} />
                    <StatusBadge kind="ncrStatus" value={n.status} />
                    <span className="text-xs text-ink-3">· {label("defect", n.defectType)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
