import assert from "node:assert/strict";
import test from "node:test";

import type { PostgresPoolLike } from "../postgres/pool.ts";
import {
  PostgresStorefrontCommerceRepository,
  StorefrontCommerceRepositoryError,
} from "./index.ts";

const HOST = "guzide-cart.saas-staging.celebix.site";
const NOW = new Date("2026-07-31T12:00:00.000Z");
const PRODUCT = "40000000-0000-4000-8000-000000000081";
const VARIANT = "50000000-0000-4000-8000-000000000081";
const OPERATION = "70000000-0000-4000-8000-000000000081";
const DIGEST = "a".repeat(64);
const CANDIDATES = Object.freeze([Object.freeze({ keyId: "current_01", digest: DIGEST })]);
const CART = Object.freeze({ version: 1, currency: "TRY", itemCount: 1, subtotalCents: 1127100, shippingCents: 9900, totalCents: 1137000, checkoutReady: true, checkoutBlocker: null, items: Object.freeze([Object.freeze({ productId: PRODUCT, variantId: VARIANT, slug: "altin-yuzuk", title: "Altın Yüzük", variantTitle: "14 Ayar", quantity: 1, unitPriceCents: 1127100, lineTotalCents: 1127100, available: true })]) });
const RECEIPT = Object.freeze({ orderReference: "SF-72000000000040008000000000000081", currency: "TRY", subtotalCents: 1127100, shippingCents: 9900, totalCents: 1137000, paymentStatus: "pending", paymentMethod: Object.freeze({ kind: "bank_transfer", label: "Banka havalesi", instructions: "Açıklama", bankName: "Celebix Bank", accountHolder: "Güzide", iban: "TR330006100519786457841326" }), delivery: Object.freeze({ recipientName: "Güzide Elif", addressLine1: "Cadde 1", city: "İstanbul", country: "TR" }), items: CART.items, createdAt: NOW.toISOString() });
const PERSISTED_CREATED = Object.freeze({ receipt: true as const, customer: true, receiptKeyId: "current_01", customerKeyId: "current_01" });
const PERSISTED_REUSED = Object.freeze({ receipt: true as const, customer: false, receiptKeyId: "current_01", customerKeyId: "current_01" });

type Row = Record<string, unknown>;
type Responder = (text: string, values: unknown[]) => Row[] | Promise<Row[]>;
class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: unknown[] = [];
  private readonly responder: Responder;
  constructor(responder: Responder) { this.responder = responder; }
  async query(text: string, values: unknown[] = []) { this.calls.push({ text, values }); const rows = await this.responder(text, values); return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] }; }
  release(value?: unknown) { this.releases.push(value); }
}
class Pool implements PostgresPoolLike {
  private index = 0;
  private readonly clients: readonly Client[];
  constructor(clients: readonly Client[]) { this.clients = clients; }
  async connect() { const client = this.clients[this.index++]; if (!client) throw new Error("pool"); return client; }
}
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 });
function repository(pool: Pool) { return new PostgresStorefrontCommerceRepository({ pool, role: "celebix_saas_host_resolver", timeouts: TIMEOUTS, audit: () => undefined }); }
function responder(outcome: string, result: unknown): Responder { return (text) => text.includes("saas.") ? [{ outcome, result_payload: result }] : []; }

test("cart resolve uses one read-only hostname/digest workflow and releases after commit", async () => {
  const client = new Client(responder("found", CART));
  assert.deepEqual(await repository(new Pool([client])).resolveCart({ hostname: HOST, now: NOW, candidates: CANDIDATES }), CART);
  assert.equal(client.calls[0]?.text, "BEGIN READ ONLY");
  const selected = client.calls.find(({ text }) => text.includes("saas.public_cart_resolve"));
  assert.deepEqual(selected?.values, [HOST, NOW, JSON.stringify(CANDIDATES)]);
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
  assert.deepEqual(client.releases, [undefined]);
});

test("new cart mutation sends only generated digest metadata and canonical product authority", async () => {
  const client = new Client(responder("committed", { credentialCreated: true, cart: CART }));
  const result = await repository(new Pool([client])).mutateCart({ hostname: HOST, now: NOW, candidates: [], cart: { id: "60000000-0000-4000-8000-000000000081", keyId: "current_01", digest: DIGEST, expiresAt: new Date("2026-08-30T12:00:00.000Z") }, operationId: OPERATION, action: "add", expectedVersion: 0, productId: PRODUCT, variantId: VARIANT, quantity: 1 });
  assert.deepEqual(result, { credentialCreated: true, cart: CART });
  const selected = client.calls.find(({ text }) => text.includes("saas.public_cart_mutate"));
  assert.equal(selected?.values.includes(PRODUCT), true);
  assert.equal(selected?.values.includes(VARIANT), true);
  assert.equal(JSON.stringify(selected?.values).includes("credential"), false);
});

test("checkout unknown commit destroys the client and performs exactly one read-only recovery", async () => {
  const first = new Client(async (text) => {
    if (text.includes("saas.public_checkout_complete")) return [{ outcome: "committed", result_payload: { receipt: RECEIPT, credentialPersistence: PERSISTED_CREATED } }];
    if (text === "COMMIT") throw new Error("socket lost");
    return [];
  });
  const second = new Client(responder("operation_replayed", { receipt: RECEIPT, credentialPersistence: PERSISTED_CREATED }));
  const result = await repository(new Pool([first, second])).complete({ hostname: HOST, now: NOW, intentKind: "cart", candidates: CANDIDATES, customerCandidates: [], operationId: OPERATION, cartVersion: 1, delivery: { contact: { firstName: "Güzide", lastName: "Elif", email: "guzide@example.test", phone: "+905551112233" }, shippingAddress: { line1: "Cadde 1", city: "İstanbul", country: "TR" } }, paymentKind: "bank_transfer", generated: { orderId: "72000000-0000-4000-8000-000000000081", customerId: "73000000-0000-4000-8000-000000000081", addressId: "74000000-0000-4000-8000-000000000081", eventId: "75000000-0000-4000-8000-000000000081", receipt: { id: "76000000-0000-4000-8000-000000000081", keyId: "current_01", digest: "b".repeat(64), expiresAt: new Date("2026-08-01T12:00:00.000Z") }, customer: { id: "77000000-0000-4000-8000-000000000081", keyId: "current_01", digest: "c".repeat(64), expiresAt: new Date("2026-08-30T12:00:00.000Z") } } });
  assert.deepEqual(result, { receipt: RECEIPT, credentialPersistence: PERSISTED_CREATED });
  assert.deepEqual(first.releases, [true]);
  assert.equal(second.calls.filter(({ text }) => text.includes("saas.public_checkout_recover")).length, 1);
  assert.equal(second.calls[0]?.text, "BEGIN READ ONLY");
});

test("ordinary checkout replay never claims newly generated credentials were persisted", async () => {
  const client = new Client(responder("operation_replayed", { receipt: RECEIPT, credentialPersistence: PERSISTED_REUSED }));
  const result = await repository(new Pool([client])).complete({ hostname: HOST, now: NOW, intentKind: "cart", candidates: CANDIDATES, customerCandidates: CANDIDATES, operationId: OPERATION, cartVersion: 1, delivery: { contact: { firstName: "Güzide", lastName: "Elif", email: "guzide@example.test", phone: "+905551112233" }, shippingAddress: { line1: "Cadde 1", city: "İstanbul", country: "TR" } }, paymentKind: "bank_transfer", generated: { orderId: "72000000-0000-4000-8000-000000000081", customerId: "73000000-0000-4000-8000-000000000081", addressId: "74000000-0000-4000-8000-000000000081", eventId: "75000000-0000-4000-8000-000000000081", receipt: { id: "76000000-0000-4000-8000-000000000081", keyId: "current_01", digest: "b".repeat(64), expiresAt: new Date("2026-08-01T12:00:00.000Z") }, customer: { id: "77000000-0000-4000-8000-000000000081", keyId: "current_01", digest: "c".repeat(64), expiresAt: new Date("2026-08-30T12:00:00.000Z") } } });
  assert.deepEqual(result, { receipt: RECEIPT, credentialPersistence: PERSISTED_REUSED });
});

test("receipt read binds the receipt and customer credentials in one read-only call", async () => {
  const receiptCandidates = Object.freeze([Object.freeze({ keyId: "receipt_01", digest: "b".repeat(64) })]);
  const customerCandidates = Object.freeze([Object.freeze({ keyId: "customer_01", digest: "c".repeat(64) })]);
  const client = new Client(responder("found", RECEIPT));
  const result = await repository(new Pool([client])).getReceipt({ hostname: HOST, now: NOW, receiptCandidates, customerCandidates });
  assert.deepEqual(result, RECEIPT);
  const selected = client.calls.find(({ text }) => text.includes("saas.public_receipt_get"));
  assert.match(selected?.text ?? "", /public_receipt_get\(\$1::text,\$2::timestamptz,\$3::jsonb,\$4::jsonb\)/u);
  assert.deepEqual(selected?.values, [HOST, NOW, JSON.stringify(receiptCandidates), JSON.stringify(customerCandidates)]);
  assert.equal(client.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("malformed database projection rolls back and never returns a partial cart", async () => {
  const client = new Client(responder("found", { ...CART, storeId: "private" }));
  await assert.rejects(repository(new Pool([client])).resolveCart({ hostname: HOST, now: NOW, candidates: CANDIDATES }), (error: unknown) => error instanceof StorefrontCommerceRepositoryError && error.code === "unavailable");
  assert.equal(client.calls.at(-1)?.text, "ROLLBACK");
  assert.deepEqual(client.releases, [undefined]);
});

test("repository rejects more than sixteen candidates before pool acquisition", async () => {
  const selected = repository(new Pool([]));
  await assert.rejects(selected.resolveCart({ hostname: HOST, now: NOW, candidates: Array.from({ length: 17 }, (_, index) => ({ keyId: `key_${index}`, digest: DIGEST })) }), /invalid_input/u);
});
