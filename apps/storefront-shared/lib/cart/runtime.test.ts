import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import type { PublicCart, PublicCheckoutReceipt } from "@celebix/saas-contracts";
import { StorefrontCommerceRepositoryError, type StorefrontCommerceRepository } from "@celebix/saas-data";

import { createStorefrontCredential, createStorefrontOperationCredential, parseStorefrontCommerceCredentialKeyring, readStorefrontCredentialCookie } from "./credential.ts";
import { createStorefrontCommerceRuntime } from "./runtime.ts";

const HOST = "shop.example.test";
const PRODUCT = "10000000-0000-4000-8000-000000000001";
const VARIANT = "20000000-0000-4000-8000-000000000001";
const OPERATION = "30000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-31T12:00:00.000Z");
const EMPTY: PublicCart = Object.freeze({ version: 0, currency: "TRY", itemCount: 0, subtotalCents: 0, shippingCents: 0, totalCents: 0, checkoutReady: false, checkoutBlocker: "empty_cart", items: Object.freeze([]) });
const CART: PublicCart = Object.freeze({ version: 1, currency: "TRY", itemCount: 1, subtotalCents: 100, shippingCents: 0, totalCents: 100, checkoutReady: true, checkoutBlocker: null, items: Object.freeze([Object.freeze({ productId: PRODUCT, variantId: VARIANT, slug: "urun-bir", title: "Ürün", variantTitle: "Standart", quantity: 1, unitPriceCents: 100, lineTotalCents: 100, available: true })]) });
const HOSTED = Object.freeze({ kind: "hosted_card" as const, id: "40000000-0000-4000-8000-000000000001", label: "Kartla ödeme", instructions: "Güvenli ödeme ekranında tamamlayın.", providerCode: "iyzico_iframe" as const, presentation: "iframe" as const, requiredCustomerFields: Object.freeze(["identity_number" as const]) });
const BANK = Object.freeze({ kind: "bank_transfer" as const, label: "Banka havalesi", instructions: "Sipariş numaranızı açıklamaya yazın.", bankName: "Celebix Bank", accountHolder: "Güzide", iban: "TR330006100519786457841326" });
const RECEIPT: PublicCheckoutReceipt = Object.freeze({ orderReference: "CBX-2026-000001", currency: "TRY", subtotalCents: 100, shippingCents: 0, totalCents: 100, paymentStatus: "pending", paymentMethod: Object.freeze({ kind: "bank_transfer", label: "Banka havalesi", instructions: "Sipariş numaranızı açıklamaya yazın.", bankName: "Celebix Bank", accountHolder: "Güzide", iban: "TR330006100519786457841326" }), delivery: Object.freeze({ recipientName: "Güzide Elif", addressLine1: "Bağdat Caddesi 10", city: "İstanbul", district: "Kadıköy", country: "TR" }), items: CART.items, createdAt: NOW.toISOString() });
const PERSISTED_CREATED = Object.freeze({ receipt: true as const, customer: true, receiptKeyId: "current_01", customerKeyId: "current_01" });
const PERSISTED_REUSED = Object.freeze({ receipt: true as const, customer: false, receiptKeyId: "current_01", customerKeyId: "current_01" });
const KEY_A = Buffer.alloc(32, 7).toString("base64url");
const KEY_B = Buffer.alloc(32, 8).toString("base64url");
const keyringSource = (activeKeyId: "current_01" | "previous_01") => ({ CELEBIX_DEPLOYMENT_TIER: "staging", CELEBIX_STOREFRONT_COMMERCE_CREDENTIALS_MODE: "approved_staging", CELEBIX_STOREFRONT_COMMERCE_ACTIVE_KEY_ID: activeKeyId, CELEBIX_STOREFRONT_COMMERCE_KEYS: JSON.stringify([{ keyId: "current_01", key: KEY_A }, { keyId: "previous_01", key: KEY_B }]) });
const keyring = parseStorefrontCommerceCredentialKeyring(keyringSource("current_01"));

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
function runtime(repository: StorefrontCommerceRepository, selectedKeyring = keyring, hostedPaymentAvailable?: () => Promise<boolean>) {
  let uuidIndex = 0;
  const uuids = ["40000000-0000-4000-8000-000000000001", "40000000-0000-4000-8000-000000000002", "40000000-0000-4000-8000-000000000003", "40000000-0000-4000-8000-000000000004", "40000000-0000-4000-8000-000000000005", "40000000-0000-4000-8000-000000000006", "40000000-0000-4000-8000-000000000007"];
  return createStorefrontCommerceRuntime({ repository, keyring: selectedKeyring, now: () => new Date(NOW), randomBytes: (size) => new Uint8Array(size).fill(9), randomUuid: () => uuids[uuidIndex++] ?? randomUUID(), ...(hostedPaymentAvailable ? { hostedPaymentAvailable } : {}) });
}

test("quote exposes hosted card only while approved execution is available", async () => {
  const onlyHosted = fake({ quote: async () => ({ cart: CART, paymentMethods: [HOSTED] }) });
  assert.deepEqual(await runtime(onlyHosted, keyring, async () => true).quote(HOST, `__Host-celebix_cart=${createStorefrontCredential("cart", keyring, (size) => new Uint8Array(size).fill(4)).value}`, "cart"), { cart: CART, paymentMethods: [HOSTED] });
  const unavailable = await runtime(onlyHosted, keyring, async () => false).quote(HOST, `__Host-celebix_cart=${createStorefrontCredential("cart", keyring, (size) => new Uint8Array(size).fill(4)).value}`, "cart");
  assert.deepEqual(unavailable.paymentMethods, []);
  assert.equal(unavailable.cart.checkoutReady, false);
  assert.equal(unavailable.cart.checkoutBlocker, "payment_unavailable");
  const offlineFallback = await runtime(fake({ quote: async () => ({ cart: CART, paymentMethods: [HOSTED, BANK] }) }), keyring, async () => false).quote(HOST, `__Host-celebix_cart=${createStorefrontCredential("cart", keyring, (size) => new Uint8Array(size).fill(4)).value}`, "cart");
  assert.deepEqual(offlineFallback, { cart: CART, paymentMethods: [BANK] });
});

test("missing cart resolves canonical empty without database access", async () => {
  let calls = 0;
  assert.deepEqual(await runtime(fake({ resolveCart: async () => { calls += 1; return CART; } })).resolveCart(HOST, null), { cart: EMPTY });
  assert.equal(calls, 0);
});

test("invalid retired and expired cart credentials resolve empty and expire locally", async () => {
  const selected=runtime(fake({resolveCart:async()=>{throw new StorefrontCommerceRepositoryError("cart_expired");}}));
  const invalid=await selected.resolveCart(HOST,"__Host-celebix_cart=invalid");
  assert.deepEqual(invalid,{cart:EMPTY,setCookie:"__Host-celebix_cart=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"});
  const expired=await selected.resolveCart(HOST,"__Host-celebix_cart=c1.current_01.CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk");
  assert.deepEqual(expired,{cart:EMPTY,setCookie:"__Host-celebix_cart=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"});
});

test("first add persists only a digest and exposes raw credential only as a proven cookie", async () => {
  let observed: Parameters<StorefrontCommerceRepository["mutateCart"]>[0] | undefined;
  const selected = runtime(fake({ mutateCart: async (input) => { observed = input; return { credentialCreated: true, cart: CART }; } }));
  const result = await selected.mutateCart(HOST, null, { kind: "add", operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 });
  assert.deepEqual(result.cart, CART);
  assert.match(result.setCookie ?? "", /^__Host-celebix_cart=c1[.]current_01[.]/u);
  assert.equal(JSON.stringify(observed).includes("c1.current_01"), false);
  assert.equal(observed?.cart?.digest.length, 64);
  assert.deepEqual(observed?.customerCandidates, []);
});

test("cart mutation forwards only verified customer cookie digest candidates", async () => {
  let observed: Parameters<StorefrontCommerceRepository["mutateCart"]>[0] | undefined;
  const selected = runtime(fake({ mutateCart: async (input) => { observed = input; return { credentialCreated: true, cart: CART }; } }));
  const customer = createStorefrontCredential("customer", keyring, (size) => new Uint8Array(size).fill(5));
  const cookie = `__Host-celebix_customer=${customer.value}`;
  await selected.mutateCart(HOST, cookie, { kind: "add", operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 });
  assert.equal(observed?.customerCandidates.length, 1);
  assert.equal(observed?.customerCandidates[0]?.keyId, "current_01");
  assert.match(observed?.customerCandidates[0]?.digest ?? "", /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(observed).includes(customer.value), false);
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

test("receipt and account reads require their isolated HttpOnly credentials and persist only digests", async () => {
  const observations: unknown[] = [];
  const selected = runtime(fake({
    mutateCart: async () => ({ credentialCreated: true, cart: CART }),
    complete: async () => ({ receipt: RECEIPT, credentialPersistence: PERSISTED_CREATED }),
    getReceipt: async (input) => { observations.push(input); return RECEIPT; },
    listAccountOrders: async (input) => { observations.push(input); return [RECEIPT]; },
  }));
  const cart = await selected.mutateCart(HOST, null, { kind: "add", operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 });
  const completed = await selected.complete(HOST, cart.setCookie ?? null, { kind: "complete", operationId: OPERATION, cartVersion: 1, intentKind: "cart", contact: { name: "Güzide Elif", email: "info@example.com", phone: "+905551112233" }, shippingAddress: { addressLine1: "Bağdat Caddesi 10", city: "İstanbul", district: "Kadıköy", postalCode: "34710" }, shippingMethod: "standard", paymentKind: "bank_transfer" });
  const header = completed.setCookies.join("; ");
  assert.deepEqual(await selected.getReceipt(HOST, header), RECEIPT);
  assert.deepEqual(await selected.listAccountOrders(HOST, header, 20), [RECEIPT]);
  assert.equal(JSON.stringify(observations).includes("r1.current_01"), false);
  assert.equal(JSON.stringify(observations).includes("u1.current_01"), false);
  assert.equal(JSON.stringify(observations).match(/[a-f0-9]{64}/gu)?.length, 3);
});

test("checkout replay restores deterministic persisted credentials", async () => {
  const selected = runtime(fake({ mutateCart: async () => ({ credentialCreated: true, cart: CART }), complete: async () => ({ receipt: RECEIPT, credentialPersistence: PERSISTED_CREATED }) }));
  const cart = await selected.mutateCart(HOST, null, { kind: "add", operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 });
  const completed = await selected.complete(HOST, cart.setCookie ?? null, { kind: "complete", operationId: OPERATION, cartVersion: 1, intentKind: "cart", contact: { name: "Güzide Elif", email: "info@example.com", phone: "+905551112233" }, shippingAddress: { addressLine1: "Bağdat Caddesi 10", city: "İstanbul", district: "Kadıköy" }, shippingMethod: "standard", paymentKind: "bank_transfer" });
  assert.deepEqual(completed.receipt, RECEIPT);
  assert.equal(completed.setCookies.length, 2);
  assert.match(completed.setCookies.join(";"), /__Host-celebix_customer=u1[.]current_01/u);
  assert.match(completed.setCookies.join(";"), /__Host-celebix_receipt=r1[.]current_01/u);
});

test("checkout replay reproduces persisted cookies after the active key rotates", async () => {
  const rotated = parseStorefrontCommerceCredentialKeyring(keyringSource("previous_01"));
  let generatedKey = "";
  const selected = runtime(fake({
    mutateCart: async () => ({ credentialCreated: true, cart: CART }),
    complete: async (input) => {
      generatedKey = input.generated.receipt.keyId;
      return { receipt: RECEIPT, credentialPersistence: PERSISTED_CREATED };
    },
  }), rotated);
  const cart = await selected.mutateCart(HOST, null, { kind: "add", operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 });
  const completed = await selected.complete(HOST, cart.setCookie ?? null, { kind: "complete", operationId: OPERATION, cartVersion: 1, intentKind: "cart", contact: { name: "Güzide Elif", email: "info@example.com", phone: "+905551112233" }, shippingAddress: { addressLine1: "Bağdat Caddesi 10", city: "İstanbul", district: "Kadıköy" }, shippingMethod: "standard", paymentKind: "bank_transfer" });
  assert.equal(generatedKey, "previous_01");
  const expectedReceipt = createStorefrontOperationCredential("receipt", OPERATION, rotated, "current_01").value;
  const expectedCustomer = createStorefrontOperationCredential("customer", OPERATION, rotated, "current_01").value;
  assert.equal(completed.setCookies.some((value) => value.startsWith(`__Host-celebix_receipt=${expectedReceipt};`)), true);
  assert.equal(completed.setCookies.some((value) => value.startsWith(`__Host-celebix_customer=${expectedCustomer};`)), true);
});

test("a later checkout reuses the existing customer credential and rotates only the receipt", async () => {
  let observedCustomerCandidates = 0;
  const selected = runtime(fake({
    mutateCart: async () => ({ credentialCreated: true, cart: CART }),
    complete: async (input) => {
      observedCustomerCandidates = input.customerCandidates.length;
      return { receipt: RECEIPT, credentialPersistence: PERSISTED_REUSED };
    },
  }));
  const customerCookie = "__Host-celebix_customer=u1.current_01.CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk";
  const cart = await selected.mutateCart(HOST, null, { kind: "add", operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 });
  const completed = await selected.complete(HOST, `${cart.setCookie}; ${customerCookie}`, { kind: "complete", operationId: "30000000-0000-4000-8000-000000000002", cartVersion: 1, intentKind: "cart", contact: { name: "Güzide Elif", email: "info@example.com", phone: "+905551112233" }, shippingAddress: { addressLine1: "Bağdat Caddesi 10", city: "İstanbul", district: "Kadıköy" }, shippingMethod: "standard", paymentKind: "bank_transfer" });
  assert.equal(observedCustomerCandidates, 1);
  assert.equal(completed.setCookies.length, 1);
  assert.match(completed.setCookies[0] ?? "", /^__Host-celebix_receipt=/u);
});

test("an explicit add replaces an invalid or expired cart credential", async () => {
  let created = 0;
  const selected = runtime(fake({
    resolveCart: async () => { throw new StorefrontCommerceRepositoryError("cart_expired"); },
    mutateCart: async (input) => { created += Number(Boolean(input.cart)); return { credentialCreated: true, cart: CART }; },
  }));
  const malformed = await selected.mutateCart(HOST, "__Host-celebix_cart=invalid", { kind: "add", operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 });
  assert.match(malformed.setCookie ?? "", /^__Host-celebix_cart=c1[.]current_01[.]/u);
  const validButExpired = "__Host-celebix_cart=c1.current_01.CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk";
  const expired = await selected.mutateCart(HOST, validButExpired, { kind: "add", operationId: "30000000-0000-4000-8000-000000000002", productId: PRODUCT, variantId: VARIANT, quantity: 1 });
  assert.match(expired.setCookie ?? "", /^__Host-celebix_cart=c1[.]current_01[.]/u);
  assert.equal(created, 2);
});
