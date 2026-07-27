import {
  parseMerchantProviderProfile,
  type MerchantProviderProfile,
} from "@celebix/saas-contracts";

import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import {
  exactProviderInput,
  providerAuthority,
  providerCapability,
  providerCode,
  providerDigest,
  providerMaskedReference,
  providerProfileFingerprint,
  providerPublicConfig,
  providerSealedCredential,
  providerUuid,
  providerVersion,
} from "./canonical.ts";
import {
  MERCHANT_PROVIDER_PROFILE_ERROR_CODES,
  MerchantProviderProfileRepositoryError,
  type MerchantProviderProfileErrorCode,
} from "./errors.ts";
import type {
  ListMerchantProviderProfilesInput,
  MerchantProviderProfileRepository,
  PostgresMerchantProviderProfileRepositoryOptions,
  RevokeMerchantProviderProfileInput,
  SaveMerchantProviderProfileInput,
} from "./types.ts";

type Spec = Readonly<{ text: string; values: unknown[] }>;
type Authority = ReturnType<typeof providerAuthority>;
const CODES = new Set<string>(MERCHANT_PROVIDER_PROFILE_ERROR_CODES);
const EXECUTION_DIGEST = /^sha256:[a-f0-9]{64}$/;

function unavailable(): MerchantProviderProfileRepositoryError {
  return new MerchantProviderProfileRepositoryError("unavailable");
}

function timeout(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw unavailable();
  return `${value}ms`;
}

function release(client: PostgresClientLike, destroy = false): void {
  try { client.release(destroy || undefined); } catch {}
}

function payload(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw unavailable();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).sort().join(",") !== [...keys].sort().join(",")) throw unavailable();
  return result;
}

function row(value: Readonly<{ rows: unknown[]; rowCount?: number | null }>): Readonly<{ outcome: string; result: unknown }> {
  if (value.rowCount !== 1 || value.rows.length !== 1) throw unavailable();
  const parsed = payload(value.rows[0], ["outcome", "result_payload"]);
  if (typeof parsed.outcome !== "string") throw unavailable();
  return Object.freeze({ outcome: parsed.outcome, result: parsed.result_payload });
}

function authorityValues(authority: Authority): unknown[] {
  return [authority.storeId, authority.principalId, authority.membershipId, authority.planId, authority.planCode, authority.planVersion, authority.now];
}

function profile(value: unknown): MerchantProviderProfile {
  try { return parseMerchantProviderProfile(value); } catch { throw unavailable(); }
}

function executionAuthority(value: unknown): Readonly<{
  environment: "test" | "live";
  adapterVersion: number;
  evidenceDigest: string;
}> | null {
  if (value === null) return null;
  const parsed = exactProviderInput(value, ["environment", "adapterVersion", "evidenceDigest"]);
  if (
    (parsed.environment !== "test" && parsed.environment !== "live") ||
    !Number.isSafeInteger(parsed.adapterVersion) || (parsed.adapterVersion as number) < 1 ||
    typeof parsed.evidenceDigest !== "string" || !EXECUTION_DIGEST.test(parsed.evidenceDigest)
  ) throw unavailable();
  return Object.freeze({
    environment: parsed.environment,
    adapterVersion: parsed.adapterVersion as number,
    evidenceDigest: parsed.evidenceDigest,
  });
}

export class PostgresMerchantProviderProfileRepository implements MerchantProviderProfileRepository {
  private readonly options: PostgresMerchantProviderProfileRepositoryOptions;

  constructor(options: PostgresMerchantProviderProfileRepositoryOptions) {
    try {
      if (
        !options || typeof options !== "object" || Array.isArray(options) ||
        Object.keys(options).sort().join(",") !== "audit,pool,role,timeouts" ||
        options.role !== "celebix_saas_app" || typeof options.audit !== "function" ||
        !options.pool || typeof options.pool.connect !== "function" ||
        !options.timeouts || Object.keys(options.timeouts).sort().join(",") !== "idleTransactionMs,lockMs,poolCheckoutMs,statementMs"
      ) throw unavailable();
      for (const value of Object.values(options.timeouts)) timeout(value);
      this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
    } catch (error) {
      if (error instanceof MerchantProviderProfileRepositoryError) throw error;
      throw unavailable();
    }
  }

  private async acquire(): Promise<PostgresClientLike> {
    try { return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); }
    catch { throw unavailable(); }
  }

  private async configure(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query("SET LOCAL ROLE celebix_saas_app");
  }

  private expected(outcome: string): MerchantProviderProfileRepositoryError | undefined {
    return CODES.has(outcome)
      ? new MerchantProviderProfileRepositoryError(outcome as MerchantProviderProfileErrorCode)
      : undefined;
  }

  private async rollback(client: PostgresClientLike): Promise<void> {
    try { await client.query("ROLLBACK"); release(client); } catch { release(client, true); }
  }

  private async read<T>(spec: Spec, expected: string, parser: (value: unknown) => T): Promise<T> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
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
      } catch {
        terminal = true;
        release(client, true);
        throw unavailable();
      }
      return parsed;
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) release(client, true);
      if (error instanceof MerchantProviderProfileRepositoryError) throw error;
      throw unavailable();
    }
  }

  private audit(): void {
    try {
      const pending = this.options.audit({ type: "merchant_provider_profile_commit_unknown" });
      if (pending) void pending.catch(() => undefined);
    } catch {}
  }

  private recover(authority: Authority, operationId: string, fingerprint: string, observedProfile: MerchantProviderProfile): Promise<MerchantProviderProfile> {
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.merchant_provider_profile_recover_operation($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text)",
      values: [...authorityValues(authority), operationId, fingerprint],
    }, "operation_replayed", (value) => {
      const parsed = profile(value);
      if (JSON.stringify(parsed) !== JSON.stringify(observedProfile)) throw unavailable();
      return parsed;
    });
  }

  private async mutate(
    authority: Authority,
    operationId: string,
    fingerprint: string,
    expected: string,
    validateProfile: (profile: MerchantProviderProfile) => boolean,
    spec: Spec,
  ): Promise<MerchantProviderProfile> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      began = true;
      await this.configure(client);
      const result = row(await client.query(spec.text, spec.values));
      const known = this.expected(result.outcome);
      if (known) throw known;
      if (result.outcome !== expected && result.outcome !== "operation_replayed") throw unavailable();
      const parsed = profile(result.result);
      if (!validateProfile(parsed)) throw unavailable();
      try {
        await client.query("COMMIT");
        terminal = true;
        release(client);
        return parsed;
      } catch {
        terminal = true;
        release(client, true);
        this.audit();
        return await this.recover(authority, operationId, fingerprint, parsed);
      }
    } catch (error) {
      if (began && !terminal) await this.rollback(client);
      else if (!began && !terminal) release(client, true);
      if (error instanceof MerchantProviderProfileRepositoryError) throw error;
      throw unavailable();
    }
  }

  async list(input: ListMerchantProviderProfilesInput): Promise<readonly MerchantProviderProfile[]> {
    const parsed = exactProviderInput(input, ["tenantContext", "now", "capability"]);
    const authority = providerAuthority(parsed.tenantContext as never, parsed.now as Date);
    const capability = providerCapability(parsed.capability);
    return this.read({
      text: "SELECT outcome,result_payload FROM saas.merchant_provider_profile_list($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::text)",
      values: [...authorityValues(authority), null],
    }, "listed", (value) => {
      const result = payload(value, ["items"]);
      if (!Array.isArray(result.items) || result.items.length > 100) throw unavailable();
      const profiles = result.items.map(profile).filter((entry) => entry.capability === capability);
      return Object.freeze(profiles);
    });
  }

  async save(input: SaveMerchantProviderProfileInput): Promise<MerchantProviderProfile> {
    const parsed = exactProviderInput(input, [
      "tenantContext", "now", "operationId", "profileId", "providerCode", "capability",
      "publicConfig", "maskedAccountReference", "sealedCredentials", "credentialDigest",
      "executionAuthority", "expectedVersion",
    ]);
    const authority = providerAuthority(parsed.tenantContext as never, parsed.now as Date);
    const operationId = providerUuid(parsed.operationId);
    const profileId = providerUuid(parsed.profileId);
    const selectedProviderCode = providerCode(parsed.providerCode);
    const capability = providerCapability(parsed.capability);
    const publicConfig = providerPublicConfig(parsed.publicConfig);
    const maskedAccountReference = providerMaskedReference(parsed.maskedAccountReference);
    const sealedCredentials = providerSealedCredential(parsed.sealedCredentials);
    const credentialDigest = providerDigest(parsed.credentialDigest);
    const selectedExecutionAuthority = executionAuthority(parsed.executionAuthority);
    if ((capability === "payment_processing") !== (selectedExecutionAuthority !== null)) throw unavailable();
    if (
      selectedExecutionAuthority !== null &&
      publicConfig.environment !== selectedExecutionAuthority.environment
    ) throw unavailable();
    const expectedVersion = providerVersion(parsed.expectedVersion, 0);
    const fingerprint = providerProfileFingerprint("save", authority.storeId, {
      profileId,
      providerCode: selectedProviderCode,
      capability,
      publicConfig,
      maskedAccountReference,
      credentialDigest,
      credentialKeyId: sealedCredentials.keyId,
      credentialSchemaVersion: sealedCredentials.version,
      executionAuthority: selectedExecutionAuthority,
      expectedVersion,
    });
    return this.mutate(authority, operationId, fingerprint, "saved", (profile) => (
      profile.id === profileId &&
      profile.providerCode === selectedProviderCode &&
      profile.capability === capability &&
      profile.status === "pending_validation"
    ), {
      text: "SELECT outcome,result_payload FROM saas.merchant_provider_profile_save($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::text,$12::text,$13::jsonb,$14::text,$15::jsonb,$16::text,$17::text,$18::integer,$19::text,$20::integer,$21::text,$22::bigint)",
      values: [...authorityValues(authority), operationId, fingerprint, profileId, selectedProviderCode, capability, JSON.stringify(publicConfig), maskedAccountReference, JSON.stringify(sealedCredentials), credentialDigest, sealedCredentials.keyId, sealedCredentials.version, selectedExecutionAuthority?.environment ?? null, selectedExecutionAuthority?.adapterVersion ?? null, selectedExecutionAuthority?.evidenceDigest ?? null, expectedVersion],
    });
  }

  private transition(kind: "disable" | "revoke", input: RevokeMerchantProviderProfileInput): Promise<MerchantProviderProfile> {
    const parsed = exactProviderInput(input, ["tenantContext", "now", "operationId", "profileId", "expectedVersion"]);
    const authority = providerAuthority(parsed.tenantContext as never, parsed.now as Date);
    const operationId = providerUuid(parsed.operationId);
    const profileId = providerUuid(parsed.profileId);
    const expectedVersion = providerVersion(parsed.expectedVersion, 1);
    const fingerprint = providerProfileFingerprint(kind, authority.storeId, { profileId, expectedVersion });
    const expectedStatus = kind === "disable" ? "disabled" : "revoked";
    return this.mutate(authority, operationId, fingerprint, expectedStatus, (profile) => (
      profile.id === profileId && profile.status === expectedStatus
    ), {
      text: `SELECT outcome,result_payload FROM saas.merchant_provider_profile_${kind}($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::timestamptz,$8::uuid,$9::text,$10::uuid,$11::bigint)`,
      values: [...authorityValues(authority), operationId, fingerprint, profileId, expectedVersion],
    });
  }

  disable(input: RevokeMerchantProviderProfileInput): Promise<MerchantProviderProfile> { return this.transition("disable", input); }
  revoke(input: RevokeMerchantProviderProfileInput): Promise<MerchantProviderProfile> { return this.transition("revoke", input); }
}
