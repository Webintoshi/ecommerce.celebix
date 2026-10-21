import { withCommercePolicyPage } from "@/components/CommercePolicyServerPage";
export { generateMetadata } from "../products/render.tsx";
import { renderProductsPage } from "../products/render.tsx";

function ProductsPage({ searchParams }: Readonly<{ searchParams: Promise<Readonly<Record<string,string | string[] | undefined>>> }>) {
  return renderProductsPage("localized",searchParams);
}

export default withCommercePolicyPage(ProductsPage);
