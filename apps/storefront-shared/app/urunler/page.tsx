export { generateMetadata } from "../products/page.tsx";
import { renderProductsPage } from "../products/page.tsx";

export default function ProductsPage() {
  return renderProductsPage("localized");
}
