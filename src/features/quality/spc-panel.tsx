"use client";

import { useMemo, useState } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2, LineChart as LineChartIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type DotItemDotProps } from "recharts";
import { useFmt, useLabel, useLang, useT } from "@/i18n";
import { CATEGORY_LABELS } from "@/lib/data/labels";
import type { Inspection, ProductCategory } from "@/lib/data/types";
import { useLookups, usePlantFilter } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { Badge, EmptyState, IdLink, Segmented, SectionTitle, Select } from "@/components/ui";
import { axisProps, barRadius, ChartLegend, cursorProps, gridProps, lineCursor, SERIES, STATUS_COLOR, yAxisProps } from "@/components/charts/theme";
import { capabilityTone, decimalsOf, measurementName, spcSignals, spcStats, type SpcRule } from "./lib";
import { messages } from "./messages";
import { TooltipCard } from "./parts";

interface Sample {
  at: string;
  value: number;
  inspId: string;
  woId?: string;
  sku: string;
  nominal: number;
  tolMinus: number;
  tolPlus: number;
  unit: string;
}

interface Point extends Sample {
  idx: number;
  flags: SpcRule[];
}

type Win = "50" | "100" | "all";

const MEAN_COLOR = "var(--chart-muted)";
const CL_COLOR = SERIES[1];
const SPEC_COLOR = SERIES[2];
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as ProductCategory[];

export function SpcPanel({ inspections }: { inspections: Inspection[] }) {
  const t = useT(messages);
  const fmt = useFmt();
  const lang = useLang();
  const label = useLabel();
  const lk = useLookups();
  const plantFilter = usePlantFilter();
  const [catSel, setCatSel] = useState<ProductCategory | "">("");
  const [nameSel, setNameSel] = useState("");
  const [win, setWin] = useState<Win>("100");

  // category → characteristic → samples in time order
  const index = useMemo(() => {
    const map = new Map<ProductCategory, Map<string, Sample[]>>();
    for (const i of inspections) {
      if (i.type === "incoming" || !i.productId) continue;
      const p = lk.product.get(i.productId);
      if (!p) continue;
      let byName = map.get(p.category);
      if (!byName) map.set(p.category, (byName = new Map()));
      for (const m of i.measurements) {
        if (m.tolMinus + m.tolPlus <= 0) continue;
        let list = byName.get(m.name);
        if (!list) byName.set(m.name, (list = []));
        list.push({ at: i.at, value: m.value, inspId: i.id, woId: i.workOrderId, sku: p.sku, nominal: m.nominal, tolMinus: m.tolMinus, tolPlus: m.tolPlus, unit: m.unit });
      }
    }
    for (const byName of map.values()) for (const list of byName.values()) list.sort((a, b) => (a.at < b.at ? -1 : 1));
    return map;
  }, [inspections, lk]);

  const sel = useMemo(() => {
    const cats = CATEGORY_ORDER.filter((c) => index.has(c));
    const category = catSel && index.has(catSel) ? catSel : index.has("muffler") ? "muffler" : cats[0];
    const byName = category ? index.get(category) : undefined;
    const names = byName ? [...byName.keys()] : [];
    const name = names.includes(nameSel) ? nameSel : names[0];
    const all = (name ? byName?.get(name) : undefined) ?? [];
    const units = new Map(names.map((n) => [n, byName!.get(n)![0].unit] as const));
    return { cats, category, names, name, all, units };
  }, [index, catSel, nameSel]);
  const { cats, category, names, name, all, units } = sel;

  const model = useMemo(() => {
    const samples = win === "all" ? sel.all : sel.all.slice(-Number(win));
    if (samples.length < 5) return null;
    const ref = samples[0];
    const lsl = ref.nominal - ref.tolMinus;
    const usl = ref.nominal + ref.tolPlus;
    const values = samples.map((s) => s.value);
    const stats = spcStats(values, lsl, usl);
    const flags = spcSignals(values, stats, lsl, usl);
    const points: Point[] = samples.map((s, i) => ({ ...s, idx: i + 1, flags: flags[i] }));
    const lo = Math.min(lsl, stats.lcl, ...values);
    const hi = Math.max(usl, stats.ucl, ...values);
    const pad = (hi - lo) * 0.08 || 1;
    const dp = decimalsOf({ nominal: ref.nominal, tolMinus: ref.tolMinus, tolPlus: ref.tolPlus });
    const oos = values.filter((v) => v < lsl - 1e-9 || v > usl + 1e-9).length;
    // histogram
    const binsN = 12;
    const hLo = Math.min(lsl, ...values);
    const hHi = Math.max(usl, ...values);
    const w = (hHi - hLo) / binsN || 1;
    const bins = Array.from({ length: binsN }, (_, i) => ({ from: hLo + i * w, to: hLo + (i + 1) * w, mid: hLo + (i + 0.5) * w, count: 0 }));
    for (const v of values) bins[Math.min(binsN - 1, Math.max(0, Math.floor((v - hLo) / w)))].count++;
    return { points, stats, lsl, usl, nominal: ref.nominal, unit: ref.unit, domain: [lo - pad, hi + pad] as [number, number], dp: Math.max(dp, 1), oos, bins, hDomain: [hLo - w, hHi + w] as [number, number] };
  }, [sel, win]);

  const signals = useMemo(() => (model ? model.points.filter((p) => p.flags.length > 0).reverse() : []), [model]);
  const plantName = plantFilter === "all" ? t("spc.allPlants") : lk.plant.get(plantFilter)?.code ?? plantFilter;

  const ruleLabel = (r: SpcRule) => t(`spc.rule.${r}`);
  const tone = capabilityTone(model?.stats.cpk ?? null);
  const ToneIcon = tone === "good" ? CheckCircle2 : tone === "warn" ? AlertTriangle : AlertOctagon;
  const num = (v: number | null, dp: number) => (v === null || !Number.isFinite(v) ? "—" : fmt.num(v, dp));

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-full flex-col gap-1 sm:w-56">
          <span className="text-xs font-medium text-ink-2">{t("spc.family")}</span>
          <Select value={category ?? ""} onChange={(e) => setCatSel(e.target.value as ProductCategory)}>
            {cats.map((c) => (
              <option key={c} value={c}>
                {label("category", c)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex w-full flex-col gap-1 sm:w-64">
          <span className="text-xs font-medium text-ink-2">{t("spc.characteristic")}</span>
          <Select value={name ?? ""} onChange={(e) => setNameSel(e.target.value)}>
            {names.map((n) => (
              <option key={n} value={n}>
                {measurementName(n, lang)} ({units.get(n)})
              </option>
            ))}
          </Select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-2">{t("spc.window")}</span>
          <Segmented<Win>
            value={win}
            onChange={setWin}
            size="md"
            options={[
              { value: "50", label: t("spc.lastN", { n: 50 }) },
              { value: "100", label: t("spc.lastN", { n: 100 }) },
              { value: "all", label: t("spc.all"), count: all.length },
            ]}
          />
        </div>
      </div>

      {!model ? (
        <EmptyState icon={<LineChartIcon className="size-5" />} title={t("spc.empty")} />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="rounded-xl border border-line p-4 xl:col-span-2">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-ink">
                    {measurementName(name!, lang)} · {label("category", category!)}
                  </h3>
                  <p className="mt-0.5 text-[13px] text-ink-3">
                    {t("spc.title")} · {t("spc.subtitle", { n: model.points.length, plant: plantName })}
                  </p>
                </div>
              </div>
              <ChartLegend
                className="mb-2"
                items={[
                  { label: t("spc.value"), color: SERIES[0] },
                  { label: t("spc.mean"), color: MEAN_COLOR, dashed: true },
                  { label: t("spc.cl"), color: CL_COLOR, dashed: true },
                  { label: t("spc.spec"), color: SPEC_COLOR, dashed: true },
                  { label: t("spc.ooc"), color: STATUS_COLOR.critical },
                  { label: t("spc.run"), color: STATUS_COLOR.warn },
                ]}
              />
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={model.points} margin={{ top: 8, right: 44, bottom: 0, left: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="idx" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
                    <YAxis {...yAxisProps} width={52} domain={model.domain} tickFormatter={(v) => fmt.num(v, model.dp)} allowDataOverflow />
                    <Tooltip
                      cursor={lineCursor}
                      content={({ active, payload }) => {
                        const p = active && payload?.[0]?.payload ? (payload[0].payload as Point) : null;
                        if (!p) return null;
                        return (
                          <TooltipCard
                            title={t("spc.sample", { n: p.idx })}
                            rows={[
                              { label: t("spc.value"), value: `${fmt.num(p.value, model.dp)} ${p.unit}`, color: p.flags.length ? (p.flags.every((f) => f === "run") ? STATUS_COLOR.warn : STATUS_COLOR.critical) : SERIES[0] },
                              { label: t("i.time"), value: fmt.dateTime(p.at) },
                              { label: t("d.workOrder"), value: p.woId ?? "—" },
                              { label: t("d.product"), value: p.sku },
                              ...p.flags.map((f) => ({ label: t("spc.signals"), value: ruleLabel(f) })),
                            ]}
                          />
                        );
                      }}
                    />
                    <ReferenceLine y={model.usl} stroke={SPEC_COLOR} strokeDasharray="2 3" strokeWidth={1.5} label={{ value: t("spc.usl"), position: "right", fill: "var(--ink-3)", fontSize: 10 }} />
                    <ReferenceLine y={model.lsl} stroke={SPEC_COLOR} strokeDasharray="2 3" strokeWidth={1.5} label={{ value: t("spc.lsl"), position: "right", fill: "var(--ink-3)", fontSize: 10 }} />
                    <ReferenceLine y={model.stats.ucl} stroke={CL_COLOR} strokeDasharray="5 4" strokeWidth={1.5} label={{ value: t("spc.ucl"), position: "right", fill: "var(--ink-3)", fontSize: 10 }} />
                    <ReferenceLine y={model.stats.lcl} stroke={CL_COLOR} strokeDasharray="5 4" strokeWidth={1.5} label={{ value: t("spc.lcl"), position: "right", fill: "var(--ink-3)", fontSize: 10 }} />
                    <ReferenceLine y={model.stats.mean} stroke={MEAN_COLOR} strokeDasharray="6 4" strokeWidth={1.5} label={{ value: "X̄", position: "right", fill: "var(--ink-3)", fontSize: 10 }} />
                    <Line
                      dataKey="value"
                      name={t("spc.value")}
                      stroke={SERIES[0]}
                      strokeWidth={2}
                      isAnimationActive={false}
                      dot={(p: DotItemDotProps) => {
                        const pt = p.payload as Point;
                        const key = `d-${p.index}`;
                        if (p.cx === undefined || p.cy === undefined) return <g key={key} />;
                        const hard = pt.flags.some((f) => f !== "run");
                        if (hard) return <circle key={key} cx={p.cx} cy={p.cy} r={5} fill={STATUS_COLOR.critical} stroke="var(--surface)" strokeWidth={2} />;
                        if (pt.flags.length) return <circle key={key} cx={p.cx} cy={p.cy} r={4.5} fill={STATUS_COLOR.warn} stroke="var(--surface)" strokeWidth={2} />;
                        return <circle key={key} cx={p.cx} cy={p.cy} r={2.5} fill={SERIES[0]} />;
                      }}
                      activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-xl border border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <SectionTitle className="mb-1">{t("spc.capability")}</SectionTitle>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-4xl leading-none font-semibold tracking-tight text-ink">{num(model.stats.cpk, 2)}</span>
                    <span className="text-sm text-ink-3">Cpk</span>
                  </div>
                  <p className="mt-1.5 text-xs text-ink-3">{t("spc.cpkTarget")}</p>
                </div>
                <Badge tone={tone} icon={<ToneIcon className="size-3.5" />}>
                  {tone === "good" ? t("spc.capable") : tone === "warn" ? t("spc.marginal") : t("spc.notCapable")}
                </Badge>
              </div>
              <dl className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm">
                {[
                  ["Cp", num(model.stats.cp, 2)],
                  ["Pp", num(model.stats.pp, 2)],
                  ["Ppk", num(model.stats.ppk, 2)],
                  [t("spc.n"), fmt.num(model.points.length)],
                  ["X̄", num(model.stats.mean, model.dp + 1)],
                  [t("spc.oos"), fmt.num(model.oos)],
                  [t("spc.sigmaW"), num(model.stats.sigmaWithin, model.dp + 1)],
                  [t("spc.sigmaO"), num(model.stats.sigmaOverall, model.dp + 1)],
                  [t("spc.nominal"), `${fmt.num(model.nominal, model.dp)}`],
                  [t("spc.lsl"), fmt.num(model.lsl, model.dp)],
                  [t("spc.usl"), fmt.num(model.usl, model.dp)],
                  [`${t("spc.ucl")} / ${t("spc.lcl")}`, `${fmt.num(model.stats.ucl, model.dp)} / ${fmt.num(model.stats.lcl, model.dp)}`],
                ].map(([k, v], i) => (
                  <div key={i} className={cn("min-w-0", i === 11 && "col-span-3")}>
                    <dt className="truncate text-xs text-ink-3">{k}</dt>
                    <dd className={cn("tabular mt-0.5 font-medium text-ink", i === 5 && model.oos > 0 && "text-critical-ink")}>{v}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <SectionTitle className="mb-1">{t("spc.histogram")}</SectionTitle>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={model.bins} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
                      <CartesianGrid {...gridProps} />
                      <XAxis type="number" dataKey="mid" domain={model.hDomain} {...axisProps} tickFormatter={(v) => fmt.num(v, model.dp)} tickCount={4} />
                      <YAxis {...yAxisProps} width={28} allowDecimals={false} />
                      <Tooltip
                        cursor={cursorProps}
                        content={({ active, payload }) => {
                          const b = active && payload?.[0]?.payload ? (payload[0].payload as (typeof model.bins)[number]) : null;
                          if (!b) return null;
                          return <TooltipCard title={`${fmt.num(b.from, model.dp)} – ${fmt.num(b.to, model.dp)} ${model.unit}`} rows={[{ label: t("spc.count"), value: fmt.num(b.count), color: SERIES[0] }]} />;
                        }}
                      />
                      <ReferenceLine x={model.lsl} stroke={SPEC_COLOR} strokeDasharray="2 3" strokeWidth={1.5} />
                      <ReferenceLine x={model.usl} stroke={SPEC_COLOR} strokeDasharray="2 3" strokeWidth={1.5} />
                      <Bar dataKey="count" name={t("spc.count")} radius={barRadius} maxBarSize={20} isAnimationActive={false}>
                        {model.bins.map((b, i) => (
                          <Cell key={i} fill={b.mid < model.lsl || b.mid > model.usl ? STATUS_COLOR.critical : SERIES[0]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line">
            <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
              <SectionTitle className="mb-0">{t("spc.signals")}</SectionTitle>
              <span className="tabular text-xs text-ink-3">{fmt.num(signals.length)}</span>
            </div>
            {signals.length === 0 ? (
              <p className="flex items-center gap-2 px-4 pb-4 text-[13px] text-good-ink">
                <CheckCircle2 className="size-4" />
                {t("spc.noSignals")}
              </p>
            ) : (
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-line text-left text-xs text-ink-3">
                      <th className="px-4 py-2 font-medium">{t("spc.colSample")}</th>
                      <th className="px-3 py-2 font-medium">{t("i.time")}</th>
                      <th className="px-3 py-2 font-medium">{t("d.workOrder")}</th>
                      <th className="hidden px-3 py-2 font-medium sm:table-cell">{t("d.product")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("spc.colValue")}</th>
                      <th className="px-4 py-2 font-medium">{t("spc.colRule")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signals.slice(0, 12).map((p) => (
                      <tr key={p.inspId + p.idx} className="border-b border-line last:border-0">
                        <td className="tabular px-4 py-2 text-ink-2">{p.idx}</td>
                        <td className="tabular px-3 py-2 whitespace-nowrap text-ink-2">{fmt.dateTime(p.at)}</td>
                        <td className="px-3 py-2">{p.woId ? <IdLink href={`/work-orders/${p.woId}`}>{p.woId}</IdLink> : "—"}</td>
                        <td className="tabular hidden px-3 py-2 text-ink-2 sm:table-cell">{p.sku}</td>
                        <td className="tabular px-3 py-2 text-right font-medium whitespace-nowrap text-ink">
                          {fmt.num(p.value, model.dp)} <span className="text-xs font-normal text-ink-3">{p.unit}</span>
                        </td>
                        <td className="px-4 py-2">
                          <span className="flex flex-wrap gap-1">
                            {p.flags.map((f) => (
                              <Badge key={f} tone={f === "run" ? "warn" : "critical"} icon={f === "run" ? <AlertTriangle className="size-3.5" /> : <AlertOctagon className="size-3.5" />}>
                                {ruleLabel(f)}
                              </Badge>
                            ))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="text-xs text-ink-3">{t("spc.note")}</p>
        </>
      )}
    </div>
  );
}
