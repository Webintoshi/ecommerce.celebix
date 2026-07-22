import assert from "node:assert/strict";
import test from "node:test";

import {
  PublicAbandonedCartRepositoryError,
  PostgresPublicAbandonedCartRepository,
} from "./index.ts";

const CART_ID = "71000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "41000000-0000-4000-8000-000000000001";
const VARIANT_ID = "42000000-0000-4000-8000-000000000001";
const ORDER_ID = "40000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-22T15:00:00.000Z");
const DIGEST = "a".repeat(64);

type Row = Record<string, unknown>;
type Responder = (text: string, values: unknown[]) => Row[] | Promise<Row[]>;

class FakeClient {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: Array<boolean | Error | undefined> = [];
  private readonly responder: Responder;
  constructor(responder: Responder = () => []) { this.responder = responder; }
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const rows = await this.responder(text, values);
    return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
  }
  release(destroy?: boolean | Error) { this.releases.push(destroy); }
}

class FakePool {
  connects = 0;
  readonly clients: FakeClient[];
  constructor(...clients: FakeClient[]) { this.clients = clients; }
  async connect() {
    const client = this.clients[this.connects++];
    if (!client) throw new Error("unexpected checkout");
    return client;
  }
}

function repository(pool: FakePool) {
  return new PostgresPublicAbandonedCartRepository({
    pool,
    role: "celebix_saas_workflow",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit: () => undefined,
  });
}

function projection(overrides: Record<string, unknown> = {}) {
  return { id: CART_ID, status: "active", currency: "TRY", totalCents: 25_000, itemCount: 1, version: 1, updatedAt: NOW.toISOString(), ...overrides };
}

function captureInput(overrides: Record<string, unknown> = {}) {
  return {
    hostname: "cart-store-a.example.test",
    cartId: CART_ID,
    credentialDigest: DIGEST,
    now: NOW,
    customer: { name: "Ada Lovelace", email: "ada@example.test" },
    items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 2 }],
    ...overrides,
  };
}

test("capture sends only host digest identifiers quantities and server time under workflow role", async () => {
  const client = new FakeClient((text) => text.includes("saas.abandoned_carts_capture")
    ? [{ outcome: "captured", result_payload: projection() }]
    : []);
  const result = await repository(new FakePool(client)).capture(captureInput());
  assert.deepEqual(result, projection());
  assert.equal(Object.isFrozen(result), true);
  const call = client.calls.find(({ text }) => text.includes("saas.abandoned_carts_capture"));
  assert.ok(call);
  assert.deepEqual(call.values.slice(0, 4), ["cart-store-a.example.test", CART_ID, DIGEST, NOW]);
  assert.notEqual(call.values[3], NOW);
  assert.deepEqual(JSON.parse(String(call.values[5])), [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 2 }]);
  assert.equal(JSON.stringify(call.values).includes("totalCents"), false);
  assert.equal(JSON.stringify(call.values).includes("storeId"), false);
  assert.equal(client.calls[0]?.text, "BEGIN ISOLATION LEVEL READ COMMITTED");
  assert.equal(client.calls[4]?.text, "SET LOCAL ROLE celebix_saas_workflow");
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
});

test("capture rejects browser money labels media store IDs and malformed host before checkout", async () => {
  for (const invalid of [
    captureInput({ totalCents: 1 }),
    captureInput({ storeId: CART_ID }),
    captureInput({ items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1, unitPriceCents: 1 }] }),
    captureInput({ hostname: "internal:3000" }),
  ]) {
    const pool = new FakePool();
    await assert.rejects(repository(pool).capture(invalid as never), (error) => error instanceof PublicAbandonedCartRepositoryError && error.code === "invalid_input");
    assert.equal(pool.connects, 0);
  }
});

test("stale lifecycle is a bounded global workflow call and returns the exact affected count", async () => {
  const client = new FakeClient((text) => text.includes("saas.abandoned_carts_mark_stale")
    ? [{ outcome: "committed", result_payload: { affected: 3, asOf: NOW.toISOString() } }]
    : []);
  const result = await repository(new FakePool(client)).markStale({ now: NOW, staleBefore: new Date("2026-07-22T14:30:00.000Z") });
  assert.deepEqual(result, { affected: 3, asOf: NOW.toISOString() });
});

test("conversion binds exact host digest and persisted order without browser tenant authority", async () => {
  const client = new FakeClient((text) => text.includes("saas.abandoned_carts_convert")
    ? [{ outcome: "committed", result_payload: projection({ status: "recovered", version: 2 }) }]
    : []);
  const result = await repository(new FakePool(client)).convert({ hostname: "cart-store-a.example.test", credentialDigest: DIGEST, orderId: ORDER_ID, now: NOW });
  assert.equal(result.status, "recovered");
  const call = client.calls.find(({ text }) => text.includes("saas.abandoned_carts_convert"));
  assert.deepEqual(call?.values, ["cart-store-a.example.test", DIGEST, ORDER_ID, NOW]);
});

test("controlled SQL outcomes and corrupt projections expose stable errors only", async () => {
  const denied = new FakeClient((text) => text.includes("saas.abandoned_carts_capture") ? [{ outcome: "catalog_item_unavailable", result_payload: null }] : []);
  await assert.rejects(repository(new FakePool(denied)).capture(captureInput()), (error) => error instanceof PublicAbandonedCartRepositoryError && error.message === "catalog_item_unavailable");
  const corrupt = new FakeClient((text) => text.includes("saas.abandoned_carts_capture") ? [{ outcome: "captured", result_payload: { ...projection(), storeId: CART_ID } }] : []);
  await assert.rejects(repository(new FakePool(corrupt)).capture(captureInput()), (error) => error instanceof PublicAbandonedCartRepositoryError && error.message === "unavailable");
});
