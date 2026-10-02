"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { EmptyState, IconButton } from "./primitives";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** enables sorting on this column */
  sortValue?: (row: T) => number | string;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
  /** hide below a breakpoint */
  hideBelow?: "sm" | "md" | "lg" | "xl";
}

const hideCls = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell", xl: "hidden xl:table-cell" };

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  pageSize = 25,
  initialSort,
  dense,
  className,
  empty,
  rowClassName,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  initialSort?: { key: string; dir: "asc" | "desc" };
  dense?: boolean;
  className?: string;
  empty?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
}) {
  const t = useT();
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const sv = col.sortValue;
    const out = [...rows].sort((a, b) => {
      const va = sv(a);
      const vb = sv(b);
      return va < vb ? -1 : va > vb ? 1 : 0;
    });
    return sort.dir === "desc" ? out.reverse() : out;
  }, [rows, columns, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const p = Math.min(page, pages - 1);
  const visible = sorted.slice(p * pageSize, p * pageSize + pageSize);

  const toggleSort = (key: string) => {
    setPage(0);
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  };

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "h-9 px-3 text-xs font-medium whitespace-nowrap text-ink-3 first:pl-5 last:pr-5",
                    c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                    c.hideBelow && hideCls[c.hideBelow],
                    c.headerClassName,
                  )}
                >
                  {c.sortValue ? (
                    <button type="button" onClick={() => toggleSort(c.key)} className={cn("inline-flex items-center gap-1 hover:text-ink", sort?.key === c.key && "text-ink")}>
                      {c.header}
                      {sort?.key === c.key ? sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn("border-b border-line last:border-b-0", onRowClick && "cursor-pointer hover:bg-surface-2", rowClassName?.(row))}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-3 text-ink first:pl-5 last:pr-5",
                      dense ? "py-2" : "py-2.5",
                      c.align === "right" ? "tabular text-right" : c.align === "center" ? "text-center" : "text-left",
                      c.hideBelow && hideCls[c.hideBelow],
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (empty ?? <EmptyState icon={<SearchX className="size-5" />} title={t("common.noResults")} hint={t("common.noResultsHint")} />)}
      </div>
      {sorted.length > pageSize && (
        <div className="flex items-center justify-between border-t border-line px-5 py-2.5 text-xs text-ink-3">
          <span className="tabular">{t("common.showing", { from: p * pageSize + 1, to: Math.min(sorted.length, (p + 1) * pageSize), total: sorted.length })}</span>
          <div className="flex items-center gap-1">
            <IconButton label={t("common.prev")} onClick={() => setPage(p - 1)} disabled={p === 0} className="disabled:opacity-30">
              <ChevronLeft className="size-4" />
            </IconButton>
            <span className="tabular px-1">
              {p + 1} / {pages}
            </span>
            <IconButton label={t("common.next")} onClick={() => setPage(p + 1)} disabled={p >= pages - 1} className="disabled:opacity-30">
              <ChevronRight className="size-4" />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  );
}
