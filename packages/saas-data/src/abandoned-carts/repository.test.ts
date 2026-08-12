import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";

import { AbandonedCartRepositoryError, PostgresAbandonedCartRepository } from "./index.ts";

const STORE_ID = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL_ID = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP_ID = "55555555-5555-4555-8555-555555555555";
const PLAN_ID = "66666666-6666-4666-8666-666666666666";
const CART_ID = "71000000-0000-4000-8000-000000000001";
const ITEM_ID = "72000000-0000-4000-8000-000000000001";
const OPERATION_ID = "73000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-22T14:00:00.000Z");

function tenantContext(overrides: Record<string, unknown> = {}): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "private-request",
    principal: { id: PRINCIPAL_ID, issuer: "https://identity.example/oidc", subject: "private-subject" },
    store: { id: STORE_ID, slug: "atlas-store", status: "active" },
    membership: { id: MEMBERSHIP_ID, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: PLAN_ID,
      planCode: "merchant_growth",
      version: 3,
      status: "active",
      features: ["catalog", "orders"],
      limits: { products: 100, staff: 5, storageBytes: 1_024 },
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
    ...overrides,
  } as TenantContext;
}

function listItem(overrides: Record<string, unknown> = {}) {
  return {
    id: CART_ID,
    status: "abandoned",
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    currency: "TRY",
    subtotalCents: 12_500,
    discountCents: 500,
    totalCents: 12_000,
    itemCount: 1,
    checkoutStartedAt: "2026-07-22T12:00:00.000Z",
    lastActivityAt: "2026-07-22T12:30:00.000Z",
    abandonedAt: "2026-07-22T12:30:00.000Z",
    version: 1,
    createdAt: "2026-07-22T12:00:00.000Z",
    updatedAt: "2026-07-22T12:30:00.000Z",
    ...overrides,
  };
}

function detail() {
  return {
    ...listItem(),
    items: [{
      id: ITEM_ID,
      position: 0,
      productName: "Keten Gömlek",
      unitPriceCents: 12_500,
      quantity: 1,
      discountCents: 500,
      lineTotalCents: 12_000,
    }],
  };
}

type Row = Record<string, unknown>;
type Response = Readonly<{ rows: Row[]; rowCount?: number | null }>;
type Responder = (text: string, values: unknown[]) => Row[] | Response | Promise<Row[] | Response>;

class FakeClient {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: Array<boolean | Error | undefined> = [];
  private readonly responder: Responder;

  constructor(responder: Responder = () => []) { this.responder = responder; }

  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const response = await this.responder(text, values);
    const rows = Array.isArray(response) ? response : response.rows;
    const rowCount = Array.isArray(response) ? rows.length : (response.rowCount ?? rows.length);
    return { rows, rowCount, command: "", oid: 0, fields: [] };
  }

  release(destroy?: boolean | Error) { this.releases.push(destroy); }
}

class FakePool {
  connects = 0;
  readonly clients: FakeClient[];
  constructor(clients: FakeClient[]) { this.clients = clients; }
  async connect() {
    const client = this.clients[this.connects++];
    if (!client) throw new Error("unexpected checkout");
    return client;
  }
}

function repository(pool: FakePool, audit: Array<{ type: string }> = []) {
  return new PostgresAbandonedCartRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit: (event) => { audit.push(event); },
  });
}

function functionCall(client: FakeClient, name: string) {
  const call = client.calls.find(({ text }) => text.includes(`saas.${name}`));
  assert.ok(call, `missing ${name}`);
  return call;
}

test("summary uses exact seven-part durable authority in a reconciliation-capable transaction", async () => {
  const client = new FakeClient((text) => text.includes("saas.abandoned_carts_summary")
    ? [{ outcome: "summarized", result_payload: { abandoned: 2, recovered: 1, lostValueCents: 12_000, recoveredValueCents: 8_000, currency: "TRY", asOf: NOW.toISOString() } }]
    : []);
  const result = await repository(new FakePool([client])).getSummary({ tenantContext: tenantContext(), now: NOW });
  assert.equal(result.abandoned, 2);
  assert.equal(Object.isFrozen(result), true);
  const call = functionCall(client, "abandoned_carts_summary");
  assert.deepEqual(call.values, [STORE_ID, PRINCIPAL_ID, MEMBERSHIP_ID, PLAN_ID, "merchant_growth", 3, NOW]);
  assert.notEqual(call.values[6], NOW);
  assert.equal(client.calls[0]?.text, "BEGIN ISOLATION LEVEL READ COMMITTED");
  assert.equal(client.calls.at(-1)?.text, "COMMIT");
  assert.deepEqual(client.releases, [undefined]);
});

test("list and get parse only exact bounded safe projections", async () => {
  const listClient = new FakeClient((text) => text.includes("saas.abandoned_carts_list")
    ? [{ outcome: "listed", result_payload: { items: [listItem()] } }]
    : []);
  const listed = await repository(new FakePool([listClient])).list({ tenantContext: tenantContext(), now: NOW, pageSize: 25, status: "abandoned", sort: "highest" });
  assert.equal(listed.items.length, 1);
  assert.equal(Object.isFrozen(listed.items), true);
  const listCall = functionCall(listClient, "abandoned_carts_list");
  assert.deepEqual(listCall.values.slice(7, 11), ["abandoned", null, "highest", 25]);
  assert.equal(listClient.calls[0]?.text, "BEGIN ISOLATION LEVEL READ COMMITTED");

  const getClient = new FakeClient((text) => text.includes("saas.abandoned_carts_get")
    ? [{ outcome: "found", result_payload: detail() }]
    : []);
  const found = await repository(new FakePool([getClient])).get({ tenantContext: tenantContext(), now: NOW, cartId: CART_ID });
  assert.equal(found.id, CART_ID);
  assert.equal(Object.isFrozen(found.items[0]), true);
  assert.equal(getClient.calls[0]?.text, "BEGIN ISOLATION LEVEL READ COMMITTED");
});

test("invalid context and browser-like authority fields fail before pool checkout", async () => {
  const pool = new FakePool([]);
  await assert.rejects(
    repository(pool).getSummary({ tenantContext: tenantContext({ storeId: STORE_ID }) as TenantContext, now: NOW }),
    (error) => error instanceof AbandonedCartRepositoryError && error.code === "durable_authority_invalid",
  );
  assert.equal(pool.connects, 0);
});

test("mark recovered is versioned idempotent and uses carts manage authority function", async () => {
  const client = new FakeClient((text) => text.includes("saas.abandoned_carts_mark_recovered")
    ? [{ outcome: "committed", result_payload: { id: CART_ID, status: "recovered", version: 2, updatedAt: NOW.toISOString() } }]
    : []);
  const result = await repository(new FakePool([client])).markRecovered({
    tenantContext: tenantContext(), now: NOW, cartId: CART_ID, operationId: OPERATION_ID, expectedVersion: 1,
  });
  assert.deepEqual(result, { id: CART_ID, status: "recovered", version: 2, updatedAt: NOW.toISOString(), replayed: false });
  const call = functionCall(client, "abandoned_carts_mark_recovered");
  assert.equal(call.values[7], OPERATION_ID);
  assert.match(String(call.values[8]), /^[a-f0-9]{64}$/);
  assert.deepEqual(call.values.slice(9), [CART_ID, 1]);
});

test("archive rejects malformed inputs and stable SQL outcomes", async () => {
  const pool = new FakePool([]);
  await assert.rejects(repository(pool).archive({ tenantContext: tenantContext(), now: NOW, cartId: "bad", operationId: OPERATION_ID, expectedVersion: 1 }),
    (error) => error instanceof AbandonedCartRepositoryError && error.message === "invalid_input");
  assert.equal(pool.connects, 0);

  const client = new FakeClient((text) => text.includes("saas.abandoned_carts_archive")
    ? [{ outcome: "version_conflict", result_payload: null }]
    : []);
  await assert.rejects(repository(new FakePool([client])).archive({ tenantContext: tenantContext(), now: NOW, cartId: CART_ID, operationId: OPERATION_ID, expectedVersion: 1 }),
    (error) => error instanceof AbandonedCartRepositoryError && error.code === "version_conflict");
});

test("unknown COMMIT destroys the first client and performs exactly one read-only recovery", async () => {
  const audit: Array<{ type: string }> = [];
  const first = new FakeClient((text) => {
    if (text.includes("saas.abandoned_carts_archive")) return [{ outcome: "committed", result_payload: { id: CART_ID, status: "archived", version: 2, updatedAt: NOW.toISOString() } }];
    if (text === "COMMIT") throw new Error("socket closed");
    return [];
  });
  const recovery = new FakeClient((text) => text.includes("saas.abandoned_carts_recover_operation")
    ? [{ outcome: "operation_replayed", result_payload: { id: CART_ID, status: "archived", version: 2, updatedAt: NOW.toISOString() } }]
    : []);
  const result = await repository(new FakePool([first, recovery]), audit).archive({
    tenantContext: tenantContext(), now: NOW, cartId: CART_ID, operationId: OPERATION_ID, expectedVersion: 1,
  });
  assert.equal(result.replayed, true);
  assert.deepEqual(first.releases, [true]);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(recovery.calls.filter(({ text }) => text.includes("recover_operation")).length, 1);
  assert.deepEqual(audit, [{ type: "abandoned_cart_commit_unknown" }]);
});
