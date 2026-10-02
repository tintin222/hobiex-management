import { Suspense } from "react";
import { OrdersView } from "@/features/orders/orders-view";

export const metadata = { title: "Sales orders" };

export default function Page() {
  return (
    <Suspense>
      <OrdersView />
    </Suspense>
  );
}
