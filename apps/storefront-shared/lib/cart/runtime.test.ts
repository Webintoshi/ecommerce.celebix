import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import {
  PROMOTION_CART_LINE_LIMIT_MESSAGE,
  parsePublicCheckoutQuoteV2,
  parsePublicCheckoutReceiptV2,
  type PublicCart,
  type PublicCheckoutReceipt,
} from "@celebix/saas-contracts";
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
const CART_V2 = Object.freeze({
  ...CART,
  lineDiscountCents: 0,
  shippingDiscountCents: 0,
  discountCents: 0,
  items: Object.freeze(CART.items.map((item) => Object.freeze({
    ...item,
    discountCents: 0,
    payableCents: item.lineTotalCents,
  }))),
});
const FEATURE_OFF_QUOTE_V2 = parsePublicCheckoutQuoteV2({
  cart: CART_V2,
  paymentMethods: [BANK],
  promotionStatus: { kind: "evaluated" },
  appliedPromotions: [],
  rejectedPromotions: [],
  gifts: [],
  progressMessages: [],
});
const LIMITED_LINES = Object.freeze(Array.from({ length: 21 }, (_, index) => {
  const suffix = String(index + 1).padStart(12, "0");
  return Object.freeze({
    ...CART_V2.items[0]!,
    productId: `10000000-0000-4000-8000-${suffix}`,
    variantId: `20000000-0000-4000-8000-${suffix}`,
    slug: `urun-${index + 1}`,
  });
}));
const LIMITED_QUOTE_V2 = parsePublicCheckoutQuoteV2({
  cart: {
    ...CART_V2,
    itemCount: 21,
    subtotalCents: 2_100,
    totalCents: 2_100,
    items: LIMITED_LINES,
  },
  paymentMethods: [BANK],
  promotionStatus: { kind: "not_evaluated", reason: "cart_line_limit" },
  appliedPromotions: [],
  rejectedPromotions: [],
  gifts: [],
  progressMessages: [PROMOTION_CART_LINE_LIMIT_MESSAGE],
});
const RECEIPT_V2 = parsePublicCheckoutReceiptV2({
  ...RECEIPT,
  lineDiscountCents: 0,
  shippingDiscountCents: 0,
  discountCents: 0,
  items: CART_V2.items,
  promotionStatus: { kind: "evaluated" },
  appliedPromotions: [],
  gifts: [],
});
const COMPLETE_REQUEST = Object.freeze({
  kind: "complete" as const,
  operationId: OPERATION,
  cartVersion: 1,
  intentKind: "cart" as const,
  contact: Object.freeze({
    name: "Güzide Elif",
    email: "info@example.com",
    phone: "+905551112233",
  }),
  shippingAddress: Object.freeze({
    addressLine1: "Bağdat Caddesi 10",
    city: "İstanbul",
    district: "Kadıköy",
  }),
  shippingMethod: "standard" as const,
  paymentKind: "bank_transfer" as const,
});
const PERSISTED_CREATED = Object.freeze({ receipt: true as const, customer: true, receiptKeyId: "current_01", customerKeyId: "current_01" });
const PERSISTED_REUSED = Object.freeze({ receipt: true as const, customer: false, receiptKeyId: "current_01", customerKeyId: "current_01" });
const KEY_A = Buffer.alloc(32, 7).toString("base64url");
const KEY_B = Buffer.alloc(32, 8).toString("base64url");
const keyringSource = (activeKeyId: "current_01" | "previous_01") => ({ CELEBIX_DEPLOYMENT_TIER: "staging", CELEBIX_STOREFRONT_COMMERCE_CREDENTIALS_MODE: "approved_staging", CELEBIX_STOREFRONT_COMMERCE_ACTIVE_KEY_ID: activeKeyId, CELEBIX_STOREFRONT_COMMERCE_KEYS: JSON.stringify([{ keyId: "current_01", key: KEY_A }, { keyId: "previous_01", key: KEY_B }]) });
const keyring = parseStorefrontCommerceCredentialKeyring(keyringSource("current_01"));

function fake(overrides: Partial<StorefrontCommerceRepository> = {}): StorefrontCommerceRepository {
  return {
    recordCartAttribution: async () => undefined,
    restoreCart: async () => ({ cart: CART, restoredItems: 1, omittedItems: 0, adjustedItems: 0 }),
    resolveCart: async () => CART,
    mutateCart: async () => ({ credentialCreated: false, cart: CART }),
    createBuyNow: async () => undefined,
    quote: async () => ({ cart: CART, paymentMethods: [] }),
    quoteV2: async () => { throw new Error("unused"); },
    complete: async () => { throw new Error("unused"); },
    completeV2: async () => { throw new Error("unused"); },
    getReceipt: async () => { throw new Error("unused"); },
    listAccountOrders: async () => [],
    ...overrides,
  };
}

test("recovery token is hashed before storage access and returns a fresh HttpOnly cart credential", async () => {
  let observed: Parameters<StorefrontCommerceRepository["restoreCart"]>[0] | undefined;
  const token = Buffer.alloc(32, 0x42).toString("base64url");
  const result = await runtime(fake({ restoreCart: async (input) => { observed = input; return { cart: CART, restoredItems: 1, omittedItems: 2, adjustedItems: 1 }; } })).restoreCart(HOST, token);
  assert.deepEqual(result.cart, CART);
  assert.deepEqual({ restoredItems: result.restoredItems, omittedItems: result.omittedItems, adjustedItems: result.adjustedItems }, { restoredItems: 1, omittedItems: 2, adjustedItems: 1 });
  assert.match(result.setCookie, /^__Host-celebix_cart=c1[.]current_01[.]/u);
  assert.match(observed?.tokenDigest ?? "", /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(observed).includes(token), false);
});
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

test("an absent promotion code field keeps the exact V1 quote repository method and shape", async () => {
  const cartCredential = createStorefrontCredential("cart", keyring, (size) => new Uint8Array(size).fill(4));
  const attribution = Object.freeze({
    firstTouch: Object.freeze({ source: "atlas-qa", medium: "test" }),
    lastTouch: Object.freeze({ source: "atlas-qa", medium: "test" }),
    landingPathGroup: "/cart",
    deviceGroup: "desktop" as const,
  });
  let observed: Parameters<StorefrontCommerceRepository["quote"]>[0] | undefined;
  let v2Calls = 0;
  const selected = runtime(fake({
    quote: async (input) => { observed = input; return { cart: CART, paymentMethods: [BANK] }; },
    quoteV2: async () => { v2Calls += 1; throw new Error("unexpected_v2"); },
  }));

  assert.deepEqual(
    await selected.quote(HOST, `__Host-celebix_cart=${cartCredential.value}`, "cart", attribution),
    { cart: CART, paymentMethods: [BANK] },
  );
  assert.deepEqual(observed, {
    hostname: HOST,
    now: NOW,
    intentKind: "cart",
    candidates: [{ keyId: cartCredential.keyId, digest: cartCredential.digest }],
    attribution,
  });
  assert.equal(v2Calls, 0);
  assert.equal(Object.hasOwn(observed ?? {}, "customerCandidates"), false);
  assert.equal(Object.hasOwn(observed ?? {}, "normalizedCodes"), false);
});

test("an explicitly present code set uses quoteV2 and keeps strict feature-off and line-limit projections public", async () => {
  const cartCredential = createStorefrontCredential("cart", keyring, (size) => new Uint8Array(size).fill(4));
  const customerCredential = createStorefrontCredential("customer", keyring, (size) => new Uint8Array(size).fill(5));
  const cookie = `__Host-celebix_cart=${cartCredential.value}; __Host-celebix_customer=${customerCredential.value}`;
  const observed: Parameters<StorefrontCommerceRepository["quoteV2"]>[0][] = [];
  let v1Calls = 0;
  const projections = [FEATURE_OFF_QUOTE_V2, LIMITED_QUOTE_V2];
  const selected = runtime(fake({
    quote: async () => { v1Calls += 1; throw new Error("unexpected_v1"); },
    quoteV2: async (input) => ({
      quote: projections[observed.push(input) - 1]!,
      authorityDigest: "a".repeat(64),
    }),
  }));

  const featureOff = await selected.quote(HOST, cookie, "cart", undefined, ["VIP", "YUZDE10"]);
  const limited = await selected.quote(HOST, cookie, "cart", undefined, []);

  assert.deepEqual(featureOff, FEATURE_OFF_QUOTE_V2);
  assert.deepEqual(limited, LIMITED_QUOTE_V2);
  assert.equal(limited.promotionStatus.kind, "not_evaluated");
  assert.equal(Object.hasOwn(featureOff, "authorityDigest"), false);
  assert.equal(v1Calls, 0);
  assert.deepEqual(observed, [
    {
      hostname: HOST,
      now: NOW,
      intentKind: "cart",
      candidates: [{ keyId: cartCredential.keyId, digest: cartCredential.digest }],
      customerCandidates: [{ keyId: customerCredential.keyId, digest: customerCredential.digest }],
      normalizedCodes: ["VIP", "YUZDE10"],
    },
    {
      hostname: HOST,
      now: NOW,
      intentKind: "cart",
      candidates: [{ keyId: cartCredential.keyId, digest: cartCredential.digest }],
      customerCandidates: [{ keyId: customerCredential.keyId, digest: customerCredential.digest }],
      normalizedCodes: [],
    },
  ]);
});

test("runtime rejects malformed V2 code sets before either quote repository method", async () => {
  const cartCredential = createStorefrontCredential("cart", keyring, (size) => new Uint8Array(size).fill(4));
  let calls = 0;
  const selected = runtime(fake({
    quote: async () => { calls += 1; throw new Error("unexpected_v1"); },
    quoteV2: async () => { calls += 1; throw new Error("unexpected_v2"); },
  }));
  for (const codes of [["VIP", "VIP"], ["vip"], ["BIR", "IKI", "UC", "DORT", "BES", "ALTI"]]) {
    await assert.rejects(
      selected.quote(HOST, `__Host-celebix_cart=${cartCredential.value}`, "cart", undefined, codes),
      (error: unknown) => error instanceof Error && error.message === "invalid_input",
    );
  }
  assert.equal(calls, 0);
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

test("cart attribution is recorded with digest authority and failure remains cart fail-open", async () => {
  const observed: unknown[] = [];
  const attribution = { firstTouch: { source: "atlas-qa", medium: "test", campaign: "cart-recovery" }, lastTouch: { source: "atlas-qa", medium: "test", campaign: "cart-recovery" }, landingPathGroup: "/products/ring", deviceGroup: "mobile" as const };
  const selected = runtime(fake({
    mutateCart: async () => ({ credentialCreated: true, cart: CART }),
    recordCartAttribution: async (input) => { observed.push(input); throw new Error("analytics unavailable"); },
  }));
  const result = await selected.mutateCart(HOST, null, { kind: "add", operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1, attribution });
  assert.deepEqual(result.cart, CART);
  assert.equal(observed.length, 1);
  assert.deepEqual((observed[0] as { attribution: unknown }).attribution, attribution);
  assert.match(String((observed[0] as { candidates: Array<{ digest: string }> }).candidates[0]?.digest), /^[a-f0-9]{64}$/u);
  assert.doesNotMatch(JSON.stringify(observed), /c1[.]current_01/);
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

test("an absent promotion code field keeps the exact V1 complete repository method and generated shape", async () => {
  const cartCredential = createStorefrontCredential("cart", keyring, (size) => new Uint8Array(size).fill(4));
  let observed: Parameters<StorefrontCommerceRepository["complete"]>[0] | undefined;
  let v2Calls = 0;
  const selected = runtime(fake({
    complete: async (input) => { observed = input; return { receipt: RECEIPT, credentialPersistence: PERSISTED_CREATED }; },
    completeV2: async () => { v2Calls += 1; throw new Error("unexpected_v2"); },
  }));

  await selected.complete(HOST, `__Host-celebix_cart=${cartCredential.value}`, COMPLETE_REQUEST);

  assert.equal(v2Calls, 0);
  assert.deepEqual(Object.keys(observed ?? {}), [
    "hostname", "now", "intentKind", "candidates", "customerCandidates",
    "operationId", "cartVersion", "delivery", "paymentKind", "generated",
  ]);
  assert.deepEqual(observed?.generated, {
    orderId: "40000000-0000-4000-8000-000000000003",
    customerId: "40000000-0000-4000-8000-000000000004",
    addressId: "40000000-0000-4000-8000-000000000005",
    eventId: "40000000-0000-4000-8000-000000000006",
    receipt: {
      id: "40000000-0000-4000-8000-000000000001",
      keyId: "current_01",
      digest: createStorefrontOperationCredential("receipt", OPERATION, keyring).digest,
      expiresAt: new Date("2026-07-31T12:15:00.000Z"),
    },
    customer: {
      id: "40000000-0000-4000-8000-000000000002",
      keyId: "current_01",
      digest: createStorefrontOperationCredential("customer", OPERATION, keyring).digest,
      expiresAt: new Date("2026-08-30T12:00:00.000Z"),
    },
  });
  assert.equal(Object.hasOwn(observed ?? {}, "normalizedCodes"), false);
});

test("present promotion codes select one atomic completeV2 call with deterministic identities", async () => {
  const cartCredential = createStorefrontCredential("cart", keyring, (size) => new Uint8Array(size).fill(4));
  const customerCredential = createStorefrontCredential("customer", keyring, (size) => new Uint8Array(size).fill(5));
  const cookie = `__Host-celebix_cart=${cartCredential.value}; __Host-celebix_customer=${customerCredential.value}`;
  const observed: Parameters<StorefrontCommerceRepository["completeV2"]>[0][] = [];
  let v1Calls = 0;
  let randomUuidCalls = 0;
  const selected = createStorefrontCommerceRuntime({
    repository: fake({
      complete: async () => { v1Calls += 1; throw new Error("unexpected_v1"); },
      completeV2: async (input) => {
        observed.push(input);
        return { receipt: RECEIPT_V2, credentialPersistence: PERSISTED_CREATED };
      },
    }),
    keyring,
    now: () => new Date(NOW),
    randomBytes: (size) => new Uint8Array(size).fill(9),
    randomUuid: () => {
      randomUuidCalls += 1;
      return randomUUID();
    },
  });
  const request = Object.freeze({
    ...COMPLETE_REQUEST,
    normalizedCodes: Object.freeze(["VIP", "YUZDE10"]),
  });

  const first = await selected.complete(HOST, cookie, request);
  const replay = await selected.complete(HOST, cookie, request);

  assert.deepEqual(first.receipt, RECEIPT_V2);
  assert.deepEqual(replay, first);
  assert.equal(first.setCookies.length, 2);
  assert.equal(v1Calls, 0);
  assert.equal(randomUuidCalls, 0);
  assert.equal(observed.length, 2);
  assert.deepEqual(observed[0], observed[1]);
  assert.deepEqual(observed[0], {
    hostname: HOST,
    now: NOW,
    intentKind: "cart",
    candidates: [{ keyId: cartCredential.keyId, digest: cartCredential.digest }],
    customerCandidates: [{ keyId: customerCredential.keyId, digest: customerCredential.digest }],
    operationId: OPERATION,
    cartVersion: 1,
    delivery: {
      contact: { firstName: "Güzide", lastName: "Elif", email: "info@example.com", phone: "+905551112233" },
      shippingAddress: { line1: "Bağdat Caddesi 10", city: "İstanbul", district: "Kadıköy", country: "TR" },
    },
    paymentKind: "bank_transfer",
    generated: {
      orderId: "3dd0b454-8d13-4250-af49-a6eb8f0e0d29",
      customerId: "d7b031de-5b37-4b7c-93cd-3cf8c5c9a540",
      addressId: "6bc211eb-16b1-4ec2-bf4f-1be4e24701a3",
      eventId: "37e53065-3726-40a9-8daa-9a455f3925ef",
      receipt: {
        id: "3602853c-7f09-484c-96c2-45dbf8742c09",
        keyId: "current_01",
        digest: createStorefrontOperationCredential("receipt", OPERATION, keyring).digest,
        expiresAt: new Date("2026-07-31T12:15:00.000Z"),
      },
      customer: {
        id: "65d64116-9ebe-4370-9e4a-88dfc28bff6d",
        keyId: "current_01",
        digest: createStorefrontOperationCredential("customer", OPERATION, keyring).digest,
        expiresAt: new Date("2026-08-30T12:00:00.000Z"),
      },
    },
    normalizedCodes: ["VIP", "YUZDE10"],
  });
  assert.doesNotMatch(JSON.stringify(observed), /authorityDigest|subtotalCents|totalCents|storeId/u);
});

test("runtime rejects malformed completeV2 code sets before either completion method", async () => {
  const cartCredential = createStorefrontCredential("cart", keyring, (size) => new Uint8Array(size).fill(4));
  let calls = 0;
  const selected = runtime(fake({
    complete: async () => { calls += 1; throw new Error("unexpected_v1"); },
    completeV2: async () => { calls += 1; throw new Error("unexpected_v2"); },
  }));
  await assert.rejects(
    selected.complete(HOST, `__Host-celebix_cart=${cartCredential.value}`, {
      ...COMPLETE_REQUEST,
      normalizedCodes: ["VIP", "VIP"],
    }),
    (error: unknown) => error instanceof Error && error.message === "invalid_input",
  );
  assert.equal(calls, 0);
});

test("receipt and mixed-version account reads require their isolated HttpOnly credentials and persist only digests", async () => {
  const observations: unknown[] = [];
  const selected = runtime(fake({
    mutateCart: async () => ({ credentialCreated: true, cart: CART }),
    complete: async () => ({ receipt: RECEIPT, credentialPersistence: PERSISTED_CREATED }),
    getReceipt: async (input) => { observations.push(input); return RECEIPT_V2; },
    listAccountOrders: async (input) => { observations.push(input); return [RECEIPT, RECEIPT_V2]; },
  }));
  const cart = await selected.mutateCart(HOST, null, { kind: "add", operationId: OPERATION, productId: PRODUCT, variantId: VARIANT, quantity: 1 });
  const completed = await selected.complete(HOST, cart.setCookie ?? null, { kind: "complete", operationId: OPERATION, cartVersion: 1, intentKind: "cart", contact: { name: "Güzide Elif", email: "info@example.com", phone: "+905551112233" }, shippingAddress: { addressLine1: "Bağdat Caddesi 10", city: "İstanbul", district: "Kadıköy", postalCode: "34710" }, shippingMethod: "standard", paymentKind: "bank_transfer" });
  const header = completed.setCookies.join("; ");
  assert.deepEqual(await selected.getReceipt(HOST, header), RECEIPT_V2);
  assert.deepEqual(await selected.listAccountOrders(HOST, header, 20), [RECEIPT, RECEIPT_V2]);
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
