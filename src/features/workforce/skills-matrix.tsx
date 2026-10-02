"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Users } from "lucide-react";
import { useLabel, useT, useTx } from "@/i18n";
import type { Employee, EmployeeRole, Plant, PlantId, Product } from "@/lib/data/types";
import { cn } from "@/lib/cn";
import { Avatar, Badge, Card, CardHeader, EmptyState, Segmented } from "@/components/ui";
import { IluoGlyph } from "./iluo";
import { messages } from "./messages";
import { coverageByShift, DIRECT_ROLES, isRisk, MIN_QUALIFIED, plantOperations, SHIFTS, SHOP_FLOOR_ROLES } from "./staffing";

type Scope = "direct" | "all";
const ROLE_ORDER: EmployeeRole[] = ["team_lead", "welder", "operator", "qc_inspector", "warehouse"];

export function SkillsMatrix({
  employees,
  plants,
  products,
  onOpen,
}: {
  employees: Employee[];
  plants: Plant[];
  products: Product[];
  onOpen: (id: string) => void;
}) {
  const t = useT(messages);
  const tx = useTx();
  const label = useLabel();
  const [pick, setPick] = useState<PlantId>(plants[0]?.id ?? "P1");
  const [scope, setScope] = useState<Scope>("direct");
  const plantId = plants.some((p) => p.id === pick) ? pick : (plants[0]?.id ?? "P1");
  const plant = plants.find((p) => p.id === plantId);

  const ops = useMemo(() => plantOperations(products, plantId), [products, plantId]);
  const rows = useMemo(() => {
    const roles = scope === "direct" ? DIRECT_ROLES : SHOP_FLOOR_ROLES;
    return employees
      .filter((e) => e.plantId === plantId && roles.includes(e.role))
      .sort((a, b) => a.shift.localeCompare(b.shift) || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  }, [employees, plantId, scope]);
  const cov = useMemo(() => coverageByShift(rows, ops), [rows, ops]);
  const riskCount = ops.filter((o) => isRisk(cov.get(o)!)).length;

  if (!plant) return null;

  return (
    <Card>
      <CardHeader
        title={t("skills.title")}
        subtitle={t("skills.subtitle", { plant: tx(plant.name, plant.nameTr), n: rows.length })}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {riskCount > 0 && (
              <Badge tone="warn" icon={<AlertTriangle className="size-3.5" />}>
                {t("skills.risks", { n: riskCount })}
              </Badge>
            )}
            <Segmented
              value={scope}
              onChange={setScope}
              options={[
                { value: "direct", label: t("skills.scope.direct") },
                { value: "all", label: t("skills.scope.all") },
              ]}
            />
            {plants.length > 1 && <Segmented value={plantId} onChange={setPick} options={plants.map((p) => ({ value: p.id, label: p.code }))} />}
          </div>
        }
      />

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-5 py-2.5 text-xs text-ink-2">
        {[0, 1, 2, 3, 4].map((lv) => (
          <span key={lv} className="inline-flex items-center gap-1.5">
            <IluoGlyph level={lv} size={16} />
            {t(`iluo.${lv}`)}
          </span>
        ))}
        <span className="ml-auto text-ink-3">{t("skills.riskNote")}</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Users className="size-5" />} title={t("skills.empty")} />
      ) : (
        <div className="max-h-[calc(100dvh-150px)] overflow-auto border-t border-line scroll-thin">
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-30 min-w-56 border-r border-b border-line bg-surface px-4 py-2 text-left text-xs font-medium text-ink-3">{t("col.employee")}</th>
                {ops.map((op) => {
                  const risk = isRisk(cov.get(op)!);
                  return (
                    <th key={op} className="sticky top-0 z-20 w-[84px] min-w-[84px] border-b border-line bg-surface px-1.5 py-2 align-bottom text-xs font-medium text-ink-2">
                      <span className="flex flex-col items-center gap-1 text-center leading-tight">
                        {risk && <AlertTriangle className="size-3.5 text-warn" aria-label={t("skills.risk")} />}
                        <span className="line-clamp-2">{label("op", op)}</span>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => {
                const newShift = i === 0 || rows[i - 1].shift !== e.shift;
                return (
                  <tr key={e.id} className="group">
                    <th
                      scope="row"
                      className={cn(
                        "sticky left-0 z-10 border-r border-b border-line bg-surface px-4 py-1 text-left font-normal group-hover:bg-surface-2",
                        newShift && i > 0 && "border-t-2 border-t-line-strong",
                      )}
                    >
                      <button type="button" onClick={() => onOpen(e.id)} className="flex w-full min-w-0 items-center gap-2.5 text-left">
                        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-3 text-[11px] font-semibold text-ink-2" title={t("shift.label", { s: e.shift })}>
                          {e.shift}
                        </span>
                        <Avatar name={e.name} hue={e.avatarHue} size={24} />
                        <span className="min-w-0">
                          <span className="block max-w-40 truncate text-[13px] font-medium text-ink hover:text-brand">{e.name}</span>
                          <span className="block truncate text-[11px] text-ink-3">{label("role", e.role)}</span>
                        </span>
                      </button>
                    </th>
                    {ops.map((op) => {
                      const lv = e.skills[op] ?? 0;
                      return (
                        <td key={op} className={cn("border-b border-line px-1.5 py-1 text-center group-hover:bg-surface-2", newShift && i > 0 && "border-t-2 border-t-line-strong")}>
                          <span className="inline-flex justify-center">
                            <IluoGlyph level={lv} size={20} title={t("skills.cellTitle", { name: e.name, op: label("op", op), level: t(`iluo.${lv}`) })} />
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {SHIFTS.map((s, si) => (
                <tr key={s}>
                  <th
                    scope="row"
                    className={cn("sticky left-0 z-20 border-r border-line bg-surface-2 px-4 py-1.5 text-left text-xs font-medium text-ink-2", si === 0 && "border-t-2 border-t-line-strong")}
                    style={{ bottom: `${(SHIFTS.length - si) * 33}px` }}
                  >
                    {t("skills.qualified", { s })}
                  </th>
                  {ops.map((op) => {
                    const n = cov.get(op)![s];
                    const low = n < MIN_QUALIFIED;
                    return (
                      <td
                        key={op}
                        className={cn("sticky z-10 h-[33px] bg-surface-2 px-1.5 text-center", si === 0 && "border-t-2 border-t-line-strong")}
                        style={{ bottom: `${(SHIFTS.length - si) * 33}px` }}
                      >
                        <span className={cn("tabular inline-flex min-w-7 justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold", low ? "bg-warn-soft text-warn-ink" : "text-ink")}>{n}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th scope="row" className="sticky bottom-0 left-0 z-20 h-[33px] border-r border-line bg-surface-2 px-4 text-left text-xs font-semibold text-ink">
                  {t("skills.coverage")}
                </th>
                {ops.map((op) => {
                  const risk = isRisk(cov.get(op)!);
                  return (
                    <td key={op} className="sticky bottom-0 z-10 h-[33px] bg-surface-2 px-1 text-center">
                      {risk ? (
                        <Badge tone="warn" icon={<AlertTriangle className="size-3" />} className="h-5 px-1.5 text-[11px]">
                          {t("skills.risk")}
                        </Badge>
                      ) : (
                        <Badge tone="good" icon={<CheckCircle2 className="size-3" />} className="h-5 px-1.5 text-[11px]">
                          {t("skills.ok")}
                        </Badge>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}
