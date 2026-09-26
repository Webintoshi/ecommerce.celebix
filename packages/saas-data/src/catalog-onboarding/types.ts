import type {
  CatalogOnboardingIntent,
  CatalogCategory,
  CatalogCategoryFields,
  CatalogCategoryMutationResult,
  CatalogCategoryOrderFields,
  CatalogCategoryOrderResult,
  CatalogOnboardingOptions,
  CatalogOnboardingResourceIds,
  CatalogOnboardingResult,
  CatalogProductEditorProjection,
  CatalogProductMerchandisingFields,
  PermanentDeletionCommand,
  PermanentDeletionImpact,
  PermanentDeletionResult,
  TenantContext,
} from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export interface CatalogOnboardingAuthorityInput {
  readonly tenantContext: TenantContext;
  readonly now: Date;
}

export interface CreateCatalogOnboardingProductInput extends CatalogOnboardingAuthorityInput {
  readonly operationId: string;
  readonly intent: CatalogOnboardingIntent;
}

export interface GetCatalogProductEditorInput extends CatalogOnboardingAuthorityInput {
  readonly productId: string;
}

export interface CatalogMerchandisingPayload {
  readonly profile: CatalogProductMerchandisingFields;
  readonly categoryIds: readonly string[];
  readonly resourceIds: CatalogOnboardingResourceIds;
  readonly channelIds: readonly string[];
}

export interface UpdateCatalogMerchandisingInput extends CatalogOnboardingAuthorityInput, CatalogMerchandisingPayload {
  readonly operationId: string;
  readonly productId: string;
  readonly expectedProfileVersion: number;
}

export interface PublishCatalogAfterMediaInput extends CatalogOnboardingAuthorityInput {
  readonly operationId: string;
  readonly productId: string;
  readonly expectedProductVersion: number;
  readonly expectedMediaCount: number;
}

export interface CatalogOnboardingRepository {
  getOptions(input: CatalogOnboardingAuthorityInput): Promise<CatalogOnboardingOptions>;
  createProduct(input: CreateCatalogOnboardingProductInput): Promise<CatalogOnboardingResult>;
  getProductEditor(input: GetCatalogProductEditorInput): Promise<CatalogProductEditorProjection>;
  updateMerchandising(input: UpdateCatalogMerchandisingInput): Promise<CatalogOnboardingResult>;
  publishAfterMedia(input: PublishCatalogAfterMediaInput): Promise<CatalogOnboardingResult>;
  listCategories(input: CatalogOnboardingAuthorityInput): Promise<readonly CatalogCategory[]>;
  reorderCategories(input: ReorderCatalogCategoriesInput): Promise<CatalogCategoryOrderResult>;
  getCategoryProductOrder(input: GetCatalogCategoryInput): Promise<CatalogCategoryProductOrder>;
  reorderCategoryProducts(input: ReorderCatalogCategoryProductsInput): Promise<CatalogCategoryProductOrderResult>;
  createCategory(input: CreateCatalogCategoryInput): Promise<CatalogCategoryMutationResult>;
  updateCategory(input: UpdateCatalogCategoryInput): Promise<CatalogCategoryMutationResult>;
  archiveCategory(input: ArchiveCatalogCategoryInput): Promise<CatalogCategoryMutationResult>;
  getCategoryDeletionImpact(input: GetCatalogCategoryInput): Promise<PermanentDeletionImpact>;
  deleteCategory(input: DeleteCatalogCategoryInput): Promise<PermanentDeletionResult>;
}

export interface GetCatalogCategoryInput extends CatalogOnboardingAuthorityInput {
  readonly categoryId: string;
}

export interface ReorderCatalogCategoriesInput extends CatalogOnboardingAuthorityInput, CatalogCategoryOrderFields {
  readonly operationId: string;
}

export type CatalogCategoryProductOrderItem = Readonly<{
  productId: string;
  title: string;
  slug: string;
  status: "active" | "draft";
  storefrontPosition: number | null;
}>;
export type CatalogCategoryProductOrder = Readonly<{
  categoryId: string;
  version: number;
  items: readonly CatalogCategoryProductOrderItem[];
}>;
export type CatalogCategoryProductOrderResult = CatalogCategoryProductOrder & Readonly<{ replayed: boolean }>;
export interface ReorderCatalogCategoryProductsInput extends GetCatalogCategoryInput {
  readonly operationId: string;
  readonly expectedVersion: number;
  readonly orderedProductIds: readonly string[];
}

export interface DeleteCatalogCategoryInput extends GetCatalogCategoryInput, PermanentDeletionCommand {}

export interface CreateCatalogCategoryInput extends CatalogOnboardingAuthorityInput {
  readonly operationId: string;
  readonly fields: CatalogCategoryFields;
}

export interface UpdateCatalogCategoryInput extends CatalogOnboardingAuthorityInput {
  readonly operationId: string;
  readonly categoryId: string;
  readonly expectedVersion: number;
  readonly fields: CatalogCategoryFields;
}

export interface ArchiveCatalogCategoryInput extends CatalogOnboardingAuthorityInput {
  readonly operationId: string;
  readonly categoryId: string;
  readonly expectedVersion: number;
}

export interface PostgresCatalogOnboardingRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly uuid: () => string;
  readonly audit: (event: Readonly<{ type: "catalog_onboarding_commit_unknown" }>) => void | Promise<void>;
}
