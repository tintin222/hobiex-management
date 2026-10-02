"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * URL-backed view state (drawer ids, tabs, filters that should be linkable).
 * Uses the native History API, which the Next.js App Router keeps in sync
 * with `useSearchParams()` — no server round-trip, and links from the top-bar
 * search or insights (e.g. `/orders?id=SO-…`) re-open the drawer even when
 * the page is already mounted.
 */
export function useUrlParams<K extends string>(...keys: K[]): Record<K, string | null> {
  const params = useSearchParams();
  const out = {} as Record<K, string | null>;
  for (const k of keys) out[k] = params.get(k);
  return out;
}

export function useUrlUpdate() {
  const pathname = usePathname();
  return useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname],
  );
}
