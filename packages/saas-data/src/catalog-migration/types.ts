import type { TenantContext } from "@celebix/saas-contracts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export interface CatalogMigrationTaxonomy {
  readonly name: string;
  readonly slug: string;
}

export interface CatalogMigrationCategory extends CatalogMigrationTaxonomy {
  readonly parentSlug?: string;
}

export interface CatalogMigrationVariant {
  readonly title: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly priceCents: number;
  readonly compareAtCents?: number;
  readonly stockQuantity: number;
  readonly attributes: Readonly<Record<string, string>>;
}

export interface CatalogMigrationProduct {
  readonly sourceProductId: string;
  readonly title: string;
  readonly slug: string;
  readonly description?: string;
  readonly status: "draft" | "active";
  readonly categorySlugs: readonly string[];
  readonly brandSlugs: readonly string[];
  readonly variant: CatalogMigrationVariant;
  readonly sourceImageDigests: readonly string[];
}

export interface CatalogMigrationJob {
  readonly jobId: string;
  readonly sourceDigest: string;
  readonly status: "processing" | "media_processing" | "completed" | "completed_with_failures";
  readonly totalProducts: number;
  readonly importedProducts: number;
  readonly totalMedia: number;
  readonly committedMedia: number;
  readonly failedMedia: number;
  readonly categoryCount: number;
  readonly brandCount: number;
  readonly version: number;
  readonly updatedAt: string;
  readonly replayed: boolean;
}

export interface CatalogMigrationMapping {
  readonly sourceProductId: string;
  readonly productId: string;
}

export interface CatalogMigrationMediaAuthority {
  readonly jobId: string;
  readonly sourceProductId: string;
  readonly productId: string;
  readonly variantId: string;
  readonly ordinal: number;
  readonly sourceUrlDigest: string;
  readonly status: "pending" | "failed" | "committed";
  readonly committedMediaId?: string;
}

export interface CatalogMigrationBatchResult extends CatalogMigrationJob {
  readonly mappings: readonly CatalogMigrationMapping[];
}

export interface CatalogMigrationAuthorityInput {
  readonly tenantContext: TenantContext;
  readonly now: Date;
}

export interface BeginCatalogMigrationInput extends CatalogMigrationAuthorityInput {
  readonly operationId: string;
  readonly sourceDigest: string;
  readonly totalProducts: number;
  readonly totalMedia: number;
  readonly categories: readonly CatalogMigrationCategory[];
  readonly brands: readonly CatalogMigrationTaxonomy[];
}

export interface ImportCatalogMigrationBatchInput extends CatalogMigrationAuthorityInput {
  readonly operationId: string;
  readonly jobId: string;
  readonly sourceDigest: string;
  readonly products: readonly CatalogMigrationProduct[];
}

export interface GetCatalogMigrationInput extends CatalogMigrationAuthorityInput {
  readonly jobId: string;
}

export interface AuthorizeCatalogMigrationMediaInput extends GetCatalogMigrationInput {
  readonly sourceProductId: string;
  readonly ordinal: number;
  readonly sourceUrlDigest: string;
}

export interface RecordCatalogMigrationMediaInput extends AuthorizeCatalogMigrationMediaInput {
  readonly operationId: string;
  readonly outcome: "committed" | "failed";
  readonly mediaId?: string;
  readonly safeFailureCode?: string;
}

export interface CatalogMigrationRepository {
  begin(input: BeginCatalogMigrationInput): Promise<CatalogMigrationJob>;
  importBatch(input: ImportCatalogMigrationBatchInput): Promise<CatalogMigrationBatchResult>;
  get(input: GetCatalogMigrationInput): Promise<CatalogMigrationJob>;
  authorizeMedia(input: AuthorizeCatalogMigrationMediaInput): Promise<CatalogMigrationMediaAuthority>;
  recordMedia(input: RecordCatalogMigrationMediaInput): Promise<CatalogMigrationJob>;
}

export interface PostgresCatalogMigrationRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly uuid: () => string;
  readonly audit: (event: Readonly<{ type: "catalog_migration_commit_unknown" }>) => void | Promise<void>;
}
