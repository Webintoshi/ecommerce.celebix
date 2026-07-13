import type {
  PlanEntitlements,
  PlanFeatureKey,
  PlanLimitKey,
  StoreMembershipRole,
  TenantContext,
} from "@celebix/saas-contracts";

import { assertPanelSessionPersistenceApproval } from "./activation.ts";
import {
  PanelSessionCredentialError,
  createPanelSessionCredentialCodec,
} from "./credential-codec.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:@/-]{1,512}$/;
const MAXIMUM_SESSION_MS = 8 * 60 * 60_000;
const MAXIMUM_CLOCK_SKEW_MS = 30_000;
const MAXIMUM_TIMEOUT_MS = 60_000;
const MAXIMUM_CLEANUP_LIMIT = 500;
const FEATURE_KEYS = new Set<PlanFeatureKey>([
  "catalog", "orders", "customers", "content", "media", "analytics", "checkout",
  "custom_domains", "staff_management", "promotions", "integrations", "accounting", "marketplaces",
]);
const LIMIT_KEYS = new Set<PlanLimitKey>(["products", "staff", "storageBytes", "monthlyOrders", "customDomains"]);
const MEMBERSHIP_ROLES = new Set<StoreMembershipRole>(["store_owner", "admin", "editor", "analyst"]);
const REVOCATION_REASONS = new Set<PanelSessionRevocationReason>(["logout", "rotation", "security", "administrative", "expired"]);

interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number | null;
}

interface PostgresClient {
  query(text: string, values?: readonly unknown[]): Promise<QueryResult>;
  release(destroy?: boolean | Error): void;
}

interface PostgresPool {
  connect(): Promise<PostgresClient>;
}

interface RepositoryDependencies {
  pool: PostgresPool;
  keys: ReadonlyMap<string, Uint8Array>;
  activeKeyId: string;
  clock(): Date;
  randomBytes(size: number): Uint8Array;
  timeouts: {
    poolCheckoutMs: number;
    statementMs: number;
    lockMs: number;
    idleTransactionMs: number;
  };
  cleanupLimit: number;
  audit(event: PanelSessionAuditEvent): void | Promise<void>;
}

export type PanelSessionSafeKind =
  | "issued"
  | "resolved"
  | "rotated"
  | "revoked"
  | "family_revoked"
  | "expired"
  | "unauthenticated"
  | "membership_denied"
  | "operation_replayed"
  | "operation_mismatch"
  | "commit_unknown"
  | "unavailable"
  | "durable_authority_invalid";

export type PanelSessionRevocationReason = "logout" | "rotation" | "security" | "administrative" | "expired";

export interface PersistedPanelSession {
  sessionId: string;
  familyId: string;
  principalId: string;
  activeStoreId?: string;
  version: number;
  issuedAt: string;
  rotatedAt: string;
  expiresAt: string;
}

export interface PanelSessionAuditEvent {
  operation: "issue" | "resolve" | "rotate" | "revoke" | "revoke_family" | "cleanup" | "recover";
  result: PanelSessionSafeKind;
}

type AuthorityResult =
  | { kind: "issued" | "operation_replayed"; credential: string; session: PersistedPanelSession }
  | { kind: "rotated" | "operation_replayed"; credential: string; session: PersistedPanelSession }
  | { kind: "operation_replayed"; session: PersistedPanelSession }
  | { kind: "commit_unknown"; credential: string }
  | { kind: Exclude<PanelSessionSafeKind, "issued" | "resolved" | "rotated" | "revoked" | "family_revoked" | "expired" | "operation_replayed" | "commit_unknown"> };

export type PanelSessionResolveResult =
  | {
      kind: "resolved";
      session: PersistedPanelSession;
      tenantContext?: TenantContext;
      selectionCandidate?: { storeId: string };
    }
  | { kind: "unauthenticated" | "membership_denied" | "durable_authority_invalid" | "unavailable" };

export interface PostgresPanelSessionRepository {
  issueSession(input: { operationId: string; principalId: string; activeStoreId?: string; now: Date }): Promise<AuthorityResult>;
  resolveSession(input: { credential: string; requestId: string; now: Date }): Promise<PanelSessionResolveResult>;
  rotateSession(input: { currentCredential: string; operationId: string; requestedStoreId?: string; now: Date }): Promise<AuthorityResult>;
  revokeSession(input: { credential: string; reason: PanelSessionRevocationReason; now: Date }): Promise<{ kind: PanelSessionSafeKind }>;
  revokeSessionFamily(input: { credential: string; reason: PanelSessionRevocationReason; now: Date }): Promise<{ kind: PanelSessionSafeKind }>;
  expireDueSessions(input: { now: Date }): Promise<{ kind: PanelSessionSafeKind; count?: number }>;
  recoverOperation(input:
    | { operationId: string; operationKind: "issue"; credential: string; principalId: string; activeStoreId?: string }
    | { operationId: string; operationKind: "rotate"; credential: string; currentCredential: string }
  ): Promise<AuthorityResult>;
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid");
  return value as Record<string, unknown>;
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const row = object(value);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !(key in row)) || Object.keys(row).some((key) => !allowed.has(key))) throw new Error("invalid");
  return row;
}

function string(value: unknown, maximum = 2048): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value.trim() !== value) throw new Error("invalid");
  return value;
}

function uuid(value: unknown): string {
  const parsed = string(value, 36);
  if (!UUID_PATTERN.test(parsed)) throw new Error("invalid");
  return parsed;
}

function integer(value: unknown, minimum = 1): number {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || (parsed as number) < minimum) throw new Error("invalid");
  return parsed as number;
}

function timestamp(value: unknown): string {
  const normalized = value instanceof Date ? value.toISOString() : string(value, 32);
  const milliseconds = Date.parse(normalized);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== normalized) throw new Error("invalid");
  return normalized;
}

function sessionAuthority(value: unknown): PersistedPanelSession {
  const row = exact(value, ["sessionId", "familyId", "principalId", "version", "issuedAt", "rotatedAt", "expiresAt"], ["activeStoreId"]);
  const issuedAt = timestamp(row.issuedAt);
  const rotatedAt = timestamp(row.rotatedAt);
  const expiresAt = timestamp(row.expiresAt);
  const issued = Date.parse(issuedAt);
  const rotated = Date.parse(rotatedAt);
  const expires = Date.parse(expiresAt);
  if (issued > rotated || rotated >= expires || expires > issued + MAXIMUM_SESSION_MS) throw new Error("invalid");
  return {
    sessionId: uuid(row.sessionId),
    familyId: uuid(row.familyId),
    principalId: uuid(row.principalId),
    ...(row.activeStoreId === undefined ? {} : { activeStoreId: uuid(row.activeStoreId) }),
    version: integer(row.version),
    issuedAt,
    rotatedAt,
    expiresAt,
  };
}

function entitlements(value: unknown): PlanEntitlements {
  const row = exact(value, ["schemaVersion", "planId", "planCode", "version", "status", "features", "limits", "validFrom"], ["validUntil"]);
  if (row.schemaVersion !== 1 || row.status !== "active" || !Array.isArray(row.features)) throw new Error("invalid");
  const features: PlanFeatureKey[] = [];
  const seen = new Set<string>();
  for (const feature of row.features) {
    if (typeof feature !== "string" || !FEATURE_KEYS.has(feature as PlanFeatureKey) || seen.has(feature)) throw new Error("invalid");
    seen.add(feature);
    features.push(feature as PlanFeatureKey);
  }
  const rawLimits = exact(row.limits, ["products", "staff", "storageBytes"], ["monthlyOrders", "customDomains"]);
  const limits: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawLimits)) {
    if (!LIMIT_KEYS.has(key as PlanLimitKey)) throw new Error("invalid");
    limits[key] = integer(value, 0);
  }
  const parsed: PlanEntitlements = {
    schemaVersion: 1,
    planId: uuid(row.planId),
    planCode: string(row.planCode, 80),
    version: integer(row.version),
    status: "active",
    features,
    limits: limits as unknown as PlanEntitlements["limits"],
    validFrom: timestamp(row.validFrom),
  };
  if (row.validUntil !== undefined) parsed.validUntil = timestamp(row.validUntil);
  return parsed;
}

function resolvedAuthority(value: unknown, requestId: string): Extract<PanelSessionResolveResult, { kind: "resolved" }> {
  const authority = exact(value, ["session", "principal"], ["tenant", "selectionCandidate"]);
  const session = sessionAuthority(authority.session);
  const principal = exact(authority.principal, ["issuer", "subject"]);
  if (authority.tenant !== undefined && authority.selectionCandidate !== undefined) throw new Error("invalid");
  if (authority.tenant !== undefined) {
    if (!session.activeStoreId) throw new Error("invalid");
    const tenant = exact(authority.tenant, ["store", "membership", "entitlements", "locale"]);
    const store = exact(tenant.store, ["id", "slug", "status"]);
    const membership = exact(tenant.membership, ["id", "role", "status"]);
    const storeId = uuid(store.id);
    if (store.status !== "active" || storeId !== session.activeStoreId || membership.status !== "active") throw new Error("invalid");
    const role = string(membership.role, 32) as StoreMembershipRole;
    if (!MEMBERSHIP_ROLES.has(role)) throw new Error("invalid");
    return {
      kind: "resolved",
      session,
      tenantContext: {
        schemaVersion: 1,
        requestId,
        principal: { id: session.principalId, issuer: string(principal.issuer), subject: string(principal.subject, 512) },
        store: { id: storeId, slug: string(store.slug, 63), status: "active" },
        membership: { id: uuid(membership.id), role, status: "active" },
        entitlements: entitlements(tenant.entitlements),
        locale: string(tenant.locale, 16),
      },
    };
  }
  if (!authority.selectionCandidate || session.activeStoreId) throw new Error("invalid");
  const candidate = exact(authority.selectionCandidate, ["storeId"]);
  return { kind: "resolved", session, selectionCandidate: { storeId: uuid(candidate.storeId) } };
}

function safeInteger(value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error("panel_session_repository_invalid");
  return value;
}

function validateDependencies(input: RepositoryDependencies): RepositoryDependencies {
  if (!input || !input.pool || typeof input.pool.connect !== "function" || typeof input.clock !== "function" || typeof input.randomBytes !== "function" || typeof input.audit !== "function") {
    throw new Error("panel_session_repository_invalid");
  }
  safeInteger(input.timeouts.poolCheckoutMs, MAXIMUM_TIMEOUT_MS);
  safeInteger(input.timeouts.statementMs, MAXIMUM_TIMEOUT_MS);
  safeInteger(input.timeouts.lockMs, MAXIMUM_TIMEOUT_MS);
  safeInteger(input.timeouts.idleTransactionMs, MAXIMUM_TIMEOUT_MS);
  safeInteger(input.cleanupLimit, MAXIMUM_CLEANUP_LIMIT);
  return input;
}

function canonicalNow(value: Date, clock: () => Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("invalid");
  const trusted = clock();
  if (!(trusted instanceof Date) || !Number.isFinite(trusted.getTime()) || Math.abs(value.getTime() - trusted.getTime()) > MAXIMUM_CLOCK_SKEW_MS) {
    throw new Error("invalid");
  }
  return new Date(value);
}

function createUuid(randomBytes: (size: number) => Uint8Array): string {
  const value = randomBytes(16);
  if (!(value instanceof Uint8Array) || value.byteLength !== 16) throw new Error("invalid");
  const bytes = new Uint8Array(value);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function oneRow(result: QueryResult): Record<string, unknown> {
  if (result.rows.length !== 1 || result.rowCount !== 1) throw new Error("invalid");
  return exact(result.rows[0], ["outcome", "authority"]);
}

function outcome(value: unknown): PanelSessionSafeKind {
  const parsed = string(value, 64) as PanelSessionSafeKind;
  if (![
    "issued", "resolved", "rotated", "revoked", "family_revoked", "expired", "unauthenticated",
    "membership_denied", "operation_replayed", "operation_mismatch", "commit_unknown", "unavailable",
    "durable_authority_invalid",
  ].includes(parsed)) throw new Error("invalid");
  return parsed;
}

async function acquire(dependencies: RepositoryDependencies): Promise<PostgresClient> {
  const pending = Promise.resolve().then(() => dependencies.pool.connect());
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { timedOut = true; reject(new Error("timeout")); }, dependencies.timeouts.poolCheckoutMs);
  });
  try {
    return await Promise.race([pending, deadline]);
  } catch {
    if (timedOut) void pending.then((client) => client.release(true)).catch(() => undefined);
    throw new Error("unavailable");
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type TransactionResult<T> = { status: "ok"; value: T } | { status: "commit_unknown" | "unavailable" };

async function transaction<T>(
  dependencies: RepositoryDependencies,
  mode: "read" | "write",
  work: (client: PostgresClient) => Promise<T>,
): Promise<TransactionResult<T>> {
  let client: PostgresClient;
  try { client = await acquire(dependencies); } catch { return { status: "unavailable" }; }
  let began = false;
  let commitForwarded = false;
  try {
    await client.query(mode === "read" ? "BEGIN READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED");
    began = true;
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [`${dependencies.timeouts.statementMs}ms`]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [`${dependencies.timeouts.lockMs}ms`]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [`${dependencies.timeouts.idleTransactionMs}ms`]);
    await client.query("SET LOCAL ROLE celebix_saas_identity");
    const value = await work(client);
    commitForwarded = true;
    await client.query("COMMIT");
    try { client.release(); } catch { try { client.release(true); } catch { /* best effort after known commit */ } }
    return { status: "ok", value };
  } catch {
    if (commitForwarded) {
      try { client.release(true); } catch { /* eviction is best effort */ }
      return { status: mode === "write" ? "commit_unknown" : "unavailable" };
    }
    if (began) {
      try { await client.query("ROLLBACK"); } catch { /* destroy below */ }
    }
    try { client.release(true); } catch { /* best effort */ }
    return { status: "unavailable" };
  }
}

function auditSafely(dependencies: RepositoryDependencies, event: PanelSessionAuditEvent): void {
  try {
    const pending = dependencies.audit(Object.freeze({ ...event }));
    if (pending) void pending.catch(() => undefined);
  } catch {
    // Audit is never session authority.
  }
}

function nonAuthority(kind: PanelSessionSafeKind): AuthorityResult {
  return { kind: kind as Exclude<PanelSessionSafeKind, "issued" | "resolved" | "rotated" | "revoked" | "family_revoked" | "expired" | "operation_replayed" | "commit_unknown"> };
}

export function createPostgresPanelSessionRepository(
  approval: unknown,
  rawDependencies: RepositoryDependencies,
): PostgresPanelSessionRepository {
  assertPanelSessionPersistenceApproval(approval);
  const dependencies = validateDependencies(rawDependencies);
  const codec = createPanelSessionCredentialCodec({
    keys: dependencies.keys,
    activeKeyId: dependencies.activeKeyId,
    randomBytes: dependencies.randomBytes,
  });

  const finish = <T extends { kind: PanelSessionSafeKind }>(operation: PanelSessionAuditEvent["operation"], result: T): T => {
    auditSafely(dependencies, { operation, result: result.kind });
    return result;
  };

  const repository: PostgresPanelSessionRepository = {
    async issueSession(input) {
      let now: Date;
      try {
        uuid(input.operationId); uuid(input.principalId);
        if (input.activeStoreId !== undefined) uuid(input.activeStoreId);
        now = canonicalNow(input.now, dependencies.clock);
      } catch { return finish("issue", nonAuthority("durable_authority_invalid")); }
      let credential;
      try { credential = codec.issueCredential(); } catch { return finish("issue", nonAuthority("unavailable")); }
      let sessionId: string;
      let familyId: string;
      try { sessionId = createUuid(dependencies.randomBytes); familyId = createUuid(dependencies.randomBytes); } catch { return finish("issue", nonAuthority("unavailable")); }
      const expiresAt = new Date(now.getTime() + MAXIMUM_SESSION_MS);
      const executed = await transaction(dependencies, "write", async (client) => oneRow(await client.query(
        "SELECT outcome, authority FROM saas.issue_panel_session($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [sessionId, familyId, input.operationId, credential.tokenKeyId, credential.tokenDigest, input.principalId, input.activeStoreId ?? null, now, expiresAt],
      )));
      if (executed.status === "commit_unknown") return finish("issue", { kind: "commit_unknown", credential: credential.credential });
      if (executed.status !== "ok") return finish("issue", nonAuthority(executed.status));
      const kind = outcome(executed.value.outcome);
      if (kind === "issued" || kind === "operation_replayed") {
        try { return finish("issue", { kind, credential: credential.credential, session: sessionAuthority(object(executed.value.authority).session) }); }
        catch { return finish("issue", nonAuthority("durable_authority_invalid")); }
      }
      return finish("issue", nonAuthority(kind));
    },

    async resolveSession(input) {
      let proof;
      let now: Date;
      try {
        proof = codec.digestCredential(input.credential);
        if (!REQUEST_ID_PATTERN.test(input.requestId) || input.requestId.trim() !== input.requestId) throw new Error("invalid");
        now = canonicalNow(input.now, dependencies.clock);
      } catch (error) {
        return finish("resolve", { kind: error instanceof PanelSessionCredentialError ? "unauthenticated" : "durable_authority_invalid" });
      }
      const executed = await transaction(dependencies, "read", async (client) => oneRow(await client.query(
        "SELECT outcome, authority FROM saas.resolve_panel_session($1,$2,$3)",
        [proof.tokenKeyId, proof.tokenDigest, now],
      )));
      if (executed.status !== "ok") return finish("resolve", { kind: "unavailable" });
      const kind = outcome(executed.value.outcome);
      if (kind !== "resolved") {
        if (kind === "unauthenticated" || kind === "membership_denied" || kind === "durable_authority_invalid" || kind === "unavailable") {
          return finish("resolve", { kind });
        }
        return finish("resolve", { kind: "durable_authority_invalid" });
      }
      try { return finish("resolve", resolvedAuthority(executed.value.authority, input.requestId)); }
      catch { return finish("resolve", { kind: "durable_authority_invalid" }); }
    },

    async rotateSession(input) {
      let current;
      let next;
      let now: Date;
      try {
        current = codec.digestCredential(input.currentCredential);
        uuid(input.operationId);
        if (input.requestedStoreId !== undefined) uuid(input.requestedStoreId);
        now = canonicalNow(input.now, dependencies.clock);
        next = codec.issueCredential();
      } catch (error) {
        return finish("rotate", nonAuthority(error instanceof PanelSessionCredentialError ? "unauthenticated" : "durable_authority_invalid"));
      }
      let sessionId: string;
      try { sessionId = createUuid(dependencies.randomBytes); } catch { return finish("rotate", nonAuthority("unavailable")); }
      const executed = await transaction(dependencies, "write", async (client) => oneRow(await client.query(
        "SELECT outcome, authority FROM saas.rotate_panel_session($1,$2,$3,$4,$5,$6,$7,$8)",
        [current.tokenKeyId, current.tokenDigest, sessionId, input.operationId, next.tokenKeyId, next.tokenDigest, input.requestedStoreId ?? null, now],
      )));
      if (executed.status === "commit_unknown") return finish("rotate", { kind: "commit_unknown", credential: next.credential });
      if (executed.status !== "ok") return finish("rotate", nonAuthority(executed.status));
      const kind = outcome(executed.value.outcome);
      if (kind === "rotated" || kind === "operation_replayed") {
        try { return finish("rotate", { kind, credential: next.credential, session: sessionAuthority(object(executed.value.authority).session) }); }
        catch { return finish("rotate", nonAuthority("durable_authority_invalid")); }
      }
      return finish("rotate", nonAuthority(kind));
    },

    async revokeSession(input) {
      return revoke("revoke", "revoke_panel_session", "revoked", input);
    },

    async revokeSessionFamily(input) {
      return revoke("revoke_family", "revoke_panel_session_family", "family_revoked", input);
    },

    async expireDueSessions(input) {
      let now: Date;
      try { now = canonicalNow(input.now, dependencies.clock); }
      catch { return finish("cleanup", { kind: "durable_authority_invalid" }); }
      const executed = await transaction(dependencies, "write", async (client) => {
        const result = await client.query(
          "SELECT outcome, expired_count FROM saas.expire_due_panel_sessions($1,$2)",
          [now, dependencies.cleanupLimit],
        );
        if (result.rows.length !== 1 || result.rowCount !== 1) throw new Error("invalid");
        return exact(result.rows[0], ["outcome", "expired_count"]);
      });
      if (executed.status !== "ok") return finish("cleanup", { kind: executed.status });
      const kind = outcome(executed.value.outcome);
      if (kind !== "expired") return finish("cleanup", { kind });
      try { return finish("cleanup", { kind, count: integer(executed.value.expired_count, 0) }); }
      catch { return finish("cleanup", { kind: "durable_authority_invalid" }); }
    },

    async recoverOperation(input) {
      let candidate;
      let current: { tokenKeyId: string; tokenDigest: string } | undefined;
      try {
        uuid(input.operationId);
        candidate = codec.digestCredential(input.credential);
        if (input.operationKind === "issue") {
          uuid(input.principalId);
          if (input.activeStoreId !== undefined) uuid(input.activeStoreId);
        } else {
          current = codec.digestCredential(input.currentCredential);
        }
      } catch (error) {
        return finish("recover", nonAuthority(error instanceof PanelSessionCredentialError ? "unauthenticated" : "durable_authority_invalid"));
      }
      const executed = await transaction(dependencies, "read", async (client) => oneRow(await client.query(
        "SELECT outcome, authority FROM saas.recover_panel_session_operation($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          input.operationId, input.operationKind, candidate.tokenKeyId, candidate.tokenDigest,
          input.operationKind === "issue" ? input.principalId : null,
          input.operationKind === "issue" ? input.activeStoreId ?? null : null,
          current?.tokenKeyId ?? null, current?.tokenDigest ?? null,
        ],
      )));
      if (executed.status !== "ok") return finish("recover", nonAuthority("unavailable"));
      const kind = outcome(executed.value.outcome);
      if (kind === "operation_replayed") {
        try { return finish("recover", { kind, session: sessionAuthority(object(executed.value.authority).session) }); }
        catch { return finish("recover", nonAuthority("durable_authority_invalid")); }
      }
      return finish("recover", nonAuthority(kind));
    },
  };

  async function revoke(
    operation: "revoke" | "revoke_family",
    functionName: "revoke_panel_session" | "revoke_panel_session_family",
    expected: "revoked" | "family_revoked",
    input: { credential: string; reason: PanelSessionRevocationReason; now: Date },
  ): Promise<{ kind: PanelSessionSafeKind }> {
    let proof;
    let now: Date;
    try {
      proof = codec.digestCredential(input.credential);
      if (!REVOCATION_REASONS.has(input.reason) || input.reason === "rotation" || input.reason === "expired") throw new Error("invalid");
      now = canonicalNow(input.now, dependencies.clock);
    } catch (error) {
      return finish(operation, { kind: error instanceof PanelSessionCredentialError ? "unauthenticated" : "durable_authority_invalid" });
    }
    const executed = await transaction(dependencies, "write", async (client) => oneRow(await client.query(
      `SELECT outcome, authority FROM saas.${functionName}($1,$2,$3,$4)`,
      [proof.tokenKeyId, proof.tokenDigest, input.reason, now],
    )));
    if (executed.status !== "ok") return finish(operation, { kind: executed.status });
    const kind = outcome(executed.value.outcome);
    return finish(operation, { kind: kind === expected ? expected : kind });
  }

  return Object.freeze(repository);
}
