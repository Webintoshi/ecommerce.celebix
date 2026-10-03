import type { Metadata } from "next";

import {
  generateCategoryMetadata,
  renderCategoryPage,
} from "../../categories/[slug]/render-category-page.tsx";

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return generateCategoryMetadata({ params });
}

export default function CategoryPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>> }) {
  return renderCategoryPage({ params, searchParams, routeVariant: "localized" });
}
