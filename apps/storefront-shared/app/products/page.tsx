export { generateMetadata } from "./render.tsx";
import { renderProductsPage } from "./render.tsx";

export default function ProductsPage({ searchParams }: Readonly<{ searchParams: Promise<Readonly<Record<string,string | string[] | undefined>>> }>) {
  return renderProductsPage("legacy",searchParams);
}
