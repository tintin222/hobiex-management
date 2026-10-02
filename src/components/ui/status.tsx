"use client";

/**
 * Status badges. Every status is shown as icon + label + tone, never color
 * alone. Add new kinds to STATUS_STYLES rather than styling ad hoc.
 */
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Ban,
  CheckCircle2,
  ChevronsUp,
  CircleDashed,
  CircleDot,
  Clock,
  Eye,
  Flame,
  Loader,
  Minus,
  PackageCheck,
  PauseCircle,
  PlayCircle,
  Search,
  Settings2,
  ShieldCheck,
  Truck,
  Wrench,
  XCircle,
  Inbox,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";
import { useLabel, useTx } from "@/i18n";
import type { LabelKind } from "@/lib/data/labels";
import { Badge, type Tone } from "./primitives";

type Style = [Tone, LucideIcon];

export const STATUS_STYLES: Partial<Record<LabelKind, Record<string, Style>>> = {
  woStatus: {
    planned: ["neutral", CalendarClock],
    released: ["brand", CircleDot],
    in_progress: ["brand", Loader],
    on_hold: ["warn", PauseCircle],
    quality_check: ["serious", ShieldCheck],
    completed: ["good", CheckCircle2],
  },
  opStatus: {
    pending: ["neutral", CircleDashed],
    ready: ["brand", CircleDot],
    running: ["good", PlayCircle],
    paused: ["warn", PauseCircle],
    done: ["good", CheckCircle2],
  },
  machineStatus: {
    running: ["good", PlayCircle],
    idle: ["neutral", Minus],
    setup: ["brand", Settings2],
    down: ["critical", AlertOctagon],
    maintenance: ["warn", Wrench],
  },
  priority: {
    low: ["neutral", ArrowDown],
    normal: ["neutral", Minus],
    high: ["serious", ArrowUp],
    urgent: ["critical", ChevronsUp],
  },
  taskStatus: {
    todo: ["neutral", CircleDashed],
    in_progress: ["brand", Loader],
    blocked: ["critical", Ban],
    review: ["warn", Eye],
    done: ["good", CheckCircle2],
  },
  soStatus: {
    new: ["brand", Inbox],
    confirmed: ["neutral", CircleDot],
    in_production: ["brand", Loader],
    ready: ["warn", PackageCheck],
    shipped: ["serious", Truck],
    delivered: ["good", CheckCircle2],
  },
  inspectionResult: {
    pass: ["good", CheckCircle2],
    fail: ["critical", XCircle],
    conditional: ["warn", AlertTriangle],
  },
  ncrStatus: {
    open: ["critical", Flame],
    containment: ["serious", ShieldCheck],
    root_cause: ["warn", Search],
    corrective_action: ["brand", Wrench],
    verification: ["brand", Eye],
    closed: ["good", CheckCircle2],
  },
  maintStatus: {
    scheduled: ["neutral", Clock],
    in_progress: ["brand", Loader],
    waiting_parts: ["warn", PauseCircle],
    completed: ["good", CheckCircle2],
    overdue: ["critical", AlertTriangle],
  },
};

export function statusTone(kind: LabelKind, value: string): Tone {
  return STATUS_STYLES[kind]?.[value]?.[0] ?? "neutral";
}

export function StatusBadge<K extends LabelKind>({ kind, value, className }: { kind: K; value: string; className?: string }) {
  const label = useLabel();
  const [tone, Icon] = STATUS_STYLES[kind]?.[value] ?? (["neutral", CircleDot] as Style);
  return (
    <Badge tone={tone} icon={<Icon className="size-3.5" />} className={className}>
      {label(kind, value as never)}
    </Badge>
  );
}

export function PriorityBadge({ value, compact }: { value: string; compact?: boolean }) {
  const label = useLabel();
  const [tone, Icon] = STATUS_STYLES.priority![value] ?? STATUS_STYLES.priority!.normal;
  if (compact)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-ink-2" title={label("priority", value as never)}>
        <Icon className={`size-3.5 ${tone === "critical" ? "text-critical" : tone === "serious" ? "text-serious" : "text-ink-3"}`} />
        {label("priority", value as never)}
      </span>
    );
  return <StatusBadge kind="priority" value={value} />;
}

export function SeverityBadge({ value }: { value: "minor" | "major" | "critical" | "info" | "warning" }) {
  const map: Record<string, [Tone, LucideIcon, string, string]> = {
    minor: ["warn", AlertTriangle, "Minor", "Minör"],
    major: ["serious", AlertTriangle, "Major", "Majör"],
    critical: ["critical", AlertOctagon, "Critical", "Kritik"],
    info: ["brand", CircleDot, "Info", "Bilgi"],
    warning: ["warn", AlertTriangle, "Warning", "Uyarı"],
  };
  const tx = useTx();
  const [tone, Icon, en, tr] = map[value] ?? map.info;
  return (
    <Badge tone={tone} icon={<Icon className="size-3.5" />}>
      {tx(en, tr)}
    </Badge>
  );
}
