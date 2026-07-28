import type {
  CatalogOnboardingIntent,
  CatalogOnboardingOptions,
  CatalogOnboardingResourceIds,
  CatalogOnboardingResult,
  CatalogProductEditorProjection,
  CatalogProductMerchandisingFields,
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
}

export interface PostgresCatalogOnboardingRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly uuid: () => string;
  readonly audit: (event: Readonly<{ type: "catalog_onboarding_commit_unknown" }>) => void | Promise<void>;
}
