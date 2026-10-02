import type { Metadata, Viewport } from "next";
import "@fontsource-variable/outfit";
import "@fontsource-variable/space-grotesk";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: { default: "Hobiex Production", template: "%s · Hobiex Production" },
  description: "Production management system for Hobiex — demo with synthetic data.",
};

export const viewport: Viewport = {
  themeColor: "#0b1220",
};

// Apply the stored theme before first paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem("hobiex.theme");if(t){document.documentElement.dataset.theme=t}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
