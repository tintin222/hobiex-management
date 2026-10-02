"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertOctagon, AlertTriangle, Bell, Info, Menu, Moon, RotateCcw, Search, Sun } from "lucide-react";
import { useLang, useLangStore, useT, useTx } from "@/i18n";
import { shiftOfHour, makeClock, SHIFT_HOURS } from "@/lib/data/clock";
import { cn } from "@/lib/cn";
import { useInsights, usePlantStore } from "@/lib/hooks";
import { actions, toast, useStore } from "@/lib/store";
import { Avatar, IconButton, Kbd, Segmented, Select } from "@/components/ui";
import type { PlantId } from "@/lib/data/types";

function useOutside(ref: React.RefObject<HTMLElement | null>, onOut: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onOut();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, onOut]);
}

function GlobalSearch() {
  const t = useT();
  const tx = useTx();
  const router = useRouter();
  const db = useStore((s) => s.db);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useOutside(ref, () => setOpen(false));

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const results = useMemo(() => {
    if (!db || q.trim().length < 2) return [];
    const s = q.trim().toLowerCase();
    const r: { kind: string; label: string; sub: string; href: string }[] = [];
    const push = (x: (typeof r)[number]) => r.length < 10 && r.push(x);
    db.workOrders.filter((w) => w.id.toLowerCase().includes(s) || w.lotNo.toLowerCase().includes(s)).slice(0, 4).forEach((w) => push({ kind: "WO", label: w.id, sub: db.products.find((p) => p.id === w.productId)?.name ?? "", href: `/work-orders/${w.id}` }));
    db.salesOrders.filter((o) => o.id.toLowerCase().includes(s) || o.b2bRef?.toLowerCase().includes(s)).slice(0, 3).forEach((o) => push({ kind: "SO", label: o.id, sub: db.customers.find((c) => c.id === o.customerId)?.name ?? "", href: `/orders?id=${o.id}` }));
    db.products.filter((p) => p.sku.toLowerCase().includes(s) || p.name.toLowerCase().includes(s) || p.oemRef.toLowerCase().includes(s)).slice(0, 3).forEach((p) => push({ kind: "PRD", label: p.sku, sub: p.name, href: `/products/${p.id}` }));
    db.machines.filter((m) => m.id.toLowerCase().includes(s) || m.name.toLowerCase().includes(s)).slice(0, 3).forEach((m) => push({ kind: "MCH", label: m.id, sub: m.model, href: `/shop-floor?machine=${m.id}` }));
    db.materials.filter((m) => m.id.toLowerCase().includes(s) || m.name.toLowerCase().includes(s) || m.nameTr.toLowerCase().includes(s)).slice(0, 2).forEach((m) => push({ kind: "MAT", label: m.id, sub: tx(m.name, m.nameTr), href: `/inventory?material=${m.id}` }));
    db.customers.filter((c) => c.name.toLowerCase().includes(s)).slice(0, 2).forEach((c) => push({ kind: "CUS", label: c.name, sub: tx(c.country, c.countryTr), href: `/orders?customer=${c.id}` }));
    db.ncrs.filter((n) => n.id.toLowerCase().includes(s)).slice(0, 2).forEach((n) => push({ kind: "NCR", label: n.id, sub: tx(n.title, n.titleTr), href: `/quality?ncr=${n.id}` }));
    db.tasks.filter((x) => x.id.toLowerCase().includes(s)).slice(0, 2).forEach((x) => push({ kind: "TSK", label: x.id, sub: tx(x.title, x.titleTr), href: `/tasks?task=${x.id}` }));
    return r;
  }, [db, q, tx]);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) go(results[0].href);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={t("top.search")}
        className="h-9 w-full rounded-lg border border-line bg-surface-2 pr-14 pl-9 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:bg-surface focus:outline-none"
      />
      <span className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 sm:block">
        <Kbd>⌘K</Kbd>
      </span>
      {open && results.length > 0 && (
        <div className="absolute top-11 left-0 z-40 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
          {results.map((r, i) => (
            <button key={i} type="button" onClick={() => go(r.href)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2">
              <span className="w-9 shrink-0 rounded bg-surface-3 py-0.5 text-center text-[10px] font-semibold text-ink-2">{r.kind}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{r.label}</span>
                <span className="block truncate text-xs text-ink-3">{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LiveShift() {
  const t = useT();
  const [clock, setClock] = useState(() => makeClock());
  useEffect(() => {
    const id = setInterval(() => setClock(makeClock()), 20_000);
    return () => clearInterval(id);
  }, []);
  const shift = shiftOfHour(clock.hour);
  const hh = String(clock.hour).padStart(2, "0");
  const mm = String(clock.minuteOfDay % 60).padStart(2, "0");
  return (
    <div className="hidden items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1 lg:flex" title={SHIFT_HOURS[shift]}>
      <span className="pulse-dot size-2 rounded-full bg-good" />
      <span className="tabular text-sm font-semibold text-ink">
        {hh}:{mm}
      </span>
      <span className="text-xs text-ink-3">
        {t("top.shift", { s: shift })} · {SHIFT_HOURS[shift]}
      </span>
    </div>
  );
}

function Alerts() {
  const t = useT();
  const lang = useLang();
  const insights = useInsights();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const urgent = insights.filter((i) => i.severity !== "info").length;
  return (
    <div ref={ref} className="relative">
      <IconButton label={t("top.alerts")} onClick={() => setOpen((o) => !o)} className="relative">
        <Bell className="size-[18px]" />
        {urgent > 0 && <span className="tabular absolute -top-0.5 -right-0.5 rounded-full bg-critical px-1 text-[10px] leading-4 font-semibold text-white">{urgent}</span>}
      </IconButton>
      {open && (
        <div className="absolute top-10 right-0 z-40 w-[380px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
          <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">{t("top.alerts")}</div>
          <div className="max-h-[420px] overflow-y-auto scroll-thin">
            {insights.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-3">{t("top.noAlerts")}</p>}
            {insights.map((i) => {
              const Icon = i.severity === "critical" ? AlertOctagon : i.severity === "warning" ? AlertTriangle : Info;
              return (
                <Link key={i.id} href={i.href} onClick={() => setOpen(false)} className="flex gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-surface-2">
                  <Icon className={cn("mt-0.5 size-4 shrink-0", i.severity === "critical" ? "text-critical" : i.severity === "warning" ? "text-warn" : "text-brand")} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink">{lang === "tr" ? i.titleTr : i.title}</span>
                    <span className="mt-0.5 block text-xs text-ink-3">{lang === "tr" ? i.detailTr : i.detail}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const t = useT();
  // rendered only on the client (below the app shell's data gate)
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === "dark");
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("hobiex.theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  };
  return (
    <IconButton label={t("top.theme")} onClick={toggle}>
      {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
    </IconButton>
  );
}

function UserMenu() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg p-1 hover:bg-surface-3" aria-label={t("top.user")}>
        <Avatar name="Production Director" hue={212} size={30} />
      </button>
      {open && (
        <div className="absolute top-11 right-0 z-40 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-xl">
          <div className="border-b border-line px-4 py-3">
            <div className="text-sm font-medium text-ink">{t("top.user")}</div>
            <div className="text-xs text-ink-3">Silivri / İstanbul</div>
          </div>
          <button
            type="button"
            onClick={() => {
              actions.resetDemo();
              setOpen(false);
              toast({ title: t("top.resetDemo"), tone: "info" });
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ink-2 hover:bg-surface-2"
          >
            <RotateCcw className="size-4" />
            {t("top.resetDemo")}
          </button>
        </div>
      )}
    </div>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const t = useT();
  const lang = useLang();
  const setLang = useLangStore((s) => s.setLang);
  const plant = usePlantStore((s) => s.plant);
  const setPlant = usePlantStore((s) => s.setPlant);
  const plants = useStore((s) => s.db?.plants);
  const tx = useTx();
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur md:px-6">
      <IconButton label="Menu" onClick={onMenu} className="lg:hidden">
        <Menu className="size-5" />
      </IconButton>
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-2">
        <Select value={plant} onChange={(e) => setPlant(e.target.value as PlantId | "all")} className="hidden h-9 w-auto min-w-40 md:block" aria-label={t("common.plant")}>
          <option value="all">{t("top.allPlants")}</option>
          {plants?.map((p) => (
            <option key={p.id} value={p.id}>
              {tx(p.name, p.nameTr)}
            </option>
          ))}
        </Select>
        <LiveShift />
        <Segmented
          value={lang}
          onChange={setLang}
          options={[
            { value: "en", label: "EN" },
            { value: "tr", label: "TR" },
          ]}
        />
        <ThemeToggle />
        <Alerts />
        <UserMenu />
      </div>
    </header>
  );
}
