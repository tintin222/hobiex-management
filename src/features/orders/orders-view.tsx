"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Boxes, CalendarCheck, Inbox, Loader, Plug, RefreshCw, ShoppingCart, Wallet, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { addDays, MIN } from "@/lib/data/clock";
import { COUNTRIES } from "@/lib/data/catalog";
import type { Channel, Customer, SalesOrder, SalesOrderStatus } from "@/lib/data/types";
import { useLookups, usePlantFilter } from "@/lib/hooks";
import { toast, useClock, useDb } from "@/lib/store";
import { cn } from "@/lib/cn";
import { PageContainer } from "@/components/layout/app-shell";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  KpiTile,
  PageHeader,
  PriorityBadge,
  Progress,
  SearchInput,
  Select,
  StatusBadge,
  Tabs,
  type Column,
} from "@/components/ui";
import { axisProps, barRadiusH, ChartTooltip, cursorProps, gridProps, yAxisProps } from "@/components/charts/theme";
import { CHANNEL_COLOR, CHANNEL_ICON, CHANNELS, ChannelBadge, CustomerCell } from "./bits";
import { messages } from "./messages";
import { OrderDrawer } from "./order-drawer";
import { useUrlParams, useUrlUpdate } from "./url-state";
import { isOpenForProduction, orderBacklogUnits, orderInPlant, orderProgress, SO_FLOW } from "./utils";

type StatusTab = "all" | SalesOrderStatus;

interface OrderRow {
  so: SalesOrder;
  customer?: Customer;
  progress: number;
  overdue: boolean;
}

export function OrdersView() {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const clock = useClock();
  const lk = useLookups();
  const plant = usePlantFilter();
  const url = useUrlParams("status", "id", "customer");
  const update = useUrlUpdate();

  const ordersAll = useDb((db) => db.salesOrders);
  const customers = useDb((db) => db.customers);

  const status: StatusTab = url.status && (SO_FLOW as string[]).includes(url.status) ? (url.status as SalesOrderStatus) : "all";
  const openId = url.id;
  const customerId = url.customer;

  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState<Channel | "all">("all");
  const [country, setCountry] = useState("all");

  const orders = useMemo(() => ordersAll.filter((o) => orderInPlant(o, plant, lk.product)), [ordersAll, plant, lk]);

  // ── KPIs ──
  const k = useMemo(() => {
    const today = clock.today;
    const from30 = addDays(today, -29);
    const open = orders.filter((o) => o.status !== "delivered");
    const last30 = orders.filter((o) => o.orderDate >= from30);
    const fresh = orders.filter((o) => o.status === "new");
    const shipped = orders.filter((o) => o.shipment);
    const onTime = shipped.filter((o) => o.shipment!.shippedAt <= o.promisedDate).length;
    const prodOpen = orders.filter((o) => isOpenForProduction(o) && o.status !== "ready" && o.status !== "new");
    const backlog = orders.reduce((s, o) => s + orderBacklogUnits(o, lk.workOrder), 0);
    const trend = Array.from({ length: 30 }, (_, i) => {
      const d = addDays(today, -29 + i);
      return last30.filter((o) => o.orderDate === d).length;
    });
    const todayBy = (c: Channel) => orders.filter((o) => o.orderDate === today && o.channel === c).length;
    const value30 = last30.reduce((s, o) => s + o.totalEur, 0);
    const portal30 = last30.filter((o) => o.channel === "b2b_portal").reduce((s, o) => s + o.totalEur, 0);
    return {
      openValue: open.reduce((s, o) => s + o.totalEur, 0),
      openCount: open.length,
      count30: last30.length,
      value30,
      trend,
      newCount: fresh.length,
      newValue: fresh.reduce((s, o) => s + o.totalEur, 0),
      onTimePct: shipped.length ? onTime / shipped.length : 1,
      onTime,
      shippedCount: shipped.length,
      backlog,
      backlogOrders: prodOpen.length + fresh.length,
      portalToday: todayBy("b2b_portal"),
      ediToday: todayBy("edi"),
      emailToday: todayBy("email"),
      portalShare: value30 ? portal30 / value30 : 0,
    };
  }, [orders, clock.today, lk]);

  // ── Charts ──
  const byCountry = useMemo(() => {
    const from = addDays(clock.today, -89);
    const m = new Map<string, { value: number; count: number }>();
    for (const o of orders) {
      if (o.orderDate < from) continue;
      const cc = lk.customer.get(o.customerId)?.countryCode ?? "??";
      const e = m.get(cc) ?? { value: 0, count: 0 };
      e.value += o.totalEur;
      e.count += 1;
      m.set(cc, e);
    }
    const rows = [...m.entries()]
      .map(([cc, v]) => ({ cc, name: `${COUNTRIES[cc]?.flag ?? ""} ${tx(COUNTRIES[cc]?.en ?? cc, COUNTRIES[cc]?.tr)}`, value: Math.round(v.value), count: v.count }))
      .sort((a, b) => b.value - a.value);
    return { top: rows.slice(0, 10), total: rows.length };
  }, [orders, clock.today, lk, tx]);

  const byChannel = useMemo(() => {
    const from = addDays(clock.today, -89);
    const rows = CHANNELS.map((c) => {
      const os = orders.filter((o) => o.channel === c && o.orderDate >= from);
      return { channel: c, count: os.length, value: os.reduce((s, o) => s + o.totalEur, 0) };
    });
    const total = rows.reduce((s, r) => s + r.value, 0);
    return rows.map((r) => ({ ...r, share: total ? r.value / total : 0 }));
  }, [orders, clock.today]);

  const digitalShare = byChannel.filter((c) => c.channel === "b2b_portal" || c.channel === "edi").reduce((s, c) => s + c.share, 0);

  // ── Table ──
  const countries = useMemo(() => {
    const ccs = [...new Set(customers.map((c) => c.countryCode))];
    return ccs.map((cc) => ({ cc, name: tx(COUNTRIES[cc]?.en ?? cc, COUNTRIES[cc]?.tr) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, tx]);

  const filterCustomer = customerId ? lk.customer.get(customerId) : undefined;

  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (customerId && o.customerId !== customerId) return false;
      if (channel !== "all" && o.channel !== channel) return false;
      const c = lk.customer.get(o.customerId);
      if (country !== "all" && c?.countryCode !== country) return false;
      if (q && !o.id.toLowerCase().includes(q) && !o.b2bRef?.toLowerCase().includes(q) && !c?.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orders, customerId, channel, country, query, lk]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: base.length };
    for (const s of SO_FLOW) m[s] = 0;
    for (const o of base) m[o.status] += 1;
    return m;
  }, [base]);

  const rows: OrderRow[] = useMemo(
    () =>
      base
        .filter((o) => status === "all" || o.status === status)
        .map((so) => ({
          so,
          customer: lk.customer.get(so.customerId),
          progress: orderProgress(so, lk.workOrder),
          overdue: isOpenForProduction(so) && so.promisedDate < clock.today,
        })),
    [base, status, lk, clock.today],
  );
  const rowsValue = useMemo(() => rows.reduce((s, r) => s + r.so.totalEur, 0), [rows]);

  const columns: Column<OrderRow>[] = useMemo(
    () => [
      {
        key: "id",
        header: t("col.order"),
        sortValue: (r) => r.so.id,
        cell: (r) => <span className="tabular font-medium whitespace-nowrap text-brand">{r.so.id}</span>,
      },
      {
        key: "b2b",
        header: t("col.b2bRef"),
        hideBelow: "2xl",
        cell: (r) => (r.so.b2bRef ? <span className="tabular text-xs whitespace-nowrap text-ink-2">{r.so.b2bRef}</span> : <span className="text-ink-3">—</span>),
      },
      {
        key: "customer",
        header: t("common.customer"),
        sortValue: (r) => r.customer?.name ?? "",
        cell: (r) => <CustomerCell customer={r.customer} />,
      },
      { key: "channel", header: t("col.channel"), hideBelow: "lg", sortValue: (r) => r.so.channel, cell: (r) => <ChannelBadge channel={r.so.channel} /> },
      {
        key: "orderDate",
        header: t("col.ordered"),
        hideBelow: "md",
        sortValue: (r) => r.so.orderDate + r.so.id,
        cell: (r) => <span className="tabular whitespace-nowrap text-ink-2">{fmt.date(r.so.orderDate)}</span>,
      },
      {
        key: "promised",
        header: t("col.promised"),
        sortValue: (r) => r.so.promisedDate,
        cell: (r) => (
          <span className={cn("tabular inline-flex items-center gap-1 whitespace-nowrap", r.overdue ? "font-medium text-critical-ink" : "text-ink-2")}>
            {r.overdue && <AlertTriangle className="size-3.5" aria-label={t("drawer.overdue")} />}
            {fmt.date(r.so.promisedDate)}
          </span>
        ),
      },
      { key: "lines", header: t("col.lines"), align: "right", hideBelow: "2xl", sortValue: (r) => r.so.lines.length, cell: (r) => r.so.lines.length },
      {
        key: "value",
        header: t("col.value"),
        align: "right",
        sortValue: (r) => r.so.totalEur,
        cell: (r) => <span className="font-medium whitespace-nowrap">{fmt.eur(r.so.totalEur)}</span>,
      },
      {
        key: "progress",
        header: t("common.progress"),
        hideBelow: "md",
        sortValue: (r) => r.progress,
        cell: (r) => (
          <div className="flex w-28 items-center gap-2">
            <Progress value={r.progress} size="sm" tone={r.progress >= 1 ? "good" : r.overdue ? "critical" : "brand"} />
            <span className="tabular w-9 text-right text-xs text-ink-3">{fmt.pct(r.progress)}</span>
          </div>
        ),
      },
      {
        key: "priority",
        header: t("common.priority"),
        hideBelow: "lg",
        sortValue: (r) => ["low", "normal", "high", "urgent"].indexOf(r.so.priority),
        cell: (r) => <PriorityBadge value={r.so.priority} compact />,
      },
      { key: "status", header: t("common.status"), sortValue: (r) => SO_FLOW.indexOf(r.so.status), cell: (r) => <StatusBadge kind="soStatus" value={r.so.status} /> },
    ],
    [t, fmt],
  );

  const selected = openId ? lk.salesOrder.get(openId) : undefined;
  const setStatus = (s: StatusTab) => update({ status: s === "all" ? null : s });

  return (
    <PageContainer>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <PortalBanner
        portalToday={k.portalToday}
        ediToday={k.ediToday}
        emailToday={k.emailToday}
        awaiting={k.newCount}
        portalShare={k.portalShare}
        onReview={() => setStatus("new")}
      />

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile
          label={t("kpi.openValue")}
          value={fmt.eurCompact(k.openValue)}
          icon={<Wallet className="size-4" />}
          footer={<span className="text-ink-3">{t("kpi.openFoot", { n: fmt.num(k.openCount) })}</span>}
        />
        <KpiTile
          label={t("kpi.orders30")}
          value={fmt.num(k.count30)}
          icon={<ShoppingCart className="size-4" />}
          trend={k.trend}
          footer={<span className="text-ink-3">{t("kpi.orders30Foot", { v: fmt.eurCompact(k.value30) })}</span>}
        />
        <KpiTile
          label={t("kpi.awaiting")}
          value={fmt.num(k.newCount)}
          icon={<Inbox className="size-4" />}
          onClick={() => setStatus("new")}
          footer={
            k.newCount > 0 ? (
              <Badge tone="brand" icon={<Inbox className="size-3.5" />}>
                {t("kpi.awaitingFoot", { v: fmt.eurCompact(k.newValue) })}
              </Badge>
            ) : undefined
          }
        />
        <KpiTile
          label={t("kpi.onTime")}
          value={fmt.pct(k.onTimePct, 1)}
          icon={<CalendarCheck className="size-4" />}
          footer={<span className="text-ink-3">{t("kpi.onTimeFoot", { n: fmt.num(k.onTime), m: fmt.num(k.shippedCount) })}</span>}
        />
        <KpiTile
          label={t("kpi.backlog")}
          value={fmt.num(k.backlog)}
          unit={t("common.pcs")}
          icon={<Boxes className="size-4" />}
          className="col-span-2 md:col-span-1"
          footer={<span className="text-ink-3">{t("kpi.backlogFoot", { n: fmt.num(k.backlogOrders) })}</span>}
        />
      </div>

      {/* Charts */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t("country.title")} subtitle={t("country.subtitle", { n: byCountry.total })} />
          <CardBody>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCountry.top} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }}>
                  <CartesianGrid {...gridProps} horizontal={false} vertical />
                  <XAxis type="number" {...axisProps} tickFormatter={(v) => fmt.eurCompact(v)} />
                  <YAxis type="category" dataKey="name" {...yAxisProps} width={150} interval={0} />
                  <Tooltip
                    cursor={cursorProps}
                    content={
                      <ChartTooltip
                        formatter={(v, _n, item) => `${fmt.eur(v)} · ${t("channel.orders", { n: Number((item.payload as { count?: number })?.count ?? 0) })}`}
                      />
                    }
                  />
                  <Bar
                    dataKey="value"
                    name={t("country.value")}
                    fill="var(--series-1)"
                    radius={barRadiusH}
                    maxBarSize={18}
                    label={{ position: "right", fill: "var(--ink-2)", fontSize: 11, formatter: (v: unknown) => fmt.eurCompact(Number(v)) }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardBody>
        </Card>

        <Card className="flex flex-col">
          <CardHeader title={t("channel.title")} subtitle={t("channel.subtitle")} />
          <CardBody className="flex flex-1 flex-col gap-5">
            <div>
              <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={t("channel.subtitle")}>
                {byChannel.map((c) =>
                  c.value > 0 ? (
                    <div
                      key={c.channel}
                      className="h-full first:rounded-l-full last:rounded-r-full"
                      style={{ flex: c.value, background: CHANNEL_COLOR[c.channel] }}
                      title={`${label("channel", c.channel)}: ${fmt.pct(c.share, 1)}`}
                    />
                  ) : null,
                )}
              </div>
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {byChannel.map((c) => {
                const Icon = CHANNEL_ICON[c.channel];
                return (
                  <li key={c.channel} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="size-2.5 shrink-0 rounded-sm" style={{ background: CHANNEL_COLOR[c.channel] }} />
                    <Icon className="size-4 shrink-0 text-ink-3" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">{label("channel", c.channel)}</div>
                      <div className="text-xs text-ink-3">{t("channel.orders", { n: fmt.num(c.count) })}</div>
                    </div>
                    <div className="text-right">
                      <div className="tabular text-sm font-semibold text-ink">{fmt.pct(c.share, 1)}</div>
                      <div className="tabular text-xs text-ink-3">{fmt.eurCompact(c.value)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-auto flex items-center gap-3 rounded-lg bg-brand-soft px-3.5 py-3">
              <span className="font-display text-2xl font-semibold text-brand-soft-ink tabular">{fmt.pct(digitalShare)}</span>
              <p className="text-xs text-ink-2">
                <span className="font-medium text-ink">{t("channel.digital")}</span> · {t("channel.note")}
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Orders table */}
      <Card className="mt-4">
        <Tabs
          className="px-3"
          value={status}
          onChange={setStatus}
          tabs={(["all", ...SO_FLOW] as StatusTab[]).map((s) => ({ value: s, label: s === "all" ? t("common.all") : label("soStatus", s), count: counts[s] }))}
        />
        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          <SearchInput value={query} onChange={setQuery} placeholder={t("filter.search")} className="w-full sm:w-72" />
          <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel | "all")} className="w-full sm:w-44" aria-label={t("col.channel")}>
            <option value="all">{t("filter.allChannels")}</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {label("channel", c)}
              </option>
            ))}
          </Select>
          <Select value={country} onChange={(e) => setCountry(e.target.value)} className="w-full sm:w-48" aria-label={t("filter.allCountries")}>
            <option value="all">{t("filter.allCountries")}</option>
            {countries.map((c) => (
              <option key={c.cc} value={c.cc}>
                {COUNTRIES[c.cc]?.flag} {c.name}
              </option>
            ))}
          </Select>
          {filterCustomer && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft pr-1 pl-3 text-[13px] text-brand-soft-ink">
              {t("filter.customer", { name: filterCustomer.name })}
              <button
                type="button"
                onClick={() => update({ customer: null })}
                className="rounded-full p-1 hover:bg-brand/10"
                aria-label={t("filter.clearCustomer")}
                title={t("filter.clearCustomer")}
              >
                <X className="size-3.5" />
              </button>
            </span>
          )}
          <span className="tabular ml-auto text-xs text-ink-3">{t("results", { n: fmt.num(rows.length), v: fmt.eurCompact(rowsValue) })}</span>
        </div>
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.so.id}
          onRowClick={(r) => update({ id: r.so.id })}
          initialSort={{ key: "orderDate", dir: "desc" }}
          rowClassName={(r) => (r.so.id === openId ? "bg-brand-soft/40" : r.so.status === "new" ? "bg-brand-soft/20" : undefined)}
          className="border-t border-line"
        />
      </Card>

      {selected && <OrderDrawer so={selected} onClose={() => update({ id: null })} onShowCustomer={(id) => update({ customer: id, id: null, status: null })} />}
    </PageContainer>
  );
}

// ───────────────────────────── B2B portal integration banner ─────────────────────────────

function PortalBanner({
  portalToday,
  ediToday,
  emailToday,
  awaiting,
  portalShare,
  onReview,
}: {
  portalToday: number;
  ediToday: number;
  emailToday: number;
  awaiting: number;
  portalShare: number;
  onReview: () => void;
}) {
  const t = useT(messages);
  const fmt = useFmt();
  const clock = useClock();
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  const sync = () => {
    setSyncing(true);
    window.setTimeout(() => {
      setSyncing(false);
      setSyncedAt(Date.now());
      toast({ tone: "good", title: t("portal.synced"), description: t("portal.syncedDesc", { n: awaiting }) });
    }, 900);
  };

  const lastSync = syncedAt ? t("portal.justNow") : fmt.relative(clock.now - 2 * MIN, clock.now);
  const stats: { label: string; value: number; tone?: "brand" }[] = [
    { label: t("portal.today"), value: portalToday },
    { label: t("portal.ediToday"), value: ediToday },
    { label: t("portal.emailToday"), value: emailToday },
    { label: t("portal.awaiting"), value: awaiting, tone: "brand" },
  ];

  return (
    <Card className="overflow-hidden border-brand/25 bg-gradient-to-r from-brand-soft via-surface to-surface">
      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-ink shadow-sm">
            <Plug className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h2 className="text-[15px] font-semibold text-ink">{t("portal.title")}</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-2 py-0.5 text-xs font-medium text-good-ink">
                <span className="pulse-dot size-1.5 rounded-full bg-good" />
                {t("portal.live")}
              </span>
              <span className="text-xs text-ink-3">{t("portal.lastSync", { t: lastSync })}</span>
            </div>
            <p className="mt-1 max-w-3xl text-[13px] text-ink-2">{t("portal.explain")}</p>
            <p className="mt-1 text-xs text-ink-3">{t("portal.share", { pct: fmt.pct(portalShare) })}</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:shrink-0">
          <dl className="grid grid-cols-4 gap-2">
            {stats.map((s) => (
              <div key={s.label} className={cn("min-w-[72px] rounded-lg border px-2.5 py-1.5", s.tone === "brand" ? "border-brand/30 bg-brand-soft" : "border-line bg-surface")}>
                <dt className="truncate text-[11px] text-ink-3">{s.label}</dt>
                <dd className={cn("tabular font-display text-lg leading-tight font-semibold", s.tone === "brand" ? "text-brand-soft-ink" : "text-ink")}>{fmt.num(s.value)}</dd>
              </div>
            ))}
          </dl>
          <div className="flex gap-2">
            <Button size="sm" onClick={sync} disabled={syncing} icon={syncing ? <Loader className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}>
              {syncing ? t("portal.syncing") : t("portal.syncNow")}
            </Button>
            {awaiting > 0 && (
              <Button size="sm" variant="primary" onClick={onReview} icon={<ArrowRight className="size-3.5" />}>
                {t("portal.review")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
