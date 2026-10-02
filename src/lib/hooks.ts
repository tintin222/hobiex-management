"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { type Clock, localDateOf } from "./data/clock";
import { computeInsights } from "./insights";
import type { Dataset, PlantId } from "./data/types";
import { useStore } from "./store";

/** Global plant filter shown in the top bar. Pages should respect it. */
export const usePlantStore = create<{ plant: PlantId | "all"; setPlant: (p: PlantId | "all") => void }>((set) => ({
  plant: "all",
  setPlant: (plant) => set({ plant }),
}));

export function usePlantFilter() {
  return usePlantStore((s) => s.plant);
}

/** Filter any array of records carrying `plantId` by the global plant filter. */
export function useByPlant<T extends { plantId: PlantId }>(rows: T[]): T[] {
  const plant = usePlantFilter();
  return useMemo(() => (plant === "all" ? rows : rows.filter((r) => r.plantId === plant)), [rows, plant]);
}

export type Lookups = ReturnType<typeof buildLookups>;

function buildLookups(db: Dataset) {
  const by = <T extends { id: string }>(arr: T[]) => new Map(arr.map((x) => [x.id, x] as const));
  return {
    plant: by(db.plants),
    product: by(db.products),
    machine: by(db.machines),
    employee: by(db.employees),
    customer: by(db.customers),
    workOrder: by(db.workOrders),
    salesOrder: by(db.salesOrders),
    material: by(db.materials),
    task: by(db.tasks),
    ncr: by(db.ncrs),
  };
}

const lookupCache = new WeakMap<Dataset, Lookups>();

function lookupsFor(db: Dataset): Lookups {
  let v = lookupCache.get(db);
  if (!v) {
    v = buildLookups(db);
    lookupCache.set(db, v);
  }
  return v;
}

/** id → record maps, rebuilt only when the dataset changes (shared across components). */
export function useLookups(): Lookups {
  const db = useStore((s) => s.db) as Dataset;
  return useMemo(() => lookupsFor(db), [db]);
}

/** A work order is late when its planned/actual finish date passes the due date. */
export function isLate(wo: { status: string; dueDate: string; plannedEnd: string; actualEnd?: string }, today: string) {
  const end = localDateOf(Date.parse(wo.actualEnd ?? wo.plannedEnd));
  if (wo.status === "completed") return end > wo.dueDate;
  return end > wo.dueDate || today > wo.dueDate;
}


/** Rule-based insights, recomputed when the dataset changes. */
export function useInsights() {
  const db = useStore((s) => s.db) as Dataset;
  const clock = useStore((s) => s.clock) as Clock;
  return useMemo(() => computeInsights(db, clock.now), [db, clock]);
}
