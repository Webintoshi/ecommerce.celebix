import type { Metadata } from "next";

import {
  generateCategoryMetadata,
  renderCategoryPage,
} from "./render-category-page.tsx";

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return generateCategoryMetadata({ params });
}

export default function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return renderCategoryPage({ params, routeVariant: "legacy" });
}
