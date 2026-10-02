"use client";

import { useMemo, useState } from "react";
import { Award } from "lucide-react";
import { useFmt, useLabel, useT } from "@/i18n";
import { SHIFT_HOURS } from "@/lib/data/clock";
import { ROLE_LABELS } from "@/lib/data/labels";
import type { Employee, EmployeeRole, ShiftId } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { Avatar, Card, DataTable, Progress, SearchInput, Select, type Column } from "@/components/ui";
import { IluoGlyph } from "./iluo";
import { messages } from "./messages";
import { SHIFTS } from "./staffing";
import { efficiencyTone, EMPLOYEE_STATUSES, EmployeeStatusBadge } from "./status";

const ROLES = Object.keys(ROLE_LABELS) as EmployeeRole[];

export function Directory({ employees, onOpen }: { employees: Employee[]; onOpen: (id: string) => void }) {
  const t = useT(messages);
  const label = useLabel();
  const fmt = useFmt();
  const lk = useLookups();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<EmployeeRole | "all">("all");
  const [shift, setShift] = useState<ShiftId | "all">("all");
  const [status, setStatus] = useState<Employee["status"] | "all">("all");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return employees.filter(
      (e) =>
        (!s || e.name.toLowerCase().includes(s) || e.id.toLowerCase().includes(s)) &&
        (role === "all" || e.role === role) &&
        (shift === "all" || e.shift === shift) &&
        (status === "all" || e.status === status),
    );
  }, [employees, q, role, shift, status]);

  const columns = useMemo<Column<Employee>[]>(
    () => [
      {
        key: "name",
        header: t("col.employee"),
        sortValue: (e) => e.name,
        cell: (e) => (
          <span className="flex min-w-0 items-center gap-2.5">
            <Avatar name={e.name} hue={e.avatarHue} size={32} />
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">{e.name}</span>
              <span className="tabular block text-xs text-ink-3">{e.id}</span>
            </span>
          </span>
        ),
      },
      { key: "role", header: t("col.role"), sortValue: (e) => label("role", e.role), cell: (e) => <span className="text-ink-2">{label("role", e.role)}</span> },
      {
        key: "plant",
        header: t("common.plant"),
        hideBelow: "md",
        sortValue: (e) => e.plantId,
        cell: (e) => (
          <span className="inline-flex items-center gap-1.5 text-ink-2">
            <span className="size-2 rounded-sm" style={{ background: `var(--series-${e.plantId.slice(1)})` }} />
            {lk.plant.get(e.plantId)?.code}
          </span>
        ),
      },
      {
        key: "shift",
        header: t("common.shift"),
        sortValue: (e) => e.shift,
        cell: (e) => (
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <span className="inline-flex size-6 items-center justify-center rounded-md bg-surface-3 text-xs font-semibold text-ink">{e.shift}</span>
            <span className="tabular hidden text-xs text-ink-3 xl:inline">{SHIFT_HOURS[e.shift]}</span>
          </span>
        ),
      },
      {
        key: "status",
        header: t("common.status"),
        sortValue: (e) => EMPLOYEE_STATUSES.indexOf(e.status),
        cell: (e) => <EmployeeStatusBadge status={e.status} />,
      },
      {
        key: "eff",
        header: t("col.efficiency"),
        sortValue: (e) => e.efficiency,
        cell: (e) => (
          <span className="flex w-36 items-center gap-2">
            <span className="tabular w-10 text-right text-[13px] font-medium text-ink">{fmt.pct(e.efficiency)}</span>
            <Progress value={e.efficiency / 1.2} size="sm" tone={efficiencyTone(e.efficiency)} />
          </span>
        ),
      },
      {
        key: "skills",
        header: t("col.skills"),
        hideBelow: "lg",
        align: "right",
        sortValue: (e) => Object.values(e.skills).filter((v) => (v ?? 0) >= 3).length,
        cell: (e) => {
          const all = Object.values(e.skills).filter((v) => (v ?? 0) > 0).length;
          const top = Object.values(e.skills).filter((v) => (v ?? 0) >= 3).length;
          if (all === 0) return <span className="text-ink-3">—</span>;
          return (
            <span className="inline-flex items-center gap-1.5" title={t("dir.skillsTitle", { n: top, m: all })}>
              <IluoGlyph level={3} size={14} />
              <span className="font-medium text-ink">{top}</span>
              <span className="text-xs text-ink-3">/ {all}</span>
            </span>
          );
        },
      },
      {
        key: "certs",
        header: t("col.certs"),
        hideBelow: "lg",
        align: "right",
        sortValue: (e) => e.certifications.length,
        cell: (e) => (
          <span className="inline-flex items-center gap-1 text-ink-2" title={e.certifications.join("\n")}>
            <Award className="size-3.5 text-ink-3" />
            {e.certifications.length}
          </span>
        ),
      },
    ],
    [t, label, fmt, lk],
  );

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3.5">
        <SearchInput value={q} onChange={setQ} placeholder={t("dir.search")} className="w-full sm:w-64" />
        <Select value={role} onChange={(e) => setRole(e.target.value as EmployeeRole | "all")} className="w-auto min-w-40" aria-label={t("col.role")}>
          <option value="all">{t("dir.allRoles")}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {label("role", r)}
            </option>
          ))}
        </Select>
        <Select value={shift} onChange={(e) => setShift(e.target.value as ShiftId | "all")} className="w-auto min-w-36" aria-label={t("common.shift")}>
          <option value="all">{t("dir.allShifts")}</option>
          {SHIFTS.map((s) => (
            <option key={s} value={s}>
              {t("shift.label", { s })} · {SHIFT_HOURS[s]}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as Employee["status"] | "all")} className="w-auto min-w-36" aria-label={t("common.status")}>
          <option value="all">{t("dir.allStatuses")}</option>
          {EMPLOYEE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </Select>
        <span className="tabular ml-auto text-xs text-ink-3">{t("dir.count", { n: fmt.num(rows.length) })}</span>
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(e) => e.id} onRowClick={(e) => onOpen(e.id)} initialSort={{ key: "name", dir: "asc" }} />
    </Card>
  );
}
