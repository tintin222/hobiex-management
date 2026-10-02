import type { Metadata } from "next";
import { Suspense } from "react";
import { ShopFloorView } from "@/features/shop-floor/shop-floor-view";

export const metadata: Metadata = { title: "Shop floor" };

export default function Page() {
  return (
    <Suspense>
      <ShopFloorView />
    </Suspense>
  );
}
