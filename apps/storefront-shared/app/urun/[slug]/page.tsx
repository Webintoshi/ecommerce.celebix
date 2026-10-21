import { withCommercePolicyPage } from "@/components/CommercePolicyServerPage";
export { generateMetadata } from "../../products/[slug]/render.tsx";
import { renderProductPage } from "../../products/[slug]/render.tsx";

function ProductPage({ params,searchParams }: { params: Promise<{ slug: string }>;searchParams:Promise<Record<string,string|string[]|undefined>> }) {
  return renderProductPage({ params,searchParams, routeVariant: "localized" });
}

export default withCommercePolicyPage(ProductPage);
