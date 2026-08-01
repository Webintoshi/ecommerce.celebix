export type PublicImageMediaType = "image/jpeg" | "image/png" | "image/webp";

export type PublicStorefrontAsset = Readonly<{
  url: string;
  mediaType: PublicImageMediaType;
  altText: string;
  width: number;
  height: number;
}>;

export type StarterThemeColorScheme = "neutral" | "warm" | "dark" | "ocean";
export type StarterThemeHeadingStyle = "serif" | "sans";
export type StarterThemeProductCardStyle = "editorial" | "compact";
export type StarterThemeProductImageRatio = "portrait" | "square";

export type StarterThemeVisual = Readonly<{
  colorScheme: StarterThemeColorScheme;
  headingStyle: StarterThemeHeadingStyle;
  cornerStyle: "square" | "soft";
  headerStyle: "overlay" | "solid";
  productCardStyle: StarterThemeProductCardStyle;
  productImageRatio: StarterThemeProductImageRatio;
}>;

export type StarterHeroSlideConfig = Readonly<{
  eyebrow?: string;
  heading: string;
  body?: string;
  desktopAssetId: string;
  mobileAssetId?: string;
  destination: string;
  productId?: string;
}>;

export type StarterCampaignPanelConfig = Readonly<{
  eyebrow?: string;
  heading: string;
  body?: string;
  assetId: string;
  destination: string;
}>;

export type StarterThemeSectionConfig =
  | Readonly<{ kind: "hero"; enabled: boolean; slides: readonly StarterHeroSlideConfig[] }>
  | Readonly<{ kind: "category_grid"; enabled: boolean; heading: string; categoryIds: readonly string[] }>
  | Readonly<{ kind: "product_row"; enabled: boolean; heading: string; source: "latest" | "sale" | "category"; categoryId?: string; limit: 4 | 8 | 12 }>
  | Readonly<{ kind: "split_campaign"; enabled: boolean; panels: readonly StarterCampaignPanelConfig[] }>
  | Readonly<{ kind: "brand_story"; enabled: boolean; eyebrow?: string; heading: string; body: string; assetId?: string; destination?: string }>;

export type StarterThemeCompositionConfig = Readonly<{
  schemaVersion: 1;
  visual: StarterThemeVisual;
  announcement: Readonly<{ enabled: boolean; items: readonly string[]; destination?: string }>;
  navigation: Readonly<{ rootCategoryIds: readonly string[]; featuredCategoryId?: string; featuredAssetId?: string }>;
  sections: readonly StarterThemeSectionConfig[];
  productDetail: Readonly<{ galleryStyle: "grid" | "rail"; showSku: boolean; showBrand: boolean; showRelatedProducts: boolean; mobileStickyPurchase: boolean }>;
  cart: Readonly<{ showCheckoutReadiness: boolean; showShippingProgress: boolean; trustMessage?: string }>;
}>;

export type PublicStarterNavigationItem = Readonly<{
  name: string;
  slug: string;
  children: readonly PublicStarterNavigationItem[];
  featured?: Readonly<{ name: string; slug: string; image: PublicStorefrontAsset }>;
}>;

export type PublicStarterNavigation = Readonly<{ items: readonly PublicStarterNavigationItem[] }>;

export type PublicStarterHomeSection =
  | Readonly<{ kind: "hero"; slides: readonly Readonly<{ eyebrow?: string; heading: string; body?: string; desktopImage?: PublicStorefrontAsset; mobileImage?: PublicStorefrontAsset; destination: string; hotspot?: Readonly<{ productSlug: string; title: string; priceCents: number; currency: "TRY" }> }>[] }>
  | Readonly<{ kind: "category_grid"; heading: string; items: readonly Readonly<{ name: string; slug: string; image: PublicStorefrontAsset }>[] }>
  | Readonly<{ kind: "product_row"; key: string; heading: string; source: "latest" | "sale" | "category"; categorySlug?: string; limit: 4 | 8 | 12 }>
  | Readonly<{ kind: "split_campaign"; panels: readonly Readonly<{ eyebrow?: string; heading: string; body?: string; image: PublicStorefrontAsset; destination: string }>[] }>
  | Readonly<{ kind: "brand_story"; eyebrow?: string; heading: string; body: string; image?: PublicStorefrontAsset; destination?: string }>;

export type PublicStarterThemePresentationV1 = Readonly<{
  schemaVersion: 1;
  displayName: string;
  supportEmail?: string;
  logo?: PublicStorefrontAsset;
  theme: Readonly<{
    colorScheme: StarterThemeColorScheme;
    headingStyle: StarterThemeHeadingStyle;
    productCardStyle: StarterThemeProductCardStyle;
    productImageRatio: StarterThemeProductImageRatio;
    homeProductLimit: 4 | 8 | 12;
    showBrandStory: boolean;
  }>;
  hero: Readonly<{
    enabled: boolean;
    headline: string;
    body: string;
    destination: string;
    image?: PublicStorefrontAsset;
  }>;
  promotion?: Readonly<{
    headline: string;
    body?: string;
    destination: string;
  }>;
  marquee?: Readonly<{
    items: readonly string[];
    icon: "none" | "sparkle" | "truck" | "shield";
    speed: "slow" | "normal" | "fast";
    direction: "left" | "right";
    animation: "continuous" | "step";
  }>;
  categoryShowcase?: Readonly<{
    heading: string;
    items: readonly Readonly<{
      id: string;
      name: string;
      slug: string;
      image: PublicStorefrontAsset;
    }>[];
  }>;
  seo: Readonly<{
    title?: string;
    description?: string;
    allowIndex: boolean;
    socialImage?: PublicStorefrontAsset;
  }>;
}>;

export type PublicStarterThemePresentationV2 = Readonly<{
  schemaVersion: 2;
  displayName: string;
  supportEmail?: string;
  logo?: PublicStorefrontAsset;
  theme: PublicStarterThemePresentationV1["theme"];
  hero: PublicStarterThemePresentationV1["hero"];
  promotion?: NonNullable<PublicStarterThemePresentationV1["promotion"]>;
  marquee?: NonNullable<PublicStarterThemePresentationV1["marquee"]>;
  categoryShowcase?: NonNullable<PublicStarterThemePresentationV1["categoryShowcase"]>;
  visual: StarterThemeVisual;
  announcement?: Readonly<{ items: readonly string[]; destination?: string }>;
  navigation: PublicStarterNavigation;
  sections: readonly PublicStarterHomeSection[];
  productDetail: Readonly<{ galleryStyle: "grid" | "rail"; showSku: boolean; showBrand: boolean; showRelatedProducts: boolean; mobileStickyPurchase: boolean }>;
  cart: Readonly<{ showCheckoutReadiness: boolean; showShippingProgress: boolean; trustMessage?: string }>;
  seo: PublicStarterThemePresentationV1["seo"];
}>;

export type PublicStarterThemePresentation = PublicStarterThemePresentationV1 | PublicStarterThemePresentationV2;

export type PublicStorefront = Readonly<{
  schemaVersion: 2;
  id: string;
  name: string;
  slug: string;
  hostname: string;
  primaryHostname: string;
  canonicalUrl: string;
  currency: "TRY";
  locale: "tr";
  themeKey: string;
  presentation: PublicStarterThemePresentation;
}>;

export type PublicProductMedia = Readonly<{
  id: string;
  productId: string;
  variantId?: string;
  url: string;
  mediaType: PublicImageMediaType;
  altText: string;
  width?: number;
  height?: number;
  sortOrder: number;
}>;

export type PublicProductVariant = Readonly<{
  id: string;
  title: string;
  sku?: string;
  priceCents: number;
  compareAtCents?: number;
  stockTracking: boolean;
  stockQuantity: number;
  available: boolean;
  attributes: Readonly<Record<string, string>>;
}>;

export type PublicProduct = Readonly<{
  id: string;
  slug: string;
  title: string;
  description?: string;
  currency: "TRY";
  status: "active";
  priceCents: number;
  compareAtCents?: number;
  available: boolean;
  variants: readonly PublicProductVariant[];
  media: readonly PublicProductMedia[];
}>;

export type PublicProductList = Readonly<{ items: readonly PublicProduct[] }>;
