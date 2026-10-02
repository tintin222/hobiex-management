"use client";

/**
 * Small presentational pieces shared by the work-order and task screens.
 * (Candidates for the shared UI kit: a clickable compact stat card and a
 * material-readiness indicator.)
 */
import type { ReactNode } from "react";
import { PackageCheck, PackageMinus, PackageX, type LucideIcon } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import type { WorkOrder } from "@/lib/data/types";
import { Badge, type Tone } from "@/components/ui";
import { messages } from "./messages";

const toneIcon: Record<Tone, string> = {
  neutral: "bg-surface-3 text-ink-2",
  brand: "bg-brand-soft text-brand-soft-ink",
  good: "bg-good-soft text-good-ink",
  warn: "bg-warn-soft text-warn-ink",
  serious: "bg-serious-soft text-serious-ink",
  critical: "bg-critical-soft text-critical-ink",
};

/** Compact, clickable stat used as a quick filter above lists and boards. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  active,
  onClick,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon: ReactNode;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-xl border bg-surface p-3.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        active ? "border-brand ring-2 ring-brand/20" : "border-line hover:border-line-strong",
      )}
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", toneIcon[tone])}>{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-ink-2">{label}</span>
        <span className="font-display block text-[22px] leading-tight font-semibold tracking-tight text-ink tabular">{value}</span>
        {hint && <span className="block truncate text-[11px] text-ink-3">{hint}</span>}
      </span>
    </button>
  );
}

export const MATERIAL_STATUS: Record<WorkOrder["materialStatus"], [Tone, LucideIcon]> = {
  available: ["good", PackageCheck],
  partial: ["warn", PackageMinus],
  short: ["critical", PackageX],
};

const iconTone: Record<Tone, string> = {
  neutral: "text-ink-3",
  brand: "text-brand",
  good: "text-good",
  warn: "text-warn",
  serious: "text-serious",
  critical: "text-critical",
};

/** Icon-only material readiness (table cells) — label via tooltip + screen reader text. */
export function MaterialStatusIcon({ value }: { value: WorkOrder["materialStatus"] }) {
  const t = useT(messages);
  const [tone, Icon] = MATERIAL_STATUS[value];
  const text = t(`mat.${value}Long`);
  return (
    <span className="inline-flex items-center" title={text}>
      <Icon className={cn("size-[18px]", iconTone[tone])} aria-hidden />
      <span className="sr-only">{text}</span>
    </span>
  );
}

export function MaterialStatusBadge({ value, long }: { value: WorkOrder["materialStatus"]; long?: boolean }) {
  const t = useT(messages);
  const [tone, Icon] = MATERIAL_STATUS[value];
  return (
    <Badge tone={tone} icon={<Icon className="size-3.5" />}>
      {t(long ? `mat.${value}Long` : `mat.${value}`)}
    </Badge>
  );
}
