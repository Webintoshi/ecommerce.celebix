import { types as nodeTypes } from "node:util";

import type { BeginPaymentAttemptResult } from "../payment-attempts/types.ts";
import { paymentAttemptSealedCredentials } from "../payment-attempts/validation.ts";
import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import {
  hostedExact,
  hostedInput,
  parseHostedAuthority,
  parseHostedBegin,
  parseHostedPresentation,
  parseHostedStatus,
} from "./validation.ts";
import type {
  HostedCheckoutAuthority,
  HostedCheckoutAuthorityInput,
  HostedCheckoutBeginInput,
  HostedCheckoutPresentationInput,
  HostedCheckoutPresentationSaveInput,
  HostedCheckoutPresentationState,
  HostedCheckoutPublicStatus,
  PostgresStorefrontHostedCheckoutRepositoryOptions,
  StorefrontHostedCheckoutRepository,
} from "./types.ts";

export const STOREFRONT_HOSTED_CHECKOUT_ERROR_CODES = Object.freeze([
  "invalid_input", "authority_unavailable", "durable_authority_invalid", "attempt_in_progress",
  "stock_unavailable", "operation_mismatch", "callback_binding_conflict", "store_inactive",
  "payment_method_not_found", "payment_method_inactive", "profile_not_found", "profile_not_active",
  "provider_disabled", "environment_invalid", "credential_version_mismatch", "version_conflict",
  "invalid_transition", "session_expired", "presentation_unavailable", "not_found",
  "unavailable", "commit_unknown",
] as const);
export type StorefrontHostedCheckoutErrorCode = (typeof STOREFRONT_HOSTED_CHECKOUT_ERROR_CODES)[number];
const ERROR_CODES = new Set<string>(STOREFRONT_HOSTED_CHECKOUT_ERROR_CODES);

export class StorefrontHostedCheckoutRepositoryError extends Error {
  readonly code: StorefrontHostedCheckoutErrorCode;
  constructor(code: StorefrontHostedCheckoutErrorCode = "unavailable") {
    if (!ERROR_CODES.has(code)) throw new TypeError("storefront_hosted_checkout_error_code_invalid");
    super(code); this.code = code;
    Object.defineProperties(this, {
      code: { enumerable: true, writable: false },
      message: { enumerable: false, writable: false },
      name: { enumerable: false, writable: false, value: "StorefrontHostedCheckoutRepositoryError" },
    });
    Object.freeze(this);
  }
}
class TrustedError extends StorefrontHostedCheckoutRepositoryError {}
const failure = (code: StorefrontHostedCheckoutErrorCode = "unavailable") => new TrustedError(code);
const isTrusted = (value: unknown): value is TrustedError => value instanceof TrustedError;
function invalid(): never { throw failure("invalid_input"); }
function unavailable(): never { throw failure("unavailable"); }

type Options = PostgresStorefrontHostedCheckoutRepositoryOptions;
type Selected = Readonly<{ outcome: string; result: unknown }>;
function timeout(value: unknown): string {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 60_000) unavailable();
  return `${String(value)}ms`;
}
function release(client: PostgresClientLike, destroy = false): void { try { client.release(destroy || undefined); } catch { /* cleanup only */ } }
async function rollback(client: PostgresClientLike): Promise<void> { try { await client.query("ROLLBACK"); release(client); } catch { release(client, true); } }
function selected(value: unknown): Selected {
  try {
    const result = hostedExact(value, ["rows", "rowCount", "command", "oid", "fields"]);
    if (result.rowCount !== 1 || !Array.isArray(result.rows) || nodeTypes.isProxy(result.rows)
      || Object.getPrototypeOf(result.rows) !== Array.prototype || result.rows.length !== 1) unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(result.rows) as unknown as Record<PropertyKey, PropertyDescriptor>;
    if (Reflect.ownKeys(descriptors).length !== 2 || !descriptors["0"]?.enumerable || !("value" in descriptors["0"])) unavailable();
    const row = hostedExact(descriptors["0"].value, ["outcome", "result_payload"]);
    if (typeof row.outcome !== "string" || !/^[a-z][a-z0-9_]{0,63}$/u.test(row.outcome)) unavailable();
    return Object.freeze({ outcome: row.outcome, result: row.result_payload });
  } catch (error) { if (isTrusted(error)) throw error; return unavailable(); }
}
function mapOutcome(outcome: string): never {
  if (ERROR_CODES.has(outcome)) throw failure(outcome as StorefrontHostedCheckoutErrorCode);
  return unavailable();
}
function keyId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_-]{0,31}$/u.test(value)) invalid();
  return value;
}
function issued(value: unknown) {
  const parsed = hostedExact(value, ["keyId", "digest"]);
  return Object.freeze({ keyId: keyId(parsed.keyId), digest: hostedInput.digest(parsed.digest) });
}
function validateOptions(value: PostgresStorefrontHostedCheckoutRepositoryOptions): Options {
  try {
    const parsed = hostedExact(value, ["pool", "role", "timeouts", "audit"]);
    const timeouts = hostedExact(parsed.timeouts, ["poolCheckoutMs", "statementMs", "lockMs", "idleTransactionMs"]);
    if (parsed.role !== "celebix_saas_host_resolver" || typeof parsed.audit !== "function"
      || typeof parsed.pool !== "object" || parsed.pool === null || nodeTypes.isProxy(parsed.pool)
      || typeof (parsed.pool as { connect?: unknown }).connect !== "function") unavailable();
    for (const item of Object.values(timeouts)) timeout(item);
    return Object.freeze({
      pool: parsed.pool as Options["pool"], role: "celebix_saas_host_resolver",
      timeouts: Object.freeze({
        poolCheckoutMs: timeouts.poolCheckoutMs as number, statementMs: timeouts.statementMs as number,
        lockMs: timeouts.lockMs as number, idleTransactionMs: timeouts.idleTransactionMs as number,
      }), audit: parsed.audit as Options["audit"],
    });
  } catch { throw new StorefrontHostedCheckoutRepositoryError("unavailable"); }
}

export class PostgresStorefrontHostedCheckoutRepository implements StorefrontHostedCheckoutRepository {
  private readonly options: Options;
  constructor(options: PostgresStorefrontHostedCheckoutRepositoryOptions) { this.options = validateOptions(options); }

  private async acquire(): Promise<PostgresClientLike> {
    try { return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); }
    catch { return unavailable(); }
  }
  private async configure(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query("SET LOCAL ROLE celebix_saas_host_resolver");
  }
  private async read<T>(text: string, values: unknown[], success: string, parser: (value: unknown) => T): Promise<T> {
    const client = await this.acquire(); let began = false; let terminal = false;
    try {
      await client.query("BEGIN READ ONLY"); began = true; await this.configure(client);
      const result = selected(await client.query(text, values));
      if (result.outcome !== success) return mapOutcome(result.outcome);
      let parsed: T; try { parsed = parser(result.result); } catch { return unavailable(); }
      try { await client.query("COMMIT"); terminal = true; release(client); return parsed; }
      catch { terminal = true; release(client, true); return unavailable(); }
    } catch (error) {
      if (began && !terminal) await rollback(client); else if (!terminal) release(client, true);
      if (isTrusted(error)) throw error; return unavailable();
    }
  }
  private emitUnknown(): void {
    try { void Promise.resolve(this.options.audit(Object.freeze({ type: "storefront_hosted_checkout_commit_unknown" }))).catch(() => undefined); }
    catch { /* observational */ }
  }
  private authorityValues(input: HostedCheckoutAuthorityInput) {
    const parsed = hostedExact(input, ["hostname", "now", "intentKind", "candidates", "cartVersion", "delivery", "paymentMethodId"]);
    if (parsed.intentKind !== "cart" && parsed.intentKind !== "buy_now") invalid();
    const now = hostedInput.date(parsed.now);
    const values = Object.freeze([
      hostedInput.hostname(parsed.hostname), now, parsed.intentKind,
      JSON.stringify(hostedInput.candidates(parsed.candidates)), hostedInput.version(parsed.cartVersion),
      JSON.stringify(hostedInput.delivery(parsed.delivery)), hostedInput.uuid(parsed.paymentMethodId),
    ]);
    return Object.freeze({ values, now, intentKind: parsed.intentKind, candidates: values[3] as string,
      hostname: values[0] as string, cartVersion: values[4] as number, delivery: values[5] as string,
      paymentMethodId: values[6] as string });
  }

  async authority(input: HostedCheckoutAuthorityInput): Promise<HostedCheckoutAuthority> {
    try {
      const validated = this.authorityValues(input);
      return await this.read(
        "SELECT outcome,result_payload FROM saas.public_storefront_hosted_checkout_authority($1::text,$2::timestamptz,$3::text,$4::jsonb,$5::bigint,$6::jsonb,$7::uuid)",
        [...validated.values], "found", parseHostedAuthority,
      );
    } catch (error) { throw new StorefrontHostedCheckoutRepositoryError(isTrusted(error) ? error.code : "invalid_input"); }
  }

  async begin(input: HostedCheckoutBeginInput): Promise<BeginPaymentAttemptResult> {
    try {
      const parsed = hostedExact(input, [
        "hostname", "now", "intentKind", "candidates", "cartVersion", "delivery", "paymentMethodId",
        "expectedAuthorityDigest", "operationId", "fingerprint", "sessionId", "callbackBindingDigest",
        "orderId", "customerId", "addressId", "eventId", "receiptId", "customerCredentialId",
        "paymentSession", "receipt", "customer",
      ]);
      const base = this.authorityValues({
        hostname: parsed.hostname as string, now: parsed.now as Date,
        intentKind: parsed.intentKind as "cart" | "buy_now", candidates: parsed.candidates as HostedCheckoutBeginInput["candidates"],
        cartVersion: parsed.cartVersion as number, delivery: parsed.delivery as HostedCheckoutBeginInput["delivery"],
        paymentMethodId: parsed.paymentMethodId as string,
      });
      const operationId = hostedInput.uuid(parsed.operationId); const sessionId = hostedInput.uuid(parsed.sessionId);
      const paymentSession = issued(parsed.paymentSession); const receipt = issued(parsed.receipt); const customer = issued(parsed.customer);
      const values = [
        ...base.values, hostedInput.digest(parsed.expectedAuthorityDigest), operationId,
        hostedInput.digest(parsed.fingerprint), sessionId, hostedInput.digest(parsed.callbackBindingDigest),
        hostedInput.uuid(parsed.orderId), hostedInput.uuid(parsed.customerId), hostedInput.uuid(parsed.addressId),
        hostedInput.uuid(parsed.eventId), hostedInput.uuid(parsed.receiptId), hostedInput.uuid(parsed.customerCredentialId),
        paymentSession.keyId, paymentSession.digest, receipt.keyId, receipt.digest, customer.keyId, customer.digest,
      ];
      const text = "SELECT outcome,result_payload FROM saas.public_storefront_hosted_checkout_begin($1::text,$2::timestamptz,$3::text,$4::jsonb,$5::bigint,$6::jsonb,$7::uuid,$8::text,$9::uuid,$10::text,$11::uuid,$12::text,$13::uuid,$14::uuid,$15::uuid,$16::uuid,$17::uuid,$18::uuid,$19::text,$20::text,$21::text,$22::text,$23::text,$24::text)";
      const client = await this.acquire(); let began = false; let terminal = false;
      try {
        await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true; await this.configure(client);
        const selectedResult = selected(await client.query(text, values));
        if (selectedResult.outcome !== "created" && selectedResult.outcome !== "operation_replayed") return mapOutcome(selectedResult.outcome);
        let observed: BeginPaymentAttemptResult;
        try { observed = parseHostedBegin(selectedResult.result, selectedResult.outcome, { operationId, paymentMethodId: base.paymentMethodId, sessionId }); }
        catch { return unavailable(); }
        try { await client.query("COMMIT"); terminal = true; release(client); return observed; }
        catch {
          terminal = true; release(client, true); this.emitUnknown();
          try {
            const recovered = await this.status({ hostname: base.hostname, now: base.now, candidates: [paymentSession] });
            if (recovered.sessionId !== sessionId) throw failure("commit_unknown");
            return observed;
          } catch { throw failure("commit_unknown"); }
        }
      } catch (error) {
        if (began && !terminal) await rollback(client); else if (!terminal) release(client, true);
        if (isTrusted(error)) throw error; return unavailable();
      }
    } catch (error) { throw new StorefrontHostedCheckoutRepositoryError(isTrusted(error) ? error.code : "invalid_input"); }
  }

  async savePresentation(input: HostedCheckoutPresentationSaveInput): Promise<HostedCheckoutPresentationState> {
    try {
      const parsed = hostedExact(input, ["hostname", "now", "candidates", "operationId", "fingerprint", "expectedVersion", "presentationKeyId", "presentationDigest", "sealedPresentation", "presentationExpiresAt"]);
      const now = hostedInput.date(parsed.now); const expiresAt = hostedInput.date(parsed.presentationExpiresAt);
      if (expiresAt <= now || expiresAt.getTime() > now.getTime() + 15 * 60_000) invalid();
      const presentationKeyId = typeof parsed.presentationKeyId === "string" ? parsed.presentationKeyId : invalid();
      const sealedPresentation = paymentAttemptSealedCredentials(parsed.sealedPresentation);
      if (sealedPresentation.keyId !== presentationKeyId) invalid();
      const values = [
        hostedInput.hostname(parsed.hostname), now, JSON.stringify(hostedInput.candidates(parsed.candidates)),
        hostedInput.uuid(parsed.operationId), hostedInput.digest(parsed.fingerprint), hostedInput.version(parsed.expectedVersion),
        keyId(presentationKeyId), hostedInput.digest(parsed.presentationDigest), JSON.stringify(sealedPresentation), expiresAt,
      ];
      const client = await this.acquire(); let began = false; let terminal = false;
      try {
        await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true; await this.configure(client);
        const result = selected(await client.query(
          "SELECT outcome,result_payload FROM saas.public_storefront_hosted_checkout_presentation_save($1::text,$2::timestamptz,$3::jsonb,$4::uuid,$5::text,$6::bigint,$7::text,$8::text,$9::jsonb,$10::timestamptz)", values));
        if (result.outcome !== "updated" && result.outcome !== "operation_replayed") return mapOutcome(result.outcome);
        let state: HostedCheckoutPresentationState; try { state = parseHostedPresentation(result.result, false); } catch { return unavailable(); }
        try { await client.query("COMMIT"); terminal = true; release(client); return state; }
        catch { terminal = true; release(client, true); this.emitUnknown(); throw failure("commit_unknown"); }
      } catch (error) {
        if (began && !terminal) await rollback(client); else if (!terminal) release(client, true);
        if (isTrusted(error)) throw error; return unavailable();
      }
    } catch (error) { throw new StorefrontHostedCheckoutRepositoryError(isTrusted(error) ? error.code : "invalid_input"); }
  }

  async presentation(input: HostedCheckoutPresentationInput): Promise<HostedCheckoutPresentationState> {
    try {
      const parsed = hostedExact(input, ["hostname", "now", "candidates"]);
      return await this.read(
        "SELECT outcome,result_payload FROM saas.public_storefront_hosted_checkout_presentation($1::text,$2::timestamptz,$3::jsonb)",
        [hostedInput.hostname(parsed.hostname), hostedInput.date(parsed.now), JSON.stringify(hostedInput.candidates(parsed.candidates))],
        "found", (value) => parseHostedPresentation(value, true),
      );
    } catch (error) { throw new StorefrontHostedCheckoutRepositoryError(isTrusted(error) ? error.code : "invalid_input"); }
  }

  async status(input: HostedCheckoutPresentationInput): Promise<HostedCheckoutPublicStatus> {
    try {
      const parsed = hostedExact(input, ["hostname", "now", "candidates"]);
      return await this.read(
        "SELECT outcome,result_payload FROM saas.public_storefront_hosted_checkout_status($1::text,$2::timestamptz,$3::jsonb)",
        [hostedInput.hostname(parsed.hostname), hostedInput.date(parsed.now), JSON.stringify(hostedInput.candidates(parsed.candidates))],
        "found", parseHostedStatus,
      );
    } catch (error) { throw new StorefrontHostedCheckoutRepositoryError(isTrusted(error) ? error.code : "invalid_input"); }
  }
}
