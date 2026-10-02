import { Suspense } from "react";
import { InventoryView } from "@/features/inventory/inventory-view";

export const metadata = { title: "Inventory" };

export default function Page() {
  return (
    <Suspense>
      <InventoryView />
    </Suspense>
  );
}
