"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { BadgeCheck, CalendarClock, Contact, Gauge, Grid3x3, ShieldAlert, Tablet, UserCheck, Users, UserX } from "lucide-react";
import { useFmt, useT, useTx } from "@/i18n";
import { SHIFT_HOURS, shiftOfHour } from "@/lib/data/clock";
import { useByPlant, usePlantFilter } from "@/lib/hooks";
import { useClock, useDb } from "@/lib/store";
import { PageContainer } from "@/components/layout/app-shell";
import { KpiTile, PageHeader, Tabs } from "@/components/ui";
import { Directory } from "./directory";
import { EmployeeDrawer } from "./employee-drawer";
import { messages } from "./messages";
import { Roster } from "./roster";
import { SkillsMatrix } from "./skills-matrix";
import { coverageByShift, DIRECT_ROLES, isAbsent, isCertifiedWelder, isRisk, plantOperations } from "./staffing";

type Tab = "directory" | "roster" | "skills";
const TABS: Tab[] = ["directory", "roster", "skills"];

export function WorkforceView() {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const clock = useClock();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const plantFilter = usePlantFilter();

  const employeesAll = useDb((db) => db.employees);
  const plantsAll = useDb((db) => db.plants);
  const machines = useDb((db) => db.machines);
  const products = useDb((db) => db.products);
  const employees = useByPlant(employeesAll);
  const plants = useMemo(() => plantsAll.filter((p) => plantFilter === "all" || p.id === plantFilter), [plantsAll, plantFilter]);

  const tabParam = params.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "directory";
  const selected = params.get("employee");
  const currentShift = shiftOfHour(clock.hour);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const k = useMemo(() => {
    const direct = employees.filter((e) => DIRECT_ROLES.includes(e.role)).length;
    const onShift = employees.filter((e) => e.status === "on_shift").length;
    const leave = employees.filter((e) => e.status === "leave").length;
    const sick = employees.filter((e) => e.status === "sick").length;
    const avgEff = employees.length ? employees.reduce((s, e) => s + e.efficiency, 0) / employees.length : 0;
    const aboveStd = employees.filter((e) => e.efficiency >= 1).length;
    const welders = employees.filter((e) => e.role === "welder");
    const certified = welders.filter(isCertifiedWelder).length;
    const robotCertified = welders.filter((e) => e.certifications.some((c) => c.startsWith("EN ISO 14732"))).length;
    let risks = 0;
    let opsTotal = 0;
    for (const p of plants) {
      const ops = plantOperations(products, p.id);
      const cov = coverageByShift(
        employees.filter((e) => e.plantId === p.id && DIRECT_ROLES.includes(e.role)),
        ops,
      );
      opsTotal += ops.length;
      risks += ops.filter((o) => isRisk(cov.get(o)!)).length;
    }
    return { direct, onShift, leave, sick, absent: employees.filter(isAbsent).length, avgEff, aboveStd, welders: welders.length, certified, robotCertified, risks, opsTotal };
  }, [employees, plants, products]);

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", { plants: plantFilter === "all" ? t("allPlants") : tx(plants[0]?.name ?? "", plants[0]?.nameTr) })}
        actions={
          <Link href="/operator" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-medium text-ink shadow-sm hover:bg-surface-2">
            <Tablet className="size-4" />
            {t("openTerminal")}
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label={t("kpi.employees")} value={fmt.num(employees.length)} icon={<Users className="size-4" />} footer={<span className="text-ink-3">{t("kpi.employeesFoot", { d: k.direct, i: employees.length - k.direct })}</span>} />
        <KpiTile
          label={t("kpi.onShift")}
          value={fmt.num(k.onShift)}
          icon={<UserCheck className="size-4" />}
          footer={<span className="text-ink-3">{t("kpi.onShiftFoot", { s: currentShift, hours: SHIFT_HOURS[currentShift] })}</span>}
          onClick={() => setParam("tab", "roster")}
        />
        <KpiTile label={t("kpi.absent")} value={fmt.num(k.absent)} icon={<UserX className="size-4" />} footer={<span className="text-ink-3">{t("kpi.absentFoot", { leave: k.leave, sick: k.sick })}</span>} />
        <KpiTile label={t("kpi.efficiency")} value={fmt.pct(k.avgEff, 1)} icon={<Gauge className="size-4" />} footer={<span className="text-ink-3">{t("kpi.efficiencyFoot", { n: k.aboveStd })}</span>} />
        <KpiTile label={t("kpi.welders")} value={`${k.certified}`} unit={`/ ${k.welders}`} icon={<BadgeCheck className="size-4" />} footer={<span className="text-ink-3">{t("kpi.weldersFoot", { n: k.robotCertified })}</span>} />
        <KpiTile
          label={t("kpi.risk")}
          value={fmt.num(k.risks)}
          unit={`/ ${k.opsTotal}`}
          icon={<ShieldAlert className="size-4" />}
          footer={<span className="text-ink-3">{t("kpi.riskFoot")}</span>}
          onClick={() => setParam("tab", "skills")}
        />
      </div>

      <Tabs
        className="mt-6 mb-4"
        value={tab}
        onChange={(v) => setParam("tab", v === "directory" ? null : v)}
        tabs={[
          { value: "directory", label: t("tab.directory"), icon: <Contact className="size-4" />, count: employees.length },
          { value: "roster", label: t("tab.roster"), icon: <CalendarClock className="size-4" /> },
          { value: "skills", label: t("tab.skills"), icon: <Grid3x3 className="size-4" />, count: k.risks || undefined },
        ]}
      />

      {tab === "directory" && <Directory employees={employees} onOpen={(id) => setParam("employee", id)} />}
      {tab === "roster" && <Roster employees={employees} plants={plants} machines={machines} currentShift={currentShift} onOpen={(id) => setParam("employee", id)} />}
      {tab === "skills" && <SkillsMatrix employees={employees} plants={plants} products={products} onOpen={(id) => setParam("employee", id)} />}

      <EmployeeDrawer id={selected} onClose={() => setParam("employee", null)} />
    </PageContainer>
  );
}
