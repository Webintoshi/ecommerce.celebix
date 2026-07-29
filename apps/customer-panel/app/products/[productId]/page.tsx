import { ProductDetailConsole } from "@/components/catalog/ProductDetailConsole";

export default async function ProductDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  return <ProductDetailConsole productId={productId} />;
}
