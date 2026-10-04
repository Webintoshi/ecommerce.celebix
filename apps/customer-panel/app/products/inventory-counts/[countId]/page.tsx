import { notFound, redirect } from "next/navigation";

export default async function LegacyInventoryDetailPage({ params }: { params: Promise<{ countId: string }> }) {
  const { countId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(countId)) notFound();
  redirect(`/products/stock?tab=counts&kind=count&id=${countId}`);
}
