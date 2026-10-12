export { generateMetadata } from "../products/render.tsx";
import { renderProductsPage } from "../products/render.tsx";

export default function ProductsPage({ searchParams }: Readonly<{ searchParams: Promise<Readonly<Record<string,string | string[] | undefined>>> }>) {
  return renderProductsPage("localized",searchParams);
}
