import { Suspense } from "react";
import { MaintenanceView } from "@/features/maintenance/maintenance-view";

export const metadata = { title: "Maintenance" };

export default function Page() {
  return (
    <Suspense>
      <MaintenanceView />
    </Suspense>
  );
}
