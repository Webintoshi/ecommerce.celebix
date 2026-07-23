export const CATALOG_ADMIN_RESOURCE_KINDS = Object.freeze([
  "collection",
  "brand",
  "attribute",
  "extra",
  "definition",
] as const);
export type CatalogAdminResourceKind =
  (typeof CATALOG_ADMIN_RESOURCE_KINDS)[number];
export type CatalogAdminResourceStatus = "active" | "archived";
export type CatalogAdminJson =
  | null
  | boolean
  | number
  | string
  | readonly CatalogAdminJson[]
  | Readonly<{ [key: string]: CatalogAdminJson }>;

export interface CatalogAdminResource {
  readonly id: string;
  readonly kind: CatalogAdminResourceKind;
  readonly name: string;
  readonly slug: string;
  readonly description?: string;
  readonly config: Readonly<Record<string, CatalogAdminJson>>;
  readonly status: CatalogAdminResourceStatus;
  readonly productIds: readonly string[];
  readonly productCount: number;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const PRODUCT_REVIEW_STATUSES = Object.freeze([
  "pending",
  "approved",
  "rejected",
  "archived",
] as const);
export type ProductReviewStatus = (typeof PRODUCT_REVIEW_STATUSES)[number];
export interface ProductReview {
  readonly id: string;
  readonly productId: string;
  readonly productTitle: string;
  readonly reviewerName: string;
  readonly rating: number;
  readonly title?: string;
  readonly body: string;
  readonly status: ProductReviewStatus;
  readonly merchantReply?: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const CATALOG_IMPORT_STATUSES = Object.freeze([
  "processing",
  "completed",
  "failed",
] as const);
export type CatalogImportStatus = (typeof CATALOG_IMPORT_STATUSES)[number];
export interface CatalogAdminImportJob {
  readonly id: string;
  readonly fileName: string;
  readonly status: CatalogImportStatus;
  readonly totalRows: number;
  readonly succeededRows: number;
  readonly failedRows: number;
  readonly errorSummary?: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CatalogAdminImportRow {
  readonly title: string;
  readonly slug: string;
  readonly priceCents: number;
  readonly sku?: string;
  readonly stockQuantity: number;
}

export type CatalogImportFormat = "native_csv" | "shopify_csv";
export interface CatalogImportPreview {
  readonly id: string;
  readonly format: CatalogImportFormat;
  readonly fileName: string;
  readonly digest: string;
  readonly status: "prepared" | "consumed" | "expired";
  readonly rows: readonly CatalogAdminImportRow[];
  readonly totalRows: number;
  readonly version: number;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CatalogAdminMutationResult {
  readonly id: string;
  readonly version: number;
  readonly status: string;
  readonly updatedAt: string;
  readonly replayed: boolean;
}
