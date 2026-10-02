/**
 * Maintenance helpers: effective status, type colors, asset health score and
 * default checklists for new work requests.
 */
import { SERIES } from "@/components/charts/theme";
import type { Machine, MaintenanceOrder, MaintenanceStatus, MaintenanceType } from "@/lib/data/types";

export const MAINT_TYPES: MaintenanceType[] = ["preventive", "corrective", "predictive", "calibration"];
export const MAINT_STATUSES: MaintenanceStatus[] = ["scheduled", "in_progress", "waiting_parts", "overdue", "completed"];

/** Categorical color per maintenance type, fixed SERIES order. */
export const TYPE_COLOR: Record<MaintenanceType, string> = {
  preventive: SERIES[0],
  corrective: SERIES[1],
  predictive: SERIES[2],
  calibration: SERIES[3],
};

/** A scheduled job whose date has passed is overdue even if nobody flagged it. */
export function effStatus(mo: MaintenanceOrder, today: string): MaintenanceStatus {
  return mo.status === "scheduled" && mo.scheduledDate < today ? "overdue" : mo.status;
}

export const isOpen = (mo: MaintenanceOrder) => mo.status !== "completed";

export const LABOUR_EUR_PER_HOUR = 32;

export function partsCost(mo: MaintenanceOrder) {
  return mo.parts.reduce((s, p) => s + p.qty * p.costEur, 0);
}

export interface Health {
  score: number;
  tone: "good" | "warn" | "critical";
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * 0–100 health score: availability (40), MTBF (20), PM on schedule (15),
 * no open breakdowns (15) and clean sensor readings (10). A machine that is
 * down right now is capped at 35.
 */
export function healthScore(m: Machine, ctx: { openCorrective: number; pmOverdue: boolean; sensorWarns: number }): Health {
  const avail = clamp01((m.availability - 0.6) / 0.35) * 40;
  const mtbf = clamp01((m.mtbfHours - 90) / 330) * 20;
  const pm = ctx.pmOverdue ? 0 : 15;
  const corr = ctx.openCorrective === 0 ? 15 : ctx.openCorrective === 1 ? 5 : 0;
  const sensors = Math.max(0, 10 - 5 * ctx.sensorWarns);
  let score = Math.round(avail + mtbf + pm + corr + sensors);
  if (m.status === "down") score = Math.min(score, 35);
  return { score, tone: score >= 75 ? "good" : score >= 55 ? "warn" : "critical" };
}

type Item = [string, string];
export const CHECKLISTS: Record<MaintenanceType, Item[]> = {
  preventive: [
    ["Lock-out / tag-out", "Kilitle / etiketle (LOTO)"],
    ["Visual inspection", "Gözle kontrol"],
    ["Lubrication points", "Yağlama noktaları"],
    ["Filters & consumables", "Filtreler ve sarflar"],
    ["Safety devices test", "Emniyet ekipmanları testi"],
    ["Test run & sign-off", "Test çalıştırması ve onay"],
  ],
  corrective: [
    ["Lock-out / tag-out", "Kilitle / etiketle (LOTO)"],
    ["Diagnose fault", "Arızayı teşhis et"],
    ["Repair / replace", "Onar / değiştir"],
    ["Test run & sign-off", "Test çalıştırması ve onay"],
  ],
  predictive: [
    ["Review sensor trend", "Sensör eğilimini incele"],
    ["Vibration / thermal measurement", "Titreşim / termal ölçüm"],
    ["Decide action & order parts", "Aksiyona karar ver, parça sipariş et"],
    ["Update condition baseline", "Durum referansını güncelle"],
  ],
  calibration: [
    ["Check reference standard validity", "Referans standardın geçerliliğini kontrol et"],
    ["Measure against reference", "Referansa göre ölç"],
    ["Adjust & record deviation", "Ayarla ve sapmayı kaydet"],
    ["Apply calibration label", "Kalibrasyon etiketi yapıştır"],
  ],
};

/** Update one search param without a navigation (Next syncs useSearchParams). */
export function setSearchParam(key: string, value: string | null) {
  const params = new URLSearchParams(window.location.search);
  if (value) params.set(key, value);
  else params.delete(key);
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}

/** Default titles for new work requests ([en, tr]). */
export const AUTO_TITLE: Record<MaintenanceType, [string, string]> = {
  preventive: ["Preventive maintenance", "Önleyici bakım"],
  corrective: ["Breakdown repair", "Arıza onarımı"],
  predictive: ["Condition check (predictive)", "Durum kontrolü (kestirimci)"],
  calibration: ["Calibration", "Kalibrasyon"],
};
