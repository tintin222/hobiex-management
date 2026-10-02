"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { AlertOctagon, CheckCircle2, ClipboardCheck, Euro, FileWarning, Gauge, LineChart, ListChecks, MessageSquareWarning, Plus, ShieldAlert, Timer } from "lucide-react";
import { useFmt, useLabel, useT, useTx } from "@/i18n";
import { addDays, DAY, daysBetween, localDateOf } from "@/lib/data/clock";
import type { DefectType, Inspection } from "@/lib/data/types";
import { useByPlant, useLookups, usePlantFilter } from "@/lib/hooks";
import { useClock, useDb } from "@/lib/store";
import { PageContainer } from "@/components/layout/app-shell";
import { Badge, Button, Card, KpiTile, PageHeader, Tabs } from "@/components/ui";
import { InspectionDrawer, InspectionsPanel } from "./inspections-panel";
import { firstPassYield, setSearchParam } from "./lib";
import { messages } from "./messages";
import { NcrDrawer } from "./ncr-drawer";
import { NewNcrModal, type NcrPrefill } from "./ncr-new-modal";
import { NcrPanel, type NcrStatusFilter } from "./ncr-panel";
import { SeverityCount } from "./parts";
import { DefectParetoCard, FpyTrendCard, type FpyPoint, type ParetoRow } from "./quality-charts";
import { SpcPanel } from "./spc-panel";

type Tab = "ncr" | "insp" | "spc";

export function QualityView() {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const clock = useClock();
  const lk = useLookups();
  const plantFilter = usePlantFilter();
  const sp = useSearchParams();
  const ncrsAll = useDb((db) => db.ncrs);
  const inspectionsAll = useDb((db) => db.inspections);
  const ncrs = useByPlant(ncrsAll);
  const inspections = useByPlant(inspectionsAll);

  const ncrId = sp.get("ncr");
  const inspId = sp.get("insp");
  const [tab, setTab] = useState<Tab>(() => {
    const v = sp.get("tab");
    if (v === "spc" || v === "insp") return v;
    return sp.get("insp") ? "insp" : "ncr";
  });
  const [defect, setDefect] = useState<DefectType | "all">("all");
  const [ncrStatus, setNcrStatus] = useState<NcrStatusFilter>("not_closed");
  const [prefill, setPrefill] = useState<NcrPrefill | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const goTab = (next: Tab) => {
    setTab(next);
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openNcr = (id: string | null) => {
    setSearchParam("insp", null);
    setSearchParam("ncr", id);
  };
  const openInsp = (id: string | null) => {
    setSearchParam("ncr", null);
    setSearchParam("insp", id);
  };

  // ── KPIs ──
  const k = useMemo(() => {
    const { now, today } = clock;
    const byDay = new Map<string, Inspection[]>();
    for (const i of inspections) {
      const d = localDateOf(Date.parse(i.at));
      let list = byDay.get(d);
      if (!list) byDay.set(d, (list = []));
      list.push(i);
    }
    const between = (from: number, to: number) => inspections.filter((i) => {
      const ts = Date.parse(i.at);
      return ts > now - from * DAY && ts <= now - to * DAY;
    });
    const fpy7 = firstPassYield(between(7, 0));
    const fpyPrior = firstPassYield(between(14, 7));
    const trend: FpyPoint[] = Array.from({ length: 21 }, (_, i) => {
      const date = addDays(today, i - 20);
      const rows = (byDay.get(date) ?? []).filter((x) => x.type !== "incoming");
      return { date, label: fmt.date(date), fpy: firstPassYield(rows), n: rows.length };
    });
    const todayRows = byDay.get(today) ?? [];
    const open = ncrs.filter((n) => n.status !== "closed");
    const sev = { critical: 0, major: 0, minor: 0 };
    for (const n of open) sev[n.severity]++;
    const d30 = addDays(today, -30);
    const d60 = addDays(today, -60);
    const copq = ncrs.filter((n) => n.openedAt >= d30).reduce((s, n) => s + n.costEur, 0);
    const copqPrior = ncrs.filter((n) => n.openedAt >= d60 && n.openedAt < d30).reduce((s, n) => s + n.costEur, 0);
    const complaints = open.filter((n) => n.source === "customer");
    const closed = ncrs.filter((n) => n.status === "closed" && n.closedAt);
    const closure = closed.length ? closed.reduce((s, n) => s + daysBetween(n.openedAt, n.closedAt!), 0) / closed.length : null;
    return {
      fpy7,
      fpyDelta: fpy7 !== null && fpyPrior !== null ? fpy7 - fpyPrior : undefined,
      fpySpark: trend.slice(-14).map((p) => p.fpy ?? fpy7 ?? 0),
      trend,
      inspToday: todayRows.length,
      failedToday: todayRows.filter((i) => i.result === "fail").length,
      open: open.length,
      sev,
      copq,
      copqDelta: copqPrior ? (copq - copqPrior) / copqPrior : undefined,
      complaints: complaints.length,
      complaintsCritical: complaints.filter((n) => n.severity === "critical").length,
      closure,
      closedN: closed.length,
    };
  }, [inspections, ncrs, clock, fmt]);

  // ── Defect Pareto (90 days) ──
  const pareto = useMemo<ParetoRow[]>(() => {
    const since = addDays(clock.today, -90);
    const by = new Map<DefectType, number>();
    for (const n of ncrs) if (n.openedAt >= since) by.set(n.defectType, (by.get(n.defectType) ?? 0) + 1);
    const total = [...by.values()].reduce((a, b) => a + b, 0);
    const sorted = [...by.entries()].sort((a, b) => b[1] - a[1]);
    const rows: ParetoRow[] = [];
    let cum = 0;
    for (const [defect, count] of sorted) {
      const before = cum;
      cum += count;
      rows.push({ defect, name: label("defect", defect), count, cum: total ? cum / total : 0, vital: total ? before / total < 0.8 : false });
    }
    return rows;
  }, [ncrs, clock.today, label]);

  const plant = plantFilter === "all" ? null : lk.plant.get(plantFilter);

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", { plants: plant ? tx(plant.name, plant.nameTr) : t("allPlants") })}
        actions={
          <>
            <Button icon={<LineChart className="size-4" />} onClick={() => goTab("spc")}>
              {t("openSpc")}
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setPrefill({})}>
              {t("newNcr")}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiTile
          label={t("kpi.fpy")}
          value={k.fpy7 === null ? "—" : fmt.pct(k.fpy7, 1)}
          delta={k.fpyDelta}
          deltaLabel={t("kpi.vsPrior7")}
          trend={k.fpySpark}
          icon={<Gauge className="size-4" />}
        />
        <KpiTile
          label={t("kpi.inspToday")}
          value={fmt.num(k.inspToday)}
          icon={<ClipboardCheck className="size-4" />}
          onClick={() => goTab("insp")}
          footer={
            k.failedToday > 0 ? (
              <Badge tone="critical" icon={<AlertOctagon className="size-3.5" />}>
                {t("kpi.failedToday", { n: k.failedToday })}
              </Badge>
            ) : (
              <Badge tone="good" icon={<CheckCircle2 className="size-3.5" />}>
                {t("kpi.noneFailed")}
              </Badge>
            )
          }
        />
        <KpiTile
          label={t("kpi.openNcr")}
          value={fmt.num(k.open)}
          icon={<FileWarning className="size-4" />}
          onClick={() => {
            setNcrStatus("not_closed");
            goTab("ncr");
          }}
          footer={
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <SeverityCount severity="critical" n={k.sev.critical} />
              <SeverityCount severity="major" n={k.sev.major} />
              <SeverityCount severity="minor" n={k.sev.minor} />
            </span>
          }
        />
        <KpiTile label={t("kpi.copq")} value={fmt.eur(k.copq)} delta={k.copqDelta} upIsGood={false} deltaLabel={t("kpi.vsPrior30")} icon={<Euro className="size-4" />} />
        <KpiTile
          label={t("kpi.complaints")}
          value={fmt.num(k.complaints)}
          onClick={() => {
            setNcrStatus("not_closed");
            goTab("ncr");
          }}
          icon={<MessageSquareWarning className="size-4" />}
          footer={
            k.complaintsCritical > 0 ? (
              <Badge tone="critical" icon={<ShieldAlert className="size-3.5" />}>
                {t("kpi.complaintsCritical", { n: k.complaintsCritical })}
              </Badge>
            ) : (
              <Badge tone="good" icon={<CheckCircle2 className="size-3.5" />}>
                {t("kpi.complaintsOk")}
              </Badge>
            )
          }
        />
        <KpiTile
          label={t("kpi.closure")}
          value={k.closure === null ? "—" : fmt.num(k.closure, 1)}
          unit={t("kpi.days")}
          icon={<Timer className="size-4" />}
          footer={<span className="text-ink-3">{t("kpi.closedN", { n: k.closedN })}</span>}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <DefectParetoCard
          rows={pareto}
          active={defect}
          onPick={(d) => {
            setDefect((cur) => (cur === d ? "all" : d));
            setNcrStatus("all");
            goTab("ncr");
          }}
        />
        <FpyTrendCard data={k.trend} />
      </div>

      <div ref={tabsRef} className="scroll-mt-4" aria-hidden />
      <Card className="mt-4">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          className="px-3"
          tabs={[
            { value: "ncr", label: t("tab.ncr"), count: k.open, icon: <FileWarning className="size-4" /> },
            { value: "insp", label: t("tab.insp"), count: inspections.length, icon: <ListChecks className="size-4" /> },
            { value: "spc", label: t("tab.spc"), icon: <LineChart className="size-4" /> },
          ]}
        />
        {tab === "ncr" && <NcrPanel rows={ncrs} status={ncrStatus} onStatus={setNcrStatus} defect={defect} onDefect={setDefect} onOpen={openNcr} />}
        {tab === "insp" && <InspectionsPanel rows={inspections} onOpen={openInsp} />}
        {tab === "spc" && <SpcPanel inspections={inspections} />}
      </Card>

      <NcrDrawer id={ncrId} onClose={() => openNcr(null)} onOpenInspection={(id) => openInsp(id)} />
      <InspectionDrawer
        id={inspId}
        onClose={() => openInsp(null)}
        onRaiseNcr={(p) => {
          openInsp(null);
          setPrefill(p);
        }}
        onOpenNcr={(id) => openNcr(id)}
      />
      {prefill && (
        <NewNcrModal
          prefill={prefill}
          onClose={() => setPrefill(null)}
          onCreated={(id) => {
            setPrefill(null);
            setTab("ncr");
            openNcr(id);
          }}
        />
      )}
    </PageContainer>
  );
}
