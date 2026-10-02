"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLookups } from "@/lib/hooks";
import { Avatar } from "./primitives";

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {breadcrumbs && (
          <nav className="mb-1.5 flex items-center gap-1 text-xs text-ink-3">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3" />}
                {b.href ? (
                  <Link href={b.href} className="hover:text-ink">
                    {b.label}
                  </Link>
                ) : (
                  <span>{b.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Avatar + name for an employee id. */
export function PersonChip({ id, size = 22, sub, className }: { id?: string; size?: number; sub?: ReactNode; className?: string }) {
  const { employee } = useLookups();
  const e = id ? employee.get(id) : undefined;
  if (!e) return <span className={cn("text-ink-3", className)}>—</span>;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <Avatar name={e.name} hue={e.avatarHue} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-sm text-ink">{e.name}</span>
        {sub && <span className="block truncate text-xs text-ink-3">{sub}</span>}
      </span>
    </span>
  );
}

/** Monospace-ish id link, e.g. WO-26-10234 → /work-orders/WO-26-10234 */
export function IdLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} onClick={(e) => e.stopPropagation()} className={cn("tabular font-medium whitespace-nowrap text-brand hover:underline", className)}>
      {children}
    </Link>
  );
}

export function SectionTitle({ children, actions, className }: { children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2 flex items-center justify-between gap-2", className)}>
      <h4 className="text-xs font-semibold tracking-wide text-ink-3 uppercase">{children}</h4>
      {actions}
    </div>
  );
}
