export const PRODUCT_STATUSES = Object.freeze(["draft", "active", "archived"] as const);
export const VARIANT_STATUSES = Object.freeze(["active", "archived"] as const);

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type VariantStatus = (typeof VARIANT_STATUSES)[number];
export type ProductId = string;
export type ProductVariantId = string;

export interface Product {
  readonly id: ProductId;
  readonly storeId: string;
  readonly slug: string;
  readonly title: string;
  readonly description?: string;
  readonly status: ProductStatus;
  readonly currency: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface ProductVariant {
  readonly id: ProductVariantId;
  readonly productId: ProductId;
  readonly storeId: string;
  readonly title: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly priceCents: number;
  readonly compareAtCents?: number;
  readonly costCents?: number;
  readonly stockTracking: boolean;
  readonly stockQuantity: number;
  readonly status: VariantStatus;
  readonly attributes: Readonly<Record<string, string>>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}
