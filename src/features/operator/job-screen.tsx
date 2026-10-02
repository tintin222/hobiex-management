"use client";

import Image from "next/image";
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertOctagon,
  ArrowLeftRight,
  BadgeCheck,
  CheckCheck,
  CheckCircle2,
  ClipboardCheck,
  Factory,
  FileText,
  Gauge,
  HardHat,
  Hash,
  Hourglass,
  Inbox,
  Layers,
  ListOrdered,
  Megaphone,
  PackagePlus,
  Pause,
  PauseCircle,
  Play,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Timer,
  Trash2,
  Wrench,
} from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { MIN } from "@/lib/data/clock";
import { DEFECT_LABELS, OP_LABELS } from "@/lib/data/labels";
import type { DefectType, Employee, Machine, Product, RoutingStep, WorkOrder, WorkOrderOperation } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { toast, useDb } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Badge, Card, CardBody, CardHeader, EmptyState, KeyValue, PriorityBadge, Progress, SectionTitle, StatusBadge } from "@/components/ui";
import { IluoGlyph } from "@/features/workforce/iluo";
import { runMs, terminal, useRunLog, type CallKind } from "./actions";
import { BREAKDOWN_REASONS, CHECKPOINTS, downReason, openCorrective, SAFETY, type BreakdownKind } from "./instructions";
import { BreakdownDialog, CompleteDialog, KeypadDialog, ScrapDialog, StartAnywayDialog } from "./job-dialogs";
import { messages } from "./messages";
import { Banner, BigButton } from "./terminal-ui";
import { hms, useNow } from "./use-now";

type Job = { wo: WorkOrder; op: WorkOrderOperation };
type Dialog = "keypad" | "scrap" | "complete" | "breakdown" | "startAnyway" | null;

export function JobScreen({ operator, machine, onChangeMachine }: { operator: Employee; machine: Machine; onChangeMachine: () => void }) {
  const t = useT(messages);
  const label = useLabel();
  const tx = useTx();
  const fmt = useFmt();
  const lk = useLookups();
  const workOrders = useDb((db) => db.workOrders);
  const maintenance = useDb((db) => db.maintenance);

  const [picked, setPicked] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [lastReport, setLastReport] = useState<{ opId: string; qty: number; at: number } | null>(null);
  const [calls, setCalls] = useState<Partial<Record<CallKind, { taskId: string; at: number }>>>({});

  // ── Current job + queue on this machine ──
  const { current, queue } = useMemo(() => {
    const active: Job[] = [];
    const queue: Job[] = [];
    for (const wo of workOrders) {
      if (wo.status === "planned" || wo.status === "completed") continue;
      for (const op of wo.operations) {
        if (op.machineId !== machine.id) continue;
        if ((op.status === "running" || op.status === "paused") && wo.status !== "on_hold") active.push({ wo, op });
        else if (op.status === "ready" || op.status === "pending" || op.status === "paused") queue.push({ wo, op });
      }
    }
    const rank = (j: Job) => (j.op.status === "running" ? 0 : j.op.id === machine.currentOpId ? 1 : 2);
    active.sort((a, b) => rank(a) - rank(b) || (b.op.actualStart ?? "").localeCompare(a.op.actualStart ?? ""));
    queue.push(...active.slice(1));
    queue.sort((a, b) => a.op.plannedStart.localeCompare(b.op.plannedStart));
    return { current: active[0] as Job | undefined, queue };
  }, [workOrders, machine.id, machine.currentOpId]);

  const startable = (j: Job) => j.wo.status !== "on_hold";
  const autoNext =
    queue.find((j) => startable(j) && j.op.id === machine.currentOpId) ?? queue.find((j) => startable(j) && j.op.status === "ready") ?? queue.find(startable);
  const job = current ?? queue.find((j) => j.op.id === picked) ?? autoNext;
  const isCurrent = !!current && job === current;

  const product = job ? lk.product.get(job.wo.productId) : undefined;
  const step = job && product ? (product.routing.find((s) => s.seq === job.op.seq && s.operation === job.op.operation) ?? product.routing.find((s) => s.operation === job.op.operation)) : undefined;

  // ── State flags ──
  const op = job?.op;
  const wo = job?.wo;
  const remaining = op && wo ? Math.max(0, wo.qty - op.qtyDone - op.qtyScrap) : 0;
  const running = op?.status === "running";
  const paused = op?.status === "paused";
  const down = machine.status === "down";
  const inMaint = machine.status === "maintenance";
  const onHold = wo?.status === "on_hold";
  const level = op ? (operator.skills[op.operation] ?? 0) : 0;
  const qualified = level >= 1;
  const idx = wo && op ? wo.operations.findIndex((o) => o.id === op.id) : -1;
  const prevOp = wo && idx > 0 ? wo.operations[idx - 1] : undefined;
  const waiting = op?.status === "pending" && !!prevOp && prevOp.status !== "done";

  const canStart = !!op && !running && !down && !inMaint && !onHold;
  const canReport = running && remaining > 0;
  const canScrap = (running || paused) && remaining > 0 && !onHold;
  const canComplete = (running || paused) && !onHold;

  const mo = down ? openCorrective(machine, maintenance) : undefined;
  const reason = down ? downReason(machine, maintenance) : undefined;

  // ── Handlers ──
  const opText = (j: Job) => `${j.wo.id} · ${label("op", j.op.operation)}`;

  const doStart = () => {
    if (!job) return;
    const resumed = job.op.status === "paused";
    terminal.start(job.wo.id, job.op.id, operator.id);
    setPicked(null);
    setDialog(null);
    toast({ title: resumed ? t("toast.resumed") : t("toast.started"), description: opText(job), tone: "good" });
  };
  const start = () => (waiting ? setDialog("startAnyway") : doStart());

  const pause = () => {
    if (!job) return;
    terminal.pause(job.wo.id, job.op.id);
    toast({ title: t("toast.paused"), description: opText(job), tone: "warn" });
  };

  const addGood = (n: number) => {
    if (!job) return;
    const qty = Math.min(n, remaining);
    if (qty <= 0) return;
    const at = terminal.reportGood(job.wo.id, job.op.id, qty);
    setLastReport({ opId: job.op.id, qty, at });
    setDialog(null);
    if (qty === remaining) toast({ title: t("toast.allReported"), description: t("toast.allReportedDesc"), tone: "good" });
  };

  const reportScrap = (defect: DefectType, qty: number, openNcr: boolean) => {
    if (!job || !product) return;
    const ncr = terminal.reportScrap({ woId: job.wo.id, opId: job.op.id, qty, defect, defectLabel: DEFECT_LABELS[defect], openNcr, productId: product.id, sku: product.sku, plantId: machine.plantId });
    setDialog(null);
    toast({ title: t("toast.scrap", { n: qty, defect: label("defect", defect) }), description: ncr ? t("toast.ncr", { id: ncr.id }) : undefined, tone: "warn" });
  };

  const complete = () => {
    if (!job) return;
    const next = job.wo.operations[idx + 1];
    terminal.complete(job.wo.id, job.op.id);
    setDialog(null);
    setPicked(null);
    setLastReport(null);
    toast({
      title: t("toast.completed", { op: label("op", job.op.operation) }),
      description: next ? t("toast.nextOp", { seq: next.seq, op: label("op", next.operation), machine: next.machineId }) : t("toast.woDone", { wo: job.wo.id }),
      tone: "good",
    });
  };

  const breakdown = (kind: BreakdownKind) => {
    const created = terminal.reportBreakdown(machine.id, BREAKDOWN_REASONS[kind], operator.id);
    setDialog(null);
    toast({ title: t("toast.breakdown", { id: machine.id }), description: created ? t("toast.breakdownDesc", { mo: created.id }) : undefined, tone: "critical" });
  };

  const release = () => {
    terminal.releaseMachine(machine.id);
    toast({ title: t("toast.released", { id: machine.id }), description: t("toast.releasedDesc"), tone: "good" });
  };

  const call = (kind: CallKind) => {
    const { task, assignee } = terminal.call(kind, { operator, machineId: machine.id, woId: job?.wo.id, sku: product?.sku, opLabel: job ? OP_LABELS[job.op.operation] : undefined });
    setCalls((c) => ({ ...c, [kind]: { taskId: task.id, at: Date.now() } }));
    const title = kind === "team_lead" ? t("toast.calledLead") : kind === "maintenance" ? t("toast.calledMaint") : t("toast.calledMaterial");
    toast({ title, description: assignee ? t("toast.calledDesc", { name: assignee.name, id: task.id }) : task.id, tone: "info" });
  };
  const callSub = (kind: CallKind) => {
    const c = calls[kind];
    return c ? t("andon.sent", { id: c.taskId, time: fmt.time(c.at) }) : undefined;
  };

  // ── Hint under the action pad ──
  const hint = !job
    ? null
    : down
      ? { tone: "critical", text: t("hint.down") }
      : inMaint
        ? { tone: "warn", text: t("hint.maintenance") }
        : onHold
          ? { tone: "warn", text: t("hint.hold") }
          : running && remaining === 0
            ? { tone: "good", text: t("hint.allReported") }
            : running
              ? { tone: "good", text: t("hint.running") }
              : paused
                ? { tone: "warn", text: t("hint.paused") }
                : { tone: "brand", text: t("hint.pressStart") };

  return (
    <div className="flex flex-col gap-4">
      <MachineBar machine={machine} onChange={onChangeMachine} />

      {down && (
        <Banner
          tone="critical"
          icon={<AlertOctagon className="size-10" />}
          title={t("down.title")}
          actions={
            <>
              <BigButton tone="neutral" size="md" icon={<Wrench className="size-5" />} onClick={() => call("maintenance")}>
                {t("btn.callMaint")}
              </BigButton>
              <BigButton tone="neutral" size="md" icon={<ShieldCheck className="size-5" />} onClick={release}>
                {t("down.release")}
              </BigButton>
            </>
          }
        >
          <span className="font-semibold">{reason ? tx(reason.en, reason.tr) : label("machineStatus", "down")}</span>
          {" · "}
          <LiveSince iso={machine.statusSince} />
          {mo && ` · ${t("down.mo", { id: mo.id, status: label("maintStatus", mo.status) })}`}
        </Banner>
      )}
      {inMaint && (
        <Banner tone="warn" icon={<Wrench className="size-9" />} title={t("maint.title")} actions={<BigButton tone="neutral" size="md" icon={<ShieldCheck className="size-5" />} onClick={release}>{t("down.release")}</BigButton>}>
          {t("maint.body")}
        </Banner>
      )}
      {job && onHold && (
        <Banner tone="warn" icon={<PauseCircle className="size-9" />} title={t("hold.title", { wo: job.wo.id })} actions={<BigButton tone="neutral" size="md" icon={<Megaphone className="size-5" />} onClick={() => call("team_lead")}>{t("btn.callLead")}</BigButton>}>
          {job.wo.holdReason}
        </Banner>
      )}
      {job && !qualified && (
        <Banner tone="warn" icon={<ShieldAlert className="size-9" />} title={t("qual.title", { op: label("op", job.op.operation) })} actions={<BigButton tone="neutral" size="md" icon={<Megaphone className="size-5" />} onClick={() => call("team_lead")}>{t("btn.callLead")}</BigButton>}>
          {t("qual.body")}
        </Banner>
      )}
      {job && waiting && prevOp && (
        <Banner tone="brand" icon={<Hourglass className="size-9" />} title={t("waiting.title", { seq: prevOp.seq, op: label("op", prevOp.operation) })}>
          {t("waiting.body", { machine: prevOp.machineId, status: label("opStatus", prevOp.status) })}
        </Banner>
      )}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start">
        {/* Left: current job + work instructions */}
        <div className="contents lg:col-span-7 lg:flex lg:min-w-0 lg:flex-col lg:gap-4 2xl:col-span-8">
          <div className="order-1 min-w-0 lg:order-none">
            {job && product ? (
              <Card className="overflow-hidden">
                <div className={cn("h-1.5", running ? "bg-good" : paused ? "bg-warn" : "bg-surface-3")} aria-hidden />
                <div className="p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={isCurrent ? "brand" : "neutral"} className="h-7 px-2.5 text-[13px]">
                      {isCurrent ? t("job.current") : t("job.next")}
                    </Badge>
                    <StatusBadge kind="opStatus" value={job.op.status} className="h-7 px-2.5 text-[13px]" />
                    <PriorityBadge value={job.wo.priority} />
                    {qualified ? (
                      <Badge tone="good" icon={<BadgeCheck className="size-3.5" />}>
                        {t("ws.qualified")} <IluoGlyph level={level} size={14} className="ml-0.5" />
                      </Badge>
                    ) : (
                      <Badge tone="warn" icon={<ShieldAlert className="size-3.5" />}>
                        {t("ws.notQualified")}
                      </Badge>
                    )}
                    {job.op.operatorId && job.op.operatorId !== operator.id && (
                      <span className="ml-auto text-sm text-ink-3">{t("job.startedBy", { name: lk.employee.get(job.op.operatorId)?.name ?? job.op.operatorId })}</span>
                    )}
                  </div>
                  <div className="mt-3 min-w-0">
                    <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight text-ink md:text-4xl">{label("op", job.op.operation)}</h1>
                    <p className="mt-1 text-lg text-ink-2">
                      <span className="font-semibold text-ink">{product.sku}</span> · {product.name}
                    </p>
                    <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3">
                      <span>
                        {t("common.workOrder")} <span className="tabular font-semibold text-ink-2">{job.wo.id}</span>
                      </span>
                      <span>{t("job.opOf", { seq: job.op.seq, i: idx + 1, n: job.wo.operations.length })}</span>
                      <span>
                        {t("common.lot")} <span className="tabular font-medium text-ink-2">{job.wo.lotNo}</span>
                      </span>
                      <span>{job.wo.customerId ? lk.customer.get(job.wo.customerId)?.name : t("common.makeToStock")}</span>
                      <span>
                        {t("common.due")} <span className="font-medium text-ink-2">{fmt.date(job.wo.dueDate)}</span>
                      </span>
                    </p>
                  </div>
                  <LiveCounters wo={job.wo} op={job.op} lastReport={lastReport?.opId === job.op.id ? lastReport : null} />
                </div>
              </Card>
            ) : (
              <Card>
                <EmptyState
                  icon={<Inbox className="size-6" />}
                  title={t("job.none")}
                  hint={t("job.noneHint")}
                  action={
                    <BigButton tone="neutral" size="md" icon={<ArrowLeftRight className="size-5" />} onClick={onChangeMachine}>
                      {t("mb.change")}
                    </BigButton>
                  }
                />
              </Card>
            )}
          </div>
          {job && product && step && (
            <div className="order-4 min-w-0 lg:order-none">
              <Instructions wo={job.wo} op={job.op} product={product} step={step} />
            </div>
          )}
        </div>

        {/* Right: the operator's thumb zone — action pad, andon, queue */}
        <div className="contents lg:col-span-5 lg:flex lg:min-w-0 lg:flex-col lg:gap-4 2xl:col-span-4">
          <Card className="order-2 p-4 lg:order-none">
            <div className="grid grid-cols-2 gap-3">
              <BigButton tone="start" size="xl" icon={<Play className="size-8 fill-current" />} disabled={!canStart} onClick={start} className="flex-col gap-1.5">
                {paused ? t("btn.resume") : t("btn.start")}
              </BigButton>
              <BigButton tone="pause" size="xl" icon={<Pause className="size-8 fill-current" />} disabled={!running} onClick={pause} className="flex-col gap-1.5">
                {t("btn.pause")}
              </BigButton>
              <BigButton
                tone="complete"
                size="xl"
                icon={<CheckCheck className="size-8" />}
                disabled={!canComplete}
                onClick={() => setDialog("complete")}
                className={cn("col-span-2 min-h-20", canComplete && remaining === 0 && "ring-4 ring-brand/30")}
              >
                {t("btn.complete")}
              </BigButton>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2.5">
              {[1, 5, 10].map((n) => (
                <BigButton key={n} tone="good" size="lg" disabled={!canReport} onClick={() => addGood(n)} aria-label={t("btn.addGood", { n })} className="flex-col gap-0 px-2">
                  <span className="tabular text-2xl leading-none">+{n}</span>
                  <span className="text-xs font-medium opacity-80">{t("btn.good")}</span>
                </BigButton>
              ))}
              <BigButton tone="good" size="lg" disabled={!canReport} onClick={() => setDialog("keypad")} className="flex-col gap-0.5 px-2">
                <Hash className="size-6" />
                <span className="text-xs leading-tight font-medium">{t("btn.custom")}</span>
              </BigButton>
            </div>
            <BigButton tone="scrap" size="lg" icon={<Trash2 className="size-5" />} disabled={!canScrap} onClick={() => setDialog("scrap")} className="mt-3 w-full">
              {t("btn.scrap")}
            </BigButton>
            {hint && (
              <p
                className={cn(
                  "mt-3 flex items-start gap-2 text-sm font-medium",
                  hint.tone === "critical" ? "text-critical-ink" : hint.tone === "warn" ? "text-warn-ink" : hint.tone === "good" ? "text-good-ink" : "text-brand-soft-ink",
                )}
              >
                <span className="mt-0.5 shrink-0">
                  {hint.tone === "good" ? <CheckCircle2 className="size-4" /> : hint.tone === "critical" ? <AlertOctagon className="size-4" /> : hint.tone === "warn" ? <PauseCircle className="size-4" /> : <Play className="size-4" />}
                </span>
                {hint.text}
              </p>
            )}
          </Card>

          <Card className="order-3 p-4 lg:order-none">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-ink-3 uppercase">
              <Siren className="size-4" />
              {t("andon.title")}
            </h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <BigButton tone="danger" size="md" icon={<AlertOctagon className="size-6 shrink-0" />} disabled={down} onClick={() => setDialog("breakdown")} className="justify-start text-left" sub={down ? t("andon.alreadyDown") : t("andon.breakdownSub")}>
                {t("btn.breakdown")}
              </BigButton>
              <BigButton tone="neutral" size="md" icon={<Megaphone className="size-6 shrink-0" />} onClick={() => call("team_lead")} className="justify-start text-left" sub={callSub("team_lead") ?? t("andon.leadSub")}>
                {t("btn.callLead")}
              </BigButton>
              <BigButton tone="neutral" size="md" icon={<Wrench className="size-6 shrink-0" />} onClick={() => call("maintenance")} className="justify-start text-left" sub={callSub("maintenance") ?? t("andon.maintSub")}>
                {t("btn.callMaint")}
              </BigButton>
              <BigButton tone="neutral" size="md" icon={<PackagePlus className="size-6 shrink-0" />} onClick={() => call("material")} className="justify-start text-left" sub={callSub("material") ?? t("andon.materialSub")}>
                {t("btn.material")}
              </BigButton>
            </div>
          </Card>

          <div className="order-5 min-w-0 lg:order-none">
            <Card>
              <CardHeader title={t("queue.title")} subtitle={t("queue.subtitle", { n: queue.length, id: machine.id })} icon={<ListOrdered className="size-4" />} />
              {queue.length === 0 ? (
                <EmptyState icon={<Inbox className="size-5" />} title={t("queue.empty")} />
              ) : (
                <ul className="flex flex-col gap-2 px-4 pb-4">
                  {queue.slice(0, 5).map((j) => {
                    const sel = !current && j === job;
                    const held = j.wo.status === "on_hold";
                    const p = lk.product.get(j.wo.productId);
                    return (
                      <li key={j.op.id}>
                        <button
                          type="button"
                          disabled={!!current}
                          onClick={() => setPicked(j.op.id)}
                          className={cn(
                            "flex min-h-16 w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors",
                            sel ? "border-brand bg-brand-soft" : "border-line",
                            current ? "cursor-default" : "hover:border-line-strong active:scale-[0.99]",
                          )}
                        >
                          <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-surface-3 leading-none">
                            <span className="text-[10px] text-ink-3">{t("queue.op")}</span>
                            <span className="tabular text-sm font-semibold text-ink">{j.op.seq}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink">
                              {p?.sku} <span className="font-normal text-ink-3">· {fmt.num(j.wo.qty)} {t("common.pcs")}</span>
                            </span>
                            <span className="block truncate text-xs text-ink-3">
                              {j.wo.id} · {label("op", j.op.operation)} · {fmt.dateTime(j.op.plannedStart)}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            {held ? (
                              <Badge tone="warn" icon={<PauseCircle className="size-3.5" />}>
                                {label("woStatus", "on_hold")}
                              </Badge>
                            ) : !current && j === autoNext ? (
                              <Badge tone="brand" icon={<Play className="size-3" />}>
                                {t("queue.next")}
                              </Badge>
                            ) : (
                              <StatusBadge kind="opStatus" value={j.op.status} />
                            )}
                            {(j.wo.priority === "urgent" || j.wo.priority === "high") && <PriorityBadge value={j.wo.priority} compact />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {queue.length > 5 && <li className="px-1 pt-1 text-xs text-ink-3">{t("queue.more", { n: queue.length - 5 })}</li>}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>

      {dialog === "keypad" && <KeypadDialog max={remaining} onClose={() => setDialog(null)} onConfirm={addGood} />}
      {dialog === "scrap" && job && <ScrapDialog max={remaining} operation={job.op.operation} onClose={() => setDialog(null)} onConfirm={reportScrap} />}
      {dialog === "complete" && job && <CompleteDialog wo={job.wo} op={job.op} onClose={() => setDialog(null)} onConfirm={complete} />}
      {dialog === "breakdown" && <BreakdownDialog machineId={machine.id} onClose={() => setDialog(null)} onConfirm={breakdown} />}
      {dialog === "startAnyway" && prevOp && <StartAnywayDialog prev={prevOp} onClose={() => setDialog(null)} onConfirm={doStart} />}
    </div>
  );
}

// ───────────────────────────── Machine bar ─────────────────────────────
function MachineBar({ machine, onChange }: { machine: Machine; onChange: () => void }) {
  const t = useT(messages);
  const fmt = useFmt();
  const iconTone: Record<Machine["status"], string> = {
    running: "bg-good-soft text-good-ink",
    setup: "bg-brand-soft text-brand-soft-ink",
    idle: "bg-surface-3 text-ink-2",
    maintenance: "bg-warn-soft text-warn-ink",
    down: "bg-critical-soft text-critical-ink",
  };
  return (
    <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-2xl", iconTone[machine.status])}>
          <Factory className="size-7" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-3xl leading-none font-semibold text-ink">{machine.id}</span>
            <StatusBadge kind="machineStatus" value={machine.status} className="h-7 px-2.5 text-[13px]" />
          </div>
          <div className="mt-1 truncate text-sm text-ink-2">
            {machine.name} · {machine.model} · {t("line", { l: machine.line.replace("Line ", "") })}
          </div>
        </div>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <div className="text-xs text-ink-3">{t("mb.output")}</div>
          <div className="tabular text-lg font-semibold text-ink">
            {fmt.num(machine.outputToday)} <span className="text-sm font-normal text-ink-3">/ {fmt.num(machine.targetToday)}</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-ink-3">{t("common.oee")}</div>
          <div className="tabular text-lg font-semibold text-ink">{fmt.pct(machine.oee)}</div>
        </div>
        <BigButton tone="neutral" size="md" icon={<ArrowLeftRight className="size-5" />} onClick={onChange}>
          {t("mb.change")}
        </BigButton>
      </div>
    </Card>
  );
}

// ───────────────────────────── Live counters ─────────────────────────────
function Counter({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
  live,
  className,
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: ReactNode;
  tone?: "good" | "critical" | "warn" | "neutral";
  live?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const toneCls = { good: "text-good-ink", critical: "text-critical-ink", warn: "text-warn-ink", neutral: "text-ink" }[tone];
  return (
    <div className={cn("min-w-0 rounded-2xl border border-line bg-surface-2 p-4", className)}>
      <div className="flex items-center justify-between gap-2 text-sm font-medium text-ink-2">
        <span className="flex items-center gap-1.5 truncate">
          {live && <span className="pulse-dot size-2 shrink-0 rounded-full bg-good" aria-hidden />}
          {label}
        </span>
        <span className="text-ink-3">{icon}</span>
      </div>
      <div className={cn("tabular mt-2 font-display text-[40px] leading-none font-semibold tracking-tight lg:text-5xl", toneCls)}>{value}</div>
      {sub && <div className="mt-2 truncate text-xs text-ink-3">{sub}</div>}
      {children}
    </div>
  );
}

function LiveCounters({ wo, op, lastReport }: { wo: WorkOrder; op: WorkOrderOperation; lastReport: { qty: number; at: number } | null }) {
  const t = useT(messages);
  const fmt = useFmt();
  const now = useNow(1000);
  const rec = useRunLog((s) => s.log[op.id]);
  const elapsed = runMs(op, rec, now);
  const elapsedMin = elapsed / MIN;
  const good = op.qtyDone;
  const scrap = op.qtyScrap;
  const remaining = Math.max(0, wo.qty - good - scrap);
  // earned standard minutes ÷ run minutes (setup spread over the lot)
  const eff = good > 0 && elapsedMin >= 1 ? ((good / wo.qty) * op.stdMinutes) / elapsedMin : undefined;
  const effTone = eff === undefined ? "neutral" : eff >= 0.9 ? "good" : eff >= 0.75 ? "warn" : "critical";
  const actualPerPc = good > 0 ? elapsedMin / good : undefined;
  const pctDone = (good + scrap) / Math.max(1, wo.qty);

  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Counter
          className="md:col-span-2"
          label={t("cnt.good")}
          value={fmt.num(good)}
          tone="good"
          icon={<CheckCircle2 className="size-5" />}
          sub={lastReport ? t("cnt.last", { n: lastReport.qty, time: fmt.time(lastReport.at) }) : t("cnt.ofTarget", { n: fmt.num(wo.qty) })}
        />
        <Counter
          className="md:col-span-2"
          label={t("cnt.scrap")}
          value={fmt.num(scrap)}
          tone={scrap > 0 ? "critical" : "neutral"}
          icon={<Trash2 className="size-5" />}
          sub={t("cnt.scrapRate", { pct: fmt.pct(scrap / Math.max(1, good + scrap), 1) })}
        />
        <Counter className="col-span-2" label={t("cnt.remaining")} value={fmt.num(remaining)} icon={<Layers className="size-5" />} sub={t("cnt.ofTarget", { n: fmt.num(wo.qty) })} />
        <Counter
          className="col-span-2 md:col-span-3"
          label={t("cnt.elapsed")}
          value={hms(elapsed)}
          live={op.status === "running"}
          tone={elapsedMin > op.stdMinutes ? "warn" : "neutral"}
          icon={<Timer className="size-5" />}
          sub={t("cnt.std", { d: fmt.duration(op.stdMinutes) })}
        >
          <Progress value={elapsedMin / Math.max(1, op.stdMinutes)} tone={elapsedMin > op.stdMinutes ? "warn" : "brand"} size="sm" className="mt-2" />
        </Counter>
        <Counter
          className="col-span-2 md:col-span-3"
          label={t("cnt.efficiency")}
          value={eff === undefined ? "—" : fmt.pct(Math.min(eff, 1.99))}
          tone={effTone}
          icon={<Gauge className="size-5" />}
          sub={eff === undefined ? t("cnt.effWaiting") : t("cnt.perPc", { a: fmt.num(actualPerPc!, 1), s: fmt.num(op.stdMinutes / wo.qty, 1) })}
        >
          <Progress value={(eff ?? 0) / 1.2} tone={effTone === "neutral" ? "brand" : effTone} size="sm" className="mt-2" />
        </Counter>
      </div>
      <div className="mt-4">
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(pctDone * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-good transition-[width] duration-500" style={{ width: `${(good / Math.max(1, wo.qty)) * 100}%` }} />
          <div className="h-full bg-critical transition-[width] duration-500" style={{ width: `${(scrap / Math.max(1, wo.qty)) * 100}%` }} />
        </div>
        <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-ink-3">
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-good" />
              {t("cnt.good")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-critical" />
              {t("cnt.scrap")}
            </span>
          </span>
          <span className="tabular">{t("cnt.progress", { done: fmt.num(good + scrap), n: fmt.num(wo.qty), pct: fmt.pct(pctDone) })}</span>
        </div>
      </div>
    </>
  );
}

function LiveSince({ iso }: { iso: string }) {
  const t = useT(messages);
  const fmt = useFmt();
  const now = useNow(15_000);
  return <>{t("down.since", { t: fmt.time(iso), d: fmt.duration(Math.max(0, now - Date.parse(iso)) / MIN) })}</>;
}

// ───────────────────────────── Work instructions ─────────────────────────────
function Instructions({ wo, op, product, step }: { wo: WorkOrder; op: WorkOrderOperation; product: Product; step: RoutingStep }) {
  const t = useT(messages);
  const tx = useTx();
  const label = useLabel();
  const fmt = useFmt();
  const safety = SAFETY[op.operation];
  return (
    <Card>
      <CardHeader
        title={t("wi.title")}
        subtitle={t("wi.subtitle", { sku: product.sku, rev: product.drawingRev })}
        icon={<FileText className="size-4" />}
        actions={<Badge tone="brand">{product.drawingRev}</Badge>}
      />
      <CardBody className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="relative overflow-hidden rounded-xl border border-line bg-surface-3">
            <Image src={product.image} alt={product.name} width={640} height={480} className="aspect-[16/10] w-full object-cover" />
            <span className="absolute top-2 left-2 rounded-md bg-surface/90 px-2 py-0.5 text-xs font-medium text-ink shadow-sm">{label("category", product.category)}</span>
          </div>
          <div>
            <div className="font-semibold text-ink">
              {product.sku} <span className="font-normal text-ink-3">· {product.oemRef}</span>
            </div>
            <div className="text-sm text-ink-2">{product.name}</div>
            <div className="mt-0.5 text-xs text-ink-3">
              {product.oem} {product.model} · {product.euroNorm} · {fmt.num(product.weightKg, 1)} kg
            </div>
          </div>
          <KeyValue
            cols={2}
            items={[
              { label: t("wi.operation"), value: `${op.seq} · ${label("op", op.operation)}` },
              { label: t("wi.workCenter"), value: label("wc", step.workCenterType) },
              { label: t("wi.setup"), value: fmt.duration(step.setupMin) },
              { label: t("wi.cycle"), value: t("wi.cycleValue", { m: fmt.num(step.cycleMin, 1) }) },
              { label: t("wi.target"), value: `${fmt.num(wo.qty)} ${t("common.pcs")}` },
              { label: t("wi.std"), value: fmt.duration(op.stdMinutes) },
            ]}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <SectionTitle>{t("wi.checkpoints")}</SectionTitle>
            <ul className="flex flex-col gap-2">
              {CHECKPOINTS[op.operation].map((c) => (
                <li key={c.en} className="flex gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-[15px] leading-snug text-ink">
                  <ClipboardCheck className="mt-0.5 size-5 shrink-0 text-brand" />
                  {tx(c.en, c.tr)}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex gap-3 rounded-xl border-2 border-warn/60 bg-warn-soft p-3.5 text-warn-ink">
            <HardHat className="mt-0.5 size-6 shrink-0" />
            <div>
              <div className="text-xs font-semibold tracking-wide uppercase">{t("wi.safety")}</div>
              <p className="mt-0.5 text-sm leading-snug font-medium">{tx(safety.en, safety.tr)}</p>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
