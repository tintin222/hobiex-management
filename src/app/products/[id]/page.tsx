import { ProductDetailView } from "@/features/products/product-detail-view";

export const metadata = { title: "Product details" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductDetailView id={decodeURIComponent(id)} />;
}
