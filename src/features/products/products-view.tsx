"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Factory, LayoutGrid, PackageSearch, Rows3 } from "lucide-react";
import { useFmt, useLabel, useT } from "@/i18n";
import { CATEGORY_LABELS } from "@/lib/data/labels";
import type { Oem, Product, ProductCategory } from "@/lib/data/types";
import { useByPlant, useLookups } from "@/lib/hooks";
import { useDb } from "@/lib/store";
import { cn } from "@/lib/cn";
import { PageContainer } from "@/components/layout/app-shell";
import { Badge, Card, DataTable, EmptyState, PageHeader, SearchInput, Segmented, Select, type Column } from "@/components/ui";
import { useUrlParams, useUrlUpdate } from "@/features/orders/url-state";
import { fgState } from "@/features/inventory/stock";
import { messages } from "./messages";
import { ProductThumb } from "./product-thumb";
import { StockMini } from "./stock-mini";

type View = "grid" | "table";

export function ProductsView() {
  const t = useT(messages);
  const fmt = useFmt();
  const label = useLabel();
  const lk = useLookups();
  const router = useRouter();
  const url = useUrlParams("category", "view");
  const update = useUrlUpdate();
  const productsAll = useDb((db) => db.products);
  const products = useByPlant(productsAll);

  const [query, setQuery] = useState("");
  const [oem, setOem] = useState<Oem | "all">("all");
  const category: ProductCategory | "all" = url.category && url.category in CATEGORY_LABELS ? (url.category as ProductCategory) : "all";
  const view: View = url.view === "table" ? "table" : "grid";

  const chips = useMemo(() => {
    const m = new Map<ProductCategory, number>();
    for (const p of products) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return (Object.keys(CATEGORY_LABELS) as ProductCategory[]).filter((c) => m.has(c)).map((c) => ({ category: c, count: m.get(c)! }));
  }, [products]);

  const oems = useMemo(() => [...new Set(products.map((p) => p.oem))].sort(), [products]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (oem !== "all" && p.oem !== oem) return false;
      if (q && ![p.sku, p.name, p.oemRef, p.model].some((s) => s.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [products, category, oem, query]);

  const setCategory = (c: ProductCategory | "all") => update({ category: c === "all" ? null : c });

  const columns: Column<Product>[] = useMemo(
    () => [
      {
        key: "sku",
        header: t("common.product"),
        sortValue: (p) => p.sku,
        cell: (p) => (
          <span className="flex min-w-0 items-center gap-3">
            <ProductThumb product={p} width={52} />
            <span className="min-w-0">
              <span className="tabular block text-sm font-medium text-brand">{p.sku}</span>
              <span className="block max-w-72 truncate text-xs text-ink-3">{p.name}</span>
            </span>
          </span>
        ),
      },
      { key: "category", header: t("common.category"), hideBelow: "lg", sortValue: (p) => p.category, cell: (p) => <span className="text-xs text-ink-2">{label("category", p.category)}</span> },
      {
        key: "oem",
        header: t("col.oem"),
        hideBelow: "md",
        sortValue: (p) => p.oem + p.model,
        cell: (p) => (
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral">{p.oem === "Universal" ? t("d.universal") : p.oem}</Badge>
            {p.model && <span className="text-xs text-ink-2">{p.model}</span>}
          </span>
        ),
      },
      { key: "euro", header: t("col.euro"), hideBelow: "2xl", sortValue: (p) => p.euroNorm, cell: (p) => <span className="text-xs whitespace-nowrap text-ink-2">{p.euroNorm}</span> },
      { key: "plant", header: t("common.plant"), hideBelow: "lg", sortValue: (p) => p.plantId, cell: (p) => <span className="tabular text-xs text-ink-2">{lk.plant.get(p.plantId)?.code}</span> },
      { key: "price", header: t("col.price"), align: "right", sortValue: (p) => p.listPriceEur, cell: (p) => <span className="font-medium">{fmt.eur(p.listPriceEur)}</span> },
      {
        key: "margin",
        header: t("col.margin"),
        align: "right",
        hideBelow: "xl",
        sortValue: (p) => 1 - p.unitCostEur / p.listPriceEur,
        cell: (p) => <span className="text-ink-2">{fmt.pct(1 - p.unitCostEur / p.listPriceEur, 1)}</span>,
      },
      { key: "stock", header: t("col.stock"), sortValue: (p) => p.stockQty / Math.max(1, p.safetyStock), cell: (p) => <StockMini product={p} className="w-40" /> },
      { key: "demand", header: t("col.demand"), align: "right", hideBelow: "2xl", sortValue: (p) => p.monthlyDemand, cell: (p) => <span className="text-ink-2">{fmt.num(p.monthlyDemand)}</span> },
    ],
    [t, fmt, label, lk],
  );

  return (
    <PageContainer>
      <PageHeader title={t("title")} subtitle={t("subtitle", { n: products.length })} />

      {/* Category summary chips */}
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 scroll-thin md:mx-0 md:flex-wrap md:px-0">
        <CategoryChip active={category === "all"} onClick={() => setCategory("all")} label={t("allProducts")} count={products.length} />
        {chips.map((c) => (
          <CategoryChip key={c.category} active={category === c.category} onClick={() => setCategory(category === c.category ? "all" : c.category)} label={label("category", c.category)} count={c.count} />
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          <SearchInput value={query} onChange={setQuery} placeholder={t("filter.search")} className="w-full sm:w-72" />
          <Select value={category} onChange={(e) => setCategory(e.target.value as ProductCategory | "all")} className="w-full sm:w-52" aria-label={t("common.category")}>
            <option value="all">{t("filter.allCategories")}</option>
            {chips.map((c) => (
              <option key={c.category} value={c.category}>
                {label("category", c.category)}
              </option>
            ))}
          </Select>
          <Select value={oem} onChange={(e) => setOem(e.target.value as Oem | "all")} className="w-full sm:w-44" aria-label="OEM">
            <option value="all">{t("filter.allOems")}</option>
            {oems.map((o) => (
              <option key={o} value={o}>
                {o === "Universal" ? t("d.universal") : o}
              </option>
            ))}
          </Select>
          <div className="ml-auto flex items-center gap-3">
            <span className="tabular text-xs text-ink-3">{t("results", { n: rows.length })}</span>
            <Segmented
              value={view}
              onChange={(v) => update({ view: v === "grid" ? null : v })}
              options={[
                {
                  value: "grid",
                  label: (
                    <>
                      <LayoutGrid className="size-3.5" />
                      {t("view.grid")}
                    </>
                  ),
                },
                {
                  value: "table",
                  label: (
                    <>
                      <Rows3 className="size-3.5" />
                      {t("view.table")}
                    </>
                  ),
                },
              ]}
            />
          </div>
        </div>

        {view === "table" ? (
          <DataTable rows={rows} columns={columns} rowKey={(p) => p.id} onRowClick={(p) => router.push(`/products/${p.id}`)} initialSort={{ key: "sku", dir: "asc" }} className="border-t border-line" />
        ) : rows.length === 0 ? (
          <div className="border-t border-line">
            <EmptyState icon={<PackageSearch className="size-5" />} title={t("common.noResults")} hint={t("common.noResultsHint")} />
          </div>
        ) : (
          <div className="grid gap-4 border-t border-line p-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {rows.map((p) => (
              <ProductCard key={p.id} product={p} plantCode={lk.plant.get(p.plantId)?.code ?? p.plantId} />
            ))}
          </div>
        )}
      </Card>
    </PageContainer>
  );
}

function CategoryChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-colors",
        active ? "border-brand/40 bg-brand-soft text-brand-soft-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
      )}
    >
      {label}
      <span className={cn("tabular rounded-full px-1.5 text-[11px]", active ? "bg-brand/15" : "bg-surface-3 text-ink-3")}>{count}</span>
    </button>
  );
}

function ProductCard({ product: p, plantCode }: { product: Product; plantCode: string }) {
  const t = useT(messages);
  const fmt = useFmt();
  const label = useLabel();
  const state = fgState(p);
  return (
    <Link
      href={`/products/${p.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-3">
        <Image
          src={p.image}
          alt={p.name}
          fill
          sizes="(min-width: 1536px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
          <Badge tone="neutral" icon={<Factory className="size-3.5" />} className="shadow-sm">
            {plantCode}
          </Badge>
          {p.euroNorm !== "—" && (
            <Badge tone="brand" className="shadow-sm">
              {p.euroNorm}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="tabular text-xs font-medium text-brand">{p.sku}</span>
            <span className="truncate text-[11px] text-ink-3">{label("category", p.category)}</span>
          </div>
          <h3 className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 font-medium text-ink">{p.name}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{p.oem === "Universal" ? t("d.universal") : p.oem}</Badge>
          {p.model && <span className="truncate text-xs text-ink-2">{p.model}</span>}
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-3">
          <div>
            <div className="text-[11px] text-ink-3">{t("card.listPrice")}</div>
            <div className="tabular font-display text-lg leading-tight font-semibold text-ink">{fmt.eur(p.listPriceEur)}</div>
          </div>
          <StockMini product={p} state={state} className="w-32" />
        </div>
      </div>
    </Link>
  );
}
