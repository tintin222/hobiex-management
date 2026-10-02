"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertOctagon, AlertTriangle, Boxes, CheckCircle2, Factory, PackageCheck, PackageOpen, Timer, Truck, Wallet } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { DAY } from "@/lib/data/clock";
import type { Material, MaterialCategory, Product, StockMovement } from "@/lib/data/types";
import { useByPlant, useLookups, usePlantFilter } from "@/lib/hooks";
import { useClock, useDb } from "@/lib/store";
import { PageContainer } from "@/components/layout/app-shell";
import { Badge, Card, DataTable, IdLink, KpiTile, PageHeader, PersonChip, SearchInput, Segmented, Select, Tabs, type Column } from "@/components/ui";
import { MATERIAL_CATEGORY_LABELS } from "@/lib/data/labels";
import { ProductThumb } from "@/features/products/product-thumb";
import { useUrlParams, useUrlUpdate } from "@/features/orders/url-state";
import { MaterialDrawer, MovementRef } from "./material-drawer";
import { messages } from "./messages";
import { MOVEMENT_TYPES, MovementTypeBadge, SignedQty } from "./movement-bits";
import { CoverCell, fgCover, fgState, materialCover, materialState, type StockState, useUnit } from "./stock";

type Tab = "materials" | "movements" | "fg";
const TABS: Tab[] = ["materials", "movements", "fg"];

export function InventoryView() {
  const t = useT(messages);
  const fmt = useFmt();
  const clock = useClock();
  const lk = useLookups();
  const plant = usePlantFilter();
  const url = useUrlParams("tab", "material");
  const update = useUrlUpdate();

  const materialsAll = useDb((db) => db.materials);
  const productsAll = useDb((db) => db.products);
  const movementsAll = useDb((db) => db.stockMovements);
  const products = useByPlant(productsAll);

  const tab: Tab = url.tab && (TABS as string[]).includes(url.tab) ? (url.tab as Tab) : "materials";
  const selected = url.material ? lk.material.get(url.material) : undefined;

  /** With a plant selected, show the materials that plant's BOMs consume. */
  const materials = useMemo(() => {
    if (plant === "all") return materialsAll;
    const used = new Set(products.flatMap((p) => p.bom.map((b) => b.materialId)));
    return materialsAll.filter((m) => used.has(m.id));
  }, [materialsAll, products, plant]);

  const movements = useMemo(() => {
    if (plant === "all") return movementsAll;
    const ids = new Set(materials.map((m) => m.id));
    return movementsAll.filter((m) => ids.has(m.materialId));
  }, [movementsAll, materials, plant]);

  const k = useMemo(() => {
    const value = materials.reduce((s, m) => s + m.onHand * m.unitCostEur, 0);
    const fgValue = products.reduce((s, p) => s + p.stockQty * p.unitCostEur, 0);
    const belowRop = materials.filter((m) => m.onHand < m.reorderPoint).length;
    const belowSafety = materials.filter((m) => m.onHand < m.safetyStock).length;
    const since = clock.now - 7 * DAY;
    const receipts = movements.filter((m) => m.type === "receipt" && Date.parse(m.at) >= since);
    const receiptValue = receipts.reduce((s, r) => s + r.qty * (lk.material.get(r.materialId)?.unitCostEur ?? 0), 0);
    const covers = materials.map((m) => Math.min(materialCover(m), 120));
    const avgCover = covers.length ? covers.reduce((a, b) => a + b, 0) / covers.length : 0;
    return { value, fgValue, belowRop, belowSafety, receipts: receipts.length, receiptValue, avgCover };
  }, [materials, products, movements, clock.now, lk]);

  const plantCode = plant === "all" ? "" : (lk.plant.get(plant)?.code ?? plant);

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          plant !== "all" ? (
            <Badge tone="brand" icon={<Factory className="size-3.5" />}>
              {t("plantNote", { plant: plantCode })}
            </Badge>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile
          label={t("kpi.value")}
          value={fmt.eurCompact(k.value)}
          icon={<Wallet className="size-4" />}
          footer={<span className="text-ink-3">{t("kpi.valueFoot", { fg: fmt.eurCompact(k.fgValue) })}</span>}
        />
        <KpiTile
          label={t("kpi.belowRop")}
          value={fmt.num(k.belowRop)}
          icon={<AlertTriangle className="size-4" />}
          onClick={() => update({ tab: null, stock: "warn" })}
          footer={<span className="text-ink-3">{t("kpi.belowRopFoot", { n: materials.length })}</span>}
        />
        <KpiTile
          label={t("kpi.belowSafety")}
          value={fmt.num(k.belowSafety)}
          icon={<AlertOctagon className="size-4" />}
          onClick={() => update({ tab: null, stock: "critical" })}
          footer={
            k.belowSafety > 0 ? (
              <Badge tone="critical" icon={<AlertOctagon className="size-3.5" />}>
                {t("kpi.atRisk")}
              </Badge>
            ) : (
              <Badge tone="good" icon={<CheckCircle2 className="size-3.5" />}>
                {t("kpi.allSafe")}
              </Badge>
            )
          }
        />
        <KpiTile
          label={t("kpi.receipts")}
          value={fmt.num(k.receipts)}
          icon={<Truck className="size-4" />}
          onClick={() => update({ tab: "movements", type: "receipt" })}
          footer={<span className="text-ink-3">{t("kpi.receiptsFoot", { v: fmt.eurCompact(k.receiptValue) })}</span>}
        />
        <KpiTile
          label={t("kpi.cover")}
          value={fmt.num(k.avgCover, 1)}
          unit={t("days")}
          icon={<Timer className="size-4" />}
          className="col-span-2 md:col-span-1"
          footer={<span className="text-ink-3">{t("kpi.coverFoot")}</span>}
        />
      </div>

      <Card className="mt-4">
        <Tabs
          className="px-3"
          value={tab}
          onChange={(v) => update({ tab: v === "materials" ? null : v })}
          tabs={[
            { value: "materials", label: t("tab.materials"), count: materials.length, icon: <Boxes className="size-4" /> },
            { value: "movements", label: t("tab.movements"), count: movements.length, icon: <PackageOpen className="size-4" /> },
            { value: "fg", label: t("tab.fg"), count: products.length, icon: <PackageCheck className="size-4" /> },
          ]}
        />
        {tab === "materials" && <MaterialsTab materials={materials} onOpen={(id) => update({ material: id })} openId={url.material} />}
        {tab === "movements" && <MovementsTab movements={movements} onOpen={(id) => update({ material: id })} />}
        {tab === "fg" && <FinishedGoodsTab products={products} />}
      </Card>

      {selected && <MaterialDrawer material={selected} onClose={() => update({ material: null })} />}
    </PageContainer>
  );
}

// ───────────────────────────── Materials ─────────────────────────────

type StockFilter = "all" | "warn" | "critical" | "ok";

function MaterialsTab({ materials, onOpen, openId }: { materials: Material[]; onOpen: (id: string) => void; openId: string | null }) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const unit = useUnit();
  const url = useUrlParams("stock", "category");
  const update = useUrlUpdate();
  const [query, setQuery] = useState("");

  const stock: StockFilter = url.stock === "warn" || url.stock === "critical" || url.stock === "ok" ? url.stock : "all";
  const category = url.category && url.category in MATERIAL_CATEGORY_LABELS ? (url.category as MaterialCategory) : "all";

  const categories = useMemo(() => [...new Set(materials.map((m) => m.category))], [materials]);

  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return materials.filter((m) => {
      if (category !== "all" && m.category !== category) return false;
      if (q && ![m.code, m.name, m.nameTr, m.supplier].some((s) => s.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [materials, category, query]);

  const counts = useMemo(() => {
    const c = { all: base.length, warn: 0, critical: 0, ok: 0 };
    for (const m of base) {
      const s = materialState(m);
      if (s === "ok") c.ok++;
      else {
        c.warn++; // "below reorder" includes everything under the reorder point
        if (s === "critical") c.critical++;
      }
    }
    return c;
  }, [base]);

  const rows = useMemo(
    () =>
      base.filter((m) => {
        const s = materialState(m);
        if (stock === "warn") return s !== "ok";
        if (stock === "critical") return s === "critical";
        if (stock === "ok") return s === "ok";
        return true;
      }),
    [base, stock],
  );

  const columns: Column<Material>[] = useMemo(
    () => [
      { key: "code", header: t("col.code"), sortValue: (m) => m.code, cell: (m) => <span className="tabular font-medium whitespace-nowrap text-brand">{m.code}</span> },
      {
        key: "name",
        header: t("col.material"),
        sortValue: (m) => tx(m.name, m.nameTr),
        cell: (m) => (
          <div className="min-w-0">
            <div className="max-w-64 truncate text-sm text-ink">{tx(m.name, m.nameTr)}</div>
            <div className="truncate text-xs text-ink-3 xl:hidden">{label("materialCategory", m.category)}</div>
          </div>
        ),
      },
      {
        key: "category",
        header: t("common.category"),
        hideBelow: "2xl",
        sortValue: (m) => m.category,
        cell: (m) => <span className="block max-w-44 truncate text-xs text-ink-2">{label("materialCategory", m.category)}</span>,
      },
      {
        key: "onHand",
        header: t("col.onHand"),
        align: "right",
        sortValue: (m) => m.onHand * m.unitCostEur,
        cell: (m) => (
          <span className="whitespace-nowrap">
            <span className="font-medium">{fmt.num(m.onHand)}</span> <span className="text-xs text-ink-3">{unit(m.unit)}</span>
          </span>
        ),
      },
      { key: "reserved", header: t("col.reserved"), align: "right", hideBelow: "2xl", sortValue: (m) => m.reserved, cell: (m) => <span className="text-ink-2">{fmt.num(m.reserved)}</span> },
      { key: "available", header: t("col.available"), align: "right", hideBelow: "md", sortValue: (m) => m.onHand - m.reserved, cell: (m) => fmt.num(m.onHand - m.reserved) },
      {
        key: "onOrder",
        header: t("col.onOrder"),
        align: "right",
        hideBelow: "2xl",
        sortValue: (m) => m.onOrder,
        cell: (m) => (m.onOrder > 0 ? <span className="text-ink-2">{fmt.num(m.onOrder)}</span> : <span className="text-ink-3">—</span>),
      },
      { key: "rop", header: t("col.rop"), align: "right", hideBelow: "xl", sortValue: (m) => m.reorderPoint, cell: (m) => <span className="text-ink-2">{fmt.num(m.reorderPoint)}</span> },
      {
        key: "cover",
        header: t("col.cover"),
        sortValue: (m) => materialCover(m),
        cell: (m) => <CoverCell days={materialCover(m)} state={materialState(m)} />,
      },
      { key: "location", header: t("col.location"), hideBelow: "2xl", sortValue: (m) => m.location, cell: (m) => <span className="tabular text-xs whitespace-nowrap text-ink-2">{m.location}</span> },
      {
        key: "supplier",
        header: t("col.supplier"),
        hideBelow: "2xl",
        sortValue: (m) => m.supplier,
        cell: (m) => (
          <span className="block max-w-40 truncate text-xs text-ink-2" title={m.supplier}>
            {m.supplier}
          </span>
        ),
      },
      {
        key: "lead",
        header: t("col.leadTime"),
        align: "right",
        hideBelow: "xl",
        sortValue: (m) => m.leadTimeDays,
        cell: (m) => <span className="whitespace-nowrap text-ink-2">{t("daysN", { n: m.leadTimeDays })}</span>,
      },
    ],
    [t, tx, fmt, label, unit],
  );

  const stockOptions: { value: StockFilter; label: string; count: number }[] = [
    { value: "all", label: t("stock.all"), count: counts.all },
    { value: "warn", label: t("stock.warn"), count: counts.warn },
    { value: "critical", label: t("stock.critical"), count: counts.critical },
    { value: "ok", label: t("stock.ok"), count: counts.ok },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
        <SearchInput value={query} onChange={setQuery} placeholder={t("filter.search")} className="w-full sm:w-72" />
        <Select value={category} onChange={(e) => update({ category: e.target.value === "all" ? null : e.target.value })} className="w-full sm:w-56" aria-label={t("common.category")}>
          <option value="all">{t("filter.allCategories")}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {label("materialCategory", c)}
            </option>
          ))}
        </Select>
        <div className="max-w-full overflow-x-auto scroll-thin">
          <Segmented value={stock} onChange={(v) => update({ stock: v === "all" ? null : v })} options={stockOptions} />
        </div>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(m) => m.id}
        onRowClick={(m) => onOpen(m.id)}
        initialSort={{ key: "cover", dir: "asc" }}
        rowClassName={(m) => (m.id === openId ? "bg-brand-soft/40" : undefined)}
        pageSize={50}
        className="border-t border-line"
      />
    </>
  );
}

// ───────────────────────────── Movements ─────────────────────────────

function MovementsTab({ movements, onOpen }: { movements: StockMovement[]; onOpen: (materialId: string) => void }) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const lk = useLookups();
  const unit = useUnit();
  const url = useUrlParams("type");
  const update = useUrlUpdate();
  const type: StockMovement["type"] | "all" = url.type && (MOVEMENT_TYPES as string[]).includes(url.type) ? (url.type as StockMovement["type"]) : "all";
  const setType = (v: StockMovement["type"] | "all") => update({ type: v === "all" ? null : v });
  const [query, setQuery] = useState("");

  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return movements;
    return movements.filter((mv) => {
      const m = lk.material.get(mv.materialId);
      return [mv.ref, mv.materialId, m?.name ?? "", m?.nameTr ?? ""].some((s) => s.toLowerCase().includes(q));
    });
  }, [movements, query, lk]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: base.length };
    for (const tp of MOVEMENT_TYPES) c[tp] = 0;
    for (const mv of base) c[mv.type] += 1;
    return c;
  }, [base]);

  const rows = useMemo(() => (type === "all" ? base : base.filter((mv) => mv.type === type)), [base, type]);

  const columns: Column<StockMovement>[] = useMemo(
    () => [
      { key: "at", header: t("col.time"), sortValue: (mv) => mv.at, cell: (mv) => <span className="tabular whitespace-nowrap text-ink-2">{fmt.dateTime(mv.at)}</span> },
      { key: "type", header: t("common.type"), sortValue: (mv) => mv.type, cell: (mv) => <MovementTypeBadge type={mv.type} /> },
      {
        key: "material",
        header: t("col.material"),
        sortValue: (mv) => mv.materialId,
        cell: (mv) => {
          const m = lk.material.get(mv.materialId);
          return (
            <div className="min-w-0">
              <div className="tabular text-sm font-medium text-brand">{mv.materialId}</div>
              <div className="max-w-64 truncate text-xs text-ink-3">{m ? tx(m.name, m.nameTr) : ""}</div>
            </div>
          );
        },
      },
      {
        key: "qty",
        header: t("common.qty"),
        align: "right",
        sortValue: (mv) => mv.qty,
        cell: (mv) => {
          const m = lk.material.get(mv.materialId);
          return <SignedQty qty={mv.qty} type={mv.type} unit={m ? unit(m.unit) : undefined} />;
        },
      },
      { key: "ref", header: t("col.ref"), hideBelow: "md", sortValue: (mv) => mv.ref, cell: (mv) => <MovementRef value={mv.ref} /> },
      { key: "user", header: t("col.user"), hideBelow: "lg", cell: (mv) => <PersonChip id={mv.userId} size={22} /> },
    ],
    [t, tx, fmt, lk, unit],
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
        <SearchInput value={query} onChange={setQuery} placeholder={t("filter.mvSearch")} className="w-full sm:w-72" />
        <div className="max-w-full overflow-x-auto scroll-thin">
          <Segmented
            value={type}
            onChange={setType}
            options={[{ value: "all" as const, label: t("stock.all"), count: counts.all }, ...MOVEMENT_TYPES.map((tp) => ({ value: tp, label: t(`mv.${tp}`), count: counts[tp] }))]}
          />
        </div>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(mv) => mv.id}
        onRowClick={(mv) => onOpen(mv.materialId)}
        initialSort={{ key: "at", dir: "desc" }}
        pageSize={30}
        dense
        className="border-t border-line"
      />
    </>
  );
}

// ───────────────────────────── Finished goods ─────────────────────────────

function FinishedGoodsTab({ products }: { products: Product[] }) {
  const t = useT(messages);
  const router = useRouter();
  const fmt = useFmt();
  const label = useLabel();
  const lk = useLookups();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<StockState | "all">("all");

  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? products.filter((p) => [p.sku, p.name, p.oemRef].some((s) => s.toLowerCase().includes(q))) : products;
  }, [products, query]);
  const counts = useMemo(() => {
    const c = { all: base.length, critical: 0, warn: 0, ok: 0 };
    for (const p of base) c[fgState(p)]++;
    return c;
  }, [base]);
  const rows = useMemo(() => (state === "all" ? base : base.filter((p) => fgState(p) === state)), [base, state]);

  const columns: Column<Product>[] = useMemo(
    () => [
      {
        key: "sku",
        header: t("common.sku"),
        sortValue: (p) => p.sku,
        cell: (p) => (
          <span className="flex items-center gap-2.5">
            <ProductThumb product={p} width={40} />
            <IdLink href={`/products/${p.id}`}>{p.sku}</IdLink>
          </span>
        ),
      },
      { key: "name", header: t("common.product"), hideBelow: "md", sortValue: (p) => p.name, cell: (p) => <span className="block max-w-72 truncate">{p.name}</span> },
      { key: "category", header: t("common.category"), hideBelow: "xl", sortValue: (p) => p.category, cell: (p) => <span className="text-xs text-ink-2">{label("category", p.category)}</span> },
      { key: "plant", header: t("common.plant"), hideBelow: "lg", sortValue: (p) => p.plantId, cell: (p) => <span className="tabular text-xs text-ink-2">{lk.plant.get(p.plantId)?.code}</span> },
      { key: "stock", header: t("col.stock"), align: "right", sortValue: (p) => p.stockQty, cell: (p) => <span className="font-medium">{fmt.num(p.stockQty)}</span> },
      { key: "safety", header: t("col.safety"), align: "right", hideBelow: "sm", sortValue: (p) => p.safetyStock, cell: (p) => <span className="text-ink-2">{fmt.num(p.safetyStock)}</span> },
      { key: "demand", header: t("col.demand"), align: "right", hideBelow: "lg", sortValue: (p) => p.monthlyDemand, cell: (p) => <span className="text-ink-2">{fmt.num(p.monthlyDemand)}</span> },
      { key: "cover", header: t("col.cover"), sortValue: (p) => fgCover(p), cell: (p) => <CoverCell days={fgCover(p)} state={fgState(p)} fg scaleDays={10} /> },
    ],
    [t, fmt, label, lk],
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
        <SearchInput value={query} onChange={setQuery} placeholder={t("filter.fgSearch")} className="w-full sm:w-72" />
        <div className="max-w-full overflow-x-auto scroll-thin">
          <Segmented
            value={state}
            onChange={setState}
            options={[
              { value: "all", label: t("stock.all"), count: counts.all },
              { value: "critical", label: t("stock.critical"), count: counts.critical },
              { value: "warn", label: t("stock.low"), count: counts.warn },
              { value: "ok", label: t("stock.ok"), count: counts.ok },
            ]}
          />
        </div>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(p) => p.id}
        onRowClick={(p) => router.push(`/products/${p.id}`)}
        initialSort={{ key: "cover", dir: "asc" }}
        pageSize={30}
        className="border-t border-line"
      />
    </>
  );
}
