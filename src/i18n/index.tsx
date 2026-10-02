"use client";

/**
 * Tiny i18n layer (EN / TR).
 *
 *   const t = useT(messages)   // messages = { en: {...}, tr: {...} } local to a page
 *   t("title")                 // looks up local messages, then common ones
 *   t("wo.count", { n: 12 })   // "{n}" placeholders
 *
 *   const label = useLabel()
 *   label("woStatus", wo.status)  // enum labels from lib/data/labels.ts
 *
 *   const tx = useTx()
 *   tx(task.title, task.titleTr)  // bilingual data fields
 */
import { useCallback, useMemo } from "react";
import { create } from "zustand";
import { ALL_LABELS, type LabelKind } from "@/lib/data/labels";
import { makeFormatter } from "@/lib/format";
import { common } from "./common";

export type Lang = "en" | "tr";
export type Dict = Record<string, string>;
export type Messages = { en: Dict; tr: Dict };

const STORAGE_KEY = "hobiex.lang";

export const useLangStore = create<{ lang: Lang; setLang: (l: Lang) => void }>((set) => ({
  lang: "en",
  setLang: (lang) => {
    set({ lang });
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      document.documentElement.lang = lang;
    } catch {
      /* storage unavailable — keep in memory */
    }
  },
}));

export function loadStoredLang() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "tr") useLangStore.getState().setLang(v);
  } catch {
    /* ignore */
  }
}

export function useLang(): Lang {
  return useLangStore((s) => s.lang);
}

function interpolate(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function useT(local?: Messages) {
  const lang = useLang();
  return useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const s = local?.[lang]?.[key] ?? common[lang][key] ?? local?.en?.[key] ?? common.en[key] ?? key;
      return interpolate(s, vars);
    },
    [lang, local],
  );
}

export function useLabel() {
  const lang = useLang();
  return useCallback(
    <K extends LabelKind>(kind: K, value: keyof (typeof ALL_LABELS)[K]) => {
      const entry = (ALL_LABELS[kind] as Record<string, { en: string; tr: string }>)[value as string];
      return entry ? entry[lang] : String(value);
    },
    [lang],
  );
}

export function useTx() {
  const lang = useLang();
  return useCallback((en: string, tr?: string) => (lang === "tr" && tr ? tr : en), [lang]);
}

export function useFmt() {
  const lang = useLang();
  return useMemo(() => makeFormatter(lang), [lang]);
}
