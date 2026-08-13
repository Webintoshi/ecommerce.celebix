import { createHash } from "node:crypto";

import {
  parsePublicCart,
  parsePublicCheckoutQuote,
  parsePublicCheckoutReceipt,
  type PublicCart,
} from "@celebix/saas-contracts";

import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import type {
  PostgresStorefrontCommerceRepositoryOptions,
  StorefrontCommerceRepository,
} from "./types.ts";
import {
  commerceCandidates,
  commerceDate,
  commerceDelivery,
  commerceGeneratedCredential,
  commerceHostname,
  commerceLimit,
  commerceQuantity,
  commerceUuid,
  commerceVersion,
  exactCommerceInput,
  parseReceiptEnvelope,
  parseReceiptList,
} from "./validation.ts";

export const STOREFRONT_COMMERCE_ERROR_CODES = Object.freeze([
  "invalid_input", "not_found", "cart_expired", "version_conflict", "cart_empty",
  "price_changed", "stock_unavailable", "shipping_unavailable", "payment_unavailable",
  "operation_mismatch", "unavailable", "commit_unknown",
] as const);
export type StorefrontCommerceErrorCode = (typeof STOREFRONT_COMMERCE_ERROR_CODES)[number];
const ERROR_CODES = new Set<string>(STOREFRONT_COMMERCE_ERROR_CODES);

export class StorefrontCommerceRepositoryError extends Error {
  readonly code: StorefrontCommerceErrorCode;
  constructor(code: StorefrontCommerceErrorCode = "unavailable") {
    super(code);
    this.name = "StorefrontCommerceRepositoryError";
    this.code = code;
    Object.freeze(this);
  }
}

type Envelope = Readonly<{ outcome: string; result: unknown }>;
function failure(code: StorefrontCommerceErrorCode = "unavailable"): StorefrontCommerceRepositoryError { return new StorefrontCommerceRepositoryError(code); }
function timeout(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) throw failure();
  return `${value}ms`;
}
function release(client: PostgresClientLike, destroy = false): void { try { client.release(destroy || undefined); } catch {} }
function envelope(result: Readonly<{ rows: unknown[]; rowCount?: number | null }>): Envelope {
  if (result.rowCount !== 1 || result.rows.length !== 1) throw failure();
  const row = exactCommerceInput(result.rows[0], ["outcome", "result_payload"]);
  if (typeof row.outcome !== "string") throw failure();
  return Object.freeze({ outcome: row.outcome, result: row.result_payload });
}
function mapped(outcome: string): StorefrontCommerceRepositoryError | undefined {
  return ERROR_CODES.has(outcome) ? failure(outcome as StorefrontCommerceErrorCode) : undefined;
}
function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
function exactResult(value: unknown, required: readonly string[]): Readonly<Record<string, unknown>> {
  try { return exactCommerceInput(value, required); } catch { throw failure(); }
}

export class PostgresStorefrontCommerceRepository implements StorefrontCommerceRepository {
  private readonly options: PostgresStorefrontCommerceRepositoryOptions;

  constructor(options: PostgresStorefrontCommerceRepositoryOptions) {
    const parsed = exactCommerceInput(options, ["pool", "role", "timeouts", "audit"]);
    if (parsed.role !== "celebix_saas_host_resolver" || !parsed.pool || typeof (parsed.pool as { connect?: unknown }).connect !== "function" || typeof parsed.audit !== "function") throw failure();
    const timeouts = exactCommerceInput(parsed.timeouts, ["poolCheckoutMs", "statementMs", "lockMs", "idleTransactionMs"]);
    for (const selected of Object.values(timeouts)) timeout(selected as number);
    this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
  }

  private async acquire(): Promise<PostgresClientLike> {
    try { return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); } catch { throw failure(); }
  }
  private async configure(client: PostgresClientLike): Promise<void> {
    await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
    await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
    await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
    await client.query("SET LOCAL ROLE celebix_saas_host_resolver");
  }
  private async rollback(client: PostgresClientLike): Promise<void> {
    try { await client.query("ROLLBACK"); release(client); } catch { release(client, true); }
  }
  private async read<T>(text: string, values: unknown[], expected: string, parser: (value: unknown) => T): Promise<T> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN READ ONLY"); began = true;
      await this.configure(client);
      const selected = envelope(await client.query(text, values));
      const error = mapped(selected.outcome);
      if (error) throw error;
      if (selected.outcome !== expected) throw failure();
      let value: T;
      try { value = parser(selected.result); } catch { throw failure(); }
      try { await client.query("COMMIT"); terminal = true; release(client); } catch { terminal = true; release(client, true); throw failure(); }
      return value;
    } catch (error) {
      if (began && !terminal) await this.rollback(client); else if (!terminal) release(client, true);
      if (error instanceof StorefrontCommerceRepositoryError) throw error;
      throw failure();
    }
  }
  private async write<T>(text: string, values: unknown[], outcomes: readonly string[], parser: (value: unknown) => T): Promise<T> {
    const client = await this.acquire();
    let began = false;
    let terminal = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      await this.configure(client);
      const selected = envelope(await client.query(text, values));
      const error = mapped(selected.outcome);
      if (error) throw error;
      if (!outcomes.includes(selected.outcome)) throw failure();
      let value: T;
      try { value = parser(selected.result); } catch { throw failure(); }
      try { await client.query("COMMIT"); terminal = true; release(client); return value; }
      catch { terminal = true; release(client, true); throw failure("commit_unknown"); }
    } catch (error) {
      if (began && !terminal) await this.rollback(client); else if (!terminal) release(client, true);
      if (error instanceof StorefrontCommerceRepositoryError) throw error;
      throw failure();
    }
  }
  private emitUnknown(): void {
    try { const pending = this.options.audit(Object.freeze({ type: "storefront_checkout_commit_unknown" })); if (pending) void pending.catch(() => undefined); } catch {}
  }

  async resolveCart(input: Parameters<StorefrontCommerceRepository["resolveCart"]>[0]): Promise<PublicCart> {
    try {
      const parsed = exactCommerceInput(input, ["hostname", "now", "candidates"]);
      return await this.read(
        "SELECT outcome,result_payload FROM saas.public_cart_resolve($1::text,$2::timestamptz,$3::jsonb)",
        [commerceHostname(parsed.hostname), commerceDate(parsed.now), JSON.stringify(commerceCandidates(parsed.candidates))],
        "found", parsePublicCart,
      );
    } catch (error) { if (error instanceof StorefrontCommerceRepositoryError) throw error; throw failure("invalid_input"); }
  }

  async mutateCart(input: Parameters<StorefrontCommerceRepository["mutateCart"]>[0]) {
    try {
      const parsed = exactCommerceInput(input, ["hostname", "now", "candidates", "customerCandidates", "operationId", "action", "expectedVersion", "productId", "variantId"], ["cart", "quantity"]);
      const now = commerceDate(parsed.now);
      const candidates = commerceCandidates(parsed.candidates, true);
      const customerCandidates = commerceCandidates(parsed.customerCandidates, true);
      const cart = Object.hasOwn(parsed, "cart") ? commerceGeneratedCredential(parsed.cart, now, 31) : undefined;
      if ((candidates.length === 0) !== Boolean(cart) || (candidates.length === 0 && (parsed.action !== "add" || parsed.expectedVersion !== 0))) throw failure("invalid_input");
      if (parsed.action !== "add" && parsed.action !== "quantity" && parsed.action !== "remove") throw failure("invalid_input");
      const quantity = parsed.action === "remove" ? undefined : commerceQuantity(parsed.quantity);
      if (parsed.action === "remove" && Object.hasOwn(parsed, "quantity")) throw failure("invalid_input");
      const operationId = commerceUuid(parsed.operationId);
      const expectedVersion = commerceVersion(parsed.expectedVersion);
      const productId = commerceUuid(parsed.productId);
      const variantId = commerceUuid(parsed.variantId);
      const operationFingerprint = fingerprint(["storefront-cart/v2", customerCandidates, operationId, parsed.action, expectedVersion, productId, variantId, quantity ?? null]);
      return await this.write(
        "SELECT outcome,result_payload FROM saas.public_cart_mutate($1::text,$2::timestamptz,$3::jsonb,$4::uuid,$5::text,$6::text,$7::timestamptz,$8::uuid,$9::text,$10::text,$11::bigint,$12::uuid,$13::uuid,$14::integer,$15::jsonb)",
        [commerceHostname(parsed.hostname), now, JSON.stringify(candidates), cart?.id ?? commerceUuid("00000000-0000-4000-8000-000000000000"), cart?.keyId ?? null, cart?.digest ?? null, cart?.expiresAt ?? null, operationId, operationFingerprint, parsed.action, expectedVersion, productId, variantId, quantity ?? null, JSON.stringify(customerCandidates)],
        ["committed", "operation_replayed"],
        (value) => {
          const selected = exactResult(value, ["credentialCreated", "cart"]);
          if (typeof selected.credentialCreated !== "boolean" || selected.credentialCreated !== (candidates.length === 0)) throw failure();
          return Object.freeze({ credentialCreated: selected.credentialCreated, cart: parsePublicCart(selected.cart) });
        },
      );
    } catch (error) { if (error instanceof StorefrontCommerceRepositoryError) throw error; throw failure("invalid_input"); }
  }

  async createBuyNow(input: Parameters<StorefrontCommerceRepository["createBuyNow"]>[0]): Promise<void> {
    try {
      const parsed = exactCommerceInput(input, ["hostname", "now", "intent", "productId", "variantId", "quantity"]);
      const now = commerceDate(parsed.now);
      const intent = commerceGeneratedCredential(parsed.intent, now, 15 / (24 * 60));
      await this.write(
        "SELECT outcome,result_payload FROM saas.public_buy_now_create($1::text,$2::timestamptz,$3::uuid,$4::text,$5::text,$6::timestamptz,$7::uuid,$8::uuid,$9::integer)",
        [commerceHostname(parsed.hostname), now, intent.id, intent.keyId, intent.digest, intent.expiresAt, commerceUuid(parsed.productId), commerceUuid(parsed.variantId), commerceQuantity(parsed.quantity)],
        ["committed"],
        (value) => { const selected = exactResult(value, ["intentKind"]); if (selected.intentKind !== "buy_now") throw failure(); },
      );
    } catch (error) { if (error instanceof StorefrontCommerceRepositoryError) throw error; throw failure("invalid_input"); }
  }

  async quote(input: Parameters<StorefrontCommerceRepository["quote"]>[0]) {
    try {
      const parsed = exactCommerceInput(input, ["hostname", "now", "intentKind", "candidates"]);
      if (parsed.intentKind !== "cart" && parsed.intentKind !== "buy_now") throw failure("invalid_input");
      return await this.write(
        "SELECT outcome,result_payload FROM saas.public_checkout_quote($1::text,$2::timestamptz,$3::text,$4::jsonb)",
        [commerceHostname(parsed.hostname), commerceDate(parsed.now), parsed.intentKind, JSON.stringify(commerceCandidates(parsed.candidates))],
        ["quoted"], parsePublicCheckoutQuote,
      );
    } catch (error) { if (error instanceof StorefrontCommerceRepositoryError) throw error; throw failure("invalid_input"); }
  }

  private async recover(hostname: string, now: Date, operationId: string, operationFingerprint: string, observed: ReturnType<typeof parseReceiptEnvelope>): Promise<ReturnType<typeof parseReceiptEnvelope>> {
    try {
      const recovered = await this.read(
        "SELECT outcome,result_payload FROM saas.public_checkout_recover($1::text,$2::timestamptz,$3::uuid,$4::text)",
        [hostname, now, operationId, operationFingerprint], "operation_replayed",
        (value) => parseReceiptEnvelope(value, parsePublicCheckoutReceipt),
      );
      if (JSON.stringify(recovered) !== JSON.stringify(observed)) throw failure("commit_unknown");
      return recovered;
    } catch { throw failure("commit_unknown"); }
  }

  async complete(input: Parameters<StorefrontCommerceRepository["complete"]>[0]) {
    let validated: Readonly<{ hostname: string; now: Date; intentKind: "cart" | "buy_now"; candidates: ReturnType<typeof commerceCandidates>; customerCandidates: ReturnType<typeof commerceCandidates>; operationId: string; cartVersion: number; delivery: ReturnType<typeof commerceDelivery>; paymentKind: "bank_transfer" | "cash_on_delivery"; orderId: string; customerId: string; addressId: string; eventId: string; receipt: ReturnType<typeof commerceGeneratedCredential>; customer: ReturnType<typeof commerceGeneratedCredential>; operationFingerprint: string }>;
    try {
      const parsed = exactCommerceInput(input, ["hostname", "now", "intentKind", "candidates", "customerCandidates", "operationId", "cartVersion", "delivery", "paymentKind", "generated"]);
      if (parsed.intentKind !== "cart" && parsed.intentKind !== "buy_now") throw failure("invalid_input");
      if (parsed.paymentKind !== "bank_transfer" && parsed.paymentKind !== "cash_on_delivery") throw failure("invalid_input");
      const now = commerceDate(parsed.now);
      const generated = exactCommerceInput(parsed.generated, ["orderId", "customerId", "addressId", "eventId", "receipt", "customer"]);
      const delivery = commerceDelivery(parsed.delivery);
      const candidates = commerceCandidates(parsed.candidates);
      const customerCandidates = commerceCandidates(parsed.customerCandidates, true);
      const operationId = commerceUuid(parsed.operationId);
      const cartVersion = commerceVersion(parsed.cartVersion);
      const receipt = commerceGeneratedCredential(generated.receipt, now, 1);
      const customer = commerceGeneratedCredential(generated.customer, now, 31);
      const operationFingerprint = fingerprint(["storefront-checkout/v3", parsed.intentKind, candidates, customerCandidates, operationId, cartVersion, delivery, parsed.paymentKind]);
      validated = Object.freeze({ hostname: commerceHostname(parsed.hostname), now, intentKind: parsed.intentKind, candidates, customerCandidates, operationId, cartVersion, delivery, paymentKind: parsed.paymentKind, orderId: commerceUuid(generated.orderId), customerId: commerceUuid(generated.customerId), addressId: commerceUuid(generated.addressId), eventId: commerceUuid(generated.eventId), receipt, customer, operationFingerprint });
    } catch (error) { if (error instanceof StorefrontCommerceRepositoryError) throw error; throw failure("invalid_input"); }

    const client = await this.acquire();
    let began = false;
    let terminal = false;
    let observed: ReturnType<typeof parseReceiptEnvelope> | undefined;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      await this.configure(client);
      const selected = envelope(await client.query(
        "SELECT outcome,result_payload FROM saas.public_checkout_complete($1::text,$2::timestamptz,$3::text,$4::jsonb,$5::jsonb,$6::uuid,$7::text,$8::bigint,$9::jsonb,$10::text,$11::uuid,$12::uuid,$13::uuid,$14::uuid,$15::uuid,$16::text,$17::text,$18::timestamptz,$19::uuid,$20::text,$21::text,$22::timestamptz)",
        [validated.hostname, validated.now, validated.intentKind, JSON.stringify(validated.candidates), JSON.stringify(validated.customerCandidates), validated.operationId, validated.operationFingerprint, validated.cartVersion, JSON.stringify(validated.delivery), validated.paymentKind, validated.orderId, validated.customerId, validated.addressId, validated.eventId, validated.receipt.id, validated.receipt.keyId, validated.receipt.digest, validated.receipt.expiresAt, validated.customer.id, validated.customer.keyId, validated.customer.digest, validated.customer.expiresAt],
      ));
      const error = mapped(selected.outcome);
      if (error) throw error;
      if (selected.outcome !== "committed" && selected.outcome !== "operation_replayed") throw failure();
      try { observed = parseReceiptEnvelope(selected.result, parsePublicCheckoutReceipt); } catch { throw failure(); }
      try { await client.query("COMMIT"); terminal = true; release(client); return observed; }
      catch {
        terminal = true; release(client, true); this.emitUnknown();
        return await this.recover(validated.hostname, validated.now, validated.operationId, validated.operationFingerprint, observed);
      }
    } catch (error) {
      if (began && !terminal) await this.rollback(client); else if (!terminal) release(client, true);
      if (error instanceof StorefrontCommerceRepositoryError) throw error;
      throw failure();
    }
  }

  async getReceipt(input: Parameters<StorefrontCommerceRepository["getReceipt"]>[0]) {
    try {
      const parsed = exactCommerceInput(input, ["hostname", "now", "receiptCandidates", "customerCandidates"]);
      return await this.read(
        "SELECT outcome,result_payload FROM saas.public_receipt_get($1::text,$2::timestamptz,$3::jsonb,$4::jsonb)",
        [commerceHostname(parsed.hostname), commerceDate(parsed.now), JSON.stringify(commerceCandidates(parsed.receiptCandidates)), JSON.stringify(commerceCandidates(parsed.customerCandidates))], "found", parsePublicCheckoutReceipt,
      );
    } catch (error) { if (error instanceof StorefrontCommerceRepositoryError) throw error; throw failure("invalid_input"); }
  }

  async listAccountOrders(input: Parameters<StorefrontCommerceRepository["listAccountOrders"]>[0]) {
    try {
      const parsed = exactCommerceInput(input, ["hostname", "now", "candidates", "limit"]);
      return await this.write(
        "SELECT outcome,result_payload FROM saas.public_account_orders($1::text,$2::timestamptz,$3::jsonb,$4::integer)",
        [commerceHostname(parsed.hostname), commerceDate(parsed.now), JSON.stringify(commerceCandidates(parsed.candidates)), commerceLimit(parsed.limit)], ["found"],
        (value) => parseReceiptList(value, parsePublicCheckoutReceipt),
      );
    } catch (error) { if (error instanceof StorefrontCommerceRepositoryError) throw error; throw failure("invalid_input"); }
  }
}
