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
export type StarterThemeHeaderLayout = "menu_logo_actions" | "logo_menu_actions" | "stacked";
export type CategoryShowcaseLayout = "duo" | "grid";

export type StarterThemeVisual = Readonly<{
  colorScheme: StarterThemeColorScheme;
  headingStyle: StarterThemeHeadingStyle;
  cornerStyle: "square" | "soft";
  headerStyle: "overlay" | "solid";
  productCardStyle: StarterThemeProductCardStyle;
  productImageRatio: StarterThemeProductImageRatio;
}>;

export type StarterThemeVisualV2 = Readonly<StarterThemeVisual & {
  headerWidth: "contained" | "wide";
  headerLayout: StarterThemeHeaderLayout;
  sectionSpacing: "compact" | "balanced" | "airy";
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

export type StarterValueIcon = "sparkles" | "cotton" | "heart" | "shield" | "truck" | "return";
export type StarterThemeSectionConfigV2 =
  | Exclude<StarterThemeSectionConfig, Readonly<{ kind: "category_grid" }>>
  | Readonly<{ kind: "category_grid"; enabled: boolean; heading: string; categoryIds: readonly string[]; layout: CategoryShowcaseLayout }>
  | Readonly<{ kind: "value_propositions"; enabled: boolean; items: readonly Readonly<{ icon: StarterValueIcon; heading: string; body: string }>[] }>
  | Readonly<{ kind: "testimonials"; enabled: boolean; heading: string; source: "approved_product_reviews"; limit: 3 | 6 | 9; minimumRating: 4 | 5 }>;

export type HomepageSectionId = `home_${string}`;
type WithHomepageSectionId<T> = T extends object ? Readonly<T & { sectionId: HomepageSectionId }> : never;
export type StarterThemeSectionConfigV3 = WithHomepageSectionId<StarterThemeSectionConfigV2>;

export type StarterFixedPolicyKey = "privacy_security" | "distance_sales" | "kvkk" | "payment_delivery" | "cookie_usage" | "returns_exchange" | "membership";
export type StarterFooterLinkConfig =
  | Readonly<{ kind: "fixed_policy"; policyKey: StarterFixedPolicyKey }>
  | Readonly<{ kind: "category"; categoryId: string }>
  | Readonly<{ kind: "page"; pageId: string }>
  | Readonly<{ kind: "system"; destination: "/" | "/products" | "/favorites" | "/account" }>;
export type StarterSocialNetwork = "instagram" | "facebook" | "youtube" | "pinterest" | "tiktok" | "x";
export type StarterFooterConfig = Readonly<{
  tone: "light" | "dark";
  groups: readonly Readonly<{ heading: string; links: readonly StarterFooterLinkConfig[] }>[];
  newsletter: Readonly<{ enabled: boolean; heading: string; body: string; consentLabel: string }>;
  social: readonly Readonly<{ network: StarterSocialNetwork; url: string }>[];
}>;

export type StarterProductInformationSection = "description" | "materials_and_care" | "certifications" | "shipping_and_returns";
export type StarterProductDetailConfigV2 = Readonly<{
  galleryStyle: "grid" | "rail";
  showSku: boolean;
  showBrand: boolean;
  showBreadcrumbs: boolean;
  showRelatedProducts: boolean;
  showApprovedReviews: boolean;
  mobileStickyPurchase: boolean;
  showSizeGuide: boolean;
  informationSections: readonly StarterProductInformationSection[];
}>;

export type StarterCartConfig = Readonly<{
  showCheckoutReadiness: boolean;
  showShippingProgress: boolean;
  trustMessage?: string;
}>;

export type StarterCartConfigV2 = Readonly<StarterCartConfig & {
  showQuantitySelector: boolean;
}>;

export type StarterThemeCompositionConfig = Readonly<{
  schemaVersion: 1;
  visual: StarterThemeVisual;
  announcement: Readonly<{ enabled: boolean; items: readonly string[]; destination?: string }>;
  navigation: Readonly<{ rootCategoryIds: readonly string[]; featuredCategoryId?: string; featuredAssetId?: string }>;
  sections: readonly StarterThemeSectionConfig[];
  productDetail: Readonly<{ galleryStyle: "grid" | "rail"; showSku: boolean; showBrand: boolean; showRelatedProducts: boolean; mobileStickyPurchase: boolean }>;
  cart: StarterCartConfig;
}>;

export type StarterThemeCompositionConfigV2 = Readonly<{
  schemaVersion: 2;
  visual: StarterThemeVisualV2;
  announcement: StarterThemeCompositionConfig["announcement"];
  navigation: StarterThemeCompositionConfig["navigation"];
  sections: readonly StarterThemeSectionConfigV2[];
  productDetail: StarterProductDetailConfigV2;
  cart: StarterCartConfigV2;
  footer: StarterFooterConfig;
}>;

export type StarterThemeCompositionConfigV3 = Readonly<{
  schemaVersion: 3;
  visual: StarterThemeVisualV2;
  announcement: StarterThemeCompositionConfig["announcement"];
  navigation: StarterThemeCompositionConfig["navigation"];
  sections: readonly StarterThemeSectionConfigV3[];
  productDetail: StarterProductDetailConfigV2;
  cart: StarterCartConfigV2;
  footer: StarterFooterConfig;
}>;

export type StarterThemeComposition = StarterThemeCompositionConfig | StarterThemeCompositionConfigV2 | StarterThemeCompositionConfigV3;

export type PublicStarterNavigationItem = Readonly<{
  name: string;
  slug: string;
  children: readonly PublicStarterNavigationItem[];
  featured?: Readonly<{ name: string; slug: string; image: PublicStorefrontAsset }>;
}>;

export type PublicStarterNavigation = Readonly<{ items: readonly PublicStarterNavigationItem[] }>;

export type PublicStarterHomeSectionV2 =
  | Readonly<{ kind: "hero"; slides: readonly Readonly<{ eyebrow?: string; heading: string; body?: string; desktopImage?: PublicStorefrontAsset; mobileImage?: PublicStorefrontAsset; destination: string; hotspot?: Readonly<{ productSlug: string; title: string; priceCents: number; currency: "TRY" }> }>[] }>
  | Readonly<{ kind: "category_grid"; heading: string; layout: CategoryShowcaseLayout; items: readonly Readonly<{ name: string; slug: string; image: PublicStorefrontAsset }>[] }>
  | Readonly<{ kind: "product_row"; key: string; heading: string; source: "latest" | "sale" | "category"; categorySlug?: string; limit: 4 | 8 | 12 }>
  | Readonly<{ kind: "split_campaign"; panels: readonly Readonly<{ eyebrow?: string; heading: string; body?: string; image: PublicStorefrontAsset; destination: string }>[] }>
  | Readonly<{ kind: "brand_story"; eyebrow?: string; heading: string; body: string; image?: PublicStorefrontAsset; destination?: string }>;

export type PublicStarterReview = Readonly<{
  reviewerName: string;
  rating: 1 | 2 | 3 | 4 | 5;
  title?: string;
  body: string;
  merchantReply?: string;
}>;

export type PublicStarterHomeSection =
  | PublicStarterHomeSectionV2
  | Readonly<{ kind: "value_propositions"; items: readonly Readonly<{ icon: StarterValueIcon; heading: string; body: string }>[] }>
  | Readonly<{ kind: "testimonials"; heading: string; items: readonly PublicStarterReview[] }>;

export type PublicStarterFooter = Readonly<{
  tone: "light" | "dark";
  groups: readonly Readonly<{ heading: string; links: readonly Readonly<{ label: string; destination: string }>[] }>[];
  newsletter: Readonly<{ enabled: boolean; heading: string; body: string; consentLabel: string }>;
  social: readonly Readonly<{ network: StarterSocialNetwork; url: string }>[];
}>;

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
    layout: CategoryShowcaseLayout;
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
  sections: readonly PublicStarterHomeSectionV2[];
  productDetail: Readonly<{ galleryStyle: "grid" | "rail"; showSku: boolean; showBrand: boolean; showRelatedProducts: boolean; mobileStickyPurchase: boolean }>;
  cart: StarterCartConfigV2;
  seo: PublicStarterThemePresentationV1["seo"];
}>;

export type PublicStarterThemePresentationV3 = Readonly<{
  schemaVersion: 3;
  displayName: string;
  supportEmail?: string;
  logo?: PublicStorefrontAsset;
  theme: PublicStarterThemePresentationV1["theme"];
  hero: PublicStarterThemePresentationV1["hero"];
  promotion?: NonNullable<PublicStarterThemePresentationV1["promotion"]>;
  marquee?: NonNullable<PublicStarterThemePresentationV1["marquee"]>;
  categoryShowcase?: NonNullable<PublicStarterThemePresentationV1["categoryShowcase"]>;
  visual: StarterThemeVisualV2;
  announcement?: Readonly<{ items: readonly string[]; destination?: string }>;
  navigation: PublicStarterNavigation;
  sections: readonly PublicStarterHomeSection[];
  productDetail: StarterProductDetailConfigV2;
  cart: StarterCartConfigV2;
  footer: PublicStarterFooter;
  seo: PublicStarterThemePresentationV1["seo"];
}>;

export type PublicStarterThemePresentation = PublicStarterThemePresentationV1 | PublicStarterThemePresentationV2 | PublicStarterThemePresentationV3;

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

export type PublicProductBrand = Readonly<{ name: string; slug: string }>;
export type PublicProductCategoryPathItem = Readonly<{ name: string; slug: string }>;
export type PublicProductMerchandising = Readonly<{
  highlights: readonly string[];
  materialsAndCare?: string;
  certifications: readonly string[];
  sizeGuide?: Readonly<{ heading: string; body: string }>;
}>;

export type PublicProduct = Readonly<{
  id: string;
  slug: string;
  title: string;
  description?: string;
  brand?: PublicProductBrand;
  categoryPath?: readonly PublicProductCategoryPathItem[];
  currency: "TRY";
  status: "active";
  priceCents: number;
  compareAtCents?: number;
  available: boolean;
  variants: readonly PublicProductVariant[];
  media: readonly PublicProductMedia[];
  merchandising?: PublicProductMerchandising;
  reviews?: readonly PublicStarterReview[];
}>;

export type PublicProductList = Readonly<{ items: readonly PublicProduct[] }>;
