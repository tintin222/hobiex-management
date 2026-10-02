"use client";

import { CircleCheck, HeartPulse, Moon, Plane, type LucideIcon } from "lucide-react";
import { useT } from "@/i18n";
import type { Employee } from "@/lib/data/types";
import { Badge, type Tone } from "@/components/ui";
import { messages } from "./messages";

const STYLES: Record<Employee["status"], [Tone, LucideIcon]> = {
  on_shift: ["good", CircleCheck],
  off_shift: ["neutral", Moon],
  leave: ["brand", Plane],
  sick: ["warn", HeartPulse],
};

export const EMPLOYEE_STATUSES = Object.keys(STYLES) as Employee["status"][];

/** Attendance status: icon + label + tone. */
export function EmployeeStatusBadge({ status, className }: { status: Employee["status"]; className?: string }) {
  const t = useT(messages);
  const [tone, Icon] = STYLES[status];
  return (
    <Badge tone={tone} icon={<Icon className="size-3.5" />} className={className}>
      {t(`status.${status}`)}
    </Badge>
  );
}

/** Efficiency → tone: ≥ 100 % good, ≥ 90 % brand, else warn. */
export function efficiencyTone(x: number): Tone {
  return x >= 1 ? "good" : x >= 0.9 ? "brand" : "warn";
}
