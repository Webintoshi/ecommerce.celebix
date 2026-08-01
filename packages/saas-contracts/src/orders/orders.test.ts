import assert from "node:assert/strict";
import test from "node:test";

import {
  ORDER_DRAFT_STATUSES,
  ORDER_PAYMENT_STATUSES,
  ORDER_SOURCES,
  ORDER_STATUSES,
  ORDER_SORTS,
  parseOrderDraftConversionResult,
  parseOrderDraftDetail,
  parseOrderDraftListItem,
  parseOrderDraftSaveIntent,
  parseOrderDashboardSummary,
  parseOrderDetail,
  parseOrderListItem,
  parseOrderNeighbors,
} from "./index.ts";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";
const NOTE_ID = "44444444-4444-4444-8444-444444444444";
const PREVIOUS_ORDER_ID = "55555555-5555-4555-8555-555555555555";
const NEXT_ORDER_ID = "66666666-6666-4666-8666-666666666666";
const CREATED_AT = "2026-07-21T08:00:00.000Z";
const UPDATED_AT = "2026-07-21T09:00:00.000Z";
const DRAFT_ID = "77777777-7777-4777-8777-777777777777";
const LINE_ID = "88888888-8888-4888-8888-888888888888";
const PRODUCT_ID = "99999999-9999-4999-8999-999999999999";
const VARIANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CUSTOMER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function listItem(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    orderNumber: "HMN-1001",
    source: "storefront",
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    currency: "TRY",
    totalCents: 12_500,
    status: "confirmed",
    paymentStatus: "completed",
    itemCount: 1,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    version: 2,
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    ...listItem(),
    customerPhone: "+905551112233",
    subtotalCents: 12_000,
    shippingCents: 1_000,
    discountCents: 500,
    shippingAddress: {
      recipientName: "Ada Lovelace",
      line1: "Ada Sokak 1",
      line2: "Kat 2",
      district: "Kadikoy",
      city: "Istanbul",
      postalCode: "34710",
      country: "TR",
    },
    tracking: {
      carrier: "HemenKargo",
      trackingNumber: "HMN-TRACK-1001",
      trackingUrl: "https://tracking.example.com/HMN-TRACK-1001",
      shippedAt: UPDATED_AT,
    },
    items: [{
      id: ITEM_ID,
      position: 0,
      productName: "Atlas Mug",
      variantName: "Black",
      sku: "ATLAS-MUG-BLK",
      unitPriceCents: 12_000,
      quantity: 1,
      discountCents: 500,
      lineTotalCents: 11_500,
    }],
    events: [{
      id: EVENT_ID,
      type: "status_changed",
      message: "Order confirmed",
      createdAt: UPDATED_AT,
    }],
    notes: [{
      id: NOTE_ID,
      body: "Pack with care",
      createdAt: UPDATED_AT,
      updatedAt: UPDATED_AT,
    }],
    ...overrides,
  };
}

function draftListItem(overrides: Record<string, unknown> = {}) {
  return {
    id: DRAFT_ID,
    draftNumber: "TSL-777777777777",
    status: "draft",
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    currency: "TRY",
    totalCents: 23_500,
    lineCount: 1,
    adjustInventory: true,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    version: 2,
    ...overrides,
  };
}

function draftDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...draftListItem(),
    customerId: CUSTOMER_ID,
    customerPhone: "+905551112233",
    subtotalCents: 23_000,
    shippingCents: 1_000,
    discountCents: 500,
    shippingAddress: {
      recipientName: "Ada Lovelace",
      line1: "Ada Sokak 1",
      district: "Kadikoy",
      city: "Istanbul",
      postalCode: "34710",
      country: "TR",
    },
    billingAddress: {
      recipientName: "Ada Lovelace",
      line1: "Ada Sokak 1",
      line2: "Kat 2",
      district: "Kadikoy",
      city: "Istanbul",
      postalCode: "34710",
      country: "TR",
    },
    note: "Hediye paketi",
    lines: [{
      lineId: LINE_ID,
      position: 0,
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      productName: "Atlas Kolye",
      variantName: "Altın",
      sku: "ATL-KOL-ALT",
      unitPriceCents: 12_000,
      quantity: 2,
      discountCents: 1_000,
      lineTotalCents: 23_000,
    }],
    ...overrides,
  };
}

function draftSaveIntent(overrides: Record<string, unknown> = {}) {
  return {
    customerId: CUSTOMER_ID,
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    customerPhone: "+905551112233",
    currency: "TRY",
    shippingCents: 1_000,
    discountCents: 500,
    shippingAddress: draftDetail().shippingAddress,
    billingAddress: draftDetail().billingAddress,
    note: "Hediye paketi",
    adjustInventory: true,
    lines: [{
      lineId: LINE_ID,
      productId: PRODUCT_ID,
      variantId: VARIANT_ID,
      quantity: 2,
      discountCents: 1_000,
    }],
    expectedVersion: 2,
    ...overrides,
  };
}

test("parses a valid order list item", () => {
  assert.deepEqual(parseOrderListItem(listItem()), listItem());
});

test("parses a valid order detail", () => {
  assert.deepEqual(parseOrderDetail(detail()), detail());
});

test("parses valid nested order items, events, and notes", () => {
  const parsed = parseOrderDetail(detail());
  assert.deepEqual(parsed.items, detail().items);
  assert.deepEqual(parsed.events, detail().events);
  assert.deepEqual(parsed.notes, detail().notes);
});

test("deeply freezes every parsed order value", () => {
  const list = parseOrderListItem(listItem());
  const parsed = parseOrderDetail(detail());
  const summary = parseOrderDashboardSummary({
    totalOrders: 7,
    pendingOrders: 2,
    fulfilledOrders: 3,
    revenueCents: 12_500,
    currency: "TRY",
    asOf: UPDATED_AT,
  });
  for (const value of [
    list,
    parsed,
    parsed.shippingAddress,
    parsed.tracking!,
    parsed.items,
    parsed.items[0],
    parsed.events,
    parsed.events[0],
    parsed.notes,
    parsed.notes[0],
    summary,
    ORDER_STATUSES,
    ORDER_PAYMENT_STATUSES,
    ORDER_SOURCES,
    ORDER_SORTS,
  ]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.deepEqual(ORDER_SORTS, ["newest", "oldest", "highest", "lowest"]);
});

test("rejects unknown order keys", () => {
  assert.throws(() => parseOrderListItem(listItem({ unexpected: true })), /order_contract_invalid/);
});

test("rejects invalid order statuses", () => {
  assert.throws(() => parseOrderListItem(listItem({ status: "unknown" })), /order_contract_invalid/);
  assert.throws(() => parseOrderListItem(listItem({ paymentStatus: "unknown" })), /order_contract_invalid/);
});

test("rejects invalid currencies", () => {
  assert.throws(() => parseOrderListItem(listItem({ currency: "try" })), /order_contract_invalid/);
});

test("rejects negative and unsafe order money", () => {
  assert.throws(() => parseOrderListItem(listItem({ totalCents: -1 })), /order_contract_invalid/);
  assert.throws(() => parseOrderDetail(detail({ subtotalCents: Number.MAX_SAFE_INTEGER + 1 })), /order_contract_invalid/);
});

test("rejects invalid order timestamps", () => {
  const microsecond = listItem({
    createdAt: "2026-07-21T08:00:00.000900Z",
    updatedAt: "2026-07-21T09:00:00.000001Z",
  });
  assert.equal(parseOrderListItem(microsecond).createdAt, "2026-07-21T08:00:00.000900Z");
  assert.throws(() => parseOrderListItem(listItem({ updatedAt: "2026-07-21T09:00:00Z" })), /order_contract_invalid/);
  assert.throws(() => parseOrderListItem(listItem({ updatedAt: "2026-07-21T09:00:00.0000Z" })), /order_contract_invalid/);
});

test("rejects private authority keys", () => {
  assert.throws(() => parseOrderDetail(detail({ storeId: ORDER_ID })), /order_contract_invalid/);
});

test("parses exact deeply frozen order neighbors with either side optional", () => {
  const both = parseOrderNeighbors({
    previous: { id: PREVIOUS_ORDER_ID, orderNumber: "HMN-1002" },
    next: { id: NEXT_ORDER_ID, orderNumber: "HMN-1000" },
  });
  assert.deepEqual(both, {
    previous: { id: PREVIOUS_ORDER_ID, orderNumber: "HMN-1002" },
    next: { id: NEXT_ORDER_ID, orderNumber: "HMN-1000" },
  });
  assert.equal(Object.isFrozen(both), true);
  assert.equal(Object.isFrozen(both.previous), true);
  assert.equal(Object.isFrozen(both.next), true);
  assert.deepEqual(parseOrderNeighbors({ previous: { id: PREVIOUS_ORDER_ID, orderNumber: "HMN-1002" } }), {
    previous: { id: PREVIOUS_ORDER_ID, orderNumber: "HMN-1002" },
  });
  assert.deepEqual(parseOrderNeighbors({ next: { id: NEXT_ORDER_ID, orderNumber: "HMN-1000" } }), {
    next: { id: NEXT_ORDER_ID, orderNumber: "HMN-1000" },
  });
  assert.deepEqual(parseOrderNeighbors({}), {});
});

test("rejects malformed duplicate private and unexpected neighbor values", () => {
  assert.throws(() => parseOrderNeighbors({ previous: { id: "not-a-uuid", orderNumber: "HMN-1002" } }), /order_contract_invalid/);
  assert.throws(() => parseOrderNeighbors({ previous: { id: PREVIOUS_ORDER_ID, orderNumber: "" } }), /order_contract_invalid/);
  assert.throws(() => parseOrderNeighbors({
    previous: { id: PREVIOUS_ORDER_ID, orderNumber: "HMN-1002" },
    next: { id: PREVIOUS_ORDER_ID, orderNumber: "HMN-1002" },
  }), /order_contract_invalid/);
  assert.throws(() => parseOrderNeighbors({ storeId: ORDER_ID }), /order_contract_invalid/);
  assert.throws(() => parseOrderNeighbors({ previous: { id: PREVIOUS_ORDER_ID, orderNumber: "HMN-1002", storeId: ORDER_ID } }), /order_contract_invalid/);
  assert.throws(() => parseOrderNeighbors({ previous: null }), /order_contract_invalid/);
});

test("parses exact deeply frozen order draft projections and merchant intent", () => {
  const list = parseOrderDraftListItem(draftListItem());
  const parsed = parseOrderDraftDetail(draftDetail());
  const intent = parseOrderDraftSaveIntent(draftSaveIntent());
  const conversion = parseOrderDraftConversionResult({
    draftId: DRAFT_ID,
    orderId: ORDER_ID,
    orderNumber: "MAN-11111111111141118111",
    draftVersion: 3,
    adjustedInventory: true,
    replayed: false,
  });

  assert.deepEqual(list, draftListItem());
  assert.deepEqual(parsed, draftDetail());
  assert.deepEqual(intent, draftSaveIntent());
  assert.deepEqual(conversion, {
    draftId: DRAFT_ID,
    orderId: ORDER_ID,
    orderNumber: "MAN-11111111111141118111",
    draftVersion: 3,
    adjustedInventory: true,
    replayed: false,
  });
  for (const value of [
    ORDER_DRAFT_STATUSES,
    list,
    parsed,
    parsed.shippingAddress,
    parsed.billingAddress,
    parsed.lines,
    parsed.lines[0],
    intent,
    intent.lines,
    intent.lines[0],
    conversion,
  ]) assert.equal(Object.isFrozen(value), true);
  assert.deepEqual(ORDER_DRAFT_STATUSES, ["draft", "converted", "archived"]);
  assert.equal(ORDER_SOURCES.includes("manual"), true);
});

test("rejects order draft authority, arithmetic, lifecycle, identity, and array ambiguity", () => {
  assert.throws(() => parseOrderDraftDetail(draftDetail({ storeId: ORDER_ID })), /order_contract_invalid/);
  assert.throws(() => parseOrderDraftSaveIntent(draftSaveIntent({ tenantId: ORDER_ID })), /order_contract_invalid/);
  assert.throws(() => parseOrderDraftDetail(draftDetail({ totalCents: 23_499 })), /order_contract_invalid/);
  assert.throws(() => parseOrderDraftDetail(draftDetail({ subtotalCents: 22_999 })), /order_contract_invalid/);
  assert.throws(() => parseOrderDraftDetail(draftDetail({ currency: "USD" })), /order_contract_invalid/);
  assert.throws(() => parseOrderDraftSaveIntent(draftSaveIntent({ currency: "USD" })), /order_contract_invalid/);
  assert.throws(() => parseOrderDraftDetail(draftDetail({ status: "converted" })), /order_contract_invalid/);
  assert.throws(() => parseOrderDraftDetail(draftDetail({
    status: "converted",
    convertedOrderId: ORDER_ID,
  })), /order_contract_invalid/);
  assert.throws(() => parseOrderDraftDetail(draftDetail({ lines: [
    draftDetail().lines[0],
    { ...draftDetail().lines[0], lineId: ITEM_ID, position: 1 },
  ] })), /order_contract_invalid/);
  assert.throws(() => parseOrderDraftSaveIntent(draftSaveIntent({ lines: [
    draftSaveIntent().lines[0],
    { ...draftSaveIntent().lines[0], lineId: ITEM_ID },
  ] })), /order_contract_invalid/);
  assert.throws(() => parseOrderDraftSaveIntent(draftSaveIntent({ lines: new Array(1) })), /order_contract_invalid/);
  assert.throws(() => parseOrderDraftSaveIntent(draftSaveIntent({ lines: Array.from({ length: 101 }, (_, index) => ({
    ...draftSaveIntent().lines[0],
    lineId: `${index.toString(16).padStart(8, "0")}-0000-4000-8000-000000000001`,
  })) })), /order_contract_invalid/);
});

test("requires converted order identity only for converted drafts", () => {
  const converted = parseOrderDraftDetail(draftDetail({
    status: "converted",
    convertedOrderId: ORDER_ID,
    convertedOrderNumber: "MAN-11111111111141118111",
  }));
  assert.equal(converted.convertedOrderId, ORDER_ID);
  assert.equal(converted.convertedOrderNumber, "MAN-11111111111141118111");
  assert.throws(() => parseOrderDraftDetail(draftDetail({ convertedOrderId: ORDER_ID, convertedOrderNumber: "MAN-11111111111141118111" })), /order_contract_invalid/);
});
