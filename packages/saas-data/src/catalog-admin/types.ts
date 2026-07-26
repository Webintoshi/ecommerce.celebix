import type {
  CatalogAdminImportJob,
  CatalogAdminJson,
  CatalogAdminMutationResult,
  CatalogAdminResource,
  CatalogAdminResourceKind,
  ProductReview,
  ProductReviewStatus,
  TenantContext,
} from "@celebix/saas-contracts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export interface CatalogAdminAuthorityInput { readonly tenantContext: TenantContext; readonly now: Date }
export interface ListCatalogAdminResourcesInput extends CatalogAdminAuthorityInput { readonly kind: CatalogAdminResourceKind }
export interface SaveCatalogAdminResourceInput extends ListCatalogAdminResourcesInput {
  readonly operationId: string;
  readonly resourceId?: string;
  readonly expectedVersion?: number;
  readonly name: string;
  readonly slug: string;
  readonly description?: string;
  readonly config: Readonly<Record<string, CatalogAdminJson>>;
  readonly productIds: readonly string[];
}
export interface ArchiveCatalogAdminResourceInput extends CatalogAdminAuthorityInput { readonly operationId: string; readonly resourceId: string; readonly expectedVersion: number }
export interface ListProductReviewsInput extends CatalogAdminAuthorityInput { readonly status?: ProductReviewStatus }
export interface ModerateProductReviewInput extends CatalogAdminAuthorityInput { readonly operationId: string; readonly reviewId: string; readonly expectedVersion: number; readonly status: Exclude<ProductReviewStatus, "pending">; readonly reply?: string }
export interface CatalogAdminImportRow { readonly title: string; readonly slug: string; readonly priceCents: number; readonly sku?: string; readonly stockQuantity: number }
export interface ImportCatalogProductsInput extends CatalogAdminAuthorityInput { readonly operationId: string; readonly fileName: string; readonly rows: readonly CatalogAdminImportRow[] }
export interface CatalogAdminImportVariant {
  readonly title: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly priceCents: number;
  readonly compareAtCents?: number;
  readonly costCents?: number;
  readonly stockQuantity: number;
  readonly attributes: Readonly<Record<string, string>>;
}
export interface CatalogAdminImportProduct {
  readonly title: string;
  readonly slug: string;
  readonly description?: string;
  readonly status: "draft" | "active";
  readonly variants: readonly CatalogAdminImportVariant[];
}
export interface ImportCatalogProductsV2Input extends CatalogAdminAuthorityInput { readonly operationId: string; readonly fileName: string; readonly products: readonly CatalogAdminImportProduct[] }
export interface CatalogAdminRepository {
  listResources(input: ListCatalogAdminResourcesInput): Promise<readonly CatalogAdminResource[]>;
  saveResource(input: SaveCatalogAdminResourceInput): Promise<CatalogAdminMutationResult>;
  archiveResource(input: ArchiveCatalogAdminResourceInput): Promise<CatalogAdminMutationResult>;
  listReviews(input: ListProductReviewsInput): Promise<readonly ProductReview[]>;
  moderateReview(input: ModerateProductReviewInput): Promise<CatalogAdminMutationResult>;
  listImports(input: CatalogAdminAuthorityInput): Promise<readonly CatalogAdminImportJob[]>;
  importProducts(input: ImportCatalogProductsInput): Promise<CatalogAdminMutationResult>;
  importProductsV2(input: ImportCatalogProductsV2Input): Promise<CatalogAdminMutationResult>;
  authorizeFeedPreview(input: CatalogAdminAuthorityInput): Promise<void>;
}
export interface PostgresCatalogAdminRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly uuid: () => string;
  readonly audit: (event: Readonly<{ type: "catalog_admin_commit_unknown" }>) => void | Promise<void>;
}
