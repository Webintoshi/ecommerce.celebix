import { withCommercePolicyPage } from "@/components/CommercePolicyServerPage";
export { generateMetadata } from "./render.tsx";
import { renderProductPage } from "./render.tsx";

function ProductPage({ params,searchParams }: { params: Promise<{ slug: string }>;searchParams:Promise<Record<string,string|string[]|undefined>> }) {
  return renderProductPage({ params,searchParams, routeVariant: "legacy" });
}

export default withCommercePolicyPage(ProductPage);
