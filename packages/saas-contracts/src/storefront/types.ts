export type PublicImageMediaType = "image/jpeg" | "image/png" | "image/webp";

export type PublicStorefront = Readonly<{
  schemaVersion: 1;
  id: string;
  name: string;
  slug: string;
  hostname: string;
  primaryHostname: string;
  canonicalUrl: string;
  currency: "TRY";
  locale: "tr";
  themeKey: string;
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
