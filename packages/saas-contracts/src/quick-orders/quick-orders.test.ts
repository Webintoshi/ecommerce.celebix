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
  const getter = Object.defineProperty({}, "id", { enumerable: true, get() { throw new Error("hostile"); } });
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
    ["quantity too large", { items: [item({ quantity: 1_000 })] }],
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
