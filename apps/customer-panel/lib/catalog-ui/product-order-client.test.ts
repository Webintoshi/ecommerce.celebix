import assert from "node:assert/strict";
import test from "node:test";

import { createProductOrderClient, moveProductOrder, ProductOrderError } from "./product-order-client.ts";

const CATEGORY = "11111111-1111-4111-8111-111111111111";
const FIRST = "22222222-2222-4222-8222-222222222222";
const SECOND = "33333333-3333-4333-8333-333333333333";
const OPERATION = "44444444-4444-4444-8444-444444444444";
const items = [
  { productId: FIRST, title: "İlk ürün", slug: "ilk-urun", status: "active", storefrontPosition: null },
  { productId: SECOND, title: "İkinci ürün", slug: "ikinci-urun", status: "draft", storefrontPosition: null },
];

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("category order reads all members and saves their exact new order with revision and idempotency", async () => {
  const calls: Array<[string, RequestInit]> = [];
  const client = createProductOrderClient(async (path, init) => {
    calls.push([String(path), init ?? {}]);
    return response({ categoryId: CATEGORY, version: calls.length === 1 ? 0 : 1, items: calls.length === 1 ? items : [...items].reverse(), ...(calls.length === 1 ? {} : { replayed: false }) });
  }, () => OPERATION);
  const original = await client.get(CATEGORY);
  assert.equal(original.version, 0);
  assert.deepEqual(original.items.map((item) => item.productId), [FIRST, SECOND]);
  const saved = await client.save(CATEGORY, original.version, [SECOND, FIRST]);
  assert.equal(saved.version, 1);
  assert.deepEqual(saved.items.map((item) => item.productId), [SECOND, FIRST]);
  assert.equal(calls[0]?.[0], `/api/catalog/onboarding/categories/${CATEGORY}/product-order`);
  assert.equal(calls[0]?.[1].credentials, "same-origin");
  assert.equal(calls[0]?.[1].cache, "no-store");
  assert.equal(calls[1]?.[1].method, "POST");
  assert.deepEqual(calls[1]?.[1].headers, { "content-type": "application/json", "idempotency-key": OPERATION });
  assert.deepEqual(JSON.parse(String(calls[1]?.[1].body)), { expectedVersion: 0, orderedProductIds: [SECOND, FIRST] });
});

test("stale category revisions surface a recoverable conflict and duplicates never leave the client", async () => {
  let requests = 0;
  const client = createProductOrderClient(async () => { requests++; return response({ code: "version_conflict" }, 409); }, () => OPERATION);
  await assert.rejects(() => client.save(CATEGORY, 0, [FIRST, FIRST]), /category_order_invalid_input/);
  assert.equal(requests, 0);
  await assert.rejects(() => client.save(CATEGORY, 0, [FIRST, SECOND]), (error: unknown) => {
    assert.ok(error instanceof ProductOrderError);
    assert.equal(error.status, 409);
    assert.match(error.message, /Güncel sırayı yükleyin/);
    return true;
  });
});

test("moving the fifth item to first retains every other category member", () => {
  const original = ["a", "b", "c", "d", "e"];
  assert.deepEqual(moveProductOrder(original, 4, 0), ["e", "a", "b", "c", "d"]);
  assert.deepEqual(original, ["a", "b", "c", "d", "e"]);
});
