import { parsePublicStarterThemePresentation } from "./validation.ts";
import type { PublicStarterHomeSectionV2, PublicStarterThemePresentation, PublicStarterThemePresentationV2, PublicStarterThemePresentationV3 } from "./types.ts";

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
): PublicStarterThemePresentationV3 {
  const theme = Object.freeze({
    colorScheme: "neutral" as const,
    headingStyle: "serif" as const,
    productCardStyle: "editorial" as const,
    productImageRatio: "portrait" as const,
    homeProductLimit: 8 as const,
    showBrandStory: false,
  });
  const hero = Object.freeze({
    enabled: true,
    headline: storefront.name,
    body: "Özenle seçilmiş ürünleri keşfedin.",
    destination: "/products",
  });
  return Object.freeze({
    schemaVersion: 3,
    displayName: storefront.name,
    theme,
    hero,
    visual: Object.freeze({ colorScheme: "neutral", headingStyle: "serif", cornerStyle: "soft", headerStyle: "overlay", productCardStyle: "editorial", productImageRatio: "portrait", headerWidth: "wide", sectionSpacing: "balanced" }),
    navigation: Object.freeze({ items: Object.freeze([]) }),
    sections: Object.freeze([
      Object.freeze({ kind: "hero", slides: Object.freeze([Object.freeze({ heading: storefront.name, body: "Özenle seçilmiş ürünleri keşfedin.", destination: "/products" })]) }),
      Object.freeze({ kind: "product_row", key: "latest-0", heading: "Yeni ürünler", source: "latest", limit: 8 }),
    ]),
    productDetail: Object.freeze({ galleryStyle: "rail", showSku: true, showBrand: true, showBreadcrumbs: true, showRelatedProducts: true, showApprovedReviews: true, mobileStickyPurchase: true, showSizeGuide: true, informationSections: Object.freeze(["description", "materials_and_care", "certifications", "shipping_and_returns"] as const) }),
    cart: Object.freeze({ showCheckoutReadiness: true, showShippingProgress: true }),
    footer: defaultRetailFooter(),
    seo: Object.freeze({ allowIndex: false }),
  });
}

function defaultRetailFooter(): PublicStarterThemePresentationV3["footer"] {
  return Object.freeze({
    tone: "dark",
    groups: Object.freeze([
      Object.freeze({ heading: "Mağaza", links: Object.freeze([Object.freeze({ label: "Ana Sayfa", destination: "/" }), Object.freeze({ label: "Tüm Ürünler", destination: "/products" }), Object.freeze({ label: "Favoriler", destination: "/favorites" })]) }),
      Object.freeze({ heading: "Politikalar", links: Object.freeze([Object.freeze({ label: "Gizlilik ve Güvenlik", destination: "/policies/privacy-security" }), Object.freeze({ label: "İade ve Değişim", destination: "/policies/returns-exchange" })]) }),
    ]),
    newsletter: Object.freeze({ enabled: false, heading: "Bültene katılın", body: "Yeni ürünleri ilk siz öğrenin.", consentLabel: "E-posta iletişimine izin veriyorum." }),
    social: Object.freeze([]),
  });
}

function adaptStarterPresentationV1ToV2(value: unknown): PublicStarterThemePresentationV2 {
  const legacy = parsePublicStarterThemePresentation(value);
  if (legacy.schemaVersion !== 1) throw new TypeError("storefront_contract_invalid");
  const sections: PublicStarterHomeSectionV2[] = [];
  if (legacy.hero.enabled) sections.push(Object.freeze({
    kind: "hero",
    slides: Object.freeze([Object.freeze({ heading: legacy.hero.headline, body: legacy.hero.body, ...(legacy.hero.image ? { desktopImage: legacy.hero.image } : {}), destination: legacy.hero.destination })]),
  }));
  if (legacy.categoryShowcase) sections.push(Object.freeze({ kind: "category_grid", heading: legacy.categoryShowcase.heading, items: Object.freeze(legacy.categoryShowcase.items.map((item) => Object.freeze({ name: item.name, slug: item.slug, image: item.image }))) }));
  sections.push(Object.freeze({ kind: "product_row", key: "latest-0", heading: "Yeni ürünler", source: "latest", limit: legacy.theme.homeProductLimit }));
  if (legacy.theme.showBrandStory) sections.push(Object.freeze({ kind: "brand_story", eyebrow: "Mağaza deneyimi", heading: "Özenle seçildi", body: `${legacy.displayName}, ürünlerini güvenli Celebix altyapısı üzerinden sunar.` }));
  return Object.freeze({
    schemaVersion: 2,
    displayName: legacy.displayName,
    ...(legacy.supportEmail ? { supportEmail: legacy.supportEmail } : {}),
    ...(legacy.logo ? { logo: legacy.logo } : {}),
    theme: legacy.theme,
    hero: legacy.hero,
    ...(legacy.promotion ? { promotion: legacy.promotion } : {}),
    ...(legacy.marquee ? { marquee: legacy.marquee, announcement: Object.freeze({ items: legacy.marquee.items }) } : {}),
    ...(legacy.categoryShowcase ? { categoryShowcase: legacy.categoryShowcase } : {}),
    visual: Object.freeze({ colorScheme: legacy.theme.colorScheme, headingStyle: legacy.theme.headingStyle, cornerStyle: "soft", headerStyle: "overlay", productCardStyle: legacy.theme.productCardStyle, productImageRatio: legacy.theme.productImageRatio }),
    navigation: Object.freeze({ items: Object.freeze((legacy.categoryShowcase?.items ?? []).map((item) => Object.freeze({ name: item.name, slug: item.slug, children: Object.freeze([]) }))) }),
    sections: Object.freeze(sections),
    productDetail: Object.freeze({ galleryStyle: "grid", showSku: true, showBrand: true, showRelatedProducts: true, mobileStickyPurchase: true }),
    cart: Object.freeze({ showCheckoutReadiness: true, showShippingProgress: true }),
    seo: legacy.seo,
  });
}

export function adaptStarterPresentationV2(value: unknown): PublicStarterThemePresentationV3 {
  const campaign = parsePublicStarterThemePresentation(value);
  if (campaign.schemaVersion !== 2) throw new TypeError("storefront_contract_invalid");
  return Object.freeze({
    schemaVersion: 3,
    displayName: campaign.displayName,
    ...(campaign.supportEmail ? { supportEmail: campaign.supportEmail } : {}),
    ...(campaign.logo ? { logo: campaign.logo } : {}),
    theme: campaign.theme,
    hero: campaign.hero,
    ...(campaign.promotion ? { promotion: campaign.promotion } : {}),
    ...(campaign.marquee ? { marquee: campaign.marquee } : {}),
    ...(campaign.categoryShowcase ? { categoryShowcase: campaign.categoryShowcase } : {}),
    visual: Object.freeze({ ...campaign.visual, headerWidth: "wide", sectionSpacing: "balanced" }),
    ...(campaign.announcement ? { announcement: campaign.announcement } : {}),
    navigation: campaign.navigation,
    sections: campaign.sections,
    productDetail: Object.freeze({ ...campaign.productDetail, showBreadcrumbs: true, showApprovedReviews: true, showSizeGuide: true, informationSections: Object.freeze(["description", "materials_and_care", "certifications", "shipping_and_returns"] as const) }),
    cart: campaign.cart,
    footer: defaultRetailFooter(),
    seo: campaign.seo,
  });
}

export function adaptStarterPresentationV1(value: unknown): PublicStarterThemePresentationV3 {
  return adaptStarterPresentationV2(adaptStarterPresentationV1ToV2(value));
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
