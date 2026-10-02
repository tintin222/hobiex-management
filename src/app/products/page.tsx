import { Suspense } from "react";
import { ProductsView } from "@/features/products/products-view";

export const metadata = { title: "Products & BOM" };

export default function Page() {
  return (
    <Suspense>
      <ProductsView />
    </Suspense>
  );
}
