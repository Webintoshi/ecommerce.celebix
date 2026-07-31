import type {
  Product,
  ProductStatus,
  ProductVariant,
  TenantContext,
} from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export interface CatalogProductFields {
  readonly slug: string;
  readonly title: string;
  readonly description?: string;
  readonly status: Exclude<ProductStatus, "archived">;
  readonly currency: string;
}

export interface CatalogVariantFields {
  readonly title: string;
  readonly sku?: string;
  readonly barcode?: string;
  readonly priceCents: number;
  readonly compareAtCents?: number;
  readonly costCents?: number;
  readonly stockTracking: boolean;
  readonly stockQuantity: number;
  readonly attributes: Readonly<Record<string, string>>;
}

export interface CatalogAuthorityInput {
  readonly tenantContext: TenantContext;
  readonly now: Date;
}

export interface CreateProductInput extends CatalogAuthorityInput {
  readonly operationId: string;
  readonly product: CatalogProductFields;
  readonly initialVariant: CatalogVariantFields;
}

export interface GetProductInput extends CatalogAuthorityInput {
  readonly productId: string;
}

export interface GetProductDetailsInput extends CatalogAuthorityInput {
  readonly productId: string;
  readonly includeArchivedVariants?: boolean;
}

export interface GetCatalogDashboardSummaryInput extends CatalogAuthorityInput {}

export interface ListProductsInput extends CatalogAuthorityInput {
  readonly pageSize: number;
  readonly cursor?: string;
  readonly status?: ProductStatus;
}

export interface ListCatalogVariantChoicesInput extends CatalogAuthorityInput {}

export type CatalogVariantChoice = Readonly<{
  readonly productId: string;
  readonly productTitle: string;
  readonly variantId: string;
  readonly variantTitle: string;
  readonly sku?: string;
}>;

export interface UpdateProductInput extends CatalogAuthorityInput {
  readonly operationId: string;
  readonly productId: string;
  readonly expectedVersion: number;
  readonly product: CatalogProductFields;
}

export interface ArchiveProductInput extends CatalogAuthorityInput {
  readonly operationId: string;
  readonly productId: string;
  readonly expectedVersion: number;
}

export interface CreateVariantInput extends CatalogAuthorityInput {
  readonly operationId: string;
  readonly productId: string;
  readonly variant: CatalogVariantFields;
}

export interface UpdateVariantInput extends CatalogAuthorityInput {
  readonly operationId: string;
  readonly productId: string;
  readonly variantId: string;
  readonly expectedVersion: number;
  readonly variant: CatalogVariantFields;
}

export interface ArchiveVariantInput extends CatalogAuthorityInput {
  readonly operationId: string;
  readonly productId: string;
  readonly variantId: string;
  readonly expectedVersion: number;
}

export interface ProductMutationResult {
  readonly product: Product;
  readonly replayed: boolean;
}

export interface CreateProductResult extends ProductMutationResult {
  readonly initialVariant: ProductVariant;
}

export interface VariantMutationResult {
  readonly variant: ProductVariant;
  readonly replayed: boolean;
}

export type CatalogProductFeaturedImage = Readonly<{
  readonly publicUrl: string;
  readonly altText: string;
}>;

export interface ListProductsResult {
  readonly items: readonly Product[];
  readonly featuredImages?: Readonly<Record<string, CatalogProductFeaturedImage>>;
  readonly nextCursor?: string;
}

export interface ProductDetailsResult {
  readonly product: Product;
  readonly variants: readonly ProductVariant[];
}

export interface CatalogDashboardSummary {
  readonly totalProducts: number;
  readonly activeProducts: number;
  readonly draftProducts: number;
  readonly productLimit: number;
  readonly activeVariants: number;
  readonly outOfStockVariants: number;
  readonly productsWithoutMedia: number;
  readonly activeMedia: number;
}

export interface CatalogRepository {
  createProduct(input: CreateProductInput): Promise<CreateProductResult>;
  getDashboardSummary(input: GetCatalogDashboardSummaryInput): Promise<CatalogDashboardSummary>;
  getProduct(input: GetProductInput): Promise<Product>;
  getProductDetails(input: GetProductDetailsInput): Promise<ProductDetailsResult>;
  listProducts(input: ListProductsInput): Promise<ListProductsResult>;
  listVariantChoices(input: ListCatalogVariantChoicesInput): Promise<readonly CatalogVariantChoice[]>;
  updateProduct(input: UpdateProductInput): Promise<ProductMutationResult>;
  archiveProduct(input: ArchiveProductInput): Promise<ProductMutationResult>;
  createVariant(input: CreateVariantInput): Promise<VariantMutationResult>;
  updateVariant(input: UpdateVariantInput): Promise<VariantMutationResult>;
  archiveVariant(input: ArchiveVariantInput): Promise<VariantMutationResult>;
}

export interface CatalogAuditEvent {
  readonly type: "catalog_commit_unknown";
}

export interface PostgresCatalogRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly generateId: (kind: "product" | "variant") => string;
  readonly audit: (event: CatalogAuditEvent) => void | Promise<void>;
}
