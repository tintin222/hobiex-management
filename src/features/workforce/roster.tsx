"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, UserX } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { SHIFT_HOURS } from "@/lib/data/clock";
import type { Employee, EmployeeRole, Machine, Plant, PlantId, ShiftId } from "@/lib/data/types";
import { cn } from "@/lib/cn";
import { Avatar, Badge, Card, CardBody, CardHeader, Progress, Segmented, SectionTitle } from "@/components/ui";
import { messages } from "./messages";
import { isAbsent, requiredDirect, SHIFTS, UTILISATION } from "./staffing";
import { efficiencyTone, EmployeeStatusBadge } from "./status";

type Group = "direct" | "lead" | "qc" | "maint" | "other";
const GROUP_OF: Record<EmployeeRole, Group> = {
  operator: "direct",
  welder: "direct",
  team_lead: "lead",
  qc_inspector: "qc",
  maintenance_tech: "maint",
  supervisor: "other",
  planner: "other",
  warehouse: "other",
};
const CELL_GROUPS: Group[] = ["direct", "lead", "qc", "maint"];
const LIST_GROUPS: Group[] = ["direct", "lead", "qc", "maint", "other"];

interface Cell {
  required: number;
  presentDirect: number;
  groups: Record<Group, { present: number; absent: number }>;
}

export function Roster({
  employees,
  plants,
  machines,
  currentShift,
  onOpen,
}: {
  employees: Employee[];
  plants: Plant[];
  machines: Machine[];
  currentShift: ShiftId;
  onOpen: (id: string) => void;
}) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();

  const matrix = useMemo(() => {
    const out = new Map<PlantId, { machines: number; required: number; cells: Record<ShiftId, Cell> }>();
    for (const p of plants) {
      const machineCount = machines.filter((m) => m.plantId === p.id).length;
      const required = requiredDirect(machineCount);
      const cells = {} as Record<ShiftId, Cell>;
      for (const s of SHIFTS) {
        const groups = { direct: { present: 0, absent: 0 }, lead: { present: 0, absent: 0 }, qc: { present: 0, absent: 0 }, maint: { present: 0, absent: 0 }, other: { present: 0, absent: 0 } };
        for (const e of employees) {
          if (e.plantId !== p.id || e.shift !== s) continue;
          const g = groups[GROUP_OF[e.role]];
          if (isAbsent(e)) g.absent += 1;
          else g.present += 1;
        }
        cells[s] = { required, presentDirect: groups.direct.present + groups.lead.present, groups };
      }
      out.set(p.id, { machines: machineCount, required, cells });
    }
    return out;
  }, [plants, machines, employees]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title={t("roster.title")} subtitle={t("roster.subtitle", { util: fmt.pct(UTILISATION) })} />
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-line">
                <th className="w-56 px-5 py-2.5 text-left text-xs font-medium text-ink-3">{t("common.plant")}</th>
                {SHIFTS.map((s) => (
                  <th key={s} className={cn("px-3 py-2.5 text-left text-xs font-medium", s === currentShift ? "bg-brand-soft text-brand-soft-ink" : "text-ink-3")}>
                    <span className="inline-flex items-center gap-2">
                      <span className="text-[13px] font-semibold">{t("shift.label", { s })}</span>
                      <span className="tabular">{SHIFT_HOURS[s]}</span>
                      {s === currentShift && (
                        <Badge tone="brand" icon={<Clock className="size-3" />} className="h-5 bg-surface">
                          {t("shift.now")}
                        </Badge>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plants.map((p) => {
                const row = matrix.get(p.id)!;
                return (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-4 align-top">
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 rounded-sm" style={{ background: `var(--series-${p.id.slice(1)})` }} />
                        <span className="text-xs font-semibold text-ink-3">{p.code}</span>
                      </div>
                      <div className="mt-1 text-sm font-semibold text-ink">{tx(p.name, p.nameTr).split("·")[1]?.trim()}</div>
                      <div className="mt-0.5 text-xs text-ink-3">{t("roster.machines", { n: row.machines })}</div>
                    </td>
                    {SHIFTS.map((s) => (
                      <td key={s} className={cn("px-3 py-3 align-top", s === currentShift && "bg-brand-soft/40")}>
                        <ShiftCell cell={row.cells[s]} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <OnShiftNow employees={employees} plants={plants} machines={machines} currentShift={currentShift} onOpen={onOpen} />
    </div>
  );
}

function ShiftCell({ cell }: { cell: Cell }) {
  const t = useT(messages);
  const gap = cell.required - cell.presentDirect;
  return (
    <div className={cn("rounded-xl border bg-surface p-3", gap > 0 ? "border-warn/60" : "border-line")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-ink-3">{t("roster.direct")}</div>
          <div className="tabular mt-0.5 text-sm font-semibold text-ink">{t("roster.vsRequired", { present: cell.presentDirect, required: cell.required })}</div>
        </div>
        {gap > 0 ? (
          <Badge tone="warn" icon={<AlertTriangle className="size-3.5" />}>
            {t("roster.under", { n: gap })}
          </Badge>
        ) : (
          <Badge tone="good" icon={<CheckCircle2 className="size-3.5" />}>
            {t("roster.ok")}
          </Badge>
        )}
      </div>
      <Progress value={cell.presentDirect / Math.max(1, cell.required)} tone={gap > 0 ? "warn" : "good"} size="sm" className="mt-2" />
      <dl className="mt-3 flex flex-col gap-1">
        {CELL_GROUPS.map((g) => {
          const v = cell.groups[g];
          const none = v.present === 0;
          return (
            <div key={g} className="flex items-center justify-between gap-2 text-xs">
              <dt className="text-ink-2">{t(`roster.group.${g}`)}</dt>
              <dd className="flex items-center gap-1.5">
                {v.absent > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-ink-3" title={t("roster.absentN", { n: v.absent })}>
                    <UserX className="size-3" />
                    {v.absent}
                  </span>
                )}
                {none && g !== "direct" ? (
                  <Badge tone="warn" icon={<AlertTriangle className="size-3" />} className="h-5 px-1.5 text-[11px]">
                    {t("roster.noCover")}
                  </Badge>
                ) : (
                  <span className="tabular w-5 text-right font-semibold text-ink">{v.present}</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function OnShiftNow({
  employees,
  plants,
  machines,
  currentShift,
  onOpen,
}: {
  employees: Employee[];
  plants: Plant[];
  machines: Machine[];
  currentShift: ShiftId;
  onOpen: (id: string) => void;
}) {
  const t = useT(messages);
  const tx = useTx();
  const label = useLabel();
  const fmt = useFmt();
  const [pick, setPick] = useState<PlantId>(plants[0]?.id ?? "P1");
  const plantId = plants.some((p) => p.id === pick) ? pick : plants[0]?.id;
  const plant = plants.find((p) => p.id === plantId);

  const machineOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of machines) if (x.operatorId) m.set(x.operatorId, x.id);
    return m;
  }, [machines]);

  const { present, absent } = useMemo(() => {
    const inShift = employees.filter((e) => e.plantId === plantId && e.shift === currentShift);
    const roleOrder = Object.keys(GROUP_OF);
    const sorted = [...inShift].sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) || a.name.localeCompare(b.name));
    return {
      present: sorted.filter((e) => e.status === "on_shift"),
      absent: sorted.filter(isAbsent),
    };
  }, [employees, plantId, currentShift]);

  if (!plant) return null;

  return (
    <Card>
      <CardHeader
        title={t("roster.onShiftTitle", { plant: tx(plant.name, plant.nameTr) })}
        subtitle={t("roster.onShiftSubtitle", { s: currentShift, hours: SHIFT_HOURS[currentShift], n: present.length })}
        actions={
          plants.length > 1 ? (
            <Segmented
              value={plantId as PlantId}
              onChange={setPick}
              options={plants.map((p) => ({ value: p.id, label: p.code, count: employees.filter((e) => e.plantId === p.id && e.status === "on_shift").length }))}
            />
          ) : undefined
        }
      />
      <CardBody className="flex flex-col gap-5">
        {LIST_GROUPS.map((g) => {
          const people = present.filter((e) => GROUP_OF[e.role] === g);
          if (people.length === 0 && g === "other") return null;
          return (
            <section key={g}>
              <SectionTitle>
                {t(`roster.group.${g}`)} <span className="tabular">· {people.length}</span>
              </SectionTitle>
              {people.length === 0 ? (
                <p className="text-sm text-ink-3">{t("roster.nobody")}</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {people.map((e) => {
                    const mId = machineOf.get(e.id);
                    return (
                      <button key={e.id} type="button" onClick={() => onOpen(e.id)} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-2">
                        <Avatar name={e.name} hue={e.avatarHue} size={34} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{e.name}</span>
                          <span className="block truncate text-xs text-ink-3">{label("role", e.role)}</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          {mId && (
                            <span className="tabular rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-brand-soft-ink" title={t("roster.at", { machine: mId })}>
                              {mId}
                            </span>
                          )}
                          <span className={cn("tabular text-xs font-medium", efficiencyTone(e.efficiency) === "warn" ? "text-warn-ink" : "text-ink-2")}>{fmt.pct(e.efficiency)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        <section>
          <SectionTitle>
            {t("roster.absentTitle")} <span className="tabular">· {absent.length}</span>
          </SectionTitle>
          {absent.length === 0 ? (
            <p className="text-sm text-ink-3">{t("roster.noneAbsent")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {absent.map((e) => (
                <button key={e.id} type="button" onClick={() => onOpen(e.id)} className="flex items-center gap-2 rounded-full border border-line py-1 pr-2 pl-1 hover:bg-surface-2">
                  <Avatar name={e.name} hue={e.avatarHue} size={24} />
                  <span className="text-sm text-ink">{e.name}</span>
                  <span className="text-xs text-ink-3">{label("role", e.role)}</span>
                  <EmployeeStatusBadge status={e.status} className="h-5" />
                </button>
              ))}
            </div>
          )}
        </section>
      </CardBody>
    </Card>
  );
}
