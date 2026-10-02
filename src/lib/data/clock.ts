/**
 * Time helpers. Hobiex runs in Silivri/Istanbul, which is a fixed UTC+3 zone
 * (no DST since 2016), so local day boundaries can be computed without a tz
 * database and render identically on any machine.
 */

export const TZ = "Europe/Istanbul";
export const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export interface Clock {
  /** epoch ms of "now" */
  now: number;
  /** local (Istanbul) calendar day, "YYYY-MM-DD" */
  today: string;
  /** epoch ms of local midnight today */
  dayStart: number;
  /** local hour 0..23 */
  hour: number;
  /** local minutes since midnight */
  minuteOfDay: number;
}

export function localDateOf(ms: number): string {
  return new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

export function makeClock(nowMs: number = Date.now()): Clock {
  const today = localDateOf(nowMs);
  const dayStart = Date.parse(`${today}T00:00:00+03:00`);
  const minuteOfDay = Math.floor((nowMs - dayStart) / MIN);
  return { now: nowMs, today, dayStart, hour: Math.floor(minuteOfDay / 60), minuteOfDay };
}

/** "YYYY-MM-DD" shifted by n days */
export function addDays(isoDate: string, n: number): string {
  const ms = Date.parse(`${isoDate}T12:00:00+03:00`) + n * DAY;
  return localDateOf(ms);
}

/** Whole local days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00+03:00`) - Date.parse(`${a}T12:00:00+03:00`)) / DAY);
}

/** Local hour (0..23) of an ISO timestamp. */
export function localHourOf(iso: string): number {
  return new Date(Date.parse(iso) + TZ_OFFSET_MS).getUTCHours();
}

/** Shift of a local hour: A 06-14, B 14-22, C 22-06. */
export function shiftOfHour(hour: number): "A" | "B" | "C" {
  if (hour >= 6 && hour < 14) return "A";
  if (hour >= 14 && hour < 22) return "B";
  return "C";
}

export const SHIFT_HOURS: Record<"A" | "B" | "C", string> = {
  A: "06:00–14:00",
  B: "14:00–22:00",
  C: "22:00–06:00",
};
