import assert from "node:assert/strict";
import test from "node:test";

import {
  QUICK_ORDER_EXPIRY_HOURS,
  QUICK_ORDER_LINK_STATUSES,
  QUICK_ORDER_MAX_COMPONENT_CENTS,
  QUICK_ORDER_MAX_TOTAL_CENTS,
  QUICK_ORDER_MAX_UNIT_PRICE_CENTS,
  parseQuickOrderLinkDetail,
  parseQuickOrderLinkListItem,
  parseQuickOrderLinkMutationResult,
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
