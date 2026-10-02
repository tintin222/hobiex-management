"use client";

import { useState } from "react";
import { ClipboardCheck, PackagePlus, ShoppingCart } from "lucide-react";
import { useFmt, useT } from "@/i18n";
import type { Material, PlantId, Priority } from "@/lib/data/types";
import { toast } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Button, Field, Input, KeyValue, Modal, PriorityBadge, Select } from "@/components/ui";
import { createPurchaseRequest, postCycleCount, receiveGoods, warehouseUserId } from "./actions";
import { messages } from "./messages";
import { useUnit } from "./stock";

const CERTS = ["EN 10204 3.1", "EN 10204 2.2", "CoC", "CoC + PPAP L3"];

function defaultCert(m: Material) {
  if (m.category === "sheet_metal" || m.category === "tube") return "EN 10204 3.1";
  if (m.category === "substrate" || m.category === "component") return "CoC + PPAP L3";
  return "CoC";
}

const num = (s: string) => Number(s.replace(",", "."));

export function ReceiveModal({ material, lotNo, poRef, onClose }: { material: Material; lotNo: string; poRef: string; onClose: () => void }) {
  const t = useT(messages);
  const fmt = useFmt();
  const unit = useUnit();
  const metallic = material.category === "sheet_metal" || material.category === "tube";
  const [qty, setQty] = useState(() => String(material.onOrder > 0 ? material.onOrder : Math.round(material.dailyUsage * material.leadTimeDays)));
  const [po, setPo] = useState(poRef);
  const [lot, setLot] = useState(lotNo);
  const [heat, setHeat] = useState("");
  const [cert, setCert] = useState(() => defaultCert(material));
  const q = num(qty);
  const valid = q > 0 && lot.trim() !== "" && po.trim() !== "";

  const submit = () => {
    if (!valid) return;
    receiveGoods({ materialId: material.id, qty: q, poRef: po.trim(), lotNo: lot.trim(), heatNo: heat.trim(), certificate: cert, userId: warehouseUserId() });
    toast({
      tone: "good",
      title: t("recv.toast", { code: material.code }),
      description: t("recv.toastDesc", { qty: `${fmt.num(q)} ${unit(material.unit)}`, lot: lot.trim(), po: po.trim() }),
    });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t("recv.title", { code: material.code })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={submit} disabled={!valid} icon={<PackagePlus className="size-4" />}>
            {t("recv.submit")}
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
        <Field label={t("recv.qty", { unit: unit(material.unit) })} hint={material.onOrder > 0 ? t("recv.hint", { qty: `${fmt.num(material.onOrder)} ${unit(material.unit)}` }) : undefined}>
          <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
        </Field>
        <Field label={t("recv.po")}>
          <Input value={po} onChange={(e) => setPo(e.target.value)} />
        </Field>
        <Field label={t("recv.lot")}>
          <Input value={lot} onChange={(e) => setLot(e.target.value)} />
        </Field>
        <Field label={t("recv.heat")}>
          <Input value={heat} onChange={(e) => setHeat(e.target.value)} placeholder={metallic ? "H123456" : ""} />
        </Field>
        <Field label={t("recv.cert")} className="sm:col-span-2">
          <Select value={cert} onChange={(e) => setCert(e.target.value)}>
            {CERTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function CountModal({ material, onClose }: { material: Material; onClose: () => void }) {
  const t = useT(messages);
  const fmt = useFmt();
  const unit = useUnit();
  const [counted, setCounted] = useState(() => String(material.onHand));
  const c = num(counted);
  const valid = counted.trim() !== "" && c >= 0;
  const delta = valid ? Math.round((c - material.onHand) * 100) / 100 : 0;

  const submit = () => {
    if (!valid) return;
    const posted = postCycleCount(material.id, c, warehouseUserId());
    if (posted === 0) toast({ tone: "info", title: t("count.noChange") });
    else
      toast({
        tone: posted > 0 ? "good" : "warn",
        title: t("count.toast", { code: material.code }),
        description: `${posted > 0 ? "+" : "−"}${fmt.num(Math.abs(posted), 1)} ${unit(material.unit)} · ${fmt.eur(posted * material.unitCostEur)}`,
      });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t("count.title", { code: material.code })}
      width="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={submit} disabled={!valid} icon={<ClipboardCheck className="size-4" />}>
            {t("count.submit")}
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
        <Field label={t("count.counted", { unit: unit(material.unit) })}>
          <Input inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus />
        </Field>
        <KeyValue
          cols={3}
          items={[
            { label: t("count.system"), value: `${fmt.num(material.onHand)} ${unit(material.unit)}` },
            {
              label: t("count.delta"),
              value: (
                <span className={cn("tabular", delta > 0 ? "text-good-ink" : delta < 0 ? "text-critical-ink" : "text-ink-3")}>
                  {delta > 0 ? "+" : delta < 0 ? "−" : "±"}
                  {fmt.num(Math.abs(delta), 1)}
                </span>
              ),
            },
            { label: t("count.value"), value: <span className="tabular">{fmt.eur(delta * material.unitCostEur)}</span> },
          ]}
        />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function PurchaseModal({
  material,
  plantId,
  priority,
  suggested,
  needBy,
  onClose,
  onCreated,
}: {
  material: Material;
  plantId: PlantId;
  priority: Priority;
  suggested: number;
  needBy: number;
  onClose: () => void;
  onCreated: (taskId: string) => void;
}) {
  const t = useT(messages);
  const fmt = useFmt();
  const unit = useUnit();
  const tEn = (k: string) => messages.en[k];
  const tTr = (k: string) => messages.tr[k];
  const [qty, setQty] = useState(() => String(suggested));
  const q = num(qty);
  const valid = q > 0;

  const submit = () => {
    if (!valid) return;
    const task = createPurchaseRequest({
      materialId: material.id,
      qty: q,
      unitLabel: { en: tEn(`unit.${material.unit}`), tr: tTr(`unit.${material.unit}`) },
      plantId,
      priority,
      needBy,
    });
    if (!task) return;
    toast({
      tone: "good",
      title: t("pr.toast", { id: task.id }),
      description: t("pr.toastDesc", { qty: `${fmt.num(q)} ${unit(material.unit)}`, supplier: material.supplier }),
    });
    onCreated(task.id);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t("pr.title", { code: material.code })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={submit} disabled={!valid} icon={<ShoppingCart className="size-4" />}>
            {t("pr.submit")}
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
        <Field label={t("pr.qty", { unit: unit(material.unit) })} hint={t("pr.suggest")}>
          <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
        </Field>
        <KeyValue
          items={[
            { label: t("pr.supplier"), value: material.supplier },
            { label: t("pr.needBy"), value: fmt.dateLong(needBy) },
            { label: t("pr.value"), value: <span className="tabular">{fmt.eur(valid ? q * material.unitCostEur : 0)}</span> },
            { label: t("pr.priority"), value: <PriorityBadge value={priority} compact /> },
          ]}
        />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
