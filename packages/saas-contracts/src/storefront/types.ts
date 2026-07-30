export type PublicImageMediaType = "image/jpeg" | "image/png" | "image/webp";

export type PublicStorefrontAsset = Readonly<{
  url: string;
  mediaType: PublicImageMediaType;
  altText: string;
  width: number;
  height: number;
}>;

export type PublicStarterThemePresentation = Readonly<{
  schemaVersion: 1;
  displayName: string;
  supportEmail?: string;
  theme: Readonly<{
    colorScheme: "neutral" | "warm" | "dark" | "ocean";
    headingStyle: "serif" | "sans";
    productCardStyle: "editorial" | "compact";
    productImageRatio: "portrait" | "square";
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
  seo: Readonly<{
    title?: string;
    description?: string;
    allowIndex: boolean;
    socialImage?: PublicStorefrontAsset;
  }>;
}>;

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
