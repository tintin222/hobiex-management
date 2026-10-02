"use client";

import { AlertOctagon, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { dismissToast, useStore } from "@/lib/store";

const icons = { good: CheckCircle2, warn: AlertTriangle, critical: AlertOctagon, info: Info };
const colors = { good: "text-good", warn: "text-warn", critical: "text-critical", info: "text-brand" };

export function Toaster() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const tone = t.tone ?? "good";
        const Icon = icons[tone];
        return (
          <div key={t.id} className="animate-slide-in pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-xl">
            <Icon className={cn("mt-0.5 size-5 shrink-0", colors[tone])} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{t.title}</p>
              {t.description && <p className="mt-0.5 text-[13px] text-ink-3">{t.description}</p>}
            </div>
            <button type="button" onClick={() => dismissToast(t.id)} className="text-ink-3 hover:text-ink" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
