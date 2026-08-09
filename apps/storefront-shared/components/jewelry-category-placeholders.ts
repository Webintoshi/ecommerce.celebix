import type { PublicStarterHomeSection, PublicStarterNavigation } from "@celebix/saas-contracts";

export type JewelryCategoryPlaceholder = Readonly<{
  name: string;
  slug: string;
  label: `PLACEHOLDER ${number}`;
  destination: `/categories/${string}`;
}>;

export function deriveJewelryCategoryPlaceholders(
  navigation: PublicStarterNavigation,
  sections: readonly PublicStarterHomeSection[],
  requestedLimit = 4,
): readonly JewelryCategoryPlaceholder[] {
  if (sections.length === 0) return Object.freeze([]);
  const resolvedSlugs = new Set(
    sections.flatMap((section) => section.kind === "category_grid" ? section.items.map(({ slug }) => slug) : []),
  );
  const limit = Math.max(0, Math.min(4, Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 4));
  const items = navigation.items
    .filter(({ slug }) => !resolvedSlugs.has(slug))
    .slice(0, limit)
    .map(({ name, slug }, index) => Object.freeze({
      name,
      slug,
      label: `PLACEHOLDER ${index + 1}` as const,
      destination: `/categories/${slug}` as const,
    }));

  return Object.freeze(items);
}
