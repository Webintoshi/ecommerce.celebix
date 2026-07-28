import type { Product, ProductVariant } from "../catalog/types.ts";

export const CATALOG_ONBOARDING_PRODUCT_TYPES = Object.freeze(["physical", "digital"] as const);
export const CATALOG_ONBOARDING_RESOURCE_KINDS = Object.freeze([
  "collection", "brand", "tag", "attribute", "extra", "definition",
] as const);
export const CATALOG_ONBOARDING_CHANNEL_KINDS = Object.freeze(["storefront", "marketplace"] as const);
export const CATALOG_ONBOARDING_UNITS = Object.freeze([
  "piece", "g", "kg", "ml", "l", "cm", "m", "m2", "m3",
] as const);

export type CatalogOnboardingProductType = (typeof CATALOG_ONBOARDING_PRODUCT_TYPES)[number];
export type CatalogOnboardingResourceKind = (typeof CATALOG_ONBOARDING_RESOURCE_KINDS)[number];
export type CatalogOnboardingChannelKind = (typeof CATALOG_ONBOARDING_CHANNEL_KINDS)[number];
export type CatalogOnboardingUnit = (typeof CATALOG_ONBOARDING_UNITS)[number];

export interface CatalogOnboardingUnitPricing {
  readonly measuredQuantityMilli: number;
  readonly measuredUnit: CatalogOnboardingUnit;
  readonly baseQuantityMilli: number;
  readonly baseUnit: CatalogOnboardingUnit;
}

export interface CatalogOnboardingInventoryAllocation {
  readonly locationId: string;
  readonly quantity: number;
}

export interface CatalogOnboardingVariantIntent {
  readonly title: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly priceCents: number;
  readonly compareAtCents?: number;
  readonly costCents?: number;
  readonly stockTracking: boolean;
  readonly stockQuantity: number;
  readonly attributes: Readonly<Record<string, string>>;
  readonly continueSellingWhenOutOfStock: boolean;
  readonly unitPricing?: CatalogOnboardingUnitPricing;
  readonly shippingDesiMilli?: number;
  readonly hsCode?: string;
  readonly inventory: readonly CatalogOnboardingInventoryAllocation[];
}

export interface CatalogProductMerchandisingFields {
  readonly supplierName?: string;
  readonly googleProductCategoryId?: string;
  readonly seoTitle?: string;
  readonly seoDescription?: string;
  readonly minimumPurchaseQuantity: number;
  readonly maximumPurchaseQuantity?: number;
}

export interface CatalogOnboardingResourceIds {
  readonly brand?: string;
  readonly collections: readonly string[];
  readonly tags: readonly string[];
  readonly attributes: readonly string[];
  readonly extras: readonly string[];
  readonly definitions: readonly string[];
}

export interface CatalogQuickCreateIntent {
  readonly kind: "quick";
  readonly title: string;
  readonly priceCents: number;
  readonly publish: boolean;
  readonly stockQuantity?: number;
  readonly categoryId?: string;
}

export interface CatalogAdvancedCreateIntent {
  readonly kind: "advanced";
  readonly productType: CatalogOnboardingProductType;
  readonly title: string;
  readonly description?: string;
  readonly publish: boolean;
  readonly variants: readonly CatalogOnboardingVariantIntent[];
  readonly categoryIds: readonly string[];
  readonly resourceIds: CatalogOnboardingResourceIds;
  readonly channelIds: readonly string[];
  readonly profile: CatalogProductMerchandisingFields;
}

export type CatalogOnboardingIntent = CatalogQuickCreateIntent | CatalogAdvancedCreateIntent;

export interface CatalogOnboardingCategoryOption {
  readonly id: string;
  readonly parentId?: string;
  readonly name: string;
  readonly slug: string;
  readonly position: number;
}

export interface CatalogOnboardingResourceOption {
  readonly id: string;
  readonly kind: CatalogOnboardingResourceKind;
  readonly name: string;
}

export interface CatalogOnboardingLocationOption {
  readonly id: string;
  readonly name: string;
  readonly isDefault: boolean;
}

export interface CatalogOnboardingChannelOption {
  readonly id: string;
  readonly kind: CatalogOnboardingChannelKind;
  readonly name: string;
}

export interface CatalogOnboardingOptions {
  readonly categories: readonly CatalogOnboardingCategoryOption[];
  readonly resources: readonly CatalogOnboardingResourceOption[];
  readonly locations: readonly CatalogOnboardingLocationOption[];
  readonly channels: readonly CatalogOnboardingChannelOption[];
}

export interface CatalogProductMerchandisingProfile extends CatalogProductMerchandisingFields {
  readonly productType: CatalogOnboardingProductType;
  readonly version: number;
  readonly updatedAt: string;
}

export interface CatalogProductEditorVariant {
  readonly variant: ProductVariant;
  readonly continueSellingWhenOutOfStock: boolean;
  readonly unitPricing?: CatalogOnboardingUnitPricing;
  readonly shippingDesiMilli?: number;
  readonly hsCode?: string;
  readonly inventory: readonly CatalogOnboardingInventoryAllocation[];
}

export interface CatalogProductEditorProjection {
  readonly product: Product;
  readonly variants: readonly CatalogProductEditorVariant[];
  readonly profile: CatalogProductMerchandisingProfile;
  readonly categoryIds: readonly string[];
  readonly resourceIds: CatalogOnboardingResourceIds;
  readonly channelIds: readonly string[];
  readonly mediaCount: number;
}

export interface CatalogOnboardingResult {
  readonly product: Product;
  readonly variants: readonly ProductVariant[];
  readonly profile: CatalogProductMerchandisingProfile;
  readonly categoryIds: readonly string[];
  readonly resourceIds: CatalogOnboardingResourceIds;
  readonly channelIds: readonly string[];
  readonly mediaCount: number;
  readonly replayed: boolean;
}
