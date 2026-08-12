import assert from "node:assert/strict";
import test from "node:test";

import { AbandonedCartApiError, createAbandonedCartApiClient } from "./client.ts";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPERATION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = "2026-07-22T16:00:00.000Z";

function item() { return { id: ID, status: "abandoned", currency: "TRY", subtotalCents: 10000, discountCents: 0, totalCents: 10000, itemCount: 1, firstProductName: "Keten Gömlek", checkoutStartedAt: NOW, lastActivityAt: NOW, abandonedAt: NOW, version: 3, createdAt: NOW, updatedAt: NOW }; }

test("client performs exact same-origin summary list and detail reads", async () => {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  const client = createAbandonedCartApiClient({ randomUUID: () => OPERATION, fetch: async (input, init) => { calls.push([input, init]); const path = String(input); const listItem = item(); const { firstProductName: _firstProductName, ...emptyItem } = listItem; const body = path.endsWith("/summary") ? { abandoned: 1, recovered: 0, lostValueCents: 10000, recoveredValueCents: 0, currency: "TRY", asOf: NOW } : path.includes(`/${ID}`) ? { ...emptyItem, items: [] , itemCount: 0 } : { items: [listItem] }; return Response.json(body); } });
  assert.equal((await client.getSummary()).abandoned, 1);
  assert.equal((await client.list({ status: "abandoned", sort: "highest", search: "Ada" })).items.length, 1);
  assert.equal((await client.get(ID)).id, ID);
  assert.deepEqual(calls.map(([path]) => String(path)), ["/api/orders/abandoned-carts/summary", "/api/orders/abandoned-carts?pageSize=20&status=abandoned&search=Ada&sort=highest", `/api/orders/abandoned-carts/${ID}`]);
  for (const [, init] of calls) { assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store"); }
});

test("mutations send only expectedVersion with one idempotency identity", async () => {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  const client = createAbandonedCartApiClient({ randomUUID: () => OPERATION, fetch: async (input, init) => { calls.push([input, init]); return Response.json({ id: ID, status: String(input).endsWith("archive") ? "archived" : "recovered", version: 4, updatedAt: NOW, replayed: false }); } });
  await client.markRecovered(ID, 3); await client.archive(ID, 3);
  assert.deepEqual(calls.map(([path]) => String(path)), [`/api/orders/abandoned-carts/${ID}/recovered`, `/api/orders/abandoned-carts/${ID}/archive`]);
  for (const [, init] of calls) { assert.equal(init?.method, "POST"); assert.deepEqual(init?.headers, { "content-type": "application/json", "idempotency-key": OPERATION }); assert.equal(init?.body, '{"expectedVersion":3}'); }
});

test("hostile responses and private browser authority fail closed", async () => {
  const client = createAbandonedCartApiClient({ fetch: async () => Response.json({ storeId: ID, items: [] }), randomUUID: () => OPERATION });
  await assert.rejects(() => client.list(), (error) => error instanceof AbandonedCartApiError && error.code === "unavailable");
  assert.throws(() => createAbandonedCartApiClient({ fetch: async () => Response.json({}), randomUUID: () => "bad", storeId: ID } as never), /abandoned_cart_client_invalid/);
});
