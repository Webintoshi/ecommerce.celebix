import type {
  DomainRecord,
  MembershipRecord,
  PlanRecord,
  PrincipalRecord,
  SaaSGeneratedIdKind,
  StoreRecord,
  StoreMediaNamespaceRecord,
  StoreSettingRecord,
  SubscriptionRecord,
  TenantOperationClaim,
  TenantOperationRecord,
} from "./types.ts";

export interface PrincipalRepositoryPort {
  findByIdentity(issuer: string, subject: string): Promise<PrincipalRecord | null>;
  create(record: PrincipalRecord): Promise<PrincipalRecord>;
  updateVerifiedEmail(principalId: string, verifiedEmail: string, updatedAt: string): Promise<PrincipalRecord>;
}

export interface StoreRepositoryPort {
  findBySlug(slug: string): Promise<StoreRecord | null>;
  create(record: StoreRecord): Promise<StoreRecord>;
}

export interface DomainRepositoryPort {
  findByHostname(hostname: string): Promise<DomainRecord | null>;
  create(record: DomainRecord): Promise<DomainRecord>;
}

export interface MembershipRepositoryPort {
  find(principalId: string, storeId: string, role: string): Promise<MembershipRecord | null>;
  create(record: MembershipRecord): Promise<MembershipRecord>;
}

export interface PlanRepositoryPort {
  findByCodeVersion(code: string, version: number): Promise<PlanRecord | null>;
}

export interface SubscriptionRepositoryPort {
  findActiveByStoreId(storeId: string): Promise<SubscriptionRecord | null>;
  create(record: SubscriptionRecord): Promise<SubscriptionRecord>;
}

export interface StoreSettingRepositoryPort {
  find(storeId: string, key: string): Promise<StoreSettingRecord | null>;
  create(record: StoreSettingRecord): Promise<StoreSettingRecord>;
}

export interface StoreMediaNamespaceRepositoryPort {
  findByStoreId(storeId: string): Promise<StoreMediaNamespaceRecord | null>;
  create(record: StoreMediaNamespaceRecord): Promise<StoreMediaNamespaceRecord>;
}

export interface TenantOperationRepositoryPort {
  /**
   * Atomically claims one idempotency key. A production adapter must allow only
   * one created result and return the winner's final visible row to every loser.
   */
  claim(record: TenantOperationRecord): Promise<TenantOperationClaim>;
  markCommitted(
    operationId: string,
    result: NonNullable<TenantOperationRecord["result"]>,
    updatedAt: string,
  ): Promise<TenantOperationRecord>;
}

export interface SaaSDataTransaction {
  readonly principals: PrincipalRepositoryPort;
  readonly stores: StoreRepositoryPort;
  readonly domains: DomainRepositoryPort;
  readonly memberships: MembershipRepositoryPort;
  readonly plans: PlanRepositoryPort;
  readonly subscriptions: SubscriptionRepositoryPort;
  readonly mediaNamespaces: StoreMediaNamespaceRepositoryPort;
  readonly settings: StoreSettingRepositoryPort;
  readonly operations: TenantOperationRepositoryPort;
  generateId(kind: SaaSGeneratedIdKind): string;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface SaaSDataRepository {
  beginTransaction(): Promise<SaaSDataTransaction>;
}
