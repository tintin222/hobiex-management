"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, BadgeCheck, ListOrdered, UserRound } from "lucide-react";
import { useLabel, useT, useTx } from "@/i18n";
import type { Employee, Machine, WorkOrder, WorkOrderOperation } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { useDb } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Badge, Segmented, StatusBadge } from "@/components/ui";
import { IluoGlyph, ILUO_LETTER } from "@/features/workforce/iluo";
import { bestLevel, opsForWorkCenter } from "@/features/workforce/staffing";
import { downReason } from "./instructions";
import { messages } from "./messages";
import { Banner, BigButton } from "./terminal-ui";

type Job = { wo: WorkOrder; op: WorkOrderOperation };

export function WorkstationSelect({ operator, onSelect }: { operator: Employee; onSelect: (id: string) => void }) {
  const t = useT(messages);
  const tx = useTx();
  const label = useLabel();
  const lk = useLookups();
  const machinesAll = useDb((db) => db.machines);
  const workOrders = useDb((db) => db.workOrders);
  const maintenance = useDb((db) => db.maintenance);
  const [filter, setFilter] = useState<"all" | "qualified">("all");

  const plant = lk.plant.get(operator.plantId)!;
  const machines = useMemo(() => machinesAll.filter((m) => m.plantId === operator.plantId), [machinesAll, operator.plantId]);

  const info = useMemo(() => {
    const map = new Map<string, { active?: Job; queued: number }>();
    for (const m of machines) map.set(m.id, { queued: 0 });
    for (const wo of workOrders) {
      if (wo.plantId !== operator.plantId || wo.status === "planned" || wo.status === "completed") continue;
      for (const op of wo.operations) {
        const row = map.get(op.machineId);
        if (!row) continue;
        if ((op.status === "running" || op.status === "paused") && (!row.active || op.status === "running")) row.active = { wo, op };
        else if (op.status === "ready" || op.status === "pending") row.queued += 1;
      }
    }
    return map;
  }, [machines, workOrders, operator.plantId]);

  const levelOf = (m: Machine) => bestLevel(operator, opsForWorkCenter(m.type));
  const shown = filter === "qualified" ? machines.filter((m) => levelOf(m) >= 1) : machines;
  const lines = [...new Set(shown.map((m) => m.line))].sort();
  const assigned = machines.find((m) => m.operatorId === operator.id);
  const qualifiedCount = machines.filter((m) => levelOf(m) >= 1).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">{t("ws.title", { name: operator.name.split(" ")[0] })}</h1>
          <p className="mt-1.5 text-lg text-ink-2">{t("ws.subtitle", { plant: tx(plant.name, plant.nameTr), n: machines.length })}</p>
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          className="p-1 [&>button]:h-11 [&>button]:px-4 [&>button]:text-sm"
          options={[
            { value: "all", label: t("ws.all"), count: machines.length },
            { value: "qualified", label: t("ws.qualifiedOnly"), count: qualifiedCount },
          ]}
        />
      </div>

      {assigned && (
        <Banner
          tone="brand"
          icon={<UserRound className="size-7" />}
          title={t("ws.assigned", { id: assigned.id })}
          actions={
            <BigButton tone="complete" size="md" onClick={() => onSelect(assigned.id)}>
              {t("ws.goTo", { id: assigned.id })}
              <ArrowRight className="size-5" />
            </BigButton>
          }
        >
          {assigned.name} · {label("machineStatus", assigned.status)}
        </Banner>
      )}

      {lines.map((line) => (
        <section key={line}>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-ink-3 uppercase">{t("line", { l: line.replace("Line ", "") })}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {shown
              .filter((m) => m.line === line)
              .map((m) => {
                const row = info.get(m.id)!;
                const lv = levelOf(m);
                const other = m.operatorId && m.operatorId !== operator.id ? lk.employee.get(m.operatorId) : undefined;
                const down = m.status === "down";
                const job = row.active;
                const reason = down ? downReason(m, maintenance) : undefined;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSelect(m.id)}
                    className={cn(
                      "flex min-h-52 flex-col rounded-2xl border-2 bg-surface p-4 text-left shadow-sm transition-[transform,border-color] active:scale-[0.99]",
                      down ? "border-critical/60 hover:border-critical" : m.operatorId === operator.id ? "border-brand" : "border-line hover:border-brand",
                    )}
                  >
                    <span className="flex w-full items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block font-display text-2xl leading-tight font-semibold text-ink">{m.id}</span>
                        <span className="block truncate text-sm text-ink-2">{m.name}</span>
                        <span className="block truncate text-xs text-ink-3">{m.model}</span>
                      </span>
                      <StatusBadge kind="machineStatus" value={m.status} className="h-7 px-2.5 text-[13px]" />
                    </span>

                    <span className={cn("mt-3 block w-full rounded-xl px-3 py-2 text-sm", down ? "bg-critical-soft text-critical-ink" : "bg-surface-2")}>
                      {down ? (
                        <span className="line-clamp-2 font-medium">{reason ? tx(reason.en, reason.tr) : label("machineStatus", m.status)}</span>
                      ) : job ? (
                        <>
                          <span className="block truncate font-medium text-ink">
                            {job.wo.id} · {lk.product.get(job.wo.productId)?.sku}
                          </span>
                          <span className="block truncate text-xs text-ink-3">
                            {label("op", job.op.operation)} · {label("opStatus", job.op.status)}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="block font-medium text-ink-2">{t("ws.noActive")}</span>
                          <span className="block text-xs text-ink-3">{t("ws.readyToStart")}</span>
                        </>
                      )}
                    </span>

                    <span className="mt-auto flex w-full flex-wrap items-center justify-between gap-2 pt-3">
                      {lv >= 1 ? (
                        <Badge tone="good" icon={<BadgeCheck className="size-3.5" />}>
                          {t("ws.qualified")}
                          <IluoGlyph level={lv} size={14} className="ml-0.5" title={ILUO_LETTER[lv]} />
                        </Badge>
                      ) : (
                        <Badge tone="warn" icon={<AlertTriangle className="size-3.5" />}>
                          {t("ws.notQualified")}
                        </Badge>
                      )}
                      <span className="inline-flex items-center gap-1 text-xs text-ink-3">
                        <ListOrdered className="size-3.5" />
                        {t("ws.queued", { n: row.queued })}
                      </span>
                    </span>
                    {(other || m.operatorId === operator.id) && (
                      <span className="mt-2 block w-full truncate text-xs text-ink-3">
                        {other ? t("ws.inUseBy", { name: other.name }) : t("ws.yourMachine")}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
