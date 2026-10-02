"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { loadStoredLang, useT } from "@/i18n";
import { initStore, useStore } from "@/lib/store";
import { Toaster } from "@/components/ui/toaster";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/**
 * The synthetic dataset is generated in the browser (it is relative to the
 * viewer's "now"), so the app renders a short loading screen on the server
 * and mounts the real UI once the data exists.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const ready = useStore((s) => s.ready);
  const [menu, setMenu] = useState(false);
  const pathname = usePathname();
  const t = useT();

  useEffect(() => {
    loadStoredLang();
    initStore();
  }, []);

  if (!ready)
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-bg">
        <Image src="/brand/logo.png" alt="Hobiex" width={180} height={36} preload />
        <div className="h-1 w-48 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-brand" />
        </div>
        <p className="text-sm text-ink-3">{t("common.loading")}</p>
      </div>
    );

  const fullscreen = pathname.startsWith("/operator");

  return (
    <div className="flex h-dvh overflow-hidden">
      {!fullscreen && <Sidebar className="hidden lg:flex" />}
      {menu && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenu(false)} />
          <Sidebar className="animate-slide-in relative" onNavigate={() => setMenu(false)} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {!fullscreen && <Topbar onMenu={() => setMenu(true)} />}
        <main className="flex-1 overflow-y-auto scroll-thin">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}

/** Standard page padding/width wrapper. */
export function PageContainer({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={wide ? "px-4 py-6 md:px-6" : "mx-auto max-w-[1600px] px-4 py-6 md:px-6"}>{children}</div>;
}
