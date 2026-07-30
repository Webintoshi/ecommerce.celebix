import type {
  CreateStarterTenantResult,
  DomainId,
  MembershipId,
  OperationId,
  PlanEntitlementLimits,
  PlanEntitlementStatus,
  PlanFeatureKey,
  PlanId,
  PrincipalId,
  StoreDomainType,
  StoreHostStatus,
  StoreId,
  StoreMembership,
  StoreStatus,
} from "@celebix/saas-contracts";

export type CanonicalTenantFingerprint = string & {
  readonly __canonicalTenantFingerprint: unique symbol;
};

export type PrincipalIdentityKey = string & {
  readonly __principalIdentityKey: unique symbol;
};

export type UniqueConflictKind =
  | "principal_identity"
  | "store_slug"
  | "domain_hostname"
  | "admin_domain_hostname"
  | "membership"
  | "subscription"
  | "media_namespace"
  | "setting"
  | "operation_idempotency";

export type InMemoryFailurePoint =
  | "after_principal_create"
  | "after_principal_email_update"
  | "after_store_create"
  | "after_domain_create"
  | "after_admin_domain_create"
  | "after_membership_create"
  | "after_subscription_create"
  | "after_media_namespace_create"
  | "after_setting_create"
  | "after_operation_create"
  | "after_operation_commit";

export interface PrincipalRecord {
  id: PrincipalId;
  issuer: string;
  subject: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoreRecord {
  id: StoreId;
  name: string;
  slug: string;
  status: StoreStatus;
  locale: string;
  currency: string;
  themeKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface DomainRecord {
  id: DomainId;
  storeId: StoreId;
  hostname: string;
  type: StoreDomainType;
  status: StoreHostStatus;
  canonical: boolean;
  cacheVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDomainRecord {
  id: DomainId;
  storeId: StoreId;
  hostname: string;
  kind: "platform_subdomain";
  status: "active";
  canonical: true;
  verifiedAt: string;
  version: 1;
  createdAt: string;
  updatedAt: string;
}

export type MembershipRecord = StoreMembership;

export interface PlanRecord {
  id: PlanId;
  code: string;
  version: number;
  status: PlanEntitlementStatus;
  features: readonly PlanFeatureKey[];
  limits: PlanEntitlementLimits;
  validFrom: string;
  validUntil?: string;
}

export interface SubscriptionRecord {
  id: string;
  storeId: StoreId;
  planId: PlanId;
  planCode: string;
  planVersion: number;
  status: PlanEntitlementStatus;
  validFrom: string;
  validUntil?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoreSettingRecord {
  id: string;
  storeId: StoreId;
  key: string;
  value: unknown;
  createdAt: string;
  updatedAt: string;
}

export type StoreMediaNamespaceStatus = "active" | "suspended" | "deleting" | "deleted";

export interface StoreMediaNamespaceRecord {
  storeId: StoreId;
  namespacePrefix: string;
  status: StoreMediaNamespaceStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type TenantOperationStatus = "processing" | "committed" | "failed";

export interface TenantOperationRecord {
  id: OperationId;
  idempotencyKey: string;
  fingerprint: CanonicalTenantFingerprint;
  status: TenantOperationStatus;
  result?: CreateStarterTenantResult;
  createdAt: string;
  updatedAt: string;
}

export type TenantOperationClaim =
  | { kind: "created"; operation: TenantOperationRecord }
  | { kind: "existing"; operation: TenantOperationRecord };

export interface StoreBootstrapRecords {
  principal: PrincipalRecord;
  store: StoreRecord;
  domain: DomainRecord;
  adminDomain: AdminDomainRecord;
  membership: MembershipRecord;
  plan: PlanRecord;
  subscription: SubscriptionRecord;
  mediaNamespace: StoreMediaNamespaceRecord;
  settings: readonly StoreSettingRecord[];
  operation: TenantOperationRecord;
}

export interface SaaSDataState {
  principals: PrincipalRecord[];
  stores: StoreRecord[];
  domains: DomainRecord[];
  adminDomains: AdminDomainRecord[];
  memberships: MembershipRecord[];
  plans: PlanRecord[];
  subscriptions: SubscriptionRecord[];
  mediaNamespaces: StoreMediaNamespaceRecord[];
  settings: StoreSettingRecord[];
  operations: TenantOperationRecord[];
}

export type SaaSGeneratedIdKind =
  | "principal"
  | "store"
  | "domain"
  | "membership"
  | "subscription"
  | "setting"
  | "operation";

export interface InMemoryRepositoryMetrics {
  begins: number;
  commits: number;
  rollbacks: number;
}
