export type StorefrontHostnamePolicy = Readonly<{
  reservedSuffixes: readonly string[];
  cnameTarget: string;
}>;

export type NormalizedStorefrontHostname = Readonly<{
  hostname: string;
  registrableDomain: string;
  recordName: string;
  apex: boolean;
}>;

export type ProviderHostnameStatus = "pending" | "active" | "failed" | "deleted";

export type ProviderValidationInstruction = Readonly<{
  type: "txt" | "http" | "cname";
  name: string;
  value: string;
}>;

export type ProviderHostnameSnapshot = Readonly<{
  providerHostnameId: string;
  hostname: string;
  hostnameStatus: ProviderHostnameStatus;
  sslStatus: ProviderHostnameStatus;
  ownershipValidation: ProviderValidationInstruction | null;
  certificateValidation: readonly ProviderValidationInstruction[];
}>;

export interface CustomHostnameProvider {
  create(hostname: string): Promise<ProviderHostnameSnapshot>;
  get(providerHostnameId: string): Promise<ProviderHostnameSnapshot>;
  find(hostname: string): Promise<ProviderHostnameSnapshot | null>;
  remove(providerHostnameId: string): Promise<Readonly<{ deleted: true }>>;
}

export type CloudflareForSaaSConfig = Readonly<{
  zoneId: string;
  apiToken: string;
  apiBaseUrl: string;
  minimumTlsVersion: "1.2";
  timeoutMs: number;
}>;

export const CLOUDFLARE_CUSTOM_HOSTNAME_ERROR_CODES = Object.freeze([
  "invalid_input",
  "duplicate",
  "not_found",
  "rate_limited",
  "unavailable",
  "malformed_response",
] as const);

export type CloudflareCustomHostnameErrorCode = (typeof CLOUDFLARE_CUSTOM_HOSTNAME_ERROR_CODES)[number];

export type StoreDomainPersistence = Readonly<{
  list(input: Readonly<{ tenantContext: import("@celebix/saas-contracts").TenantContext; now: Date }>): Promise<readonly import("@celebix/saas-contracts").StoreDomainView[]>;
  prepareCreate(input: Readonly<{
    tenantContext: import("@celebix/saas-contracts").TenantContext; now: Date; operationId: string; fingerprint: string;
    domainId: string; hostname: string; provider: "cloudflare_for_saas"; cnameTarget: string;
  }>): Promise<Readonly<{ domain: import("@celebix/saas-contracts").StoreDomainView; replayed: boolean }>>;
  bindProvider(input: Readonly<{
    tenantContext: import("@celebix/saas-contracts").TenantContext; now: Date; domainId: string; expectedVersion: number;
    providerHostnameId: string; ownershipValidation: readonly import("@celebix/saas-contracts").StoreDomainDnsInstruction[];
    certificateValidation: readonly import("@celebix/saas-contracts").StoreDomainDnsInstruction[];
  }>): Promise<import("@celebix/saas-contracts").StoreDomainView>;
  requestRecheck(input: StoreDomainVersionedServiceInput): Promise<import("@celebix/saas-contracts").StoreDomainView>;
  makePrimary(input: StoreDomainVersionedServiceInput): Promise<import("@celebix/saas-contracts").StoreDomainView>;
  disable(input: StoreDomainVersionedServiceInput): Promise<import("@celebix/saas-contracts").StoreDomainView>;
}>;

export type StoreDomainVersionedServiceInput = Readonly<{
  tenantContext: import("@celebix/saas-contracts").TenantContext;
  now: Date;
  domainId: string;
  expectedVersion: number;
}>;

export type AdminDomainPersistence = Readonly<{
  list(input: Readonly<{ tenantContext: import("@celebix/saas-contracts").TenantContext; now: Date }>): Promise<readonly import("@celebix/saas-contracts").AdminDomainView[]>;
  prepareCreate(input: Readonly<{ tenantContext: import("@celebix/saas-contracts").TenantContext; now: Date; operationId: string; fingerprint: string; domainId: string; hostname: string; provider: "cloudflare_for_saas"; cnameTarget: string }>): Promise<Readonly<{ domain: import("@celebix/saas-contracts").AdminDomainView; replayed: boolean }>>;
  bindProvider(input: Readonly<{ tenantContext: import("@celebix/saas-contracts").TenantContext; now: Date; domainId: string; expectedVersion: number; providerHostnameId: string; ownershipValidation: readonly import("@celebix/saas-contracts").StoreDomainDnsInstruction[]; certificateValidation: readonly import("@celebix/saas-contracts").StoreDomainDnsInstruction[] }>): Promise<import("@celebix/saas-contracts").AdminDomainView>;
  requestRecheck(input: StoreDomainVersionedServiceInput): Promise<import("@celebix/saas-contracts").AdminDomainView>;
  makePrimary(input: StoreDomainVersionedServiceInput): Promise<import("@celebix/saas-contracts").AdminDomainView>;
  disable(input: StoreDomainVersionedServiceInput): Promise<import("@celebix/saas-contracts").AdminDomainView>;
}>;

export type StoreDomainWorkflowClaim = Readonly<{
  domainId: string; storeId: string; hostname: string; providerHostnameId: string; attemptCount: number;
  leaseId: string; leaseOwner: string; leaseExpiresAt: string; requestedRemoval: boolean;
}>;

export type StoreDomainWorkflowPersistence = Readonly<{
  claim(input: Readonly<{ workerId: string; now: Date; leaseExpiresAt: Date; limit: number }>): Promise<readonly StoreDomainWorkflowClaim[]>;
  complete(input: Readonly<{
    domainId: string; leaseId: string; workerId: string; now: Date;
    hostnameStatus: ProviderHostnameStatus; sslStatus: ProviderHostnameStatus;
    dnsStatus: "pending" | "ready" | "mismatch"; originStatus: "pending" | "ready" | "failed";
    safeProviderErrorCode: string | null; nextCheckAt: Date;
  }>): Promise<void>;
  fail(input: Readonly<{
    domainId: string; leaseId: string; workerId: string; now: Date; errorCode: string; retryAt: Date; terminal: boolean;
  }>): Promise<void>;
}>;

export const STORE_DOMAIN_SERVICE_ERROR_CODES = Object.freeze([
  "invalid_input", "feature_not_enabled", "limit_reached", "hostname_already_claimed", "stale_version",
  "not_found", "operation_mismatch", "provider_unavailable",
] as const);
export type StoreDomainServiceErrorCode = (typeof STORE_DOMAIN_SERVICE_ERROR_CODES)[number];
