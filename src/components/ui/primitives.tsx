"use client";

import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

// ───────────────────────────── Button ─────────────────────────────
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type ButtonSize = "xs" | "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-ink hover:bg-brand-hover shadow-sm",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-2 shadow-sm",
  ghost: "text-ink-2 hover:bg-surface-3 hover:text-ink",
  danger: "bg-critical text-white hover:opacity-90 shadow-sm",
  subtle: "bg-brand-soft text-brand-soft-ink hover:opacity-85",
};
const buttonSizes: Record<ButtonSize, string> = {
  xs: "h-7 px-2 text-xs gap-1 rounded-md",
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-sm gap-2 rounded-lg",
  lg: "h-12 px-5 text-base gap-2 rounded-xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ───────────────────────────── Card ─────────────────────────────
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)} {...rest} />;
}

export function CardHeader({
  title,
  subtitle,
  actions,
  icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <div className="mt-0.5 text-ink-3">{icon}</div>}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...rest} />;
}

// ───────────────────────────── Badge ─────────────────────────────
export type Tone = "neutral" | "brand" | "good" | "warn" | "serious" | "critical";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-neutral-soft text-neutral-ink",
  brand: "bg-brand-soft text-brand-soft-ink",
  good: "bg-good-soft text-good-ink",
  warn: "bg-warn-soft text-warn-ink",
  serious: "bg-serious-soft text-serious-ink",
  critical: "bg-critical-soft text-critical-ink",
};
export const toneDot: Record<Tone, string> = {
  neutral: "bg-ink-3",
  brand: "bg-brand",
  good: "bg-good",
  warn: "bg-warn",
  serious: "bg-serious",
  critical: "bg-critical",
};

export function Badge({
  tone = "neutral",
  icon,
  dot,
  className,
  children,
}: {
  tone?: Tone;
  icon?: ReactNode;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap", toneClasses[tone], className)}>
      {dot && <span className={cn("size-1.5 rounded-full", toneDot[tone])} />}
      {icon}
      {children}
    </span>
  );
}

// ───────────────────────────── Progress ─────────────────────────────
export function Progress({
  value,
  tone = "brand",
  className,
  size = "md",
}: {
  value: number; // 0..1
  tone?: Tone;
  className?: string;
  size?: "sm" | "md";
}) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-surface-3", size === "sm" ? "h-1.5" : "h-2", className)}
      role="progressbar"
      aria-valuenow={Math.round(v * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", toneDot[tone])} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

// ───────────────────────────── Form controls ─────────────────────────────
const fieldBase =
  "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(fieldBase, className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "h-auto min-h-20 py-2", className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        fieldBase,
        "cursor-pointer appearance-none bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-8",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237d8494' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-3" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pr-8 pl-8" />
      {value && (
        <button type="button" onClick={() => onChange("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-ink-3 hover:text-ink" aria-label="Clear">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

// ───────────────────────────── Segmented / Tabs ─────────────────────────────
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "sm",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={cn("inline-flex rounded-lg bg-surface-3 p-0.5", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors",
            size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
            value === o.value ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className={cn("tabular rounded px-1 text-[11px]", value === o.value ? "bg-surface-3 text-ink-2" : "text-ink-3")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: ReactNode; count?: number; icon?: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto border-b border-line scroll-thin", className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
            value === t.value ? "border-brand text-ink" : "border-transparent text-ink-3 hover:text-ink-2",
          )}
        >
          {t.icon}
          {t.label}
          {t.count !== undefined && <span className="tabular rounded-full bg-surface-3 px-1.5 text-[11px] text-ink-2">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ───────────────────────────── Misc ─────────────────────────────
export function Avatar({ name, hue = 210, size = 28, className }: { name: string; hue?: number; size?: number; className?: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 45% 42%)` }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="mb-1 rounded-full bg-surface-3 p-3 text-ink-3">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="max-w-sm text-[13px] text-ink-3">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function KeyValue({ items, className, cols = 2 }: { items: { label: ReactNode; value: ReactNode }[]; className?: string; cols?: 1 | 2 | 3 | 4 }) {
  const grid = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-2 sm:grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[cols];
  return (
    <dl className={cn("grid gap-x-6 gap-y-3", grid, className)}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-ink-3">{it.label}</dt>
          <dd className="mt-0.5 truncate text-sm font-medium text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-line", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-3", className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] text-ink-3">{children}</kbd>;
}
