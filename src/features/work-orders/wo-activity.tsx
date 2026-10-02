"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FilePlus2, Flag, Flame, PackageCheck, PauseCircle, Play, PlayCircle, Send, ShieldAlert, ShieldCheck, ShieldX, type LucideIcon } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { cn } from "@/lib/cn";
import { HOUR, MIN } from "@/lib/data/clock";
import type { WorkOrder } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { useClock, useDb } from "@/lib/store";
import { Button, Card, CardHeader, type Tone } from "@/components/ui";
import { useWoLog } from "./actions";
import { messages } from "./messages";
import { useReasonTx } from "./reasons";

interface Ev {
  key: string;
  at: number;
  icon: LucideIcon;
  tone: Tone;
  title: string;
  detail?: string;
}

const toneCls: Record<Tone, string> = {
  neutral: "bg-surface-3 text-ink-2",
  brand: "bg-brand-soft text-brand-soft-ink",
  good: "bg-good-soft text-good-ink",
  warn: "bg-warn-soft text-warn-ink",
  serious: "bg-serious-soft text-serious-ink",
  critical: "bg-critical-soft text-critical-ink",
};

const COLLAPSED = 8;

/**
 * Timeline synthesized from the order's own data (creation, release,
 * operation bookings, inspections, NCRs, completion) plus the steps taken in
 * this session (release / hold / resume / priority).
 */
export function WoActivity({ wo }: { wo: WorkOrder }) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const reasonTx = useReasonTx();
  const clock = useClock();
  const lk = useLookups();
  const generatedAt = useDb((db) => db.generatedAt);
  const inspectionsAll = useDb((db) => db.inspections);
  const ncrsAll = useDb((db) => db.ncrs);
  const log = useWoLog((s) => s.events);
  const [all, setAll] = useState(false);

  const events = useMemo(() => {
    const session = log.filter((e) => e.woId === wo.id && e.dataset === generatedAt);
    const createdHere = session.some((e) => e.kind === "created");
    const out: Ev[] = [];
    const name = (id?: string) => (id ? lk.employee.get(id)?.name ?? id : "");

    out.push({
      key: "created",
      at: Date.parse(wo.createdAt),
      icon: FilePlus2,
      tone: "brand",
      title: createdHere ? t("ev.createdReleased") : t("ev.created"),
      detail: t("ev.createdBy", { name: name(wo.plannerId) }),
    });
    if (wo.status !== "planned" && !session.some((e) => e.kind === "released" || e.kind === "created")) {
      const firstStart = wo.operations[0].actualStart ? Date.parse(wo.operations[0].actualStart) : clock.now;
      const at = Math.min(firstStart - 5 * MIN, clock.now, Math.max(Date.parse(wo.createdAt) + 30 * MIN, Date.parse(wo.plannedStart) - 36 * HOUR));
      out.push({ key: "released", at, icon: Send, tone: "brand", title: t("ev.released") });
    }
    for (const op of wo.operations) {
      const opName = label("op", op.operation);
      if (op.actualStart)
        out.push({
          key: `${op.id}-s`,
          at: Date.parse(op.actualStart),
          icon: PlayCircle,
          tone: "brand",
          title: t("ev.opStarted", { seq: op.seq, op: opName }),
          detail: [op.machineId, name(op.operatorId)].filter(Boolean).join(" · "),
        });
      if (op.actualEnd)
        out.push({
          key: `${op.id}-e`,
          at: Date.parse(op.actualEnd),
          icon: CheckCircle2,
          tone: "good",
          title: t("ev.opDone", { seq: op.seq, op: opName }),
          detail: t("ev.opDoneDetail", { good: fmt.num(op.qtyDone), scrap: fmt.num(op.qtyScrap), machine: op.machineId }),
        });
    }
    if (wo.status === "on_hold" && !session.some((e) => e.kind === "hold")) {
      const paused = wo.operations.find((o) => o.status === "paused");
      const since = paused?.actualStart ? Date.parse(paused.actualStart) : Date.parse(wo.plannedStart);
      out.push({ key: "hold", at: Math.min(clock.now - 10 * MIN, since + (clock.now - since) * 0.6), icon: PauseCircle, tone: "warn", title: t("ev.hold"), detail: reasonTx(wo.holdReason) });
    }
    for (const i of inspectionsAll) {
      if (i.workOrderId !== wo.id) continue;
      out.push({
        key: i.id,
        at: Date.parse(i.at),
        icon: i.result === "pass" ? ShieldCheck : i.result === "fail" ? ShieldX : ShieldAlert,
        tone: i.result === "pass" ? "good" : i.result === "fail" ? "critical" : "warn",
        title: t("ev.inspection", { type: label("inspectionType", i.type), result: label("inspectionResult", i.result) }),
        detail: t("ev.inspectionDetail", { id: i.id, name: name(i.inspectorId) }),
      });
    }
    const createdDay = wo.createdAt.slice(0, 10);
    for (const n of ncrsAll) {
      if (n.workOrderId !== wo.id || n.openedAt < createdDay) continue;
      out.push({ key: n.id, at: Date.parse(`${n.openedAt}T15:00:00+03:00`), icon: Flame, tone: "critical", title: t("ev.ncr", { id: n.id }), detail: tx(n.title, n.titleTr) });
    }
    if (wo.status === "completed" && wo.actualEnd)
      out.push({
        key: "completed",
        at: Date.parse(wo.actualEnd) + 1,
        icon: PackageCheck,
        tone: "good",
        title: t("ev.completed"),
        detail: t("ev.completedDetail", { good: fmt.num(wo.qtyDone), qty: fmt.num(wo.qty) }),
      });
    for (const e of session) {
      if (e.kind === "created") continue;
      const map = {
        released: { icon: Send, tone: "brand", title: t("ev.released"), detail: undefined },
        hold: { icon: PauseCircle, tone: "warn", title: t("ev.hold"), detail: reasonTx(e.detail) },
        resumed: { icon: Play, tone: "good", title: t("ev.resumed"), detail: undefined },
        priority: { icon: Flag, tone: "serious", title: t("ev.priority", { p: label("priority", (e.detail ?? "normal") as never) }), detail: undefined },
      } as const;
      const m = map[e.kind];
      out.push({ key: `s${e.id}`, at: e.at, icon: m.icon, tone: m.tone, title: m.title, detail: m.detail });
    }
    return out.sort((a, b) => b.at - a.at);
  }, [log, wo, generatedAt, inspectionsAll, ncrsAll, lk, clock.now, t, tx, fmt, label, reasonTx]);

  const shown = all ? events : events.slice(0, COLLAPSED);

  return (
    <Card>
      <CardHeader title={t("common.activity")} subtitle={t("ev.subtitle")} />
      <ol className="px-5 pb-4">
        {shown.map((e, i) => {
          const Icon = e.icon;
          return (
            <li key={e.key} className="relative flex gap-3 pb-4 last:pb-0">
              {i < shown.length - 1 && <span className="absolute top-8 bottom-1 left-[13px] w-px bg-line" aria-hidden />}
              <span className={cn("relative flex size-7 shrink-0 items-center justify-center rounded-full", toneCls[e.tone])}>
                <Icon className="size-3.5" />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-[13px] leading-snug font-medium text-ink">{e.title}</p>
                {e.detail && <p className="mt-0.5 text-xs break-words text-ink-2">{e.detail}</p>}
                <p className="mt-0.5 text-[11px] text-ink-3 tabular">
                  {fmt.dateTime(e.at)} · {fmt.relative(Math.min(e.at, clock.now), clock.now)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {events.length > COLLAPSED && (
        <div className="border-t border-line px-5 py-2.5">
          <Button variant="ghost" size="sm" onClick={() => setAll(!all)}>
            {all ? t("ev.showLess") : t("ev.showAll", { n: events.length })}
          </Button>
        </div>
      )}
    </Card>
  );
}
