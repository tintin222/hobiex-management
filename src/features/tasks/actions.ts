"use client";

/**
 * Task mutations on top of the shared store actions. Adds an exact completion
 * timestamp for tasks closed during the session (for the "done in 24 h"
 * counter) and a few composite steps (block with reason, log time, create
 * with the standard checklist).
 */
import { create } from "zustand";
import type { Priority, PlantId, Task, TaskStatus, TaskType } from "@/lib/data/types";
import { actions, getDb } from "@/lib/store";
import { DEFAULT_CHECKLIST } from "./task-utils";

export const useTaskSession = create<{ dataset: string; doneAt: Record<string, number> }>(() => ({ dataset: "", doneAt: {} }));

function trackDone(id: string, done: boolean) {
  const dataset = getDb().generatedAt;
  useTaskSession.setState((s) => {
    const doneAt = s.dataset === dataset ? { ...s.doneAt } : {};
    if (done) doneAt[id] = Date.now();
    else delete doneAt[id];
    return { dataset, doneAt };
  });
}

export const taskActions = {
  move(id: string, status: TaskStatus) {
    actions.moveTask(id, status);
    trackDone(id, status === "done");
  },

  block(id: string, reason: string) {
    actions.moveTask(id, "blocked");
    actions.updateTask(id, { blockedReason: reason });
    trackDone(id, false);
  },

  logTime(id: string, hours: number) {
    const t = getDb().tasks.find((x) => x.id === id);
    if (t) actions.updateTask(id, { loggedHours: Math.round((t.loggedHours + hours) * 10) / 10 });
  },

  create(input: {
    title: string;
    description?: string;
    type: TaskType;
    priority: Priority;
    plantId: PlantId;
    assigneeId?: string;
    dueAt: string;
    estimateHours: number;
    workOrderId?: string;
  }): Task {
    const db = getDb();
    const wo = input.workOrderId ? db.workOrders.find((w) => w.id === input.workOrderId) : undefined;
    const op = wo ? (wo.operations.find((o) => o.status === "running" || o.status === "paused" || o.status === "ready") ?? wo.operations[0]) : undefined;
    const sku = wo ? db.products.find((p) => p.id === wo.productId)?.sku : undefined;
    return actions.createTask({
      ...input,
      titleTr: input.title,
      machineId: op?.machineId,
      tags: sku ? [sku] : [],
      checklist: DEFAULT_CHECKLIST[input.type].map(([label, labelTr]) => ({ label, labelTr, done: false })),
    });
  },
};
