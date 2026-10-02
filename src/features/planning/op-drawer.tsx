"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertOctagon, AlertTriangle, ArrowRightLeft, ExternalLink, Lock } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { cn } from "@/lib/cn";
import { localDateOf, MIN } from "@/lib/data/clock";
import type { Machine, WorkOrder, WorkOrderOperation } from "@/lib/data/types";
import { isLate, useLookups } from "@/lib/hooks";
import { useDb } from "@/lib/store";
import { Button, Drawer, IdLink, KeyValue, PersonChip, PriorityBadge, SectionTitle, Select, StatusBadge } from "@/components/ui";
import { messages } from "./messages";
import { dueEndOf, isMovable, isUnavailable } from "./schedule";

export interface OpSelection {
  woId: string;
  opId: string;
}

export function OpDrawer({
  sel,
  onClose,
  onSelect,
  onShift,
  onMove,
  load7,
  today,
}: {
  sel: OpSelection | null;
  onClose: () => void;
  onSelect: (sel: OpSelection) => void;
  onShift: (woId: string, opId: string, minutes: number) => void;
  onMove: (woId: string, opId: string, machineId: string) => void;
  load7: Map<string, number>;
  today: string;
}) {
  const t = useT(messages);
  const label = useLabel();
  const lk = useLookups();
  const wo = sel ? lk.workOrder.get(sel.woId) : undefined;
  const op = wo?.operations.find((o) => o.id === sel?.opId);
  const machine = op ? lk.machine.get(op.machineId) : undefined;
  if (!wo || !op || !machine) return null;
  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-lg"
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="tabular">{op.id}</span>
          <StatusBadge kind="opStatus" value={op.status} />
        </span>
      }
      subtitle={`${label("op", op.operation)} · ${machine.id} · ${machine.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("drawer.close")}
          </Button>
          <Link
            href={`/work-orders/${wo.id}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3.5 text-sm font-medium text-brand-ink shadow-sm hover:bg-brand-hover"
          >
            <ExternalLink className="size-4" />
            {t("drawer.openWo")}
          </Link>
        </>
      }
    >
      <DrawerBody key={`${op.id}:${op.machineId}`} wo={wo} op={op} machine={machine} load7={load7} today={today} onSelect={onSelect} onShift={onShift} onMove={onMove} />
    </Drawer>
  );
}

function DrawerBody({
  wo,
  op,
  machine,
  load7,
  today,
  onSelect,
  onShift,
  onMove,
}: {
  wo: WorkOrder;
  op: WorkOrderOperation;
  machine: Machine;
  load7: Map<string, number>;
  today: string;
  onSelect: (sel: OpSelection) => void;
  onShift: (woId: string, opId: string, minutes: number) => void;
  onMove: (woId: string, opId: string, machineId: string) => void;
}) {
  const t = useT(messages);
  const fmt = useFmt();
  const label = useLabel();
  const tx = useTx();
  const lk = useLookups();
  const machines = useDb((db) => db.machines);
  const [target, setTarget] = useState("");

  const product = lk.product.get(wo.productId);
  const customer = wo.customerId ? lk.customer.get(wo.customerId) : undefined;
  const plant = lk.plant.get(machine.plantId);
  const alternatives = useMemo(
    () => machines.filter((m) => m.plantId === machine.plantId && m.type === machine.type && m.id !== machine.id),
    [machines, machine],
  );
  const movable = isMovable(op);
  const late = wo.status !== "completed" && isLate(wo, today);
  const delayMin = Math.max(0, (Date.parse(wo.plannedEnd) - dueEndOf(wo.dueDate)) / MIN);
  const start = Date.parse(op.plannedStart);
  const end = Date.parse(op.plannedEnd);

  return (
    <div className="flex flex-col gap-6 px-5 py-4">
      {(late || isUnavailable(machine)) && (
        <div className="flex flex-col gap-2">
          {late && (
            <div className="flex items-start gap-2.5 rounded-lg border border-critical/30 bg-critical-soft px-3 py-2.5 text-[13px] text-critical-ink">
              <AlertOctagon className="mt-0.5 size-4 shrink-0" />
              <span>{t("drawer.lateBanner", { end: fmt.dateTime(wo.plannedEnd), due: fmt.date(wo.dueDate), h: fmt.duration(delayMin) })}</span>
            </div>
          )}
          {isUnavailable(machine) && (
            <div className="flex items-start gap-2.5 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2.5 text-[13px] text-warn-ink">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                {t("drawer.downBanner", {
                  id: machine.id,
                  status: label("machineStatus", machine.status).toLocaleLowerCase(fmt.locale),
                  t: fmt.time(machine.statusSince),
                })}
                {machine.status === "down" && machine.downReason ? ` ${tx(machine.downReason, machine.downReasonTr)}.` : ""}
              </span>
            </div>
          )}
        </div>
      )}

      <KeyValue
        items={[
          { label: t("common.workOrder"), value: <IdLink href={`/work-orders/${wo.id}`}>{wo.id}</IdLink> },
          { label: t("common.priority"), value: <PriorityBadge value={wo.priority} compact /> },
          { label: t("common.product"), value: <span title={product?.name}>{product?.sku} · {product?.name}</span> },
          { label: t("common.customer"), value: customer?.name ?? <span className="text-ink-3">{t("common.makeToStock")}</span> },
          { label: t("common.quantity"), value: <span className="tabular">{fmt.num(op.qtyDone)} / {fmt.num(wo.qty)} {t("common.pcs")}</span> },
          { label: t("common.dueDate"), value: <span className={cn("tabular", late && "text-critical-ink")}>{fmt.date(wo.dueDate)}</span> },
          { label: t("common.start"), value: <span className="tabular">{fmt.dateTime(start)}</span> },
          { label: t("common.end"), value: <span className="tabular">{fmt.dateTime(end)}</span> },
          { label: t("drawer.duration"), value: <span className="tabular">{fmt.duration((end - start) / MIN)}</span> },
          { label: t("drawer.std"), value: <span className="tabular">{fmt.duration(op.stdMinutes)}</span> },
          { label: t("common.operator"), value: <PersonChip id={op.operatorId} size={20} /> },
          { label: t("common.lot"), value: <span className="tabular">{wo.lotNo}</span> },
        ]}
      />

      <section>
        <SectionTitle>{t("drawer.reschedule")}</SectionTitle>
        {movable ? (
          <>
            <p className="mb-2.5 text-[13px] text-ink-3">{t("drawer.rescheduleHint")}</p>
            <div className="flex flex-wrap gap-2">
              {[-60, 60, 240].map((m) => (
                <Button key={m} size="sm" onClick={() => onShift(wo.id, op.id, m)}>
                  <span className="tabular">
                    {m < 0 ? "−" : "+"}
                    {fmt.duration(Math.abs(m))}
                  </span>
                </Button>
              ))}
            </div>
          </>
        ) : (
          <Locked text={t("drawer.locked")} />
        )}
      </section>

      <section>
        <SectionTitle>{t("drawer.move")}</SectionTitle>
        {!movable ? (
          <Locked text={t("drawer.locked")} />
        ) : alternatives.length === 0 ? (
          <p className="text-[13px] text-ink-3">{t("drawer.noAlternative", { wc: label("wc", machine.type) })}</p>
        ) : (
          <>
            <p className="mb-2.5 text-[13px] text-ink-3">{t("drawer.moveHint", { plant: plant?.code ?? machine.plantId })}</p>
            <div className="flex gap-2">
              <Select value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t("drawer.move")} className="min-w-0 flex-1">
                <option value="">{t("drawer.movePick")}</option>
                {alternatives.map((m) => (
                  <option key={m.id} value={m.id} disabled={isUnavailable(m)}>
                    {t("drawer.loadOpt", { id: m.id, status: label("machineStatus", m.status), pct: fmt.pct(load7.get(m.id) ?? 0) })}
                  </option>
                ))}
              </Select>
              <Button variant="primary" icon={<ArrowRightLeft className="size-4" />} disabled={!target} onClick={() => onMove(wo.id, op.id, target)}>
                {t("drawer.moveBtn")}
              </Button>
            </div>
          </>
        )}
      </section>

      <section>
        <SectionTitle>{t("drawer.routing")}</SectionTitle>
        <div className="flex flex-col gap-0.5">
          {wo.operations.map((o) => {
            const s = Date.parse(o.plannedStart);
            const e = Date.parse(o.plannedEnd);
            const current = o.id === op.id;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onSelect({ woId: wo.id, opId: o.id })}
                aria-current={current || undefined}
                className={cn("flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors", current ? "bg-brand-soft" : "hover:bg-surface-2")}
              >
                <span className="w-6 shrink-0 text-xs text-ink-3 tabular">{o.seq}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{label("op", o.operation)}</span>
                  <span className="block truncate text-[11px] text-ink-3 tabular">
                    {o.machineId} · {fmt.dateTime(s)} – {localDateOf(s) === localDateOf(e) ? fmt.time(e) : fmt.dateTime(e)}
                  </span>
                </span>
                <StatusBadge kind="opStatus" value={o.status} />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Locked({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 text-[13px] text-ink-3">
      <Lock className="size-3.5" />
      {text}
    </p>
  );
}
