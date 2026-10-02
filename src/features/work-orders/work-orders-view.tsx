"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, CircleDot, Download, Loader, PauseCircle, Plus } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { DAY } from "@/lib/data/clock";
import { CATEGORY_LABELS } from "@/lib/data/labels";
import type { Customer, Priority, Product, ProductCategory, WorkOrder, WorkOrderOperation } from "@/lib/data/types";
import { isLate, useByPlant, useLookups } from "@/lib/hooks";
import { toast, useClock, useDb } from "@/lib/store";
import { PageContainer } from "@/components/layout/app-shell";
import {
  Badge,
  Button,
  Card,
  DataTable,
  IdLink,
  PageHeader,
  PriorityBadge,
  Progress,
  SearchInput,
  Select,
  StatusBadge,
  Tabs,
  type Column,
} from "@/components/ui";
import { messages } from "./messages";
import { NewWorkOrderModal } from "./new-work-order-modal";
import { MaterialStatusIcon, StatCard } from "./ui";
import { currentOp, goodOutput, inView, opsDone, parseView, PRIORITY_RANK, WO_VIEWS, type WoView } from "./wo-utils";

interface Row {
  wo: WorkOrder;
  product: Product;
  customer?: Customer;
  plantCode: string;
  cur?: WorkOrderOperation;
  done: number;
  good: number;
  late: boolean;
}

const STATUS_ORDER: Record<WorkOrder["status"], number> = { planned: 0, released: 1, in_progress: 2, quality_check: 3, on_hold: 4, completed: 5 };
const MAT_ORDER: Record<WorkOrder["materialStatus"], number> = { available: 0, partial: 1, short: 2 };
const PRIORITIES: Priority[] = ["urgent", "high", "normal", "low"];
const CATEGORIES = Object.keys(CATEGORY_LABELS) as ProductCategory[];

export function WorkOrdersView() {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const clock = useClock();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lk = useLookups();

  // The active view lives in the URL (?view=late) so links and reloads keep it.
  const view = parseView(searchParams.get("view"));
  const setView = (v: WoView) => {
    const p = new URLSearchParams(searchParams.toString());
    if (v === "open") p.delete("view");
    else p.set("view", v);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  };

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<"all" | ProductCategory>("all");
  const [priority, setPriority] = useState<"all" | Priority>("all");
  const [creating, setCreating] = useState(false);

  const workOrdersAll = useDb((db) => db.workOrders);
  const workOrders = useByPlant(workOrdersAll);

  const rows = useMemo<Row[]>(
    () =>
      workOrders.map((wo) => ({
        wo,
        product: lk.product.get(wo.productId)!,
        customer: wo.customerId ? lk.customer.get(wo.customerId) : undefined,
        plantCode: lk.plant.get(wo.plantId)?.code ?? wo.plantId,
        cur: wo.status === "completed" ? undefined : currentOp(wo),
        done: opsDone(wo),
        good: goodOutput(wo),
        late: isLate(wo, clock.today),
      })),
    [workOrders, lk, clock.today],
  );

  const kpi = useMemo(() => {
    const weekAgo = clock.now - 7 * DAY;
    const completed7 = rows.filter((r) => r.wo.status === "completed" && r.wo.actualEnd && Date.parse(r.wo.actualEnd) >= weekAgo);
    return {
      inProgress: rows.filter((r) => r.wo.status === "in_progress" || r.wo.status === "quality_check").length,
      released: rows.filter((r) => r.wo.status === "released").length,
      planned: rows.filter((r) => r.wo.status === "planned").length,
      onHold: rows.filter((r) => r.wo.status === "on_hold").length,
      late: rows.filter((r) => r.wo.status !== "completed" && r.late).length,
      completed7: completed7.length,
      good7: completed7.reduce((s, r) => s + r.wo.qtyDone, 0),
    };
  }, [rows, clock.now]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (category !== "all" && r.product.category !== category) return false;
      if (priority !== "all" && r.wo.priority !== priority) return false;
      if (!s) return true;
      return (
        r.wo.id.toLowerCase().includes(s) ||
        r.wo.lotNo.toLowerCase().includes(s) ||
        r.product.sku.toLowerCase().includes(s) ||
        r.product.name.toLowerCase().includes(s) ||
        (r.customer?.name.toLowerCase().includes(s) ?? false)
      );
    });
  }, [rows, q, category, priority]);

  const counts = useMemo(() => {
    const c = {} as Record<WoView, number>;
    for (const v of WO_VIEWS) c[v] = filtered.filter((r) => inView(v, r.wo.status, r.late)).length;
    return c;
  }, [filtered]);

  const visible = useMemo(() => filtered.filter((r) => inView(view, r.wo.status, r.late)), [filtered, view]);
  const hasFilters = q !== "" || category !== "all" || priority !== "all";

  const columns = useMemo<Column<Row>[]>(
    () => [
      {
        key: "id",
        header: t("common.workOrder"),
        sortValue: (r) => r.wo.id,
        cell: (r) => (
          <div>
            <IdLink href={`/work-orders/${r.wo.id}`}>{r.wo.id}</IdLink>
            <div className="text-[11px] text-ink-3 tabular">{r.wo.lotNo}</div>
          </div>
        ),
      },
      {
        key: "product",
        header: t("common.product"),
        sortValue: (r) => r.product.sku,
        cell: (r) => (
          <div className="max-w-64 min-w-40">
            <div className="font-semibold text-ink">{r.product.sku}</div>
            <div className="truncate text-xs text-ink-3" title={r.product.name}>
              {r.product.name}
            </div>
          </div>
        ),
      },
      {
        key: "customer",
        header: t("common.customer"),
        hideBelow: "lg",
        sortValue: (r) => r.customer?.name ?? "~",
        cell: (r) =>
          r.customer ? (
            <div className="max-w-48">
              <div className="truncate text-ink-2" title={r.customer.name}>
                {r.customer.name}
              </div>
              <div className="truncate text-[11px] text-ink-3">{tx(r.customer.country, r.customer.countryTr)}</div>
            </div>
          ) : (
            <span className="text-xs text-ink-3 italic">{t("common.makeToStock")}</span>
          ),
      },
      {
        key: "qty",
        header: t("col.qty"),
        align: "right",
        sortValue: (r) => r.wo.qty,
        cell: (r) => (
          <div className="whitespace-nowrap">
            <span className="font-medium text-ink">{fmt.num(r.good)}</span>
            <span className="text-ink-3"> / {fmt.num(r.wo.qty)}</span>
            {r.wo.qtyScrap > 0 && <div className="text-[11px] text-serious-ink">{t("scrapN", { n: fmt.num(r.wo.qtyScrap) })}</div>}
          </div>
        ),
      },
      {
        key: "progress",
        header: t("common.progress"),
        sortValue: (r) => r.done / r.wo.operations.length,
        cell: (r) => (
          <div className="w-40">
            <div className="flex items-center gap-2">
              <Progress
                value={r.done / r.wo.operations.length}
                size="sm"
                tone={r.wo.status === "completed" ? "good" : r.wo.status === "on_hold" ? "warn" : r.late ? "critical" : "brand"}
              />
              <span className="text-[11px] whitespace-nowrap text-ink-3 tabular">{t("opsDone", { done: r.done, total: r.wo.operations.length })}</span>
            </div>
            <div className="mt-1 flex items-center gap-1 truncate text-[11px] text-ink-2">
              {r.cur?.status === "running" && <span className="pulse-dot size-1.5 shrink-0 rounded-full bg-good" aria-hidden />}
              {r.cur ? label("op", r.cur.operation) : t("allOpsDone")}
            </div>
          </div>
        ),
      },
      {
        key: "where",
        header: t("col.where"),
        hideBelow: "md",
        sortValue: (r) => `${r.plantCode}${r.cur?.machineId ?? ""}`,
        cell: (r) => (
          <div className="text-xs whitespace-nowrap">
            <div className="font-medium text-ink">{r.plantCode}</div>
            <div className="text-ink-3 tabular">{r.cur?.machineId ?? "—"}</div>
          </div>
        ),
      },
      {
        key: "window",
        header: t("col.schedule"),
        hideBelow: "xl",
        sortValue: (r) => r.wo.plannedStart,
        cell: (r) => (
          <span className="text-xs whitespace-nowrap text-ink-2 tabular" title={`${fmt.dateTime(r.wo.plannedStart)} → ${fmt.dateTime(r.wo.plannedEnd)}`}>
            {fmt.date(r.wo.plannedStart)} <span className="text-ink-3">→</span> {fmt.date(r.wo.plannedEnd)}
          </span>
        ),
      },
      {
        key: "due",
        header: t("common.due"),
        sortValue: (r) => r.wo.dueDate,
        cell: (r) => (
          <div className="flex flex-col items-start gap-0.5 whitespace-nowrap">
            <span className={r.late ? "font-medium text-critical-ink tabular" : "text-ink-2 tabular"}>{fmt.date(r.wo.dueDate)}</span>
            {r.late && (
              <Badge tone="critical" icon={<AlertTriangle className="size-3" />} className="h-5 px-1.5 text-[11px]">
                {t("common.late")}
              </Badge>
            )}
          </div>
        ),
      },
      {
        key: "priority",
        header: t("common.priority"),
        hideBelow: "md",
        sortValue: (r) => 3 - PRIORITY_RANK[r.wo.priority],
        cell: (r) => <PriorityBadge value={r.wo.priority} compact />,
      },
      {
        key: "status",
        header: t("common.status"),
        sortValue: (r) => STATUS_ORDER[r.wo.status],
        cell: (r) => <StatusBadge kind="woStatus" value={r.wo.status} />,
      },
      {
        key: "material",
        header: t("col.material"),
        align: "center",
        hideBelow: "sm",
        sortValue: (r) => (r.wo.status === "completed" ? -1 : MAT_ORDER[r.wo.materialStatus]),
        cell: (r) => (r.wo.status === "completed" ? <span className="text-ink-3">—</span> : <MaterialStatusIcon value={r.wo.materialStatus} />),
      },
    ],
    [t, tx, fmt, label],
  );

  const exportCsv = () => {
    const header = ["work_order", "lot", "sku", "product", "customer", "plant", "qty", "good", "scrap", "status", "priority", "planned_start", "planned_end", "due", "late"];
    const esc = (v: string | number) => (/[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const lines = visible.map((r) =>
      [r.wo.id, r.wo.lotNo, r.product.sku, r.product.name, r.customer?.name ?? "", r.plantCode, r.wo.qty, r.good, r.wo.qtyScrap, r.wo.status, r.wo.priority, r.wo.plannedStart, r.wo.plannedEnd, r.wo.dueDate, r.late ? "yes" : "no"]
        .map(esc)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `work-orders-${view}-${clock.today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: t("exported", { n: visible.length }), tone: "info" });
  };

  const tabs = WO_VIEWS.map((v) => ({ value: v, label: t(`view.${v}`), count: counts[v] }));

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", { n: fmt.num(workOrders.length) })}
        actions={
          <>
            <Button icon={<Download className="size-4" />} onClick={exportCsv} disabled={!visible.length}>
              {t("exportCsv")}
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              {t("newWo")}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label={t("kpi.inProgress")}
          value={fmt.num(kpi.inProgress)}
          hint={t("kpi.inProgressHint")}
          icon={<Loader className="size-5" />}
          tone="brand"
          active={view === "in_progress"}
          onClick={() => setView(view === "in_progress" ? "open" : "in_progress")}
        />
        <StatCard
          label={t("kpi.released")}
          value={fmt.num(kpi.released)}
          hint={t("kpi.releasedHint")}
          icon={<CircleDot className="size-5" />}
          tone="brand"
          active={view === "released"}
          onClick={() => setView(view === "released" ? "open" : "released")}
        />
        <StatCard
          label={t("kpi.planned")}
          value={fmt.num(kpi.planned)}
          hint={t("kpi.plannedHint")}
          icon={<CalendarClock className="size-5" />}
          active={view === "planned"}
          onClick={() => setView(view === "planned" ? "open" : "planned")}
        />
        <StatCard
          label={t("kpi.onHold")}
          value={fmt.num(kpi.onHold)}
          hint={t("kpi.onHoldHint")}
          icon={<PauseCircle className="size-5" />}
          tone={kpi.onHold ? "warn" : "neutral"}
          active={view === "on_hold"}
          onClick={() => setView(view === "on_hold" ? "open" : "on_hold")}
        />
        <StatCard
          label={t("kpi.late")}
          value={fmt.num(kpi.late)}
          hint={t("kpi.lateHint")}
          icon={<AlertTriangle className="size-5" />}
          tone={kpi.late ? "critical" : "good"}
          active={view === "late"}
          onClick={() => setView(view === "late" ? "open" : "late")}
        />
        <StatCard
          label={t("kpi.completed7")}
          value={fmt.num(kpi.completed7)}
          hint={t("kpi.completed7Hint", { n: fmt.num(kpi.good7) })}
          icon={<CheckCircle2 className="size-5" />}
          tone="good"
          active={view === "completed"}
          onClick={() => setView(view === "completed" ? "open" : "completed")}
        />
      </div>

      <Card className="mt-4">
        <Tabs value={view} onChange={setView} tabs={tabs} className="px-2" />
        <div className="flex flex-col gap-2 border-b border-line px-4 py-3 md:flex-row md:items-center md:px-5">
          <SearchInput value={q} onChange={setQ} placeholder={t("search")} className="w-full md:max-w-sm" />
          <div className="grid grid-cols-2 gap-2 md:flex">
            <Select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="md:w-52" aria-label={t("common.category")}>
              <option value="all">{t("allCategories")}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {label("category", c)}
                </option>
              ))}
            </Select>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className="md:w-44" aria-label={t("common.priority")}>
              <option value="all">{t("allPriorities")}</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {label("priority", p)}
                </option>
              ))}
            </Select>
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQ("");
                setCategory("all");
                setPriority("all");
              }}
            >
              {t("clearFilters")}
            </Button>
          )}
          <span className="text-xs text-ink-3 tabular md:ml-auto">{t("resultCount", { n: fmt.num(visible.length) })}</span>
        </div>
        <DataTable
          key={view}
          rows={visible}
          columns={columns}
          rowKey={(r) => r.wo.id}
          onRowClick={(r) => router.push(`/work-orders/${r.wo.id}`)}
          pageSize={25}
          initialSort={view === "completed" ? { key: "due", dir: "desc" } : { key: "due", dir: "asc" }}
          rowClassName={(r) => (r.wo.status === "on_hold" ? "bg-warn-soft/30" : undefined)}
        />
      </Card>

      {creating && <NewWorkOrderModal onClose={() => setCreating(false)} />}
    </PageContainer>
  );
}
