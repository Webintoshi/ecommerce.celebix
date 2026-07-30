import type { QueryResult } from "pg";

import type { PlanFeatureKey } from "@celebix/saas-contracts";
import type { SaaSDataRepository, SaaSDataTransaction } from "../ports.ts";
import type {
  AdminDomainRecord, DomainRecord, MembershipRecord, PlanRecord, PrincipalRecord, SaaSGeneratedIdKind,
  StoreMediaNamespaceRecord, StoreRecord, StoreSettingRecord, SubscriptionRecord, TenantOperationRecord,
} from "../types.ts";
import { SaaSDataUniqueConflict } from "../errors.ts";
import {
  createCanonicalAdminOrigin,
  normalizeExactHttpsOrigin,
  parseCanonicalAdminHostname,
  type AdminOriginEnvironment,
} from "../panel-origin.ts";
import {
  SaaSDataPersistenceError,
  SaaSDataCorruptionError,
  SaaSDataTransactionStateError,
  SaaSDataUnknownCommitError,
  mapPostgresError,
} from "./errors.ts";
import { parseCreateStarterTenantResult, parseTenantOperationRow, postgresParserInternals as parse } from "./parsers.ts";
import { acquirePostgresClient, type PostgresClientLike, type PostgresPoolLike, type PostgresTimeoutOptions } from "./pool.ts";

export type { PostgresClientLike, PostgresPoolLike, PostgresTimeoutOptions } from "./pool.ts";
export interface PostgresAuditEvent { type: "tenant_bootstrap_commit_unknown"; }

export interface PostgresRepositoryOptions {
  pool: PostgresPoolLike;
  generateId(kind: SaaSGeneratedIdKind): string;
  audit(event: PostgresAuditEvent): void | Promise<void>;
  timeouts: PostgresTimeoutOptions;
  bootstrapRole: "celebix_saas_bootstrap";
  panelOrigin: string;
  adminOriginEnvironment?: AdminOriginEnvironment;
}

export type PostgresFailurePoint =
  | "after_operation_claim" | "after_principal_create_or_update" | "after_store_create"
  | "after_domain_create" | "after_admin_domain_create" | "after_membership_create" | "after_subscription_create"
  | "after_media_namespace_create"
  | "after_each_setting_create" | "before_mark_committed" | "after_mark_committed"
  | "before_commit" | "commit_forwarded_then_connection_failure" | "commit_blocked_before_forwarding";

const TEST_FAILURES = new WeakMap<PostgresRepositoryOptions, PostgresFailurePoint>();
export function registerPostgresTestFailure(options: PostgresRepositoryOptions, failAt: PostgresFailurePoint): void {
  TEST_FAILURES.set(options, failAt);
}

type State = "active" | "committed" | "rolled_back" | "commit_unknown" | "broken";

function stateError(state: Exclude<State, "active">): SaaSDataTransactionStateError {
  const code = state === "committed" ? "transaction_already_committed"
    : state === "rolled_back" ? "transaction_already_rolled_back"
      : state === "commit_unknown" ? "transaction_commit_unknown" : "transaction_broken";
  return new SaaSDataTransactionStateError(code);
}

class PostgresTransaction implements SaaSDataTransaction {
  private state: State = "active";
  private readonly client: PostgresClientLike;
  private readonly idGenerator: (kind: SaaSGeneratedIdKind) => string;
  private readonly audit: (event: PostgresAuditEvent) => void | Promise<void>;
  private readonly failAt: PostgresFailurePoint | undefined;
  private readonly panelOrigin: string;
  private readonly adminOriginEnvironment: AdminOriginEnvironment;

  readonly principals;
  readonly stores;
  readonly domains;
  readonly adminDomains;
  readonly memberships;
  readonly plans;
  readonly subscriptions;
  readonly mediaNamespaces;
  readonly settings;
  readonly operations;

  constructor(
    client: PostgresClientLike,
    idGenerator: (kind: SaaSGeneratedIdKind) => string,
    audit: (event: PostgresAuditEvent) => void | Promise<void>,
    panelOrigin: string,
    adminOriginEnvironment: AdminOriginEnvironment,
    failAt?: PostgresFailurePoint,
  ) {
    this.client = client;
    this.idGenerator = idGenerator;
    this.audit = audit;
    this.panelOrigin = panelOrigin;
    this.adminOriginEnvironment = adminOriginEnvironment;
    this.failAt = failAt;
    this.principals = {
      findByIdentity: async (issuer: string, subject: string) => this.optional(
        `SELECT id, issuer, subject, email, email_verified, created_at, updated_at
         FROM saas.principals WHERE issuer = $1 AND subject = $2`, [issuer, subject], principalRow,
      ),
      create: async (value: PrincipalRecord) => this.after(this.required(
        `INSERT INTO saas.principals (id, issuer, subject, email, email_verified, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, issuer, subject, email, email_verified, created_at, updated_at`,
        [value.id, value.issuer, value.subject, value.email, value.emailVerified, value.createdAt, value.updatedAt], principalRow,
      ), "after_principal_create_or_update"),
      updateVerifiedEmail: async (id: string, email: string, updatedAt: string) => this.after(this.required(
        `UPDATE saas.principals SET email = $2, email_verified = true, updated_at = $3 WHERE id = $1
         RETURNING id, issuer, subject, email, email_verified, created_at, updated_at`, [id, email, updatedAt], principalRow,
      ), "after_principal_create_or_update"),
    };
    this.stores = {
      findBySlug: async (slug: string) => this.optional(
        `SELECT id, name, slug, status, locale, currency, theme_key, created_at, updated_at
         FROM saas.stores WHERE slug = $1`, [slug], storeRow,
      ),
      create: async (value: StoreRecord) => this.after(this.required(
        `INSERT INTO saas.stores (id, name, slug, status, locale, currency, theme_key, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, name, slug, status, locale, currency, theme_key, created_at, updated_at`,
        [value.id, value.name, value.slug, value.status, value.locale, value.currency, value.themeKey, value.createdAt, value.updatedAt], storeRow,
      ), "after_store_create"),
    };
    this.domains = {
      findByHostname: async (hostname: string) => this.optional(
        `SELECT id, store_id, normalized_hostname, domain_type, status, canonical, cache_version, created_at, updated_at
         FROM saas.domains WHERE normalized_hostname = $1`, [hostname], domainRow,
      ),
      create: async (value: DomainRecord) => this.after(this.required(
        `INSERT INTO saas.domains (id, store_id, normalized_hostname, domain_type, status, canonical, cache_version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, store_id, normalized_hostname, domain_type, status, canonical, cache_version, created_at, updated_at`,
        [value.id, value.storeId, value.hostname, value.type, value.status, value.canonical, value.cacheVersion, value.createdAt, value.updatedAt], domainRow,
      ), "after_domain_create"),
    };
    this.adminDomains = {
      provisionCanonical: async (value: AdminDomainRecord) => this.after(
        this.provisionCanonicalAdminDomain(value),
        "after_admin_domain_create",
      ),
    };
    this.memberships = {
      find: async (principalId: string, storeId: string, role: string) => this.optional(
        `SELECT id, principal_id, store_id, role, status, created_at, updated_at
         FROM saas.memberships WHERE principal_id = $1 AND store_id = $2 AND role = $3`, [principalId, storeId, role], membershipRow,
      ),
      create: async (value: MembershipRecord) => this.after(this.required(
        `INSERT INTO saas.memberships (id, principal_id, store_id, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, principal_id, store_id, role, status, created_at, updated_at`,
        [value.id, value.principalId, value.storeId, value.role, value.status, value.createdAt, value.updatedAt], membershipRow,
      ), "after_membership_create"),
    };
    this.plans = { findByCodeVersion: async (code: string, version: number) => this.loadPlan(code, version) };
    this.subscriptions = {
      findActiveByStoreId: async (storeId: string) => this.optional(
        `SELECT id, store_id, plan_id, plan_code, plan_version, status, valid_from, valid_until, created_at, updated_at
         FROM saas.subscriptions WHERE store_id = $1 AND status = 'active'`, [storeId], subscriptionRow,
      ),
      create: async (value: SubscriptionRecord) => this.after(this.required(
        `INSERT INTO saas.subscriptions (id, store_id, plan_id, plan_code, plan_version, status, valid_from, valid_until, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, store_id, plan_id, plan_code, plan_version, status, valid_from, valid_until, created_at, updated_at`,
        [value.id, value.storeId, value.planId, value.planCode, value.planVersion, value.status, value.validFrom, value.validUntil ?? null, value.createdAt, value.updatedAt], subscriptionRow,
      ), "after_subscription_create"),
    };
    this.mediaNamespaces = {
      findByStoreId: async (storeId: string) => this.optional(
        `SELECT store_id, namespace_prefix, status, version, created_at, updated_at
         FROM saas.store_media_namespaces WHERE store_id = $1`, [storeId], mediaNamespaceRow,
      ),
      create: async (value: StoreMediaNamespaceRecord) => {
        if (
          value.namespacePrefix !== `stores/${value.storeId}/` ||
          value.status !== "active" ||
          value.version !== 1 ||
          value.createdAt !== value.updatedAt
        ) {
          throw new SaaSDataPersistenceError();
        }
        const created = await this.after(this.required(
          `INSERT INTO saas.store_media_namespaces
             (store_id, namespace_prefix, status, version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING store_id, namespace_prefix, status, version, created_at, updated_at`,
          [value.storeId, value.namespacePrefix, value.status, value.version, value.createdAt, value.updatedAt],
          mediaNamespaceRow,
        ), "after_media_namespace_create");
        if (
          created.storeId !== value.storeId ||
          created.namespacePrefix !== value.namespacePrefix ||
          created.status !== value.status ||
          created.version !== value.version ||
          created.createdAt !== value.createdAt ||
          created.updatedAt !== value.updatedAt
        ) {
          throw new SaaSDataCorruptionError();
        }
        return created;
      },
    };
    this.settings = {
      find: async (storeId: string, key: string) => this.optional(
        `SELECT id, store_id, key, value, created_at, updated_at FROM saas.store_settings WHERE store_id = $1 AND key = $2`, [storeId, key], settingRow,
      ),
      create: async (value: StoreSettingRecord) => this.after(this.required(
        `INSERT INTO saas.store_settings (id, store_id, key, value, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, store_id, key, value, created_at, updated_at`, [value.id, value.storeId, value.key, JSON.stringify(value.value), value.createdAt, value.updatedAt], settingRow,
      ), "after_each_setting_create"),
    };
    this.operations = {
      claim: async (value: TenantOperationRecord) => this.claimOperation(value),
      markCommitted: async (
        operationId: string,
        result: NonNullable<TenantOperationRecord["result"]>,
        updatedAt: string,
      ) => this.markCommitted(operationId, result, updatedAt),
    };
  }

  private ensureActive(): void {
    if (this.state !== "active") throw stateError(this.state);
  }

  private checkpoint(point: PostgresFailurePoint): void {
    if (this.failAt === point) throw new SaaSDataPersistenceError();
  }

  private async after<T>(promise: Promise<T>, point: PostgresFailurePoint): Promise<T> {
    const value = await promise;
    this.checkpoint(point);
    return value;
  }

  private async query(text: string, values: unknown[] = []): Promise<QueryResult<Record<string, unknown>>> {
    this.ensureActive();
    try { return await this.client.query(text, values); } catch (error) { throw mapPostgresError(error); }
  }

  private async optional<T>(text: string, values: unknown[], parser: (row: unknown) => T): Promise<T | null> {
    const result = await this.query(text, values);
    if (result.rows.length === 0) return null;
    if (result.rows.length !== 1) throw new SaaSDataCorruptionError();
    return parser(result.rows[0]);
  }

  private async required<T>(text: string, values: unknown[], parser: (row: unknown) => T): Promise<T> {
    const value = await this.optional(text, values, parser);
    if (!value) throw new SaaSDataCorruptionError();
    return value;
  }

  private async loadPlan(code: string, version: number): Promise<PlanRecord | null> {
    const base = await this.optional(
      `SELECT id, plan_code, version, status, valid_from, valid_until FROM saas.plans WHERE plan_code = $1 AND version = $2`,
      [code, version], planBaseRow,
    );
    if (!base) return null;
    const featuresResult = await this.query(
      `SELECT feature_key FROM saas.plan_features WHERE plan_id = $1 AND enabled = true ORDER BY feature_ordinal`, [base.id],
    );
    const limitsResult = await this.query(
      `SELECT limit_key, effective_limit FROM saas.plan_limits WHERE plan_id = $1 ORDER BY limit_ordinal`, [base.id],
    );
    return completePlan(base, featuresResult.rows, limitsResult.rows);
  }

  private async provisionCanonicalAdminDomain(value: AdminDomainRecord): Promise<AdminDomainRecord> {
    let slug: string;
    try {
      slug = parseCanonicalAdminHostname(value.hostname, this.adminOriginEnvironment);
    } catch {
      throw new SaaSDataPersistenceError();
    }
    if (
      Object.keys(value).sort().join(",") !== [
        "canonical", "createdAt", "hostname", "id", "kind", "status", "storeId",
        "updatedAt", "verifiedAt", "version",
      ].sort().join(",") ||
      value.kind !== "platform_subdomain" || value.status !== "active" || value.canonical !== true ||
      value.version !== 1 || value.verifiedAt !== value.createdAt || value.createdAt !== value.updatedAt ||
      createCanonicalAdminOrigin(slug, this.adminOriginEnvironment) !== `https://${value.hostname}`
    ) {
      throw new SaaSDataPersistenceError();
    }
    const response = await this.query(
      "SELECT outcome, authority FROM saas.provision_canonical_admin_domain($1, $2, $3, $4::timestamptz)",
      [value.id, value.storeId, value.hostname, value.createdAt],
    );
    if (response.rows.length !== 1) throw new SaaSDataCorruptionError();
    const row = exactRow(response.rows[0], ["outcome", "authority"]);
    const outcome = text(row.outcome);
    if (outcome === "admin_domain_conflict") throw new SaaSDataUniqueConflict("admin_domain_hostname");
    if (outcome !== "provisioned" && outcome !== "operation_replayed") {
      throw new SaaSDataPersistenceError();
    }
    const authority = exactRow(row.authority, ["storeSlug", "canonicalAdminOrigin"]);
    if (
      text(authority.storeSlug) !== slug ||
      text(authority.canonicalAdminOrigin) !== createCanonicalAdminOrigin(slug, this.adminOriginEnvironment)
    ) throw new SaaSDataCorruptionError();
    return structuredClone(value);
  }

  private async claimOperation(value: TenantOperationRecord) {
    const insert = await this.query(
      `INSERT INTO saas.tenant_operations (id, idempotency_key, payload_fingerprint, status, requested_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id, idempotency_key, payload_fingerprint, status, result_payload, created_at, updated_at`,
      [value.id, value.idempotencyKey, value.fingerprint, value.status, value.createdAt, value.createdAt, value.updatedAt],
    );
    if (insert.rows.length === 1) {
      const claim = { kind: "created" as const, operation: parseTenantOperationRow(insert.rows[0], this.panelOrigin, this.adminOriginEnvironment) };
      this.checkpoint("after_operation_claim");
      return claim;
    }
    if (insert.rows.length !== 0) throw new SaaSDataCorruptionError();
    const winner = await this.required(
      `SELECT id, idempotency_key, payload_fingerprint, status, result_payload, created_at, updated_at
      FROM saas.tenant_operations WHERE idempotency_key = $1`, [value.idempotencyKey], (row) => parseTenantOperationRow(row, this.panelOrigin, this.adminOriginEnvironment),
    );
    this.checkpoint("after_operation_claim");
    return { kind: "existing" as const, operation: winner };
  }

  private async markCommitted(operationId: string, resultPayload: NonNullable<TenantOperationRecord["result"]>, updatedAt: string) {
    const result = parseCreateStarterTenantResult(resultPayload, this.panelOrigin, this.adminOriginEnvironment);
    this.checkpoint("before_mark_committed");
    const subscription = await this.required(
      `SELECT id FROM saas.subscriptions WHERE store_id = $1 AND plan_id = $2 AND status = 'active'`,
      [result.store.id, result.plan.planId], subscriptionIdRow,
    );
    const committed = await this.required(
      `UPDATE saas.tenant_operations
       SET status = 'committed', result_store_id = $2, result_domain_id = $3, result_membership_id = $4,
           result_principal_id = $5, result_subscription_id = $6, result_plan_id = $7,
           result_payload = $8::jsonb, committed_at = $9, updated_at = $9
       WHERE id = $1 AND status = 'processing'
       RETURNING id, idempotency_key, payload_fingerprint, status, result_payload, created_at, updated_at`,
      [operationId, result.store.id, result.primaryDomain.domainId, result.membership.id,
        result.membership.principalId, subscription, result.plan.planId, JSON.stringify(result), updatedAt],
      (row) => parseTenantOperationRow(row, this.panelOrigin, this.adminOriginEnvironment),
    );
    this.checkpoint("after_mark_committed");
    return committed;
  }

  generateId(kind: SaaSGeneratedIdKind): string {
    this.ensureActive();
    return this.idGenerator(kind);
  }

  private emitUnknownCommitAuditBestEffort(): void {
    try {
      const pending = this.audit({ type: "tenant_bootstrap_commit_unknown" });
      if (pending) void pending.catch(() => undefined);
    } catch {
      // Audit is deliberately bounded and cannot replace transaction authority.
    }
  }

  private failUnknownCommit(): never {
    this.state = "commit_unknown";
    try { this.client.release(true); } catch { /* Client eviction is best effort after an unknown COMMIT. */ }
    this.emitUnknownCommitAuditBestEffort();
    throw new SaaSDataUnknownCommitError();
  }

  async commit(): Promise<void> {
    this.ensureActive();
    this.checkpoint("before_commit");
    if (this.failAt === "commit_blocked_before_forwarding") {
      this.failUnknownCommit();
    }
    try {
      await this.client.query("COMMIT");
      if (this.failAt === "commit_forwarded_then_connection_failure") throw new SaaSDataUnknownCommitError();
      this.state = "committed";
      this.client.release();
    } catch { this.failUnknownCommit(); }
  }

  async rollback(): Promise<void> {
    this.ensureActive();
    try {
      await this.client.query("ROLLBACK");
      this.state = "rolled_back";
      this.client.release();
    } catch (error) {
      this.state = "broken";
      this.client.release(true);
      throw mapPostgresError(error);
    }
  }
}

function text(value: unknown): string { if (typeof value !== "string") throw new SaaSDataCorruptionError(); return value; }
function exactRow(value: unknown, keys: readonly string[]) { return parse.exact(value, keys); }
function dbInteger(value: unknown, minimum = 0): number {
  const numeric = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return parse.integer(numeric, minimum);
}

function principalRow(value: unknown): PrincipalRecord {
  const row = exactRow(value, ["id", "issuer", "subject", "email", "email_verified", "created_at", "updated_at"]);
  if (row.email_verified !== true) throw new SaaSDataCorruptionError();
  return { id: parse.uuid(row.id) as PrincipalRecord["id"], issuer: text(row.issuer), subject: text(row.subject), email: text(row.email), emailVerified: true, createdAt: parse.timestamp(row.created_at), updatedAt: parse.timestamp(row.updated_at) };
}
function storeRow(value: unknown): StoreRecord {
  const row = exactRow(value, ["id", "name", "slug", "status", "locale", "currency", "theme_key", "created_at", "updated_at"]);
  const slug = text(row.slug); if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !["provisioning", "active", "suspended", "failed"].includes(text(row.status))) throw new SaaSDataCorruptionError();
  return { id: parse.uuid(row.id) as StoreRecord["id"], name: text(row.name), slug, status: row.status as StoreRecord["status"], locale: text(row.locale), currency: text(row.currency), themeKey: text(row.theme_key), createdAt: parse.timestamp(row.created_at), updatedAt: parse.timestamp(row.updated_at) };
}
function domainRow(value: unknown): DomainRecord {
  const row = exactRow(value, ["id", "store_id", "normalized_hostname", "domain_type", "status", "canonical", "cache_version", "created_at", "updated_at"]);
  const hostname = text(row.normalized_hostname); if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(hostname) || !["platform_subdomain", "custom"].includes(text(row.domain_type)) || !["pending_verification", "active", "disabled"].includes(text(row.status))) throw new SaaSDataCorruptionError();
  return { id: parse.uuid(row.id) as DomainRecord["id"], storeId: parse.uuid(row.store_id) as DomainRecord["storeId"], hostname, type: row.domain_type as DomainRecord["type"], status: row.status as DomainRecord["status"], canonical: parse.boolean(row.canonical), cacheVersion: dbInteger(row.cache_version, 1), createdAt: parse.timestamp(row.created_at), updatedAt: parse.timestamp(row.updated_at) };
}
function membershipRow(value: unknown): MembershipRecord {
  const row = exactRow(value, ["id", "principal_id", "store_id", "role", "status", "created_at", "updated_at"]);
  if (!["store_owner", "admin", "editor", "analyst"].includes(text(row.role)) || !["active", "invited", "revoked"].includes(text(row.status))) throw new SaaSDataCorruptionError();
  return { schemaVersion: 1, id: parse.uuid(row.id) as MembershipRecord["id"], principalId: parse.uuid(row.principal_id) as MembershipRecord["principalId"], storeId: parse.uuid(row.store_id) as MembershipRecord["storeId"], role: row.role as MembershipRecord["role"], status: row.status as MembershipRecord["status"], createdAt: parse.timestamp(row.created_at), updatedAt: parse.timestamp(row.updated_at) };
}
function subscriptionRow(value: unknown): SubscriptionRecord {
  const row = exactRow(value, ["id", "store_id", "plan_id", "plan_code", "plan_version", "status", "valid_from", "valid_until", "created_at", "updated_at"]);
  if (!["active", "inactive", "expired"].includes(text(row.status))) throw new SaaSDataCorruptionError();
  return { id: parse.uuid(row.id), storeId: parse.uuid(row.store_id) as SubscriptionRecord["storeId"], planId: parse.uuid(row.plan_id) as SubscriptionRecord["planId"], planCode: text(row.plan_code), planVersion: dbInteger(row.plan_version, 1), status: row.status as SubscriptionRecord["status"], validFrom: parse.timestamp(row.valid_from), ...(row.valid_until === null ? {} : { validUntil: parse.timestamp(row.valid_until) }), createdAt: parse.timestamp(row.created_at), updatedAt: parse.timestamp(row.updated_at) };
}
function settingRow(value: unknown): StoreSettingRecord {
  const row = exactRow(value, ["id", "store_id", "key", "value", "created_at", "updated_at"]);
  const key = text(row.key); if (!["locale", "currency", "themeKey"].includes(key) || typeof row.value !== "string") throw new SaaSDataCorruptionError();
  return { id: parse.uuid(row.id), storeId: parse.uuid(row.store_id) as StoreSettingRecord["storeId"], key, value: row.value, createdAt: parse.timestamp(row.created_at), updatedAt: parse.timestamp(row.updated_at) };
}
function mediaNamespaceRow(value: unknown): StoreMediaNamespaceRecord {
  const row = exactRow(value, ["store_id", "namespace_prefix", "status", "version", "created_at", "updated_at"]);
  const storeId = parse.uuid(row.store_id) as StoreMediaNamespaceRecord["storeId"];
  const namespacePrefix = text(row.namespace_prefix);
  const status = text(row.status);
  const version = dbInteger(row.version, 1);
  const createdAt = parse.timestamp(row.created_at);
  const updatedAt = parse.timestamp(row.updated_at);
  if (
    namespacePrefix !== `stores/${storeId}/` ||
    !["active", "suspended", "deleting", "deleted"].includes(status) ||
    updatedAt < createdAt
  ) {
    throw new SaaSDataCorruptionError();
  }
  return {
    storeId,
    namespacePrefix,
    status: status as StoreMediaNamespaceRecord["status"],
    version,
    createdAt,
    updatedAt,
  };
}
function planBaseRow(value: unknown) {
  const row = exactRow(value, ["id", "plan_code", "version", "status", "valid_from", "valid_until"]);
  if (!["active", "inactive", "expired"].includes(text(row.status))) throw new SaaSDataCorruptionError();
  return { id: parse.uuid(row.id) as PlanRecord["id"], code: text(row.plan_code), version: dbInteger(row.version, 1), status: row.status as PlanRecord["status"], validFrom: parse.timestamp(row.valid_from), ...(row.valid_until === null ? {} : { validUntil: parse.timestamp(row.valid_until) }) };
}
function completePlan(base: ReturnType<typeof planBaseRow>, featureRows: unknown[], limitRows: unknown[]): PlanRecord {
  const allowedFeatures = new Set(["catalog", "orders", "customers", "content", "media", "analytics", "checkout", "custom_domains", "staff_management", "promotions", "integrations", "accounting", "marketplaces"]);
  const features: PlanFeatureKey[] = []; const seen = new Set<string>();
  for (const value of featureRows) { const row = exactRow(value, ["feature_key"]); const key = text(row.feature_key); if (!allowedFeatures.has(key) || seen.has(key)) throw new SaaSDataCorruptionError(); seen.add(key); features.push(key as PlanFeatureKey); }
  if (features.length === 0) throw new SaaSDataCorruptionError();
  const limits: Record<string, number> = {};
  for (const value of limitRows) { const row = exactRow(value, ["limit_key", "effective_limit"]); const key = text(row.limit_key); if (!["products", "staff", "storageBytes", "monthlyOrders", "customDomains"].includes(key) || key in limits) throw new SaaSDataCorruptionError(); limits[key] = dbInteger(row.effective_limit); }
  if (Object.keys(limits).length !== 5) throw new SaaSDataCorruptionError();
  return { ...base, features, limits: limits as unknown as PlanRecord["limits"] };
}
function subscriptionIdRow(value: unknown): string { const row = exactRow(value, ["id"]); return parse.uuid(row.id); }

function timeout(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw new SaaSDataPersistenceError();
  return `${value}ms`;
}

export class PostgresSaaSDataRepository implements SaaSDataRepository {
  private readonly options: PostgresRepositoryOptions;
  private readonly panelOrigin: string;
  private readonly adminOriginEnvironment: AdminOriginEnvironment;

  constructor(options: PostgresRepositoryOptions) {
    if (options.bootstrapRole !== "celebix_saas_bootstrap") throw new SaaSDataPersistenceError();
    this.options = options;
    try { this.panelOrigin = normalizeExactHttpsOrigin(options.panelOrigin); }
    catch { throw new SaaSDataPersistenceError(); }
    if (options.adminOriginEnvironment !== undefined && options.adminOriginEnvironment !== "production" && options.adminOriginEnvironment !== "staging") {
      throw new SaaSDataPersistenceError();
    }
    this.adminOriginEnvironment = options.adminOriginEnvironment ?? "production";
  }

  async beginTransaction(): Promise<SaaSDataTransaction> {
    const client = await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs);
    let began = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      began = true;
      await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
      await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
      await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
      await client.query("SET LOCAL ROLE celebix_saas_bootstrap");
      return new PostgresTransaction(
        client,
        this.options.generateId,
        this.options.audit,
        this.panelOrigin,
        this.adminOriginEnvironment,
        TEST_FAILURES.get(this.options),
      );
    } catch (error) {
      if (began) {
        try { await client.query("ROLLBACK"); client.release(); }
        catch { client.release(true); }
      } else client.release(true);
      throw mapPostgresError(error);
    }
  }
}
