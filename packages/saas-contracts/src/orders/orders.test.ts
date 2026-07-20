import assert from "node:assert/strict";
import test from "node:test";

import {
  ORDER_PAYMENT_STATUSES,
  ORDER_SOURCES,
  ORDER_STATUSES,
  parseOrderDashboardSummary,
  parseOrderDetail,
  parseOrderListItem,
} from "./index.ts";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";
const NOTE_ID = "44444444-4444-4444-8444-444444444444";
const CREATED_AT = "2026-07-21T08:00:00.000Z";
const UPDATED_AT = "2026-07-21T09:00:00.000Z";

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
  ]) {
    assert.equal(Object.isFrozen(value), true);
  }
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
  assert.throws(() => parseOrderListItem(listItem({ updatedAt: "2026-07-21T09:00:00Z" })), /order_contract_invalid/);
});

test("rejects private authority keys", () => {
  assert.throws(() => parseOrderDetail(detail({ storeId: ORDER_ID })), /order_contract_invalid/);
});
