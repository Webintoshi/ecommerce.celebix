import type {
  CatalogAdminImportJob,
  CatalogAdminImportRow,
  CatalogAdminJson,
  CatalogAdminMutationResult,
  CatalogAdminResource,
  CatalogAdminResourceKind,
  CatalogImportFormat,
  CatalogImportPreview,
  ProductReview,
  ProductReviewStatus,
  TenantContext,
} from "@celebix/saas-contracts";
export type { CatalogAdminImportRow } from "@celebix/saas-contracts";
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
export interface ImportCatalogProductsInput extends CatalogAdminAuthorityInput { readonly operationId: string; readonly fileName: string; readonly rows: readonly CatalogAdminImportRow[] }
export interface PrepareCatalogImportPreviewInput extends CatalogAdminAuthorityInput {
  readonly operationId: string;
  readonly previewId: string;
  readonly format: CatalogImportFormat;
  readonly fileName: string;
  readonly digest: string;
  readonly rows: readonly CatalogAdminImportRow[];
}
export interface GetCatalogImportPreviewInput extends CatalogAdminAuthorityInput { readonly previewId: string }
export interface CommitCatalogImportPreviewInput extends CatalogAdminAuthorityInput {
  readonly operationId: string;
  readonly previewId: string;
  readonly expectedVersion: number;
}
export interface CatalogAdminRepository {
  listResources(input: ListCatalogAdminResourcesInput): Promise<readonly CatalogAdminResource[]>;
  saveResource(input: SaveCatalogAdminResourceInput): Promise<CatalogAdminMutationResult>;
  archiveResource(input: ArchiveCatalogAdminResourceInput): Promise<CatalogAdminMutationResult>;
  listReviews(input: ListProductReviewsInput): Promise<readonly ProductReview[]>;
  moderateReview(input: ModerateProductReviewInput): Promise<CatalogAdminMutationResult>;
  listImports(input: CatalogAdminAuthorityInput): Promise<readonly CatalogAdminImportJob[]>;
  importProducts(input: ImportCatalogProductsInput): Promise<CatalogAdminMutationResult>;
  prepareImport(input: PrepareCatalogImportPreviewInput): Promise<CatalogImportPreview>;
  getImportPreview(input: GetCatalogImportPreviewInput): Promise<CatalogImportPreview>;
  commitImportPreview(input: CommitCatalogImportPreviewInput): Promise<CatalogAdminMutationResult>;
}
export interface PostgresCatalogAdminRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly uuid: () => string;
  readonly audit: (event: Readonly<{ type: "catalog_admin_commit_unknown" }>) => void | Promise<void>;
}
