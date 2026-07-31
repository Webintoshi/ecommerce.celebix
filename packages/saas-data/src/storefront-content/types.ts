import type {
  PublicPolicyPage,
  PublicProduct,
  PublicProductSearch,
  StorefrontPolicyKey,
  TenantContext,
} from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export type PublicPolicySourcePage = Readonly<{
  key: StorefrontPolicyKey;
  label: string;
  route: string;
  published: boolean;
  body?: string;
  updatedAt: string;
}>;

export type StorePolicyStatus = "draft" | "published";

export type StorePolicyAdminPage = Readonly<{
  key: StorefrontPolicyKey;
  label: string;
  route: string;
  ordinal: number;
  status: StorePolicyStatus;
  body: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}>;

export interface PublicStorefrontContentRepository {
  listPolicies(input: Readonly<{ hostname: string; now: Date }>): Promise<readonly PublicPolicyPage[]>;
  getPolicy(input: Readonly<{ hostname: string; now: Date; key: StorefrontPolicyKey }>): Promise<PublicPolicySourcePage>;
  search(input: Readonly<{ hostname: string; now: Date; query: string; limit: number; cursor?: string }>): Promise<PublicProductSearch>;
  resolveProductIds(input: Readonly<{ hostname: string; now: Date; productIds: readonly string[] }>): Promise<readonly PublicProduct[]>;
}

export interface StorePolicyAdminRepository {
  list(input: Readonly<{ tenantContext: TenantContext; now: Date }>): Promise<readonly StorePolicyAdminPage[]>;
  save(input: Readonly<{
    tenantContext: TenantContext;
    now: Date;
    operationId: string;
    key: StorefrontPolicyKey;
    expectedVersion: number;
    body: string;
    status: StorePolicyStatus;
  }>): Promise<StorePolicyAdminPage>;
}

export type PostgresPublicStorefrontContentRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_host_resolver";
  timeouts: PostgresTimeoutOptions;
}>;

export type StorePolicyAuditEvent = Readonly<{ type: "store_policy_commit_unknown" }>;

export type PostgresStorePolicyAdminRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_app";
  timeouts: PostgresTimeoutOptions;
  audit: (event: StorePolicyAuditEvent) => void | Promise<void>;
}>;
