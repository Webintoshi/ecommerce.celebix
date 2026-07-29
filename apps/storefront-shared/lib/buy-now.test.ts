import assert from "node:assert/strict";
import test from "node:test";

import { requestBuyNow } from "./buy-now.ts";

const PRODUCT_ID = "b59c0f86-c7c7-4e39-b3a1-2c10cd734587";
const VARIANT_ID = "91c40139-3204-47ac-a81f-4f1d1e5bd1b2";

test("buy now captures one server-priced item through the exact same-origin cart route", async () => {
  const calls: Array<readonly [RequestInfo | URL, RequestInit | undefined]> = [];
  const result = await requestBuyNow({
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    signal: new AbortController().signal,
    fetcher: async (input, init) => {
      calls.push([input, init]);
      return Response.json({ status: "active", currency: "TRY", totalCents: 19_900, itemCount: 1, version: 1 });
    },
  });

  assert.deepEqual(result, { kind: "ready" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.[0], "/api/cart");
  assert.equal(calls[0]?.[1]?.method, "POST");
  assert.equal(calls[0]?.[1]?.credentials, "same-origin");
  assert.equal(calls[0]?.[1]?.cache, "no-store");
  assert.equal(new Headers(calls[0]?.[1]?.headers).get("content-type"), "application/json");
  assert.deepEqual(JSON.parse(String(calls[0]?.[1]?.body)), {
    customer: {},
    items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1 }],
  });
});

test("buy now fails closed on invalid identities, response shape, status, and transport", async () => {
  let calls = 0;
  assert.deepEqual(await requestBuyNow({
    productId: "invalid",
    variantId: VARIANT_ID,
    signal: new AbortController().signal,
    fetcher: async () => { calls += 1; return Response.json({}); },
  }), { kind: "failed" });
  assert.equal(calls, 0);

  for (const response of [
    Response.json({ status: "active", currency: "TRY", totalCents: 19_900, itemCount: 1, version: 1, detail: "private" }),
    Response.json({ status: "active", currency: "TRY", totalCents: 19_900, itemCount: 1, version: 1 }, { status: 409 }),
    Response.json({ code: "unavailable" }, { status: 503 }),
  ]) assert.deepEqual(await requestBuyNow({
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    signal: new AbortController().signal,
    fetcher: async () => response.clone(),
  }), { kind: "failed" });
});

test("buy now distinguishes an intentional abort", async () => {
  assert.deepEqual(await requestBuyNow({
    productId: PRODUCT_ID,
    variantId: VARIANT_ID,
    signal: new AbortController().signal,
    fetcher: async () => { throw new DOMException("Aborted", "AbortError"); },
  }), { kind: "aborted" });
});
