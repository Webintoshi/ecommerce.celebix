export { generateMetadata } from "../../categories/[slug]/page.tsx";
import { renderCategoryPage } from "../../categories/[slug]/page.tsx";

export default function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  return renderCategoryPage({ params, routeVariant: "localized" });
}
