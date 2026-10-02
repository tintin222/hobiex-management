"use client";

/**
 * Free-text reasons (work-order holds, blocked tasks) are stored in English —
 * the canonical form the generator and the store use — and translated for
 * display. Presets picked in a dialog are stored as their English text, with
 * an optional "— note" suffix that is shown verbatim.
 */
import { useCallback } from "react";
import { useLang, type Lang } from "@/i18n";
import { HOLD_REASON_TR } from "@/lib/data/labels";

export interface ReasonPreset {
  en: string;
  tr: string;
}

export const HOLD_PRESETS: ReasonPreset[] = [
  { en: "Material shortage", tr: "Malzeme eksikliği" },
  { en: "Quality hold", tr: "Kalite beklemesi" },
  { en: "Machine breakdown", tr: "Makine arızası" },
  { en: "Waiting for fixture repair", tr: "Fikstür tamiri bekleniyor" },
  { en: "Customer requested change", tr: "Müşteri değişiklik talebi" },
  { en: "Engineering change (drawing revision)", tr: "Mühendislik değişikliği (çizim revizyonu)" },
  { en: "Capacity re-prioritisation", tr: "Kapasite yeniden önceliklendirme" },
];

export const BLOCK_PRESETS: ReasonPreset[] = [
  { en: "Waiting for material", tr: "Malzeme bekleniyor" },
  { en: "Machine down", tr: "Makine arızalı" },
  { en: "Awaiting QC approval", tr: "Kalite onayı bekleniyor" },
  { en: "Missing drawing revision", tr: "Çizim revizyonu eksik" },
  { en: "Waiting for operator", tr: "Operatör bekleniyor" },
  { en: "Tooling / fixture not available", tr: "Takım / fikstür hazır değil" },
];

const DICT: Record<string, string> = {
  ...HOLD_REASON_TR,
  "Flagged from board": "Panodan işaretlendi",
  ...Object.fromEntries([...HOLD_PRESETS, ...BLOCK_PRESETS].map((p) => [p.en, p.tr])),
};

export function translateReason(text: string, lang: Lang): string {
  if (lang === "en" || !text) return text;
  if (DICT[text]) return DICT[text];
  const i = text.indexOf(" — ");
  if (i > 0) {
    const head = text.slice(0, i);
    if (DICT[head]) return `${DICT[head]} — ${text.slice(i + 3)}`;
  }
  return text;
}

/** Compose a stored reason from a preset and an optional note. */
export function composeReason(preset: ReasonPreset | undefined, note: string): string {
  const n = note.trim();
  if (preset && n) return `${preset.en} — ${n}`;
  return preset?.en ?? n;
}

export function useReasonTx() {
  const lang = useLang();
  return useCallback((text?: string) => (text ? translateReason(text, lang) : ""), [lang]);
}
