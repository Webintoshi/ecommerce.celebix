import type { PriceList, PriceListItem, PriceListRule, TenantContext } from "@celebix/saas-contracts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export interface PricingAuthorityInput { readonly tenantContext: TenantContext; readonly now: Date }
export type ListPriceListsInput = PricingAuthorityInput;
export interface GetPriceListInput extends PricingAuthorityInput { readonly priceListId: string }
export interface SavePriceListInput extends PricingAuthorityInput {
  readonly operationId: string;
  readonly priceListId?: string;
  readonly expectedVersion?: number;
  readonly name: string;
  readonly items: readonly PriceListItem[];
  readonly rules: readonly PriceListRule[];
}
export interface PriceListOperationInput extends PricingAuthorityInput {
  readonly operationId: string;
  readonly priceListId: string;
  readonly expectedVersion: number;
}
export interface PricingRepository {
  list(input: ListPriceListsInput): Promise<readonly PriceList[]>;
  get(input: GetPriceListInput): Promise<PriceList>;
  save(input: SavePriceListInput): Promise<PriceList>;
  activate(input: PriceListOperationInput): Promise<PriceList>;
  archive(input: PriceListOperationInput): Promise<PriceList>;
}
export type PricingAuditEvent = Readonly<{ type: "pricing_commit_unknown" }>;
export interface PostgresPricingRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly uuid: () => string;
  readonly audit: (event: PricingAuditEvent) => void | Promise<void>;
}
