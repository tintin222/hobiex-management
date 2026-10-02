"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { daysBetween } from "@/lib/data/clock";
import { DEFECT_LABELS } from "@/lib/data/labels";
import type { DefectType, Ncr, NcrStatus } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { useClock } from "@/lib/store";
import { DataTable, PersonChip, SearchInput, Select, SeverityBadge, StatusBadge, type Column } from "@/components/ui";
import { NCR_FLOW } from "./lib";
import { messages } from "./messages";
import { SourceLabel } from "./parts";

const SEV_RANK = { minor: 0, major: 1, critical: 2 } as const;

export function NcrPanel({
  rows,
  defect,
  onDefect,
  onOpen,
}: {
  rows: Ncr[];
  defect: DefectType | "all";
  onDefect: (d: DefectType | "all") => void;
  onOpen: (id: string) => void;
}) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const clock = useClock();
  const lk = useLookups();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<NcrStatus | "all" | "not_closed">("all");
  const [severity, setSeverity] = useState<Ncr["severity"] | "all">("all");
  const [source, setSource] = useState<Ncr["source"] | "all">("all");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((n) => {
      if (status === "not_closed" ? n.status === "closed" : status !== "all" && n.status !== status) return false;
      if (severity !== "all" && n.severity !== severity) return false;
      if (source !== "all" && n.source !== source) return false;
      if (defect !== "all" && n.defectType !== defect) return false;
      if (!s) return true;
      const sku = lk.product.get(n.productId)?.sku ?? "";
      return [n.id, n.title, n.titleTr, sku, n.workOrderId ?? ""].some((v) => v.toLowerCase().includes(s));
    });
  }, [rows, q, status, severity, source, defect, lk]);

  const columns = useMemo<Column<Ncr>[]>(
    () => [
      { key: "id", header: t("col.ncr"), cell: (n) => <span className="tabular font-medium whitespace-nowrap text-brand">{n.id}</span>, sortValue: (n) => n.id },
      { key: "title", header: t("col.title"), cell: (n) => <div className="max-w-64 min-w-40 truncate text-ink">{tx(n.title, n.titleTr)}</div>, sortValue: (n) => tx(n.title, n.titleTr) },
      { key: "product", header: t("col.product"), cell: (n) => <span className="tabular whitespace-nowrap text-ink-2">{lk.product.get(n.productId)?.sku}</span>, hideBelow: "md" },
      { key: "defect", header: t("col.defect"), cell: (n) => <span className="whitespace-nowrap text-ink-2">{label("defect", n.defectType)}</span>, sortValue: (n) => n.defectType, hideBelow: "xl" },
      { key: "severity", header: t("col.severity"), cell: (n) => <SeverityBadge value={n.severity} />, sortValue: (n) => SEV_RANK[n.severity] },
      { key: "source", header: t("col.source"), cell: (n) => <SourceLabel source={n.source} />, sortValue: (n) => n.source, hideBelow: "lg" },
      { key: "qty", header: t("col.qty"), cell: (n) => fmt.num(n.qtyAffected), sortValue: (n) => n.qtyAffected, align: "right", hideBelow: "md" },
      { key: "owner", header: t("col.owner"), cell: (n) => <PersonChip id={n.ownerId} size={20} className="max-w-40" />, hideBelow: "xl" },
      {
        key: "opened",
        header: t("col.opened"),
        cell: (n) => (
          <span className="whitespace-nowrap">
            <span className="tabular text-ink-2">{fmt.date(n.openedAt)}</span>
            <span className="tabular text-ink-3"> · {t("age.days", { n: daysBetween(n.openedAt, n.closedAt ?? clock.today) })}</span>
          </span>
        ),
        sortValue: (n) => n.openedAt,
        hideBelow: "sm",
      },
      {
        key: "target",
        header: t("col.target"),
        cell: (n) => {
          const overdue = n.status !== "closed" && n.targetDate < clock.today;
          return overdue ? (
            <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap text-critical-ink" title={t("d.overdue")}>
              <AlertTriangle className="size-3.5" />
              <span className="tabular">{fmt.date(n.targetDate)}</span>
            </span>
          ) : (
            <span className="tabular whitespace-nowrap text-ink-2">{fmt.date(n.targetDate)}</span>
          );
        },
        sortValue: (n) => n.targetDate,
        hideBelow: "lg",
      },
      { key: "status", header: t("col.status"), cell: (n) => <StatusBadge kind="ncrStatus" value={n.status} />, sortValue: (n) => NCR_FLOW.indexOf(n.status) },
      { key: "cost", header: t("col.cost"), cell: (n) => fmt.eur(n.costEur), sortValue: (n) => n.costEur, align: "right", hideBelow: "md" },
    ],
    [t, tx, fmt, label, lk, clock.today],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
        <SearchInput value={q} onChange={setQ} placeholder={t("f.searchNcr")} className="w-full sm:w-64" />
        <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-full sm:w-48" aria-label={t("col.status")}>
          <option value="all">{t("f.allStatus")}</option>
          <option value="not_closed">{t("f.openOnly")}</option>
          {NCR_FLOW.map((s) => (
            <option key={s} value={s}>
              {label("ncrStatus", s)}
            </option>
          ))}
        </Select>
        <Select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)} className="w-[calc(50%-4px)] sm:w-40" aria-label={t("col.severity")}>
          <option value="all">{t("f.allSeverity")}</option>
          {(["critical", "major", "minor"] as const).map((s) => (
            <option key={s} value={s}>
              {t(`sevL.${s}`)}
            </option>
          ))}
        </Select>
        <Select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className="w-[calc(50%-4px)] sm:w-40" aria-label={t("col.source")}>
          <option value="all">{t("f.allSource")}</option>
          {(["internal", "customer", "supplier"] as const).map((s) => (
            <option key={s} value={s}>
              {t(`src.${s}`)}
            </option>
          ))}
        </Select>
        <Select value={defect} onChange={(e) => onDefect(e.target.value as DefectType | "all")} className="w-full sm:w-48" aria-label={t("col.defect")}>
          <option value="all">{t("f.allDefects")}</option>
          {(Object.keys(DEFECT_LABELS) as DefectType[]).map((d) => (
            <option key={d} value={d}>
              {label("defect", d)}
            </option>
          ))}
        </Select>
        {defect !== "all" && (
          <button
            type="button"
            onClick={() => onDefect("all")}
            className="inline-flex h-7 items-center gap-1 rounded-full bg-brand-soft px-2.5 text-xs font-medium text-brand-soft-ink hover:opacity-85"
            aria-label={t("f.clearDefect")}
          >
            {label("defect", defect)}
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <DataTable rows={filtered} columns={columns} rowKey={(n) => n.id} onRowClick={(n) => onOpen(n.id)} initialSort={{ key: "opened", dir: "desc" }} pageSize={15} />
    </div>
  );
}
