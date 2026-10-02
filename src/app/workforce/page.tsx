import { Suspense } from "react";
import { WorkforceView } from "@/features/workforce/workforce-view";

export const metadata = { title: "Workforce" };

export default function Page() {
  return (
    <Suspense>
      <WorkforceView />
    </Suspense>
  );
}
