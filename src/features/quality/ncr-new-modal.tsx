"use client";

import { useMemo, useState } from "react";
import { FilePlus2, Info } from "lucide-react";
import { useFmt, useLabel, useT } from "@/i18n";
import { DEFECT_LABELS } from "@/lib/data/labels";
import type { DefectType, Ncr } from "@/lib/data/types";
import { useLookups, usePlantFilter } from "@/lib/hooks";
import { actions, toast, useDb } from "@/lib/store";
import { Button, Field, Input, Modal, Segmented, Select } from "@/components/ui";
import { messages } from "./messages";

export interface NcrPrefill {
  productId?: string;
  workOrderId?: string;
  title?: string;
  defectType?: DefectType;
  qty?: number;
  source?: Ncr["source"];
}

/** Mount only while open so the form starts fresh each time. */
export function NewNcrModal({ prefill, onClose, onCreated }: { prefill: NcrPrefill; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useT(messages);
  const fmt = useFmt();
  const label = useLabel();
  const lk = useLookups();
  const plantFilter = usePlantFilter();
  const productsAll = useDb((db) => db.products);
  const workOrdersAll = useDb((db) => db.workOrders);
  const employees = useDb((db) => db.employees);

  const [title, setTitle] = useState(prefill.title ?? "");
  const [defectType, setDefectType] = useState<DefectType>(prefill.defectType ?? "weld_porosity");
  const [severity, setSeverity] = useState<Ncr["severity"]>("major");
  const [productId, setProductId] = useState(prefill.productId ?? "");
  const [qty, setQty] = useState(String(prefill.qty ?? 1));
  const [source, setSource] = useState<Ncr["source"]>(prefill.source ?? "internal");
  const [woId, setWoId] = useState(prefill.workOrderId ?? "");
  const [ownerId, setOwnerId] = useState("");
  const [tried, setTried] = useState(false);

  const products = useMemo(
    () => productsAll.filter((p) => p.active && (plantFilter === "all" || p.plantId === plantFilter || p.id === prefill.productId)).sort((a, b) => a.sku.localeCompare(b.sku)),
    [productsAll, plantFilter, prefill.productId],
  );
  const product = productId ? lk.product.get(productId) : undefined;
  const wos = useMemo(
    () =>
      productId
        ? workOrdersAll
            .filter((w) => w.productId === productId && w.status !== "planned" && w.status !== "released")
            .sort((a, b) => ((b.actualStart ?? b.plannedStart) < (a.actualStart ?? a.plannedStart) ? -1 : 1))
            .slice(0, 40)
        : [],
    [workOrdersAll, productId],
  );
  const inspectors = useMemo(() => {
    const qc = employees.filter((e) => e.role === "qc_inspector");
    const local = product ? qc.filter((e) => e.plantId === product.plantId) : [];
    return local.length ? local : qc;
  }, [employees, product]);

  const wo = wos.some((w) => w.id === woId) ? woId : "";
  const owner = inspectors.some((e) => e.id === ownerId) ? ownerId : inspectors[0]?.id ?? "";
  const n = Math.round(Number(qty));
  const valid = title.trim().length > 0 && !!product && Number.isFinite(n) && n >= 1;

  const submit = () => {
    setTried(true);
    if (!valid || !product) {
      toast({ tone: "warn", title: t("n.required") });
      return;
    }
    const linked = wo ? lk.workOrder.get(wo) : undefined;
    const ncr = actions.createNcr({
      title: title.trim(),
      defectType,
      severity,
      productId: product.id,
      qtyAffected: n,
      source,
      ownerId: owner,
      plantId: product.plantId,
      workOrderId: linked?.id,
      customerId: source === "customer" ? linked?.customerId : undefined,
    });
    toast({ tone: "good", title: t("n.created", { id: ncr.id }), description: t("n.createdHint", { method: ncr.method, date: fmt.dateLong(ncr.targetDate) }) });
    onCreated(ncr.id);
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
          <Button variant="primary" icon={<FilePlus2 className="size-4" />} onClick={submit}>
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
        <Field label={t("n.titleField")} className="sm:col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("n.titlePh")} autoFocus aria-invalid={tried && !title.trim()} className={tried && !title.trim() ? "border-critical" : undefined} />
        </Field>
        <Field label={t("n.product")} className="sm:col-span-2">
          <Select value={productId} onChange={(e) => setProductId(e.target.value)} className={tried && !product ? "border-critical" : undefined}>
            <option value="">{t("n.selectProduct")}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} · {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("n.defect")}>
          <Select value={defectType} onChange={(e) => setDefectType(e.target.value as DefectType)}>
            {(Object.keys(DEFECT_LABELS) as DefectType[]).map((d) => (
              <option key={d} value={d}>
                {label("defect", d)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("n.qty")}>
          <Input type="number" min={1} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className={tried && !(n >= 1) ? "border-critical" : undefined} />
        </Field>
        <Field label={t("n.severity")} className="sm:col-span-2">
          <Segmented
            value={severity}
            onChange={setSeverity}
            size="md"
            options={(["minor", "major", "critical"] as const).map((s) => ({ value: s, label: t(`sevL.${s}`) }))}
          />
        </Field>
        <Field label={t("n.source")}>
          <Select value={source} onChange={(e) => setSource(e.target.value as Ncr["source"])}>
            {(["internal", "customer", "supplier"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`src.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("n.wo")}>
          <Select value={wo} onChange={(e) => setWoId(e.target.value)} disabled={!product}>
            <option value="">{t("n.woNone")}</option>
            {wos.map((w) => (
              <option key={w.id} value={w.id}>
                {w.id} · {w.lotNo}
                {w.customerId ? ` · ${lk.customer.get(w.customerId)?.name ?? ""}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("n.owner")} className="sm:col-span-2">
          <Select value={owner} onChange={(e) => setOwnerId(e.target.value)}>
            {inspectors.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {lk.plant.get(e.plantId)?.code}
              </option>
            ))}
          </Select>
        </Field>
        <p className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-3 sm:col-span-2">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {t("n.hint")}
        </p>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
