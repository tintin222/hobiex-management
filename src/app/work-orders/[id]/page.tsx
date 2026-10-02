import { WorkOrderDetailView } from "@/features/work-orders/work-order-detail-view";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: decodeURIComponent(id) };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkOrderDetailView id={decodeURIComponent(id)} />;
}
