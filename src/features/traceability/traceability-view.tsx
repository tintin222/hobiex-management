"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Factory, Flame, GitBranch, History, Layers, ScanLine, SearchX, Siren, Truck, X } from "lucide-react";
import { useLabel, useT } from "@/i18n";
import type { WorkOrder } from "@/lib/data/types";
import { useByPlant } from "@/lib/hooks";
import { useDb } from "@/lib/store";
import { PageContainer } from "@/components/layout/app-shell";
import { Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { demoHeat, resolveQuery, serialOf } from "./genealogy";
import { GenealogyView } from "./genealogy-view";
import { messages } from "./messages";
import { RecallView } from "./recall-view";

type ChipKind = "serial" | "wo" | "lot" | "mlot" | "heat";

function ExampleChip({ kind, value, onClick }: { kind: ChipKind; value: string; onClick: () => void }) {
  const t = useT(messages);
  const Icon = kind === "heat" ? Flame : kind === "lot" || kind === "mlot" ? Layers : kind === "wo" ? Factory : ScanLine;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-xs transition-colors hover:border-line-strong hover:bg-surface-2"
    >
      <Icon className="size-3.5 text-ink-3" />
      <span className="text-ink-3">{t(`chip.${kind}`)}</span>
      <span className="tabular font-medium text-ink">{value}</span>
    </button>
  );
}

function Intro() {
  const t = useT(messages);
  const flow: [string, typeof Flame][] = [
    [t("flow.heat"), Flame],
    [t("flow.lot"), Layers],
    [t("flow.wo"), Factory],
    [t("flow.serial"), ScanLine],
    [t("flow.customer"), Truck],
  ];
  const tiles: [string, string, typeof Flame][] = [
    [t("intro.back.title"), t("intro.back.text"), GitBranch],
    [t("intro.fwd.title"), t("intro.fwd.text"), History],
    [t("intro.recall.title"), t("intro.recall.text"), Siren],
  ];
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col items-center px-6 pt-10 pb-8 text-center">
        <div className="rounded-full bg-brand-soft p-3 text-brand-soft-ink">
          <GitBranch className="size-6" />
        </div>
        <h2 className="mt-3 font-display text-xl font-semibold tracking-tight text-ink">{t("intro.title")}</h2>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-3">{t("intro.hint")}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {flow.map(([name, Icon], i) => (
            <span key={name} className="flex items-center gap-2">
              {i > 0 && <ArrowRight className="size-4 text-ink-3" />}
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 text-[13px] font-medium text-ink-2">
                <Icon className="size-4 text-ink-3" />
                {name}
              </span>
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-px border-t border-line bg-line md:grid-cols-3">
        {tiles.map(([title, text, Icon]) => (
          <div key={title} className="bg-surface p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Icon className="size-4 text-brand" />
              {title}
            </div>
            <p className="mt-1.5 text-[13px] text-ink-3">{text}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function TraceabilityView() {
  const t = useT(messages);
  const label = useLabel();
  const sp = useSearchParams();
  const urlQ = sp.get("q") ?? "";
  const [draft, setDraft] = useState(urlQ);
  const [seenQ, setSeenQ] = useState(urlQ);
  if (urlQ !== seenQ) {
    // the URL changed from outside (back/forward, a link): mirror it in the input
    setSeenQ(urlQ);
    setDraft(urlQ);
  }

  const db = useDb((d) => d);
  const workOrdersAll = useDb((d) => d.workOrders);
  const workOrders = useByPlant(workOrdersAll);
  const result = useMemo(() => resolveQuery(db, urlQ), [db, urlQ]);

  const examples = useMemo(() => {
    const soById = new Map(db.salesOrders.map((s) => [s.id, s]));
    const done = workOrders.filter((w) => w.status === "completed" && w.actualEnd && w.qtyDone > 0).sort((a, b) => (a.actualEnd! < b.actualEnd! ? 1 : -1));
    const picked: WorkOrder[] = [];
    const plants = new Set<string>();
    for (const w of done) {
      if (picked.length >= 2) break;
      if (!w.salesOrderId || !soById.get(w.salesOrderId)?.shipment || plants.has(w.plantId)) continue;
      picked.push(w);
      plants.add(w.plantId);
    }
    const extra = done.find((w) => !picked.includes(w));
    if (extra) picked.push(extra);
    const serials = picked.map((w) => serialOf(w, 1 + ((Number(w.id.slice(-3)) * 37) % w.qtyDone)));
    const wip = workOrders.filter((w) => w.status === "in_progress" && w.actualStart).sort((a, b) => (a.actualStart! < b.actualStart! ? 1 : -1))[0];
    return { serials, lot: wip?.lotNo ?? done[3]?.lotNo, heat: demoHeat(db)?.lot.heatNo };
  }, [db, workOrders]);

  const run = (q: string) => {
    const v = q.trim().toUpperCase();
    setDraft(v);
    setSeenQ(v);
    window.history.pushState(null, "", v ? `${window.location.pathname}?q=${encodeURIComponent(v)}` : window.location.pathname);
  };

  let content: React.ReactNode;
  if (!result) content = <Intro />;
  else if (result.kind === "serial") content = <GenealogyView key={result.serial} wo={result.wo} unit={result.unit} serial={result.serial} onTrace={run} />;
  else if (result.kind === "wo") content = <GenealogyView key={result.wo.id} wo={result.wo} onTrace={run} />;
  else if (result.kind === "lot") content = <RecallView key={result.query} hits={result.hits} by={result.by} query={result.query} onTrace={run} />;
  else if (result.kind === "invalidSerial") {
    const { wo } = result;
    content = (
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-full bg-warn-soft p-2 text-warn-ink">
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-ink">{t("invalid.title", { serial: result.serial })}</p>
            <p className="mt-1 text-sm text-ink-3">
              {result.reason === "not_completed"
                ? t("invalid.not_completed", { wo: wo.id, status: label("woStatus", wo.status) })
                : t("invalid.out_of_range", { wo: wo.id, n: wo.qtyDone, first: serialOf(wo, 1), last: serialOf(wo, Math.max(1, wo.qtyDone)) })}
            </p>
            <Button className="mt-3" icon={<GitBranch className="size-4" />} onClick={() => run(wo.id)}>
              {t("invalid.openWo")}
            </Button>
          </div>
        </div>
      </Card>
    );
  } else {
    content = (
      <Card>
        <EmptyState
          icon={<SearchX className="size-5" />}
          title={t("none.title", { q: result.query })}
          hint={t("none.hint")}
          action={
            result.suggestions.length > 0 && (
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs text-ink-3">{t("none.suggest")}</span>
                <div className="flex flex-wrap justify-center gap-2">
                  {result.suggestions.map((s) => (
                    <ExampleChip key={s.q} kind={s.kind} value={s.label} onClick={() => run(s.q)} />
                  ))}
                </div>
              </div>
            )
          }
        />
      </Card>
    );
  }

  return (
    <PageContainer>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <Card className="p-4 sm:p-5">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            run(draft);
          }}
          role="search"
        >
          <div className="relative flex-1">
            <ScanLine className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-3" />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("search.placeholder")}
              aria-label={t("search.placeholder")}
              autoComplete="off"
              spellCheck={false}
              className="tabular h-12 w-full rounded-xl border border-line bg-surface pr-10 pl-12 text-base text-ink placeholder:text-ink-3 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
            />
            {draft && (
              <button
                type="button"
                onClick={() => run("")}
                className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-1 text-ink-3 hover:bg-surface-3 hover:text-ink"
                aria-label={t("common.clear")}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <Button type="submit" variant="primary" size="lg" icon={<GitBranch className="size-5" />}>
            {t("search.button")}
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink-3">{t("search.try")}</span>
          {examples.serials.map((s) => (
            <ExampleChip key={s} kind="serial" value={s} onClick={() => run(s)} />
          ))}
          {examples.lot && <ExampleChip kind="lot" value={examples.lot} onClick={() => run(examples.lot!)} />}
          {examples.heat && <ExampleChip kind="heat" value={examples.heat} onClick={() => run(examples.heat!)} />}
        </div>
        <p className="mt-2 text-xs text-ink-3">{t("search.hint")}</p>
      </Card>

      <div className="mt-4">{content}</div>
    </PageContainer>
  );
}
