"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertOctagon, CheckCircle2, FilePlus2, GitBranch, XCircle } from "lucide-react";
import { useFmt, useLabel, useLang, useT, useTx } from "@/i18n";
import { localDateOf } from "@/lib/data/clock";
import { INSPECTION_RESULT_LABELS, INSPECTION_TYPE_LABELS } from "@/lib/data/labels";
import type { Inspection, InspectionResult, InspectionType, Material, Measurement, PlantId } from "@/lib/data/types";
import { useLookups, usePlantFilter } from "@/lib/hooks";
import { useDb } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Badge, Button, DataTable, Drawer, IdLink, KeyValue, PersonChip, SearchInput, SectionTitle, Select, SeverityBadge, StatusBadge, type Column } from "@/components/ui";
import { decimalsOf, defectForMeasurement, inTolerance, lslOf, measurementName, uslOf } from "./lib";
import { messages } from "./messages";
import type { NcrPrefill } from "./ncr-new-modal";

export function InspectionsPanel({ rows, onOpen }: { rows: Inspection[]; onOpen: (id: string) => void }) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const lk = useLookups();
  const plantFilter = usePlantFilter();
  const plants = useDb((db) => db.plants);
  const [q, setQ] = useState("");
  const [type, setType] = useState<InspectionType | "all">("all");
  const [result, setResult] = useState<InspectionResult | "all">("all");
  const [plant, setPlant] = useState<PlantId | "all">("all");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((i) => {
      if (type !== "all" && i.type !== type) return false;
      if (result !== "all" && i.result !== result) return false;
      if (plantFilter === "all" && plant !== "all" && i.plantId !== plant) return false;
      if (!s) return true;
      const sku = i.productId ? lk.product.get(i.productId)?.sku ?? "" : "";
      const mat = i.materialId ? lk.material.get(i.materialId) : undefined;
      return [i.id, i.workOrderId ?? "", sku, i.materialId ?? "", mat?.name ?? "", mat?.nameTr ?? ""].some((v) => v.toLowerCase().includes(s));
    });
  }, [rows, q, type, result, plant, plantFilter, lk]);

  const columns = useMemo<Column<Inspection>[]>(
    () => [
      { key: "id", header: t("icol.id"), cell: (i) => <span className="tabular font-medium whitespace-nowrap text-brand">{i.id}</span>, sortValue: (i) => i.id },
      { key: "type", header: t("icol.type"), cell: (i) => <span className="whitespace-nowrap text-ink-2">{label("inspectionType", i.type)}</span>, sortValue: (i) => i.type },
      {
        key: "ref",
        header: t("icol.ref"),
        cell: (i) =>
          i.workOrderId ? (
            <IdLink href={`/work-orders/${i.workOrderId}`}>{i.workOrderId}</IdLink>
          ) : i.materialId ? (
            <IdLink href={`/inventory?material=${i.materialId}`}>{i.materialId}</IdLink>
          ) : (
            "—"
          ),
        hideBelow: "sm",
      },
      {
        key: "item",
        header: t("icol.item"),
        cell: (i) => {
          if (i.productId) return <span className="tabular whitespace-nowrap text-ink-2">{lk.product.get(i.productId)?.sku}</span>;
          const m = i.materialId ? lk.material.get(i.materialId) : undefined;
          return <span className="block max-w-56 truncate text-ink-2">{m ? tx(m.name, m.nameTr) : "—"}</span>;
        },
        hideBelow: "md",
      },
      { key: "inspector", header: t("icol.inspector"), cell: (i) => <PersonChip id={i.inspectorId} size={20} className="max-w-40" />, hideBelow: "lg" },
      { key: "time", header: t("icol.time"), cell: (i) => <span className="tabular whitespace-nowrap text-ink-2">{fmt.dateTime(i.at)}</span>, sortValue: (i) => i.at },
      { key: "sample", header: t("icol.sample"), cell: (i) => fmt.num(i.sampleSize), sortValue: (i) => i.sampleSize, align: "right", hideBelow: "md" },
      {
        key: "defects",
        header: t("icol.defects"),
        cell: (i) => <span className={cn(i.defectsFound > 0 ? "font-medium text-critical-ink" : "text-ink-3")}>{fmt.num(i.defectsFound)}</span>,
        sortValue: (i) => i.defectsFound,
        align: "right",
        hideBelow: "md",
      },
      { key: "result", header: t("icol.result"), cell: (i) => <StatusBadge kind="inspectionResult" value={i.result} />, sortValue: (i) => i.result },
    ],
    [t, tx, fmt, label, lk],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
        <SearchInput value={q} onChange={setQ} placeholder={t("f.searchInsp")} className="w-full sm:w-64" />
        <Select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="w-[calc(50%-4px)] sm:w-44" aria-label={t("icol.type")}>
          <option value="all">{t("f.allTypes")}</option>
          {(Object.keys(INSPECTION_TYPE_LABELS) as InspectionType[]).map((x) => (
            <option key={x} value={x}>
              {label("inspectionType", x)}
            </option>
          ))}
        </Select>
        <Select value={result} onChange={(e) => setResult(e.target.value as typeof result)} className="w-[calc(50%-4px)] sm:w-40" aria-label={t("icol.result")}>
          <option value="all">{t("f.allResults")}</option>
          {(Object.keys(INSPECTION_RESULT_LABELS) as InspectionResult[]).map((x) => (
            <option key={x} value={x}>
              {label("inspectionResult", x)}
            </option>
          ))}
        </Select>
        {plantFilter === "all" && (
          <Select value={plant} onChange={(e) => setPlant(e.target.value as typeof plant)} className="w-full sm:w-52" aria-label={t("d.plant")}>
            <option value="all">{t("f.allPlants")}</option>
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {tx(p.name, p.nameTr).split("·")[1]?.trim()}
              </option>
            ))}
          </Select>
        )}
        <span className="tabular ml-auto hidden text-xs text-ink-3 lg:inline">{fmt.num(filtered.length)}</span>
      </div>
      <DataTable rows={filtered} columns={columns} rowKey={(i) => i.id} onRowClick={(i) => onOpen(i.id)} initialSort={{ key: "time", dir: "desc" }} pageSize={15} dense />
    </div>
  );
}

/** LSL…USL band with nominal tick and the measured value marker. */
export function ToleranceBar({ m, className }: { m: Measurement; className?: string }) {
  const lsl = lslOf(m);
  const usl = uslOf(m);
  const span = usl - lsl;
  if (span <= 0) return <span className="text-xs text-ink-3">—</span>;
  const pad = span * 0.4;
  const lo = lsl - pad;
  const hi = usl + pad;
  const pos = (v: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * 100;
  const ok = inTolerance(m);
  return (
    <div className={cn("relative h-5 w-32", className)} role="img" aria-label={`${lsl} … ${usl} · ${m.value}`}>
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-3" />
      <div className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm border border-good/50 bg-good-soft" style={{ left: `${pos(lsl)}%`, width: `${pos(usl) - pos(lsl)}%` }} />
      <div className="absolute top-0.5 bottom-0.5 w-px bg-ink-3" style={{ left: `${pos(m.nominal)}%` }} />
      <div
        className={cn("absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface", ok ? "bg-ink" : "bg-critical")}
        style={{ left: `${pos(m.value)}%` }}
      />
    </div>
  );
}

export function MeasurementTable({ rows }: { rows: Measurement[] }) {
  const t = useT(messages);
  const fmt = useFmt();
  const lang = useLang();
  return (
    <div className="overflow-x-auto rounded-xl border border-line scroll-thin">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-3">
            <th className="px-3 py-2 font-medium">{t("i.char")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("i.nominal")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("i.tol")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("i.measured")}</th>
            <th className="hidden px-3 py-2 font-medium sm:table-cell">{t("i.band")}</th>
            <th className="px-3 py-2 font-medium">{t("common.result")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const dp = decimalsOf(m);
            const ok = inTolerance(m);
            return (
              <tr key={m.name} className="border-b border-line last:border-0">
                <td className="px-3 py-2">
                  <div className="text-ink">{measurementName(m.name, lang)}</div>
                  <div className="text-xs text-ink-3">{m.unit}</div>
                </td>
                <td className="tabular px-3 py-2 text-right text-ink-2">{fmt.num(m.nominal, dp)}</td>
                <td className="tabular px-3 py-2 text-right whitespace-nowrap text-ink-2">
                  −{fmt.num(m.tolMinus, dp)} / +{fmt.num(m.tolPlus, dp)}
                </td>
                <td className={cn("tabular px-3 py-2 text-right font-medium", ok ? "text-ink" : "text-critical-ink")}>{fmt.num(m.value, dp)}</td>
                <td className="hidden px-3 py-2 sm:table-cell">
                  <ToleranceBar m={m} />
                </td>
                <td className="px-3 py-2">
                  {ok ? (
                    <Badge tone="good" icon={<CheckCircle2 className="size-3.5" />}>
                      {t("i.ok")}
                    </Badge>
                  ) : (
                    <Badge tone="critical" icon={<XCircle className="size-3.5" />}>
                      {t("i.nok")}
                    </Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function lotOf(insp: Inspection, material: Material | undefined) {
  return material ? material.lots.find((l) => l.receivedAt === localDateOf(Date.parse(insp.at))) : undefined;
}

export function InspectionDrawer({
  id,
  onClose,
  onRaiseNcr,
  onOpenNcr,
}: {
  id: string | null;
  onClose: () => void;
  onRaiseNcr: (p: NcrPrefill) => void;
  onOpenNcr: (id: string) => void;
}) {
  const t = useT(messages);
  const fmt = useFmt();
  const lang = useLang();
  const label = useLabel();
  const lk = useLookups();
  const inspections = useDb((db) => db.inspections);
  const insp = id ? inspections.find((i) => i.id === id) : undefined;

  const product = insp?.productId ? lk.product.get(insp.productId) : undefined;
  const material = insp?.materialId ? lk.material.get(insp.materialId) : undefined;
  const lot = insp ? lotOf(insp, material) : undefined;

  const raise = () => {
    if (!insp || !product) return;
    const first = insp.measurements.find((m) => !inTolerance(m));
    onRaiseNcr({
      productId: product.id,
      workOrderId: insp.workOrderId,
      title: first ? t("i.ncrTitle", { name: measurementName(first.name, lang) }) : "",
      defectType: first ? defectForMeasurement(first.name) : "dimensional",
      qty: Math.max(1, insp.defectsFound),
      source: "internal",
    });
  };

  return (
    <Drawer
      open={!!insp}
      onClose={onClose}
      width="max-w-2xl"
      title={
        insp && (
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular">{insp.id}</span>
            <StatusBadge kind="inspectionResult" value={insp.result} />
          </span>
        )
      }
      subtitle={insp && `${label("inspectionType", insp.type)} · ${fmt.dateTime(insp.at)}`}
      footer={
        insp && (
          <>
            {(insp.workOrderId || lot) && (
              <Link
                href={`/traceability?q=${insp.workOrderId ?? lot?.heatNo ?? lot?.lotNo}`}
                className="mr-auto inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-ink-2 hover:bg-surface-3 hover:text-ink"
              >
                <GitBranch className="size-4" />
                <span className="hidden sm:inline">{t("d.trace")}</span>
              </Link>
            )}
            {insp.result !== "pass" && product && (
              <Button variant="primary" icon={<FilePlus2 className="size-4" />} onClick={raise}>
                {t("i.raiseNcr")}
              </Button>
            )}
          </>
        )
      }
    >
      {insp && <InspectionDetail insp={insp} onOpenNcr={onOpenNcr} />}
    </Drawer>
  );
}

export function InspectionDetail({ insp, onOpenNcr }: { insp: Inspection; onOpenNcr: (id: string) => void }) {
  const t = useT(messages);
  const tx = useTx();
  const fmt = useFmt();
  const label = useLabel();
  const lk = useLookups();
  const ncrsAll = useDb((db) => db.ncrs);
  const ncrs = insp.workOrderId ? ncrsAll.filter((n) => n.workOrderId === insp.workOrderId) : [];
  const product = insp.productId ? lk.product.get(insp.productId) : undefined;
  const material = insp.materialId ? lk.material.get(insp.materialId) : undefined;
  const lot = lotOf(insp, material);
  const failing = insp.measurements.filter((m) => !inTolerance(m));
  const plant = lk.plant.get(insp.plantId);

  return (
    <div className="flex flex-col gap-6 px-5 py-5">
      <KeyValue
        items={[
          { label: t("i.type"), value: label("inspectionType", insp.type) },
          { label: t("i.time"), value: <span className="tabular">{fmt.dateTime(insp.at)}</span> },
          insp.workOrderId
            ? { label: t("d.workOrder"), value: <IdLink href={`/work-orders/${insp.workOrderId}`}>{insp.workOrderId}</IdLink> }
            : { label: t("i.material"), value: material ? <IdLink href={`/inventory?material=${material.id}`}>{material.id}</IdLink> : "—" },
          product
            ? {
                label: t("d.product"),
                value: (
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <IdLink href={`/products/${product.id}`}>{product.sku}</IdLink>
                    <span className="truncate text-xs font-normal text-ink-3">{label("category", product.category)}</span>
                  </span>
                ),
              }
            : { label: t("i.material"), value: material ? tx(material.name, material.nameTr) : "—" },
          ...(lot ? [{ label: t("common.lot"), value: <span className="tabular">{lot.lotNo}{lot.heatNo ? ` · ${lot.heatNo}` : ""}</span> }] : []),
          { label: t("i.inspector"), value: <PersonChip id={insp.inspectorId} size={20} /> },
          { label: t("d.plant"), value: plant ? plant.code : insp.plantId },
          { label: t("i.sample"), value: <span className="tabular">{fmt.num(insp.sampleSize)}</span> },
          { label: t("i.defects"), value: <span className={cn("tabular", insp.defectsFound > 0 && "text-critical-ink")}>{fmt.num(insp.defectsFound)}</span> },
        ]}
      />

      <section>
        <SectionTitle>{t("i.measurements")}</SectionTitle>
        <div
          className={cn(
            "mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium",
            failing.length ? "bg-critical-soft text-critical-ink" : "bg-good-soft text-good-ink",
          )}
        >
          {failing.length ? <AlertOctagon className="size-4" /> : <CheckCircle2 className="size-4" />}
          {failing.length ? t("i.outOfTol", { n: failing.length, total: insp.measurements.length }) : t("i.allInTol", { total: insp.measurements.length })}
        </div>
        <MeasurementTable rows={insp.measurements} />
      </section>

      {insp.workOrderId && (
        <section>
          <SectionTitle>{t("i.relatedNcr")}</SectionTitle>
          {ncrs.length === 0 ? (
            <p className="text-[13px] text-ink-3">{t("i.noNcr")}</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {ncrs.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => onOpenNcr(n.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="tabular block text-sm font-medium text-brand">{n.id}</span>
                      <span className="block truncate text-xs text-ink-3">{tx(n.title, n.titleTr)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <SeverityBadge value={n.severity} />
                      <StatusBadge kind="ncrStatus" value={n.status} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
