import type {
  CreateStarterTenantInput,
  CreateStarterTenantResult,
  PlanEntitlements,
  SaaSContractError,
  SaaSErrorCode,
  StoreMembership,
} from "@celebix/saas-contracts";
import {
  SaaSDataCorruptionError,
  SaaSDataLockTimeoutError,
  SaaSDataPoolTimeoutError,
  SaaSDataStatementTimeoutError,
  SaaSDataUnknownCommitError,
  SaaSDataUniqueConflict,
  assertNormalizedExactHostname,
  assertNormalizedSlug,
  createCanonicalAdminOrigin,
  createCanonicalTenantFingerprint,
  normalizeExactHttpsOrigin,
  type AdminOriginEnvironment,
  type SaaSDataRepository,
  type SaaSDataTransaction,
  type UniqueConflictKind,
} from "@celebix/saas-data";

export type CreateStarterTenantOutcome =
  | { ok: true; value: CreateStarterTenantResult }
  | { ok: false; error: SaaSContractError };

export interface CreateStarterTenantService {
  execute(input: unknown): Promise<CreateStarterTenantOutcome>;
}

export interface CreateStarterTenantServiceOptions {
  repository: SaaSDataRepository;
  platformDomainSuffix?: string;
  panelBaseUrl?: string;
  adminOriginEnvironment?: AdminOriginEnvironment;
  diagnostic?: (stage: TenantBootstrapStage, failureType: TenantBootstrapFailureType) => void;
}

export type TenantBootstrapFailureType =
  | "core_rejection" | "unique_conflict" | "corrupt_result" | "pool_timeout"
  | "statement_timeout" | "lock_timeout" | "unknown_commit" | "other";

export type TenantBootstrapStage =
  | "begin_transaction" | "operation_claim" | "principal_lookup" | "principal_create_or_update"
  | "store_lookup" | "store_create" | "domain_lookup" | "domain_create"
  | "admin_domain_create" | "membership_create" | "plan_lookup" | "subscription_create"
  | "media_namespace_create" | "setting_create" | "operation_commit" | "transaction_commit";

const RESERVED_PLATFORM_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "assets",
  "auth",
  "cdn",
  "ecommerce",
  "media",
  "panel",
  "status",
  "support",
  "www",
]);

class TenantCoreFailure extends Error {
  readonly code: SaaSErrorCode;
  readonly field: string | undefined;
  readonly retryable: boolean;

  constructor(code: SaaSErrorCode, field?: string, retryable = false) {
    super(code);
    this.name = "TenantCoreFailure";
    this.code = code;
    this.field = field;
    this.retryable = retryable;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function validateInput(value: unknown): CreateStarterTenantInput {
  if (!isRecord(value) || !hasOnlyKeys(value, ["schemaVersion", "idempotencyKey", "principal", "store", "consents", "requestedAt"])) {
    throw new TenantCoreFailure("invalid_input");
  }
  if (value.schemaVersion !== 1) {
    throw new TenantCoreFailure("invalid_input", "schemaVersion");
  }
  if (
    !isNonEmptyString(value.idempotencyKey) ||
    value.idempotencyKey.length > 128 ||
    value.idempotencyKey !== value.idempotencyKey.trim() ||
    /password|token|secret|bearer/i.test(value.idempotencyKey)
  ) {
    throw new TenantCoreFailure("invalid_input", "idempotencyKey");
  }
  if (!isRecord(value.principal) || !hasOnlyKeys(value.principal, ["issuer", "subject", "email", "emailVerified"])) {
    throw new TenantCoreFailure("invalid_input", "principal");
  }
  if (value.principal.emailVerified !== true) {
    throw new TenantCoreFailure("identity_unverified", "principal.emailVerified");
  }
  if (!isNonEmptyString(value.principal.issuer)) {
    throw new TenantCoreFailure("invalid_input", "principal.issuer");
  }
  if (!isNonEmptyString(value.principal.subject)) {
    throw new TenantCoreFailure("invalid_input", "principal.subject");
  }
  if (!isNonEmptyString(value.principal.email) || !value.principal.email.includes("@")) {
    throw new TenantCoreFailure("invalid_input", "principal.email");
  }
  if (!isRecord(value.store) || !hasOnlyKeys(value.store, ["name", "slug", "locale", "currency", "themeKey"])) {
    throw new TenantCoreFailure("invalid_input", "store");
  }
  if (!isNonEmptyString(value.store.name)) {
    throw new TenantCoreFailure("invalid_input", "store.name");
  }
  if (!isNonEmptyString(value.store.slug)) {
    throw new TenantCoreFailure("invalid_input", "store.slug");
  }
  try {
    assertNormalizedSlug(value.store.slug);
  } catch {
    throw new TenantCoreFailure("invalid_input", "store.slug");
  }
  if (RESERVED_PLATFORM_SLUGS.has(value.store.slug)) {
    throw new TenantCoreFailure("invalid_input", "store.slug");
  }
  if (value.store.locale !== "tr") {
    throw new TenantCoreFailure("invalid_input", "store.locale");
  }
  if (value.store.currency !== "TRY") {
    throw new TenantCoreFailure("invalid_input", "store.currency");
  }
  if (value.store.themeKey !== "starter") {
    throw new TenantCoreFailure("invalid_input", "store.themeKey");
  }
  if (!isRecord(value.consents) || !hasOnlyKeys(value.consents, ["privacyAcceptedAt", "marketingAcceptedAt"])) {
    throw new TenantCoreFailure("invalid_input", "consents");
  }
  if (!isCanonicalUtcTimestamp(value.consents.privacyAcceptedAt)) {
    throw new TenantCoreFailure("invalid_input", "consents.privacyAcceptedAt");
  }
  if (
    value.consents.marketingAcceptedAt !== undefined &&
    !isCanonicalUtcTimestamp(value.consents.marketingAcceptedAt)
  ) {
    throw new TenantCoreFailure("invalid_input", "consents.marketingAcceptedAt");
  }
  if (!isCanonicalUtcTimestamp(value.requestedAt)) {
    throw new TenantCoreFailure("invalid_input", "requestedAt");
  }

  return value as unknown as CreateStarterTenantInput;
}

function safeError(code: SaaSErrorCode, field?: string, retryable = false): SaaSContractError {
  return {
    schemaVersion: 1,
    code,
    retryable,
    ...(field ? { field } : {}),
  };
}

function mapUniqueConflict(kind: UniqueConflictKind): SaaSContractError {
  if (kind === "store_slug") {
    return safeError("slug_taken", "store.slug");
  }
  if (kind === "domain_hostname") {
    return safeError("domain_conflict", "store.slug");
  }
  if (kind === "admin_domain_hostname") {
    return safeError("domain_conflict", "store.slug");
  }
  if (kind === "membership") {
    return safeError("membership_conflict");
  }
  if (kind === "operation_idempotency") {
    return safeError("tenant_transaction_failed", undefined, true);
  }
  return safeError("tenant_transaction_failed", undefined, true);
}

async function rollbackSafely(transaction: SaaSDataTransaction): Promise<void> {
  try {
    await transaction.rollback();
  } catch {
    // The public outcome must never expose adapter or transaction details.
  }
}

class DefaultCreateStarterTenantService implements CreateStarterTenantService {
  private readonly repository: SaaSDataRepository;
  private readonly platformDomainSuffix: string;
  private readonly adminOriginEnvironment: AdminOriginEnvironment;
  private readonly diagnostic: ((stage: TenantBootstrapStage, failureType: TenantBootstrapFailureType) => void) | undefined;

  constructor(options: CreateStarterTenantServiceOptions) {
    this.repository = options.repository;
    this.diagnostic = options.diagnostic;
    this.platformDomainSuffix = options.platformDomainSuffix ?? "celebix.site";
    normalizeExactHttpsOrigin(options.panelBaseUrl ?? "https://panel.celebix.site");
    if (
      options.adminOriginEnvironment !== undefined &&
      options.adminOriginEnvironment !== "production" &&
      options.adminOriginEnvironment !== "staging" &&
      options.adminOriginEnvironment !== "staging_net"
    ) throw new Error("invalid_exact_https_origin");
    this.adminOriginEnvironment = options.adminOriginEnvironment ?? "production";
  }

  private reportFailure(stage: TenantBootstrapStage, error: unknown): void {
    const failureType: TenantBootstrapFailureType = error instanceof TenantCoreFailure ? "core_rejection"
      : error instanceof SaaSDataUniqueConflict ? "unique_conflict"
        : error instanceof SaaSDataCorruptionError ? "corrupt_result"
          : error instanceof SaaSDataPoolTimeoutError ? "pool_timeout"
            : error instanceof SaaSDataStatementTimeoutError ? "statement_timeout"
              : error instanceof SaaSDataLockTimeoutError ? "lock_timeout"
                : error instanceof SaaSDataUnknownCommitError ? "unknown_commit" : "other";
    try { this.diagnostic?.(stage, failureType); }
    catch { /* Diagnostics must never affect transaction outcomes. */ }
  }

  async execute(rawInput: unknown): Promise<CreateStarterTenantOutcome> {
    let input: CreateStarterTenantInput;
    try {
      input = validateInput(rawInput);
      assertNormalizedExactHostname(`${input.store.slug}.${this.platformDomainSuffix}`);
    } catch (error) {
      if (error instanceof TenantCoreFailure) {
        return { ok: false, error: safeError(error.code, error.field, error.retryable) };
      }
      return { ok: false, error: safeError("invalid_input") };
    }

    const fingerprint = createCanonicalTenantFingerprint(input);
    let transaction: SaaSDataTransaction;
    try {
      transaction = await this.repository.beginTransaction();
    } catch (error) {
      this.reportFailure("begin_transaction", error);
      return { ok: false, error: safeError("tenant_transaction_failed", undefined, true) };
    }
    let transactionClosed = false;
    let stage: TenantBootstrapStage = "operation_claim";

    try {
      const timestamp = input.requestedAt;
      const operationId = transaction.generateId("operation");
      const claim = await transaction.operations.claim({
        id: operationId,
        idempotencyKey: input.idempotencyKey,
        fingerprint,
        status: "processing",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      if (claim.kind === "existing") {
        // Mark the terminal attempt before awaiting it. A failed rollback makes
        // the adapter transaction broken and must never trigger a second call.
        transactionClosed = true;
        await transaction.rollback();
        const priorOperation = claim.operation;
        if (priorOperation.fingerprint !== fingerprint) {
          return { ok: false, error: safeError("idempotency_mismatch", "idempotencyKey") };
        }
        if (priorOperation.status !== "committed" || !priorOperation.result) {
          // Processing and failed claims are never reused for a second bootstrap.
          // Recovery/retry policy requires a separately reviewed operation flow.
          return { ok: false, error: safeError("tenant_transaction_failed", undefined, true) };
        }
        return { ok: true, value: { ...structuredClone(priorOperation.result), replayed: true } };
      }

      stage = "principal_lookup";
      let principal = await transaction.principals.findByIdentity(input.principal.issuer, input.principal.subject);
      if (principal && principal.email.trim().toLowerCase() !== input.principal.email.trim().toLowerCase()) {
        stage = "principal_create_or_update";
        principal = await transaction.principals.updateVerifiedEmail(
          principal.id,
          input.principal.email,
          timestamp,
        );
      }
      if (!principal) {
        stage = "principal_create_or_update";
        principal = await transaction.principals.create({
          id: transaction.generateId("principal"),
          issuer: input.principal.issuer,
          subject: input.principal.subject,
          email: input.principal.email,
          emailVerified: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }

      stage = "store_lookup";
      if (await transaction.stores.findBySlug(input.store.slug)) {
        throw new SaaSDataUniqueConflict("store_slug");
      }
      stage = "store_create";
      const store = await transaction.stores.create({
        id: transaction.generateId("store"),
        name: input.store.name,
        slug: input.store.slug,
        status: "active",
        locale: input.store.locale,
        currency: input.store.currency,
        themeKey: input.store.themeKey,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      const hostname = assertNormalizedExactHostname(`${store.slug}.${this.platformDomainSuffix}`);
      stage = "domain_lookup";
      if (await transaction.domains.findByHostname(hostname)) {
        throw new SaaSDataUniqueConflict("domain_hostname");
      }
      stage = "domain_create";
      const domain = await transaction.domains.create({
        id: transaction.generateId("domain"),
        storeId: store.id,
        hostname,
        type: "platform_subdomain",
        status: "active",
        canonical: true,
        cacheVersion: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      const canonicalAdminOrigin = createCanonicalAdminOrigin(store.slug, this.adminOriginEnvironment);
      const canonicalAdminHostname = new URL(canonicalAdminOrigin).hostname;
      stage = "admin_domain_create";
      await transaction.adminDomains.provisionCanonical({
        id: transaction.generateId("domain"),
        storeId: store.id,
        hostname: canonicalAdminHostname,
        kind: "platform_subdomain",
        status: "active",
        canonical: true,
        verifiedAt: timestamp,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      const membershipRecord: StoreMembership = {
        schemaVersion: 1,
        id: transaction.generateId("membership"),
        principalId: principal.id,
        storeId: store.id,
        role: "store_owner",
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      stage = "membership_create";
      const membership = await transaction.memberships.create(membershipRecord);

      stage = "plan_lookup";
      const plan = await transaction.plans.findByCodeVersion("free_starter", 1);
      if (!plan || plan.status !== "active") {
        throw new TenantCoreFailure("tenant_transaction_failed", undefined, true);
      }
      if (!plan.features.includes("media")) {
        throw new TenantCoreFailure("tenant_transaction_failed", undefined, true);
      }
      stage = "subscription_create";
      const subscription = await transaction.subscriptions.create({
        id: transaction.generateId("subscription"),
        storeId: store.id,
        planId: plan.id,
        planCode: plan.code,
        planVersion: plan.version,
        status: "active",
        validFrom: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      stage = "media_namespace_create";
      const mediaNamespace = await transaction.mediaNamespaces.create({
        storeId: store.id,
        namespacePrefix: `stores/${store.id}/`,
        status: "active",
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      if (
        mediaNamespace.storeId !== store.id ||
        mediaNamespace.namespacePrefix !== `stores/${store.id}/` ||
        mediaNamespace.status !== "active" ||
        mediaNamespace.version !== 1 ||
        mediaNamespace.createdAt !== timestamp ||
        mediaNamespace.updatedAt !== timestamp
      ) {
        throw new TenantCoreFailure("tenant_transaction_failed", undefined, true);
      }

      for (const [key, value] of [
        ["locale", store.locale],
        ["currency", store.currency],
        ["themeKey", store.themeKey],
      ] as const) {
        stage = "setting_create";
        await transaction.settings.create({
          id: transaction.generateId("setting"),
          storeId: store.id,
          key,
          value,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }

      const planEntitlements: PlanEntitlements = {
        schemaVersion: 1,
        planId: plan.id,
        planCode: plan.code,
        version: plan.version,
        status: subscription.status,
        features: [...plan.features],
        limits: { ...plan.limits },
        validFrom: subscription.validFrom,
        ...(subscription.validUntil ? { validUntil: subscription.validUntil } : {}),
      };
      const result: CreateStarterTenantResult = {
        schemaVersion: 1,
        operationId,
        replayed: false,
        store: { id: store.id, slug: store.slug, status: store.status },
        primaryDomain: {
          schemaVersion: 1,
          hostname: domain.hostname,
          domainId: domain.id,
          domainType: domain.type,
          storeId: store.id,
          storeSlug: store.slug,
          canonicalHostname: domain.hostname,
          status: "active",
          cacheVersion: domain.cacheVersion,
        },
        membership,
        plan: planEntitlements,
        mediaStorage: { schemaVersion: 1, status: "ready", version: mediaNamespace.version },
        provisioningStatus: "ready",
        panelUrl: canonicalAdminOrigin,
        storefrontUrl: `https://${domain.hostname}`,
      };

      stage = "operation_commit";
      await transaction.operations.markCommitted(operationId, result, timestamp);
      stage = "transaction_commit";
      await transaction.commit();
      transactionClosed = true;
      return { ok: true, value: structuredClone(result) };
    } catch (error) {
      this.reportFailure(stage, error);
      if (error instanceof SaaSDataUnknownCommitError) {
        transactionClosed = true;
        return { ok: false, error: safeError("tenant_transaction_failed", undefined, false) };
      }
      if (!transactionClosed) {
        await rollbackSafely(transaction);
      }
      if (error instanceof TenantCoreFailure) {
        return { ok: false, error: safeError(error.code, error.field, error.retryable) };
      }
      if (error instanceof SaaSDataUniqueConflict) {
        return { ok: false, error: mapUniqueConflict(error.kind) };
      }
      return { ok: false, error: safeError("tenant_transaction_failed", undefined, true) };
    }
  }
}

export function createStarterTenantService(
  options: CreateStarterTenantServiceOptions,
): CreateStarterTenantService {
  return new DefaultCreateStarterTenantService(options);
}
