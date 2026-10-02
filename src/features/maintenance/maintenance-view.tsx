"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Euro, HeartPulse, Plus, ShieldCheck, Timer, Wrench, Zap } from "lucide-react";
import { useFmt, useT, useTx } from "@/i18n";
import { addDays } from "@/lib/data/clock";
import type { MaintenanceStatus } from "@/lib/data/types";
import { useByPlant, useLookups, usePlantFilter } from "@/lib/hooks";
import { useClock, useDb } from "@/lib/store";
import { PageContainer } from "@/components/layout/app-shell";
import { Badge, Button, Card, KpiTile, PageHeader, Tabs } from "@/components/ui";
import { AssetsPanel, useAssetRows } from "./assets-panel";
import { CalendarPanel } from "./calendar-panel";
import { effStatus, MAINT_STATUSES, partsCost, setSearchParam } from "./lib";
import { messages } from "./messages";
import { MaintenanceDrawer } from "./mo-drawer";
import { NewRequestModal, type RequestPrefill } from "./new-request-modal";
import { OrdersPanel, type StatusFilter } from "./orders-panel";

type Tab = "orders" | "calendar" | "assets";

function parseStatus(v: string | null): StatusFilter {
  return v === "all" || v === "open" || MAINT_STATUSES.includes(v as MaintenanceStatus) ? (v as StatusFilter) : "open";
}

export function MaintenanceView() {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const clock = useClock();
  const lk = useLookups();
  const plantFilter = usePlantFilter();
  const sp = useSearchParams();
  const machinesAll = useDb((db) => db.machines);
  const ordersAll = useDb((db) => db.maintenance);
  const machines = useByPlant(machinesAll);
  const orders = useByPlant(ordersAll);

  const statusParam = sp.get("status");
  const moId = sp.get("mo");
  const [status, setStatus] = useState<StatusFilter>(() => parseStatus(statusParam));
  const [tab, setTab] = useState<Tab>(() => {
    const v = sp.get("view");
    return v === "calendar" || v === "assets" ? v : "orders";
  });
  const [seenStatus, setSeenStatus] = useState(statusParam);
  if (statusParam !== seenStatus) {
    // a link (e.g. a smart insight) changed ?status= while the page was open
    setSeenStatus(statusParam);
    if (statusParam) {
      setStatus(parseStatus(statusParam));
      setTab("orders");
    }
  }
  const [request, setRequest] = useState<RequestPrefill | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const showList = (s: StatusFilter) => {
    setStatus(s);
    setTab("orders");
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openMo = (id: string | null) => setSearchParam("mo", id);

  const k = useMemo(() => {
    const today = clock.today;
    const n = machines.length || 1;
    const mtbf = machines.reduce((s, m) => s + m.mtbfHours, 0) / n;
    const mttr = machines.reduce((s, m) => s + m.mttrHours, 0) / n;
    const from = addDays(today, -30);
    const duePm = orders.filter((mo) => mo.type === "preventive" && mo.scheduledDate > from && mo.scheduledDate <= today);
    const onTime = duePm.filter((mo) => mo.status === "completed" && (mo.completedDate ?? mo.scheduledDate) <= mo.scheduledDate).length;
    const corrective = orders.filter((mo) => mo.type === "corrective" && mo.status !== "completed");
    const overduePm = orders.filter((mo) => mo.type === "preventive" && effStatus(mo, today) === "overdue").length;
    const done30 = orders.filter((mo) => mo.status === "completed" && (mo.completedDate ?? mo.scheduledDate) > from);
    const cost = done30.reduce((s, mo) => s + mo.costEur, 0);
    const parts = done30.reduce((s, mo) => s + partsCost(mo), 0);
    const open = orders.filter((mo) => mo.status !== "completed").length;
    return {
      mtbf,
      mttr,
      compliance: duePm.length ? onTime / duePm.length : null,
      onTime,
      due: duePm.length,
      corrective: corrective.length,
      urgent: corrective.filter((mo) => mo.priority === "urgent").length,
      overduePm,
      cost,
      parts,
      labour: Math.max(0, cost - parts),
      open,
    };
  }, [machines, orders, clock.today]);

  const assetRows = useAssetRows(machines, ordersAll);
  const atRisk = assetRows.filter((r) => r.health.tone === "critical").length;
  const plant = plantFilter === "all" ? null : lk.plant.get(plantFilter);

  const schedulePm = (machineId: string) => {
    const m = lk.machine.get(machineId);
    const late = !!m && m.nextPm < clock.today;
    setRequest({ machineId, type: "preventive", date: m && !late ? m.nextPm : clock.today, priority: late ? "high" : "normal" });
  };

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", { plants: plant ? tx(plant.name, plant.nameTr) : t("allPlants") })}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setRequest({})}>
            {t("newRequest")}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiTile
          label={t("kpi.mtbf")}
          value={fmt.num(k.mtbf)}
          unit={t("kpi.hours")}
          icon={<Activity className="size-4" />}
          footer={<span className="text-ink-3">{t("kpi.fleet", { n: machines.length })}</span>}
        />
        <KpiTile label={t("kpi.mttr")} value={fmt.num(k.mttr, 1)} unit={t("kpi.hours")} icon={<Timer className="size-4" />} footer={<span className="text-ink-3">{t("kpi.fleet", { n: machines.length })}</span>} />
        <KpiTile
          label={t("kpi.compliance")}
          value={k.compliance === null ? "—" : fmt.pct(k.compliance)}
          icon={<ShieldCheck className="size-4" />}
          footer={<span className="text-ink-3">{t("kpi.complianceOf", { done: k.onTime, due: k.due })}</span>}
        />
        <KpiTile
          label={t("kpi.corrective")}
          value={fmt.num(k.corrective)}
          icon={<Zap className="size-4" />}
          onClick={() => showList("open")}
          footer={
            k.urgent > 0 ? (
              <Badge tone="critical" icon={<AlertTriangle className="size-3.5" />}>
                {t("kpi.urgent", { n: k.urgent })}
              </Badge>
            ) : (
              <Badge tone="good" icon={<CheckCircle2 className="size-3.5" />}>
                {t("kpi.noUrgent")}
              </Badge>
            )
          }
        />
        <KpiTile
          label={t("kpi.overdue")}
          value={fmt.num(k.overduePm)}
          icon={<Wrench className="size-4" />}
          onClick={() => showList("overdue")}
          footer={
            k.overduePm > 0 ? (
              <Badge tone="critical" icon={<AlertTriangle className="size-3.5" />}>
                {t("kpi.overdueShow")}
              </Badge>
            ) : (
              <Badge tone="good" icon={<CheckCircle2 className="size-3.5" />}>
                {t("kpi.allOnTime")}
              </Badge>
            )
          }
        />
        <KpiTile
          label={t("kpi.cost")}
          value={fmt.eur(k.cost)}
          icon={<Euro className="size-4" />}
          footer={<span className="text-ink-3">{t("kpi.costSplit", { parts: fmt.eurCompact(k.parts), labour: fmt.eurCompact(k.labour) })}</span>}
        />
      </div>

      <div ref={tabsRef} className="scroll-mt-4" aria-hidden />
      <Card className="mt-4">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          className="px-3"
          tabs={[
            { value: "orders", label: t("tab.orders"), count: k.open, icon: <ClipboardList className="size-4" /> },
            { value: "calendar", label: t("tab.calendar"), icon: <CalendarDays className="size-4" /> },
            { value: "assets", label: t("tab.assets"), count: atRisk || undefined, icon: <HeartPulse className="size-4" /> },
          ]}
        />
        {tab === "orders" && <OrdersPanel rows={orders} status={status} onStatus={setStatus} onOpen={openMo} />}
        {tab === "calendar" && <CalendarPanel rows={orders} onOpen={openMo} />}
        {tab === "assets" && <AssetsPanel rows={assetRows} onSchedule={schedulePm} />}
      </Card>

      <MaintenanceDrawer id={moId} onClose={() => openMo(null)} />
      {request && (
        <NewRequestModal
          prefill={request}
          onClose={() => setRequest(null)}
          onCreated={(id) => {
            setRequest(null);
            openMo(id);
          }}
          onOpenExisting={(id) => {
            setRequest(null);
            openMo(id);
          }}
        />
      )}
    </PageContainer>
  );
}
