import assert from "node:assert/strict";
import test from "node:test";

import { createCartCaptureRoute } from "./runtime.ts";

const TOKEN = Buffer.alloc(32, 0x42).toString("base64url");
const CART_ID = "71000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "41000000-0000-4000-8000-000000000001";
const VARIANT_ID = "42000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-22T15:00:00.000Z");

function request(body: unknown, overrides: { url?: string; origin?: string | null; cookie?: string; headers?: Record<string, string> } = {}) {
  const headers = new Headers({ "content-type": "application/json", origin: overrides.origin ?? "https://pilot.saas-staging.celebix.site", ...(overrides.headers ?? {}) });
  if (overrides.origin === null) headers.delete("origin");
  if (overrides.cookie) headers.set("cookie", overrides.cookie);
  return new Request(overrides.url ?? "http://internal:3450/api/cart/capture", { method: "POST", headers, body: JSON.stringify(body) });
}

function body(overrides: Record<string, unknown> = {}) {
  return { customer: { name: "Ada Lovelace", email: "ada@example.test" }, items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 2 }], ...overrides };
}

function fixture() {
  const calls: unknown[] = [];
  const handler = createCartCaptureRoute({
    selectAuthority: () => ({ kind: "trusted", hostname: "pilot.saas-staging.celebix.site" }),
    resolveRuntime: async () => ({
      abandonedCarts: {
        capture: async (input: unknown) => {
          calls.push(input);
          return { id: CART_ID, status: "active", currency: "TRY", totalCents: 25_000, itemCount: 1, version: 1, updatedAt: NOW.toISOString() };
        },
      },
    }),
    randomBytes: (size) => Buffer.alloc(size, 0x42),
    randomUuid: () => CART_ID,
    now: () => NOW,
  });
  return { handler, calls };
}

test("rotates the opaque cart credential only after a persisted abandoned cart is recovered", async () => {
  const calls: unknown[] = [];
  let randomCalls = 0;
  const handler = createCartCaptureRoute({
    selectAuthority: () => ({ kind: "trusted", hostname: "pilot.saas-staging.celebix.site" }),
    resolveRuntime: async () => ({
      abandonedCarts: {
        capture: async (input: unknown) => {
          calls.push(input);
          return { id: CART_ID, status: "recovered", currency: "TRY", totalCents: 25_000, itemCount: 1, version: 2, updatedAt: NOW.toISOString() };
        },
      },
    }),
    randomBytes: (size) => { randomCalls += 1; return Buffer.alloc(size, 0x24); },
    randomUuid: () => CART_ID,
    now: () => NOW,
  });
  const response = await handler(request(body(), { cookie: `__Host-celebix_cart=${TOKEN}` }));
  assert.equal(response.status, 200);
  assert.equal(randomCalls, 1);
  assert.match(response.headers.get("set-cookie") ?? "", /^__Host-celebix_cart=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
  assert.equal((response.headers.get("set-cookie") ?? "").includes(TOKEN), false);
  assert.equal(JSON.stringify(calls[0]).includes(TOKEN), false);
});

test("captures through trusted host authority and emits only a safe response and secure cookie", async () => {
  const { handler, calls } = fixture();
  const response = await handler(request(body()));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "active", currency: "TRY", totalCents: 25_000, itemCount: 1, version: 1 });
  assert.match(response.headers.get("set-cookie") ?? "", /^__Host-celebix_cart=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(calls.length, 1);
  const capture = calls[0] as Record<string, unknown>;
  assert.equal(capture.hostname, "pilot.saas-staging.celebix.site");
  assert.equal(capture.cartId, CART_ID);
  assert.match(String(capture.credentialDigest), /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(capture, "storeId"), false);
  assert.equal(JSON.stringify(capture).includes(TOKEN), false);
});

test("an existing canonical cookie is reused without exposing or rewriting it", async () => {
  const { handler, calls } = fixture();
  const response = await handler(request(body(), { cookie: `__Host-celebix_cart=${TOKEN}` }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(JSON.stringify(calls[0]).includes(TOKEN), false);
});

test("wrong origin path query private headers and untrusted proxy authority fail before repository", async () => {
  for (const selected of [
    request(body(), { origin: null }),
    request(body(), { origin: "https://attacker.example" }),
    request(body(), { url: "http://internal:3450/api/cart/capture?storeId=evil" }),
    request(body(), { url: "http://internal:3450/api/cart/capture/child" }),
    request(body(), { headers: { authorization: "Bearer private" } }),
    request(body(), { headers: { "x-store-id": CART_ID } }),
  ]) {
    const { handler, calls } = fixture();
    const response = await handler(selected);
    assert.ok([400, 403].includes(response.status));
    assert.equal(calls.length, 0);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  const { calls } = fixture();
  const disabled = createCartCaptureRoute({
    selectAuthority: () => ({ kind: "disabled" }),
    resolveRuntime: async () => null,
    randomBytes: () => Buffer.alloc(32), randomUuid: () => CART_ID, now: () => NOW,
  });
  assert.equal((await disabled(request(body()))).status, 503);
  assert.equal(calls.length, 0);
});

test("body rejects browser authority prices labels media and malformed cardinality", async () => {
  for (const invalid of [
    body({ storeId: CART_ID }),
    body({ items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1, unitPriceCents: 1 }] }),
    body({ items: [{ productId: PRODUCT_ID, variantId: VARIANT_ID, quantity: 1, productName: "Forged" }] }),
    body({ items: [] }),
  ]) {
    const { handler, calls } = fixture();
    const response = await handler(request(invalid));
    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
  }
});
