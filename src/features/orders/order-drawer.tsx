"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  Check,
  CheckCircle2,
  Factory,
  Loader,
  PackageCheck,
  Plane,
  Rocket,
  Ship,
  Truck,
  Workflow,
} from "lucide-react";
import { useFmt, useLabel, useT } from "@/i18n";
import { daysBetween } from "@/lib/data/clock";
import type { Customer, SalesOrder } from "@/lib/data/types";
import { isLate, useLookups } from "@/lib/hooks";
import { actions, getDb, toast, useClock, useDb } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Badge, Button, Drawer, IdLink, KeyValue, PriorityBadge, Progress, SectionTitle, StatusBadge } from "@/components/ui";
import { ProductThumb } from "@/features/products/product-thumb";
import { ChannelBadge, CustomerCell, flagOf, MaterialStatusBadge } from "./bits";
import { messages } from "./messages";
import { isOpenForProduction, lineProgress, SO_FLOW } from "./utils";

export function OrderDrawer({ so, onClose, onShowCustomer }: { so: SalesOrder; onClose: () => void; onShowCustomer: (id: string) => void }) {
  const t = useT(messages);
  const label = useLabel();
  const lk = useLookups();
  const customer = lk.customer.get(so.customerId);
  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-2xl"
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="tabular">{so.id}</span>
          <StatusBadge kind="soStatus" value={so.status} />
        </span>
      }
      subtitle={
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden>{customer ? flagOf(customer.countryCode) : ""}</span>
          <span className="truncate">{customer?.name}</span>
          <span className="shrink-0">· {t("drawer.via", { channel: label("channel", so.channel) })}</span>
        </span>
      }
    >
      <OrderDetail key={so.id} so={so} customer={customer} onShowCustomer={onShowCustomer} />
    </Drawer>
  );
}

function OrderDetail({ so, customer, onShowCustomer }: { so: SalesOrder; customer?: Customer; onShowCustomer: (id: string) => void }) {
  const t = useT(messages);
  const fmt = useFmt();
  const clock = useClock();
  const lk = useLookups();
  const [released, setReleased] = useState<string[] | null>(null);

  const overdue = isOpenForProduction(so) && so.promisedDate < clock.today;
  const lines = useMemo(() => so.lines.map((l, i) => ({ line: l, product: lk.product.get(l.productId), ...lineProgress(so, i, lk.workOrder) })), [so, lk]);
  const workOrders = useMemo(() => so.workOrderIds.map((id) => lk.workOrder.get(id)).filter((w) => w !== undefined), [so, lk]);

  return (
    <div className="flex flex-col gap-6 px-5 py-5">
      {so.status === "new" && <ReleasePanel so={so} onReleased={setReleased} />}
      {released && <ReleasedPanel so={so} ids={released} />}

      <KeyValue
        cols={3}
        items={[
          { label: t("drawer.channel"), value: <ChannelBadge channel={so.channel} /> },
          { label: t("drawer.b2bRef"), value: so.b2bRef ? <span className="tabular">{so.b2bRef}</span> : <span className="text-ink-3">—</span> },
          { label: t("drawer.incoterm"), value: so.incoterm },
          { label: t("drawer.orderDate"), value: fmt.dateLong(so.orderDate) },
          { label: t("drawer.requested"), value: fmt.dateLong(so.requestedDate) },
          {
            label: t("drawer.promised"),
            value: (
              <span className={cn("inline-flex items-center gap-1", overdue && "text-critical-ink")} title={overdue ? t("drawer.overdue") : undefined}>
                {overdue && <AlertTriangle className="size-3.5" />}
                {fmt.dateLong(so.promisedDate)}
              </span>
            ),
          },
          { label: t("common.priority"), value: <PriorityBadge value={so.priority} compact /> },
          { label: t("drawer.total"), value: <span className="tabular">{fmt.eur(so.totalEur, true)}</span> },
          { label: t("col.lines"), value: so.lines.length },
        ]}
      />

      <section>
        <SectionTitle>{t("drawer.timeline")}</SectionTitle>
        <StatusStepper so={so} />
      </section>

      <section>
        <SectionTitle>{t("drawer.lines")}</SectionTitle>
        <div className="overflow-x-auto rounded-xl border border-line scroll-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left text-xs text-ink-3">
                <th className="px-3 py-2 font-medium">{t("common.product")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("common.qty")}</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">{t("drawer.unitPrice")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("drawer.lineTotal")}</th>
                <th className="w-36 px-3 py-2 font-medium">{t("common.produced")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ line, product, fraction, produced }, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="px-3 py-2.5">
                    {product ? (
                      <span className="flex min-w-0 items-center gap-2.5">
                        <ProductThumb product={product} width={44} />
                        <span className="min-w-0">
                          <IdLink href={`/products/${product.id}`} className="text-[13px]">
                            {product.sku}
                          </IdLink>
                          <span className="block max-w-56 truncate text-xs text-ink-3">{product.name}</span>
                        </span>
                      </span>
                    ) : (
                      line.productId
                    )}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right">{fmt.num(line.qty)}</td>
                  <td className="tabular hidden px-3 py-2.5 text-right text-ink-2 sm:table-cell">{fmt.eur(line.unitPriceEur, true)}</td>
                  <td className="tabular px-3 py-2.5 text-right font-medium">{fmt.eur(line.qty * line.unitPriceEur)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-1">
                      <span className="tabular text-xs text-ink-2">
                        {fmt.num(produced)} / {fmt.num(line.qty)}
                      </span>
                      <Progress value={fraction} size="sm" tone={fraction >= 1 ? "good" : overdue ? "critical" : "brand"} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-surface-2">
                <td className="px-3 py-2 text-xs font-medium text-ink-2" colSpan={2}>
                  {t("common.total")}
                </td>
                <td className="hidden sm:table-cell" />
                <td className="tabular px-3 py-2 text-right font-semibold text-ink">{fmt.eur(so.totalEur)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section>
        <SectionTitle>{t("drawer.workOrders")}</SectionTitle>
        {workOrders.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-[13px] text-ink-3">{t("drawer.noWorkOrders")}</p>
        ) : (
          <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {workOrders.map((wo) => {
              const p = lk.product.get(wo.productId);
              const late = wo.status !== "completed" && isLate(wo, clock.today);
              const fresh = released?.includes(wo.id);
              return (
                <div key={wo.id} className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3.5 py-2.5", fresh && "bg-brand-soft/60")}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <IdLink href={`/work-orders/${wo.id}`}>{wo.id}</IdLink>
                      <span className="text-xs text-ink-3">
                        {lk.plant.get(wo.plantId)?.code} · {p?.sku} × {fmt.num(wo.qty)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-ink-3">{t("drawer.plannedEnd", { d: fmt.dateTime(wo.actualEnd ?? wo.plannedEnd) })}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {wo.status !== "completed" && <MaterialStatusBadge value={wo.materialStatus} />}
                    {late ? (
                      <Badge tone="critical" icon={<AlertTriangle className="size-3.5" />}>
                        {t("common.late")}
                      </Badge>
                    ) : (
                      wo.status !== "completed" && (
                        <Badge tone="good" icon={<CalendarCheck className="size-3.5" />}>
                          {t("common.onTime")}
                        </Badge>
                      )
                    )}
                    <StatusBadge kind="woStatus" value={wo.status} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <ShipmentCard so={so} />
        {customer && <CustomerCard customer={customer} onShowCustomer={onShowCustomer} />}
      </div>
    </div>
  );
}

// ───────────────────────────── Release (B2B portal → production) ─────────────────────────────

function ReleasePanel({ so, onReleased }: { so: SalesOrder; onReleased: (ids: string[]) => void }) {
  const t = useT(messages);
  const fmt = useFmt();
  const lk = useLookups();
  const materials = useDb((db) => db.materials);
  const [busy, setBusy] = useState(false);

  const check = useMemo(() => {
    const matMap = new Map(materials.map((m) => [m.id, m]));
    const plants = new Set<string>();
    let ops = 0;
    let covered = 0;
    for (const line of so.lines) {
      const p = lk.product.get(line.productId);
      if (!p) continue;
      plants.add(lk.plant.get(p.plantId)?.code ?? p.plantId);
      ops += p.routing.length;
      const ok = p.bom.every((b) => {
        const m = matMap.get(b.materialId);
        return m ? m.onHand - m.reserved >= b.qtyPerUnit * line.qty : true;
      });
      if (ok) covered++;
    }
    return { plants: [...plants], ops, covered };
  }, [so, lk, materials]);

  const release = () => {
    setBusy(true);
    window.setTimeout(() => {
      const ids = actions.convertSalesOrder(so.id);
      setBusy(false);
      if (!ids.length) {
        toast({ tone: "critical", title: t("release.failed") });
        return;
      }
      const promised = getDb().salesOrders.find((s) => s.id === so.id)?.promisedDate ?? so.promisedDate;
      onReleased(ids);
      toast({
        tone: "good",
        title: t("release.toast", { id: so.id }),
        description: t("release.toastDesc", { n: ids.length, ids: ids.join(", "), date: fmt.date(promised) }),
      });
    }, 650);
  };

  const allCovered = check.covered === so.lines.length;

  return (
    <div className="rounded-xl border border-brand/30 bg-brand-soft/50 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-ink">
          <Workflow className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{so.channel === "b2b_portal" ? t("release.titlePortal") : t("release.titleOther")}</p>
          <p className="mt-0.5 text-[13px] text-ink-2">{t("release.desc")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="neutral" icon={<Factory className="size-3.5" />}>
              {t("release.plants")}: {check.plants.join(", ")}
            </Badge>
            <Badge tone="neutral" icon={<Workflow className="size-3.5" />}>
              {t("release.ops", { n: check.ops })}
            </Badge>
            <Badge tone={allCovered ? "good" : "warn"} icon={allCovered ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}>
              {t("release.material")}: {t("release.matOk", { n: check.covered, m: so.lines.length })}
            </Badge>
          </div>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="primary" onClick={release} disabled={busy} icon={busy ? <Loader className="size-4 animate-spin" /> : <Rocket className="size-4" />}>
          {busy ? t("release.checking") : t("release.button")}
        </Button>
      </div>
    </div>
  );
}

function ReleasedPanel({ so, ids }: { so: SalesOrder; ids: string[] }) {
  const t = useT(messages);
  const fmt = useFmt();
  const late = daysBetween(so.requestedDate, so.promisedDate);
  return (
    <div className="animate-fade-in rounded-xl border border-good/30 bg-good-soft p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-good" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{t("release.doneTitle")}</p>
            <p className="mt-0.5 text-[13px] text-ink-2">{t("release.doneDesc", { n: ids.length })}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {ids.map((id) => (
                <IdLink key={id} href={`/work-orders/${id}`} className="text-[13px]">
                  {id}
                </IdLink>
              ))}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-3">{t("release.promised")}</div>
          <div className="font-display text-xl font-semibold text-ink">{fmt.dateLong(so.promisedDate)}</div>
          {late > 0 ? (
            <Badge tone="warn" icon={<AlertTriangle className="size-3.5" />} className="mt-1">
              {t("release.after", { n: late })}
            </Badge>
          ) : (
            <Badge tone="good" icon={<CalendarCheck className="size-3.5" />} className="mt-1">
              {t("release.meets")}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Status stepper ─────────────────────────────

function StatusStepper({ so }: { so: SalesOrder }) {
  const label = useLabel();
  const fmt = useFmt();
  const lk = useLookups();
  const clock = useClock();
  const idx = SO_FLOW.indexOf(so.status);

  const dates = useMemo(() => {
    const wos = so.workOrderIds.map((id) => lk.workOrder.get(id)).filter((w) => w !== undefined);
    const starts = wos.map((w) => w.actualStart).filter((x): x is string => !!x).sort();
    const ends = wos.map((w) => w.actualEnd).filter((x): x is string => !!x).sort();
    const allDone = wos.length > 0 && wos.every((w) => w.status === "completed");
    const created = wos.map((w) => w.createdAt).sort();
    return {
      new: so.orderDate,
      confirmed: idx >= 1 ? (created[0] && Date.parse(created[0]) <= clock.now ? created[0] : so.orderDate) : undefined,
      in_production: idx >= 2 ? starts[0] : undefined,
      ready: idx >= 3 && allDone ? ends[ends.length - 1] : undefined,
      shipped: so.shipment?.shippedAt,
      delivered: so.status === "delivered" ? so.shipment?.eta : undefined,
    } as Record<string, string | undefined>;
  }, [so, lk, idx, clock.now]);

  return (
    <ol className="grid grid-cols-6 gap-1">
      {SO_FLOW.map((s, i) => {
        const done = i < idx || (i === idx && s === "delivered");
        const current = i === idx && !done;
        const reached = i <= idx;
        return (
          <li key={s} className="relative flex flex-col items-center text-center">
            {i > 0 && <span className={cn("absolute top-3 right-1/2 left-[-50%] h-0.5 -translate-y-1/2", reached ? "bg-good" : "bg-line")} aria-hidden />}
            <span
              className={cn(
                "relative z-[1] flex size-6 items-center justify-center rounded-full text-[11px] font-semibold",
                done && "bg-good text-white",
                current && "bg-brand text-brand-ink ring-4 ring-brand/20",
                !reached && "border-2 border-line bg-surface text-ink-3",
              )}
            >
              {done ? <Check className="size-3.5" /> : current ? <ArrowRight className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("mt-1.5 text-[11px] leading-tight", current ? "font-semibold text-ink" : reached ? "text-ink-2" : "text-ink-3")}>{label("soStatus", s)}</span>
            {dates[s] && <span className="tabular mt-0.5 text-[10px] text-ink-3">{fmt.date(dates[s]!)}</span>}
          </li>
        );
      })}
    </ol>
  );
}

// ───────────────────────────── Shipment + customer ─────────────────────────────

const MODE_ICON = { truck: Truck, sea: Ship, air: Plane };

function ShipmentCard({ so }: { so: SalesOrder }) {
  const t = useT(messages);
  const fmt = useFmt();
  const s = so.shipment;
  const Icon = s ? MODE_ICON[s.mode] : PackageCheck;
  return (
    <div className="rounded-xl border border-line p-4">
      <SectionTitle>{t("drawer.shipment")}</SectionTitle>
      {s ? (
        <>
          <div className="mb-3 flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-surface-3 text-ink-2">
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">{t(`mode.${s.mode}`)}</div>
              <div className="text-xs text-ink-3">
                {so.status === "delivered" ? (
                  <span className="inline-flex items-center gap-1 text-good-ink">
                    <CheckCircle2 className="size-3.5" />
                    {t("drawer.delivered", { d: fmt.date(s.eta) })}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Truck className="size-3.5" />
                    {t("drawer.inTransit")}
                  </span>
                )}
              </div>
            </div>
          </div>
          <KeyValue
            items={[
              { label: t("drawer.carrier"), value: s.carrier },
              { label: t("drawer.tracking"), value: <span className="tabular">{s.tracking}</span> },
              { label: t("drawer.shipped"), value: fmt.dateLong(s.shippedAt) },
              { label: t("drawer.eta"), value: fmt.dateLong(s.eta) },
            ]}
          />
        </>
      ) : (
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-surface-3 text-ink-3">
            <Icon className="size-5" />
          </span>
          <div>
            <div className="text-sm font-medium text-ink">{t("drawer.notShipped")}</div>
            <div className="text-xs text-ink-3">{t("drawer.plannedShip", { d: fmt.date(so.promisedDate), incoterm: so.incoterm })}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerCard({ customer, onShowCustomer }: { customer: Customer; onShowCustomer: (id: string) => void }) {
  const t = useT(messages);
  const fmt = useFmt();
  const label = useLabel();
  const orders = useDb((db) => db.salesOrders);
  const stats = useMemo(() => {
    const mine = orders.filter((o) => o.customerId === customer.id);
    const open = mine.filter((o) => o.status !== "delivered");
    return { count: mine.length, openCount: open.length, openValue: open.reduce((s, o) => s + o.totalEur, 0) };
  }, [orders, customer.id]);
  return (
    <div className="rounded-xl border border-line p-4">
      <SectionTitle>{t("drawer.customer")}</SectionTitle>
      <CustomerCell customer={customer} className="mb-3" />
      <KeyValue
        items={[
          { label: t("cust.segment"), value: t(`segment.${customer.segment}`) },
          { label: t("cust.since"), value: customer.since },
          { label: t("cust.creditLimit"), value: fmt.eur(customer.creditLimitEur) },
          { label: t("cust.channel"), value: label("channel", customer.channel) },
          { label: t("cust.orders"), value: fmt.num(stats.count) },
          { label: t("cust.open"), value: <span className="tabular">{t("cust.openValue", { n: stats.openCount, v: fmt.eurCompact(stats.openValue) })}</span> },
        ]}
      />
      <Button variant="ghost" size="sm" className="mt-2 -ml-2" onClick={() => onShowCustomer(customer.id)} icon={<ArrowRight className="size-3.5" />}>
        {t("cust.viewOrders")}
      </Button>
    </div>
  );
}
