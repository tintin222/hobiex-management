/**
 * Locale-aware formatting. All dates render in Europe/Istanbul so every
 * viewer sees factory time. Use through `useFmt()` in components.
 */
import { DAY, HOUR, MIN, TZ } from "./data/clock";
import type { Lang } from "@/i18n";

const LOCALE: Record<Lang, string> = { en: "en-GB", tr: "tr-TR" };

export function makeFormatter(lang: Lang) {
  const locale = LOCALE[lang];
  const nf0 = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nfCompact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const eur0 = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const eur2 = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eurCompact = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 });
  const dShort = new Intl.DateTimeFormat(locale, { timeZone: TZ, day: "2-digit", month: "short" });
  const dMed = new Intl.DateTimeFormat(locale, { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
  const dWeekday = new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: "short", day: "2-digit", month: "short" });
  const tShort = new Intl.DateTimeFormat(locale, { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  const dtShort = new Intl.DateTimeFormat(locale, { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  const toDate = (v: string | number) => (typeof v === "number" ? new Date(v) : v.length === 10 ? new Date(`${v}T12:00:00+03:00`) : new Date(v));

  return {
    lang,
    locale,
    num: (n: number, dp = 0) => (dp === 1 ? nf1.format(n) : dp === 0 ? nf0.format(n) : new Intl.NumberFormat(locale, { maximumFractionDigits: dp, minimumFractionDigits: dp }).format(n)),
    compact: (n: number) => nfCompact.format(n),
    /** x in 0..1 */
    pct: (x: number, dp = 0) => `${lang === "tr" ? "%" : ""}${new Intl.NumberFormat(locale, { maximumFractionDigits: dp, minimumFractionDigits: dp }).format(x * 100)}${lang === "tr" ? "" : "%"}`,
    eur: (n: number, cents = false) => (cents ? eur2.format(n) : eur0.format(n)),
    eurCompact: (n: number) => eurCompact.format(n),
    date: (v: string | number) => dShort.format(toDate(v)),
    dateLong: (v: string | number) => dMed.format(toDate(v)),
    weekday: (v: string | number) => dWeekday.format(toDate(v)),
    time: (v: string | number) => tShort.format(toDate(v)),
    dateTime: (v: string | number) => dtShort.format(toDate(v)),
    /** "in 3 h", "2 days ago" relative to nowMs */
    relative: (v: string | number, nowMs: number) => {
      const diff = toDate(v).getTime() - nowMs;
      const abs = Math.abs(diff);
      if (abs < HOUR) return rtf.format(Math.round(diff / MIN), "minute");
      if (abs < 2 * DAY) return rtf.format(Math.round(diff / HOUR), "hour");
      return rtf.format(Math.round(diff / DAY), "day");
    },
    /** minutes → "3 h 20 min" */
    duration: (min: number) => {
      const m = Math.round(min);
      const h = Math.floor(m / 60);
      const r = m % 60;
      const hu = lang === "tr" ? "sa" : "h";
      const mu = lang === "tr" ? "dk" : "min";
      if (h >= 24) {
        const d = Math.floor(h / 24);
        return `${d} ${lang === "tr" ? "g" : "d"} ${h % 24} ${hu}`;
      }
      return h ? (r ? `${h} ${hu} ${r} ${mu}` : `${h} ${hu}`) : `${r} ${mu}`;
    },
  };
}

export type Formatter = ReturnType<typeof makeFormatter>;
