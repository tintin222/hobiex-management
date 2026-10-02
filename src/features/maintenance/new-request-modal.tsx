"use client";

import { useMemo, useState } from "react";
import { Info, Wrench } from "lucide-react";
import { useFmt, useLabel, useLang, useT, useTx } from "@/i18n";
import { PRIORITY_LABELS } from "@/lib/data/labels";
import type { MaintenanceType, Priority } from "@/lib/data/types";
import { useLookups, usePlantFilter } from "@/lib/hooks";
import { toast, useClock, useDb } from "@/lib/store";
import { Button, Field, Input, Modal, Select } from "@/components/ui";
import { createWorkRequest } from "./actions";
import { AUTO_TITLE, effStatus, MAINT_TYPES } from "./lib";
import { messages } from "./messages";

export interface RequestPrefill {
  machineId?: string;
  type?: MaintenanceType;
  date?: string;
  priority?: Priority;
}

/** Mount only while open so the form starts fresh each time. */
export function NewRequestModal({
  prefill,
  onClose,
  onCreated,
  onOpenExisting,
}: {
  prefill: RequestPrefill;
  onClose: () => void;
  onCreated: (id: string) => void;
  onOpenExisting: (id: string) => void;
}) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const lang = useLang();
  const label = useLabel();
  const clock = useClock();
  const lk = useLookups();
  const plantFilter = usePlantFilter();
  const plants = useDb((db) => db.plants);
  const machinesAll = useDb((db) => db.machines);
  const employees = useDb((db) => db.employees);
  const orders = useDb((db) => db.maintenance);

  const [machineId, setMachineId] = useState(prefill.machineId ?? "");
  const [type, setType] = useState<MaintenanceType>(prefill.type ?? "corrective");
  const [priority, setPriority] = useState<Priority>(prefill.priority ?? (prefill.type === "preventive" ? "normal" : "high"));
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(prefill.date && prefill.date >= clock.today ? prefill.date : clock.today);
  const [techId, setTechId] = useState("");
  const [est, setEst] = useState("2");
  const [tried, setTried] = useState(false);

  const groups = useMemo(
    () =>
      plants
        .filter((p) => plantFilter === "all" || p.id === plantFilter || machinesAll.some((m) => m.id === prefill.machineId && m.plantId === p.id))
        .map((p) => ({ plant: p, machines: machinesAll.filter((m) => m.plantId === p.id) })),
    [plants, machinesAll, plantFilter, prefill.machineId],
  );
  const machine = machineId ? lk.machine.get(machineId) : undefined;
  const techs = useMemo(() => {
    const all = employees.filter((e) => e.role === "maintenance_tech");
    const local = machine ? all.filter((e) => e.plantId === machine.plantId) : [];
    return local.length ? local : all;
  }, [employees, machine]);
  const tech = techs.some((e) => e.id === techId) ? techId : techs[0]?.id ?? "";
  const existing = machine ? orders.find((mo) => mo.machineId === machine.id && mo.type === type && mo.status !== "completed") : undefined;

  const [autoEn, autoTr] = AUTO_TITLE[type];
  const autoTitle = machine ? `${lang === "tr" ? autoTr : autoEn} — ${machine.name}` : lang === "tr" ? autoTr : autoEn;

  const submit = () => {
    setTried(true);
    if (!machine) {
      toast({ tone: "warn", title: t("n.required") });
      return;
    }
    const custom = title.trim();
    const hours = Number(est);
    const mo = createWorkRequest({
      machineId: machine.id,
      type,
      priority,
      title: custom || `${autoEn} — ${machine.name}`,
      titleTr: custom || `${autoTr} — ${machine.id}`,
      technicianId: tech,
      plantId: machine.plantId,
      scheduledDate: date || clock.today,
      estHours: Number.isFinite(hours) && hours > 0 ? Math.round(hours * 10) / 10 : 2,
    });
    toast({
      tone: "good",
      title: t("n.created", { id: mo.id }),
      description: t("n.createdHint", { machine: machine.id, date: fmt.date(mo.scheduledDate), tech: lk.employee.get(tech)?.name ?? "" }),
    });
    onCreated(mo.id);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t("n.title")}
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" icon={<Wrench className="size-4" />} onClick={submit}>
            {t("n.create")}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label={t("n.machine")} className="sm:col-span-2">
          <Select value={machineId} onChange={(e) => setMachineId(e.target.value)} className={tried && !machine ? "border-critical" : undefined} autoFocus>
            <option value="">{t("n.selectMachine")}</option>
            {groups.map(({ plant, machines }) => (
              <optgroup key={plant.id} label={`${plant.code} · ${tx(plant.name, plant.nameTr).split("·")[1]?.trim() ?? ""}`}>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} · {m.name} · {m.line}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        {existing && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn-ink sm:col-span-2">
            <span className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0" />
              {t("n.existing", { id: existing.id, status: label("maintStatus", effStatus(existing, clock.today)), date: fmt.date(existing.scheduledDate) })}
            </span>
            <Button size="xs" variant="secondary" onClick={() => onOpenExisting(existing.id)}>
              {t("n.openExisting")}
            </Button>
          </div>
        )}
        <Field label={t("n.type")}>
          <Select value={type} onChange={(e) => setType(e.target.value as MaintenanceType)}>
            {MAINT_TYPES.map((x) => (
              <option key={x} value={x}>
                {label("maintType", x)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("n.priority")}>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
              <option key={p} value={p}>
                {label("priority", p)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("n.titleField")} className="sm:col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("n.titlePh", { auto: autoTitle })} />
        </Field>
        <Field label={t("n.date")}>
          <Input type="date" min={clock.today} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("n.est")}>
          <Input type="number" min={0.5} step={0.5} inputMode="decimal" value={est} onChange={(e) => setEst(e.target.value)} />
        </Field>
        <Field label={t("n.technician")} className="sm:col-span-2">
          <Select value={tech} onChange={(e) => setTechId(e.target.value)}>
            {techs.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {lk.plant.get(e.plantId)?.code}
              </option>
            ))}
          </Select>
        </Field>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
