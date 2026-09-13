import { ProductDetailConsole } from "@/components/catalog/ProductDetailConsole";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { MODEL, PRODUCT_ID } from "../../mira-catalog/catalog-fixture";

export default async function ProductDetailFixturePage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  return <PanelLayoutClient model={MODEL}><ProductDetailConsole productId={productId === "fixture" ? PRODUCT_ID : productId} canManage canArchive /></PanelLayoutClient>;
}
