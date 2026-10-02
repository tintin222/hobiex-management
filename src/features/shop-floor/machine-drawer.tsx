"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2, GanttChartSquare, Gauge, Wrench } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFmt, useLabel, useLang, useT, useTx } from "@/i18n";
import { cn } from "@/lib/cn";
import { addDays, HOUR, MIN } from "@/lib/data/clock";
import type { Machine, MaintenanceOrder, WorkOrderOperation } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { toast, useClock, useDb } from "@/lib/store";
import {
  Badge,
  Button,
  Drawer,
  Field,
  IdLink,
  KeyValue,
  Modal,
  PersonChip,
  PriorityBadge,
  Progress,
  RingGauge,
  SectionTitle,
  Select,
  StatusBadge,
  Textarea,
} from "@/components/ui";
import { axisProps, ChartLegend, ChartTooltip, gridProps, lineCursor, yAxisProps } from "@/components/charts/theme";
import { markRepaired, reportBreakdown, startPlannedMaintenance } from "./actions";
import { sensorLabel } from "./bits";
import { BREAKDOWN_REASONS, messages } from "./messages";

export function MachineDrawer({ machineId, now, onClose }: { machineId: string | null; now: number; onClose: () => void }) {
  const lk = useLookups();
  const machine = machineId ? lk.machine.get(machineId) : undefined;
  if (!machine) return null;
  return <MachineDrawerInner machine={machine} now={now} onClose={onClose} />;
}

function MachineDrawerInner({ machine: m, now, onClose }: { machine: Machine; now: number; onClose: () => void }) {
  const t = useT(messages);
  const fmt = useFmt();
  const label = useLabel();
  const tx = useTx();
  const lang = useLang();
  const clock = useClock();
  const lk = useLookups();
  const workOrders = useDb((db) => db.workOrders);
  const downtimeAll = useDb((db) => db.downtime);
  const maintenanceAll = useDb((db) => db.maintenance);
  const [reportOpen, setReportOpen] = useState(false);

  const plant = lk.plant.get(m.plantId);
  const job = m.currentWoId ? lk.workOrder.get(m.currentWoId) : undefined;
  const jobOp = job?.operations.find((o) => o.id === m.currentOpId);
  const jobProduct = job ? lk.product.get(job.productId) : undefined;
  const unavailable = m.status === "down" || m.status === "maintenance";

  const queue = useMemo(() => {
    const out: { woId: string; productId: string; qty: number; op: WorkOrderOperation }[] = [];
    for (const wo of workOrders)
      for (const op of wo.operations)
        if (op.machineId === m.id && (op.status === "pending" || op.status === "ready") && op.id !== m.currentOpId) out.push({ woId: wo.id, productId: wo.productId, qty: wo.qty, op });
    return out.sort((a, b) => (a.op.plannedStart < b.op.plannedStart ? -1 : 1)).slice(0, 5);
  }, [workOrders, m.id, m.currentOpId]);

  const events = useMemo(() => downtimeAll.filter((e) => e.machineId === m.id).sort((a, b) => (a.start < b.start ? 1 : -1)).slice(0, 10), [downtimeAll, m.id]);

  const mos = useMemo(() => maintenanceAll.filter((mo) => mo.machineId === m.id), [maintenanceAll, m.id]);
  const lastDone = useMemo(() => mos.filter((mo) => mo.status === "completed").sort((a, b) => ((a.completedDate ?? "") < (b.completedDate ?? "") ? 1 : -1))[0], [mos]);
  const nextMo = useMemo(() => mos.filter((mo) => mo.status !== "completed").sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : 1))[0], [mos]);
  const openMo = mos.find((mo) => (mo.status === "in_progress" || mo.status === "waiting_parts") && (m.status === "down" ? mo.type === "corrective" : mo.type !== "corrective"));

  const since = Date.parse(m.statusSince);
  const inStatus = Math.max(0, (now - since) / MIN);
  const estBack = Math.max(since + (openMo?.estHours ?? m.mttrHours) * HOUR, now + 30 * MIN);
  const avg14 = m.oeeTrend.reduce((a, b) => a + b, 0) / Math.max(1, m.oeeTrend.length);
  const delta = m.oee - avg14;
  const trend = m.oeeTrend.map((v, i) => ({ label: fmt.date(addDays(clock.today, i - m.oeeTrend.length + 1)), oee: v }));

  const repair = () => {
    const r = markRepaired(m.id);
    toast({ title: t("toast.repaired", { id: m.id }), description: t("toast.repairedDesc", { d: fmt.duration(r.minutes), n: r.closed.length }), tone: "good" });
  };
  const startMaint = () => {
    const mo = startPlannedMaintenance(m.id);
    toast({ title: t("toast.maintStarted", { id: m.id }), description: t("toast.maintStartedDesc", { mo: mo ?? "" }), tone: "warn" });
  };

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        width="max-w-2xl"
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular">{m.id}</span>
            <span className="font-normal text-ink-2">· {m.name}</span>
            <StatusBadge kind="machineStatus" value={m.status} />
          </span>
        }
        subtitle={`${m.model} · ${plant?.code ?? m.plantId} · ${m.line.replace("Line", t("common.line"))}`}
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Link
              href={`/planning?machine=${m.id}`}
              className="mr-auto inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-2 hover:bg-surface-3 hover:text-ink"
            >
              <GanttChartSquare className="size-4" />
              {t("act.planning")}
            </Link>
            {m.status === "down" ? (
              <Button variant="primary" icon={<CheckCircle2 className="size-4" />} onClick={repair}>
                {t("act.repaired")}
              </Button>
            ) : m.status === "maintenance" ? (
              <Button variant="primary" icon={<CheckCircle2 className="size-4" />} onClick={repair}>
                {t("act.completeMaint")}
              </Button>
            ) : (
              <Button icon={<Wrench className="size-4" />} onClick={startMaint}>
                {t("act.startMaint")}
              </Button>
            )}
            {m.status !== "down" && (
              <Button variant="danger" icon={<AlertOctagon className="size-4" />} onClick={() => setReportOpen(true)}>
                {t("act.report")}
              </Button>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-7 px-5 py-5">
          {unavailable && (
            <div
              className={cn(
                "flex items-start gap-3 rounded-xl border px-4 py-3",
                m.status === "down" ? "border-critical/40 bg-critical-soft text-critical-ink" : "border-warn/40 bg-warn-soft text-warn-ink",
              )}
            >
              {m.status === "down" ? <span className="pulse-dot mt-1.5 size-2.5 shrink-0 rounded-full bg-critical" aria-hidden /> : <Wrench className="mt-0.5 size-4 shrink-0" />}
              <div className="min-w-0 text-[13px]">
                <div className="font-semibold">
                  {m.status === "down" ? (m.downReason ? tx(m.downReason, m.downReasonTr) : label("machineStatus", "down")) : openMo ? tx(openMo.title, openMo.titleTr) : label("machineStatus", "maintenance")}
                </div>
                <div className="mt-0.5 opacity-90">
                  {t(m.status === "down" ? "d.downBanner" : "d.maintBanner", { t: fmt.time(since), d: fmt.duration(inStatus) })} · {t("d.estBack", { t: fmt.time(estBack) })}
                </div>
                {openMo && <div className="mt-0.5 opacity-90">{t("d.mo", { id: openMo.id, status: label("maintStatus", openMo.status) })}</div>}
              </div>
            </div>
          )}

          <KeyValue
            cols={4}
            items={[
              { label: t("common.plant"), value: `${plant?.code ?? ""} · ${tx(plant?.name ?? "", plant?.nameTr).split("·")[1]?.trim() ?? ""}` },
              { label: t("common.line"), value: m.line.replace("Line", t("common.line")) },
              { label: t("d.installed"), value: <span className="tabular">{m.installedYear}</span> },
              { label: t("d.runtime"), value: <span className="tabular">{t("d.runtimeVal", { n: fmt.num(m.runtimeHoursTotal) })}</span> },
            ]}
          />

          {/* OEE */}
          <section>
            <SectionTitle>{t("d.oee")}</SectionTitle>
            <div className="grid grid-cols-3 items-center gap-4 rounded-xl border border-line p-4 sm:grid-cols-[1.3fr_1fr_1fr_1fr]">
              <div className="col-span-3 sm:col-span-1">
                <div className="flex items-center gap-1.5 text-xs text-ink-3">
                  <Gauge className="size-3.5" />
                  {t("d.oeeToday")}
                </div>
                <div className="font-display text-4xl leading-tight font-semibold tracking-tight text-ink tabular">{fmt.pct(m.oee, 1)}</div>
                <div className={cn("text-xs font-medium tabular", delta >= 0 ? "text-good-ink" : "text-critical-ink")}>
                  {t("d.vsAvg", { delta: `${delta >= 0 ? "+" : "−"}${fmt.pct(Math.abs(delta), 1)}` })}
                </div>
              </div>
              {(
                [
                  ["common.availability", m.availability],
                  ["common.performance", m.performance],
                  ["common.quality", m.quality],
                ] as const
              ).map(([key, v]) => (
                <div key={key} className="flex flex-col items-center gap-1.5">
                  <RingGauge value={v} size={68} stroke={7} />
                  <span className="text-center text-xs text-ink-2">{t(key)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-ink">{t("d.trend")}</span>
                <ChartLegend
                  items={[
                    { label: t("common.oee"), color: "var(--series-1)" },
                    { label: t("d.worldClass"), color: "var(--chart-muted)", dashed: true },
                  ]}
                />
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="label" {...axisProps} interval={2} />
                    <YAxis {...yAxisProps} domain={[0.5, 1]} ticks={[0.5, 0.6, 0.7, 0.8, 0.9, 1]} tickFormatter={(v: number) => fmt.pct(v)} />
                    <Tooltip cursor={lineCursor} content={<ChartTooltip formatter={(v) => fmt.pct(v, 1)} />} />
                    <ReferenceLine y={0.85} stroke="var(--chart-muted)" strokeDasharray="5 4" strokeWidth={1.5} />
                    <Line dataKey="oee" name={t("common.oee")} stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Sensors */}
          <section>
            <SectionTitle
              actions={
                <Badge tone={m.status === "running" || m.status === "setup" ? "good" : "neutral"} dot>
                  {m.status === "running" || m.status === "setup" ? t("live") : t("d.off")}
                </Badge>
              }
            >
              {t("d.sensors")}
            </SectionTitle>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {m.sensors.map((s) => {
                const dp = Number.isInteger(s.value) ? 0 : s.value < 10 ? 2 : 1;
                return (
                  <div key={s.label} className={cn("rounded-lg border p-3", s.warn ? "border-warn/50 bg-warn-soft" : "border-line bg-surface-2")}>
                    <div className="flex items-center justify-between gap-2 text-xs text-ink-3">
                      <span className="truncate">{sensorLabel(s.label, lang)}</span>
                      {s.warn ? <AlertTriangle className="size-3.5 shrink-0 text-warn-ink" /> : <CheckCircle2 className="size-3.5 shrink-0 text-good" />}
                    </div>
                    <div className="mt-1 font-display text-lg font-semibold text-ink tabular">
                      {fmt.num(s.value, dp)} <span className="text-xs font-normal text-ink-3">{s.unit}</span>
                    </div>
                    <div className={cn("mt-0.5 text-[11px] font-medium", s.warn ? "text-warn-ink" : "text-good-ink")}>{s.warn ? t("d.outOfRange") : t("d.normal")}</div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Current job */}
          <section>
            <SectionTitle>{t("d.job")}</SectionTitle>
            {job && jobOp ? (
              <div className="rounded-xl border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <IdLink href={`/work-orders/${job.id}`}>{job.id}</IdLink>
                      <PriorityBadge value={job.priority} compact />
                    </div>
                    <div className="mt-1 truncate text-sm text-ink">
                      <span className="font-medium">{jobProduct?.sku}</span> <span className="text-ink-2">· {jobProduct?.name}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-ink-3">
                      {jobOp.seq} · {label("op", jobOp.operation)} · {job.customerId ? lk.customer.get(job.customerId)?.name : t("common.makeToStock")}
                    </div>
                  </div>
                  <StatusBadge kind="opStatus" value={jobOp.status} />
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-ink-3">{t("d.opProgress")}</span>
                    <span className="font-medium text-ink tabular">
                      {fmt.num(jobOp.qtyDone)} / {fmt.num(job.qty)} {t("common.pcs")}
                    </span>
                  </div>
                  <Progress value={jobOp.qtyDone / Math.max(1, job.qty)} tone={jobOp.status === "paused" ? "warn" : "good"} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1 text-xs text-ink-3">{t("common.operator")}</div>
                    <PersonChip id={m.operatorId ?? jobOp.operatorId} size={22} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-ink-3">{t("d.plannedEnd")}</div>
                    <div className="text-sm text-ink tabular">
                      {fmt.dateTime(jobOp.plannedEnd)} <span className="text-xs text-ink-3">· {fmt.relative(jobOp.plannedEnd, now)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-line px-4 py-4 text-[13px] text-ink-3">{t("d.noJob")}</p>
            )}
          </section>

          {/* Queue */}
          <section>
            <SectionTitle>{t("d.queue")}</SectionTitle>
            {queue.length ? (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {queue.map(({ woId, productId, qty, op }) => (
                  <li key={op.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <div className="w-[88px] shrink-0 text-xs tabular">
                      <div className="font-medium text-ink">{fmt.time(op.plannedStart)}</div>
                      <div className="text-ink-3">{fmt.date(op.plannedStart)}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[13px]">
                        <IdLink href={`/work-orders/${woId}`}>{woId}</IdLink>
                        <span className="truncate text-ink-2">{lk.product.get(productId)?.sku}</span>
                      </div>
                      <div className="truncate text-xs text-ink-3">
                        {op.seq} · {label("op", op.operation)} · {fmt.num(qty)} {t("common.pcs")} · {fmt.duration((Date.parse(op.plannedEnd) - Date.parse(op.plannedStart)) / MIN)}
                      </div>
                    </div>
                    <StatusBadge kind="opStatus" value={op.status} className="hidden sm:inline-flex" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-3">{t("d.queueEmpty")}</p>
            )}
          </section>

          {/* Downtime */}
          <section>
            <SectionTitle>{t("d.downtime")}</SectionTitle>
            {events.length ? (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {events.map((e) => {
                  const start = Date.parse(e.start);
                  const ongoing = unavailable && start >= since - MIN;
                  const minutes = ongoing ? Math.max(e.minutes, (now - start) / MIN) : e.minutes;
                  const note = e.note && e.note === m.downReason ? tx(m.downReason, m.downReasonTr) : e.note;
                  return (
                    <li key={e.id} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-ink">{label("downtime", e.reason)}</div>
                        {note && <div className="truncate text-xs text-ink-3">{note}</div>}
                      </div>
                      <div className="shrink-0 text-right text-xs tabular">
                        <div className="text-ink-2">{fmt.dateTime(start)}</div>
                        {ongoing ? (
                          <Badge tone="critical" dot className="mt-0.5">
                            {t("d.ongoing")} · {fmt.duration(minutes)}
                          </Badge>
                        ) : (
                          <div className="font-medium text-ink">{fmt.duration(minutes)}</div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[13px] text-ink-3">{t("d.downtimeEmpty")}</p>
            )}
          </section>

          {/* Maintenance */}
          <section>
            <SectionTitle>{t("d.maintenance")}</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <MoCard title={t("d.lastDone")} mo={lastDone} date={lastDone?.completedDate} />
              <MoCard title={t("d.nextScheduled")} mo={nextMo} date={nextMo?.scheduledDate} showStatus />
            </div>
            <KeyValue
              cols={4}
              className="mt-4"
              items={[
                { label: t("d.mtbf"), value: <span className="tabular">{t("d.hours", { n: fmt.num(m.mtbfHours) })}</span> },
                { label: t("d.mttr"), value: <span className="tabular">{t("d.hours", { n: fmt.num(m.mttrHours, 1) })}</span> },
                { label: t("d.lastPm"), value: <span className="tabular">{fmt.date(m.lastPm)}</span> },
                { label: t("d.nextPm"), value: <span className={cn("tabular", m.nextPm < clock.today && "text-critical-ink")}>{fmt.date(m.nextPm)}</span> },
              ]}
            />
          </section>
        </div>
      </Drawer>
      {reportOpen && <ReportModal machine={m} onClose={() => setReportOpen(false)} />}
    </>
  );
}

function MoCard({ title, mo, date, showStatus }: { title: string; mo?: MaintenanceOrder; date?: string; showStatus?: boolean }) {
  const fmt = useFmt();
  const label = useLabel();
  const tx = useTx();
  return (
    <div className="rounded-xl border border-line p-3.5">
      <div className="text-xs text-ink-3">{title}</div>
      {mo ? (
        <>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-2 tabular">
              {mo.id} · {label("maintType", mo.type)}
            </span>
            {showStatus && <StatusBadge kind="maintStatus" value={mo.status} />}
          </div>
          <div className="mt-1 line-clamp-2 text-[13px] font-medium text-ink">{tx(mo.title, mo.titleTr)}</div>
          {date && <div className="mt-1 text-xs text-ink-3 tabular">{fmt.dateLong(date)}</div>}
        </>
      ) : (
        <div className="mt-1 text-[13px] text-ink-3">—</div>
      )}
    </div>
  );
}

function ReportModal({ machine, onClose }: { machine: Machine; onClose: () => void }) {
  const t = useT(messages);
  const [reason, setReason] = useState<(typeof BREAKDOWN_REASONS)[number]>(machine.type === "weld_robot" || machine.type === "weld_station" || machine.type === "seam_welder" ? "weld" : "mechanical");
  const [note, setNote] = useState("");
  const submit = () => {
    const base = t(`reason.${reason}`);
    const text = note.trim() ? `${base} — ${note.trim()}` : base;
    const mo = reportBreakdown(machine.id, text);
    toast({ title: t("toast.reported", { id: machine.id }), description: t("toast.reportedDesc", { mo: mo ?? "" }), tone: "critical" });
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t("modal.title", { id: machine.id })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" icon={<AlertOctagon className="size-4" />} onClick={submit}>
            {t("modal.submit")}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label={t("modal.reason")}>
          <Select value={reason} onChange={(e) => setReason(e.target.value as (typeof BREAKDOWN_REASONS)[number])}>
            {BREAKDOWN_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`reason.${r}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("modal.note")}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("modal.notePh")} rows={3} />
        </Field>
        <p className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-ink-3">
          <AlertTriangle className="mt-px size-3.5 shrink-0 text-warn" />
          {t("modal.hint")}
        </p>
      </form>
    </Modal>
  );
}
