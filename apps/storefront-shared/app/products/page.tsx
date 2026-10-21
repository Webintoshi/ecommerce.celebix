import { withCommercePolicyPage } from "@/components/CommercePolicyServerPage";
export { generateMetadata } from "./render.tsx";
import { renderProductsPage } from "./render.tsx";

function ProductsPage({ searchParams }: Readonly<{ searchParams: Promise<Readonly<Record<string,string | string[] | undefined>>> }>) {
  return renderProductsPage("legacy",searchParams);
}

export default withCommercePolicyPage(ProductsPage);
