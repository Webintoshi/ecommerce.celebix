import {
  ORDER_EMAIL_EVENT_TYPES,
  type OrderEmailEventType,
  type OrderEmailRecipientKind,
} from "@celebix/saas-contracts";

import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import {
  OrderEmailRepositoryError,
  type AcceptOrderEmailInput,
  type ClaimOrderEmailInput,
  type FailOrderEmailInput,
  type OrderEmailClaim,
  type OrderEmailClaimBatch,
  type OrderEmailProjection,
  type OrderEmailProjectionAddress,
  type OrderEmailProjectionItem,
  type OrderEmailProjectionTracking,
  type OrderEmailWorkflowRepository,
  type PostgresOrderEmailWorkflowRepositoryOptions,
  type RecordOrderEmailProviderEventInput,
  type SealOrderEmailInput,
} from "./types.ts";

type Result = Readonly<{ outcome: string; payload: unknown }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const WORKER = /^[A-Za-z0-9._-]{1,128}$/;
const CODE = /^[a-z][a-z0-9_]{0,63}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const KEY_ID = /^[a-z][a-z0-9_-]{2,31}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const EMAIL = /^[^@\s]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?[.][A-Za-z]{2,63}$/;
const MASK = /^[^@\s•]{1,8}•{2,8}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?[.][A-Za-z]{2,63}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

function failure(code: "invalid_input" | "lease_lost" | "provider_reference_conflict" | "unavailable") {
  return new OrderEmailRepositoryError(code);
}
function invalid(): never { throw failure("invalid_input"); }
function unavailable(): never { throw failure("unavailable"); }

function exact(value: unknown, keys: readonly string[], mode: "input" | "output" = "input"): Record<string, unknown> {
  const fail = mode === "input" ? invalid : unavailable;
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail();
  const parsed = value as Record<string, unknown>;
  if (Object.keys(parsed).sort().join(",") !== [...keys].sort().join(",")) fail();
  return parsed;
}

function freeze<T>(value: T): Readonly<T> {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}

function text(value: unknown, minimum: number, maximum: number, pattern?: RegExp, mode: "input" | "output" = "input"): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || CONTROL.test(value) || (pattern && !pattern.test(value))) {
    if (mode === "input") invalid(); else unavailable();
  }
  return value as string;
}
function uuid(value: unknown, mode: "input" | "output" = "input"): string { return text(value, 36, 36, UUID, mode); }
function date(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return new Date(value.getTime());
}
function timestamp(value: unknown): string {
  if (typeof value !== "string") unavailable();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) unavailable();
  return value;
}
function integer(value: unknown, minimum: number, maximum: number, mode: "input" | "output" = "input"): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    if (mode === "input") invalid(); else unavailable();
  }
  return value as number;
}
function nullableText(value: unknown, parser: (entry: unknown) => string): string | undefined {
  return value === null ? undefined : parser(value);
}
function origin(value: unknown): string {
  const selected = text(value, 9, 2_048, undefined, "output");
  try { if (new URL(selected).origin !== selected || !selected.startsWith("https://")) unavailable(); }
  catch { unavailable(); }
  return selected;
}

function projectionAddress(value: unknown): Readonly<OrderEmailProjectionAddress> {
  const parsed = exact(value, ["recipientName", "line1", "line2", "district", "city", "postalCode", "country"].filter((key) => Object.hasOwn(value as object, key)), "output");
  if (!Object.hasOwn(parsed, "recipientName") || !Object.hasOwn(parsed, "line1") || !Object.hasOwn(parsed, "city") || !Object.hasOwn(parsed, "country")) unavailable();
  return freeze({
    recipientName: text(parsed.recipientName, 1, 200, undefined, "output"),
    line1: text(parsed.line1, 1, 300, undefined, "output"),
    ...(parsed.line2 === undefined || parsed.line2 === null ? {} : { line2: text(parsed.line2, 1, 300, undefined, "output") }),
    ...(parsed.district === undefined || parsed.district === null ? {} : { district: text(parsed.district, 1, 200, undefined, "output") }),
    city: text(parsed.city, 1, 200, undefined, "output"),
    ...(parsed.postalCode === undefined || parsed.postalCode === null ? {} : { postalCode: text(parsed.postalCode, 1, 32, undefined, "output") }),
    country: text(parsed.country, 2, 2, /^[A-Z]{2}$/, "output"),
  });
}

function projectionTracking(value: unknown): Readonly<OrderEmailProjectionTracking> | undefined {
  if (value === null) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) unavailable();
  const keys = Object.keys(value as object);
  const parsed = exact(value, keys, "output");
  if (!Object.hasOwn(parsed, "carrier") || !Object.hasOwn(parsed, "trackingNumber") || keys.some((key) => !["carrier", "trackingNumber", "trackingUrl", "shippedAt"].includes(key))) unavailable();
  return freeze({
    carrier: text(parsed.carrier, 1, 100, undefined, "output"),
    trackingNumber: text(parsed.trackingNumber, 1, 200, undefined, "output"),
    ...(parsed.trackingUrl === undefined || parsed.trackingUrl === null ? {} : { trackingUrl: text(parsed.trackingUrl, 1, 2_048, /^https:\/\//, "output") }),
    ...(parsed.shippedAt === undefined || parsed.shippedAt === null ? {} : { shippedAt: timestamp(parsed.shippedAt) }),
  });
}

function projectionItem(value: unknown): Readonly<OrderEmailProjectionItem> {
  const parsed = exact(value, ["productName", "variantName", "sku", "unitPriceCents", "quantity", "discountCents", "lineTotalCents"], "output");
  const unitPriceCents = integer(parsed.unitPriceCents, 0, Number.MAX_SAFE_INTEGER, "output");
  const quantity = integer(parsed.quantity, 1, 9_999, "output");
  const discountCents = integer(parsed.discountCents, 0, Number.MAX_SAFE_INTEGER, "output");
  const lineTotalCents = integer(parsed.lineTotalCents, 0, Number.MAX_SAFE_INTEGER, "output");
  if (lineTotalCents !== unitPriceCents * quantity - discountCents) unavailable();
  return freeze({
    productName: text(parsed.productName, 1, 200, undefined, "output"),
    ...(parsed.variantName === null ? {} : { variantName: text(parsed.variantName, 1, 200, undefined, "output") }),
    ...(parsed.sku === null ? {} : { sku: text(parsed.sku, 1, 128, undefined, "output") }),
    unitPriceCents, quantity, discountCents, lineTotalCents,
  });
}

function projection(value: unknown): Readonly<OrderEmailProjection> {
  const parsed = exact(value, [
    "recipient", "senderLabel", "replyTo", "storeName", "primaryColor", "logoUrl", "storefrontOrigin",
    "adminOrigin", "orderNumber", "customerName", "currency", "subtotalCents", "shippingCents",
    "discountCents", "totalCents", "shippingAddress", "tracking", "items",
  ], "output");
  if (!Array.isArray(parsed.items) || parsed.items.length < 1 || parsed.items.length > 100) unavailable();
  const subtotalCents = integer(parsed.subtotalCents, 0, Number.MAX_SAFE_INTEGER, "output");
  const shippingCents = integer(parsed.shippingCents, 0, Number.MAX_SAFE_INTEGER, "output");
  const discountCents = integer(parsed.discountCents, 0, Number.MAX_SAFE_INTEGER, "output");
  const totalCents = integer(parsed.totalCents, 0, Number.MAX_SAFE_INTEGER, "output");
  if (totalCents !== subtotalCents + shippingCents - discountCents) unavailable();
  return freeze({
    recipient: text(parsed.recipient, 3, 320, EMAIL, "output"),
    senderLabel: text(parsed.senderLabel, 1, 160, undefined, "output"),
    ...(nullableText(parsed.replyTo, (entry) => text(entry, 3, 320, EMAIL, "output")) === undefined ? {} : { replyTo: text(parsed.replyTo, 3, 320, EMAIL, "output") }),
    storeName: text(parsed.storeName, 1, 160, undefined, "output"),
    primaryColor: text(parsed.primaryColor, 7, 7, COLOR, "output"),
    ...(nullableText(parsed.logoUrl, (entry) => text(entry, 9, 2_048, /^https:\/\//, "output")) === undefined ? {} : { logoUrl: text(parsed.logoUrl, 9, 2_048, /^https:\/\//, "output") }),
    storefrontOrigin: origin(parsed.storefrontOrigin),
    ...(parsed.adminOrigin === null ? {} : { adminOrigin: origin(parsed.adminOrigin) }),
    orderNumber: text(parsed.orderNumber, 1, 64, undefined, "output"),
    customerName: text(parsed.customerName, 1, 200, undefined, "output"),
    currency: text(parsed.currency, 3, 3, /^[A-Z]{3}$/, "output"),
    subtotalCents, shippingCents, discountCents, totalCents,
    shippingAddress: projectionAddress(parsed.shippingAddress),
    ...(projectionTracking(parsed.tracking) === undefined ? {} : { tracking: projectionTracking(parsed.tracking)! }),
    items: freeze(parsed.items.map(projectionItem)),
  });
}

function eventType(value: unknown): OrderEmailEventType {
  if (typeof value !== "string" || !ORDER_EMAIL_EVENT_TYPES.includes(value as OrderEmailEventType)) unavailable();
  return value as OrderEmailEventType;
}
function recipientKind(value: unknown): OrderEmailRecipientKind {
  if (value !== "customer" && value !== "merchant") unavailable();
  return value;
}
function claim(value: unknown): Readonly<OrderEmailClaim> {
  const parsed = exact(value, [
    "deliveryId", "storeId", "orderId", "eventType", "recipientKind", "attemptCount", "idempotencyKey",
    "firstAttemptAt", "idempotencyExpiresAt", "sealKeyId", "sealedRequest", "requestDigest", "projection",
  ], "output");
  const deliveryId = uuid(parsed.deliveryId, "output"), selectedEvent = eventType(parsed.eventType);
  const selectedRecipient = recipientKind(parsed.recipientKind);
  if ((selectedEvent === "merchant_new_order") !== (selectedRecipient === "merchant")) unavailable();
  const base = {
    deliveryId, storeId: uuid(parsed.storeId, "output"), orderId: uuid(parsed.orderId, "output"),
    eventType: selectedEvent, recipientKind: selectedRecipient,
    attemptCount: integer(parsed.attemptCount, 1, 8, "output"),
    idempotencyKey: text(parsed.idempotencyKey, 1, 256, undefined, "output"),
  };
  if (base.idempotencyKey !== `order-email/v1/${deliveryId}`) unavailable();
  const unsealed = parsed.firstAttemptAt === null && parsed.idempotencyExpiresAt === null
    && parsed.sealKeyId === null && parsed.sealedRequest === null && parsed.requestDigest === null;
  if (unsealed) {
    if (parsed.projection === null) unavailable();
    return freeze({ ...base, kind: "unsealed" as const, projection: projection(parsed.projection) });
  }
  if (parsed.projection !== null || [parsed.firstAttemptAt, parsed.idempotencyExpiresAt, parsed.sealKeyId, parsed.sealedRequest, parsed.requestDigest].some((entry) => entry === null)) unavailable();
  const firstAttemptAt = timestamp(parsed.firstAttemptAt), idempotencyExpiresAt = timestamp(parsed.idempotencyExpiresAt);
  if (new Date(idempotencyExpiresAt).getTime() !== new Date(firstAttemptAt).getTime() + 86_400_000) unavailable();
  const sealedRequest = text(parsed.sealedRequest, 44, 349_528, /^[A-Za-z0-9+/]+={0,2}$/, "output");
  const decoded = Buffer.from(sealedRequest, "base64");
  if (decoded.length < 32 || decoded.length > 262_144 || decoded.toString("base64") !== sealedRequest) unavailable();
  return freeze({
    ...base, kind: "sealed" as const, firstAttemptAt, idempotencyExpiresAt,
    sealKeyId: text(parsed.sealKeyId, 3, 32, KEY_ID, "output"), sealedRequest,
    requestDigest: text(parsed.requestDigest, 64, 64, DIGEST, "output"),
  });
}

function result(value: Readonly<{ rows: unknown[]; rowCount?: number | null }>): Result {
  if (value.rowCount !== 1 || value.rows.length !== 1) unavailable();
  const parsed = exact(value.rows[0], ["outcome", "result_payload"], "output");
  if (typeof parsed.outcome !== "string") unavailable();
  return Object.freeze({ outcome: parsed.outcome, payload: parsed.result_payload });
}
function deliveryMutation(value: unknown, deliveryId: string): void {
  const parsed = exact(value, ["deliveryId"], "output");
  if (uuid(parsed.deliveryId, "output") !== deliveryId) unavailable();
}
function timeout(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) unavailable();
  return `${value}ms`;
}
function release(client: PostgresClientLike, destroy = false) { try { client.release(destroy || undefined); } catch {} }

export class PostgresOrderEmailWorkflowRepository implements OrderEmailWorkflowRepository {
  private readonly options: PostgresOrderEmailWorkflowRepositoryOptions;
  constructor(options: PostgresOrderEmailWorkflowRepositoryOptions) {
    try {
      const parsed = exact(options, ["pool", "role", "timeouts", "uuid"]);
      if (parsed.role !== "celebix_saas_workflow" || typeof parsed.uuid !== "function" || !parsed.pool || typeof (parsed.pool as { connect?: unknown }).connect !== "function") unavailable();
      const selectedTimeouts = exact(parsed.timeouts, ["poolCheckoutMs", "statementMs", "lockMs", "idleTransactionMs"]);
      for (const value of Object.values(selectedTimeouts)) timeout(value as number);
      this.options = Object.freeze({ ...options, timeouts: Object.freeze({ ...options.timeouts }) });
    } catch (error) {
      if (error instanceof OrderEmailRepositoryError) throw error;
      unavailable();
    }
  }
  private async acquire() {
    try { return await acquirePostgresClient(this.options.pool, this.options.timeouts.poolCheckoutMs); }
    catch { unavailable(); }
  }
  private async transaction<T>(sql: string, values: unknown[], outcomes: readonly string[], parser: (selected: Result) => T): Promise<T> {
    const client = await this.acquire();
    let began = false, terminal = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED"); began = true;
      await client.query("SELECT pg_catalog.set_config('statement_timeout', $1, true)", [timeout(this.options.timeouts.statementMs)]);
      await client.query("SELECT pg_catalog.set_config('lock_timeout', $1, true)", [timeout(this.options.timeouts.lockMs)]);
      await client.query("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', $1, true)", [timeout(this.options.timeouts.idleTransactionMs)]);
      await client.query("SET LOCAL ROLE celebix_saas_workflow");
      const selected = result(await client.query(sql, values));
      if (selected.outcome === "invalid_input") invalid();
      if (selected.outcome === "lease_lost") throw failure("lease_lost");
      if (selected.outcome === "provider_reference_conflict") throw failure("provider_reference_conflict");
      if (!outcomes.includes(selected.outcome)) unavailable();
      const parsed = parser(selected);
      await client.query("COMMIT"); terminal = true; release(client); return parsed;
    } catch (error) {
      if (began && !terminal) { try { await client.query("ROLLBACK"); release(client); } catch { release(client, true); } }
      else if (!terminal) release(client, true);
      if (error instanceof OrderEmailRepositoryError) throw error;
      unavailable();
    }
  }
  private leaseId(): string { try { return uuid(this.options.uuid()); } catch { unavailable(); } }
  async claim(input: ClaimOrderEmailInput): Promise<OrderEmailClaimBatch> {
    const parsed = exact(input, ["workerId", "now", "leaseExpiresAt", "limit"]);
    const workerId = text(parsed.workerId, 1, 128, WORKER), now = date(parsed.now), leaseExpiresAt = date(parsed.leaseExpiresAt);
    const limit = integer(parsed.limit, 1, 25);
    if (leaseExpiresAt.getTime() <= now.getTime() || leaseExpiresAt.getTime() > now.getTime() + 900_000) invalid();
    const leaseId = this.leaseId();
    return this.transaction(
      "SELECT outcome,result_payload FROM saas.order_email_work_claim($1::text,$2::timestamptz,$3::timestamptz,$4::integer,$5::uuid)",
      [workerId, now, leaseExpiresAt, limit, leaseId], ["empty", "claimed"],
      (selected) => {
        const payload = exact(selected.payload, ["items"], "output");
        if (!Array.isArray(payload.items) || payload.items.length > limit || (selected.outcome === "claimed") !== (payload.items.length > 0)) unavailable();
        if (selected.outcome === "empty") return freeze({ kind: "empty" as const });
        return freeze({ kind: "claimed" as const, leaseId, items: payload.items.map(claim) });
      },
    );
  }
  async seal(input: SealOrderEmailInput): Promise<void> {
    const parsed = exact(input, ["deliveryId", "leaseId", "workerId", "now", "sealKeyId", "sealedRequest", "requestDigest", "recipientDigest", "recipientMask", "firstAttemptAt", "idempotencyExpiresAt"]);
    const now = date(parsed.now), firstAttemptAt = date(parsed.firstAttemptAt), idempotencyExpiresAt = date(parsed.idempotencyExpiresAt);
    if (now.getTime() !== firstAttemptAt.getTime() || idempotencyExpiresAt.getTime() !== firstAttemptAt.getTime() + 86_400_000 || !Buffer.isBuffer(parsed.sealedRequest) || parsed.sealedRequest.length < 32 || parsed.sealedRequest.length > 262_144) invalid();
    const deliveryId = uuid(parsed.deliveryId);
    await this.transaction(
      "SELECT outcome,result_payload FROM saas.order_email_work_seal($1::uuid,$2::uuid,$3::text,$4::timestamptz,$5::text,$6::bytea,$7::text,$8::text,$9::text,$10::timestamptz,$11::timestamptz)",
      [deliveryId, uuid(parsed.leaseId), text(parsed.workerId, 1, 128, WORKER), now, text(parsed.sealKeyId, 3, 32, KEY_ID), Buffer.from(parsed.sealedRequest), text(parsed.requestDigest, 64, 64, DIGEST), text(parsed.recipientDigest, 64, 64, DIGEST), text(parsed.recipientMask, 6, 320, MASK), firstAttemptAt, idempotencyExpiresAt],
      ["sealed"], (selected) => deliveryMutation(selected.payload, deliveryId),
    );
  }
  async accept(input: AcceptOrderEmailInput): Promise<void> {
    const parsed = exact(input, ["deliveryId", "leaseId", "workerId", "now", "providerMessageId"]);
    const deliveryId = uuid(parsed.deliveryId);
    await this.transaction(
      "SELECT outcome,result_payload FROM saas.order_email_work_accept($1::uuid,$2::uuid,$3::text,$4::timestamptz,$5::text)",
      [deliveryId, uuid(parsed.leaseId), text(parsed.workerId, 1, 128, WORKER), date(parsed.now), text(parsed.providerMessageId, 1, 256)], ["accepted"], (selected) => deliveryMutation(selected.payload, deliveryId),
    );
  }
  async fail(input: FailOrderEmailInput): Promise<"retry_scheduled" | "failed"> {
    const parsed = exact(input, ["deliveryId", "leaseId", "workerId", "now", "errorCode", "retryable"].concat(Object.hasOwn(input, "nextAttemptAt") ? ["nextAttemptAt"] : []));
    if (typeof parsed.retryable !== "boolean") invalid();
    const now = date(parsed.now), next = parsed.nextAttemptAt === undefined ? undefined : date(parsed.nextAttemptAt);
    if ((parsed.retryable && (!next || next <= now)) || (!parsed.retryable && next)) invalid();
    const deliveryId = uuid(parsed.deliveryId);
    return this.transaction(
      "SELECT outcome,result_payload FROM saas.order_email_work_fail($1::uuid,$2::uuid,$3::text,$4::timestamptz,$5::text,$6::boolean,$7::timestamptz)",
      [deliveryId, uuid(parsed.leaseId), text(parsed.workerId, 1, 128, WORKER), now, text(parsed.errorCode, 1, 64, CODE), parsed.retryable, next ?? null],
      ["retry_scheduled", "failed"], (selected) => {
        const mutation = exact(selected.payload, ["deliveryId", "retryable"], "output");
        if (uuid(mutation.deliveryId, "output") !== deliveryId || mutation.retryable !== (selected.outcome === "retry_scheduled")) unavailable();
        return selected.outcome as "retry_scheduled" | "failed";
      },
    );
  }
  async recordProviderEvent(input: RecordOrderEmailProviderEventInput): Promise<"recorded" | "replayed"> {
    const keys = ["providerEventId", "providerMessageId", "type", "occurredAt", "receivedAt"].concat(Object.hasOwn(input, "safeReasonCode") ? ["safeReasonCode"] : []);
    const parsed = exact(input, keys), types = ["sent", "delivered", "delayed", "failed", "bounced", "complained", "suppressed"];
    if (typeof parsed.type !== "string" || !types.includes(parsed.type)) invalid();
    return this.transaction(
      "SELECT outcome,result_payload FROM saas.order_email_provider_event_record($1::text,$2::text,$3::text,$4::timestamptz,$5::timestamptz,$6::text)",
      [text(parsed.providerEventId, 1, 256), text(parsed.providerMessageId, 1, 256), parsed.type, date(parsed.occurredAt), date(parsed.receivedAt), parsed.safeReasonCode === undefined ? null : text(parsed.safeReasonCode, 1, 64, CODE)],
      ["recorded", "operation_replayed"], (selected) => {
        const receipt = exact(selected.payload, selected.outcome === "recorded" ? ["providerEventId", "matched"] : ["providerEventId"], "output");
        if (receipt.providerEventId !== parsed.providerEventId || (Object.hasOwn(receipt, "matched") && typeof receipt.matched !== "boolean")) unavailable();
        return selected.outcome === "recorded" ? "recorded" : "replayed";
      },
    );
  }
}
