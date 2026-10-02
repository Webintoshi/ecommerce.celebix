import type { PublicStarterThemePresentation, PublicStarterNavigationItem, PublicStorefrontAsset } from "@celebix/saas-contracts";

export type GuzideMenuImages = Readonly<Record<string, PublicStorefrontAsset>>;

// Published navigation remains authoritative; category photography only decorates it.
export function buildGuzideMenuImages(presentation: Exclude<PublicStarterThemePresentation, { schemaVersion: 1 }>): GuzideMenuImages {
  const images: Record<string, PublicStorefrontAsset> = {};
  for (const section of presentation.sections) {
    if (section.kind !== "category_grid") continue;
    for (const item of section.items) {
      if (item.image && !images[item.slug]) images[item.slug] = item.image;
    }
  }
  for (const item of presentation.categoryShowcase?.items ?? []) {
    if (!images[item.slug]) images[item.slug] = item.image;
  }
  const visit = (items: readonly PublicStarterNavigationItem[]) => {
    for (const item of items) {
      if (!images[item.slug] && item.featured?.slug === item.slug) images[item.slug] = item.featured.image;
      visit(item.children);
    }
  };
  visit(presentation.navigation.items);
  return images;
}
