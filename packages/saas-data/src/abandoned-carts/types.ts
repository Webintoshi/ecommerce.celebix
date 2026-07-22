import type {
  AbandonedCartDetail,
  AbandonedCartListItem,
  AbandonedCartMutationResult,
  AbandonedCartSort,
  AbandonedCartStatus,
  AbandonedCartSummary,
  TenantContext,
} from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export interface AbandonedCartAuthorityInput {
  readonly tenantContext: TenantContext;
  readonly now: Date;
}

export interface ListAbandonedCartsInput extends AbandonedCartAuthorityInput {
  readonly pageSize: number;
  readonly cursor?: string;
  readonly status?: AbandonedCartStatus;
  readonly search?: string;
  readonly sort?: AbandonedCartSort;
}

export interface GetAbandonedCartInput extends AbandonedCartAuthorityInput {
  readonly cartId: string;
}

export interface MutateAbandonedCartInput extends GetAbandonedCartInput {
  readonly operationId: string;
  readonly expectedVersion: number;
}

export interface ListAbandonedCartsResult {
  readonly items: readonly AbandonedCartListItem[];
  readonly nextCursor?: string;
}

export interface AbandonedCartRepository {
  getSummary(input: AbandonedCartAuthorityInput): Promise<AbandonedCartSummary>;
  list(input: ListAbandonedCartsInput): Promise<ListAbandonedCartsResult>;
  get(input: GetAbandonedCartInput): Promise<AbandonedCartDetail>;
  markRecovered(input: MutateAbandonedCartInput): Promise<AbandonedCartMutationResult>;
  archive(input: MutateAbandonedCartInput): Promise<AbandonedCartMutationResult>;
}

export interface AbandonedCartAuditEvent {
  readonly type: "abandoned_cart_commit_unknown";
}

export interface PostgresAbandonedCartRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly audit: (event: AbandonedCartAuditEvent) => void | Promise<void>;
}
