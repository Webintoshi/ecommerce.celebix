import type { PublicStarterThemePresentation } from "./types.ts";

export type StarterThemeTokens = Readonly<{
  schemeClass: "theme-neutral" | "theme-warm" | "theme-dark" | "theme-ocean";
  headingClass: "heading-serif" | "heading-sans";
  cardClass: "cards-editorial" | "cards-compact";
  imageClass: "images-portrait" | "images-square";
}>;

export function buildDefaultStarterPresentation(
  storefront: Readonly<{ name: string }>,
): PublicStarterThemePresentation {
  return Object.freeze({
    schemaVersion: 1,
    displayName: storefront.name,
    theme: Object.freeze({
      colorScheme: "neutral",
      headingStyle: "serif",
      productCardStyle: "editorial",
      productImageRatio: "portrait",
      homeProductLimit: 8,
      showBrandStory: true,
    }),
    hero: Object.freeze({
      enabled: true,
      headline: storefront.name,
      body: "Özenle seçilmiş ürünleri keşfedin.",
      destination: "/products",
    }),
    seo: Object.freeze({ allowIndex: false }),
  });
}

export function starterThemeTokens(
  presentation: PublicStarterThemePresentation,
): StarterThemeTokens {
  return Object.freeze({
    schemeClass: `theme-${presentation.theme.colorScheme}`,
    headingClass: `heading-${presentation.theme.headingStyle}`,
    cardClass: `cards-${presentation.theme.productCardStyle}`,
    imageClass: `images-${presentation.theme.productImageRatio}`,
  } as StarterThemeTokens);
}
