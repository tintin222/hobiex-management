import { Suspense } from "react";
import { TraceabilityView } from "@/features/traceability/traceability-view";

export const metadata = { title: "Traceability" };

export default function Page() {
  return (
    <Suspense>
      <TraceabilityView />
    </Suspense>
  );
}
