"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Award, Factory, History, ListTodo, Phone } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { SHIFT_HOURS } from "@/lib/data/clock";
import type { Employee, OperationType, WorkOrder, WorkOrderOperation } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { useClock, useDb } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Avatar, Badge, Drawer, IdLink, KeyValue, PriorityBadge, Progress, SectionTitle, StatusBadge } from "@/components/ui";
import { IluoGlyph, ILUO_LETTER } from "./iluo";
import { messages } from "./messages";
import { tenure } from "./staffing";
import { efficiencyTone, EmployeeStatusBadge } from "./status";

export function EmployeeDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useT(messages);
  const label = useLabel();
  const lk = useLookups();
  const e = id ? lk.employee.get(id) : undefined;
  return (
    <Drawer
      open={!!e}
      onClose={onClose}
      width="max-w-2xl"
      title={e?.name ?? ""}
      subtitle={e ? `${e.id} · ${label("role", e.role)} · ${lk.plant.get(e.plantId)?.code}` : undefined}
      footer={
        e ? (
          <a href={`tel:${e.phone.replace(/\s/g, "")}`} title={t("drawer.phone")} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium text-ink shadow-sm hover:bg-surface-2">
            <Phone className="size-4" />
            {e.phone}
          </a>
        ) : undefined
      }
    >
      {e && <EmployeeDetail key={e.id} employee={e} />}
    </Drawer>
  );
}

function EmployeeDetail({ employee: e }: { employee: Employee }) {
  const t = useT(messages);
  const label = useLabel();
  const tx = useTx();
  const fmt = useFmt();
  const clock = useClock();
  const lk = useLookups();
  const workOrders = useDb((db) => db.workOrders);
  const machines = useDb((db) => db.machines);
  const tasks = useDb((db) => db.tasks);

  const plant = lk.plant.get(e.plantId)!;
  const ten = tenure(e.hireDate, clock.today);

  const skills = useMemo(
    () =>
      (Object.entries(e.skills) as [OperationType, number][])
        .filter(([, lv]) => lv > 0)
        .sort((a, b) => b[1] - a[1] || label("op", a[0]).localeCompare(label("op", b[0]))),
    [e.skills, label],
  );

  const assigned = useMemo(() => machines.filter((m) => m.operatorId === e.id), [machines, e.id]);

  const recent = useMemo(() => {
    const rows: { wo: WorkOrder; op: WorkOrderOperation }[] = [];
    for (const wo of workOrders) for (const op of wo.operations) if (op.operatorId === e.id && op.actualStart) rows.push({ wo, op });
    // running/paused first, then most recently finished
    const key = (r: (typeof rows)[number]) => r.op.actualEnd ?? "9999";
    return rows.sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0)).slice(0, 10);
  }, [workOrders, e.id]);

  const openTasks = useMemo(
    () => tasks.filter((x) => x.assigneeId === e.id && x.status !== "done").sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1)),
    [tasks, e.id],
  );

  return (
    <div className="flex flex-col gap-6 px-5 py-5">
      {/* Profile */}
      <section className="flex items-start gap-4">
        <Avatar name={e.name} hue={e.avatarHue} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl font-semibold tracking-tight text-ink">{e.name}</h3>
            <EmployeeStatusBadge status={e.status} />
          </div>
          <p className="mt-0.5 text-sm text-ink-2">
            {label("role", e.role)} · {tx(plant.name, plant.nameTr)}
          </p>
          <div className="mt-3">
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="text-ink-3">{t("drawer.efficiency")}</span>
              <span className="tabular text-sm font-semibold text-ink">{fmt.pct(e.efficiency)}</span>
            </div>
            <Progress value={e.efficiency / 1.2} tone={efficiencyTone(e.efficiency)} />
          </div>
        </div>
      </section>

      <KeyValue
        cols={3}
        items={[
          { label: t("drawer.id"), value: <span className="tabular">{e.id}</span> },
          { label: t("drawer.role"), value: label("role", e.role) },
          { label: t("common.plant"), value: plant.code },
          { label: t("common.shift"), value: `${e.shift} · ${SHIFT_HOURS[e.shift]}` },
          { label: t("drawer.hired"), value: fmt.dateLong(e.hireDate) },
          { label: t("drawer.tenure"), value: t("drawer.tenureValue", { y: ten.years, m: ten.months }) },
        ]}
      />

      {/* Skills */}
      <section>
        <SectionTitle>{t("drawer.skills")}</SectionTitle>
        {skills.length === 0 ? (
          <p className="text-sm text-ink-3">{t("drawer.noSkills")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {skills.map(([op, lv]) => (
              <li key={op} className="flex items-center gap-3 px-3 py-2">
                <IluoGlyph level={lv} size={20} title={t(`iluo.${lv}`)} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{label("op", op)}</span>
                <span className="flex gap-0.5" aria-hidden>
                  {[1, 2, 3, 4].map((i) => (
                    <span key={i} className={cn("h-2 w-5 rounded-sm", i <= lv ? "bg-brand" : "bg-surface-3")} />
                  ))}
                </span>
                <span className="w-44 truncate text-right text-xs text-ink-2" title={t(`iluo.${lv}`)}>
                  <span className="mr-1 font-semibold text-ink">{ILUO_LETTER[lv]}</span>
                  {t(`iluo.${lv}`).split("· ")[1]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Certifications */}
      <section>
        <SectionTitle>{t("drawer.certs")}</SectionTitle>
        {e.certifications.length === 0 ? (
          <p className="text-sm text-ink-3">{t("drawer.noCerts")}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {e.certifications.map((c) => (
              <Badge key={c} tone="brand" icon={<Award className="size-3.5" />}>
                {c}
              </Badge>
            ))}
          </div>
        )}
      </section>

      {/* Current assignment */}
      <section>
        <SectionTitle>{t("drawer.assignment")}</SectionTitle>
        {assigned.length === 0 ? (
          <p className="text-sm text-ink-3">{t("drawer.noAssignment")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {assigned.map((m) => {
              const wo = m.currentWoId ? lk.workOrder.get(m.currentWoId) : undefined;
              const op = wo?.operations.find((o) => o.id === m.currentOpId);
              return (
                <Link key={m.id} href={`/shop-floor?machine=${m.id}`} className="group flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:bg-surface-2">
                  <span className="rounded-lg bg-surface-3 p-2 text-ink-2">
                    <Factory className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">
                      {m.id} <span className="font-normal text-ink-3">· {m.name}</span>
                    </span>
                    <span className="block truncate text-xs text-ink-3">
                      {wo && op ? `${wo.id} · ${label("op", op.operation)} · ${lk.product.get(wo.productId)?.sku}` : m.model}
                    </span>
                  </span>
                  <StatusBadge kind="machineStatus" value={m.status} />
                  <ArrowRight className="size-4 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-label={t("drawer.openOnFloor")} />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent operations */}
      <section>
        <SectionTitle>
          <span className="inline-flex items-center gap-1.5">
            <History className="size-3.5" />
            {t("drawer.recentOps")}
          </span>
        </SectionTitle>
        {recent.length === 0 ? (
          <p className="text-sm text-ink-3">{t("drawer.noOps")}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-3">
                  <th className="px-3 py-2 font-medium">{t("common.workOrder")}</th>
                  <th className="px-3 py-2 font-medium">{t("drawer.operation")}</th>
                  <th className="px-3 py-2 font-medium">{t("common.machine")}</th>
                  <th className="px-3 py-2 font-medium">{t("common.end")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("common.qty")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(({ wo, op }) => (
                  <tr key={op.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      <IdLink href={`/work-orders/${wo.id}`}>{wo.id}</IdLink>
                    </td>
                    <td className="max-w-40 truncate px-3 py-2 text-ink-2">{label("op", op.operation)}</td>
                    <td className="tabular px-3 py-2 text-ink-2">{op.machineId}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {op.actualEnd ? <span className="tabular text-ink-2">{fmt.dateTime(op.actualEnd)}</span> : <StatusBadge kind="opStatus" value={op.status} />}
                    </td>
                    <td className="tabular px-3 py-2 text-right whitespace-nowrap">
                      <span className="text-ink">{fmt.num(op.qtyDone)}</span>
                      {op.qtyScrap > 0 && <span className="text-critical-ink"> · {fmt.num(op.qtyScrap)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Open tasks */}
      <section>
        <SectionTitle>
          <span className="inline-flex items-center gap-1.5">
            <ListTodo className="size-3.5" />
            {t("drawer.tasks")} {openTasks.length > 0 && <span className="tabular">({openTasks.length})</span>}
          </span>
        </SectionTitle>
        {openTasks.length === 0 ? (
          <p className="text-sm text-ink-3">{t("drawer.noTasks")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {openTasks.map((task) => (
              <li key={task.id}>
                <Link href={`/tasks?task=${task.id}`} className="flex items-start gap-3 rounded-xl border border-line px-3 py-2.5 hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="tabular font-medium text-brand">{task.id}</span>
                      <span className="text-ink-3">{label("taskType", task.type)}</span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-ink">{tx(task.title, task.titleTr)}</p>
                    <p className={cn("mt-0.5 text-xs", Date.parse(task.dueAt) < clock.now ? "text-critical-ink" : "text-ink-3")}>
                      {t("common.due")} {fmt.relative(task.dueAt, clock.now)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge kind="taskStatus" value={task.status} />
                    <PriorityBadge value={task.priority} compact />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
