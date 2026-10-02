/**
 * Quality-specific mutations built on the shared store actions.
 */
import type { NcrStatus } from "@/lib/data/types";
import { actions, getDb } from "@/lib/store";
import { nextNcrStatus } from "./lib";

/** Move an NCR one 8D step forward; stamps closedAt when it reaches D8. */
export function advanceNcr(id: string): NcrStatus | null {
  const db = getDb();
  const ncr = db.ncrs.find((n) => n.id === id);
  if (!ncr) return null;
  const next = nextNcrStatus(ncr.status);
  if (!next) return null;
  actions.updateNcr(id, { status: next, closedAt: next === "closed" ? db.today : undefined });
  return next;
}
