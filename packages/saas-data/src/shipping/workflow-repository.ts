import { acquirePostgresClient, type PostgresClientLike } from "../postgres/pool.ts";
import { openShippingCredential, type SealedShippingCredential, type ShippingCredentialKeyring } from "./credential-crypto.ts";
import {
  SHIPPING_WORKFLOW_ERROR_CODES,
  ShippingWorkflowRepositoryError,
  type ShippingWorkflowErrorCode,
} from "./errors.ts";
import type {
  ClaimShippingFulfillmentInput,
  ClaimShippingValidationInput,
  CompleteShippingQuoteInput,
  CompleteShippingShipmentInput,
  CompleteShippingValidationInput,
  FailShippingFulfillmentInput,
  FailShippingValidationInput,
  MarkShippingShipmentUnknownInput,
  OpenedShippingFulfillment,
  OpenShippingFulfillmentInput,
  OpenedShippingCredential,
  OpenShippingCredentialInput,
  PostgresShippingWorkflowRepositoryOptions,
  ShippingCredentialAuthority,
  ShippingFulfillmentClaim,
  ShippingFulfillmentOrder,
  ShippingFulfillmentQuoteOption,
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

function credentialAuthority(value: unknown, expected: Readonly<{ credentialVersion: number }>): ShippingCredentialAuthority {
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

function nullableText(value: unknown, maximum: number): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) throw unavailable();
  return value;
}

function packages(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw unavailable();
  return Object.freeze(value.map((entry) => {
    const parsed = exact(entry, ["heightCm", "widthCm", "depthCm", "weightKg"]);
    for (const key of ["heightCm", "widthCm", "depthCm", "weightKg"] as const) {
      if (typeof parsed[key] !== "number" || !Number.isFinite(parsed[key]) || (parsed[key] as number) <= 0 || (parsed[key] as number) > 10_000) throw unavailable();
    }
    return Object.freeze({ heightCm: parsed.heightCm as number, widthCm: parsed.widthCm as number, depthCm: parsed.depthCm as number, weightKg: parsed.weightKg as number });
  }));
}

function fulfillmentClaim(value: unknown, expected: Readonly<{ jobId: string; workerId: string; leaseId: string }>): ShippingFulfillmentClaim {
  const parsed = exact(value, ["jobId", "jobKind", "storeId", "profileId", "quoteId", "shipmentId", "credentialVersion", "leaseId", "fenceToken", "version"]);
  const jobKind = parsed.jobKind === "quote" || parsed.jobKind === "create_shipment" ? parsed.jobKind : invalid();
  const shipmentId = parsed.shipmentId === null ? null : uuid(parsed.shipmentId);
  if ((jobKind === "quote") !== (shipmentId === null)) throw unavailable();
  const result = Object.freeze({
    jobId: uuid(parsed.jobId), jobKind, storeId: uuid(parsed.storeId), profileId: uuid(parsed.profileId),
    quoteId: uuid(parsed.quoteId), shipmentId, credentialVersion: integer(parsed.credentialVersion, 1),
    leaseId: uuid(parsed.leaseId), workerId: expected.workerId, fenceToken: integer(parsed.fenceToken, 1), version: integer(parsed.version, 1),
  });
  if (result.jobId !== expected.jobId || result.leaseId !== expected.leaseId) throw unavailable();
  return result;
}

function fulfillmentOrder(value: unknown): ShippingFulfillmentOrder {
  const parsed = exact(value, ["orderId", "orderNumber", "customerName", "customerEmail", "customerPhone", "shippingAddress", "codAmountCents", "handlerCode", "items"]);
  if (typeof parsed.shippingAddress !== "object" || parsed.shippingAddress === null || Array.isArray(parsed.shippingAddress) || JSON.stringify(parsed.shippingAddress).length > 8_192) throw unavailable();
  if (!Array.isArray(parsed.items) || parsed.items.length < 1 || parsed.items.length > 100) throw unavailable();
  const items = Object.freeze(parsed.items.map((entry) => {
    const item = exact(entry, ["orderItemId", "productName", "sku", "quantity"]);
    return Object.freeze({
      orderItemId: uuid(item.orderItemId), productName: nullableText(item.productName, 200) ?? invalid(),
      sku: nullableText(item.sku, 100), quantity: integer(item.quantity, 1, 9_999),
    });
  }));
  return Object.freeze({
    orderId: uuid(parsed.orderId), orderNumber: nullableText(parsed.orderNumber, 100) ?? invalid(),
    customerName: nullableText(parsed.customerName, 200) ?? invalid(), customerEmail: nullableText(parsed.customerEmail, 320),
    customerPhone: nullableText(parsed.customerPhone, 50), shippingAddress: Object.freeze({ ...(parsed.shippingAddress as Record<string, unknown>) }),
    codAmountCents: integer(parsed.codAmountCents, 0), handlerCode: nullableText(parsed.handlerCode, 64) ?? invalid(), items,
  });
}

function fulfillmentOption(value: unknown): ShippingFulfillmentQuoteOption {
  const parsed = exact(value, ["id", "handlerResourceId", "handlerCode", "handlerName", "desiKg", "priceCents", "codFeeCents", "digest"]);
  if (typeof parsed.desiKg !== "number" || !Number.isFinite(parsed.desiKg) || parsed.desiKg < 0 || parsed.desiKg > 10_000) invalid();
  return Object.freeze({
    id: uuid(parsed.id), handlerResourceId: uuid(parsed.handlerResourceId),
    handlerCode: nullableText(parsed.handlerCode, 64) ?? invalid(), handlerName: nullableText(parsed.handlerName, 160) ?? invalid(),
    desiKg: parsed.desiKg, priceCents: integer(parsed.priceCents, 0),
    codFeeCents: parsed.codFeeCents === null ? null : integer(parsed.codFeeCents, 0), digest: digest(parsed.digest),
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

  async claimFulfillment(input: ClaimShippingFulfillmentInput): Promise<ShippingFulfillmentClaim | null> {
    const parsed = exact(input, ["jobId", "workerId", "now", "leaseSeconds", "leaseId"]);
    const expected = { jobId: uuid(parsed.jobId), workerId: worker(parsed.workerId), leaseId: uuid(parsed.leaseId) };
    const now = date(parsed.now), leaseSeconds = integer(parsed.leaseSeconds, 5, 900);
    return this.transaction(false, async (client) => {
      const result = row(await client.query(
        "SELECT outcome,result_payload FROM saas.shipping_fulfillment_claim_job($1::uuid,$2::text,$3::timestamptz,$4::integer,$5::uuid)",
        [expected.jobId, expected.workerId, now.toISOString(), leaseSeconds, expected.leaseId],
      ));
      const known = this.known(result.outcome); if (known) throw known;
      if (result.outcome === "empty" && result.result === null) return null;
      if (result.outcome !== "claimed") throw unavailable();
      return fulfillmentClaim(result.result, expected);
    });
  }

  async openFulfillment(input: OpenShippingFulfillmentInput): Promise<OpenedShippingFulfillment> {
    const parsed = exact(input, ["claim", "now"]), selected = parsed.claim as ShippingFulfillmentClaim, now = date(parsed.now);
    if (!selected || typeof selected !== "object") invalid();
    return this.transaction(true, async (client) => {
      const result = row(await client.query(
        "SELECT outcome,result_payload FROM saas.shipping_fulfillment_open($1::uuid,$2::text,$3::uuid,$4::bigint,$5::timestamptz)",
        [uuid(selected.jobId), worker(selected.workerId), uuid(selected.leaseId), integer(selected.fenceToken, 1), now.toISOString()],
      ));
      const known = this.known(result.outcome); if (known) throw known;
      if (result.outcome !== "opened") throw unavailable();
      const opened = exact(result.result, [
        "jobKind", "providerCode", "credentialEnvelope", "credentialDigest", "credentialKeyId", "credentialVersion",
        "storeId", "profileId", "quoteId", "shipmentId", "packages", "brandProviderResourceId", "addressProviderResourceId", "handlers", "order",
      ]);
      if (opened.jobKind !== selected.jobKind || uuid(opened.storeId) !== selected.storeId || uuid(opened.profileId) !== selected.profileId || uuid(opened.quoteId) !== selected.quoteId || (opened.shipmentId === null ? null : uuid(opened.shipmentId)) !== selected.shipmentId) throw unavailable();
      const credential = credentialAuthority({
        providerCode: opened.providerCode, credentialEnvelope: opened.credentialEnvelope, credentialDigest: opened.credentialDigest,
        credentialKeyId: opened.credentialKeyId, credentialVersion: opened.credentialVersion,
      }, selected);
      const tokenBytes = openShippingCredential({
        envelope: credential.credentialEnvelope, storeId: selected.storeId, profileId: selected.profileId,
        providerCode: "basit_kargo", credentialVersion: selected.credentialVersion, keyring: this.options.keyring,
      });
      try {
        const brand = opened.brandProviderResourceId === null ? null : nullableText(opened.brandProviderResourceId, 200);
        const address = opened.addressProviderResourceId === null ? null : nullableText(opened.addressProviderResourceId, 200);
        if (!Array.isArray(opened.handlers) || opened.handlers.length < 1 || opened.handlers.length > 300) throw unavailable();
        const handlers = Object.freeze(opened.handlers.map((entry) => {
          const handler = exact(entry, ["id", "handlerCode"]);
          return Object.freeze({ id: uuid(handler.id), handlerCode: nullableText(handler.handlerCode, 64) ?? invalid() });
        }));
        if (new Set(handlers.map(({ handlerCode }) => handlerCode)).size !== handlers.length) throw unavailable();
        const order = opened.order === null ? null : fulfillmentOrder(opened.order);
        if ((selected.jobKind === "quote") !== (order === null)) throw unavailable();
        return Object.freeze({ claim: selected, providerCode: "basit_kargo" as const, tokenBytes, packages: packages(opened.packages), brandProviderResourceId: brand, addressProviderResourceId: address, handlers, order });
      } catch (error) { tokenBytes.fill(0); throw error; }
    });
  }

  async completeQuote(input: CompleteShippingQuoteInput): Promise<"completed"> {
    const parsed = exact(input, ["claim", "now", "options"]), selected = parsed.claim as ShippingFulfillmentClaim, now = date(parsed.now);
    if (!selected || selected.jobKind !== "quote" || !Array.isArray(parsed.options) || parsed.options.length < 1 || parsed.options.length > 100) invalid();
    const options = Object.freeze(parsed.options.map(fulfillmentOption));
    return this.transaction(false, async (client) => {
      const result = row(await client.query(
        "SELECT outcome,result_payload FROM saas.shipping_quote_complete($1::uuid,$2::text,$3::uuid,$4::bigint,$5::timestamptz,$6::jsonb)",
        [uuid(selected.jobId), worker(selected.workerId), uuid(selected.leaseId), integer(selected.fenceToken, 1), now.toISOString(), JSON.stringify(options)],
      ));
      const known = this.known(result.outcome); if (known) throw known;
      if (result.outcome !== "completed") throw unavailable();
      return "completed" as const;
    });
  }

  async failFulfillment(input: FailShippingFulfillmentInput): Promise<"failed" | "requeued"> {
    const parsed = exact(input, ["claim", "now", "failureKind", "safeCode", "retryAfterSeconds"]), selected = parsed.claim as ShippingFulfillmentClaim, now = date(parsed.now);
    if (!selected || !["rejected", "throttled", "temporary_failure"].includes(parsed.failureKind as string) || typeof parsed.safeCode !== "string" || !CODE.test(parsed.safeCode)) invalid();
    const retry = parsed.retryAfterSeconds === null ? null : integer(parsed.retryAfterSeconds, 1, 900);
    if ((parsed.failureKind === "throttled" || parsed.failureKind === "temporary_failure") !== (retry !== null)) invalid();
    return this.transaction(false, async (client) => {
      const result = row(await client.query(
        "SELECT outcome,result_payload FROM saas.shipping_fulfillment_fail($1::uuid,$2::text,$3::uuid,$4::bigint,$5::timestamptz,$6::text,$7::text,$8::integer)",
        [uuid(selected.jobId), worker(selected.workerId), uuid(selected.leaseId), integer(selected.fenceToken, 1), now.toISOString(), parsed.failureKind, parsed.safeCode, retry],
      ));
      const known = this.known(result.outcome); if (known) throw known;
      if (result.outcome !== "failed" && result.outcome !== "requeued") throw unavailable();
      return result.outcome;
    });
  }

  async completeShipment(input: CompleteShippingShipmentInput): Promise<"completed"> {
    const parsed = exact(input, ["claim", "now", "eventId", "providerShipmentId", "barcode", "trackingNumber", "trackingUrl", "carrier", "priceCents"]), selected = parsed.claim as ShippingFulfillmentClaim, now = date(parsed.now);
    if (!selected || selected.jobKind !== "create_shipment") invalid();
    const providerShipmentId = nullableText(parsed.providerShipmentId, 200) ?? invalid();
    const barcode = nullableText(parsed.barcode, 200) ?? invalid();
    const trackingNumber = nullableText(parsed.trackingNumber, 200);
    const trackingUrl = nullableText(parsed.trackingUrl, 2_000);
    const carrier = nullableText(parsed.carrier, 160);
    if ((trackingNumber === null) !== (carrier === null) || (trackingUrl !== null && trackingNumber === null)) invalid();
    const priceCents = parsed.priceCents === null ? null : integer(parsed.priceCents, 0);
    return this.transaction(false, async (client) => {
      const result = row(await client.query(
        "SELECT outcome,result_payload FROM saas.shipping_shipment_complete($1::uuid,$2::text,$3::uuid,$4::bigint,$5::timestamptz,$6::uuid,$7::text,$8::text,$9::text,$10::text,$11::text,$12::bigint)",
        [uuid(selected.jobId), worker(selected.workerId), uuid(selected.leaseId), integer(selected.fenceToken, 1), now.toISOString(), uuid(parsed.eventId), providerShipmentId, barcode, trackingNumber, trackingUrl, carrier, priceCents],
      ));
      const known = this.known(result.outcome); if (known) throw known;
      if (result.outcome !== "completed") throw unavailable();
      return "completed" as const;
    });
  }

  async markShipmentUnknown(input: MarkShippingShipmentUnknownInput): Promise<"marked_unknown"> {
    const parsed = exact(input, ["claim", "now", "eventId", "safeCode"]), selected = parsed.claim as ShippingFulfillmentClaim, now = date(parsed.now);
    if (!selected || selected.jobKind !== "create_shipment" || typeof parsed.safeCode !== "string" || !CODE.test(parsed.safeCode)) invalid();
    return this.transaction(false, async (client) => {
      const result = row(await client.query(
        "SELECT outcome,result_payload FROM saas.shipping_shipment_mark_unknown($1::uuid,$2::text,$3::uuid,$4::bigint,$5::timestamptz,$6::uuid,$7::text)",
        [uuid(selected.jobId), worker(selected.workerId), uuid(selected.leaseId), integer(selected.fenceToken, 1), now.toISOString(), uuid(parsed.eventId), parsed.safeCode],
      ));
      const known = this.known(result.outcome); if (known) throw known;
      if (result.outcome !== "marked_unknown") throw unavailable();
      return "marked_unknown" as const;
    });
  }
}
