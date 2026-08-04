import {
  parseStorefrontAccountMutationResult,
  parseStorefrontAccountOrder,
  parseStorefrontAccountSnapshot,
  parseStorefrontAuthStartResult,
  parseStorefrontAuthVerifyResult,
  type StorefrontAccountDevice,
} from "@celebix/saas-contracts";

import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { commerceCandidates, commerceLimit } from "../storefront-commerce/validation.ts";
import type { PostgresStorefrontIdentityRepositoryOptions, StorefrontIdentityRepository } from "./types.ts";
import {
  commerceDate, commerceHostname, commerceUuid, exactCommerceInput, identityAddress, identityBoolean,
  identityBrand, identityCorrelation, identityDeviceId, identityDigest, identityEmail, identityFingerprint,
  identityKeyId, identityOptionalPhone, identityOrderReference, identityText, identityVersion,
} from "./validation.ts";

export const STOREFRONT_IDENTITY_ERROR_CODES = Object.freeze([
  "invalid_input", "not_found", "unauthenticated", "challenge_invalid", "account_suspended",
  "version_conflict", "operation_mismatch", "unavailable", "commit_unknown",
] as const);
export type StorefrontIdentityErrorCode = (typeof STOREFRONT_IDENTITY_ERROR_CODES)[number];
const ERROR_CODES = new Set<string>(STOREFRONT_IDENTITY_ERROR_CODES);

export class StorefrontIdentityRepositoryError extends Error {
  readonly code: StorefrontIdentityErrorCode;
  constructor(code: StorefrontIdentityErrorCode = "unavailable") {
    super(code); this.name = "StorefrontIdentityRepositoryError"; this.code = code; Object.freeze(this);
  }
}

type Envelope = Readonly<{ outcome: string; result: unknown }>;
const failure = (code: StorefrontIdentityErrorCode = "unavailable") => new StorefrontIdentityRepositoryError(code);
function timeout(value: number): string { if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw failure(); return `${value}ms`; }
function release(client: PostgresClientLike, destroy = false): void { try { client.release(destroy || undefined); } catch {} }
function envelope(result: Readonly<{ rows: unknown[]; rowCount?: number | null }>): Envelope {
  if (result.rowCount !== 1 || result.rows.length !== 1) throw failure();
  const row = exactCommerceInput(result.rows[0], ["outcome", "result_payload"]);
  if (typeof row.outcome !== "string") throw failure();
  return Object.freeze({ outcome: row.outcome, result: row.result_payload });
}
function parseExact(value: unknown, required: readonly string[]): Readonly<Record<string, unknown>> {
  try { return exactCommerceInput(value, required); } catch { throw failure(); }
}
function mapped(outcome: string): StorefrontIdentityRepositoryError | undefined {
  return ERROR_CODES.has(outcome) ? failure(outcome as StorefrontIdentityErrorCode) : undefined;
}
function parseOrders(value: unknown) {
  const selected = parseExact(value, ["items"]);
  if (!Array.isArray(selected.items) || Object.getPrototypeOf(selected.items) !== Array.prototype || selected.items.length > 50 || Object.keys(selected.items).length !== selected.items.length) throw failure();
  try { return Object.freeze(selected.items.map(parseStorefrontAccountOrder)); } catch { throw failure(); }
}
function parseDevices(value: unknown): readonly StorefrontAccountDevice[] {
  const selected = parseExact(value, ["items"]);
  try {
    return parseStorefrontAccountSnapshot({ status: "active", version: 1, profile: { email: "parser@celebix.test", firstName: "C", lastName: "X" }, addresses: [], favorites: [], devices: selected.items }).devices;
  } catch { throw failure(); }
}

export class PostgresStorefrontIdentityRepository implements StorefrontIdentityRepository {
  private readonly options: PostgresStorefrontIdentityRepositoryOptions;
  constructor(options: PostgresStorefrontIdentityRepositoryOptions) {
    const parsed = exactCommerceInput(options, ["pool", "role", "timeouts", "audit"]);
    if (parsed.role !== "celebix_saas_host_resolver" || !parsed.pool || typeof (parsed.pool as { connect?: unknown }).connect !== "function" || typeof parsed.audit !== "function") throw failure();
    const timeouts = exactCommerceInput(parsed.timeouts, ["poolCheckoutMs", "statementMs", "lockMs", "idleTransactionMs"]);
    for (const selected of Object.values(timeouts)) timeout(selected as number);
    this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
  }
  private async acquire(): Promise<PostgresClientLike> { try { return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { throw failure(); } }
  private async configure(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query("SET LOCAL ROLE celebix_saas_host_resolver");
  }
  private async rollback(client: PostgresClientLike): Promise<void> { try { await client.query("ROLLBACK"); release(client); } catch { release(client, true); } }
  private emitUnknown(): void { try { const pending = this.options.audit(Object.freeze({ type: "storefront_identity_commit_unknown" })); if (pending) void pending.catch(() => undefined); } catch {} }
  private async transaction<T>(text: string, values: unknown[], outcomes: readonly string[], parser: (value: unknown) => T, readOnly = false): Promise<T> {
    const client = await this.acquire(); let began = false; let terminal = false;
    try {
      await client.query(readOnly ? "BEGIN READ ONLY" : "BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      await this.configure(client);
      const selected = envelope(await client.query(text, values));
      const error = mapped(selected.outcome); if (error) throw error;
      if (!outcomes.includes(selected.outcome)) throw failure();
      let parsed: T; try { parsed = parser(selected.result); } catch (error) { if (error instanceof StorefrontIdentityRepositoryError) throw error; throw failure(); }
      try { await client.query("COMMIT"); terminal = true; release(client); return parsed; }
      catch { terminal = true; release(client, true); throw failure("commit_unknown"); }
    } catch (error) {
      if (began && !terminal) await this.rollback(client); else if (!terminal) release(client, true);
      if (error instanceof StorefrontIdentityRepositoryError) throw error;
      throw failure();
    }
  }
  private async mutation<T>(text: string, values: unknown[], parser: (value: unknown) => T): Promise<T> {
    let observed: T;
    try { return await this.transaction(text, values, ["committed", "operation_replayed"], (value) => { observed = parser(value); return observed; }); }
    catch (error) {
      if (!(error instanceof StorefrontIdentityRepositoryError) || error.code !== "commit_unknown") throw error;
      this.emitUnknown();
      try {
        const recovered = await this.transaction(text, values, ["operation_replayed"], parser);
        if (JSON.stringify(recovered) !== JSON.stringify(observed!)) throw failure("commit_unknown");
        return recovered;
      } catch { throw failure("commit_unknown"); }
    }
  }

  async start(input: Parameters<StorefrontIdentityRepository["start"]>[0]) {
    try {
      const p = exactCommerceInput(input, ["hostname", "now", "challengeId", "emailDigest", "requestDigest", "codeKeyId", "codeDigest", "ticketKeyId", "ticketDigest", "expiresAt", "outboxId", "recipientCiphertext", "brandSnapshot", "correlationId"]);
      const now = commerceDate(p.now); const expiresAt = commerceDate(p.expiresAt);
      if (expiresAt <= now || expiresAt.getTime() > now.getTime() + 900_000) throw failure("invalid_input");
      return await this.transaction(
        "SELECT outcome,result_payload FROM saas.public_account_auth_start_v2($1::text,$2::timestamptz,$3::uuid,$4::text,$5::text,$6::text,$7::text,$8::text,$9::text,$10::timestamptz,$11::uuid,$12::text,$13::jsonb,$14::text)",
        [commerceHostname(p.hostname), now, commerceUuid(p.challengeId), identityDigest(p.emailDigest), identityDigest(p.requestDigest), identityKeyId(p.codeKeyId), identityDigest(p.codeDigest), identityKeyId(p.ticketKeyId), identityDigest(p.ticketDigest), expiresAt, commerceUuid(p.outboxId), identityText(p.recipientCiphertext, 20, 2048, /^[A-Za-z0-9_.-]+$/u), JSON.stringify(identityBrand(p.brandSnapshot)), identityCorrelation(p.correlationId)],
        ["accepted"], (value) => { const selected = parseExact(value, ["retryAfterSeconds"]); return parseStorefrontAuthStartResult({ outcome: "accepted", retryAfterSeconds: selected.retryAfterSeconds }); },
      );
    } catch (error) { if (error instanceof StorefrontIdentityRepositoryError) throw error; throw failure("invalid_input"); }
  }

  async verify(input: Parameters<StorefrontIdentityRepository["verify"]>[0]) {
    try {
      const p = exactCommerceInput(input, ["hostname", "now", "challengeId", "emailDigest", "verifierKind", "verifierDigest", "email", "accountId", "sessionId", "sessionKeyId", "sessionDigest", "csrfDigest", "deviceLabel", "userAgentDigest", "correlationId"]);
      if (p.verifierKind !== "ticket" && p.verifierKind !== "code") throw failure("invalid_input");
      return await this.transaction(
        "SELECT outcome,result_payload FROM saas.public_account_auth_verify_v2($1::text,$2::timestamptz,$3::uuid,$4::text,$5::text,$6::text,$7::text,$8::uuid,$9::uuid,$10::text,$11::text,$12::text,$13::text,$14::text,$15::text)",
        [commerceHostname(p.hostname), commerceDate(p.now), commerceUuid(p.challengeId), identityDigest(p.emailDigest), p.verifierKind, identityDigest(p.verifierDigest), identityEmail(p.email), commerceUuid(p.accountId), commerceUuid(p.sessionId), identityKeyId(p.sessionKeyId), identityDigest(p.sessionDigest), identityDigest(p.csrfDigest), identityText(p.deviceLabel, 1, 100), identityDigest(p.userAgentDigest), identityCorrelation(p.correlationId)],
        ["authenticated", "profile_required"], (value) => { const selected = parseExact(value, ["profileRequired"]); return parseStorefrontAuthVerifyResult(selected.profileRequired === true ? { outcome: "profile_required", profileRequired: true } : { outcome: "authenticated", profileRequired: selected.profileRequired }); },
      );
    } catch (error) { if (error instanceof StorefrontIdentityRepositoryError) throw error; throw failure("invalid_input"); }
  }

  async completeProfile(input: Parameters<StorefrontIdentityRepository["completeProfile"]>[0]) {
    try {
      const p = exactCommerceInput(input, ["hostname", "now", "candidates", "operationId", "fingerprint", "correlationId", "customerId", "firstName", "lastName", "fullSessionId", "sessionKeyId", "sessionDigest", "csrfDigest", "deviceLabel", "userAgentDigest"], ["phone"]);
      return await this.mutation(
        "SELECT outcome,result_payload FROM saas.public_account_profile_complete($1::text,$2::timestamptz,$3::jsonb,$4::uuid,$5::text,$6::uuid,$7::text,$8::text,$9::text,$10::uuid,$11::text,$12::text,$13::text,$14::text,$15::text,$16::text)",
        [commerceHostname(p.hostname), commerceDate(p.now), JSON.stringify(commerceCandidates(p.candidates)), commerceUuid(p.operationId), identityFingerprint(p.fingerprint), commerceUuid(p.customerId), identityText(p.firstName, 1, 100), identityText(p.lastName, 1, 100), identityOptionalPhone(p.phone) ?? null, commerceUuid(p.fullSessionId), identityKeyId(p.sessionKeyId), identityDigest(p.sessionDigest), identityDigest(p.csrfDigest), identityText(p.deviceLabel, 1, 100), identityDigest(p.userAgentDigest), identityCorrelation(p.correlationId)],
        parseStorefrontAccountMutationResult,
      );
    } catch (error) { if (error instanceof StorefrontIdentityRepositoryError) throw error; throw failure("invalid_input"); }
  }

  async session(input: Parameters<StorefrontIdentityRepository["session"]>[0]) {
    try {
      const p = exactCommerceInput(input, ["hostname", "now", "candidates"]);
      const client = await this.acquire(); let began = false; let terminal = false;
      try {
        await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true; await this.configure(client);
        const selected = envelope(await client.query("SELECT outcome,result_payload FROM saas.public_account_session_get($1::text,$2::timestamptz,$3::jsonb)", [commerceHostname(p.hostname), commerceDate(p.now), JSON.stringify(commerceCandidates(p.candidates))]));
        let result;
        if (selected.outcome === "unauthenticated") result = Object.freeze({ outcome: "unauthenticated" as const });
        else if (selected.outcome === "profile_required") result = Object.freeze({ outcome: "profile_required" as const });
        else if (selected.outcome === "found") result = Object.freeze({ outcome: "found" as const, snapshot: parseStorefrontAccountSnapshot(selected.result) });
        else { const error = mapped(selected.outcome); throw error ?? failure(); }
        await client.query("COMMIT"); terminal = true; release(client); return result;
      } catch (error) { if (began && !terminal) await this.rollback(client); else if (!terminal) release(client, true); if (error instanceof StorefrontIdentityRepositoryError) throw error; throw failure(); }
    } catch (error) { if (error instanceof StorefrontIdentityRepositoryError) throw error; throw failure("invalid_input"); }
  }

  async logout(input: Parameters<StorefrontIdentityRepository["logout"]>[0]): Promise<void> {
    try { const p = exactCommerceInput(input, ["hostname", "now", "candidates", "correlationId"]); await this.transaction("SELECT outcome,result_payload FROM saas.public_account_logout($1::text,$2::timestamptz,$3::jsonb,$4::text)", [commerceHostname(p.hostname), commerceDate(p.now), JSON.stringify(commerceCandidates(p.candidates)), identityCorrelation(p.correlationId)], ["logged_out"], () => undefined); }
    catch (error) { if (error instanceof StorefrontIdentityRepositoryError) throw error; throw failure("invalid_input"); }
  }
  async logoutAll(input: Parameters<StorefrontIdentityRepository["logoutAll"]>[0]): Promise<number> {
    try { const p = exactCommerceInput(input, ["hostname", "now", "candidates", "correlationId"]); return await this.transaction("SELECT outcome,result_payload FROM saas.public_account_logout_all($1::text,$2::timestamptz,$3::jsonb,$4::text)", [commerceHostname(p.hostname), commerceDate(p.now), JSON.stringify(commerceCandidates(p.candidates)), identityCorrelation(p.correlationId)], ["logged_out"], (value) => { const selected = parseExact(value, ["revoked"]); if (!Number.isSafeInteger(selected.revoked) || (selected.revoked as number) < 0) throw failure(); return selected.revoked as number; }); }
    catch (error) { if (error instanceof StorefrontIdentityRepositoryError) throw error; throw failure("invalid_input"); }
  }

  async updateProfile(input: Parameters<StorefrontIdentityRepository["updateProfile"]>[0]) {
    try { const p = exactCommerceInput(input, ["hostname", "now", "candidates", "operationId", "fingerprint", "correlationId", "firstName", "lastName", "expectedVersion"], ["phone"]); return await this.mutation("SELECT outcome,result_payload FROM saas.public_account_profile_update($1::text,$2::timestamptz,$3::jsonb,$4::uuid,$5::text,$6::text,$7::text,$8::text,$9::bigint,$10::text)", [commerceHostname(p.hostname), commerceDate(p.now), JSON.stringify(commerceCandidates(p.candidates)), commerceUuid(p.operationId), identityFingerprint(p.fingerprint), identityText(p.firstName, 1, 100), identityText(p.lastName, 1, 100), identityOptionalPhone(p.phone) ?? null, identityVersion(p.expectedVersion), identityCorrelation(p.correlationId)], parseStorefrontAccountMutationResult); }
    catch (error) { if (error instanceof StorefrontIdentityRepositoryError) throw error; throw failure("invalid_input"); }
  }
  async saveAddress(input: Parameters<StorefrontIdentityRepository["saveAddress"]>[0]) {
    try { const p = exactCommerceInput(input, ["hostname", "now", "candidates", "operationId", "fingerprint", "correlationId", "address", "expectedVersion"]); const a = identityAddress(p.address); return await this.mutation("SELECT outcome,result_payload FROM saas.public_account_address_save($1::text,$2::timestamptz,$3::jsonb,$4::uuid,$5::text,$6::uuid,$7::text,$8::text,$9::text,$10::text,$11::text,$12::text,$13::text,$14::text,$15::boolean,$16::bigint,$17::text)", [commerceHostname(p.hostname), commerceDate(p.now), JSON.stringify(commerceCandidates(p.candidates)), commerceUuid(p.operationId), identityFingerprint(p.fingerprint), a.id, a.label, a.recipientName, a.line1, a.line2 ?? null, a.city, a.district ?? null, a.postalCode ?? null, a.country, a.isDefault, identityVersion(p.expectedVersion, true), identityCorrelation(p.correlationId)], parseStorefrontAccountMutationResult); }
    catch (error) { if (error instanceof StorefrontIdentityRepositoryError) throw error; throw failure("invalid_input"); }
  }
  async deleteAddress(input: Parameters<StorefrontIdentityRepository["deleteAddress"]>[0]) {
    try { const p = exactCommerceInput(input, ["hostname", "now", "candidates", "operationId", "fingerprint", "correlationId", "addressId", "expectedVersion"]); return await this.mutation("SELECT outcome,result_payload FROM saas.public_account_address_delete($1::text,$2::timestamptz,$3::jsonb,$4::uuid,$5::text,$6::uuid,$7::bigint,$8::text)", [commerceHostname(p.hostname), commerceDate(p.now), JSON.stringify(commerceCandidates(p.candidates)), commerceUuid(p.operationId), identityFingerprint(p.fingerprint), commerceUuid(p.addressId), identityVersion(p.expectedVersion), identityCorrelation(p.correlationId)], parseStorefrontAccountMutationResult); }
    catch (error) { if (error instanceof StorefrontIdentityRepositoryError) throw error; throw failure("invalid_input"); }
  }
  async favorite(input: Parameters<StorefrontIdentityRepository["favorite"]>[0]) {
    try { const p = exactCommerceInput(input, ["hostname", "now", "candidates", "operationId", "fingerprint", "correlationId", "productId", "enabled"]); return await this.mutation("SELECT outcome,result_payload FROM saas.public_account_favorite_set($1::text,$2::timestamptz,$3::jsonb,$4::uuid,$5::text,$6::uuid,$7::boolean,$8::text)", [commerceHostname(p.hostname), commerceDate(p.now), JSON.stringify(commerceCandidates(p.candidates)), commerceUuid(p.operationId), identityFingerprint(p.fingerprint), commerceUuid(p.productId), identityBoolean(p.enabled), identityCorrelation(p.correlationId)], parseStorefrontAccountMutationResult); }
    catch (error) { if (error instanceof StorefrontIdentityRepositoryError) throw error; throw failure("invalid_input"); }
  }
  async orders(input: Parameters<StorefrontIdentityRepository["orders"]>[0]) {
    try { const p = exactCommerceInput(input, ["hostname", "now", "candidates", "limit"]); return await this.transaction("SELECT outcome,result_payload FROM saas.public_account_orders($1::text,$2::timestamptz,$3::jsonb,$4::integer,$5::text)", [commerceHostname(p.hostname), commerceDate(p.now), JSON.stringify(commerceCandidates(p.candidates)), commerceLimit(p.limit), null], ["found"], parseOrders); }
    catch (error) { if (error instanceof StorefrontIdentityRepositoryError) throw error; throw failure("invalid_input"); }
  }
  async order(input: Parameters<StorefrontIdentityRepository["order"]>[0]) {
    try { const p = exactCommerceInput(input, ["hostname", "now", "candidates", "orderReference"]); return await this.transaction("SELECT outcome,result_payload FROM saas.public_account_order_get($1::text,$2::timestamptz,$3::jsonb,$4::text)", [commerceHostname(p.hostname), commerceDate(p.now), JSON.stringify(commerceCandidates(p.candidates)), identityOrderReference(p.orderReference)], ["found"], parseStorefrontAccountOrder); }
    catch (error) { if (error instanceof StorefrontIdentityRepositoryError) throw error; throw failure("invalid_input"); }
  }
  async devices(input: Parameters<StorefrontIdentityRepository["devices"]>[0]) {
    try { const p = exactCommerceInput(input, ["hostname", "now", "candidates"]); return await this.transaction("SELECT outcome,result_payload FROM saas.public_account_sessions($1::text,$2::timestamptz,$3::jsonb)", [commerceHostname(p.hostname), commerceDate(p.now), JSON.stringify(commerceCandidates(p.candidates))], ["found"], parseDevices); }
    catch (error) { if (error instanceof StorefrontIdentityRepositoryError) throw error; throw failure("invalid_input"); }
  }
  async revokeDevice(input: Parameters<StorefrontIdentityRepository["revokeDevice"]>[0]) {
    try { const p = exactCommerceInput(input, ["hostname", "now", "candidates", "operationId", "fingerprint", "correlationId", "deviceId"]); return await this.mutation("SELECT outcome,result_payload FROM saas.public_account_session_revoke($1::text,$2::timestamptz,$3::jsonb,$4::uuid,$5::text,$6::text,$7::text)", [commerceHostname(p.hostname), commerceDate(p.now), JSON.stringify(commerceCandidates(p.candidates)), commerceUuid(p.operationId), identityFingerprint(p.fingerprint), identityDeviceId(p.deviceId), identityCorrelation(p.correlationId)], parseStorefrontAccountMutationResult); }
    catch (error) { if (error instanceof StorefrontIdentityRepositoryError) throw error; throw failure("invalid_input"); }
  }
}
