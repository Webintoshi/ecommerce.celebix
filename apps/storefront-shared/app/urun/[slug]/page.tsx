export { generateMetadata } from "../../products/[slug]/render.tsx";
import { renderProductPage } from "../../products/[slug]/render.tsx";

export default function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  return renderProductPage({ params, routeVariant: "localized" });
}
