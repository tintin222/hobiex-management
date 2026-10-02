"use client";

/**
 * Large touch controls for the shop-floor terminal (gloves on a tablet):
 * every target is ≥ 56 px tall, high-contrast, and states carry an icon.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Check } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { messages } from "./messages";

export type BigTone = "start" | "pause" | "complete" | "good" | "scrap" | "danger" | "neutral" | "brand";

const TONES: Record<BigTone, string> = {
  start: "bg-good text-white shadow-sm hover:brightness-110",
  pause: "border-2 border-warn bg-warn-soft text-warn-ink hover:brightness-105",
  complete: "bg-brand text-brand-ink shadow-sm hover:bg-brand-hover",
  good: "border-2 border-good/40 bg-good-soft text-good-ink hover:border-good",
  scrap: "border-2 border-critical/40 bg-critical-soft text-critical-ink hover:border-critical",
  danger: "bg-critical text-white shadow-sm hover:brightness-110",
  neutral: "border-2 border-line-strong bg-surface text-ink hover:bg-surface-2",
  brand: "border-2 border-brand/40 bg-brand-soft text-brand-soft-ink hover:border-brand",
};

const SIZES = {
  md: "min-h-14 gap-2 rounded-xl px-4 text-base",
  lg: "min-h-16 gap-2.5 rounded-2xl px-5 text-lg",
  xl: "min-h-24 gap-3 rounded-2xl px-4 text-2xl tracking-wide",
};

export interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: BigTone;
  size?: keyof typeof SIZES;
  icon?: ReactNode;
  sub?: ReactNode;
}

export const BigButton = forwardRef<HTMLButtonElement, BigButtonProps>(function BigButton({ tone = "neutral", size = "lg", icon, sub, className, children, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold transition-[transform,filter,background-color,border-color] active:scale-[0.97] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-35 disabled:active:scale-100",
        SIZES[size],
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      {sub ? (
        <span className="flex flex-col items-start leading-tight">
          <span>{children}</span>
          <span className="text-xs font-medium opacity-80">{sub}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
});

const BANNER_TONES = {
  critical: "border-critical bg-critical-soft text-critical-ink",
  warn: "border-warn bg-warn-soft text-warn-ink",
  brand: "border-brand/50 bg-brand-soft text-brand-soft-ink",
  good: "border-good bg-good-soft text-good-ink",
};

export function Banner({ tone, icon, title, children, actions, className }: { tone: keyof typeof BANNER_TONES; icon: ReactNode; title: ReactNode; children?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div role={tone === "critical" ? "alert" : "status"} className={cn("flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border-2 px-5 py-4", BANNER_TONES[tone], className)}>
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-lg leading-snug font-semibold">{title}</div>
        {children && <div className="mt-0.5 text-sm opacity-90">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** 1 Sign in → 2 Workstation → 3 Job */
export function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const t = useT(messages);
  const steps = [t("step.signIn"), t("step.workstation"), t("step.job")];
  return (
    <ol className="flex items-center gap-2 text-sm">
      {steps.map((s, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <li key={s} className="flex items-center gap-2">
            {i > 0 && <span className={cn("h-px w-6 sm:w-10", done || active ? "bg-brand" : "bg-line-strong")} />}
            <span className={cn("flex items-center gap-2 rounded-full py-1 pr-3 pl-1", active ? "bg-brand-soft text-brand-soft-ink" : done ? "text-ink-2" : "text-ink-3")}>
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                  active ? "bg-brand text-brand-ink" : done ? "bg-good text-white" : "border border-line-strong bg-surface text-ink-3",
                )}
              >
                {done ? <Check className="size-3.5" /> : n}
              </span>
              <span className={cn("font-medium", !active && "hidden sm:inline")}>{s}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
