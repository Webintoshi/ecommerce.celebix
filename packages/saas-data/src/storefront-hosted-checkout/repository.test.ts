import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult } from "pg";

import type { PostgresPoolLike } from "../postgres/pool.ts";
import {
  PostgresStorefrontHostedCheckoutRepository,
  StorefrontHostedCheckoutRepositoryError,
} from "./repository.ts";

const HOST = "guzide.saas-staging.celebix.site";
const NOW = new Date("2026-08-06T12:00:00.000Z");
const STORE = "10000000-0000-4000-8000-000000000191";
const SOURCE = "20000000-0000-4000-8000-000000000191";
const PRODUCT = "30000000-0000-4000-8000-000000000191";
const VARIANT = "40000000-0000-4000-8000-000000000191";
const METHOD = "50000000-0000-4000-8000-000000000191";
const PROFILE = "60000000-0000-4000-8000-000000000191";
const OPERATION = "70000000-0000-4000-8000-000000000191";
const SESSION = "80000000-0000-4000-8000-000000000191";
const DIGEST = "a".repeat(64);
const EVIDENCE = `sha256:${"b".repeat(64)}`;
const CANDIDATES = Object.freeze([Object.freeze({ keyId: "cart-key", digest: DIGEST })]);
const DELIVERY = Object.freeze({
  contact: Object.freeze({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", phone: "+905551112233" }),
  shippingAddress: Object.freeze({ line1: "Cadde 1", city: "İstanbul", country: "TR" as const }),
});

const authority = () => ({
  authorityDigest: DIGEST, storeId: STORE, sourceKind: "cart", sourceId: SOURCE,
  sourceVersion: 1, paymentMethodId: METHOD, methodVersion: 2, profileId: PROFILE,
  profileVersion: 3, providerCode: "paytr_iframe", environment: "test",
  credentialVersion: 4, executionAdapterVersion: 1, executionEvidenceDigest: EVIDENCE,
  orderReference: `sf:${SOURCE}:1`, currency: "TRY", subtotalMinor: 10_000,
  shippingMinor: 0, discountMinor: 0, totalMinor: 10_000, delivery: DELIVERY,
  items: [{ productId: PRODUCT, variantId: VARIANT, slug: "urun", title: "Ürün", variantTitle: "Standart", quantity: 1, unitPriceCents: 10_000, lineTotalCents: 10_000, available: true }],
  presentation: "iframe", requiredCustomerFields: [], customerName: "Ada Lovelace",
  customerEmail: "ada@example.test", customerPhone: "+905551112233", customerAddress: "Cadde 1",
  city: "İstanbul", country: "TR", postalCode: null,
  basket: [{ reference: VARIANT, name: "Ürün", quantity: 1, unitAmountMinor: 10_000, itemType: "PHYSICAL" }],
});
const envelope = () => ({ algorithm: "A256GCM" as const, ciphertext: "AQ", iv: "AAAAAAAAAAAAAAAA", keyId: "provider-key", tag: "AAAAAAAAAAAAAAAAAAAAAA", version: 1 as const });
const beginPayload = () => ({
  attemptId: OPERATION, storeId: STORE, paymentMethodId: METHOD, profileId: PROFILE,
  providerCode: "paytr_iframe", environment: "test", executionAdapterVersion: 1,
  executionEvidenceDigest: EVIDENCE, credentialVersion: 4, amountMinor: 10_000, currency: "TRY",
  methodConfig: { environment: "test", locale: "tr", threeDSecure: "provider_managed", installmentMode: "all", maxInstallment: 0 },
  publicConfig: { environment: "test" }, sealedCredentials: envelope(), sessionId: SESSION,
  sessionStatus: "active", sessionVersion: 1,
  paymentSessionKeyId: "current_01", receiptKeyId: "current_01", customerKeyId: "current_01",
  paymentSessionExpiresAt: "2026-08-06T12:15:00.000Z",
  receiptExpiresAt: "2026-08-07T12:00:00.000Z", customerExpiresAt: "2026-09-05T12:00:00.000Z",
});

type Row = Record<string, unknown>;
type Responder = (text: string, values: unknown[]) => Row[] | Promise<Row[]>;
class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: unknown[] = [];
  private readonly responder: Responder;
  private readonly realPgResult: boolean;
  constructor(responder: Responder, realPgResult = false) { this.responder = responder; this.realPgResult = realPgResult; }
  async query(text: string, values: unknown[] = []): Promise<QueryResult<Row>> {
    this.calls.push({ text, values });
    const rows = await this.responder(text, values);
    const result: QueryResult<Row> = { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
    if (this.realPgResult) Object.assign(result, {
      RowCtor: null, _parsers: [], _prebuiltEmptyResultObject: null,
      _types: {}, rowAsArray: false,
    });
    return result;
  }
  release(value?: unknown) { this.releases.push(value); }
}
class Pool implements PostgresPoolLike {
  private cursor = 0;
  private readonly clients: readonly Client[];
  constructor(clients: readonly Client[]) { this.clients = clients; }
  async connect() { const client = this.clients[this.cursor++]; if (!client) throw new Error("pool"); return client; }
}
const options = (pool: Pool, audits: string[] = []) => ({
  pool, role: "celebix_saas_host_resolver" as const,
  timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
  audit: (event: Readonly<{ type: string }>) => { audits.push(event.type); },
});
const repository = (pool: Pool, audits: string[] = []) => new PostgresStorefrontHostedCheckoutRepository(options(pool, audits));
const row = (outcome: string, result: unknown): Row[] => [{ outcome, result_payload: result }];

const authorityInput = () => ({ hostname: HOST, now: NOW, intentKind: "cart" as const, candidates: CANDIDATES, cartVersion: 1, delivery: DELIVERY, paymentMethodId: METHOD });
const beginInput = () => ({
  ...authorityInput(), expectedAuthorityDigest: DIGEST, operationId: OPERATION,
  fingerprint: "c".repeat(64), sessionId: SESSION, callbackBindingDigest: "d".repeat(64),
  orderId: "81000000-0000-4000-8000-000000000191", customerId: "82000000-0000-4000-8000-000000000191",
  addressId: "83000000-0000-4000-8000-000000000191", eventId: "84000000-0000-4000-8000-000000000191",
  receiptId: "85000000-0000-4000-8000-000000000191", customerCredentialId: "86000000-0000-4000-8000-000000000191",
  paymentSession: { keyId: "payment-key", digest: "e".repeat(64) },
  receipt: { keyId: "receipt-key", digest: "f".repeat(64) },
  customer: { keyId: "customer-key", digest: "1".repeat(64) },
});

test("authority sends the exact public start signature and returns a deeply frozen provider-neutral projection", async () => {
  const client = new Client((text) => text.includes("public_storefront_hosted_checkout_authority") ? row("found", authority()) : []);
  const result = await repository(new Pool([client])).authority(authorityInput());
  const call = client.calls.find(({ text }) => text.includes("public_storefront_hosted_checkout_authority"));
  assert.match(call?.text ?? "", /\$7::uuid/u);
  assert.deepEqual(call?.values, [HOST, NOW, "cart", JSON.stringify(CANDIDATES), 1, JSON.stringify(DELIVERY), METHOD]);
  assert.equal(result.providerCode, "paytr_iframe");
  assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.items), true); assert.equal(Object.isFrozen(result.items[0]), true);
  assert.equal(client.calls[0]?.text, "BEGIN READ ONLY"); assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("authority accepts the real pg Result envelope while keeping the row contract exact", async () => {
  const client = new Client(
    (text) => text.includes("public_storefront_hosted_checkout_authority") ? row("found", authority()) : [],
    true,
  );
  const result = await repository(new Pool([client])).authority(authorityInput());
  assert.equal(result.providerCode, "paytr_iframe");
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("authority rejects private or secret DB fields instead of forwarding them", async () => {
  const client = new Client((text) => text.includes("public_storefront_hosted_checkout_authority") ? row("found", { ...authority(), sealedCredentials: envelope() }) : []);
  await assert.rejects(repository(new Pool([client])).authority(authorityInput()), (error: unknown) => error instanceof StorefrontHostedCheckoutRepositoryError && error.code === "unavailable");
  assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
});

test("begin validates every generated identifier and parses the scoped payment-attempt result", async () => {
  const client = new Client((text) => text.includes("public_storefront_hosted_checkout_begin") ? row("created", beginPayload()) : []);
  const result = await repository(new Pool([client])).begin(beginInput());
  const call = client.calls.find(({ text }) => text.includes("public_storefront_hosted_checkout_begin"));
  assert.match(call?.text ?? "", /\$24::text/u); assert.equal(call?.values.length, 24);
  assert.equal(result.attemptId, OPERATION); assert.equal(result.outcome, "created"); assert.equal(Object.isFrozen(result.sealedCredentials), true);
});

test("begin commit ambiguity destroys the socket and performs exactly one credential-bound status recovery", async () => {
  const audits: string[] = [];
  const first = new Client(async (text) => {
    if (text.includes("public_storefront_hosted_checkout_begin")) return row("created", beginPayload());
    if (text === "COMMIT") throw new Error("socket lost");
    return [];
  });
  const second = new Client((text) => text.includes("public_storefront_hosted_checkout_status")
    ? row("found", { sessionId: SESSION, status: "active", safeCode: "payment_started", version: 1, paymentSessionExpiresAt: "2026-08-06T12:15:00.000Z" }) : []);
  const result = await repository(new Pool([first, second]), audits).begin(beginInput());
  assert.equal(result.attemptId, OPERATION); assert.deepEqual(first.releases, [true]);
  assert.equal(second.calls.filter(({ text }) => text.includes("public_storefront_hosted_checkout_status")).length, 1);
  assert.deepEqual(audits, ["storefront_hosted_checkout_commit_unknown"]);
});

test("presentation save/read preserves only the digest-bound sealed presentation", async () => {
  const sealed = { ...envelope(), keyId: "presentation-key" };
  const saveClient = new Client((text) => text.includes("presentation_save") ? row("updated", { sessionId: SESSION, status: "provider_ready", version: 2, providerCode: "paytr_iframe", presentationExpiresAt: "2026-08-06T12:05:00.000Z" }) : []);
  await repository(new Pool([saveClient])).savePresentation({ hostname: HOST, now: NOW, candidates: [{ keyId: "payment-key", digest: "e".repeat(64) }], operationId: "87000000-0000-4000-8000-000000000191", fingerprint: "2".repeat(64), expectedVersion: 1, presentationKeyId: "presentation-key", presentationDigest: "3".repeat(64), sealedPresentation: sealed, presentationExpiresAt: new Date("2026-08-06T12:05:00.000Z") });
  const readClient = new Client((text) => text.includes("checkout_presentation(") ? row("found", { sessionId: SESSION, status: "provider_ready", version: 2, providerCode: "paytr_iframe", presentationKeyId: "presentation-key", presentationDigest: "3".repeat(64), sealedPresentation: sealed, presentationExpiresAt: "2026-08-06T12:05:00.000Z" }) : []);
  const state = await repository(new Pool([readClient])).presentation({ hostname: HOST, now: NOW, candidates: [{ keyId: "payment-key", digest: "e".repeat(64) }] });
  assert.equal(state.presentationDigest, "3".repeat(64)); assert.equal(Object.isFrozen(state.sealedPresentation), true);
});

test("presentation save accepts the shared sealed-envelope key id contract", async () => {
  const presentationKey = "Quick.Order-Key_V1";
  const sealed = { ...envelope(), keyId: presentationKey };
  const client = new Client((text) => text.includes("presentation_save")
    ? row("updated", { sessionId: SESSION, status: "provider_ready", version: 2, providerCode: "paytr_iframe", presentationExpiresAt: "2026-08-06T12:05:00.000Z" })
    : []);

  await repository(new Pool([client])).savePresentation({
    hostname: HOST, now: NOW, candidates: [{ keyId: "payment-key", digest: "e".repeat(64) }],
    operationId: "87000000-0000-4000-8000-000000000192", fingerprint: "2".repeat(64), expectedVersion: 1,
    presentationKeyId: presentationKey, presentationDigest: "3".repeat(64), sealedPresentation: sealed,
    presentationExpiresAt: new Date("2026-08-06T12:05:00.000Z"),
  });

  const call = client.calls.find(({ text }) => text.includes("presentation_save"));
  assert.equal(call?.values[6], presentationKey);
});

test("begin keeps issued commerce credential key ids on the narrow contract", async () => {
  const client = new Client(() => []);
  await assert.rejects(repository(new Pool([client])).begin({
    ...beginInput(),
    paymentSession: { keyId: "Quick.Order-Key_V1", digest: "e".repeat(64) },
  }), (error: unknown) => error instanceof StorefrontHostedCheckoutRepositoryError && error.code === "invalid_input");
  assert.equal(client.calls.length, 0);
});

test("status returns only the finite public lifecycle", async () => {
  const client = new Client((text) => text.includes("checkout_status") ? row("found", { sessionId: SESSION, status: "processing", safeCode: "provider_processing", version: 3, paymentSessionExpiresAt: "2026-08-06T12:15:00.000Z" }) : []);
  const status = await repository(new Pool([client])).status({ hostname: HOST, now: NOW, candidates: [{ keyId: "payment-key", digest: "e".repeat(64) }] });
  assert.deepEqual(status, { sessionId: SESSION, status: "processing", safeCode: "provider_processing", version: 3, paymentSessionExpiresAt: "2026-08-06T12:15:00.000Z" });
});

test("unknown outcomes map to unavailable and accessors are rejected before acquiring a client", async () => {
  const client = new Client((text) => text.includes("authority") ? row("future_outcome", null) : []);
  await assert.rejects(repository(new Pool([client])).authority(authorityInput()), /unavailable/u);
  const malicious = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of Object.entries(authorityInput())) {
    if (key !== "hostname") Object.defineProperty(malicious, key, { enumerable: true, value });
  }
  Object.defineProperty(malicious, "hostname", { enumerable: true, get: () => HOST });
  await assert.rejects(repository(new Pool([])).authority(malicious as ReturnType<typeof authorityInput>), /invalid_input/u);
});
