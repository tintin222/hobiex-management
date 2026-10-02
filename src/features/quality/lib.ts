/**
 * Pure quality helpers: 8D mapping, tolerance checks, SPC statistics and
 * Turkish names for the generated measurement characteristics.
 */
import type { DefectType, Inspection, Measurement, NcrStatus } from "@/lib/data/types";

// ───────────────────────────── 8D workflow ─────────────────────────────
export const NCR_FLOW: NcrStatus[] = ["open", "containment", "root_cause", "corrective_action", "verification", "closed"];

export function nextNcrStatus(s: NcrStatus): NcrStatus | null {
  const i = NCR_FLOW.indexOf(s);
  return i >= 0 && i < NCR_FLOW.length - 1 ? NCR_FLOW[i + 1] : null;
}

/** 8D disciplines shown in the stepper (D5 and D6 are run together). */
export const EIGHT_D = ["d1", "d2", "d3", "d4", "d56", "d7", "d8"] as const;
export type EightDStep = (typeof EIGHT_D)[number];
export const EIGHT_D_CODE: Record<EightDStep, string> = { d1: "D1", d2: "D2", d3: "D3", d4: "D4", d56: "D5–6", d7: "D7", d8: "D8" };

/** Index of the step currently being worked on (7 = all done). */
export function eightDIndex(s: NcrStatus): number {
  return { open: 1, containment: 2, root_cause: 3, corrective_action: 4, verification: 5, closed: 7 }[s];
}

/** The 8D step a status hands over to (used for button labels). */
export function stepForStatus(s: NcrStatus): EightDStep {
  return EIGHT_D[Math.min(6, eightDIndex(s))];
}

// ───────────────────────────── Measurements ─────────────────────────────
export const lslOf = (m: Pick<Measurement, "nominal" | "tolMinus">) => m.nominal - m.tolMinus;
export const uslOf = (m: Pick<Measurement, "nominal" | "tolPlus">) => m.nominal + m.tolPlus;
const EPS = 1e-9;
export function inTolerance(m: Measurement) {
  return m.value >= lslOf(m) - EPS && m.value <= uslOf(m) + EPS;
}

function decimalsIn(n: number) {
  const s = String(n);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

/** Display precision for a characteristic (max decimals among its numbers, ≤ 3). */
export function decimalsOf(m: Pick<Measurement, "nominal" | "tolMinus" | "tolPlus"> & { value?: number }) {
  return Math.min(3, Math.max(decimalsIn(m.nominal), decimalsIn(m.tolMinus), decimalsIn(m.tolPlus), m.value === undefined ? 0 : decimalsIn(m.value)));
}

/** Rough defect type for a failed characteristic (pre-fills a new NCR). */
export function defectForMeasurement(name: string): DefectType {
  if (/leak|pressure/i.test(name)) return "leak";
  if (/paint/i.test(name)) return "paint_defect";
  if (/weld/i.test(name)) return "weld_porosity";
  if (/tensile|thickness/i.test(name)) return "material_defect";
  return "dimensional";
}

const MEASUREMENT_TR: Record<string, string> = {
  "Overall length": "Toplam boy",
  "Inlet pipe Ø": "Giriş borusu Ø",
  "Flange flatness": "Flanş düzlemselliği",
  "Leak test Δp": "Sızdırmazlık testi Δp",
  "Paint thickness": "Boya kalınlığı",
  "Mat GBD": "Mat yoğunluğu (GBD)",
  "Inlet Ø": "Giriş Ø",
  "Mount GBD": "Montaj yoğunluğu (GBD)",
  "Back-pressure": "Karşı basınç",
  "Port pitch": "Port aralığı",
  "Wall thickness": "Et kalınlığı",
  "Proof pressure": "Dayanım basıncı",
  "Boss position": "Bos konumu",
  "Weld bead width": "Kaynak dikiş genişliği",
  Length: "Boy",
  "Bend angle": "Büküm açısı",
  "Insulation thickness": "İzolasyon kalınlığı",
  "Shell Ø": "Gövde Ø",
  "Bore Ø": "Delik Ø",
  "Actuation pressure": "Çalışma basıncı",
  "Zero-point signal": "Sıfır noktası sinyali",
  "Heater resistance": "Isıtıcı direnci",
  "CAN response": "CAN yanıt süresi",
  Thickness: "Kalınlık",
  "Tensile strength Rm": "Çekme dayanımı Rm",
  "Visual / CoC check": "Gözle / CoC kontrolü",
};

export function measurementName(name: string, lang: "en" | "tr") {
  return lang === "tr" ? MEASUREMENT_TR[name] ?? name : name;
}

const ROOT_CAUSE_TR: Record<string, string> = {
  "Gas flow drop due to worn regulator on robot cell": "Robot hücresindeki aşınmış regülatör nedeniyle gaz debisi düşüşü",
  "Fixture locator pin worn > 0.3 mm": "Fikstür merkezleme pimi 0,3 mm'den fazla aşınmış",
  "Wrong program revision loaded after changeover": "Model değişimi sonrası yanlış program revizyonu yüklendi",
  "Supplier coil with lamination — heat number traced": "Tedarikçi bobininde katmanlaşma — döküm numarası izlendi",
  "Insufficient pre-treatment time in paint line": "Boya hattında yetersiz ön işlem süresi",
  "Operator skipped poka-yoke step on new shift": "Yeni vardiyada operatör poka-yoke adımını atladı",
  "Pallet strapping method damages shell edges": "Palet çemberleme yöntemi gövde kenarlarına zarar veriyor",
};

export function rootCauseText(text: string | undefined, lang: "en" | "tr") {
  if (!text) return "";
  return lang === "tr" ? ROOT_CAUSE_TR[text] ?? text : text;
}

// ───────────────────────────── Yield ─────────────────────────────
/** First-pass yield: passed ÷ all production (non-incoming) inspections. */
export function firstPassYield(rows: Inspection[]): number | null {
  let n = 0;
  let pass = 0;
  for (const i of rows) {
    if (i.type === "incoming") continue;
    n++;
    if (i.result === "pass") pass++;
  }
  return n ? pass / n : null;
}

// ───────────────────────────── SPC ─────────────────────────────
export interface SpcStats {
  n: number;
  mean: number;
  sigmaWithin: number; // MR̄ / d2
  sigmaOverall: number;
  ucl: number;
  lcl: number;
  cp: number | null;
  cpk: number | null;
  pp: number | null;
  ppk: number | null;
}

const D2 = 1.128; // moving range of 2

export function spcStats(values: number[], lsl: number, usl: number): SpcStats {
  const n = values.length;
  const mean = n ? values.reduce((a, b) => a + b, 0) / n : 0;
  const sigmaOverall = n > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)) : 0;
  let mr = 0;
  for (let i = 1; i < n; i++) mr += Math.abs(values[i] - values[i - 1]);
  const mrBar = n > 1 ? mr / (n - 1) : 0;
  const sigmaWithin = mrBar / D2;
  const cap = (s: number) => (s > 0 ? { c: (usl - lsl) / (6 * s), ck: Math.min(usl - mean, mean - lsl) / (3 * s) } : null);
  const w = cap(sigmaWithin);
  const o = cap(sigmaOverall);
  return {
    n,
    mean,
    sigmaWithin,
    sigmaOverall,
    ucl: mean + 3 * sigmaWithin,
    lcl: mean - 3 * sigmaWithin,
    cp: w?.c ?? null,
    cpk: w?.ck ?? null,
    pp: o?.c ?? null,
    ppk: o?.ck ?? null,
  };
}

export type SpcRule = "ucl" | "lcl" | "usl" | "lsl" | "run";

/** Western Electric rule 1 (beyond 3σ), a 7-point run rule and spec violations. */
export function spcSignals(values: number[], s: SpcStats, lsl: number, usl: number): SpcRule[][] {
  const out: SpcRule[][] = values.map(() => []);
  let side = 0;
  let run = 0;
  values.forEach((v, i) => {
    if (v > s.ucl + EPS) out[i].push("ucl");
    if (v < s.lcl - EPS) out[i].push("lcl");
    if (v > usl + EPS) out[i].push("usl");
    if (v < lsl - EPS) out[i].push("lsl");
    const sd = v > s.mean ? 1 : v < s.mean ? -1 : 0;
    run = sd !== 0 && sd === side ? run + 1 : sd !== 0 ? 1 : 0;
    side = sd;
    if (run >= 7) out[i].push("run");
  });
  return out;
}

export function capabilityTone(cpk: number | null): "good" | "warn" | "critical" {
  if (cpk === null) return "warn";
  if (cpk >= 1.33) return "good";
  if (cpk >= 1) return "warn";
  return "critical";
}

// ───────────────────────────── URL state ─────────────────────────────
/** Update one search param without a navigation (Next syncs useSearchParams). */
export function setSearchParam(key: string, value: string | null) {
  const params = new URLSearchParams(window.location.search);
  if (value) params.set(key, value);
  else params.delete(key);
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}
