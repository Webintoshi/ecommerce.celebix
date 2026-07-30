import type { PublicStarterThemePresentation } from "./types.ts";

export type StarterThemeTokens = Readonly<{
  schemeClass: "theme-neutral" | "theme-warm" | "theme-dark" | "theme-ocean";
  headingClass: "heading-serif" | "heading-sans";
  cardClass: "cards-editorial" | "cards-compact";
  imageClass: "images-portrait" | "images-square";
}>;

export type StarterMarqueeTokens = Readonly<{
  iconSymbol: "" | "✦" | "🚚" | "✓";
  iconClass: "marquee-icon-none" | "marquee-icon-sparkle" | "marquee-icon-truck" | "marquee-icon-shield";
  speedClass: "marquee-speed-slow" | "marquee-speed-normal" | "marquee-speed-fast";
  directionClass: "marquee-direction-left" | "marquee-direction-right";
  animationClass: "marquee-animation-continuous" | "marquee-animation-step";
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

export function starterMarqueeTokens(
  marquee: NonNullable<PublicStarterThemePresentation["marquee"]>,
): StarterMarqueeTokens {
  const icons = Object.freeze({ none: "", sparkle: "✦", truck: "🚚", shield: "✓" } as const);
  return Object.freeze({
    iconSymbol: icons[marquee.icon],
    iconClass: `marquee-icon-${marquee.icon}`,
    speedClass: `marquee-speed-${marquee.speed}`,
    directionClass: `marquee-direction-${marquee.direction}`,
    animationClass: `marquee-animation-${marquee.animation}`,
  } as StarterMarqueeTokens);
}
