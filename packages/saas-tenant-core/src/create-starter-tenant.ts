import type {
  CreateStarterTenantInput,
  CreateStarterTenantResult,
  PlanEntitlements,
  SaaSContractError,
  SaaSErrorCode,
  StoreMembership,
} from "@celebix/saas-contracts";
import {
  SaaSDataUniqueConflict,
  assertNormalizedExactHostname,
  assertNormalizedSlug,
  createCanonicalTenantFingerprint,
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
}

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
  if (value.store.locale !== "tr") {
    throw new TenantCoreFailure("invalid_input", "store.locale");
  }
  if (value.store.currency !== "TRY") {
    throw new TenantCoreFailure("invalid_input", "store.currency");
  }
  if (!isNonEmptyString(value.store.themeKey)) {
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
  private readonly panelBaseUrl: string;

  constructor(options: CreateStarterTenantServiceOptions) {
    this.repository = options.repository;
    this.platformDomainSuffix = options.platformDomainSuffix ?? "celebix.site";
    this.panelBaseUrl = (options.panelBaseUrl ?? "https://panel.celebix.site").replace(/\/$/, "");
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
    } catch {
      return { ok: false, error: safeError("tenant_transaction_failed", undefined, true) };
    }
    let transactionClosed = false;

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
        await transaction.rollback();
        transactionClosed = true;
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

      let principal = await transaction.principals.findByIdentity(input.principal.issuer, input.principal.subject);
      if (principal && principal.email.trim().toLowerCase() !== input.principal.email.trim().toLowerCase()) {
        principal = await transaction.principals.updateVerifiedEmail(
          principal.id,
          input.principal.email,
          timestamp,
        );
      }
      if (!principal) {
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

      if (await transaction.stores.findBySlug(input.store.slug)) {
        throw new SaaSDataUniqueConflict("store_slug");
      }
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
      if (await transaction.domains.findByHostname(hostname)) {
        throw new SaaSDataUniqueConflict("domain_hostname");
      }
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
      const membership = await transaction.memberships.create(membershipRecord);

      const plan = await transaction.plans.findByCodeVersion("free_starter", 1);
      if (!plan || plan.status !== "active") {
        throw new TenantCoreFailure("tenant_transaction_failed", undefined, true);
      }
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

      for (const [key, value] of [
        ["locale", store.locale],
        ["currency", store.currency],
        ["themeKey", store.themeKey],
      ] as const) {
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
        provisioningStatus: "ready",
        panelUrl: `${this.panelBaseUrl}/stores/${store.slug}`,
        storefrontUrl: `https://${domain.hostname}`,
      };

      await transaction.operations.markCommitted(operationId, result, timestamp);
      await transaction.commit();
      transactionClosed = true;
      return { ok: true, value: structuredClone(result) };
    } catch (error) {
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
