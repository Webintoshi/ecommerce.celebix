export { generateMetadata } from "../../products/[slug]/page.tsx";
import { renderProductPage } from "../../products/[slug]/page.tsx";

export default function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  return renderProductPage({ params, routeVariant: "localized" });
}
