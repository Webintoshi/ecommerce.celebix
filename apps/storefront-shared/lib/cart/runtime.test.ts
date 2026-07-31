import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { PublicCart } from "@celebix/saas-contracts";
import type { StorefrontCommerceRepository } from "@celebix/saas-data";

import { parseStorefrontCommerceCredentialKeyring, readStorefrontCredentialCookie } from "./credential.ts";
import { createStorefrontCommerceRuntime } from "./runtime.ts";

const HOST = "shop.example.test";
const PRODUCT = "10000000-0000-4000-8000-000000000001";
const VARIANT = "20000000-0000-4000-8000-000000000001";
const OPERATION = "30000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-31T12:00:00.000Z");
const EMPTY: PublicCart = Object.freeze({ version: 0, currency: "TRY", itemCount: 0, subtotalCents: 0, shippingCents: 0, totalCents: 0, checkoutReady: false, items: Object.freeze([]) });
const CART: PublicCart = Object.freeze({ version: 1, currency: "TRY", itemCount: 1, subtotalCents: 100, shippingCents: 0, totalCents: 100, checkoutReady: true, items: Object.freeze([Object.freeze({ productId: PRODUCT, variantId: VARIANT, slug: "urun-bir", title: "Ürün", variantTitle: "Standart", quantity: 1, unitPriceCents: 100, lineTotalCents: 100, available: true })]) });
const keyring = parseStorefrontCommerceCredentialKeyring({ CELEBIX_DEPLOYMENT_TIER: "staging", CELEBIX_STOREFRONT_COMMERCE_CREDENTIALS_MODE: "approved_staging", CELEBIX_STOREFRONT_COMMERCE_ACTIVE_KEY_ID: "current_01", CELEBIX_STOREFRONT_COMMERCE_KEYS: JSON.stringify([{ keyId: "current_01", key: Buffer.alloc(32, 7).toString("base64url") }]) });

function fake(overrides: Partial<StorefrontCommerceRepository> = {}): StorefrontCommerceRepository {
  return {
    resolveCart: async () => CART,
    mutateCart: async () => ({ credentialCreated: false, cart: CART }),
    createBuyNow: async () => undefined,
    quote: async () => ({ cart: CART, paymentMethods: [] }),
    complete: async () => { throw new Error("unused"); },
    getReceipt: async () => { throw new Error("unused"); },
    listAccountOrders: async () => [],
    ...overrides,
  };
}
function runtime(repository: StorefrontCommerceRepository) {
  let uuidIndex = 0;
  const uuids = ["40000000-0000-4000-8000-000000000001", "40000000-0000-4000-8000-000000000002", "40000000-0000-4000-8000-000000000003", "40000000-0000-4000-8000-000000000004", "40000000-0000-4000-8000-000000000005", "40000000-0000-4000-8000-000000000006", "40000000-0000-4000-8000-000000000007"];
  return createStorefrontCommerceRuntime({ repository, keyring, now: () => new Date(NOW), randomBytes: (size) => new Uint8Array(size).fill(9), randomUuid: () => uuids[uuidIndex++] ?? randomUUID() });
}

test("missing cart resolves canonical empty without database access", async () => {
  let calls = 0;
  assert.deepEqual(await runtime(fake({ resolveCart: async () => { calls += 1; return CART; } })).resolveCart(HOST, null), EMPTY);
  assert.equal(calls, 0);
});

test("first add persists only a digest and exposes raw credential only as a proven cookie", async () => {
  let observed: Parameters<StorefrontCommerceRepository["mutateCart"]>[0] | undefined;
  const selected = runtime(fake({ mutateCart: async (input) => { observed = input; return { credentialCreated: true, cart: CART }; } }));
  const result = await selected.mutateCart(HOST, null, { kind: "add", operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 });
  assert.deepEqual(result.cart, CART);
  assert.match(result.setCookie ?? "", /^__Host-celebix_cart=c1[.]current_01[.]/u);
  assert.equal(JSON.stringify(observed).includes("c1.current_01"), false);
  assert.equal(observed?.cart?.digest.length, 64);
});

test("repository failure never emits a cart or checkout credential", async () => {
  const selected = runtime(fake({ mutateCart: async () => { throw new Error("database"); } }));
  await assert.rejects(selected.mutateCart(HOST, null, { kind: "add", operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 }));
});

test("buy now persists a purpose-isolated intent and returns only the fixed destination", async () => {
  let seen = "";
  const selected = runtime(fake({ createBuyNow: async (input) => { seen = input.intent.digest; } }));
  const result = await selected.mutateCart(HOST, null, { kind: "buy_now", operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 });
  assert.equal(result.destination, "/checkout?intent=buy-now");
  assert.match(result.setCookie ?? "", /^__Host-celebix_checkout_intent=i1[.]current_01[.]/u);
  assert.match(seen, /^[a-f0-9]{64}$/u);
  assert.equal(readStorefrontCredentialCookie("cart", result.setCookie ?? "").kind, "missing");
});
