import { types as nodeTypes } from "node:util";

import { acquirePostgresClient, type PostgresClientLike, type PostgresPoolLike, type PostgresTimeoutOptions } from "../postgres/pool.ts";
import type { BeginPaymentAttemptInput, BeginPaymentAttemptResult } from "../payment-attempts/types.ts";
import {
  exactPaymentAttemptInput,
  paymentAttemptCurrency,
  paymentAttemptDate,
  paymentAttemptDigest,
  paymentAttemptEnvironment,
  paymentAttemptExecutionEvidenceDigest,
  paymentAttemptInteger,
  paymentAttemptMethodConfig,
  paymentAttemptOrderReference,
  paymentAttemptProviderCode,
  paymentAttemptPublicConfig,
  paymentAttemptSealedCredentials,
  paymentAttemptUuid,
} from "../payment-attempts/validation.ts";
import type { SealedEnvelope } from "./token-crypto.ts";

export const QUICK_ORDER_HOSTED_PAYMENT_ERROR_CODES = Object.freeze([
  "invalid_input", "quick_link_not_found", "durable_authority_invalid",
  "attempt_in_progress", "stock_unavailable", "operation_mismatch",
  "callback_binding_conflict", "store_inactive", "payment_method_not_found",
  "payment_method_inactive", "profile_not_found", "profile_not_active",
  "provider_disabled", "environment_invalid", "unavailable", "commit_unknown",
] as const);
export type QuickOrderHostedPaymentErrorCode = (typeof QUICK_ORDER_HOSTED_PAYMENT_ERROR_CODES)[number];
const ERROR_CODES = new Set<string>(QUICK_ORDER_HOSTED_PAYMENT_ERROR_CODES);

export class QuickOrderHostedPaymentRepositoryError extends Error {
  readonly code: QuickOrderHostedPaymentErrorCode;
  constructor(code: QuickOrderHostedPaymentErrorCode) {
    if (!ERROR_CODES.has(code)) throw new TypeError("quick_order_hosted_payment_error_code_invalid");
    super(code);
    this.code = code;
    Object.defineProperties(this, {
      code: { enumerable: true, writable: false },
      message: { enumerable: false, writable: false },
      name: { enumerable: false, writable: false, value: "QuickOrderHostedPaymentRepositoryError" },
    });
    Object.freeze(this);
  }
}
class TrustedError extends QuickOrderHostedPaymentRepositoryError {}
const trusted = (code: QuickOrderHostedPaymentErrorCode): QuickOrderHostedPaymentRepositoryError => new TrustedError(code);
const isTrusted = (value: unknown): value is QuickOrderHostedPaymentRepositoryError => value instanceof TrustedError;
function unavailable(): never { throw trusted("unavailable"); }
function invalid(): never { throw trusted("invalid_input"); }
function commitUnknown(): never { throw trusted("commit_unknown"); }

export type QuickOrderHostedPaymentAuthority = Readonly<{
  authorityDigest: string;
  storeId: string;
  linkId: string;
  redemptionSessionId: string;
  paymentMethodId: string;
  profileId: string;
  providerCode: "iyzico_iframe";
  environment: "test" | "live";
  executionAdapterVersion: number;
  executionEvidenceDigest: string;
  credentialVersion: number;
  orderReference: string;
  amountMinor: number;
  currency: string;
  identityAuthority: string;
  identityKeyId: string;
  sealedIdentity: SealedEnvelope;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  city: string;
  country: string;
  postalCode?: string;
  basket: readonly Readonly<{
    reference: string;
    name: string;
    quantity: number;
    unitAmountMinor: number;
    itemType: "PHYSICAL" | "VIRTUAL";
  }>[];
}>;

export type QuickOrderHostedPaymentAuthorityResult =
  | Readonly<{ kind: "legacy" }>
  | Readonly<{ kind: "found"; authority: QuickOrderHostedPaymentAuthority }>;

export type QuickOrderHostedPaymentBeginInput = Readonly<{
  hostname: string;
  redemptionDigest: string;
  expectedAuthorityDigest: string;
  payment: BeginPaymentAttemptInput;
}>;

export interface QuickOrderHostedPaymentRepository {
  getAuthority(input: Readonly<{ hostname: string; redemptionDigest: string; now: Date }>): Promise<QuickOrderHostedPaymentAuthorityResult>;
  begin(input: QuickOrderHostedPaymentBeginInput): Promise<BeginPaymentAttemptResult>;
}

export type PostgresQuickOrderHostedPaymentRepositoryOptions = Readonly<{
  pool: PostgresPoolLike;
  role: "celebix_saas_workflow";
  timeouts: PostgresTimeoutOptions;
  audit: (event: Readonly<{ type: "quick_order_hosted_payment_commit_unknown" }>) => void | Promise<void>;
}>;

type Options = PostgresQuickOrderHostedPaymentRepositoryOptions;
type Selected = Readonly<{ outcome: string; payload: unknown }>;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

function exact(value: unknown, required: readonly string[]): Readonly<Record<string, unknown>> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || nodeTypes.isProxy(value)) unavailable();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) unavailable();
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== required.length || keys.some((key) => typeof key !== "string" || !required.includes(key))
      || required.some((key) => !Object.hasOwn(descriptors, key))) unavailable();
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of required) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) unavailable();
      result[key] = descriptor.value;
    }
    return Object.freeze(result);
  } catch (error) {
    if (isTrusted(error)) throw error;
    return unavailable();
  }
}

function single(value: unknown): Selected {
  try {
    if (typeof value !== "object" || value === null || nodeTypes.isProxy(value)) unavailable();
    const result = Object.getOwnPropertyDescriptors(value);
    const rows = result.rows;
    const count = result.rowCount;
    if (!rows || !("value" in rows) || !rows.enumerable || !count || !("value" in count)
      || !count.enumerable || count.value !== 1 || !Array.isArray(rows.value)
      || nodeTypes.isProxy(rows.value) || Object.getPrototypeOf(rows.value) !== Array.prototype) unavailable();
    const selectedRows = rows.value as unknown[];
    const rowDescriptors = Object.getOwnPropertyDescriptors(selectedRows) as unknown as Record<PropertyKey, PropertyDescriptor>;
    if (selectedRows.length !== 1 || Reflect.ownKeys(rowDescriptors).length !== 2) unavailable();
    const first = rowDescriptors["0"];
    if (!first || !("value" in first) || !first.enumerable) unavailable();
    const row = exact(first.value, ["outcome", "result_payload"]);
    if (typeof row.outcome !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(row.outcome)) unavailable();
    return Object.freeze({ outcome: row.outcome, payload: row.result_payload });
  } catch (error) {
    if (isTrusted(error)) throw error;
    return unavailable();
  }
}

function hostname(value: unknown): string {
  if (typeof value !== "string" || value.length > 253 || value !== value.trim()
    || value !== value.toLowerCase() || !HOSTNAME.test(value)) invalid();
  return value;
}
function bounded(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum
    || value !== value.trim() || CONTROL.test(value)) unavailable();
  return value;
}
function optionalBounded(value: unknown, maximum: number): string | undefined {
  return value === null ? undefined : bounded(value, 1, maximum);
}
function envelope(value: unknown): SealedEnvelope {
  const parsed = exact(value, ["algorithm", "ciphertext", "iv", "keyId", "tag", "version"]);
  if (parsed.algorithm !== "A256GCM" || parsed.version !== 1) unavailable();
  const canonical = (selected: unknown, exactBytes?: number): string => {
    if (typeof selected !== "string" || !/^[A-Za-z0-9_-]+$/.test(selected)) unavailable();
    const bytes = Buffer.from(selected, "base64url");
    try {
      if (bytes.length < 1 || bytes.length > 16_384 || bytes.toString("base64url") !== selected
        || (exactBytes !== undefined && bytes.length !== exactBytes)) unavailable();
      return selected;
    } finally { bytes.fill(0); }
  };
  return Object.freeze({
    algorithm: "A256GCM", ciphertext: canonical(parsed.ciphertext), iv: canonical(parsed.iv, 12),
    keyId: bounded(parsed.keyId, 1, 128), tag: canonical(parsed.tag, 16), version: 1,
  });
}
function dense(value: unknown, minimum: number, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype
    || value.length < minimum || value.length > maximum) unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) unavailable();
  const copied: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) unavailable();
    copied.push(descriptor.value);
  }
  return copied;
}

function parseAuthority(value: unknown): QuickOrderHostedPaymentAuthority {
  const parsed = exact(value, [
    "authorityDigest", "storeId", "linkId", "redemptionSessionId", "paymentMethodId", "profileId",
    "providerCode", "environment", "executionAdapterVersion", "executionEvidenceDigest", "credentialVersion",
    "orderReference", "amountMinor", "currency", "identityAuthority", "identityKeyId", "sealedIdentity",
    "customerName", "customerEmail", "customerPhone", "customerAddress", "city", "country", "postalCode", "basket",
  ]);
  const providerCode = paymentAttemptProviderCode(parsed.providerCode);
  if (providerCode !== "iyzico_iframe") unavailable();
  const identityKeyId = bounded(parsed.identityKeyId, 1, 128);
  const sealedIdentity = envelope(parsed.sealedIdentity);
  if (sealedIdentity.keyId !== identityKeyId) unavailable();
  const basket = Object.freeze(dense(parsed.basket, 1, 100).map((entry) => {
    const item = exact(entry, ["reference", "name", "quantity", "unitAmountMinor", "itemType"]);
    if (item.itemType !== "PHYSICAL" && item.itemType !== "VIRTUAL") unavailable();
    return Object.freeze({
      reference: bounded(item.reference, 1, 128), name: bounded(item.name, 1, 512),
      quantity: paymentAttemptInteger(item.quantity), unitAmountMinor: paymentAttemptInteger(item.unitAmountMinor),
      itemType: item.itemType,
    });
  }));
  const postalCode = optionalBounded(parsed.postalCode, 128);
  return Object.freeze({
    authorityDigest: paymentAttemptDigest(parsed.authorityDigest), storeId: paymentAttemptUuid(parsed.storeId),
    linkId: paymentAttemptUuid(parsed.linkId), redemptionSessionId: paymentAttemptUuid(parsed.redemptionSessionId),
    paymentMethodId: paymentAttemptUuid(parsed.paymentMethodId), profileId: paymentAttemptUuid(parsed.profileId),
    providerCode: "iyzico_iframe", environment: paymentAttemptEnvironment(parsed.environment),
    executionAdapterVersion: paymentAttemptInteger(parsed.executionAdapterVersion),
    executionEvidenceDigest: paymentAttemptExecutionEvidenceDigest(parsed.executionEvidenceDigest),
    credentialVersion: paymentAttemptInteger(parsed.credentialVersion),
    orderReference: paymentAttemptOrderReference(parsed.orderReference), amountMinor: paymentAttemptInteger(parsed.amountMinor),
    currency: paymentAttemptCurrency(parsed.currency), identityAuthority: paymentAttemptDigest(parsed.identityAuthority),
    identityKeyId, sealedIdentity, customerName: bounded(parsed.customerName, 1, 1_024),
    customerEmail: bounded(parsed.customerEmail, 1, 1_024), customerPhone: bounded(parsed.customerPhone, 1, 1_024),
    customerAddress: bounded(parsed.customerAddress, 1, 1_024), city: bounded(parsed.city, 1, 1_024),
    country: bounded(parsed.country, 1, 128), ...(postalCode === undefined ? {} : { postalCode }), basket,
  });
}

function parseBegin(value: unknown, outcome: string, expected: Readonly<{
  attemptId: string; storeId: string; paymentMethodId: string; amountMinor: number; currency: string;
}>): BeginPaymentAttemptResult {
  const parsed = exact(value, [
    "attemptId", "storeId", "paymentMethodId", "profileId", "providerCode", "environment",
    "executionAdapterVersion", "executionEvidenceDigest", "credentialVersion", "amountMinor", "currency",
    "methodConfig", "publicConfig", "sealedCredentials",
  ]);
  const environment = paymentAttemptEnvironment(parsed.environment);
  const providerCode = paymentAttemptProviderCode(parsed.providerCode);
  const methodConfig = paymentAttemptMethodConfig(providerCode, parsed.methodConfig);
  const publicConfig = paymentAttemptPublicConfig(parsed.publicConfig);
  const result = Object.freeze({
    outcome: outcome === "operation_replayed" ? "replayed" as const : "created" as const,
    attemptId: paymentAttemptUuid(parsed.attemptId), storeId: paymentAttemptUuid(parsed.storeId),
    paymentMethodId: paymentAttemptUuid(parsed.paymentMethodId), profileId: paymentAttemptUuid(parsed.profileId),
    providerCode, environment,
    executionAdapterVersion: paymentAttemptInteger(parsed.executionAdapterVersion),
    executionEvidenceDigest: paymentAttemptExecutionEvidenceDigest(parsed.executionEvidenceDigest),
    credentialVersion: paymentAttemptInteger(parsed.credentialVersion), amountMinor: paymentAttemptInteger(parsed.amountMinor),
    currency: paymentAttemptCurrency(parsed.currency), methodConfig, publicConfig,
    sealedCredentials: paymentAttemptSealedCredentials(parsed.sealedCredentials),
  });
  if (result.attemptId !== expected.attemptId || result.storeId !== expected.storeId
    || result.paymentMethodId !== expected.paymentMethodId || result.amountMinor !== expected.amountMinor
    || result.currency !== expected.currency || publicConfig.environment !== environment
    || methodConfig.environment !== environment) unavailable();
  return result;
}

function timeout(value: unknown): string {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 60_000) unavailable();
  return `${String(value)}ms`;
}
function safeRelease(client: PostgresClientLike, destroy?: boolean): void {
  try { client.release(destroy); } catch { /* cleanup cannot alter authority */ }
}
async function rollback(client: PostgresClientLike): Promise<void> {
  try { await client.query("ROLLBACK"); safeRelease(client); } catch { safeRelease(client, true); }
}
async function acquire(options: Options): Promise<PostgresClientLike> {
  try { return await acquirePostgresClient(options.pool, options.timeouts.poolCheckoutMs); }
  catch { return unavailable(); }
}
async function configure(client: PostgresClientLike, options: Options): Promise<void> {
  await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(options.timeouts.statementMs)]);
  await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(options.timeouts.lockMs)]);
  await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(options.timeouts.idleTransactionMs)]);
  await client.query("SET LOCAL ROLE celebix_saas_workflow");
}
function mapOutcome(outcome: string): never {
  if (ERROR_CODES.has(outcome)) throw trusted(outcome as QuickOrderHostedPaymentErrorCode);
  return unavailable();
}
async function read(options: Options, text: string, values: unknown[]): Promise<Selected> {
  const client = await acquire(options);
  let began = false; let terminal = false;
  try {
    await client.query("BEGIN READ ONLY"); began = true; await configure(client, options);
    const result = single(await client.query(text, values));
    try { await client.query("COMMIT"); terminal = true; safeRelease(client); return result; }
    catch { terminal = true; safeRelease(client, true); return unavailable(); }
  } catch (error) {
    if (began && !terminal) await rollback(client); else if (!terminal) safeRelease(client, true);
    if (isTrusted(error)) throw error;
    return unavailable();
  }
}
function sameBegin(left: BeginPaymentAttemptResult, right: BeginPaymentAttemptResult): boolean {
  return JSON.stringify({ ...left, outcome: "replayed" }) === JSON.stringify(right);
}
function emitAudit(options: Options): void {
  try { void Promise.resolve(options.audit(Object.freeze({ type: "quick_order_hosted_payment_commit_unknown" }))).catch(() => undefined); }
  catch { /* audit is observational */ }
}

function validateOptions(value: PostgresQuickOrderHostedPaymentRepositoryOptions): Options {
  try {
    const parsed = exactPaymentAttemptInput(value, ["pool", "role", "timeouts", "audit"]);
    const timeouts = exactPaymentAttemptInput(parsed.timeouts, ["poolCheckoutMs", "statementMs", "lockMs", "idleTransactionMs"]);
    if (parsed.role !== "celebix_saas_workflow" || typeof parsed.audit !== "function"
      || typeof parsed.pool !== "object" || parsed.pool === null || nodeTypes.isProxy(parsed.pool)
      || typeof (parsed.pool as { connect?: unknown }).connect !== "function") unavailable();
    const selected = Object.freeze({
      poolCheckoutMs: timeouts.poolCheckoutMs as number, statementMs: timeouts.statementMs as number,
      lockMs: timeouts.lockMs as number, idleTransactionMs: timeouts.idleTransactionMs as number,
    });
    timeout(selected.poolCheckoutMs); timeout(selected.statementMs); timeout(selected.lockMs); timeout(selected.idleTransactionMs);
    return Object.freeze({ pool: parsed.pool as PostgresPoolLike, role: "celebix_saas_workflow", timeouts: selected,
      audit: parsed.audit as Options["audit"] });
  } catch { throw new QuickOrderHostedPaymentRepositoryError("unavailable"); }
}

export class PostgresQuickOrderHostedPaymentRepository implements QuickOrderHostedPaymentRepository {
  private readonly options: Options;
  constructor(options: PostgresQuickOrderHostedPaymentRepositoryOptions) { this.options = validateOptions(options); }

  async getAuthority(input: Readonly<{ hostname: string; redemptionDigest: string; now: Date }>): Promise<QuickOrderHostedPaymentAuthorityResult> {
    try {
      const parsed = exactPaymentAttemptInput(input, ["hostname", "redemptionDigest", "now"]);
      const selectedHostname = hostname(parsed.hostname);
      const redemptionDigest = paymentAttemptDigest(parsed.redemptionDigest);
      const now = paymentAttemptDate(parsed.now);
      const selected = await read(this.options,
        "SELECT outcome,result_payload FROM saas.quick_order_hosted_payment_authority($1::text,$2::text,$3::timestamptz)",
        [selectedHostname, redemptionDigest, now]);
      if (selected.outcome === "legacy" && selected.payload === null) return Object.freeze({ kind: "legacy" });
      if (selected.outcome === "found") return Object.freeze({ kind: "found", authority: parseAuthority(selected.payload) });
      if (selected.outcome === "not_found") throw trusted("quick_link_not_found");
      return mapOutcome(selected.outcome);
    } catch (error) {
      throw new QuickOrderHostedPaymentRepositoryError(isTrusted(error) ? error.code : "unavailable");
    }
  }

  async begin(input: QuickOrderHostedPaymentBeginInput): Promise<BeginPaymentAttemptResult> {
    try {
      const parsed = exactPaymentAttemptInput(input, ["hostname", "redemptionDigest", "expectedAuthorityDigest", "payment"]);
      const selectedHostname = hostname(parsed.hostname);
      const redemptionDigest = paymentAttemptDigest(parsed.redemptionDigest);
      const expectedAuthorityDigest = paymentAttemptDigest(parsed.expectedAuthorityDigest);
      const payment = exactPaymentAttemptInput(parsed.payment, [
        "authority", "operationId", "fingerprint", "paymentMethodId", "orderReference",
        "amountMinor", "currency", "callbackBindingDigest",
      ]);
      const authority = exactPaymentAttemptInput(payment.authority, ["storeId", "now"]);
      const expected = Object.freeze({
        storeId: paymentAttemptUuid(authority.storeId), now: paymentAttemptDate(authority.now),
        attemptId: paymentAttemptUuid(payment.operationId), fingerprint: paymentAttemptDigest(payment.fingerprint),
        paymentMethodId: paymentAttemptUuid(payment.paymentMethodId), orderReference: paymentAttemptOrderReference(payment.orderReference),
        amountMinor: paymentAttemptInteger(payment.amountMinor), currency: paymentAttemptCurrency(payment.currency),
        callbackBindingDigest: paymentAttemptDigest(payment.callbackBindingDigest),
      });
      const text = "SELECT outcome,result_payload FROM saas.quick_order_hosted_payment_begin($1::text,$2::text,$3::uuid,$4::text,$5::text,$6::text,$7::timestamptz)";
      const values = [selectedHostname, redemptionDigest, expected.attemptId, expected.fingerprint,
        expected.callbackBindingDigest, expectedAuthorityDigest, expected.now];
      const parse = (selected: Selected): BeginPaymentAttemptResult => {
        if (selected.outcome !== "created" && selected.outcome !== "operation_replayed") return mapOutcome(selected.outcome);
        return parseBegin(selected.payload, selected.outcome, expected);
      };
      const client = await acquire(this.options);
      let began = false; let terminal = false;
      try {
        await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true; await configure(client, this.options);
        const observed = parse(single(await client.query(text, values)));
        try { await client.query("COMMIT"); terminal = true; safeRelease(client); return observed; }
        catch {
          terminal = true; safeRelease(client, true); emitAudit(this.options);
          try {
            const recovered = parse(await read(this.options, text, values));
            if (recovered.outcome !== "replayed" || !sameBegin(observed, recovered)) commitUnknown();
            return recovered;
          } catch { return commitUnknown(); }
        }
      } catch (error) {
        if (began && !terminal) await rollback(client); else if (!terminal) safeRelease(client, true);
        if (isTrusted(error)) throw error;
        return unavailable();
      }
    } catch (error) {
      throw new QuickOrderHostedPaymentRepositoryError(isTrusted(error) ? error.code : "unavailable");
    }
  }
}
