import {
  parseMerchantAdminProviderJob,
  parseMerchantProviderProfile,
  type MerchantAdminProviderJob,
  type MerchantProviderProfile,
} from "@celebix/saas-contracts";

import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import {
  providerCapability,
  providerCode,
  providerDigest,
  providerPublicConfig,
  providerSealedCredential,
  providerUuid,
  providerVersion,
  providerWorkflowFingerprint,
} from "./canonical.ts";
import {
  MERCHANT_PROVIDER_WORKFLOW_ERROR_CODES,
  MerchantProviderWorkflowRepositoryError,
  type MerchantProviderWorkflowErrorCode,
} from "./errors.ts";
import type {
  ClaimMerchantProviderWorkInput,
  ClaimMerchantProviderVerificationInput,
  ClaimMerchantProviderValidationInput,
  MerchantProviderFinalizeInput,
  MerchantProviderHeartbeatInput,
  MerchantProviderReconcileInput,
  MerchantProviderValidationClaim,
  MerchantProviderValidationResultInput,
  MerchantProviderValidationIdentity,
  MerchantProviderVerificationClaim,
  MerchantProviderVerificationResultInput,
  MerchantProviderVerificationWorkflowRepository,
  MerchantProviderWorkflowClaim,
  MerchantProviderWorkflowRepository,
  PostgresMerchantProviderWorkflowRepositoryOptions,
  RecoverMerchantProviderWorkflowInput,
} from "./types.ts";

type Spec = Readonly<{ text: string; values: unknown[] }>;
type Result = Readonly<{ outcome: string; result: unknown }>;
const CODES = new Set<string>(MERCHANT_PROVIDER_WORKFLOW_ERROR_CODES);
const WORKER = /^[A-Za-z0-9._-]{1,128}$/;
const OUTCOME_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const EXECUTION_DIGEST = /^sha256:[a-f0-9]{64}$/;

function unavailable(): MerchantProviderWorkflowRepositoryError {
  return new MerchantProviderWorkflowRepositoryError("unavailable");
}

function invalid(): never {
  throw new MerchantProviderWorkflowRepositoryError("invalid_input");
}

function timeout(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw unavailable();
  return `${value}ms`;
}

function release(client: PostgresClientLike, destroy = false): void {
  try { client.release(destroy || undefined); } catch {}
}

function exact(value: unknown, required: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== required.length ||
    keys.some((key) => typeof key !== "string" || !required.includes(key)) ||
    required.some((key) => !Object.hasOwn(descriptors, key))
  ) invalid();
  const parsed: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    parsed[key] = descriptor.value;
  }
  return parsed;
}

function payload(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw unavailable();
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== [...keys].sort().join(",")) throw unavailable();
  return parsed;
}

function row(value: Readonly<{ rows: unknown[]; rowCount?: number | null }>): Result {
  if (value.rowCount !== 1 || value.rows.length !== 1) throw unavailable();
  const parsed = payload(value.rows[0], ["outcome", "result_payload"]);
  if (typeof parsed.outcome !== "string") throw unavailable();
  return Object.freeze({ outcome: parsed.outcome, result: parsed.result_payload });
}

function safe<T>(parser: () => T): T {
  try { return parser(); } catch (error) {
    if (error instanceof MerchantProviderWorkflowRepositoryError) throw error;
    invalid();
  }
}

function uuid(value: unknown): string { return safe(() => providerUuid(value)); }
function version(value: unknown): number { return safe(() => providerVersion(value, 1)); }
function worker(value: unknown): string {
  if (typeof value !== "string" || !WORKER.test(value)) invalid();
  return value;
}
function date(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return new Date(value.getTime());
}
function timestamp(value: unknown): string {
  if (typeof value !== "string") throw unavailable();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw unavailable();
  return value;
}
function claimWindow(input: ClaimMerchantProviderWorkInput): Readonly<{ workerId: string; now: Date; leaseExpiresAt: Date }> {
  const parsed = exact(input, ["workerId", "now", "leaseExpiresAt"]);
  const now = date(parsed.now), leaseExpiresAt = date(parsed.leaseExpiresAt);
  if (leaseExpiresAt.getTime() <= now.getTime() || leaseExpiresAt.getTime() > now.getTime() + 15 * 60_000) invalid();
  return Object.freeze({ workerId: worker(parsed.workerId), now, leaseExpiresAt });
}
function executionAuthority(value: unknown): Readonly<{ environment: "test" | "live"; adapterVersion: number; evidenceDigest: string }> {
  const parsed = exact(value, ["environment", "adapterVersion", "evidenceDigest"]);
  if (
    (parsed.environment !== "test" && parsed.environment !== "live") ||
    !Number.isSafeInteger(parsed.adapterVersion) || (parsed.adapterVersion as number) < 1 ||
    typeof parsed.evidenceDigest !== "string" || !EXECUTION_DIGEST.test(parsed.evidenceDigest)
  ) invalid();
  return Object.freeze({ environment: parsed.environment, adapterVersion: parsed.adapterVersion as number, evidenceDigest: parsed.evidenceDigest });
}
function validationIdentity(value: unknown): Readonly<MerchantProviderValidationIdentity> {
  const parsed = exact(value, ["environment", "adapterVersion"]);
  if (
    (parsed.environment !== "test" && parsed.environment !== "live") ||
    !Number.isSafeInteger(parsed.adapterVersion) || (parsed.adapterVersion as number) < 1
  ) invalid();
  return Object.freeze({
    environment: parsed.environment,
    adapterVersion: parsed.adapterVersion as number,
  });
}
function validationClaimWindow(input: ClaimMerchantProviderValidationInput) {
  const parsed = exact(input, ["workerId", "providerCode", "capability", "executionAuthority", "now", "leaseExpiresAt"]);
  const now = date(parsed.now), leaseExpiresAt = date(parsed.leaseExpiresAt);
  if (leaseExpiresAt.getTime() <= now.getTime() || leaseExpiresAt.getTime() > now.getTime() + 15 * 60_000) invalid();
  const selectedCapability = providerCapability(parsed.capability);
  if (selectedCapability !== "payment_processing") invalid();
  return Object.freeze({
    workerId: worker(parsed.workerId), providerCode: providerCode(parsed.providerCode),
    capability: selectedCapability, executionAuthority: executionAuthority(parsed.executionAuthority),
    now, leaseExpiresAt,
  });
}
function verificationClaimWindow(input: ClaimMerchantProviderVerificationInput) {
  const parsed = exact(input, ["workerId", "providerCode", "capability", "validationIdentity", "now", "leaseExpiresAt"]);
  const now = date(parsed.now), leaseExpiresAt = date(parsed.leaseExpiresAt);
  if (leaseExpiresAt.getTime() <= now.getTime() || leaseExpiresAt.getTime() > now.getTime() + 15 * 60_000) invalid();
  const selectedCapability = providerCapability(parsed.capability);
  if (selectedCapability !== "payment_processing") invalid();
  return Object.freeze({
    workerId: worker(parsed.workerId),
    providerCode: providerCode(parsed.providerCode),
    capability: selectedCapability,
    validationIdentity: validationIdentity(parsed.validationIdentity),
    now,
    leaseExpiresAt,
  });
}
function code(value: unknown): string {
  if (typeof value !== "string" || !OUTCOME_CODE.test(value)) invalid();
  return value;
}
function safeReference(value: unknown, outcome: string): string | null {
  if (value !== null && (
    typeof value !== "string" || value.length < 1 || value.length > 256 ||
    value !== value.trim() || CONTROL.test(value)
  )) invalid();
  const required = outcome === "succeeded" || outcome === "reconciliation_required";
  if (required !== (value !== null)) invalid();
  return value as string | null;
}
function profile(value: unknown): MerchantProviderProfile {
  try { return parseMerchantProviderProfile(value); } catch { throw unavailable(); }
}
function job(value: unknown): MerchantAdminProviderJob {
  try { return parseMerchantAdminProviderJob(value); } catch { throw unavailable(); }
}

function validationClaim(value: unknown, expected: Readonly<{
  workerId: string; leaseId: string; leaseExpiresAt: Date; providerCode: string;
  capability: "payment_processing"; executionAuthority: Readonly<{ environment: "test" | "live"; adapterVersion: number; evidenceDigest: string }>;
}>): MerchantProviderValidationClaim {
  const parsed = payload(value, [
    "profileId", "storeId", "providerCode", "capability", "publicConfig", "sealedCredentials",
    "executionAuthority", "credentialVersion", "profileVersion", "leaseId", "leaseOwner", "leaseExpiresAt",
  ]);
  try {
    const claim = Object.freeze({
      profileId: providerUuid(parsed.profileId),
      storeId: providerUuid(parsed.storeId),
      providerCode: providerCode(parsed.providerCode),
      capability: providerCapability(parsed.capability),
      publicConfig: providerPublicConfig(parsed.publicConfig),
      executionAuthority: executionAuthority(parsed.executionAuthority),
      sealedCredentials: providerSealedCredential(parsed.sealedCredentials),
      credentialVersion: providerVersion(parsed.credentialVersion, 1),
      profileVersion: providerVersion(parsed.profileVersion, 1),
      leaseId: providerUuid(parsed.leaseId),
      leaseOwner: worker(parsed.leaseOwner),
      leaseExpiresAt: timestamp(parsed.leaseExpiresAt),
    });
    if (
      claim.leaseId !== expected.leaseId || claim.leaseOwner !== expected.workerId ||
      claim.leaseExpiresAt !== expected.leaseExpiresAt.toISOString() ||
      claim.providerCode !== expected.providerCode || claim.capability !== expected.capability ||
      claim.executionAuthority.environment !== expected.executionAuthority.environment ||
      claim.executionAuthority.adapterVersion !== expected.executionAuthority.adapterVersion ||
      claim.executionAuthority.evidenceDigest !== expected.executionAuthority.evidenceDigest
    ) throw unavailable();
    return claim;
  } catch (error) {
    if (error instanceof MerchantProviderWorkflowRepositoryError) throw error;
    throw unavailable();
  }
}

function verificationClaim(value: unknown, expected: Readonly<{
  workerId: string;
  leaseId: string;
  leaseExpiresAt: Date;
  providerCode: string;
  capability: "payment_processing";
  validationIdentity: Readonly<MerchantProviderValidationIdentity>;
}>): MerchantProviderVerificationClaim {
  const parsed = payload(value, [
    "profileId", "storeId", "providerCode", "capability", "publicConfig", "sealedCredentials",
    "validationIdentity", "credentialVersion", "profileVersion", "leaseId", "leaseOwner", "leaseExpiresAt",
  ]);
  try {
    const claim = Object.freeze({
      profileId: providerUuid(parsed.profileId),
      storeId: providerUuid(parsed.storeId),
      providerCode: providerCode(parsed.providerCode),
      capability: providerCapability(parsed.capability),
      publicConfig: providerPublicConfig(parsed.publicConfig),
      validationIdentity: validationIdentity(parsed.validationIdentity),
      sealedCredentials: providerSealedCredential(parsed.sealedCredentials),
      credentialVersion: providerVersion(parsed.credentialVersion, 1),
      profileVersion: providerVersion(parsed.profileVersion, 1),
      leaseId: providerUuid(parsed.leaseId),
      leaseOwner: worker(parsed.leaseOwner),
      leaseExpiresAt: timestamp(parsed.leaseExpiresAt),
    });
    if (
      claim.leaseId !== expected.leaseId || claim.leaseOwner !== expected.workerId ||
      claim.leaseExpiresAt !== expected.leaseExpiresAt.toISOString() ||
      claim.providerCode !== expected.providerCode || claim.capability !== expected.capability ||
      claim.validationIdentity.environment !== expected.validationIdentity.environment ||
      claim.validationIdentity.adapterVersion !== expected.validationIdentity.adapterVersion
    ) throw unavailable();
    return claim;
  } catch (error) {
    if (error instanceof MerchantProviderWorkflowRepositoryError) throw error;
    throw unavailable();
  }
}

function workflowClaim(value: unknown, expected: Readonly<{ workerId: string; leaseId: string; leaseExpiresAt: Date }>): MerchantProviderWorkflowClaim {
  const parsed = payload(value, [
    "jobId", "recordId", "storeId", "profileId", "providerCode", "capability", "publicConfig",
    "sealedCredentials", "credentialVersion", "jobVersion", "leaseId", "leaseOwner", "leaseExpiresAt", "attempt",
  ]);
  try {
    const claim = Object.freeze({
      jobId: providerUuid(parsed.jobId),
      recordId: providerUuid(parsed.recordId),
      storeId: providerUuid(parsed.storeId),
      profileId: providerUuid(parsed.profileId),
      providerCode: providerCode(parsed.providerCode),
      capability: providerCapability(parsed.capability),
      publicConfig: providerPublicConfig(parsed.publicConfig),
      sealedCredentials: providerSealedCredential(parsed.sealedCredentials),
      credentialVersion: providerVersion(parsed.credentialVersion, 1),
      jobVersion: providerVersion(parsed.jobVersion, 1),
      leaseId: providerUuid(parsed.leaseId),
      leaseOwner: worker(parsed.leaseOwner),
      leaseExpiresAt: timestamp(parsed.leaseExpiresAt),
      attempt: providerVersion(parsed.attempt, 1),
    });
    if (
      claim.leaseId !== expected.leaseId || claim.leaseOwner !== expected.workerId ||
      claim.leaseExpiresAt !== expected.leaseExpiresAt.toISOString()
    ) throw unavailable();
    return claim;
  } catch (error) {
    if (error instanceof MerchantProviderWorkflowRepositoryError) throw error;
    throw unavailable();
  }
}

export class PostgresMerchantProviderWorkflowRepository implements
  MerchantProviderWorkflowRepository,
  MerchantProviderVerificationWorkflowRepository {
  private readonly options: PostgresMerchantProviderWorkflowRepositoryOptions;

  constructor(options: PostgresMerchantProviderWorkflowRepositoryOptions) {
    try {
      if (
        !options || typeof options !== "object" || Array.isArray(options) ||
        Object.keys(options).sort().join(",") !== "audit,pool,role,timeouts,uuid" ||
        options.role !== "celebix_saas_workflow" || typeof options.audit !== "function" ||
        typeof options.uuid !== "function" || !options.pool || typeof options.pool.connect !== "function" ||
        !options.timeouts || Object.keys(options.timeouts).sort().join(",") !== "idleTransactionMs,lockMs,poolCheckoutMs,statementMs"
      ) throw unavailable();
      for (const value of Object.values(options.timeouts)) timeout(value);
      this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
    } catch (error) {
      if (error instanceof MerchantProviderWorkflowRepositoryError) throw error;
      throw unavailable();
    }
  }

  private expected(outcome: string): MerchantProviderWorkflowRepositoryError | undefined {
    return CODES.has(outcome)
      ? new MerchantProviderWorkflowRepositoryError(outcome as MerchantProviderWorkflowErrorCode)
      : undefined;
  }

  private async acquire(): Promise<PostgresClientLike> {
    try { return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); }
    catch { throw unavailable(); }
  }

  private async configure(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query("SET LOCAL ROLE celebix_saas_workflow");
  }

  private async rollback(client: PostgresClientLike): Promise<void> {
    try { await client.query("ROLLBACK"); release(client); } catch { release(client, true); }
  }

  private async transaction<T>(spec: Spec, expected: readonly string[], parser: (result: Result) => T): Promise<T> {
    const client = await this.acquire();
    let began = false, terminal = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      began = true;
      await this.configure(client);
      const result = row(await client.query(spec.text, spec.values));
      const known = this.expected(result.outcome);
      if (known) throw known;
      if (!expected.includes(result.outcome)) throw unavailable();
      const parsed = parser(result);
      try {
        await client.query("COMMIT");
        terminal = true;
        release(client);
        return parsed;
      } catch {
        terminal = true;
        release(client, true);
        throw unavailable();
      }
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) release(client, true);
      if (error instanceof MerchantProviderWorkflowRepositoryError) throw error;
      throw unavailable();
    }
  }

  private async replayVerificationTransaction<T>(
    spec: Spec,
    expected: readonly string[],
    parser: (result: Result) => T,
    observed: T,
  ): Promise<T> {
    const client = await this.acquire();
    let began = false, terminal = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      began = true;
      await this.configure(client);
      const result = row(await client.query(spec.text, spec.values));
      const known = this.expected(result.outcome);
      if (known) throw known;
      if (!expected.includes(result.outcome)) throw unavailable();
      const recovered = parser(result);
      if (JSON.stringify(recovered) !== JSON.stringify(observed)) throw unavailable();
      try {
        await client.query("COMMIT");
        terminal = true;
        release(client);
        return recovered;
      } catch {
        terminal = true;
        release(client, true);
        throw unavailable();
      }
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) release(client, true);
      if (error instanceof MerchantProviderWorkflowRepositoryError) throw error;
      throw unavailable();
    }
  }

  private async verificationTransaction<T>(
    spec: Spec,
    expected: readonly string[],
    parser: (result: Result) => T,
  ): Promise<T> {
    const client = await this.acquire();
    let began = false, terminal = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      began = true;
      await this.configure(client);
      const result = row(await client.query(spec.text, spec.values));
      const known = this.expected(result.outcome);
      if (known) throw known;
      if (!expected.includes(result.outcome)) throw unavailable();
      const observed = parser(result);
      try {
        await client.query("COMMIT");
        terminal = true;
        release(client);
        return observed;
      } catch {
        terminal = true;
        release(client, true);
        this.audit("merchant_provider_verification_commit_unknown");
        return await this.replayVerificationTransaction(spec, expected, parser, observed);
      }
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) release(client, true);
      if (error instanceof MerchantProviderWorkflowRepositoryError) throw error;
      throw unavailable();
    }
  }

  private async read<T>(spec: Spec, expected: string, parser: (value: unknown) => T): Promise<T> {
    const client = await this.acquire();
    let began = false, terminal = false;
    try {
      await client.query("BEGIN READ ONLY");
      began = true;
      await this.configure(client);
      const result = row(await client.query(spec.text, spec.values));
      const known = this.expected(result.outcome);
      if (known) throw known;
      if (result.outcome !== expected) throw unavailable();
      const parsed = parser(result.result);
      try {
        await client.query("COMMIT");
        terminal = true;
        release(client);
        return parsed;
      } catch {
        terminal = true;
        release(client, true);
        throw unavailable();
      }
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) release(client, true);
      if (error instanceof MerchantProviderWorkflowRepositoryError) throw error;
      throw unavailable();
    }
  }

  private audit(type: "merchant_provider_finalize_commit_unknown" | "merchant_provider_verification_commit_unknown" = "merchant_provider_finalize_commit_unknown"): void {
    try {
      const pending = this.options.audit({ type });
      if (pending) void pending.catch(() => undefined);
    } catch {}
  }

  private uuid(): string {
    try { return providerUuid(this.options.uuid()); } catch { throw unavailable(); }
  }

  async claimProfileValidation(input: ClaimMerchantProviderValidationInput) {
    const parsed = validationClaimWindow(input), leaseId = this.uuid();
    return this.transaction({
      text: "SELECT outcome,result_payload FROM saas.merchant_provider_profile_claim_validation($1::text,$2::text,$3::text,$4::text,$5::integer,$6::text,$7::timestamptz,$8::timestamptz,$9::uuid)",
      values: [parsed.workerId, parsed.providerCode, parsed.capability, parsed.executionAuthority.environment, parsed.executionAuthority.adapterVersion, parsed.executionAuthority.evidenceDigest, parsed.now, parsed.leaseExpiresAt, leaseId],
    }, ["empty", "claimed"], (result) => result.outcome === "empty"
      ? Object.freeze({ kind: "empty" as const })
      : Object.freeze({ kind: "claimed" as const, profile: validationClaim(result.result, { ...parsed, leaseId }) }));
  }

  async claimProfileVerification(input: ClaimMerchantProviderVerificationInput) {
    const parsed = verificationClaimWindow(input), leaseId = this.uuid();
    return this.verificationTransaction({
      text: "SELECT outcome,result_payload FROM saas.merchant_provider_profile_claim_verification($1::text,$2::text,$3::text,$4::text,$5::integer,$6::timestamptz,$7::timestamptz,$8::uuid)",
      values: [
        parsed.workerId, parsed.providerCode, parsed.capability,
        parsed.validationIdentity.environment, parsed.validationIdentity.adapterVersion,
        parsed.now, parsed.leaseExpiresAt, leaseId,
      ],
    }, ["empty", "claimed", "operation_replayed"], (result) => result.outcome === "empty"
      ? Object.freeze({ kind: "empty" as const })
      : Object.freeze({ kind: "claimed" as const, profile: verificationClaim(result.result, { ...parsed, leaseId }) }));
  }

  async markProfileValidation(input: MerchantProviderValidationResultInput): Promise<MerchantProviderProfile> {
    const parsed = exact(input, ["profileId", "providerCode", "capability", "executionAuthority", "credentialVersion", "profileVersion", "leaseId", "leaseOwner", "now", "outcome", "outcomeCode"]);
    const profileId = uuid(parsed.profileId), credentialVersion = version(parsed.credentialVersion), profileVersion = version(parsed.profileVersion);
    const selectedProviderCode = providerCode(parsed.providerCode), selectedCapability = providerCapability(parsed.capability);
    if (selectedCapability !== "payment_processing") invalid();
    const selectedExecutionAuthority = executionAuthority(parsed.executionAuthority);
    const leaseId = uuid(parsed.leaseId), leaseOwner = worker(parsed.leaseOwner), now = date(parsed.now);
    if (parsed.outcome !== "validated" && parsed.outcome !== "rejected") invalid();
    const outcomeCode = code(parsed.outcomeCode);
    return this.transaction({
      text: "SELECT outcome,result_payload FROM saas.merchant_provider_profile_mark_validation($1::uuid,$2::text,$3::text,$4::text,$5::integer,$6::text,$7::text,$8::timestamptz,$9::uuid,$10::bigint,$11::bigint,$12::text,$13::text)",
      values: [profileId, selectedProviderCode, selectedCapability, selectedExecutionAuthority.environment, selectedExecutionAuthority.adapterVersion, selectedExecutionAuthority.evidenceDigest, leaseOwner, now, leaseId, credentialVersion, profileVersion, parsed.outcome, outcomeCode],
    }, [parsed.outcome as string, "operation_replayed"], (result) => {
      const selected = profile(result.result);
      const expectedStatus = parsed.outcome === "validated" ? "active" : "rotation_required";
      if (selected.id !== profileId || selected.status !== expectedStatus) throw unavailable();
      return selected;
    });
  }

  async markProfileVerification(input: MerchantProviderVerificationResultInput): Promise<MerchantProviderProfile> {
    const parsed = exact(input, [
      "profileId", "providerCode", "capability", "validationIdentity", "credentialVersion",
      "profileVersion", "leaseId", "leaseOwner", "now", "outcome", "outcomeCode",
    ]);
    const profileId = uuid(parsed.profileId);
    const credentialVersion = version(parsed.credentialVersion);
    const profileVersion = version(parsed.profileVersion);
    const selectedProviderCode = providerCode(parsed.providerCode);
    const selectedCapability = providerCapability(parsed.capability);
    if (selectedCapability !== "payment_processing") invalid();
    const selectedValidationIdentity = validationIdentity(parsed.validationIdentity);
    const leaseId = uuid(parsed.leaseId), leaseOwner = worker(parsed.leaseOwner), now = date(parsed.now);
    if (parsed.outcome !== "validated" && parsed.outcome !== "rejected") invalid();
    const outcomeCode = code(parsed.outcomeCode);
    return this.verificationTransaction({
      text: "SELECT outcome,result_payload FROM saas.merchant_provider_profile_mark_verification($1::uuid,$2::text,$3::text,$4::text,$5::integer,$6::text,$7::timestamptz,$8::uuid,$9::bigint,$10::bigint,$11::text,$12::text)",
      values: [
        profileId, selectedProviderCode, selectedCapability,
        selectedValidationIdentity.environment, selectedValidationIdentity.adapterVersion,
        leaseOwner, now, leaseId, credentialVersion, profileVersion, parsed.outcome, outcomeCode,
      ],
    }, [parsed.outcome as string, "operation_replayed"], (result) => {
      const selected = profile(result.result);
      const expectedStatus = parsed.outcome === "validated" ? "active" : "rotation_required";
      if (selected.id !== profileId || selected.status !== expectedStatus) throw unavailable();
      return selected;
    });
  }

  async claim(input: ClaimMerchantProviderWorkInput) {
    const parsed = claimWindow(input), leaseId = this.uuid();
    return this.transaction({
      text: "SELECT outcome,result_payload FROM saas.merchant_provider_claim($1::text,$2::timestamptz,$3::timestamptz,$4::uuid)",
      values: [parsed.workerId, parsed.now, parsed.leaseExpiresAt, leaseId],
    }, ["empty", "claimed"], (result) => result.outcome === "empty"
      ? Object.freeze({ kind: "empty" as const })
      : Object.freeze({ kind: "claimed" as const, job: workflowClaim(result.result, { ...parsed, leaseId }) }));
  }

  async heartbeat(input: MerchantProviderHeartbeatInput): Promise<MerchantAdminProviderJob> {
    const parsed = exact(input, ["jobId", "leaseOwner", "leaseId", "expectedVersion", "now", "leaseExpiresAt"]);
    const jobId = uuid(parsed.jobId), leaseOwner = worker(parsed.leaseOwner), leaseId = uuid(parsed.leaseId);
    const expectedVersion = version(parsed.expectedVersion), now = date(parsed.now), leaseExpiresAt = date(parsed.leaseExpiresAt);
    if (leaseExpiresAt.getTime() <= now.getTime() || leaseExpiresAt.getTime() > now.getTime() + 15 * 60_000) invalid();
    return this.transaction({
      text: "SELECT outcome,result_payload FROM saas.merchant_provider_heartbeat($1::uuid,$2::text,$3::uuid,$4::timestamptz,$5::timestamptz,$6::bigint)",
      values: [jobId, leaseOwner, leaseId, now, leaseExpiresAt, expectedVersion],
    }, ["heartbeat"], (result) => {
      const selected = job(result.result);
      if (selected.id !== jobId || selected.status !== "leased" || selected.version !== expectedVersion + 1) throw unavailable();
      return selected;
    });
  }

  private async recoverObserved(jobId: string, fingerprint: string, observed: MerchantAdminProviderJob): Promise<MerchantAdminProviderJob> {
    const recovered = await this.recover({ jobId, operationFingerprint: fingerprint });
    if (JSON.stringify(recovered) !== JSON.stringify(observed)) throw unavailable();
    return recovered;
  }

  private async terminalMutation(spec: Spec, expected: string, jobId: string, fingerprint: string): Promise<MerchantAdminProviderJob> {
    const client = await this.acquire();
    let began = false, terminal = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      began = true;
      await this.configure(client);
      const result = row(await client.query(spec.text, spec.values));
      const known = this.expected(result.outcome);
      if (known) throw known;
      if (result.outcome !== expected && result.outcome !== "operation_replayed") throw unavailable();
      const observed = job(result.result);
      if (observed.id !== jobId || observed.status !== expected) throw unavailable();
      try {
        await client.query("COMMIT");
        terminal = true;
        release(client);
        return observed;
      } catch {
        terminal = true;
        release(client, true);
        this.audit();
        return await this.recoverObserved(jobId, fingerprint, observed);
      }
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) release(client, true);
      if (error instanceof MerchantProviderWorkflowRepositoryError) throw error;
      throw unavailable();
    }
  }

  async finalize(input: MerchantProviderFinalizeInput): Promise<MerchantAdminProviderJob> {
    const parsed = exact(input, ["jobId", "leaseOwner", "leaseId", "expectedVersion", "now", "outcome", "outcomeCode", "safeProviderReference"]);
    const jobId = uuid(parsed.jobId), leaseOwner = worker(parsed.leaseOwner), leaseId = uuid(parsed.leaseId);
    const expectedVersion = version(parsed.expectedVersion), now = date(parsed.now);
    const outcomes = ["succeeded", "retryable_failed", "permanently_failed", "provider_outcome_unknown", "reconciliation_required"] as const;
    if (!outcomes.includes(parsed.outcome as never)) invalid();
    const outcome = parsed.outcome as MerchantProviderFinalizeInput["outcome"], outcomeCode = code(parsed.outcomeCode);
    const safeProviderReference = safeReference(parsed.safeProviderReference, outcome);
    const fingerprint = providerWorkflowFingerprint("finalize", { jobId, leaseOwner, leaseId, expectedVersion, outcome, outcomeCode, safeProviderReference });
    return this.terminalMutation({
      text: "SELECT outcome,result_payload FROM saas.merchant_provider_finalize($1::uuid,$2::text,$3::uuid,$4::timestamptz,$5::bigint,$6::text,$7::text,$8::text,$9::text)",
      values: [jobId, leaseOwner, leaseId, now, expectedVersion, outcome, outcomeCode, safeProviderReference, fingerprint],
    }, outcome, jobId, fingerprint);
  }

  async reconcile(input: MerchantProviderReconcileInput): Promise<MerchantAdminProviderJob> {
    const parsed = exact(input, ["jobId", "workerId", "expectedVersion", "now", "outcome", "outcomeCode", "safeProviderReference"]);
    const jobId = uuid(parsed.jobId), workerId = worker(parsed.workerId), expectedVersion = version(parsed.expectedVersion), now = date(parsed.now);
    const outcomes = ["succeeded", "permanently_failed", "provider_outcome_unknown", "reconciliation_required"] as const;
    if (!outcomes.includes(parsed.outcome as never)) invalid();
    const outcome = parsed.outcome as MerchantProviderReconcileInput["outcome"], outcomeCode = code(parsed.outcomeCode);
    const safeProviderReference = safeReference(parsed.safeProviderReference, outcome), operationId = this.uuid();
    const fingerprint = providerWorkflowFingerprint("reconcile", { jobId, workerId, operationId, expectedVersion, outcome, outcomeCode, safeProviderReference });
    return this.terminalMutation({
      text: "SELECT outcome,result_payload FROM saas.merchant_provider_reconcile($1::uuid,$2::text,$3::uuid,$4::timestamptz,$5::bigint,$6::text,$7::text,$8::text,$9::text)",
      values: [jobId, workerId, operationId, now, expectedVersion, outcome, outcomeCode, safeProviderReference, fingerprint],
    }, outcome, jobId, fingerprint);
  }

  async recover(input: RecoverMerchantProviderWorkflowInput): Promise<MerchantAdminProviderJob> {
    const parsed = exact(input, ["jobId", "operationFingerprint"]), jobId = uuid(parsed.jobId);
    const fingerprint = safe(() => providerDigest(parsed.operationFingerprint));
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.merchant_provider_recover_workflow_operation($1::uuid,$2::text)",
      values: [jobId, fingerprint],
    }, "operation_replayed", (value) => {
      const selected = job(value);
      if (selected.id !== jobId) throw unavailable();
      return selected;
    });
  }
}
