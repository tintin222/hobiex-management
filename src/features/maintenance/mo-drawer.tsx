"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, CheckSquare, Factory, PackageX, PlayCircle, Square } from "lucide-react";
import { useFmt, useT, useTx } from "@/i18n";
import type { MaintenanceOrder } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { actions, toast, useClock, useDb } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Badge, Button, Drawer, IdLink, KeyValue, PriorityBadge, Progress, SectionTitle, Select, StatusBadge } from "@/components/ui";
import { completeMaintenanceOrder, startMaintenance, toggleChecklistItem, waitForParts } from "./actions";
import { effStatus, LABOUR_EUR_PER_HOUR, partsCost } from "./lib";
import { messages } from "./messages";
import { TypeLabel } from "./orders-panel";

export function MaintenanceDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const clock = useClock();
  const orders = useDb((db) => db.maintenance);
  const mo = id ? orders.find((m) => m.id === id) : undefined;
  const st = mo ? effStatus(mo, clock.today) : undefined;

  const start = () => {
    if (!mo) return;
    startMaintenance(mo.id);
    toast({ tone: "info", title: t("d.started", { id: mo.id }), description: t("d.startedHint") });
  };
  const wait = () => {
    if (!mo) return;
    waitForParts(mo.id);
    toast({ tone: "warn", title: t("d.waiting", { id: mo.id }), description: t("d.waitingHint") });
  };
  const complete = () => {
    if (!mo) return;
    completeMaintenanceOrder(mo.id);
    toast({ tone: "good", title: t("d.done", { id: mo.id }), description: t("d.doneHint") });
  };

  return (
    <Drawer
      open={!!mo}
      onClose={onClose}
      width="max-w-2xl"
      title={
        mo && (
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular">{mo.id}</span>
            <StatusBadge kind="maintStatus" value={st!} />
          </span>
        )
      }
      subtitle={mo && tx(mo.title, mo.titleTr)}
      footer={
        mo && (
          <>
            <Link
              href={`/shop-floor?machine=${mo.machineId}`}
              className="mr-auto inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-2 hover:bg-surface-3 hover:text-ink"
            >
              <Factory className="size-4" />
              <span className="hidden sm:inline">{t("d.openShopFloor")}</span>
            </Link>
            {st === "completed" ? (
              <Badge tone="good" icon={<CheckCircle2 className="size-3.5" />}>
                {t("d.completedOn", { date: fmt.dateLong(mo.completedDate ?? mo.scheduledDate) })}
              </Badge>
            ) : (
              <>
                {(st === "scheduled" || st === "overdue") && (
                  <Button variant="primary" icon={<PlayCircle className="size-4" />} onClick={start}>
                    {t("d.start")}
                  </Button>
                )}
                {st === "in_progress" && (
                  <Button icon={<PackageX className="size-4" />} onClick={wait}>
                    {t("d.waitParts")}
                  </Button>
                )}
                {st === "waiting_parts" && (
                  <Button icon={<PlayCircle className="size-4" />} onClick={start}>
                    {t("d.resume")}
                  </Button>
                )}
                <Button variant={st === "in_progress" || st === "waiting_parts" ? "primary" : "secondary"} icon={<CheckCircle2 className="size-4" />} onClick={complete}>
                  {t("d.complete")}
                </Button>
              </>
            )}
          </>
        )
      }
    >
      {mo && <MoDetail key={mo.id} mo={mo} />}
    </Drawer>
  );
}

export function MoDetail({ mo }: { mo: MaintenanceOrder }) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const clock = useClock();
  const lk = useLookups();
  const employees = useDb((db) => db.employees);
  const machine = lk.machine.get(mo.machineId);
  const plant = lk.plant.get(mo.plantId);
  const st = effStatus(mo, clock.today);
  const done = st === "completed";

  const techs = useMemo(
    () =>
      employees
        .filter((e) => e.role === "maintenance_tech")
        .sort((a, b) => (a.plantId === mo.plantId ? 0 : 1) - (b.plantId === mo.plantId ? 0 : 1) || a.name.localeCompare(b.name)),
    [employees, mo.plantId],
  );

  const parts = partsCost(mo);
  const labour = mo.costEur ? Math.max(0, mo.costEur - parts) : (done ? mo.downtimeHours : mo.estHours) * LABOUR_EUR_PER_HOUR;
  const checked = mo.checklist.filter((c) => c.done).length;

  return (
    <div className="flex flex-col gap-6 px-5 py-5">
      <KeyValue
        items={[
          {
            label: t("d.machine"),
            value: (
              <span className="flex min-w-0 items-baseline gap-1.5">
                <IdLink href={`/shop-floor?machine=${mo.machineId}`}>{mo.machineId}</IdLink>
                <span className="truncate text-xs font-normal text-ink-3">{machine?.name}</span>
              </span>
            ),
          },
          { label: t("d.type"), value: <TypeLabel type={mo.type} /> },
          { label: t("d.priority"), value: <PriorityBadge value={mo.priority} compact /> },
          { label: t("d.plant"), value: plant ? `${plant.code} · ${machine?.line ?? ""}` : mo.plantId },
          {
            label: t("d.scheduled"),
            value:
              st === "overdue" ? (
                <span className="inline-flex items-center gap-1 text-critical-ink">
                  <AlertTriangle className="size-3.5" />
                  <span className="tabular">{fmt.dateLong(mo.scheduledDate)}</span>
                </span>
              ) : (
                <span className="tabular">{fmt.dateLong(mo.scheduledDate)}</span>
              ),
          },
          { label: t("d.completed"), value: <span className="tabular">{mo.completedDate ? fmt.dateLong(mo.completedDate) : "—"}</span> },
          { label: t("d.estVsDown"), value: <span className="tabular">{t("d.hoursPair", { est: fmt.num(mo.estHours, 1), down: fmt.num(mo.downtimeHours, 1) })}</span> },
          { label: t("d.status"), value: <StatusBadge kind="maintStatus" value={st} /> },
        ]}
      />

      <section>
        <SectionTitle>{t("d.technician")}</SectionTitle>
        <Select
          value={mo.technicianId}
          disabled={done}
          onChange={(e) => {
            const id = e.target.value;
            actions.updateMaintenance(mo.id, { technicianId: id });
            toast({ tone: "good", title: t("d.reassigned", { name: lk.employee.get(id)?.name ?? id }), description: mo.id });
          }}
        >
          {techs.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} · {lk.plant.get(e.plantId)?.code}
            </option>
          ))}
        </Select>
      </section>

      {machine && (
        <section>
          <SectionTitle>{t("d.machineNow")}</SectionTitle>
          <div className="rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <StatusBadge kind="machineStatus" value={machine.status} />
                <span className="text-xs text-ink-3">{fmt.relative(machine.statusSince, clock.now)}</span>
              </span>
              <span className="tabular text-xs text-ink-2">{t("d.mtbfMttr", { mtbf: fmt.num(machine.mtbfHours), mttr: fmt.num(machine.mttrHours, 1) })}</span>
            </div>
            {machine.status === "down" && machine.downReason && <p className="mt-2 text-[13px] text-critical-ink">{tx(machine.downReason, machine.downReasonTr)}</p>}
            {machine.sensors.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {machine.sensors.map((s) => (
                  <div key={s.label} className={cn("rounded-lg px-2.5 py-1.5", s.warn ? "bg-warn-soft" : "bg-surface-2")}>
                    <div className="flex items-center gap-1 truncate text-[11px] text-ink-3">
                      {s.warn && <AlertTriangle className="size-3 shrink-0 text-warn-ink" />}
                      <span className="truncate">{s.label}</span>
                    </div>
                    <div className={cn("tabular text-sm font-medium", s.warn ? "text-warn-ink" : "text-ink")}>
                      {fmt.num(s.value, s.value !== 0 && Math.abs(s.value) < 10 ? 2 : 0)} <span className="text-xs font-normal text-ink-3">{s.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <SectionTitle actions={<span className="tabular text-xs text-ink-3">{t("d.checklistDone", { done: checked, n: mo.checklist.length })}</span>}>{t("d.checklist")}</SectionTitle>
        <Progress value={mo.checklist.length ? checked / mo.checklist.length : 0} tone={checked === mo.checklist.length ? "good" : "brand"} size="sm" className="mb-2" />
        <ul className="flex flex-col gap-1">
          {mo.checklist.map((c, i) => (
            <li key={i}>
              <button
                type="button"
                role="checkbox"
                aria-checked={c.done}
                disabled={done}
                onClick={() => toggleChecklistItem(mo.id, i)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
              >
                {c.done ? <CheckSquare className="size-4 shrink-0 text-good" /> : <Square className="size-4 shrink-0 text-ink-3" />}
                <span className={cn(c.done ? "text-ink-3 line-through" : "text-ink")}>{tx(c.label, c.labelTr)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionTitle>{t("d.parts")}</SectionTitle>
        <div className="overflow-x-auto rounded-xl border border-line scroll-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-3">
                <th className="px-3 py-2 font-medium">{t("d.part")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("d.qty")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("d.unitCost")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("d.lineTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {mo.parts.length === 0 ? (
                <tr className="border-b border-line">
                  <td colSpan={4} className="px-3 py-3 text-[13px] text-ink-3">
                    {t("d.noParts")}
                  </td>
                </tr>
              ) : (
                mo.parts.map((p, i) => (
                  <tr key={i} className="border-b border-line">
                    <td className="px-3 py-2 text-ink">{p.name}</td>
                    <td className="tabular px-3 py-2 text-right text-ink-2">{fmt.num(p.qty)}</td>
                    <td className="tabular px-3 py-2 text-right text-ink-2">{fmt.eur(p.costEur, true)}</td>
                    <td className="tabular px-3 py-2 text-right font-medium text-ink">{fmt.eur(p.qty * p.costEur, true)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="text-[13px]">
              <tr>
                <td colSpan={3} className="px-3 pt-2 text-right text-ink-3">
                  {t("d.partsTotal")}
                </td>
                <td className="tabular px-3 pt-2 text-right text-ink">{fmt.eur(parts, true)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="px-3 py-1 text-right text-ink-3">
                  {t("d.labour")} <span className="text-xs">({fmt.eur(LABOUR_EUR_PER_HOUR)}/{t("kpi.hours")})</span>
                </td>
                <td className="tabular px-3 py-1 text-right text-ink">{fmt.eur(labour, true)}</td>
              </tr>
              <tr className="border-t border-line">
                <td colSpan={3} className="px-3 py-2 text-right font-semibold text-ink">
                  {t("d.totalCost")}
                </td>
                <td className="tabular px-3 py-2 text-right font-semibold text-ink">{fmt.eur(parts + labour, true)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {!mo.costEur && !done && <p className="mt-1.5 text-xs text-ink-3">{t("d.costPending")}</p>}
      </section>
    </div>
  );
}
