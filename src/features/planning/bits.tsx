"use client";

import { useLabel } from "@/i18n";
import { cn } from "@/lib/cn";
import type { MachineStatus } from "@/lib/data/types";
import { STATUS_STYLES, type Tone } from "@/components/ui";

export const toneText: Record<Tone, string> = {
  neutral: "text-ink-3",
  brand: "text-brand",
  good: "text-good-ink",
  warn: "text-warn-ink",
  serious: "text-serious-ink",
  critical: "text-critical-ink",
};

export const toneFill: Record<Tone, string> = {
  neutral: "bg-ink-3",
  brand: "bg-brand",
  good: "bg-good",
  warn: "bg-warn",
  serious: "bg-serious",
  critical: "bg-critical",
};

export const toneSoft: Record<Tone, string> = {
  neutral: "bg-neutral-soft text-neutral-ink",
  brand: "bg-brand-soft text-brand-soft-ink",
  good: "bg-good-soft text-good-ink",
  warn: "bg-warn-soft text-warn-ink",
  serious: "bg-serious-soft text-serious-ink",
  critical: "bg-critical-soft text-critical-ink",
};

/** Compact machine status: icon + label (label hidden on phones when asked). */
export function StatusMini({ status, className, compactOnMobile }: { status: MachineStatus; className?: string; compactOnMobile?: boolean }) {
  const label = useLabel();
  const [tone, Icon] = STATUS_STYLES.machineStatus![status];
  const text = label("machineStatus", status);
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium whitespace-nowrap", toneText[tone], className)} title={text}>
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className={compactOnMobile ? "hidden sm:inline" : undefined}>{text}</span>
    </span>
  );
}
