export { generateMetadata } from "../products/page.tsx";
import { renderProductsPage } from "../products/page.tsx";

export default function ProductsPage({ searchParams }: Readonly<{ searchParams: Promise<Readonly<Record<string,string | string[] | undefined>>> }>) {
  return renderProductsPage("localized",searchParams);
}
