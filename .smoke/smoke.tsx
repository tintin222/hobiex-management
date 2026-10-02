import "./react-global";
import { renderToString } from "react-dom/server";
import type { ReactNode } from "react";
import { SearchParamsContext, PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { initStore, getDb, useStore } from "@/lib/store";
import { useLangStore } from "@/i18n";
import { usePlantStore } from "@/lib/hooks";
import { QualityView } from "@/features/quality/quality-view";
import { NcrDetail } from "@/features/quality/ncr-drawer";
import { InspectionDetail } from "@/features/quality/inspections-panel";
import { SpcPanel } from "@/features/quality/spc-panel";
import { NcrPanel } from "@/features/quality/ncr-panel";
import { InspectionsPanel } from "@/features/quality/inspections-panel";
import { TraceabilityView } from "@/features/traceability/traceability-view";
import { MaintenanceView } from "@/features/maintenance/maintenance-view";
import { MoDetail } from "@/features/maintenance/mo-drawer";
import { CalendarPanel } from "@/features/maintenance/calendar-panel";
import { AssetsPanel, useAssetRows } from "@/features/maintenance/assets-panel";
import { OrdersPanel } from "@/features/maintenance/orders-panel";
import { demoHeat } from "@/features/traceability/genealogy";

// zustand serves getInitialState() as the server snapshot; mirror live state into it
type AnyStore = { getState: () => object; getInitialState: () => object };
const sync = () => {
  for (const store of [useStore, useLangStore, usePlantStore] as unknown as AnyStore[]) Object.assign(store.getInitialState(), store.getState());
};
initStore();
sync();
const db = getDb();

function wrap(el: ReactNode, qs = "", path = "/") {
  return (
    <PathnameContext.Provider value={path}>
      <SearchParamsContext.Provider value={new URLSearchParams(qs) as never}>{el}</SearchParamsContext.Provider>
    </PathnameContext.Provider>
  );
}

const keyRe = /(?<![\w/@.-])(?:kpi|pareto|fpy|tab|f|src|sevL|sev|disp|col|icol|age|8d|d|n|i|spc|search|chip|intro|flow|none|invalid|sum|st|mat|wo|op|q|del|mode|recall|bucket|lot|w|cal|health)\.[a-zA-Z0-9_.]+(?![\w-])/g;
const results: string[] = [];
function check(name: string, el: ReactNode, qs = "") {
  sync();
  try {
    const html = renderToString(wrap(el, qs));
    const text = html.replace(/<[^>]+>/g, " ");
    const raw = [...new Set(text.match(keyRe) ?? [])].filter((k) => !/^\d/.test(k));
    results.push(`${raw.length ? "WARN" : "ok  "} ${name} (${html.length} chars)${raw.length ? " raw keys: " + raw.slice(0, 12).join(", ") : ""}`);
  } catch (e) {
    results.push(`FAIL ${name}: ${(e as Error).stack?.split("\n").slice(0, 6).join("\n")}`);
  }
}

function AssetsHarness() {
  const rows = useAssetRows(db.machines, db.maintenance);
  return <AssetsPanel rows={rows} onSchedule={() => {}} />;
}

for (const lang of ["en", "tr"] as const) {
  useLangStore.setState({ lang });
  for (const plant of ["all", "P2"] as const) {
    usePlantStore.setState({ plant });
    const tag = `[${lang}/${plant}]`;
    check(`${tag} QualityView`, <QualityView />);
    check(`${tag} QualityView tab=insp`, <QualityView />, "tab=insp");
    check(`${tag} QualityView tab=spc`, <QualityView />, "tab=spc");
    check(`${tag} SpcPanel`, <SpcPanel inspections={db.inspections.filter((i) => plant === "all" || i.plantId === plant)} />);
    check(`${tag} TraceabilityView empty`, <TraceabilityView />);
    check(`${tag} MaintenanceView`, <MaintenanceView />);
    check(`${tag} MaintenanceView overdue`, <MaintenanceView />, "status=overdue");
    check(`${tag} MaintenanceView calendar`, <MaintenanceView />, "view=calendar");
    check(`${tag} MaintenanceView assets`, <MaintenanceView />, "view=assets");
  }
  usePlantStore.setState({ plant: "all" });
  const tag = `[${lang}]`;
  for (const n of db.ncrs.slice(0, 6)) check(`${tag} NcrDetail ${n.id} ${n.status}`, <NcrDetail ncr={n} onOpenInspection={() => {}} />);
  for (const i of [db.inspections.find((x) => x.type === "incoming")!, db.inspections.find((x) => x.result === "fail")!, db.inspections[0]]) check(`${tag} InspectionDetail ${i.id} ${i.type}`, <InspectionDetail insp={i} onOpenNcr={() => {}} />);
  for (const mo of [db.maintenance[0], db.maintenance.find((m) => m.status === "overdue")!, db.maintenance.find((m) => m.status === "waiting_parts")!, db.maintenance.find((m) => m.status === "completed")!]) check(`${tag} MoDetail ${mo.id} ${mo.status}`, <MoDetail mo={mo} />);
  check(`${tag} CalendarPanel`, <CalendarPanel rows={db.maintenance} onOpen={() => {}} />);
  check(`${tag} AssetsPanel`, <AssetsHarness />);
  check(`${tag} OrdersPanel`, <OrdersPanel rows={db.maintenance} status="open" onStatus={() => {}} onOpen={() => {}} />);
  check(`${tag} NcrPanel`, <NcrPanel rows={db.ncrs} defect="all" onDefect={() => {}} onOpen={() => {}} />);
  check(`${tag} InspectionsPanel`, <InspectionsPanel rows={db.inspections} onOpen={() => {}} />);

  // traceability queries
  const done = db.workOrders.filter((w) => w.status === "completed");
  const shipped = done.find((w) => w.salesOrderId && db.salesOrders.find((s) => s.id === w.salesOrderId)?.shipment)!;
  const mts = done.find((w) => !w.salesOrderId)!;
  const wip = db.workOrders.find((w) => w.status === "in_progress")!;
  const planned = db.workOrders.find((w) => w.status === "planned")!;
  const heat = demoHeat(db)!;
  const nonMetal = db.materials.find((m) => m.category === "substrate")!.lots[0];
  const queries = [
    `${shipped.lotNo}-0001`,
    `${mts.lotNo}-0002`,
    `${shipped.lotNo}-9999`,
    `${wip.lotNo}-0001`,
    wip.id,
    planned.lotNo,
    heat.lot.heatNo!,
    heat.lot.lotNo,
    nonMetal.lotNo,
    "2609",
    "nonsense",
    db.materials[0].lots[0].heatNo!,
  ];
  for (const q of queries) check(`${tag} Trace q=${q}`, <TraceabilityView />, `q=${encodeURIComponent(q)}`);
}
console.log(results.join("\n"));
console.log("store ready:", useStore.getState().ready);
