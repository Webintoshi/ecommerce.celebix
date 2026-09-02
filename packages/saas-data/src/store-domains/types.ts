import type { AdminDomainView, StoreDomainDnsInstruction, StoreDomainView, TenantContext } from "@celebix/saas-contracts";

import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export type StoreDomainProvider = "cloudflare_for_saas";

export type StoreDomainMerchantInput = Readonly<{
  tenantContext: TenantContext;
  now: Date;
}>;

export type StoreDomainVersionedInput = StoreDomainMerchantInput & Readonly<{
  domainId: string;
  expectedVersion: number;
}>;

export interface StoreDomainRepository {
  list(input: StoreDomainMerchantInput): Promise<readonly StoreDomainView[]>;
  prepareCreate(input: StoreDomainMerchantInput & Readonly<{
    operationId: string;
    fingerprint: string;
    domainId: string;
    hostname: string;
    provider: StoreDomainProvider;
    cnameTarget: string;
  }>): Promise<Readonly<{ domain: StoreDomainView; replayed: boolean }>>;
  prepareBundle(input: StoreDomainMerchantInput & Readonly<{
    operationId: string;
    fingerprint: string;
    domainId: string;
    hostname: string;
    provider: StoreDomainProvider;
    cnameTarget: string;
    adminDomainId: string;
    adminHostname: string;
    adminCnameTarget: string;
  }>): Promise<Readonly<{ storefront: StoreDomainView; admin: AdminDomainView; replayed: boolean }>>;
  bindProvider(input: StoreDomainVersionedInput & Readonly<{
    providerHostnameId: string;
    ownershipValidation: readonly StoreDomainDnsInstruction[];
    certificateValidation: readonly StoreDomainDnsInstruction[];
  }>): Promise<StoreDomainView>;
  requestRecheck(input: StoreDomainVersionedInput): Promise<StoreDomainView>;
  makePrimary(input: StoreDomainVersionedInput): Promise<StoreDomainView>;
  disable(input: StoreDomainVersionedInput): Promise<StoreDomainView>;
}

export type StoreDomainWorkflowClaim = Readonly<{
  domainId: string;
  storeId: string;
  hostname: string;
  providerHostnameId: string;
  attemptCount: number;
  leaseId: string;
  leaseOwner: string;
  leaseExpiresAt: string;
  requestedRemoval: boolean;
}>;

export interface StoreDomainWorkflowRepository {
  claim(input: Readonly<{ workerId: string; now: Date; leaseExpiresAt: Date; limit: number }>): Promise<readonly StoreDomainWorkflowClaim[]>;
  complete(input: Readonly<{
    domainId: string;
    leaseId: string;
    workerId: string;
    now: Date;
    hostnameStatus: "pending" | "active" | "failed" | "deleted";
    sslStatus: "pending" | "active" | "failed" | "deleted";
    dnsStatus: "pending" | "ready" | "mismatch";
    originStatus: "pending" | "ready" | "failed";
    safeProviderErrorCode: string | null;
    nextCheckAt: Date;
  }>): Promise<void>;
  defer(input: Readonly<{
    domainId: string;
    leaseId: string;
    workerId: string;
    now: Date;
    retryAt: Date;
  }>): Promise<void>;
  fail(input: Readonly<{
    domainId: string;
    leaseId: string;
    workerId: string;
    now: Date;
    errorCode: string;
    retryAt: Date;
    terminal: boolean;
  }>): Promise<void>;
}

export type StoreDomainOriginHealth = Readonly<{
  schemaVersion: 1;
  status: "ok";
  storeId: string;
  hostname: string;
}>;

export interface StoreDomainOriginHealthRepository {
  get(input: Readonly<{ hostname: string; now: Date }>): Promise<StoreDomainOriginHealth>;
}

export type PostgresStoreDomainRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_app";
  timeouts: PostgresTimeoutOptions;
}>;

export type PostgresStoreDomainWorkflowRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_workflow";
  timeouts: PostgresTimeoutOptions;
}>;

export type PostgresStoreDomainOriginHealthRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_host_resolver";
  timeouts: PostgresTimeoutOptions;
}>;
