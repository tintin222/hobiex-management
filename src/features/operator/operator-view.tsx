"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { LogOut, UserRoundCog } from "lucide-react";
import { useLabel, useLang, useLangStore, useT } from "@/i18n";
import { SHIFT_HOURS, shiftOfHour, TZ_OFFSET_MS } from "@/lib/data/clock";
import type { Employee, Machine, Plant } from "@/lib/data/types";
import { useLookups } from "@/lib/hooks";
import { actions, toast, useStore } from "@/lib/store";
import { Avatar, Segmented } from "@/components/ui";
import { JobScreen } from "./job-screen";
import { messages } from "./messages";
import { SignIn } from "./sign-in";
import { Stepper } from "./terminal-ui";
import { factoryTime, useNow } from "./use-now";
import { WorkstationSelect } from "./workstation-select";

export function OperatorView() {
  const t = useT(messages);
  const router = useRouter();
  const params = useSearchParams();
  const lk = useLookups();
  const operatorId = useStore((s) => s.operatorId);

  const operator = operatorId ? lk.employee.get(operatorId) : undefined;
  const machineParam = params.get("machine");
  const machine = machineParam ? lk.machine.get(machineParam) : undefined;
  const workstation = operator && machine && machine.plantId === operator.plantId ? machine : undefined;
  const plant = operator ? lk.plant.get(operator.plantId) : machine ? lk.plant.get(machine.plantId) : undefined;
  const step: 1 | 2 | 3 = !operator ? 1 : !workstation ? 2 : 3;

  // each step starts at the top of the terminal (the shell's <main> keeps its scroll offset)
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    topRef.current?.scrollIntoView({ block: "start" });
  }, [step, workstation?.id]);

  const setMachine = useCallback((id: string | null) => router.replace(id ? `/operator?machine=${encodeURIComponent(id)}` : "/operator", { scroll: false }), [router]);

  const switchOperator = () => {
    if (operator) toast({ title: t("toast.signedOut", { name: operator.name }), tone: "info" });
    actions.setOperator(null);
  };

  return (
    <div ref={topRef} className="flex min-h-full flex-col bg-bg">
      <TerminalHeader operator={operator} plant={plant} machine={workstation ?? (step === 1 ? machine : undefined)} onSwitch={switchOperator} />
      <div className="border-b border-line bg-surface/60 px-4 py-2.5 md:px-6">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3">
          <Stepper step={step} />
          <span className="hidden text-xs text-ink-3 md:inline">{t("paperless")}</span>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 md:px-6">
        {step === 1 && <SignIn key={machine?.plantId ?? "none"} machineHint={machine} />}
        {step === 2 && operator && <WorkstationSelect operator={operator} onSelect={setMachine} />}
        {step === 3 && operator && workstation && <JobScreen key={workstation.id} operator={operator} machine={workstation} onChangeMachine={() => setMachine(null)} />}
      </div>
    </div>
  );
}

function TerminalHeader({ operator, plant, machine, onSwitch }: { operator?: Employee; plant?: Plant; machine?: Machine; onSwitch: () => void }) {
  const t = useT(messages);
  const label = useLabel();
  const lang = useLang();
  const setLang = useLangStore((s) => s.setLang);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="flex min-h-[76px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Image src="/brand/logo.png" alt="Hobiex" width={130} height={26} className="h-[26px] w-auto dark:brightness-0 dark:invert" priority />
          <span className="h-9 w-px bg-line" aria-hidden />
          <div className="min-w-0">
            <div className="font-display text-lg leading-tight font-semibold text-ink">{t("title")}</div>
            <div className="truncate text-xs text-ink-3">
              {plant ? plant.code : t("subtitle")}
              {machine && (
                <>
                  {" · "}
                  <span className="font-medium text-ink-2">{machine.id}</span> {machine.name}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <HeaderClock />
          {operator && (
            <div className="flex h-12 items-center gap-2.5 rounded-xl border border-line bg-surface-2 pr-3 pl-1.5">
              <Avatar name={operator.name} hue={operator.avatarHue} size={36} />
              <div className="leading-tight">
                <div className="text-sm font-semibold text-ink">{operator.name}</div>
                <div className="text-xs text-ink-3">
                  <span className="tabular">{operator.id}</span> · {label("role", operator.role)}
                </div>
              </div>
            </div>
          )}
          {operator && (
            <button type="button" onClick={onSwitch} className="inline-flex h-12 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-2 active:scale-[0.97]">
              <UserRoundCog className="size-5" />
              <span className="hidden sm:inline">{t("switchOperator")}</span>
            </button>
          )}
          <Segmented
            value={lang}
            onChange={setLang}
            className="p-1 [&>button]:h-10 [&>button]:px-3.5 [&>button]:text-sm"
            options={[
              { value: "en", label: "EN" },
              { value: "tr", label: "TR" },
            ]}
          />
          <Link href="/" className="inline-flex h-12 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-ink-2 hover:bg-surface-3 hover:text-ink" title={t("exitHint")}>
            <LogOut className="size-5" />
            <span className="hidden sm:inline">{t("exit")}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

function HeaderClock() {
  const t = useT(messages);
  const now = useNow(1000);
  const hour = new Date(now + TZ_OFFSET_MS).getUTCHours();
  const shift = shiftOfHour(hour);
  const time = factoryTime(now);
  return (
    <div className="flex h-12 items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3" aria-live="off">
      <span className="pulse-dot size-2 rounded-full bg-good" aria-hidden />
      <span className="tabular font-display text-xl font-semibold text-ink">
        {time.slice(0, 5)}
        <span className="text-ink-3">{time.slice(5)}</span>
      </span>
      <span className="hidden flex-col text-[11px] leading-tight text-ink-3 sm:flex">
        <span className="font-semibold text-ink-2">{t("shift", { s: shift })}</span>
        <span className="tabular">{SHIFT_HOURS[shift]}</span>
      </span>
    </div>
  );
}
