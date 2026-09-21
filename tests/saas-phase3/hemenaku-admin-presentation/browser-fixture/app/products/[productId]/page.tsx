import { ProductDetailConsole } from "@/components/catalog/ProductDetailConsole";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { MODEL } from "../../mira-catalog/catalog-fixture";

const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";

export default async function ProductDetailFixturePage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  return <PanelLayoutClient model={MODEL}><ProductDetailConsole productId={productId === "fixture" ? PRODUCT_ID : productId} canManage canArchive /></PanelLayoutClient>;
}
