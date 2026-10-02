"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  ClipboardList,
  Factory,
  GanttChartSquare,
  GitBranch,
  KanbanSquare,
  LayoutDashboard,
  Package,
  ShieldCheck,
  ShoppingCart,
  Tablet,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";

type NavItem = { href: string; key: string; icon: LucideIcon; badge?: (s: ReturnType<typeof useStore.getState>) => number };

export const NAV: { group: string; items: NavItem[] }[] = [
  { group: "nav.overview", items: [{ href: "/", key: "nav.dashboard", icon: LayoutDashboard }] },
  {
    group: "nav.production",
    items: [
      { href: "/tasks", key: "nav.tasks", icon: KanbanSquare, badge: (s) => s.db?.tasks.filter((t) => t.status === "blocked").length ?? 0 },
      { href: "/work-orders", key: "nav.workOrders", icon: ClipboardList },
      { href: "/planning", key: "nav.planning", icon: GanttChartSquare },
      { href: "/shop-floor", key: "nav.shopFloor", icon: Factory, badge: (s) => s.db?.machines.filter((m) => m.status === "down").length ?? 0 },
      { href: "/operator", key: "nav.operator", icon: Tablet },
    ],
  },
  {
    group: "nav.qualityAssets",
    items: [
      { href: "/quality", key: "nav.quality", icon: ShieldCheck },
      { href: "/traceability", key: "nav.traceability", icon: GitBranch },
      { href: "/maintenance", key: "nav.maintenance", icon: Wrench, badge: (s) => s.db?.maintenance.filter((m) => m.status === "overdue").length ?? 0 },
    ],
  },
  {
    group: "nav.supplyChain",
    items: [
      { href: "/orders", key: "nav.orders", icon: ShoppingCart, badge: (s) => s.db?.salesOrders.filter((o) => o.status === "new").length ?? 0 },
      { href: "/inventory", key: "nav.inventory", icon: Boxes },
      { href: "/products", key: "nav.products", icon: Package },
    ],
  },
  { group: "nav.people", items: [{ href: "/workforce", key: "nav.workforce", icon: Users }] },
];

function NavBadge({ fn }: { fn: NonNullable<NavItem["badge"]> }) {
  const n = useStore(fn);
  if (!n) return null;
  return <span className="tabular ml-auto rounded-full bg-critical px-1.5 text-[11px] leading-[18px] font-semibold text-white">{n}</span>;
}

export function Sidebar({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const t = useT();
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <aside className={cn("flex h-full w-60 flex-col bg-sidebar text-sidebar-ink", className)}>
      <div className="flex h-16 items-center gap-2 px-5">
        <Image src="/brand/logo.png" alt="Hobiex" width={110} height={22} className="h-[22px] w-auto brightness-0 invert" />
        <span className="mt-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-sidebar-ink uppercase">PMS</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4 scroll-thin">
        {NAV.map((g) => (
          <div key={g.group} className="mt-4 first:mt-1">
            <div className="px-2 pb-1.5 text-[11px] font-semibold tracking-wider text-sidebar-ink-2 uppercase">{t(g.group)}</div>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((it) => {
                const active = isActive(it.href);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={onNavigate}
                      className={cn(
                        "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors",
                        active ? "bg-sidebar-2 font-medium text-white shadow-[inset_2px_0_0_var(--brand)]" : "text-sidebar-ink hover:bg-white/5 hover:text-white",
                      )}
                    >
                      <it.icon className={cn("size-[18px]", active ? "text-[#6da7ec]" : "text-sidebar-ink-2")} />
                      <span className="truncate">{t(it.key)}</span>
                      {it.badge && <NavBadge fn={it.badge} />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/5 px-5 py-3 text-[11px] text-sidebar-ink-2">
        <div className="font-medium text-sidebar-ink">{t("app.tagline")}</div>
        <div>{t("app.demo")}</div>
      </div>
    </aside>
  );
}
