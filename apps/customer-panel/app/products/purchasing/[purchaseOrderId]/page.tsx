import { notFound, redirect } from "next/navigation";

export default async function LegacyInventoryDetailPage({ params }: { params: Promise<{ purchaseOrderId: string }> }) {
  const { purchaseOrderId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(purchaseOrderId)) notFound();
  redirect(`/products/stock?tab=purchases&kind=purchase&id=${purchaseOrderId}`);
}
