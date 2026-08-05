export const SAAS_CONTRACT_SCHEMA_VERSION = 1 as const;

export type SaaSContractSchemaVersion = typeof SAAS_CONTRACT_SCHEMA_VERSION;

export type PrincipalId = string;
export type StoreId = string;
export type MembershipId = string;
export type PlanId = string;
export type DomainId = string;
export type OperationId = string;

export const STORE_STATUSES = ["provisioning", "active", "suspended", "failed"] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export const PROVISIONING_STATUSES = ["pending", "processing", "ready", "failed"] as const;
export type ProvisioningStatus = (typeof PROVISIONING_STATUSES)[number];

export const STORE_MEMBERSHIP_ROLES = ["store_owner", "admin", "editor", "analyst"] as const;
export type StoreMembershipRole = (typeof STORE_MEMBERSHIP_ROLES)[number];

export const STORE_MEMBERSHIP_STATUSES = ["active", "invited", "revoked"] as const;
export type StoreMembershipStatus = (typeof STORE_MEMBERSHIP_STATUSES)[number];

export const PLAN_ENTITLEMENT_STATUSES = ["active", "inactive", "expired"] as const;
export type PlanEntitlementStatus = (typeof PLAN_ENTITLEMENT_STATUSES)[number];

export const PLAN_FEATURE_KEYS = [
  "catalog",
  "orders",
  "customers",
  "content",
  "media",
  "analytics",
  "checkout",
  "custom_domains",
  "staff_management",
  "promotions",
  "integrations",
  "accounting",
  "marketplaces",
] as const;
export type PlanFeatureKey = (typeof PLAN_FEATURE_KEYS)[number];

export const PLAN_LIMIT_KEYS = [
  "products",
  "staff",
  "storageBytes",
  "monthlyOrders",
  "customDomains",
] as const;
export type PlanLimitKey = (typeof PLAN_LIMIT_KEYS)[number];

const PLAN_FEATURE_KEY_SET: ReadonlySet<string> = new Set(PLAN_FEATURE_KEYS);
const PLAN_LIMIT_KEY_SET: ReadonlySet<string> = new Set(PLAN_LIMIT_KEYS);

export function isPlanFeatureKey(value: string): value is PlanFeatureKey {
  return PLAN_FEATURE_KEY_SET.has(value);
}

export function isPlanLimitKey(value: string): value is PlanLimitKey {
  return PLAN_LIMIT_KEY_SET.has(value);
}

export const STORE_DOMAIN_TYPES = ["platform_subdomain", "custom"] as const;
export type StoreDomainType = (typeof STORE_DOMAIN_TYPES)[number];

export const STORE_HOST_STATUSES = ["pending_verification", "active", "disabled"] as const;
export type StoreHostStatus = (typeof STORE_HOST_STATUSES)[number];

export const STORE_DOMAIN_UI_STATUSES = [
  "dns_pending",
  "hostname_pending",
  "ssl_pending",
  "origin_pending",
  "active",
  "action_required",
  "disabled",
] as const;
export type StoreDomainUiStatus = (typeof STORE_DOMAIN_UI_STATUSES)[number];

export type StoreDomainDnsInstruction = Readonly<{
  type: "CNAME" | "TXT";
  name: string;
  value: string;
}>;

export type StoreDomainView = Readonly<{
  schemaVersion: 1;
  id: DomainId;
  hostname: string;
  hostnameType: "platform_subdomain" | "custom_domain";
  status: "pending" | "active" | "disabled";
  primary: boolean;
  uiStatus: StoreDomainUiStatus;
  dnsInstructions: readonly StoreDomainDnsInstruction[];
  verifiedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}>;

export type CreateStoreDomainInput = Readonly<{
  schemaVersion: 1;
  operationId: OperationId;
  hostname: string;
}>;

export type StoreDomainMutationResult = Readonly<{
  schemaVersion: 1;
  domain: StoreDomainView;
  replayed: boolean;
}>;

export const ADMIN_DOMAIN_KINDS = ["platform_subdomain", "custom_alias"] as const;
export type AdminDomainKind = (typeof ADMIN_DOMAIN_KINDS)[number];

export const ADMIN_DOMAIN_STATUSES = ["pending_verification", "active", "disabled"] as const;
export type AdminDomainStatus = (typeof ADMIN_DOMAIN_STATUSES)[number];

/** Public, non-authorizing presentation resolved from an exact active admin hostname. */
export type PublicAdminBrand = Readonly<{
  storeSlug: string;
  displayName: string;
  logoUrl: string | null;
  accentColor: string | null;
  canonicalAdminOrigin: string;
}>;

/**
 * Input accepted by Tenant Core for an automatic free-starter tenant bootstrap.
 *
 * Invariants:
 * - The immutable identity authority is issuer + subject. Email is contact metadata only.
 * - emailVerified must be true for automatic creation.
 * - slug is already normalized and all timestamps are ISO-8601 UTC.
 * - privacyAcceptedAt is mandatory.
 * - idempotencyKey is opaque, contains no secret, and is bound to a canonical payload fingerprint.
 * - Same key and fingerprint replay the prior operation; a different fingerprint yields idempotency_mismatch.
 * - Tenant Core generates authority IDs and never trusts caller-supplied store or membership IDs.
 * - Passwords, authentication material, credentials, and private infrastructure values are never accepted.
 */
export interface CreateStarterTenantInput {
  schemaVersion: SaaSContractSchemaVersion;
  idempotencyKey: string;
  principal: {
    issuer: string;
    subject: string;
    email: string;
    emailVerified: true;
  };
  store: {
    name: string;
    slug: string;
    locale: string;
    currency: string;
    themeKey: string;
  };
  consents: {
    privacyAcceptedAt: string;
    marketingAcceptedAt?: string;
  };
  requestedAt: string;
}

/**
 * Store-scoped authorization relationship backed by an immutable principal identity.
 *
 * Invariants:
 * - principalId is derived from the issuer + subject identity authority; email never grants access.
 * - Membership is store-scoped and a revoked membership never authorizes.
 * - Active-store selection is validated against an active membership.
 * - The persistence layer enforces principal/store/role uniqueness.
 * - Role identifiers are authorization inputs, not presentation labels.
 */
export interface StoreMembership {
  schemaVersion: SaaSContractSchemaVersion;
  id: MembershipId;
  principalId: PrincipalId;
  storeId: StoreId;
  role: StoreMembershipRole;
  status: StoreMembershipStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PlanEntitlementLimits {
  products: number;
  staff: number;
  storageBytes: number;
  monthlyOrders?: number;
  customDomains?: number;
}

/**
 * Versioned, server-computed feature and quota output shared by UI, APIs, and workers.
 *
 * Invariants:
 * - Unknown features are denied and missing limits never imply unlimited capacity.
 * - Plan and entitlement values are versioned.
 * - UI visibility is not authorization; APIs and workers enforce this same output.
 * - A free-starter plan is representable without payment infrastructure.
 */
export interface PlanEntitlements {
  schemaVersion: SaaSContractSchemaVersion;
  planId: PlanId;
  planCode: string;
  version: number;
  status: PlanEntitlementStatus;
  features: readonly PlanFeatureKey[];
  limits: PlanEntitlementLimits;
  validFrom: string;
  validUntil?: string;
}

/** Denies missing, unknown, or inactive-plan features by default. */
export function isPlanFeatureEnabled(
  entitlements: Pick<PlanEntitlements, "features" | "status">,
  feature: string,
): boolean {
  return (
    entitlements.status === "active" &&
    isPlanFeatureKey(feature) &&
    entitlements.features.includes(feature)
  );
}

/** Resolves missing, unknown, or invalid plan limits to zero. */
export function getPlanLimit(
  entitlements: Pick<PlanEntitlements, "limits">,
  limit: string,
): number {
  if (!isPlanLimitKey(limit)) {
    return 0;
  }

  const value = entitlements.limits[limit];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

/**
 * Exact persisted hostname resolution result.
 *
 * Invariants:
 * - hostname and canonicalHostname are normalized, exact, and contain no port.
 * - Unknown or ambiguous ownership fails closed outside this contract.
 * - Disabled and unverified custom domains cannot resolve an active tenant.
 * - One active hostname maps to exactly one store.
 * - Store authority never comes only from a body, query, or untrusted header.
 * - canonicalHostname is database-derived; this contract performs no wildcard resolution.
 */
export interface ResolvedStoreHost {
  schemaVersion: SaaSContractSchemaVersion;
  hostname: string;
  domainId: DomainId;
  domainType: StoreDomainType;
  storeId: StoreId;
  storeSlug: string;
  canonicalHostname: string;
  status: StoreHostStatus;
  cacheVersion: number;
}

/**
 * Safe proof that Tenant Core committed the store-owned media namespace.
 *
 * Infrastructure authority such as bucket names, credentials, endpoint URLs,
 * or object-key prefixes must never cross this contract boundary.
 */
export interface StoreMediaReadiness {
  readonly schemaVersion: SaaSContractSchemaVersion;
  readonly status: "ready";
  readonly version: number;
}

/**
 * Result emitted by Tenant Core after creating or replaying a free-starter operation.
 *
 * Invariants:
 * - All authority IDs are generated by Tenant Core.
 * - URLs are derived from persisted store and domain records.
 * - No private authentication or infrastructure material is returned.
 * - replayed marks a previously committed idempotent result.
 * - ready is emitted only after the atomic tenant bootstrap commits; asynchronous work may return processing.
 * - Owner/super-admin approval is not part of the normal customer flow.
 */
export interface CreateStarterTenantResult {
  schemaVersion: SaaSContractSchemaVersion;
  operationId: OperationId;
  replayed: boolean;
  store: {
    id: StoreId;
    slug: string;
    status: StoreStatus;
  };
  primaryDomain: ResolvedStoreHost;
  membership: StoreMembership;
  plan: PlanEntitlements;
  mediaStorage: StoreMediaReadiness;
  provisioningStatus: ProvisioningStatus;
  panelUrl: string;
  storefrontUrl: string;
}

/**
 * Server-produced authority context consumed by every tenant-aware subsystem.
 *
 * Invariants:
 * - Requires an authenticated principal, active membership, and allowed store.
 * - Store authority comes from validated membership or exact host resolution; caller storeId is only a hint.
 * - Membership and resolved-host store IDs must match when both are present.
 * - Contains no database client, private authentication material, credentials, or infrastructure details.
 * - Repositories, R2, cache, jobs, logs, and rate limits consume store.id from this context.
 */
export interface TenantContext {
  schemaVersion: SaaSContractSchemaVersion;
  requestId: string;
  principal: {
    id: PrincipalId;
    issuer: string;
    subject: string;
  };
  store: {
    id: StoreId;
    slug: string;
    status: "active";
  };
  membership: {
    id: MembershipId;
    role: StoreMembershipRole;
    status: "active";
  };
  entitlements: PlanEntitlements;
  resolvedHost?: ResolvedStoreHost & { status: "active" };
  locale: string;
}
