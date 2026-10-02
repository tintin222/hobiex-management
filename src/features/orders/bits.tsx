"use client";

import { AlertOctagon, AlertTriangle, CheckCircle2, Globe, Mail, Network, UserRound, type LucideIcon } from "lucide-react";
import { useLabel, useT, useTx } from "@/i18n";
import { COUNTRIES } from "@/lib/data/catalog";
import type { Channel, Customer, WorkOrder } from "@/lib/data/types";
import { cn } from "@/lib/cn";
import { Badge, type Tone } from "@/components/ui";
import { SERIES } from "@/components/charts/theme";
import { messages } from "./messages";

export const CHANNELS: Channel[] = ["b2b_portal", "edi", "email", "sales_rep"];

export const CHANNEL_ICON: Record<Channel, LucideIcon> = { b2b_portal: Globe, edi: Network, email: Mail, sales_rep: UserRound };

/** Channels are categories — fixed categorical slots, never status colors. */
export const CHANNEL_COLOR: Record<Channel, string> = { b2b_portal: SERIES[0], edi: SERIES[1], email: SERIES[2], sales_rep: SERIES[3] };

export function ChannelBadge({ channel }: { channel: Channel }) {
  const label = useLabel();
  const Icon = CHANNEL_ICON[channel];
  return (
    <Badge tone={channel === "b2b_portal" ? "brand" : "neutral"} icon={<Icon className="size-3.5" />}>
      {label("channel", channel)}
    </Badge>
  );
}

export function flagOf(countryCode: string) {
  return COUNTRIES[countryCode]?.flag ?? "🏳️";
}

/** Flag + customer name with city / country below. */
export function CustomerCell({ customer, className }: { customer?: Customer; className?: string }) {
  const tx = useTx();
  if (!customer) return <span className="text-ink-3">—</span>;
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <span className="text-lg leading-none" aria-hidden>
        {flagOf(customer.countryCode)}
      </span>
      <span className="min-w-0">
        <span className="block max-w-64 truncate text-sm text-ink">{customer.name}</span>
        <span className="block truncate text-xs text-ink-3">
          {customer.city}, {tx(customer.country, customer.countryTr)}
        </span>
      </span>
    </span>
  );
}

const MAT_STYLE: Record<WorkOrder["materialStatus"], [Tone, LucideIcon, string]> = {
  available: ["good", CheckCircle2, "mat.available"],
  partial: ["warn", AlertTriangle, "mat.partial"],
  short: ["critical", AlertOctagon, "mat.short"],
};

export function MaterialStatusBadge({ value }: { value: WorkOrder["materialStatus"] }) {
  const t = useT(messages);
  const [tone, Icon, key] = MAT_STYLE[value];
  return (
    <Badge tone={tone} icon={<Icon className="size-3.5" />}>
      {t(key)}
    </Badge>
  );
}
