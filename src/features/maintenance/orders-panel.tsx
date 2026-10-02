"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import type { MaintenanceOrder, MaintenanceStatus, MaintenanceType, PlantId } from "@/lib/data/types";
import { useLookups, usePlantFilter } from "@/lib/hooks";
import { useClock, useDb } from "@/lib/store";
import { cn } from "@/lib/cn";
import { DataTable, PersonChip, PriorityBadge, SearchInput, Select, StatusBadge, type Column } from "@/components/ui";
import { effStatus, MAINT_STATUSES, MAINT_TYPES, TYPE_COLOR } from "./lib";
import { messages } from "./messages";

export type StatusFilter = MaintenanceStatus | "all" | "open";

export function TypeLabel({ type, className }: { type: MaintenanceType; className?: string }) {
  const label = useLabel();
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap text-ink-2", className)}>
      <span className="size-2.5 shrink-0 rounded-sm" style={{ background: TYPE_COLOR[type] }} />
      {label("maintType", type)}
    </span>
  );
}

const PRIORITY_RANK = { low: 0, normal: 1, high: 2, urgent: 3 } as const;

export function OrdersPanel({
  rows,
  status,
  onStatus,
  onOpen,
}: {
  rows: MaintenanceOrder[];
  status: StatusFilter;
  onStatus: (s: StatusFilter) => void;
  onOpen: (id: string) => void;
}) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const clock = useClock();
  const lk = useLookups();
  const plantFilter = usePlantFilter();
  const plants = useDb((db) => db.plants);
  const employees = useDb((db) => db.employees);
  const [q, setQ] = useState("");
  const [type, setType] = useState<MaintenanceType | "all">("all");
  const [plant, setPlant] = useState<PlantId | "all">("all");
  const [tech, setTech] = useState("all");

  const techs = useMemo(
    () => employees.filter((e) => e.role === "maintenance_tech" && (plantFilter === "all" || e.plantId === plantFilter)).sort((a, b) => a.name.localeCompare(b.name)),
    [employees, plantFilter],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const today = clock.today;
    const out = rows.filter((mo) => {
      const st = effStatus(mo, today);
      if (status === "open" ? st === "completed" : status !== "all" && st !== status) return false;
      if (type !== "all" && mo.type !== type) return false;
      if (plantFilter === "all" && plant !== "all" && mo.plantId !== plant) return false;
      if (tech !== "all" && mo.technicianId !== tech) return false;
      if (!s) return true;
      const m = lk.machine.get(mo.machineId);
      return [mo.id, mo.title, mo.titleTr, mo.machineId, m?.name ?? ""].some((v) => v.toLowerCase().includes(s));
    });
    // open work first (oldest date first), then history (newest first)
    return out.sort((a, b) => {
      const ao = a.status !== "completed";
      const bo = b.status !== "completed";
      if (ao !== bo) return ao ? -1 : 1;
      if (ao) return a.scheduledDate < b.scheduledDate ? -1 : a.scheduledDate > b.scheduledDate ? 1 : PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
      return (a.completedDate ?? a.scheduledDate) < (b.completedDate ?? b.scheduledDate) ? 1 : -1;
    });
  }, [rows, q, status, type, plant, plantFilter, tech, lk, clock.today]);

  const columns = useMemo<Column<MaintenanceOrder>[]>(
    () => [
      { key: "id", header: t("col.id"), cell: (mo) => <span className="tabular font-medium whitespace-nowrap text-brand">{mo.id}</span>, sortValue: (mo) => mo.id },
      {
        key: "machine",
        header: t("col.machine"),
        cell: (mo) => (
          <span className="block min-w-0">
            <span className="tabular block font-medium whitespace-nowrap text-ink">{mo.machineId}</span>
            <span className="block max-w-40 truncate text-xs text-ink-3">{lk.machine.get(mo.machineId)?.name}</span>
          </span>
        ),
        sortValue: (mo) => mo.machineId,
      },
      { key: "title", header: t("col.title"), cell: (mo) => <span className="block max-w-72 min-w-40 truncate text-ink">{tx(mo.title, mo.titleTr)}</span>, hideBelow: "md" },
      { key: "type", header: t("col.type"), cell: (mo) => <TypeLabel type={mo.type} />, sortValue: (mo) => MAINT_TYPES.indexOf(mo.type), hideBelow: "2xl" },
      { key: "priority", header: t("col.priority"), cell: (mo) => <PriorityBadge value={mo.priority} compact />, sortValue: (mo) => PRIORITY_RANK[mo.priority], hideBelow: "xl" },
      {
        key: "scheduled",
        header: t("col.scheduled"),
        cell: (mo) =>
          effStatus(mo, clock.today) === "overdue" ? (
            <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap text-critical-ink" title={t("overdue")}>
              <AlertTriangle className="size-3.5" />
              <span className="tabular">{fmt.date(mo.scheduledDate)}</span>
            </span>
          ) : (
            <span className="tabular whitespace-nowrap text-ink-2">{fmt.date(mo.completedDate ?? mo.scheduledDate)}</span>
          ),
        sortValue: (mo) => mo.scheduledDate,
        hideBelow: "sm",
      },
      { key: "tech", header: t("col.technician"), cell: (mo) => <PersonChip id={mo.technicianId} size={20} className="max-w-40" />, hideBelow: "lg" },
      { key: "est", header: t("col.est"), cell: (mo) => fmt.num(mo.estHours, 1), sortValue: (mo) => mo.estHours, align: "right", hideBelow: "2xl" },
      { key: "status", header: t("col.status"), cell: (mo) => <StatusBadge kind="maintStatus" value={effStatus(mo, clock.today)} />, sortValue: (mo) => MAINT_STATUSES.indexOf(effStatus(mo, clock.today)) },
    ],
    [t, tx, fmt, lk, clock.today],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
        <SearchInput value={q} onChange={setQ} placeholder={t("f.search")} className="w-full sm:w-64" />
        <Select value={status} onChange={(e) => onStatus(e.target.value as StatusFilter)} className="w-[calc(50%-4px)] sm:w-48" aria-label={t("col.status")}>
          <option value="open">{t("f.open")}</option>
          <option value="all">{t("f.allStatus")}</option>
          {MAINT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {label("maintStatus", s)}
            </option>
          ))}
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-[calc(50%-4px)] sm:w-44" aria-label={t("col.type")}>
          <option value="all">{t("f.allTypes")}</option>
          {MAINT_TYPES.map((x) => (
            <option key={x} value={x}>
              {label("maintType", x)}
            </option>
          ))}
        </Select>
        {plantFilter === "all" && (
          <Select value={plant} onChange={(e) => setPlant(e.target.value as typeof plant)} className="w-[calc(50%-4px)] sm:w-48" aria-label={t("d.plant")}>
            <option value="all">{t("f.allPlants")}</option>
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {tx(p.name, p.nameTr).split("·")[1]?.trim()}
              </option>
            ))}
          </Select>
        )}
        <Select value={tech} onChange={(e) => setTech(e.target.value)} className="w-[calc(50%-4px)] sm:w-48" aria-label={t("col.technician")}>
          <option value="all">{t("f.allTechs")}</option>
          {techs.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
        <span className="tabular ml-auto hidden text-xs text-ink-3 lg:inline">{fmt.num(filtered.length)}</span>
      </div>
      <DataTable rows={filtered} columns={columns} rowKey={(mo) => mo.id} onRowClick={(mo) => onOpen(mo.id)} pageSize={15} />
    </div>
  );
}
