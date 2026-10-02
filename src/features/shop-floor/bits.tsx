"use client";

import { useEffect, useState } from "react";
import { DAY, MIN, shiftOfHour, TZ_OFFSET_MS } from "@/lib/data/clock";
import type { MachineStatus } from "@/lib/data/types";
import type { Tone } from "@/components/ui";
import { SENSOR_TR } from "./messages";

export const STATUS_ORDER: MachineStatus[] = ["running", "setup", "idle", "maintenance", "down"];

/** Top colour strip per status (always paired with an icon + label on the tile). */
export const STATUS_STRIP: Record<MachineStatus, string> = {
  running: "bg-good",
  setup: "bg-brand",
  idle: "bg-line-strong",
  maintenance: "bg-warn",
  down: "bg-critical",
};

export const toneText: Record<Tone, string> = {
  neutral: "text-ink-3",
  brand: "text-brand",
  good: "text-good-ink",
  warn: "text-warn-ink",
  serious: "text-serious-ink",
  critical: "text-critical-ink",
};

export const toneIcon: Record<Tone, string> = {
  neutral: "text-ink-3",
  brand: "text-brand",
  good: "text-good",
  warn: "text-warn",
  serious: "text-serious",
  critical: "text-critical",
};

/** Real time that keeps ticking; starts at the dataset's "now". */
export function useTickingNow(base: number, everyMs: number) {
  const [tick, setTick] = useState(base);
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return Math.max(base, tick);
}

/** "HH:MM:SS" in factory time (Istanbul is a fixed UTC+3 zone). */
export const factoryClock = (ms: number) => new Date(ms + TZ_OFFSET_MS).toISOString().slice(11, 19);

export function shiftInfo(now: number) {
  const minuteOfDay = Math.floor(((now + TZ_OFFSET_MS) % DAY) / MIN);
  const shift = shiftOfHour(Math.floor(minuteOfDay / 60));
  const start = shift === "A" ? 360 : shift === "B" ? 840 : 1320;
  const elapsed = (minuteOfDay - start + 1440) % 1440;
  return { shift, minuteOfDay, elapsed, left: 480 - elapsed, dayFrac: (minuteOfDay + 1) / 1440 };
}

export const sensorLabel = (label: string, lang: string) => (lang === "tr" ? SENSOR_TR[label] ?? label : label);

/** Output vs pace tone, as on the dashboard plant cards. */
export function paceTone(done: number, target: number, dayFrac: number): Tone {
  if (!target) return "neutral";
  const pace = target * dayFrac;
  return done >= pace * 0.95 ? "good" : done >= pace * 0.85 ? "warn" : "critical";
}
