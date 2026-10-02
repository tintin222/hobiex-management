"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Factory, LogIn, MapPin, ScanLine, Users } from "lucide-react";
import { useLabel, useT, useTx } from "@/i18n";
import { SHIFT_HOURS, shiftOfHour } from "@/lib/data/clock";
import type { Employee, EmployeeRole, Machine, PlantId } from "@/lib/data/types";
import { actions, toast, useClock, useDb } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Avatar, EmptyState, Segmented } from "@/components/ui";
import { messages } from "./messages";
import { Banner, BigButton } from "./terminal-ui";

/** Roles that sign in at a workstation. */
const SIGN_IN_ROLES: EmployeeRole[] = ["operator", "welder", "team_lead", "qc_inspector", "warehouse"];

export function SignIn({ machineHint }: { machineHint?: Machine }) {
  const t = useT(messages);
  const tx = useTx();
  const label = useLabel();
  const clock = useClock();
  const employees = useDb((db) => db.employees);
  const plants = useDb((db) => db.plants);
  const machines = useDb((db) => db.machines);

  const [plantId, setPlantId] = useState<PlantId | null>(machineHint?.plantId ?? null);
  const [role, setRole] = useState<EmployeeRole | "all">("all");
  const [badge, setBadge] = useState("");
  const [error, setError] = useState<string | null>(null);
  const shift = shiftOfHour(clock.hour);

  const plantStats = useMemo(
    () =>
      plants.map((p) => {
        const ms = machines.filter((m) => m.plantId === p.id);
        return {
          plant: p,
          onShift: employees.filter((e) => e.plantId === p.id && e.status === "on_shift" && SIGN_IN_ROLES.includes(e.role)).length,
          running: ms.filter((m) => m.status === "running" || m.status === "setup").length,
          total: ms.length,
        };
      }),
    [plants, machines, employees],
  );

  const crew = useMemo(
    () =>
      plantId
        ? employees
            .filter((e) => e.plantId === plantId && e.status === "on_shift" && SIGN_IN_ROLES.includes(e.role))
            .sort((a, b) => SIGN_IN_ROLES.indexOf(a.role) - SIGN_IN_ROLES.indexOf(b.role) || a.name.localeCompare(b.name))
        : [],
    [employees, plantId],
  );
  const visible = role === "all" ? crew : crew.filter((e) => e.role === role);

  const machineOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of machines) if (m.operatorId) map.set(m.operatorId, m.id);
    return map;
  }, [machines]);

  const signIn = (e: Employee) => {
    actions.setOperator(e.id);
    toast({
      title: t("toast.welcome", { name: e.name.split(" ")[0] }),
      description: e.status === "on_shift" ? t("toast.welcomeDesc", { s: e.shift, hours: SHIFT_HOURS[e.shift] }) : t("toast.offRoster", { s: e.shift }),
      tone: e.status === "on_shift" ? "good" : "warn",
    });
  };

  const scan = (ev: FormEvent) => {
    ev.preventDefault();
    const id = badge.trim().toUpperCase();
    if (!id) return;
    const e = employees.find((x) => x.id.toUpperCase() === id);
    if (!e) return setError(t("scan.unknown", { id }));
    if (e.status === "leave" || e.status === "sick") return setError(t("scan.absent", { name: e.name }));
    setError(null);
    signIn(e);
  };

  const plant = plants.find((p) => p.id === plantId);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid items-end gap-5 xl:grid-cols-[1fr_440px]">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">{t("signin.title")}</h1>
          <p className="mt-1.5 text-lg text-ink-2">{t("signin.subtitle")}</p>
        </div>
        <form onSubmit={scan} className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <label htmlFor="badge" className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
            <ScanLine className="size-5 text-brand" />
            {t("scan.label")}
          </label>
          <div className="flex gap-2">
            <input
              id="badge"
              value={badge}
              onChange={(e) => {
                setBadge(e.target.value);
                setError(null);
              }}
              placeholder="E1043"
              autoComplete="off"
              spellCheck={false}
              className={cn(
                "tabular h-14 min-w-0 flex-1 rounded-xl border-2 bg-surface-2 px-4 font-display text-2xl tracking-wider text-ink uppercase placeholder:text-ink-3/60 focus:bg-surface focus:outline-none",
                error ? "border-critical" : "border-line focus:border-brand",
              )}
              aria-invalid={!!error}
              aria-describedby="badge-hint"
            />
            <BigButton type="submit" tone="complete" size="md" icon={<LogIn className="size-5" />} disabled={!badge.trim()}>
              {t("scan.submit")}
            </BigButton>
          </div>
          <p id="badge-hint" className={cn("mt-2 text-sm", error ? "font-medium text-critical-ink" : "text-ink-3")}>
            {error ?? t("scan.hint")}
          </p>
        </form>
      </div>

      {machineHint && (
        <Banner tone="brand" icon={<MapPin className="size-7" />} title={t("signin.machineHint", { id: machineHint.id })}>
          {machineHint.name} · {machineHint.model}
        </Banner>
      )}

      {!plant ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-ink-3 uppercase">{t("signin.choosePlant")}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plantStats.map(({ plant: p, onShift, running, total }) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlantId(p.id)}
                className="group flex min-h-48 flex-col rounded-2xl border-2 border-line bg-surface p-5 text-left shadow-sm transition-[transform,border-color] hover:border-brand active:scale-[0.99]"
              >
                <span className="flex items-center gap-2">
                  <span className="size-3 rounded-sm" style={{ background: `var(--series-${p.id.slice(1)})` }} />
                  <span className="text-sm font-semibold text-ink-3">{p.code}</span>
                </span>
                <span className="mt-2 font-display text-2xl leading-tight font-semibold text-ink">{tx(p.name, p.nameTr).split("·")[1]?.trim()}</span>
                <span className="mt-1 text-sm text-ink-3">{tx(p.focus, p.focusTr)}</span>
                <span className="mt-auto flex flex-wrap gap-x-5 gap-y-1 pt-5 text-sm text-ink-2">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-4 text-ink-3" />
                    <span className="tabular font-semibold text-ink">{onShift}</span> {t("plant.onShift")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Factory className="size-4 text-ink-3" />
                    <span className="tabular font-semibold text-ink">
                      {running}/{total}
                    </span>{" "}
                    {t("plant.running")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <BigButton tone="neutral" size="md" icon={<ArrowLeft className="size-5" />} onClick={() => setPlantId(null)}>
              {t("signin.changePlant")}
            </BigButton>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-sm" style={{ background: `var(--series-${plant.id.slice(1)})` }} />
                <span className="font-display text-xl font-semibold text-ink">{tx(plant.name, plant.nameTr)}</span>
              </div>
              <div className="text-sm text-ink-3">{t("signin.crewSubtitle", { s: shift, hours: SHIFT_HOURS[shift], n: crew.length })}</div>
            </div>
            <Segmented
              value={role}
              onChange={setRole}
              className="ml-auto max-w-full overflow-x-auto p-1 scroll-thin [&>button]:h-11 [&>button]:px-3.5 [&>button]:text-sm"
              options={[
                { value: "all" as const, label: t("signin.allRoles"), count: crew.length },
                ...SIGN_IN_ROLES.map((r) => ({ value: r, label: label("role", r), count: crew.filter((e) => e.role === r).length })).filter((o) => o.count > 0),
              ]}
            />
          </div>

          {visible.length === 0 ? (
            <div className="rounded-2xl border border-line bg-surface">
              <EmptyState icon={<Users className="size-5" />} title={t("signin.nobody")} hint={t("signin.nobodyHint")} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {visible.map((e) => {
                const mId = machineOf.get(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => signIn(e)}
                    className="flex min-h-48 flex-col items-center gap-2 rounded-2xl border-2 border-line bg-surface p-4 text-center shadow-sm transition-[transform,border-color] hover:border-brand active:scale-[0.97]"
                  >
                    <Avatar name={e.name} hue={e.avatarHue} size={68} />
                    <span className="mt-1 text-base leading-tight font-semibold text-ink">{e.name}</span>
                    <span className="text-sm text-ink-3">{label("role", e.role)}</span>
                    <span className="mt-auto flex flex-wrap items-center justify-center gap-1.5 text-xs">
                      <span className="tabular rounded-md bg-surface-3 px-1.5 py-0.5 font-medium text-ink-2">{e.id}</span>
                      {mId && <span className="tabular rounded-md bg-brand-soft px-1.5 py-0.5 font-medium text-brand-soft-ink">{mId}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
