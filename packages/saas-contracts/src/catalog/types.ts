export const PRODUCT_STATUSES = Object.freeze(["draft", "active", "archived"] as const);
export const VARIANT_STATUSES = Object.freeze(["active", "archived"] as const);
export const CATALOG_PRODUCT_STOCK_FILTERS = Object.freeze(["in-stock", "out-of-stock", "untracked"] as const);
export const CATALOG_PRODUCT_SORTS = Object.freeze(["updated-desc", "title-asc", "title-desc", "created-desc", "created-asc"] as const);

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type VariantStatus = (typeof VARIANT_STATUSES)[number];
export type CatalogProductStockFilter = (typeof CATALOG_PRODUCT_STOCK_FILTERS)[number];
export type CatalogProductSort = (typeof CATALOG_PRODUCT_SORTS)[number];
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

export type CatalogProductListVariantSummary = Readonly<{
  readonly variantId: ProductVariantId;
  readonly sku?: string;
  readonly priceCents: number;
  readonly compareAtCents?: number;
  readonly stockTracking: boolean;
  readonly stockQuantity: number;
}>;

export type CatalogProductListQuery = Readonly<{
  readonly search?: string;
  readonly status?: ProductStatus;
  readonly stock?: CatalogProductStockFilter;
  readonly categoryId?: string;
  readonly brandId?: string;
  readonly collectionId?: string;
  readonly sort: CatalogProductSort;
}>;

export type CatalogProductListQueryBinding = Readonly<{
  readonly version: 1;
  readonly search: string | null;
  readonly status: ProductStatus | null;
  readonly stock: CatalogProductStockFilter | null;
  readonly categoryId: string | null;
  readonly brandId: string | null;
  readonly collectionId: string | null;
  readonly sort: CatalogProductSort;
}>;
