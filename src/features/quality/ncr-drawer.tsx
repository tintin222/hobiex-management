"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, GitBranch, Save } from "lucide-react";
import { useFmt, useLabel, useLang, useT, useTx } from "@/i18n";
import { daysBetween } from "@/lib/data/clock";
import type { Ncr } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { actions, toast, useClock, useDb } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Badge, Button, Drawer, Field, IdLink, KeyValue, SectionTitle, Select, SeverityBadge, StatusBadge, Textarea } from "@/components/ui";
import { advanceNcr } from "./actions";
import { EIGHT_D, EIGHT_D_CODE, eightDIndex, nextNcrStatus, rootCauseText, stepForStatus } from "./lib";
import { messages } from "./messages";
import { SourceLabel } from "./parts";

const DISPOSITIONS: Ncr["disposition"][] = ["pending", "rework", "scrap", "use_as_is", "return_to_supplier"];

export function NcrDrawer({ id, onClose, onOpenInspection }: { id: string | null; onClose: () => void; onOpenInspection: (id: string) => void }) {
  const t = useT(messages);
  const tx = useTx();
  const ncrs = useDb((db) => db.ncrs);
  const ncr = id ? ncrs.find((n) => n.id === id) : undefined;

  const advance = () => {
    if (!ncr) return;
    if (ncr.status === "containment" && ncr.disposition === "pending") {
      toast({ tone: "warn", title: t("d.needDisposition"), description: t("d.needDispositionHint") });
      return;
    }
    if (ncr.status === "root_cause" && !ncr.rootCause?.trim()) {
      toast({ tone: "warn", title: t("d.needRootCause"), description: t("d.needRootCauseHint") });
      return;
    }
    const next = advanceNcr(ncr.id);
    if (next === "closed") toast({ tone: "good", title: t("d.closedToast", { id: ncr.id }), description: t("d.closedHint") });
    else if (next) {
      const step = stepForStatus(next);
      toast({ tone: "good", title: t("d.advanced", { id: ncr.id, code: EIGHT_D_CODE[step], step: t(`8d.${step}`) }) });
    }
  };

  const next = ncr ? nextNcrStatus(ncr.status) : null;
  const nextStep = next ? stepForStatus(next) : null;

  return (
    <Drawer
      open={!!ncr}
      onClose={onClose}
      width="max-w-2xl"
      title={
        ncr && (
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular">{ncr.id}</span>
            <SeverityBadge value={ncr.severity} />
            <StatusBadge kind="ncrStatus" value={ncr.status} />
          </span>
        )
      }
      subtitle={ncr && tx(ncr.title, ncr.titleTr)}
      footer={
        ncr && (
          <>
            {ncr.workOrderId && (
              <Link
                href={`/traceability?q=${ncr.workOrderId}`}
                className="mr-auto inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-2 hover:bg-surface-3 hover:text-ink"
              >
                <GitBranch className="size-4" />
                <span className="hidden sm:inline">{t("d.trace")}</span>
              </Link>
            )}
            {next && nextStep ? (
              <Button variant="primary" icon={next === "closed" ? <CheckCircle2 className="size-4" /> : <ArrowRight className="size-4" />} onClick={advance}>
                {next === "closed" ? t("d.closeNcr") : t("d.advance", { code: EIGHT_D_CODE[nextStep], step: t(`8d.${nextStep}`) })}
              </Button>
            ) : (
              <Badge tone="good" icon={<CheckCircle2 className="size-3.5" />}>
                {t("8d.done")}
              </Badge>
            )}
          </>
        )
      }
    >
      {ncr && <NcrDetail key={ncr.id} ncr={ncr} onOpenInspection={onOpenInspection} />}
    </Drawer>
  );
}

function EightDStepper({ ncr }: { ncr: Ncr }) {
  const t = useT(messages);
  const fmt = useFmt();
  const cur = eightDIndex(ncr.status);
  const curStep = EIGHT_D[Math.min(6, cur)];
  return (
    <div>
      <ol className="grid grid-cols-7">
        {EIGHT_D.map((s, i) => {
          const done = i < cur;
          const active = i === cur;
          return (
            <li key={s} className="relative flex flex-col items-center gap-1.5 text-center">
              {i > 0 && <span className={cn("absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2", i <= cur ? "bg-brand" : "bg-line")} aria-hidden />}
              <span
                className={cn(
                  "relative z-10 flex size-7 items-center justify-center rounded-full text-[11px] font-semibold",
                  done && "bg-brand text-brand-ink",
                  active && "bg-brand-soft text-brand-soft-ink ring-2 ring-brand",
                  !done && !active && "border border-line bg-surface-2 text-ink-3",
                )}
              >
                {done ? <Check className="size-3.5" /> : EIGHT_D_CODE[s].replace("–", "")}
              </span>
              <span className={cn("hidden px-0.5 text-[11px] leading-tight sm:block", active ? "font-medium text-ink" : done ? "text-ink-2" : "text-ink-3")}>{t(`8d.${s}`)}</span>
              <span className={cn("text-[10px] font-semibold sm:hidden", active ? "text-ink" : "text-ink-3")}>{EIGHT_D_CODE[s]}</span>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px]">
        {ncr.status === "closed" ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-good-ink">
            <CheckCircle2 className="size-4" />
            {ncr.closedAt ? t("d.closedOn", { date: fmt.dateLong(ncr.closedAt), n: daysBetween(ncr.openedAt, ncr.closedAt) }) : t("8d.done")}
          </span>
        ) : (
          <span className="font-medium text-ink">{t("8d.current", { code: EIGHT_D_CODE[curStep], step: t(`8d.${curStep}`) })}</span>
        )}
        <Badge tone="neutral">
          {t("d.method")}: {ncr.method}
        </Badge>
      </div>
    </div>
  );
}

export function NcrDetail({ ncr, onOpenInspection }: { ncr: Ncr; onOpenInspection: (id: string) => void }) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const lang = useLang();
  const label = useLabel();
  const clock = useClock();
  const lk = useLookups();
  const employees = useDb((db) => db.employees);
  const inspectionsAll = useDb((db) => db.inspections);
  const [draft, setDraft] = useState(() => rootCauseText(ncr.rootCause, lang));

  const product = lk.product.get(ncr.productId);
  const customer = ncr.customerId ? lk.customer.get(ncr.customerId) : undefined;
  const plant = lk.plant.get(ncr.plantId);
  const overdue = ncr.status !== "closed" && ncr.targetDate < clock.today;

  const inspectors = useMemo(
    () =>
      employees
        .filter((e) => e.role === "qc_inspector")
        .sort((a, b) => (a.plantId === ncr.plantId ? 0 : 1) - (b.plantId === ncr.plantId ? 0 : 1) || a.name.localeCompare(b.name)),
    [employees, ncr.plantId],
  );
  const related = useMemo(() => (ncr.workOrderId ? inspectionsAll.filter((i) => i.workOrderId === ncr.workOrderId) : []), [inspectionsAll, ncr.workOrderId]);

  const savedText = rootCauseText(ncr.rootCause, lang);
  const dirty = draft.trim() !== savedText.trim();

  return (
    <div className="flex flex-col gap-6 px-5 py-5">
      <section>
        <SectionTitle>{t("8d.progress")}</SectionTitle>
        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <EightDStepper ncr={ncr} />
        </div>
      </section>

      <section>
        <SectionTitle>{t("d.workflow")}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("d.disposition")}>
            <Select
              value={ncr.disposition}
              onChange={(e) => {
                const d = e.target.value as Ncr["disposition"];
                actions.updateNcr(ncr.id, { disposition: d });
                toast({ tone: "good", title: t("d.dispSaved", { d: t(`disp.${d}`) }) });
              }}
            >
              {DISPOSITIONS.map((d) => (
                <option key={d} value={d}>
                  {t(`disp.${d}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("d.owner")}>
            <Select
              value={ncr.ownerId}
              onChange={(e) => {
                const id = e.target.value;
                actions.updateNcr(ncr.id, { ownerId: id });
                toast({ tone: "good", title: t("d.ownerSaved", { name: lk.employee.get(id)?.name ?? id }) });
              }}
            >
              {inspectors.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {lk.plant.get(e.plantId)?.code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("d.rootCause")} className="sm:col-span-2">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("d.rootCausePh")} rows={3} />
          </Field>
        </div>
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            icon={<Save className="size-3.5" />}
            disabled={!dirty || !draft.trim()}
            onClick={() => {
              actions.updateNcr(ncr.id, { rootCause: draft.trim() });
              toast({ tone: "good", title: t("d.rootSaved"), description: ncr.id });
            }}
          >
            {t("d.saveRootCause")}
          </Button>
        </div>
      </section>

      <section>
        <SectionTitle>{t("d.details")}</SectionTitle>
        <KeyValue
          items={[
            {
              label: t("d.product"),
              value: product ? (
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <IdLink href={`/products/${product.id}`}>{product.sku}</IdLink>
                  <span className="truncate text-xs font-normal text-ink-3">{product.name}</span>
                </span>
              ) : (
                t("d.none")
              ),
            },
            { label: t("d.workOrder"), value: ncr.workOrderId ? <IdLink href={`/work-orders/${ncr.workOrderId}`}>{ncr.workOrderId}</IdLink> : t("d.none") },
            { label: t("d.customer"), value: customer ? `${customer.name} · ${tx(customer.country, customer.countryTr)}` : t("d.none") },
            { label: t("d.source"), value: <SourceLabel source={ncr.source} /> },
            { label: t("d.defect"), value: label("defect", ncr.defectType) },
            { label: t("d.qtyAffected"), value: <span className="tabular">{fmt.num(ncr.qtyAffected)}</span> },
            { label: t("d.opened"), value: <span className="tabular">{fmt.dateLong(ncr.openedAt)}</span> },
            {
              label: t("d.target"),
              value: overdue ? (
                <span className="inline-flex items-center gap-1 text-critical-ink">
                  <AlertTriangle className="size-3.5" />
                  <span className="tabular">{fmt.dateLong(ncr.targetDate)}</span>
                  <span className="text-xs">· {t("d.overdue")}</span>
                </span>
              ) : (
                <span className="tabular">{fmt.dateLong(ncr.targetDate)}</span>
              ),
            },
            { label: t("d.plant"), value: plant ? `${plant.code} · ${tx(plant.name, plant.nameTr).split("·")[1]?.trim() ?? ""}` : ncr.plantId },
            { label: t("d.cost"), value: <span className="tabular">{fmt.eur(ncr.costEur)}</span> },
          ]}
        />
      </section>

      {ncr.workOrderId && (
        <section>
          <SectionTitle>{t("d.relatedInsp")}</SectionTitle>
          {related.length === 0 ? (
            <p className="text-[13px] text-ink-3">{t("d.noInsp")}</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {related.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => onOpenInspection(i.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="tabular block text-sm font-medium text-brand">{i.id}</span>
                      <span className="block truncate text-xs text-ink-3">
                        {label("inspectionType", i.type)} · {fmt.dateTime(i.at)}
                      </span>
                    </span>
                    <StatusBadge kind="inspectionResult" value={i.result} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
