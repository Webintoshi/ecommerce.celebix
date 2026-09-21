import type { CatalogWeightEditorProjection, CatalogWeightSaveIntent, TenantContext } from "@celebix/saas-contracts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export type CatalogWeightAuthorityInput = Readonly<{ tenantContext: TenantContext; now: Date }>;
export type CatalogWeightSaveInput = CatalogWeightAuthorityInput & Readonly<{
  productId: string;
  declarationId: string;
  expectedVariantVersion: number | null;
  intent: CatalogWeightSaveIntent;
}>;
export interface CatalogWeightRepository {
  get(input: CatalogWeightAuthorityInput & Readonly<{ productId: string }>): Promise<CatalogWeightEditorProjection>;
  save(input: CatalogWeightSaveInput): Promise<CatalogWeightEditorProjection>;
}
export type CatalogWeightAuditEvent = Readonly<{ type: "catalog_weight_commit_unknown" }>;
export interface PostgresCatalogWeightRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly audit: (event: CatalogWeightAuditEvent) => void | Promise<void>;
}
