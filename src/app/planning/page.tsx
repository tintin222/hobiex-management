import type { Metadata } from "next";
import { Suspense } from "react";
import { PlanningView } from "@/features/planning/planning-view";

export const metadata: Metadata = { title: "Planning" };

export default function Page() {
  return (
    <Suspense>
      <PlanningView />
    </Suspense>
  );
}
