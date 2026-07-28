import type { PlanFeatureKey } from "@celebix/saas-contracts";

import { SaaSDataUniqueConflict } from "../errors.ts";
import type { SaaSDataRepository, SaaSDataTransaction } from "../ports.ts";
import type {
  DomainRecord,
  InMemoryFailurePoint,
  InMemoryRepositoryMetrics,
  MembershipRecord,
  PlanRecord,
  PrincipalRecord,
  SaaSDataState,
  SaaSGeneratedIdKind,
  StoreRecord,
  StoreMediaNamespaceRecord,
  StoreSettingRecord,
  SubscriptionRecord,
  TenantOperationRecord,
} from "../types.ts";

const FREE_STARTER_FEATURES = [
  "catalog",
  "orders",
  "customers",
  "content",
  "media",
  "analytics",
  "checkout",
] as const satisfies readonly PlanFeatureKey[];

const DEFAULT_PLAN: PlanRecord = {
  id: "plan_free_starter_v1",
  code: "free_starter",
  version: 1,
  status: "active",
  features: FREE_STARTER_FEATURES,
  limits: {
    products: 100,
    staff: 1,
    storageBytes: 1_000_000_000,
    monthlyOrders: 100,
    customDomains: 0,
  },
  validFrom: "2026-01-01T00:00:00.000Z",
};

function cloneState(state: SaaSDataState): SaaSDataState {
  return structuredClone(state);
}

function initialState(overrides?: Partial<SaaSDataState>): SaaSDataState {
  return {
    principals: [],
    stores: [],
    domains: [],
    memberships: [],
    plans: [DEFAULT_PLAN],
    subscriptions: [],
    mediaNamespaces: [],
    settings: [],
    operations: [],
    ...structuredClone(overrides ?? {}),
  };
}

export interface InMemorySaaSDataRepositoryOptions {
  failAt?: InMemoryFailurePoint;
  initialState?: Partial<SaaSDataState>;
}

class InMemoryTransaction implements SaaSDataTransaction {
  readonly principals;
  readonly stores;
  readonly domains;
  readonly memberships;
  readonly plans;
  readonly subscriptions;
  readonly mediaNamespaces;
  readonly settings;
  readonly operations;

  private completed = false;
  private readonly state: SaaSDataState;
  private readonly failAt: InMemoryFailurePoint | undefined;
  private readonly nextId: (kind: SaaSGeneratedIdKind) => string;
  private readonly publish: (state: SaaSDataState) => void;
  private readonly release: (committed: boolean) => void;

  constructor(
    state: SaaSDataState,
    failAt: InMemoryFailurePoint | undefined,
    nextId: (kind: SaaSGeneratedIdKind) => string,
    publish: (state: SaaSDataState) => void,
    release: (committed: boolean) => void,
  ) {
    this.state = state;
    this.failAt = failAt;
    this.nextId = nextId;
    this.publish = publish;
    this.release = release;
    const ensureActive = () => {
      if (this.completed) {
        throw new Error("Transaction already completed");
      }
    };
    const maybeFail = (point: InMemoryFailurePoint) => {
      if (this.failAt === point) {
        throw new Error(`Injected failure: ${point}`);
      }
    };

    this.principals = {
      findByIdentity: async (issuer: string, subject: string) => {
        ensureActive();
        return this.state.principals.find((record) => record.issuer === issuer && record.subject === subject) ?? null;
      },
      create: async (record: PrincipalRecord) => {
        ensureActive();
        if (this.state.principals.some((entry) => entry.issuer === record.issuer && entry.subject === record.subject)) {
          throw new SaaSDataUniqueConflict("principal_identity");
        }
        this.state.principals.push(structuredClone(record));
        maybeFail("after_principal_create");
        return structuredClone(record);
      },
      updateVerifiedEmail: async (principalId: string, verifiedEmail: string, updatedAt: string) => {
        ensureActive();
        const principal = this.state.principals.find((record) => record.id === principalId);
        if (!principal) {
          throw new Error("Principal not found");
        }
        principal.email = verifiedEmail;
        principal.emailVerified = true;
        principal.updatedAt = updatedAt;
        maybeFail("after_principal_email_update");
        return structuredClone(principal);
      },
    };

    this.stores = {
      findBySlug: async (slug: string) => {
        ensureActive();
        return this.state.stores.find((record) => record.slug === slug) ?? null;
      },
      create: async (record: StoreRecord) => {
        ensureActive();
        if (this.state.stores.some((entry) => entry.slug === record.slug)) {
          throw new SaaSDataUniqueConflict("store_slug");
        }
        this.state.stores.push(structuredClone(record));
        maybeFail("after_store_create");
        return structuredClone(record);
      },
    };

    this.domains = {
      findByHostname: async (hostname: string) => {
        ensureActive();
        return this.state.domains.find((record) => record.hostname === hostname) ?? null;
      },
      create: async (record: DomainRecord) => {
        ensureActive();
        if (this.state.domains.some((entry) => entry.hostname === record.hostname)) {
          throw new SaaSDataUniqueConflict("domain_hostname");
        }
        this.state.domains.push(structuredClone(record));
        maybeFail("after_domain_create");
        return structuredClone(record);
      },
    };

    this.memberships = {
      find: async (principalId: string, storeId: string, role: string) => {
        ensureActive();
        return this.state.memberships.find(
          (record) => record.principalId === principalId && record.storeId === storeId && record.role === role,
        ) ?? null;
      },
      create: async (record: MembershipRecord) => {
        ensureActive();
        if (
          this.state.memberships.some(
            (entry) =>
              entry.principalId === record.principalId &&
              entry.storeId === record.storeId &&
              entry.role === record.role,
          )
        ) {
          throw new SaaSDataUniqueConflict("membership");
        }
        this.state.memberships.push(structuredClone(record));
        maybeFail("after_membership_create");
        return structuredClone(record);
      },
    };

    this.plans = {
      findByCodeVersion: async (code: string, version: number) => {
        ensureActive();
        return this.state.plans.find((record) => record.code === code && record.version === version) ?? null;
      },
    };

    this.subscriptions = {
      findActiveByStoreId: async (storeId: string) => {
        ensureActive();
        return this.state.subscriptions.find((record) => record.storeId === storeId && record.status === "active") ?? null;
      },
      create: async (record: SubscriptionRecord) => {
        ensureActive();
        if (this.state.subscriptions.some((entry) => entry.storeId === record.storeId && entry.status === "active")) {
          throw new SaaSDataUniqueConflict("subscription");
        }
        this.state.subscriptions.push(structuredClone(record));
        maybeFail("after_subscription_create");
        return structuredClone(record);
      },
    };

    this.mediaNamespaces = {
      findByStoreId: async (storeId: string) => {
        ensureActive();
        const record = this.state.mediaNamespaces.find((entry) => entry.storeId === storeId);
        return record ? structuredClone(record) : null;
      },
      create: async (record: StoreMediaNamespaceRecord) => {
        ensureActive();
        const expectedKeys = ["storeId", "namespacePrefix", "status", "version", "createdAt", "updatedAt"].sort();
        const actualKeys = Object.keys(record).sort();
        if (
          actualKeys.length !== expectedKeys.length ||
          actualKeys.some((key, index) => key !== expectedKeys[index]) ||
          record.namespacePrefix !== `stores/${record.storeId}/` ||
          record.status !== "active" ||
          record.version !== 1 ||
          record.createdAt !== record.updatedAt
        ) {
          throw new Error("Invalid media namespace record");
        }
        if (this.state.mediaNamespaces.some(
          (entry) => entry.storeId === record.storeId || entry.namespacePrefix === record.namespacePrefix,
        )) {
          throw new SaaSDataUniqueConflict("media_namespace");
        }
        this.state.mediaNamespaces.push(structuredClone(record));
        maybeFail("after_media_namespace_create");
        return structuredClone(record);
      },
    };

    this.settings = {
      find: async (storeId: string, key: string) => {
        ensureActive();
        return this.state.settings.find((record) => record.storeId === storeId && record.key === key) ?? null;
      },
      create: async (record: StoreSettingRecord) => {
        ensureActive();
        if (this.state.settings.some((entry) => entry.storeId === record.storeId && entry.key === record.key)) {
          throw new SaaSDataUniqueConflict("setting");
        }
        this.state.settings.push(structuredClone(record));
        maybeFail("after_setting_create");
        return structuredClone(record);
      },
    };

    this.operations = {
      claim: async (record: TenantOperationRecord) => {
        ensureActive();
        const existing = this.state.operations.find((entry) => entry.idempotencyKey === record.idempotencyKey);
        if (existing) {
          return { kind: "existing" as const, operation: structuredClone(existing) };
        }
        this.state.operations.push(structuredClone(record));
        maybeFail("after_operation_create");
        return { kind: "created" as const, operation: structuredClone(record) };
      },
      markCommitted: async (operationId: string, result: NonNullable<TenantOperationRecord["result"]>, updatedAt: string) => {
        ensureActive();
        const operation = this.state.operations.find((record) => record.id === operationId);
        if (!operation) {
          throw new Error("Tenant operation not found");
        }
        operation.status = "committed";
        operation.result = structuredClone(result);
        operation.updatedAt = updatedAt;
        maybeFail("after_operation_commit");
        return structuredClone(operation);
      },
    };
  }

  generateId(kind: SaaSGeneratedIdKind): string {
    if (this.completed) {
      throw new Error("Transaction already completed");
    }
    return this.nextId(kind);
  }

  async commit(): Promise<void> {
    if (this.completed) {
      throw new Error("Transaction already completed");
    }
    this.completed = true;
    this.publish(cloneState(this.state));
    this.release(true);
  }

  async rollback(): Promise<void> {
    if (this.completed) {
      throw new Error("Transaction already completed");
    }
    this.completed = true;
    this.release(false);
  }
}

export class InMemorySaaSDataRepository implements SaaSDataRepository {
  private state: SaaSDataState;
  private readonly counters = new Map<SaaSGeneratedIdKind, number>();
  private readonly metrics: InMemoryRepositoryMetrics = { begins: 0, commits: 0, rollbacks: 0 };
  private queue: Promise<void> = Promise.resolve();
  private readonly options: InMemorySaaSDataRepositoryOptions;

  constructor(options: InMemorySaaSDataRepositoryOptions = {}) {
    this.options = options;
    this.state = initialState(options.initialState);
  }

  async beginTransaction(): Promise<SaaSDataTransaction> {
    let releaseLock!: () => void;
    const lock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const previous = this.queue;
    this.queue = previous.then(() => lock);
    await previous;
    this.metrics.begins += 1;

    return new InMemoryTransaction(
      cloneState(this.state),
      this.options.failAt,
      (kind) => this.nextId(kind),
      (state) => {
        this.state = state;
      },
      (committed) => {
        if (committed) {
          this.metrics.commits += 1;
        } else {
          this.metrics.rollbacks += 1;
        }
        releaseLock();
      },
    );
  }

  inspectState(): Readonly<SaaSDataState> {
    return cloneState(this.state);
  }

  inspectMetrics(): Readonly<InMemoryRepositoryMetrics> {
    return { ...this.metrics };
  }

  private nextId(kind: SaaSGeneratedIdKind): string {
    const next = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, next);
    return `${kind}_${String(next).padStart(4, "0")}`;
  }
}

export function createInMemorySaaSDataRepository(
  options?: InMemorySaaSDataRepositoryOptions,
): InMemorySaaSDataRepository {
  return new InMemorySaaSDataRepository(options);
}
