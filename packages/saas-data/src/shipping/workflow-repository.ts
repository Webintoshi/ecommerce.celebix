import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { openShippingCredential, type SealedShippingCredential, type ShippingCredentialKeyring } from "./credential-crypto.ts";
import {
  SHIPPING_WORKFLOW_ERROR_CODES,
  ShippingWorkflowRepositoryError,
  type ShippingWorkflowErrorCode,
} from "./errors.ts";
import type {
  ClaimShippingValidationInput,
  CompleteShippingValidationInput,
  FailShippingValidationInput,
  OpenedShippingCredential,
  OpenShippingCredentialInput,
  PostgresShippingWorkflowRepositoryOptions,
  ShippingCredentialAuthority,
  ShippingValidationClaim,
  ShippingValidationResource,
  ShippingWorkflowRepository,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const WORKER = /^[A-Za-z0-9._-]{1,128}$/;
const CODE = /^[a-z][a-z0-9_]{1,63}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const RESOURCE_ID = /^[A-Za-z0-9_-]{1,200}$/;
const CODES = new Set<string>(SHIPPING_WORKFLOW_ERROR_CODES);

function unavailable(): ShippingWorkflowRepositoryError { return new ShippingWorkflowRepositoryError("unavailable"); }
function invalid(): never { throw new ShippingWorkflowRepositoryError("invalid_input"); }

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.length !== keys.length || ownKeys.some((key) => typeof key !== "string" || !keys.includes(key)) || keys.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  const parsed: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of ownKeys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    parsed[key] = descriptor.value;
  }
  return parsed;
}

function uuid(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) invalid(); return value; }
function worker(value: unknown): string { if (typeof value !== "string" || !WORKER.test(value)) invalid(); return value; }
function date(value: unknown): Date { if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid(); return new Date(value.getTime()); }
function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}
function digest(value: unknown): string { if (typeof value !== "string" || !DIGEST.test(value)) invalid(); return value; }
function timeout(value: number): string { if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw unavailable(); return `${value}ms`; }

function row(query: Readonly<{ rows: unknown[]; rowCount?: number | null }>): Readonly<{ outcome: string; result: unknown }> {
  if (query.rowCount !== 1 || query.rows.length !== 1) throw unavailable();
  const selected = query.rows[0];
  if (typeof selected !== "object" || selected === null || Array.isArray(selected)) throw unavailable();
  const parsed = selected as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== "outcome,result_payload" || typeof parsed.outcome !== "string") throw unavailable();
  return Object.freeze({ outcome: parsed.outcome, result: parsed.result_payload });
}

function claim(value: unknown, expected: Readonly<{ jobId: string; workerId: string; leaseId: string }>): ShippingValidationClaim {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== "credentialVersion,fenceToken,jobId,leaseId,profileId,providerCode,storeId,version") throw unavailable();
  try {
    const result = Object.freeze({
      jobId: uuid(parsed.jobId), storeId: uuid(parsed.storeId), profileId: uuid(parsed.profileId),
      providerCode: parsed.providerCode === "basit_kargo" ? "basit_kargo" as const : invalid(),
      credentialVersion: integer(parsed.credentialVersion, 1), leaseId: uuid(parsed.leaseId), workerId: expected.workerId,
      fenceToken: integer(parsed.fenceToken, 1), version: integer(parsed.version, 1),
    });
    if (result.jobId !== expected.jobId || result.leaseId !== expected.leaseId) throw unavailable();
    return result;
  } catch (error) { if (error instanceof ShippingWorkflowRepositoryError && error.code === "unavailable") throw error; throw unavailable(); }
}

function envelope(value: unknown): SealedShippingCredential {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== "algorithm,ciphertext,iv,keyId,tag,version" || parsed.algorithm !== "A256GCM" || parsed.version !== 1) throw unavailable();
  return Object.freeze({
    algorithm: "A256GCM", ciphertext: String(parsed.ciphertext), iv: String(parsed.iv),
    keyId: String(parsed.keyId), tag: String(parsed.tag), version: 1,
  });
}

function credentialAuthority(value: unknown, expected: ShippingValidationClaim): ShippingCredentialAuthority {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw unavailable();
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== "credentialDigest,credentialEnvelope,credentialKeyId,credentialVersion,providerCode") throw unavailable();
  const selectedEnvelope = envelope(parsed.credentialEnvelope);
  if (parsed.providerCode !== "basit_kargo" || parsed.credentialKeyId !== selectedEnvelope.keyId || parsed.credentialVersion !== expected.credentialVersion) throw unavailable();
  return Object.freeze({
    providerCode: "basit_kargo", credentialEnvelope: selectedEnvelope,
    credentialDigest: typeof parsed.credentialDigest === "string" && DIGEST.test(parsed.credentialDigest) ? parsed.credentialDigest : (() => { throw unavailable(); })(),
    credentialKeyId: selectedEnvelope.keyId, credentialVersion: expected.credentialVersion,
  });
}

function copyKeyring(value: ShippingCredentialKeyring): ShippingCredentialKeyring {
  try {
    if (!value || typeof value.activeKeyId !== "string" || !Array.isArray(value.keys)) throw unavailable();
    return Object.freeze({ activeKeyId: value.activeKeyId, keys: Object.freeze(value.keys.map((entry) => Object.freeze({ keyId: entry.keyId, key: new Uint8Array(entry.key) }))) });
  } catch { throw unavailable(); }
}

function resource(value: unknown): ShippingValidationResource {
  const parsed = exact(value, ["id", "kind", "providerResourceId", "label", "active", "digest"]);
  if (
    parsed.kind !== "brand" && parsed.kind !== "address" && parsed.kind !== "handler" ||
    typeof parsed.providerResourceId !== "string" || !RESOURCE_ID.test(parsed.providerResourceId) ||
    typeof parsed.label !== "string" || parsed.label.length < 1 || parsed.label.length > 200 || parsed.label !== parsed.label.trim() ||
    typeof parsed.active !== "boolean"
  ) invalid();
  return Object.freeze({
    id: uuid(parsed.id), kind: parsed.kind, providerResourceId: parsed.providerResourceId,
    label: parsed.label, active: parsed.active, digest: digest(parsed.digest),
  });
}

export class PostgresShippingWorkflowRepository implements ShippingWorkflowRepository {
  private readonly options: Omit<PostgresShippingWorkflowRepositoryOptions, "keyring"> & Readonly<{ keyring: ShippingCredentialKeyring }>;
  constructor(options: PostgresShippingWorkflowRepositoryOptions) {
    try {
      if (!options || options.role !== "celebix_saas_workflow" || !options.pool || typeof options.pool.connect !== "function") throw unavailable();
      for (const selected of Object.values(options.timeouts)) timeout(selected);
      this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }), keyring: copyKeyring(options.keyring) });
    } catch (error) { if (error instanceof ShippingWorkflowRepositoryError) throw error; throw unavailable(); }
  }

  private async acquire(): Promise<PostgresClientLike> {
    try { return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); }
    catch { throw unavailable(); }
  }

  private async configure(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout',$1,true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout',$1,true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout',$1,true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query("SET LOCAL ROLE celebix_saas_workflow");
  }

  private known(outcome: string): ShippingWorkflowRepositoryError | null {
    return CODES.has(outcome) ? new ShippingWorkflowRepositoryError(outcome as ShippingWorkflowErrorCode) : null;
  }

  private async transaction<T>(readOnly: boolean, operation: (client: PostgresClientLike) => Promise<T>): Promise<T> {
    const client = await this.acquire();
    let began = false, terminal = false;
    try {
      await client.query(readOnly ? "BEGIN READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      await this.configure(client);
      const result = await operation(client);
      try { await client.query("COMMIT"); terminal = true; client.release(); return result; }
      catch { terminal = true; client.release(true); if (result && typeof result === "object" && "tokenBytes" in result) (result as unknown as OpenedShippingCredential).tokenBytes.fill(0); throw new ShippingWorkflowRepositoryError("commit_unknown"); }
    } catch (error) {
      if (began && !terminal) { try { await client.query("ROLLBACK"); client.release(); } catch { client.release(true); } }
      else if (!terminal) client.release(true);
      if (error instanceof ShippingWorkflowRepositoryError) throw error;
      throw unavailable();
    }
  }

  async claimValidation(input: ClaimShippingValidationInput): Promise<ShippingValidationClaim | null> {
    const parsed = exact(input, ["jobId", "workerId", "now", "leaseSeconds", "leaseId"]);
    const expected = { jobId: uuid(parsed.jobId), workerId: worker(parsed.workerId), leaseId: uuid(parsed.leaseId) };
    const now = date(parsed.now), leaseSeconds = integer(parsed.leaseSeconds, 5, 900);
    return this.transaction(false, async (client) => {
      const result = row(await client.query(
        "SELECT outcome,result_payload FROM saas.shipping_validation_claim_job($1::uuid,$2::text,$3::timestamptz,$4::integer,$5::uuid)",
        [expected.jobId, expected.workerId, now.toISOString(), leaseSeconds, expected.leaseId],
      ));
      const known = this.known(result.outcome); if (known) throw known;
      if (result.outcome === "empty" && result.result === null) return null;
      if (result.outcome !== "claimed") throw unavailable();
      return claim(result.result, expected);
    });
  }

  async openClaimedCredential(input: OpenShippingCredentialInput): Promise<OpenedShippingCredential> {
    const parsed = exact(input, ["claim", "now"]);
    const selected = parsed.claim as ShippingValidationClaim;
    const now = date(parsed.now);
    if (!selected || typeof selected !== "object") invalid();
    return this.transaction(true, async (client) => {
      const result = row(await client.query(
        "SELECT outcome,result_payload FROM saas.shipping_validation_open_credential($1::uuid,$2::text,$3::uuid,$4::bigint,$5::timestamptz)",
        [uuid(selected.jobId), worker(selected.workerId), uuid(selected.leaseId), integer(selected.fenceToken, 1), now.toISOString()],
      ));
      const known = this.known(result.outcome); if (known) throw known;
      if (result.outcome !== "opened") throw unavailable();
      const authority = credentialAuthority(result.result, selected);
      const tokenBytes = openShippingCredential({
        envelope: authority.credentialEnvelope, storeId: uuid(selected.storeId), profileId: uuid(selected.profileId),
        providerCode: "basit_kargo", credentialVersion: authority.credentialVersion, keyring: this.options.keyring,
      });
      return Object.freeze({ providerCode: "basit_kargo" as const, tokenBytes });
    });
  }

  async completeValidation(input: CompleteShippingValidationInput): Promise<"completed"> {
    const parsed = exact(input, ["claim", "now", "accountIdentityDigest", "resources"]);
    const selected = parsed.claim as ShippingValidationClaim, now = date(parsed.now), accountIdentityDigest = digest(parsed.accountIdentityDigest);
    if (!Array.isArray(parsed.resources) || parsed.resources.length < 1 || parsed.resources.length > 300) invalid();
    const resources = Object.freeze(parsed.resources.map(resource));
    if (new Set(resources.map((entry) => entry.id)).size !== resources.length) invalid();
    return this.transaction(false, async (client) => {
      const result = row(await client.query(
        "SELECT outcome,result_payload FROM saas.shipping_validation_complete($1::uuid,$2::text,$3::uuid,$4::bigint,$5::timestamptz,$6::text,$7::jsonb)",
        [uuid(selected.jobId), worker(selected.workerId), uuid(selected.leaseId), integer(selected.fenceToken, 1), now.toISOString(), accountIdentityDigest, JSON.stringify(resources)],
      ));
      const known = this.known(result.outcome); if (known) throw known;
      if (result.outcome !== "completed") throw unavailable();
      return "completed" as const;
    });
  }

  async failValidation(input: FailShippingValidationInput): Promise<"failed" | "requeued"> {
    const parsed = exact(input, ["claim", "now", "failureKind", "safeCode", "retryAfterSeconds"]);
    const selected = parsed.claim as ShippingValidationClaim, now = date(parsed.now);
    if (!(["credential_invalid", "rejected", "throttled", "temporary_failure"] as const).includes(parsed.failureKind as never) || typeof parsed.safeCode !== "string" || !CODE.test(parsed.safeCode)) invalid();
    const retry = parsed.retryAfterSeconds === null ? null : integer(parsed.retryAfterSeconds, 1, 900);
    if ((parsed.failureKind === "throttled" || parsed.failureKind === "temporary_failure") !== (retry !== null)) invalid();
    return this.transaction(false, async (client) => {
      const result = row(await client.query(
        "SELECT outcome,result_payload FROM saas.shipping_validation_fail($1::uuid,$2::text,$3::uuid,$4::bigint,$5::timestamptz,$6::text,$7::text,$8::integer)",
        [uuid(selected.jobId), worker(selected.workerId), uuid(selected.leaseId), integer(selected.fenceToken, 1), now.toISOString(), parsed.failureKind, parsed.safeCode, retry],
      ));
      const known = this.known(result.outcome); if (known) throw known;
      if (result.outcome !== "failed" && result.outcome !== "requeued") throw unavailable();
      return result.outcome;
    });
  }
}
