"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck2, CheckCircle2, Clock, PackageX, Route } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { cn } from "@/lib/cn";
import { addDays, HOUR, localDateOf } from "@/lib/data/clock";
import { CATEGORY_LABELS } from "@/lib/data/labels";
import type { Priority, ProductCategory } from "@/lib/data/types";
import { useLookups, usePlantFilter } from "@/lib/hooks";
import { toast, useClock, useDb } from "@/lib/store";
import { Badge, Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { materialNeeds, scheduleRouting, woActions } from "./actions";
import { messages } from "./messages";

const PRIORITIES: Priority[] = ["urgent", "high", "normal", "low"];
const CATEGORIES = Object.keys(CATEGORY_LABELS) as ProductCategory[];

/** Typical lot size per family, used to prefill the quantity. */
const TYPICAL_LOT: Record<ProductCategory, number> = {
  muffler: 120,
  scr_muffler: 80,
  dpf: 50,
  manifold: 100,
  air_tank: 160,
  fuel_tank: 60,
  insulated_pipe: 150,
  generator_exhaust: 4,
  brake_valve: 120,
  nox_sensor: 150,
};

/** Mount only while open so every opening starts from a clean form. */
export function NewWorkOrderModal({ onClose }: { onClose: () => void }) {
  const t = useT(messages);
  const fmt = useFmt();
  const label = useLabel();
  const clock = useClock();
  const router = useRouter();
  const lk = useLookups();
  const plantFilter = usePlantFilter();
  const db = useDb((d) => d);

  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("100");
  const [priority, setPriority] = useState<Priority>("normal");
  const [due, setDue] = useState(() => addDays(clock.today, 7));
  const [notes, setNotes] = useState("");

  const groups = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        category: c,
        products: db.products.filter((p) => p.category === c && p.active && (plantFilter === "all" || p.plantId === plantFilter)).sort((a, b) => a.sku.localeCompare(b.sku)),
      })).filter((g) => g.products.length),
    [db.products, plantFilter],
  );

  const product = productId ? lk.product.get(productId) : undefined;
  const qtyN = Math.round(Number(qty));
  const qtyOk = Number.isFinite(qtyN) && qtyN > 0;
  const plant = product ? lk.plant.get(product.plantId) : undefined;

  const valid = !!product && qtyOk && !!due;

  const submit = () => {
    if (!valid || !product) return;
    const wo = woActions.create({ productId: product.id, qty: qtyN, priority, dueDate: due, notes: notes.trim() || undefined });
    toast({
      title: t("new.toast", { id: wo.id }),
      description: t("new.toastDesc", { n: wo.operations.length, plant: plant?.code ?? wo.plantId, date: fmt.dateTime(wo.plannedEnd) }),
      tone: "good",
    });
    onClose();
    router.push(`/work-orders/${wo.id}`);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t("new.title")}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={submit} disabled={!valid}>
            {t("new.create")}
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
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-3">{t("new.mts")}</p>
        <Field label={t("new.product")}>
          <Select
            value={productId}
            autoFocus
            onChange={(e) => {
              const p = lk.product.get(e.target.value);
              setProductId(e.target.value);
              if (p) setQty(String(TYPICAL_LOT[p.category]));
            }}
          >
            <option value="" disabled>
              {t("new.selectProduct")}
            </option>
            {groups.map((g) => (
              <optgroup key={g.category} label={label("category", g.category)}>
                {g.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} · {p.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("new.qty")} hint={!qtyOk ? t("new.invalidQty") : undefined}>
            <Input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              aria-invalid={!qtyOk}
              className={cn(!qtyOk && "border-critical focus:border-critical focus:ring-critical/20")}
            />
          </Field>
          <Field label={t("common.priority")}>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {label("priority", p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("new.due")}>
            <Input type="date" value={due} min={clock.today} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <Field label={t("new.notes")}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("new.notesPh")} className="min-h-16" />
        </Field>

        <SchedulePreview productId={productId} qty={qtyOk ? qtyN : 0} due={due} />
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

/**
 * Live preview of the order: routing booked on the least-loaded machines
 * (same scheduler the create action uses) and a BOM availability check.
 */
export function SchedulePreview({ productId, qty, due }: { productId: string; qty: number; due: string }) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const clock = useClock();
  const lk = useLookups();
  const db = useDb((d) => d);
  const product = productId ? lk.product.get(productId) : undefined;
  const plant = product ? lk.plant.get(product.plantId) : undefined;

  const { plan, needs } = useMemo(() => {
    const p = db.products.find((x) => x.id === productId);
    if (!p || qty <= 0) return { plan: [], needs: [] };
    return { plan: scheduleRouting(db, p, qty, clock.now + 2 * HOUR), needs: materialNeeds(db, p, qty) };
  }, [db, productId, qty, clock.now]);
  const shortNeeds = needs.filter((n) => n.short > 0);
  const finish = plan.length ? plan[plan.length - 1].plannedEnd : 0;
  const meetsDue = finish ? localDateOf(finish) <= due : true;
  const stdTotal = plan.reduce((s, p) => s + p.stdMinutes, 0);

  if (!product || !plant)
    return <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">{t("new.pickProduct")}</p>;

  return (
    <section className="rounded-xl border border-line">
      <div className="flex items-center gap-3 border-b border-line p-3">
        <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md bg-surface-3">
          <Image src={product.image} alt="" fill sizes="64px" className="object-cover" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">
            {product.sku} <span className="font-normal text-ink-2">· {product.name}</span>
          </div>
          <div className="truncate text-xs text-ink-3">
            {plant.code} · {tx(plant.name, plant.nameTr).split("·")[1]?.trim()} · {label("category", product.category)}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{t("new.preview")}</span>
          {qty > 0 &&
            (meetsDue ? (
              <Badge tone="good" icon={<CalendarCheck2 className="size-3.5" />}>
                {t("new.meetsDue")}
              </Badge>
            ) : (
              <Badge tone="critical" icon={<AlertTriangle className="size-3.5" />}>
                {t("new.missesDue")}
              </Badge>
            ))}
        </div>
        {qty > 0 && plan.length > 0 && (
          <>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-ink-3">{t("new.routing")}</dt>
                <dd className="mt-0.5 flex items-center gap-1 font-medium text-ink">
                  <Route className="size-3.5 text-ink-3" />
                  {t("new.ops", { n: plan.length })}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">{t("new.stdTime")}</dt>
                <dd className="mt-0.5 flex items-center gap-1 font-medium text-ink tabular">
                  <Clock className="size-3.5 text-ink-3" />
                  {fmt.duration(stdTotal)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">{t("new.start")}</dt>
                <dd className="mt-0.5 font-medium text-ink tabular">{fmt.dateTime(plan[0].plannedStart)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">{t("new.finish")}</dt>
                <dd className={meetsDue ? "mt-0.5 font-medium text-ink tabular" : "mt-0.5 font-medium text-critical-ink tabular"}>{fmt.dateTime(finish)}</dd>
              </div>
            </dl>
            <ol className="flex flex-wrap gap-1.5">
              {plan.map((p) => (
                <li key={p.seq} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-[11px] text-ink-2" title={`${fmt.dateTime(p.plannedStart)} → ${fmt.dateTime(p.plannedEnd)}`}>
                  <span className="text-ink-3 tabular">{p.seq}</span>
                  {label("op", p.operation)}
                  <span className="text-ink-3 tabular">· {p.machineId}</span>
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-ink-3">{t("new.previewHint", { plant: plant.code })}</p>
            <div className="border-t border-line pt-3">
              <div className="mb-1.5 text-xs font-medium text-ink-2">{t("new.materials")}</div>
              {shortNeeds.length === 0 ? (
                <p className="flex items-center gap-1.5 text-[13px] text-good-ink">
                  <CheckCircle2 className="size-4" />
                  {t("new.materialsOk", { n: needs.length })}
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  <p className="flex items-center gap-1.5 text-[13px] font-medium text-critical-ink">
                    <PackageX className="size-4" />
                    {t("new.materialsShort", { n: shortNeeds.length })}
                  </p>
                  {shortNeeds.map((n) => (
                    <div key={n.material.id} className="flex justify-between gap-3 pl-5.5 text-xs text-ink-2">
                      <span className="truncate">
                        {n.material.id} · {tx(n.material.name, n.material.nameTr)}
                      </span>
                      <span className="shrink-0 text-critical-ink tabular">
                        −{fmt.num(n.short, n.short < 10 ? 1 : 0)} {n.material.unit}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
