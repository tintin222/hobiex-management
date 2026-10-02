"use client";

import Link from "next/link";
import { Fragment, useMemo, type ReactNode } from "react";
import { Boxes, CalendarClock, CheckCircle2, Download, Flame, Loader, PackageSearch, Siren, Truck, Warehouse, type LucideIcon } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { useClock, useDb, toast } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Badge, Card, CardHeader, DataTable, EmptyState, IdLink, KeyValue, StatusBadge, type Column, type Tone } from "@/components/ui";
import { SERIES } from "@/components/charts/theme";
import { downloadText, incomingInspectionFor, recallFor, toCsv, type AffectedCustomer, type AffectedWo, type Bucket, type LotHit } from "./genealogy";
import { messages } from "./messages";

const BUCKETS: Bucket[] = ["customer", "fg", "wip", "planned"];
const BUCKET_STYLE: Record<Bucket, [LucideIcon, Tone, string]> = {
  customer: [Truck, "serious", SERIES[0]],
  fg: [Warehouse, "warn", SERIES[1]],
  wip: [Loader, "brand", SERIES[2]],
  planned: [CalendarClock, "neutral", SERIES[3]],
};

/** Replace {placeholders} in a template with React nodes. */
function rich(template: string, vars: Record<string, ReactNode>) {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return <Fragment key={i}>{m ? vars[m[1]] ?? part : part}</Fragment>;
  });
}

function BucketBadge({ bucket }: { bucket: Bucket }) {
  const t = useT(messages);
  const [Icon, tone] = BUCKET_STYLE[bucket];
  return (
    <Badge tone={tone} icon={<Icon className="size-3.5" />}>
      {t(`bucket.${bucket}`)}
    </Badge>
  );
}

export function RecallView({ hits, by, query, onTrace }: { hits: LotHit[]; by: "heat" | "lot"; query: string; onTrace: (q: string) => void }) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const clock = useClock();
  const db = useDb((d) => d);
  const recall = useMemo(() => recallFor(db, hits), [db, hits]);

  const what = by === "heat" ? t("recall.heat", { id: query }) : t("recall.lot", { id: query });
  const strong = (v: string) => <span className="text-critical-ink">{v}</span>;
  const sentence = rich(t("recall.sentence"), {
    units: strong(fmt.num(recall.units)),
    unitsW: t(recall.units === 1 ? "w.unit" : "w.units"),
    customers: strong(fmt.num(recall.customers.length)),
    customersW: t(recall.customers.length === 1 ? "w.customer" : "w.customers"),
    countries: strong(fmt.num(recall.countries.length)),
    countriesW: t(recall.countries.length === 1 ? "w.country" : "w.countries"),
  });

  const exportCsv = () => {
    const header = [t("col.heat"), t("col.material"), t("col.wo"), t("col.lot"), t("col.product"), t("col.name"), t("col.plant"), t("col.start"), t("col.units"), t("col.location"), t("col.so"), t("col.customer"), t("col.country"), t("col.carrier"), t("col.tracking"), t("col.shippedAt"), t("col.eta")];
    const rows = recall.rows.map((r) => [
      r.hit.lot.heatNo ?? r.hit.lot.lotNo,
      r.hit.material.id,
      r.wo.id,
      r.wo.lotNo,
      r.product.sku,
      r.product.name,
      r.wo.plantId,
      r.start,
      r.units,
      t(`bucket.${r.bucket}`),
      r.so?.id ?? "",
      r.customer?.name ?? t("mts"),
      r.customer ? tx(r.customer.country, r.customer.countryTr) : "",
      r.so?.shipment?.carrier ?? "",
      r.so?.shipment?.tracking ?? "",
      r.so?.shipment?.shippedAt ?? "",
      r.so?.shipment?.eta ?? "",
    ]);
    const file = `containment_${query}_${clock.today}.csv`;
    downloadText(file, toCsv([header, ...rows]));
    toast({ tone: "good", title: t("recall.exported"), description: t("recall.exportedHint", { n: recall.rows.length, file }) });
  };

  const woColumns = useMemo<Column<AffectedWo>[]>(
    () => [
      { key: "wo", header: t("col.wo"), cell: (r) => <span className="tabular font-medium whitespace-nowrap text-brand">{r.wo.id}</span>, sortValue: (r) => r.wo.id },
      { key: "lot", header: t("col.lot"), cell: (r) => <span className="tabular text-ink-2">{r.wo.lotNo}</span>, hideBelow: "lg" },
      { key: "product", header: t("col.product"), cell: (r) => <span className="tabular whitespace-nowrap text-ink-2">{r.product.sku}</span>, sortValue: (r) => r.product.sku, hideBelow: "sm" },
      { key: "start", header: t("col.start"), cell: (r) => <span className="tabular whitespace-nowrap text-ink-2">{fmt.date(r.start)}</span>, sortValue: (r) => r.start, hideBelow: "md" },
      { key: "units", header: t("col.units"), cell: (r) => fmt.num(r.units), sortValue: (r) => r.units, align: "right" },
      { key: "location", header: t("col.location"), cell: (r) => <BucketBadge bucket={r.bucket} />, sortValue: (r) => BUCKETS.indexOf(r.bucket) },
      {
        key: "customer",
        header: t("col.customer"),
        cell: (r) => (r.customer ? <span className="block max-w-52 truncate text-ink">{r.customer.name}</span> : <span className="text-ink-3">{t("mts")}</span>),
        sortValue: (r) => r.customer?.name ?? "",
        hideBelow: "md",
      },
      { key: "so", header: t("col.so"), cell: (r) => (r.so ? <IdLink href={`/orders?id=${r.so.id}`}>{r.so.id}</IdLink> : <span className="text-ink-3">—</span>), hideBelow: "xl" },
      {
        key: "shipment",
        header: t("col.shipment"),
        cell: (r) =>
          r.so?.shipment ? (
            <span className="block whitespace-nowrap">
              <span className="tabular block text-[13px] text-ink">{r.so.shipment.tracking}</span>
              <span className="block text-xs text-ink-3">
                {r.so.shipment.carrier} · {t("del.eta")} {fmt.date(r.so.shipment.eta)}
              </span>
            </span>
          ) : r.so ? (
            <StatusBadge kind="soStatus" value={r.so.status} />
          ) : (
            <span className="text-ink-3">—</span>
          ),
        hideBelow: "lg",
      },
      { key: "value", header: t("col.value"), cell: (r) => fmt.eur(r.value), sortValue: (r) => r.value, align: "right", hideBelow: "xl" },
    ],
    [t, fmt],
  );

  const custColumns = useMemo<Column<AffectedCustomer>[]>(
    () => [
      {
        key: "customer",
        header: t("col.customer"),
        cell: (c) => (
          <span className="block min-w-0">
            <span className="block max-w-60 truncate font-medium text-ink">{c.customer.name}</span>
            <span className="block text-xs text-ink-3">{c.customer.city}</span>
          </span>
        ),
        sortValue: (c) => c.customer.name,
      },
      {
        key: "country",
        header: t("col.country"),
        cell: (c) => (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink-2">
            <span className="rounded bg-surface-3 px-1 text-[10px] font-semibold text-ink-2">{c.customer.countryCode}</span>
            {tx(c.customer.country, c.customer.countryTr)}
          </span>
        ),
        sortValue: (c) => c.customer.country,
        hideBelow: "sm",
      },
      { key: "units", header: t("col.units"), cell: (c) => fmt.num(c.units), sortValue: (c) => c.units, align: "right" },
      { key: "shipped", header: t("col.shipped"), cell: (c) => <span className={cn(c.shippedUnits > 0 ? "font-medium text-serious-ink" : "text-ink-3")}>{fmt.num(c.shippedUnits)}</span>, sortValue: (c) => c.shippedUnits, align: "right", hideBelow: "md" },
      { key: "orders", header: t("col.orders"), cell: (c) => <span className="tabular text-xs text-ink-2">{c.salesOrders.join(", ") || "—"}</span>, hideBelow: "lg" },
      { key: "tracking", header: t("col.tracking"), cell: (c) => <span className="tabular text-xs text-ink-2">{c.trackings.join(", ") || "—"}</span>, hideBelow: "xl" },
      { key: "value", header: t("col.value"), cell: (c) => fmt.eur(c.value), sortValue: (c) => c.value, align: "right", hideBelow: "md" },
    ],
    [t, tx, fmt],
  );

  const totalBucket = BUCKETS.reduce((s, b) => s + recall.byBucket[b], 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Suspect lot(s) */}
      {hits.map(({ material, lot }) => {
        const insp = incomingInspectionFor(db.inspections, material, lot);
        return (
          <Card key={material.id + lot.lotNo}>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <Flame className="size-4 text-ink-3" />
                  {t("recall.lotCard")}
                  <span className="tabular font-normal text-ink-3">· {lot.heatNo ?? lot.lotNo}</span>
                </span>
              }
              subtitle={`${tx(material.name, material.nameTr)} · ${label("materialCategory", material.category)}`}
              actions={
                <Link href={`/inventory?material=${material.id}`} className="text-[13px] font-medium text-brand hover:underline">
                  {t("lot.openInventory")}
                </Link>
              }
            />
            <div className="px-5 pb-5">
              <KeyValue
                cols={4}
                items={[
                  { label: t("lot.material"), value: <IdLink href={`/inventory?material=${material.id}`}>{material.id}</IdLink> },
                  { label: t("lot.supplier"), value: material.supplier },
                  { label: t("mat.lot"), value: <span className="tabular">{lot.lotNo}</span> },
                  { label: t("mat.heat"), value: <span className="tabular">{lot.heatNo ?? "—"}</span> },
                  { label: t("lot.received"), value: <span className="tabular">{fmt.dateLong(lot.receivedAt)}</span> },
                  { label: t("lot.qty"), value: <span className="tabular">{`${fmt.num(lot.qty)} ${material.unit}`}</span> },
                  { label: t("lot.cert"), value: lot.certificate },
                  { label: t("lot.incoming"), value: insp ? <StatusBadge kind="inspectionResult" value={insp.result} /> : <span className="text-ink-3">—</span> },
                ]}
              />
            </div>
          </Card>
        );
      })}

      {recall.rows.length === 0 ? (
        <Card>
          <EmptyState icon={<CheckCircle2 className="size-5" />} title={t("recall.none")} hint={t("recall.noneHint")} />
        </Card>
      ) : (
        <>
          {/* Headline */}
          <Card className="overflow-hidden border-critical/40">
            <div className="flex items-center gap-2 border-b border-critical/20 bg-critical-soft px-5 py-2.5 text-[13px] font-semibold text-critical-ink">
              <Siren className="size-4" />
              {t("recall.badge")}
            </div>
            <div className="flex flex-col justify-between gap-5 p-5 lg:flex-row lg:items-end">
              <div className="min-w-0">
                <p className="text-sm text-ink-2">{t("recall.headline", { what })}</p>
                <p className="mt-1 font-display text-2xl leading-tight font-semibold tracking-tight text-ink sm:text-3xl">{sentence}</p>
                <p className="mt-2 text-sm text-ink-3">
                  {t("recall.ready")}
                  {recall.plannedUnits > 0 && <span className="ml-1">{t("recall.planned", { n: fmt.num(recall.plannedUnits) })}</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-base font-medium text-brand-ink shadow-sm hover:bg-brand-hover"
              >
                <Download className="size-5" />
                {t("recall.export")}
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-5">
              {[
                [t("recall.unitsAffected"), fmt.num(recall.units)],
                [t("recall.wos"), fmt.num(recall.rows.filter((r) => r.bucket !== "planned").length)],
                [t("recall.customersN"), fmt.num(recall.customers.length)],
                [t("recall.countriesN"), fmt.num(recall.countries.length)],
                [t("recall.value"), fmt.eurCompact(recall.value)],
              ].map(([k, v], i) => (
                <div key={i} className="bg-surface px-5 py-3 last:col-span-2 sm:last:col-span-1">
                  <dt className="truncate text-xs text-ink-3">{k}</dt>
                  <dd className="mt-0.5 font-display text-xl font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Where the units are */}
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title={t("recall.where")} icon={<Boxes className="size-4" />} />
              <div className="px-5 pb-5">
                <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full bg-surface-3">
                  {BUCKETS.map((b) =>
                    recall.byBucket[b] > 0 ? <div key={b} style={{ flex: recall.byBucket[b], background: BUCKET_STYLE[b][2] }} title={`${t(`bucket.${b}`)}: ${fmt.num(recall.byBucket[b])}`} /> : null,
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {BUCKETS.map((b) => {
                    const [Icon] = BUCKET_STYLE[b];
                    return (
                      <div key={b} className="rounded-lg bg-surface-2 px-3 py-2">
                        <div className="flex items-center gap-1.5 text-xs text-ink-2">
                          <span className="size-2.5 rounded-sm" style={{ background: BUCKET_STYLE[b][2] }} />
                          <Icon className="size-3.5 text-ink-3" />
                          <span className="truncate">{t(`bucket.${b}`)}</span>
                        </div>
                        <div className="mt-1 flex items-baseline gap-1.5">
                          <span className="tabular text-lg font-semibold text-ink">{fmt.num(recall.byBucket[b])}</span>
                          <span className="text-xs text-ink-3">{totalBucket ? fmt.pct(recall.byBucket[b] / totalBucket) : ""}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader title={t("recall.countriesN")} subtitle={t("recall.affectedCustomers") + ` · ${fmt.num(recall.customers.length)}`} />
              <div className="flex flex-wrap gap-1.5 px-5 pb-5">
                {recall.countries.map((c) => (
                  <span key={c.code} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 text-xs">
                    <span className="font-semibold text-ink-2">{c.code}</span>
                    <span className="text-ink-2">{tx(c.name, c.nameTr)}</span>
                    <span className="tabular text-ink-3">{fmt.num(c.units)}</span>
                  </span>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title={t("recall.affectedWos")} subtitle={fmt.num(recall.rows.length)} icon={<PackageSearch className="size-4" />} />
            <DataTable rows={recall.rows} columns={woColumns} rowKey={(r) => r.wo.id} onRowClick={(r) => onTrace(r.wo.id)} pageSize={10} dense />
          </Card>
          <Card>
            <CardHeader title={t("recall.affectedCustomers")} subtitle={fmt.num(recall.customers.length)} icon={<Truck className="size-4" />} />
            <DataTable rows={recall.customers} columns={custColumns} rowKey={(c) => c.customer.id} initialSort={{ key: "units", dir: "desc" }} pageSize={10} dense />
          </Card>
        </>
      )}
    </div>
  );
}
