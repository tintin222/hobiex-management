"use client";

import { useEffect, useState } from "react";
import { AlertOctagon, AlertTriangle, ArrowRight, Check, CheckCheck, Cog, Cpu, Delete, Droplets, FileWarning, Flame, Fuel, Hammer, Minus, Plus, ScanEye, Trash2, Zap, type LucideIcon } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { DEFECT_LABELS } from "@/lib/data/labels";
import type { DefectType, OperationType, WorkOrder, WorkOrderOperation } from "@/lib/data/types";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui";
import { runMs, useRunLog } from "./actions";
import { BREAKDOWN_REASONS, LIKELY_DEFECTS, type BreakdownKind } from "./instructions";
import { messages } from "./messages";
import { BigButton } from "./terminal-ui";
import { hms, useNow } from "./use-now";

const MAX_DIGITS = 5;
function nextValue(v: string, key: string) {
  if (key === "C") return "";
  if (key === "⌫") return v.slice(0, -1);
  return (v + key).replace(/^0+/, "").slice(0, MAX_DIGITS);
}

// ───────────────────────────── Keypad ─────────────────────────────
export function KeypadDialog({ max, onClose, onConfirm }: { max: number; onClose: () => void; onConfirm: (n: number) => void }) {
  const t = useT(messages);
  const fmt = useFmt();
  const [val, setVal] = useState("");
  const n = Number(val || 0);
  const tooMany = n > max;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setVal((v) => nextValue(v, e.key));
      else if (e.key === "Backspace") setVal((v) => nextValue(v, "⌫"));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <Modal
      open
      onClose={onClose}
      title={t("keypad.title")}
      width="max-w-md"
      footer={
        <>
          <BigButton size="md" tone="neutral" onClick={onClose}>
            {t("common.cancel")}
          </BigButton>
          <BigButton size="md" tone="start" icon={<Check className="size-5" />} disabled={n <= 0 || tooMany} onClick={() => onConfirm(n)}>
            {t("keypad.confirm", { n: fmt.num(n) })}
          </BigButton>
        </>
      }
    >
      <div className={cn("flex items-baseline justify-between rounded-2xl border-2 bg-surface-2 px-5 py-4", tooMany ? "border-critical" : "border-line")}>
        <span className="tabular font-display text-5xl font-semibold text-ink">{val || "0"}</span>
        <span className="text-sm text-ink-3">{t("common.pcs")}</span>
      </div>
      <p className={cn("mt-2 text-sm", tooMany ? "font-medium text-critical-ink" : "text-ink-3")}>{tooMany ? t("keypad.tooMany", { max: fmt.num(max) }) : t("keypad.max", { max: fmt.num(max) })}</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setVal((v) => nextValue(v, k))}
            aria-label={k === "⌫" ? t("keypad.backspace") : k === "C" ? t("keypad.clear") : k}
            className={cn(
              "flex h-16 items-center justify-center rounded-xl border-2 text-2xl font-semibold transition-transform active:scale-95",
              k === "C" || k === "⌫" ? "border-line bg-surface-3 text-ink-2" : "tabular border-line bg-surface text-ink hover:border-line-strong",
            )}
          >
            {k === "⌫" ? <Delete className="size-6" /> : k}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setVal(String(max))} disabled={max <= 0} className="mt-3 h-12 w-full rounded-xl border-2 border-dashed border-line-strong text-sm font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-40">
        {t("keypad.all", { n: fmt.num(max) })}
      </button>
    </Modal>
  );
}

// ───────────────────────────── Scrap ─────────────────────────────
export function ScrapDialog({
  max,
  operation,
  onClose,
  onConfirm,
}: {
  max: number;
  operation: OperationType;
  onClose: () => void;
  onConfirm: (defect: DefectType, qty: number, openNcr: boolean) => void;
}) {
  const t = useT(messages);
  const label = useLabel();
  const [defect, setDefect] = useState<DefectType | null>(null);
  const [qty, setQty] = useState(1);
  const [ncr, setNcr] = useState(true);
  const likely = LIKELY_DEFECTS[operation] ?? [];
  const ordered = [...likely, ...(Object.keys(DEFECT_LABELS) as DefectType[]).filter((d) => !likely.includes(d))];
  const clamp = (n: number) => Math.max(1, Math.min(max, n));
  const offerNcr = qty >= 5;

  return (
    <Modal
      open
      onClose={onClose}
      title={t("scrap.title")}
      width="max-w-3xl"
      footer={
        <>
          <BigButton size="md" tone="neutral" onClick={onClose}>
            {t("common.cancel")}
          </BigButton>
          <BigButton size="md" tone="danger" icon={<Trash2 className="size-5" />} disabled={!defect} onClick={() => defect && onConfirm(defect, qty, offerNcr && ncr)}>
            {t("scrap.confirm", { n: qty })}
          </BigButton>
        </>
      }
    >
      <h3 className="mb-2 text-sm font-semibold text-ink-2">{t("scrap.reason")}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        {ordered.map((d) => {
          const sel = defect === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDefect(d)}
              aria-pressed={sel}
              className={cn(
                "relative flex min-h-16 items-center justify-center rounded-xl border-2 px-2 py-2 text-center text-sm leading-tight font-semibold transition-transform active:scale-[0.97]",
                sel ? "border-critical bg-critical-soft text-critical-ink" : "border-line bg-surface text-ink hover:border-line-strong",
              )}
            >
              {sel && <Check className="absolute top-1.5 right-1.5 size-4" />}
              {likely.includes(d) && !sel && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-brand" title={t("scrap.likely")} />}
              {label("defect", d)}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-3">
        <span className="size-1.5 rounded-full bg-brand" /> {t("scrap.likelyHint")}
      </p>

      <h3 className="mt-5 mb-2 text-sm font-semibold text-ink-2">{t("scrap.qty")}</h3>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setQty((q) => clamp(q - 1))} disabled={qty <= 1} aria-label="−1" className="flex size-14 items-center justify-center rounded-xl border-2 border-line bg-surface text-ink active:scale-95 disabled:opacity-35">
            <Minus className="size-6" />
          </button>
          <span className="tabular w-24 text-center font-display text-4xl font-semibold text-ink">{qty}</span>
          <button type="button" onClick={() => setQty((q) => clamp(q + 1))} disabled={qty >= max} aria-label="+1" className="flex size-14 items-center justify-center rounded-xl border-2 border-line bg-surface text-ink active:scale-95 disabled:opacity-35">
            <Plus className="size-6" />
          </button>
        </div>
        <div className="flex gap-2">
          {[1, 2, 5, 10].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setQty(clamp(n))}
              disabled={n > max}
              className={cn("tabular h-14 min-w-14 rounded-xl border-2 px-3 text-lg font-semibold active:scale-95 disabled:opacity-35", qty === n ? "border-critical bg-critical-soft text-critical-ink" : "border-line bg-surface text-ink")}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="text-sm text-ink-3">{t("keypad.max", { max })}</span>
      </div>

      {offerNcr && (
        <button
          type="button"
          role="switch"
          aria-checked={ncr}
          onClick={() => setNcr((v) => !v)}
          className={cn("mt-5 flex w-full items-center gap-4 rounded-2xl border-2 px-4 py-3.5 text-left", ncr ? "border-warn bg-warn-soft" : "border-line bg-surface")}
        >
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg border-2", ncr ? "border-warn-ink bg-warn-ink text-surface" : "border-line-strong")}>{ncr && <Check className="size-5" />}</span>
          <FileWarning className={cn("size-6 shrink-0", ncr ? "text-warn-ink" : "text-ink-3")} />
          <span className="min-w-0">
            <span className={cn("block font-semibold", ncr ? "text-warn-ink" : "text-ink")}>{t("scrap.ncr")}</span>
            <span className="block text-sm text-ink-3">{t("scrap.ncrSub")}</span>
          </span>
        </button>
      )}
    </Modal>
  );
}

// ───────────────────────────── Complete ─────────────────────────────
export function CompleteDialog({ wo, op, onClose, onConfirm }: { wo: WorkOrder; op: WorkOrderOperation; onClose: () => void; onConfirm: () => void }) {
  const t = useT(messages);
  const label = useLabel();
  const fmt = useFmt();
  const now = useNow(1000);
  const rec = useRunLog((s) => s.log[op.id]);
  const elapsed = runMs(op, rec, now);
  const remaining = Math.max(0, wo.qty - op.qtyDone - op.qtyScrap);
  const idx = wo.operations.findIndex((o) => o.id === op.id);
  const next = wo.operations[idx + 1];

  return (
    <Modal
      open
      onClose={onClose}
      title={t("complete.title", { op: label("op", op.operation) })}
      width="max-w-xl"
      footer={
        <>
          <BigButton size="md" tone="neutral" onClick={onClose}>
            {t("common.cancel")}
          </BigButton>
          <BigButton size="md" tone="complete" icon={<CheckCheck className="size-5" />} onClick={onConfirm}>
            {t("complete.confirm")}
          </BigButton>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { k: t("cnt.good"), v: fmt.num(op.qtyDone), cls: "text-good-ink" },
          { k: t("cnt.scrap"), v: fmt.num(op.qtyScrap), cls: op.qtyScrap ? "text-critical-ink" : "text-ink" },
          { k: t("cnt.remaining"), v: fmt.num(remaining), cls: remaining ? "text-warn-ink" : "text-ink" },
          { k: t("cnt.elapsed"), v: hms(elapsed), cls: "text-ink" },
        ].map((x) => (
          <div key={x.k} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
            <div className="text-xs text-ink-3">{x.k}</div>
            <div className={cn("tabular mt-1 font-display text-2xl font-semibold", x.cls)}>{x.v}</div>
          </div>
        ))}
      </div>
      {remaining > 0 && (
        <div className="mt-4 flex gap-3 rounded-xl border-2 border-warn bg-warn-soft p-3 text-warn-ink">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm font-medium">{t("complete.short", { n: fmt.num(remaining), qty: fmt.num(wo.qty) })}</p>
        </div>
      )}
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm">
        <ArrowRight className="size-5 shrink-0 text-brand" />
        <span className="text-ink-2">
          {next ? t("complete.next", { seq: next.seq, op: label("op", next.operation), machine: next.machineId }) : t("complete.last", { wo: wo.id })}
        </span>
      </div>
    </Modal>
  );
}

// ───────────────────────────── Breakdown ─────────────────────────────
const BREAKDOWN_ICONS: Record<BreakdownKind, LucideIcon> = {
  electrical: Zap,
  hydraulic: Droplets,
  mechanical: Cog,
  welding_source: Flame,
  sensor: ScanEye,
  tooling: Hammer,
  supply: Fuel,
  plc: Cpu,
};

export function BreakdownDialog({ machineId, onClose, onConfirm }: { machineId: string; onClose: () => void; onConfirm: (kind: BreakdownKind) => void }) {
  const t = useT(messages);
  const tx = useTx();
  const [kind, setKind] = useState<BreakdownKind | null>(null);
  return (
    <Modal
      open
      onClose={onClose}
      title={t("breakdown.title", { id: machineId })}
      width="max-w-2xl"
      footer={
        <>
          <BigButton size="md" tone="neutral" onClick={onClose}>
            {t("common.cancel")}
          </BigButton>
          <BigButton size="md" tone="danger" icon={<AlertOctagon className="size-5" />} disabled={!kind} onClick={() => kind && onConfirm(kind)}>
            {t("breakdown.confirm")}
          </BigButton>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-2">{t("breakdown.body")}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(Object.keys(BREAKDOWN_REASONS) as BreakdownKind[]).map((k) => {
          const Icon = BREAKDOWN_ICONS[k];
          const sel = kind === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={sel}
              onClick={() => setKind(k)}
              className={cn(
                "flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border-2 px-2 py-3 text-center text-sm leading-tight font-semibold transition-transform active:scale-[0.97]",
                sel ? "border-critical bg-critical-soft text-critical-ink" : "border-line bg-surface text-ink hover:border-line-strong",
              )}
            >
              <Icon className={cn("size-7", sel ? "text-critical" : "text-ink-3")} />
              {tx(BREAKDOWN_REASONS[k].en, BREAKDOWN_REASONS[k].tr)}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ───────────────────────────── Start out of sequence ─────────────────────────────
export function StartAnywayDialog({ prev, onClose, onConfirm }: { prev: WorkOrderOperation; onClose: () => void; onConfirm: () => void }) {
  const t = useT(messages);
  const label = useLabel();
  return (
    <Modal
      open
      onClose={onClose}
      title={t("startAnyway.title")}
      width="max-w-lg"
      footer={
        <>
          <BigButton size="md" tone="neutral" onClick={onClose}>
            {t("common.cancel")}
          </BigButton>
          <BigButton size="md" tone="start" onClick={onConfirm}>
            {t("startAnyway.confirm")}
          </BigButton>
        </>
      }
    >
      <div className="flex gap-3 rounded-xl border-2 border-warn bg-warn-soft p-4 text-warn-ink">
        <AlertTriangle className="mt-0.5 size-6 shrink-0" />
        <div>
          <p className="font-semibold">{t("startAnyway.body", { seq: prev.seq, op: label("op", prev.operation), machine: prev.machineId, status: label("opStatus", prev.status) })}</p>
          <p className="mt-1 text-sm">{t("startAnyway.hint")}</p>
        </div>
      </div>
    </Modal>
  );
}
