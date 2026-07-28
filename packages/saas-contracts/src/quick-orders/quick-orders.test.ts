import assert from "node:assert/strict";
import test from "node:test";

import {
  QUICK_ORDER_EXPIRY_HOURS,
  QUICK_ORDER_LINK_STATUSES,
  QUICK_ORDER_MAX_COMPONENT_CENTS,
  QUICK_ORDER_MAX_TOTAL_CENTS,
  QUICK_ORDER_MAX_UNIT_PRICE_CENTS,
  parseCheckoutState,
  parseQuickOrderCreateIntent,
  parseQuickOrderLinkDetail,
  parseQuickOrderLinkListItem,
  parseQuickOrderLinkMutationResult,
  parseQuickOrderMerchantUrl,
  parseQuickOrderPublicQuote,
} from "./index.ts";

const LINK_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "33333333-3333-4333-8333-333333333333";
const CREATED_AT = "2026-07-21T08:00:00.000Z";
const OPENED_AT = "2026-07-21T08:10:00.000100Z";
const PAID_AT = "2026-07-21T08:20:00.000Z";
const UPDATED_AT = "2026-07-21T08:30:00.000Z";
const EXPIRES_AT = "2026-07-22T08:00:00.000Z";
const MAX_LINE_TOTAL_CENTS = QUICK_ORDER_MAX_UNIT_PRICE_CENTS * 9_999;
const MAX_SUBTOTAL_CENTS = MAX_LINE_TOTAL_CENTS * 100;

function address(overrides: Record<string, unknown> = {}) {
  return {
    recipientName: "Ada Lovelace",
    phone: "+905551112233",
    line1: "Ada Sokak 1",
    line2: "Kat 2",
    district: "Kadikoy",
    city: "Istanbul",
    postalCode: "34710",
    country: "TR",
    ...overrides,
  };
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    position: 0,
    productName: "Atlas Mug",
    variantName: "Black",
    sku: "ATLAS-MUG-BLK",
    imageUrl: "https://cdn.example.test/products/atlas-mug.png",
    unitPriceCents: 12_000,
    quantity: 2,
    lineTotalCents: 24_000,
    ...overrides,
  };
}

function listItem(overrides: Record<string, unknown> = {}) {
  return {
    id: LINK_ID,
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    firstProductName: "Atlas Mug",
    itemCount: 1,
    status: "opened",
    currency: "TRY",
    totalCents: 23_500,
    expiresAt: EXPIRES_AT,
    createdAt: CREATED_AT,
    version: 2,
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    ...listItem(),
    customerPhone: "+905551112233",
    shippingAddress: address(),
    billingAddress: address({ line1: "Farkli Sokak 2" }),
    customerNote: "Please call on arrival",
    internalLabel: "VIP",
    providerKey: "paytr",
    subtotalCents: 24_000,
    shippingCents: 1_000,
    discountCents: 1_500,
    items: [item()],
    openedAt: OPENED_AT,
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function createIntent(overrides: Record<string, unknown> = {}) {
  return {
    items: [{ variantId: ITEM_ID, quantity: 2 }],
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    customerPhone: "+905551112233",
    shippingAddress: address(),
    billingAddress: address({ line1: "Farkli Sokak 2" }),
    customerNote: "Please call on arrival",
    internalLabel: "VIP",
    shippingCents: 1_000,
    discountCents: 1_500,
    expiryHours: 24,
    ...overrides,
  };
}

function publicQuote(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    status: "opened",
    merchantName: "Atlas Store",
    currency: "TRY",
    subtotalCents: 24_000,
    shippingCents: 1_000,
    discountCents: 1_500,
    totalCents: 23_500,
    expiresAt: EXPIRES_AT,
    items: [{
      productName: "Atlas Mug",
      variantName: "Black",
      imageUrl: "https://cdn.example.test/products/atlas-mug.png",
      unitPriceCents: 12_000,
      quantity: 2,
      lineTotalCents: 24_000,
    }],
    ...overrides,
  };
}

test("exports the exact immutable quick-order registries and parses a deeply frozen detail", () => {
  const input = detail();
  const parsed = parseQuickOrderLinkDetail(input);

  assert.deepEqual(QUICK_ORDER_LINK_STATUSES, ["active", "opened", "paid", "cancelled", "expired"]);
  assert.deepEqual(QUICK_ORDER_EXPIRY_HOURS, [4, 12, 24, 48, 72]);
  assert.equal(Object.isFrozen(QUICK_ORDER_LINK_STATUSES), true);
  assert.equal(Object.isFrozen(QUICK_ORDER_EXPIRY_HOURS), true);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.items), true);
  assert.equal(Object.isFrozen(parsed.items[0]), true);
  assert.equal(Object.isFrozen(parsed.shippingAddress), true);
  assert.equal(Object.isFrozen(parsed.billingAddress), true);
  assert.equal(parsed.subtotalCents, parsed.items.reduce((sum, entry) => sum + entry.lineTotalCents, 0));
  assert.equal(parsed.totalCents, parsed.subtotalCents + parsed.shippingCents - parsed.discountCents);
  assert.deepEqual(input, detail());
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(input.items), false);
});

test("copies immutable valid list and mutation projections", () => {
  const list = parseQuickOrderLinkListItem(listItem());
  const mutation = parseQuickOrderLinkMutationResult({
    id: LINK_ID,
    status: "cancelled",
    version: 3,
    expiresAt: EXPIRES_AT,
    updatedAt: UPDATED_AT,
    replayed: false,
  });
  assert.deepEqual(list, listItem());
  assert.equal(Object.isFrozen(list), true);
  assert.equal(Object.isFrozen(mutation), true);

  assert.equal(parseQuickOrderLinkListItem(listItem({ version: Number.MAX_SAFE_INTEGER })).version, Number.MAX_SAFE_INTEGER);
  assert.equal(parseQuickOrderLinkMutationResult({
    id: LINK_ID,
    status: "cancelled",
    version: Number.MAX_SAFE_INTEGER,
    expiresAt: EXPIRES_AT,
    updatedAt: UPDATED_AT,
    replayed: false,
  }).version, Number.MAX_SAFE_INTEGER);
  for (const version of [Number.MAX_SAFE_INTEGER + 1, "9223372036854775807"]) {
    assert.throws(() => parseQuickOrderLinkListItem(listItem({ version })), /quick_order_contract_invalid/);
    assert.throws(() => parseQuickOrderLinkMutationResult({
      id: LINK_ID,
      status: "cancelled",
      version,
      expiresAt: EXPIRES_AT,
      updatedAt: UPDATED_AT,
      replayed: false,
    }), /quick_order_contract_invalid/);
  }
});

test("accepts only the exact configured expiry intervals", () => {
  const expiresAtByHours: Readonly<Record<number, string>> = {
    4: "2026-07-21T12:00:00.000Z",
    12: "2026-07-21T20:00:00.000Z",
    24: EXPIRES_AT,
    48: "2026-07-23T08:00:00.000Z",
    72: "2026-07-24T08:00:00.000Z",
  };

  for (const hours of QUICK_ORDER_EXPIRY_HOURS) {
    assert.equal(parseQuickOrderLinkDetail(detail({ expiresAt: expiresAtByHours[hours] })).expiresAt, expiresAtByHours[hours]);
  }
  assert.throws(() => parseQuickOrderLinkDetail(detail({ expiresAt: "2026-07-21T13:00:00.000Z" })), /quick_order_contract_invalid/);
});

test("preserves exact six-digit expiry precision across ordinary and far-future dates", () => {
  const ordinaryCreatedAt = "2026-07-21T23:59:59.123456Z";
  const ordinaryExpiresAt = "2026-07-22T03:59:59.123456Z";
  const farFutureCreatedAt = "9999-01-01T00:00:00.000001Z";
  const farFutureExpiresAt = "9999-01-01T04:00:00.000001Z";
  const fixture = (createdAt: string, expiresAt: string) => detail({ createdAt, expiresAt, openedAt: createdAt, updatedAt: expiresAt });

  assert.equal(parseQuickOrderLinkDetail(fixture(ordinaryCreatedAt, ordinaryExpiresAt)).expiresAt, ordinaryExpiresAt);
  assert.equal(parseQuickOrderLinkDetail(fixture(farFutureCreatedAt, farFutureExpiresAt)).expiresAt, farFutureExpiresAt);
  assert.throws(() => parseQuickOrderLinkDetail(fixture(ordinaryCreatedAt, "2026-07-22T03:59:59.123455Z")), /quick_order_contract_invalid/);
  assert.throws(() => parseQuickOrderLinkDetail(fixture(ordinaryCreatedAt, "2026-07-22T03:59:59.123457Z")), /quick_order_contract_invalid/);
  assert.throws(() => parseQuickOrderLinkDetail(fixture(farFutureCreatedAt, "9999-01-01T04:00:00.000000Z")), /quick_order_contract_invalid/);
  assert.throws(() => parseQuickOrderLinkDetail(fixture(farFutureCreatedAt, "9999-01-01T04:00:00.000002Z")), /quick_order_contract_invalid/);
});

test("accepts the exact quantity and subtotal upper bounds", () => {
  const maximumItem = item({
    unitPriceCents: QUICK_ORDER_MAX_UNIT_PRICE_CENTS,
    quantity: 9_999,
    lineTotalCents: MAX_LINE_TOTAL_CENTS,
  });
  const quantityBoundary = parseQuickOrderLinkDetail(detail({
    items: [maximumItem],
    subtotalCents: MAX_LINE_TOTAL_CENTS,
    shippingCents: 0,
    discountCents: 0,
    totalCents: MAX_LINE_TOTAL_CENTS,
  }));
  const maximumItems = Array.from({ length: 100 }, (_, position) => item({
    id: `22222222-2222-4222-8222-${String(position).padStart(12, "0")}`,
    position,
    unitPriceCents: QUICK_ORDER_MAX_UNIT_PRICE_CENTS,
    quantity: 9_999,
    lineTotalCents: MAX_LINE_TOTAL_CENTS,
  }));
  const subtotalBoundary = parseQuickOrderLinkDetail(detail({
    items: maximumItems,
    itemCount: 100,
    subtotalCents: MAX_SUBTOTAL_CENTS,
    shippingCents: 0,
    discountCents: 0,
    totalCents: MAX_SUBTOTAL_CENTS,
  }));

  assert.equal(quantityBoundary.items[0].quantity, 9_999);
  assert.equal(subtotalBoundary.subtotalCents, 7_999_200_000_000_000);
  assert.ok(subtotalBoundary.subtotalCents > QUICK_ORDER_MAX_COMPONENT_CENTS);
});

test("parses canonical paid lifecycle values", () => {
  const parsed = parseQuickOrderLinkDetail(detail({
    status: "paid",
    paidAt: PAID_AT,
    orderId: ORDER_ID,
  }));
  assert.equal(parsed.paidAt, PAID_AT);
  assert.equal(parsed.orderId, ORDER_ID);
});

test("preserves opened history when an opened link is cancelled or expires", () => {
  const cancelled = parseQuickOrderLinkDetail(detail({
    status: "cancelled",
    cancelledAt: UPDATED_AT,
  }));
  const expired = parseQuickOrderLinkDetail(detail({ status: "expired" }));
  assert.equal(cancelled.openedAt, OPENED_AT);
  assert.equal(cancelled.cancelledAt, UPDATED_AT);
  assert.equal(expired.openedAt, OPENED_AT);
});

test("rejects forbidden keys and malformed object boundaries without mutating inputs", () => {
  const inherited = Object.create(detail()) as Record<string, unknown>;
  let getterCalled = false;
  const getter = detail();
  Object.defineProperty(getter, "providerKey", {
    enumerable: true,
    get() {
      getterCalled = true;
      throw new Error("hostile");
    },
  });
  const proxy = new Proxy(detail(), { ownKeys() { throw new Error("hostile"); } });
  const cases: readonly [string, unknown][] = [
    ["unknown root key", detail({ unexpected: true })],
    ["missing root key", (() => { const value: Record<string, unknown> = { ...detail() }; delete value.providerKey; return value; })()],
    ["inherited object", inherited],
    ["array root", []],
    ["hostile getter", getter],
    ["hostile proxy", proxy],
    ["array address", detail({ shippingAddress: [] })],
    ["array item", detail({ items: [[]] })],
    ["token", detail({ token: "secret" })],
    ["token digest", detail({ tokenDigest: "digest" })],
    ["sealed token", detail({ sealedToken: "sealed" })],
    ["token key id", detail({ tokenKeyId: "key" })],
    ["store authority", detail({ storeId: LINK_ID })],
    ["membership authority", detail({ membershipId: LINK_ID })],
    ["principal authority", detail({ principalId: LINK_ID })],
  ];

  for (const [name, value] of cases) {
    assert.throws(() => parseQuickOrderLinkDetail(value), /quick_order_contract_invalid/, name);
  }
  assert.equal(getterCalled, false);
});

test("rejects untrusted item arrays without calling attacker properties or freezing inputs", () => {
  let mapCalled = false;
  let indexGetterCalled = false;
  const maliciousMap = [item()];
  Object.defineProperty(maliciousMap, "map", {
    value() {
      mapCalled = true;
      return [{ token: "secret" }];
    },
  });
  const accessorIndex = [item()];
  Object.defineProperty(accessorIndex, "0", {
    enumerable: true,
    get() {
      indexGetterCalled = true;
      return item();
    },
  });
  const sparse = new Array(1);
  const extraKey = [item()] as Array<unknown> & { unexpected?: boolean };
  extraKey.unexpected = true;
  const hostileProxy = new Proxy([item()], { ownKeys() { throw new Error("hostile"); } });
  const cases: readonly [string, unknown[]][] = [
    ["malicious map", maliciousMap],
    ["accessor index", accessorIndex],
    ["sparse", sparse],
    ["extra key", extraKey],
    ["hostile proxy", hostileProxy],
  ];

  for (const [name, items] of cases) {
    assert.throws(() => parseQuickOrderLinkDetail(detail({ items })), /quick_order_contract_invalid/, name);
    assert.equal(Object.isFrozen(items), false, name);
  }
  assert.equal(mapCalled, false);
  assert.equal(indexGetterCalled, false);
  assert.deepEqual(maliciousMap[0], item());
});

test("rejects noncanonical identifiers, text, e-mail, currency, provider, timestamps, and URLs", () => {
  const cases: readonly [string, Record<string, unknown>][] = [
    ["uuid", { id: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }],
    ["control", { customerName: "Ada\nLovelace" }],
    ["whitespace e-mail", { customerEmail: " ada@example.com" }],
    ["invalid e-mail", { customerEmail: "ada@example" }],
    ["currency", { currency: "try" }],
    ["provider", { providerKey: "stripe" }],
    ["timestamp", { updatedAt: "2026-07-21T08:30:00Z" }],
    ["noncanonical timestamp", { updatedAt: "2026-07-21T24:30:00.000Z" }],
    ["noncanonical URL", { items: [item({ imageUrl: "https://CDN.example.test/products/atlas-mug.png" })] }],
    ["insecure URL", { items: [item({ imageUrl: "http://cdn.example.test/products/atlas-mug.png" })] }],
  ];

  for (const [name, overrides] of cases) {
    assert.throws(() => parseQuickOrderLinkDetail(detail(overrides)), /quick_order_contract_invalid/, name);
  }
});

test("rejects invalid item cardinality, quantities, money, positions, and arithmetic", () => {
  const cases: readonly [string, Record<string, unknown>][] = [
    ["zero items", { items: [] }],
    ["101 items", { items: Array.from({ length: 101 }, (_, position) => item({ id: `22222222-2222-4222-8222-${String(position).padStart(12, "0")}`, position })), itemCount: 101 }],
    ["zero quantity", { items: [item({ quantity: 0 })] }],
    ["quantity too large", { items: [item({ quantity: 10_000 })] }],
    ["unit price too large", { items: [item({ unitPriceCents: QUICK_ORDER_MAX_UNIT_PRICE_CENTS + 1 })] }],
    ["line total too large", { items: [item({ lineTotalCents: QUICK_ORDER_MAX_COMPONENT_CENTS + 1 })] }],
    ["total too large", { totalCents: QUICK_ORDER_MAX_TOTAL_CENTS + 1 }],
    ["item arithmetic", { items: [item({ lineTotalCents: 1 })] }],
    ["subtotal arithmetic", { subtotalCents: 1 }],
    ["total arithmetic", { totalCents: 1 }],
    ["position", { items: [item({ position: 1 })] }],
  ];

  for (const [name, overrides] of cases) {
    assert.throws(() => parseQuickOrderLinkDetail(detail(overrides)), /quick_order_contract_invalid/, name);
  }
});

test("rejects every lifecycle timestamp and status mismatch", () => {
  const cases: readonly [string, Record<string, unknown>][] = [
    ["active has opened timestamp", { status: "active", openedAt: OPENED_AT }],
    ["opened lacks opened timestamp", { status: "opened", openedAt: undefined }],
    ["opened has paid timestamp", { status: "opened", paidAt: PAID_AT }],
    ["paid lacks paid timestamp", { status: "paid", paidAt: undefined, orderId: ORDER_ID }],
    ["paid lacks order", { status: "paid", paidAt: PAID_AT }],
    ["paid lacks opened timestamp", { status: "paid", openedAt: undefined, paidAt: PAID_AT, orderId: ORDER_ID }],
    ["cancelled lacks cancellation timestamp", { status: "cancelled", openedAt: undefined, cancelledAt: undefined }],
    ["timestamps out of order", { status: "paid", openedAt: PAID_AT, paidAt: OPENED_AT, orderId: ORDER_ID }],
  ];

  for (const [name, overrides] of cases) {
    assert.throws(() => parseQuickOrderLinkDetail(detail(overrides)), /quick_order_contract_invalid/, name);
  }
});

test("quick order create intent copies and deeply freezes canonical merchant input", () => {
  const input = createIntent();
  const parsed = parseQuickOrderCreateIntent(input);

  assert.deepEqual(parsed, input);
  assert.notEqual(parsed, input);
  assert.notEqual(parsed.items, input.items);
  assert.notEqual(parsed.shippingAddress, input.shippingAddress);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.items), true);
  assert.equal(Object.isFrozen(parsed.items[0]), true);
  assert.equal(Object.isFrozen(parsed.shippingAddress), true);
  assert.equal(Object.isFrozen(parsed.billingAddress), true);
  assert.equal(Object.isFrozen(input), false);
});

test("hosted quick order intent accepts only a payment method id with real buyer identity and explicit item types", () => {
  const hosted = createIntent({
    paymentMethodId: "44444444-4444-4444-8444-444444444444",
    identityNumber: "74300864791",
    items: [{ variantId: ITEM_ID, quantity: 2, itemType: "PHYSICAL" }],
  });
  const parsed = parseQuickOrderCreateIntent(hosted);

  assert.deepEqual(parsed, hosted);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.items[0]), true);
  for (const identityNumber of ["12345678901", "11111111111", "7430086479A", " 74300864791"]) {
    assert.throws(
      () => parseQuickOrderCreateIntent({ ...hosted, identityNumber }),
      /quick_order_contract_invalid/,
    );
  }
  for (const itemType of [undefined, "physical", "SERVICE"]) {
    assert.throws(
      () => parseQuickOrderCreateIntent({
        ...hosted,
        items: [{ variantId: ITEM_ID, quantity: 2, itemType }],
      }),
      /quick_order_contract_invalid/,
    );
  }
});

test("hosted quick order public projections never accept buyer identity or payment authority", () => {
  for (const secret of [
    { identityNumber: "74300864791" },
    { identityDigest: "a".repeat(64) },
    { sealedIdentity: { ciphertext: "secret" } },
    { paymentMethodId: "44444444-4444-4444-8444-444444444444" },
  ]) {
    assert.throws(
      () => parseQuickOrderLinkDetail({ ...detail({ providerKey: "iyzico_iframe" }), ...secret }),
      /quick_order_contract_invalid/,
    );
  }
  assert.equal(parseQuickOrderLinkDetail(detail({ providerKey: "iyzico_iframe" })).providerKey, "iyzico_iframe");
  assert.equal(parseQuickOrderLinkDetail(detail({
    providerKey: "iyzico_iframe",
    items: [item({ itemType: "PHYSICAL" })],
  })).items[0]?.itemType, "PHYSICAL");
  assert.throws(
    () => parseQuickOrderLinkDetail(detail({ items: [item({ itemType: "SERVICE" })] })),
    /quick_order_contract_invalid/,
  );
});

test("quick order create intent accepts only omitted optional merchant text", () => {
  const { customerNote: _note, internalLabel: _label, ...required } = createIntent();
  assert.deepEqual(parseQuickOrderCreateIntent(required), required);
  for (const overrides of [{ customerNote: undefined }, { internalLabel: "" }, { customerNote: " note" }]) {
    assert.throws(() => parseQuickOrderCreateIntent(createIntent(overrides)), /quick_order_contract_invalid/);
  }
});

test("quick order create intent requires exact own root keys and an ordinary object", () => {
  const missing = createIntent();
  delete (missing as Record<string, unknown>).customerPhone;
  const inherited = Object.create(createIntent()) as Record<string, unknown>;
  for (const value of [createIntent({ unexpected: true }), missing, inherited, [], Object.create(null, {
    ...Object.getOwnPropertyDescriptors(createIntent()),
    hidden: { value: true, enumerable: false },
  })]) {
    assert.throws(() => parseQuickOrderCreateIntent(value), /quick_order_contract_invalid/);
  }
});

test("quick order create intent never invokes hostile root or nested properties", () => {
  let rootGetterCalled = false;
  const rootGetter = createIntent();
  Object.defineProperty(rootGetter, "customerName", {
    enumerable: true,
    get() {
      rootGetterCalled = true;
      throw new Error("hostile");
    },
  });
  let addressGetterCalled = false;
  const hostileAddress = address();
  Object.defineProperty(hostileAddress, "city", {
    enumerable: true,
    get() {
      addressGetterCalled = true;
      throw new Error("hostile");
    },
  });
  for (const value of [
    rootGetter,
    createIntent({ shippingAddress: hostileAddress }),
    new Proxy(createIntent(), { ownKeys() { throw new Error("hostile"); } }),
    createIntent({ billingAddress: new Proxy(address(), { getOwnPropertyDescriptor() { throw new Error("hostile"); } }) }),
  ]) {
    assert.throws(() => parseQuickOrderCreateIntent(value), /quick_order_contract_invalid/);
  }
  assert.equal(rootGetterCalled, false);
  assert.equal(addressGetterCalled, false);
});

test("quick order create intent descriptor-copies dense item arrays without mutation", () => {
  const input = createIntent();
  const maliciousMap = [{ variantId: ITEM_ID, quantity: 2 }];
  Object.defineProperty(maliciousMap, "map", { value() { throw new Error("hostile"); } });
  const accessor = [{ variantId: ITEM_ID, quantity: 2 }];
  let getterCalled = false;
  Object.defineProperty(accessor, "0", { enumerable: true, get() { getterCalled = true; return {}; } });
  const sparse = new Array(1);
  const extra = [{ variantId: ITEM_ID, quantity: 2 }] as unknown[] & { token?: string };
  extra.token = "secret";
  for (const items of [maliciousMap, accessor, sparse, extra, new Proxy([{}], { ownKeys() { throw new Error("hostile"); } })]) {
    assert.throws(() => parseQuickOrderCreateIntent(createIntent({ items })), /quick_order_contract_invalid/);
    assert.equal(Object.isFrozen(items), false);
  }
  assert.deepEqual(input, createIntent());
  assert.equal(getterCalled, false);
});

test("quick order create intent rejects noncanonical UUID email and required phone", () => {
  const cases = [
    { items: [{ variantId: "ABCDEFAB-CDEF-4ABC-8ABC-ABCDEFABCDEF", quantity: 2 }] },
    { customerEmail: "Ada@Example.com" },
    { customerEmail: " ada@example.com" },
    { customerEmail: "ada@example" },
    { customerPhone: "" },
    { customerPhone: " +905551112233" },
    { customerPhone: "+90555\n1112233" },
  ];
  for (const overrides of cases) {
    assert.throws(() => parseQuickOrderCreateIntent(createIntent(overrides)), /quick_order_contract_invalid/);
  }
});

test("quick order create intent rejects malformed addresses and private authority", () => {
  for (const overrides of [
    { shippingAddress: address({ country: "tr" }) },
    { billingAddress: address({ phone: "" }) },
    { shippingAddress: address({ unexpected: true }) },
    { shippingAddress: [] },
    { storeId: LINK_ID },
    { providerConfigId: LINK_ID },
    { currency: "TRY" },
    { tokenDigest: "a".repeat(64) },
  ]) {
    assert.throws(() => parseQuickOrderCreateIntent(createIntent(overrides)), /quick_order_contract_invalid/);
  }
});

test("quick order create intent enforces item money and expiry boundaries", () => {
  for (const overrides of [
    { items: [] },
    { items: Array.from({ length: 101 }, () => ({ variantId: ITEM_ID, quantity: 1 })) },
    { items: [{ variantId: ITEM_ID, quantity: 0 }] },
    { items: [{ variantId: ITEM_ID, quantity: 10_000 }] },
    { shippingCents: -1 },
    { discountCents: QUICK_ORDER_MAX_COMPONENT_CENTS + 1 },
    { expiryHours: 6 },
  ]) {
    assert.throws(() => parseQuickOrderCreateIntent(createIntent(overrides)), /quick_order_contract_invalid/);
  }
});

test("quick order public quote copies and deeply freezes the exact safe projection", () => {
  const input = publicQuote();
  const parsed = parseQuickOrderPublicQuote(input);
  assert.deepEqual(parsed, input);
  assert.notEqual(parsed, input);
  assert.notEqual(parsed.items, input.items);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.items), true);
  assert.equal(Object.isFrozen(parsed.items[0]), true);
  assert.equal(Object.isFrozen(input), false);
});

test("quick order public quote requires exact own keys and rejects private material", () => {
  const missing = publicQuote();
  delete (missing as Record<string, unknown>).merchantName;
  const inherited = Object.create(publicQuote()) as Record<string, unknown>;
  for (const value of [
    missing,
    inherited,
    [],
    publicQuote({ storeId: LINK_ID }),
    publicQuote({ linkId: LINK_ID }),
    publicQuote({ customerEmail: "ada@example.com" }),
    publicQuote({ token: "secret" }),
    publicQuote({ tokenDigest: "a".repeat(64) }),
    publicQuote({ sealedToken: {} }),
    publicQuote({ providerConfig: {} }),
  ]) {
    assert.throws(() => parseQuickOrderPublicQuote(value), /quick_order_contract_invalid/);
  }
});

test("quick order public quote rejects hostile and malformed item arrays without access", () => {
  const items = publicQuote().items;
  const accessor = [...items];
  let getterCalled = false;
  Object.defineProperty(accessor, "0", { enumerable: true, get() { getterCalled = true; return {}; } });
  const extra = [...items] as unknown[] & { digest?: string };
  extra.digest = "secret";
  for (const value of [accessor, extra, new Array(1), new Proxy([...items], { ownKeys() { throw new Error("hostile"); } })]) {
    assert.throws(() => parseQuickOrderPublicQuote(publicQuote({ items: value })), /quick_order_contract_invalid/);
    assert.equal(Object.isFrozen(value), false);
  }
  assert.equal(getterCalled, false);
});

test("quick order public quote accepts only canonical text status TRY timestamps and URLs", () => {
  for (const overrides of [
    { schemaVersion: 2 },
    { status: "paid" },
    { merchantName: " Atlas Store" },
    { currency: "USD" },
    { expiresAt: "2026-07-22T08:00:00Z" },
    { expiresAt: "2026-07-22T24:00:00.000Z" },
    { items: [{ ...publicQuote().items[0], productName: "Atlas\nMug" }] },
    { items: [{ ...publicQuote().items[0], imageUrl: "http://cdn.example.test/a.png" }] },
    { items: [{ ...publicQuote().items[0], imageUrl: "https://CDN.example.test/a.png" }] },
  ]) {
    assert.throws(() => parseQuickOrderPublicQuote(publicQuote(overrides)), /quick_order_contract_invalid/);
  }
});

test("quick order public quote enforces dense cardinality and exact safe money arithmetic", () => {
  for (const overrides of [
    { items: [] },
    { items: Array.from({ length: 101 }, () => publicQuote().items[0]) },
    { items: [{ ...publicQuote().items[0], quantity: 0 }] },
    { items: [{ ...publicQuote().items[0], lineTotalCents: 1 }] },
    { subtotalCents: 1 },
    { shippingCents: -1 },
    { discountCents: 30_000 },
    { totalCents: 1 },
    { totalCents: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    assert.throws(() => parseQuickOrderPublicQuote(publicQuote(overrides)), /quick_order_contract_invalid/);
  }
});

test("quick order public quote allows only active or opened and omits all recipient PII", () => {
  assert.equal(parseQuickOrderPublicQuote(publicQuote({ status: "active" })).status, "active");
  assert.equal(parseQuickOrderPublicQuote(publicQuote({ status: "opened" })).status, "opened");
  for (const key of ["customerName", "customerPhone", "shippingAddress", "billingAddress", "internalLabel"]) {
    assert.throws(() => parseQuickOrderPublicQuote(publicQuote({ [key]: "private" })), /quick_order_contract_invalid/);
  }
});

test("quick order merchant URL copies a canonical token-bearing HTTPS URL", () => {
  const token = "QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE";
  const input = {
    url: `https://atlas.example.test/odeme/hizli/${token}`,
    expiresAt: EXPIRES_AT,
  };
  const bufferDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Buffer");
  assert.equal(Reflect.deleteProperty(globalThis, "Buffer"), true);
  let parsed;
  try {
    parsed = parseQuickOrderMerchantUrl(input);
    for (const tail of "AEIMQUYcgkosw048") {
      const canonicalToken = `${token.slice(0, -1)}${tail}`;
      assert.equal(
        parseQuickOrderMerchantUrl({ ...input, url: `https://atlas.example.test/odeme/hizli/${canonicalToken}` }).url,
        `https://atlas.example.test/odeme/hizli/${canonicalToken}`,
      );
    }
  } finally {
    if (bufferDescriptor !== undefined) Object.defineProperty(globalThis, "Buffer", bufferDescriptor);
  }
  assert.deepEqual(parsed, input);
  assert.notEqual(parsed, input);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(input), false);
});

test("quick order merchant URL rejects noncanonical locations and private side fields", () => {
  const token = "QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE";
  const valid = `https://atlas.example.test/odeme/hizli/${token}`;
  for (const value of [
    { url: valid },
    { url: valid, expiresAt: EXPIRES_AT, linkId: LINK_ID },
    { url: `http://atlas.example.test/odeme/hizli/${token}`, expiresAt: EXPIRES_AT },
    { url: `https://ATLAS.example.test/odeme/hizli/${token}`, expiresAt: EXPIRES_AT },
    { url: `${valid}?token=x`, expiresAt: EXPIRES_AT },
    { url: `${valid}?`, expiresAt: EXPIRES_AT },
    { url: `${valid}#`, expiresAt: EXPIRES_AT },
    { url: `https://atlas.example.test:443/odeme/hizli/${token}`, expiresAt: EXPIRES_AT },
    { url: `https://user@atlas.example.test/odeme/hizli/${token}`, expiresAt: EXPIRES_AT },
    { url: `https://atlas.example.test/odeme/hizli/${token}=`, expiresAt: EXPIRES_AT },
  ]) {
    assert.throws(() => parseQuickOrderMerchantUrl(value), /quick_order_contract_invalid/);
  }
});

test("quick order checkout state parses and freezes every finite safe variant", () => {
  const fixtures = [
    { kind: "ready", quote: publicQuote() },
    { kind: "processing" },
    { kind: "paid", orderNumber: "CBX-2026-000001" },
    { kind: "failed" },
    { kind: "unavailable" },
  ];
  for (const fixture of fixtures) {
    const parsed = parseCheckoutState(fixture);
    assert.deepEqual(parsed, fixture);
    assert.equal(Object.isFrozen(parsed), true);
    if (parsed.kind === "ready") assert.equal(Object.isFrozen(parsed.quote.items), true);
  }
});

test("quick order checkout state rejects unknown extra hostile and private variants", () => {
  let getterCalled = false;
  const getter = { kind: "paid", orderNumber: "CBX-1" };
  Object.defineProperty(getter, "orderNumber", { enumerable: true, get() { getterCalled = true; throw new Error("hostile"); } });
  for (const value of [
    {},
    [],
    { kind: "complete" },
    { kind: "processing", quote: publicQuote() },
    { kind: "paid" },
    { kind: "paid", orderNumber: " CBX-1" },
    { kind: "failed", storeId: LINK_ID },
    { kind: "ready", quote: publicQuote({ tokenDigest: "a".repeat(64) }) },
    getter,
    new Proxy({ kind: "failed" }, { ownKeys() { throw new Error("hostile"); } }),
  ]) {
    assert.throws(() => parseCheckoutState(value), /quick_order_contract_invalid/);
  }
  assert.equal(getterCalled, false);
});
