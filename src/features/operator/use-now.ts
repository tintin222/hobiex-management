"use client";

import { useEffect, useState } from "react";
import { TZ_OFFSET_MS } from "@/lib/data/clock";
import { useClock } from "@/lib/store";

/** Wall-clock epoch ms that re-renders the caller every `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const clock = useClock();
  const [now, setNow] = useState(clock.now);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}

/** "HH:MM:SS" in factory (Istanbul) time. */
export function factoryTime(ms: number) {
  return new Date(ms + TZ_OFFSET_MS).toISOString().slice(11, 19);
}

/** Duration as "H:MM:SS". */
export function hms(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
