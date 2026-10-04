import { notFound, redirect } from "next/navigation";

export default async function LegacyInventoryDetailPage({ params }: { params: Promise<{ transferId: string }> }) {
  const { transferId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(transferId)) notFound();
  redirect(`/products/stock?tab=transfers&kind=transfer&id=${transferId}`);
}
