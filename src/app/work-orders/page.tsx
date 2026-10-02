import { Suspense } from "react";
import { WorkOrdersView } from "@/features/work-orders/work-orders-view";

export const metadata = { title: "Work orders" };

export default function Page() {
  return (
    <Suspense>
      <WorkOrdersView />
    </Suspense>
  );
}
