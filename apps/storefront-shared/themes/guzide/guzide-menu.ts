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
  // Approved theme artwork fills missing published photos without changing navigation.
  for (const item of presentation.navigation.items) {
    if (item.kind === "catalog_collection" || images[item.slug]) continue;
    if (!["kolyeler", "bileklikler", "yuzukler", "kupeler"].includes(item.slug)) continue;
    images[item.slug] = {
      url: `/themes/guzide/mobile-menu/${item.slug}.webp`,
      altText: item.name,
      width: 640,
      height: 854,
      mediaType: "image/webp",
    };
  }
  return images;
}
