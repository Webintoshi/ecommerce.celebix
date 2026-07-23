import assert from "node:assert/strict";
import test from "node:test";

import {
  INVENTORY_COUNT_STATUSES,
  INVENTORY_MOVEMENT_KINDS,
  INVENTORY_TRANSFER_STATUSES,
  PURCHASE_ORDER_STATUSES,
  parseInventoryBalance,
  parseInventoryCount,
  parseInventoryCountLine,
  parseInventoryLocation,
  parseInventoryMovement,
  parseInventoryMutationResult,
  parseInventoryTransfer,
  parseInventoryTransferLine,
  parsePurchaseOrder,
  parsePurchaseOrderLine,
} from "./index.ts";

const NOW = "2026-07-23T12:00:00.000Z";
const LATER = "2026-07-23T12:15:00.000Z";
const LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_LOCATION_ID = "22222222-2222-4222-8222-222222222222";
const VARIANT_ID = "33333333-3333-4333-8333-333333333333";
const ID = "44444444-4444-4444-8444-444444444444";
const LINE_ID = "55555555-5555-4555-8555-555555555555";

function locationFixture() {
  return { id: LOCATION_ID, name: "Main warehouse", isDefault: true, status: "active", version: 1, createdAt: NOW, updatedAt: NOW };
}
function balanceFixture() {
  return { locationId: LOCATION_ID, variantId: VARIANT_ID, quantity: 10, version: 1, updatedAt: NOW };
}
function purchaseLineFixture() {
  return { id: LINE_ID, variantId: VARIANT_ID, orderedQuantity: 2, receivedQuantity: 0, unitCostCents: 500, lineCostCents: 1000 };
}
function countLineFixture() {
  return { id: LINE_ID, variantId: VARIANT_ID, expectedQuantity: 10, countedQuantity: 9 };
}
function transferLineFixture() {
  return { id: LINE_ID, variantId: VARIANT_ID, quantity: 2 };
}

test("inventory contracts export the exact immutable enum registries", () => {
  assert.deepEqual(INVENTORY_MOVEMENT_KINDS, ["opening", "catalog_adjustment", "purchase_receipt", "count_adjustment", "transfer_out", "transfer_in", "transfer_return", "checkout_sale"]);
  assert.deepEqual(PURCHASE_ORDER_STATUSES, ["draft", "ordered", "partially_received", "received", "cancelled"]);
  assert.deepEqual(INVENTORY_COUNT_STATUSES, ["draft", "counting", "committed", "cancelled"]);
  assert.deepEqual(INVENTORY_TRANSFER_STATUSES, ["draft", "in_transit", "received", "cancelled"]);
  for (const registry of [INVENTORY_MOVEMENT_KINDS, PURCHASE_ORDER_STATUSES, INVENTORY_COUNT_STATUSES, INVENTORY_TRANSFER_STATUSES]) assert.equal(Object.isFrozen(registry), true);
});

test("inventory DTOs parse exact canonical frozen projections", () => {
  const location = parseInventoryLocation(locationFixture());
  const balance = parseInventoryBalance(balanceFixture());
  const movement = parseInventoryMovement({ id: ID, locationId: LOCATION_ID, variantId: VARIANT_ID, kind: "purchase_receipt", quantity: 2, occurredAt: NOW });
  const purchase = parsePurchaseOrder({ id: ID, locationId: LOCATION_ID, supplierName: "Atlas Supply", status: "draft", lines: [purchaseLineFixture()], totalCostCents: 1000, version: 1, createdAt: NOW, updatedAt: NOW });
  const count = parseInventoryCount({ id: ID, locationId: LOCATION_ID, status: "draft", lines: [countLineFixture()], version: 1, createdAt: NOW, updatedAt: NOW });
  const transfer = parseInventoryTransfer({ id: ID, sourceLocationId: LOCATION_ID, destinationLocationId: OTHER_LOCATION_ID, status: "draft", lines: [transferLineFixture()], version: 1, createdAt: NOW, updatedAt: NOW });
  const result = parseInventoryMutationResult({ id: ID, status: "received", version: 2, updatedAt: LATER, replayed: false });
  for (const value of [location, balance, movement, purchase, count, transfer, result, purchase.lines, count.lines, transfer.lines]) assert.equal(Object.isFrozen(value), true);
});

test("inventory DTOs reject hidden authority and unsafe quantities", () => {
  assert.throws(() => parseInventoryBalance({ ...balanceFixture(), storeId: ID }));
  assert.throws(() => parseInventoryCountLine({ ...countLineFixture(), countedQuantity: -1 }));
  assert.throws(() => parsePurchaseOrderLine({ ...purchaseLineFixture(), unitCostCents: Number.MAX_SAFE_INTEGER, orderedQuantity: 999999 }));
});

test("inventory DTOs reject noncanonical values, duplicate lines and invalid arithmetic", () => {
  assert.throws(() => parseInventoryLocation({ ...locationFixture(), id: "aaaaaaaa-1111-4111-8111-111111111111".toUpperCase() }));
  assert.throws(() => parseInventoryBalance({ ...balanceFixture(), updatedAt: "2026-07-23T12:00:00Z" }));
  assert.throws(() => parseInventoryMovement({ id: ID, locationId: LOCATION_ID, variantId: VARIANT_ID, kind: "purchase_receipt", quantity: 0, occurredAt: NOW }));
  assert.throws(() => parsePurchaseOrderLine({ ...purchaseLineFixture(), lineCostCents: 999 }));
  assert.throws(() => parsePurchaseOrder({ id: ID, locationId: LOCATION_ID, supplierName: "Atlas Supply", status: "draft", lines: [purchaseLineFixture(), purchaseLineFixture()], totalCostCents: 2000, version: 1, createdAt: NOW, updatedAt: NOW }));
  assert.throws(() => parseInventoryCount({ id: ID, locationId: LOCATION_ID, status: "draft", lines: Array.from({ length: 501 }, (_, index) => ({ ...countLineFixture(), id: `${index}` })), version: 1, createdAt: NOW, updatedAt: NOW }));
  assert.throws(() => parseInventoryTransfer({ id: ID, sourceLocationId: LOCATION_ID, destinationLocationId: LOCATION_ID, status: "draft", lines: [transferLineFixture()], version: 1, createdAt: NOW, updatedAt: NOW }));
});

test("inventory line arrays permit empty drafts while remaining frozen", () => {
  const purchase = parsePurchaseOrder({ id: ID, locationId: LOCATION_ID, supplierName: "Atlas Supply", status: "draft", lines: [], totalCostCents: 0, version: 1, createdAt: NOW, updatedAt: NOW });
  const count = parseInventoryCount({ id: ID, locationId: LOCATION_ID, status: "draft", lines: [], version: 1, createdAt: NOW, updatedAt: NOW });
  const transfer = parseInventoryTransfer({ id: ID, sourceLocationId: LOCATION_ID, destinationLocationId: OTHER_LOCATION_ID, status: "draft", lines: [], version: 1, createdAt: NOW, updatedAt: NOW });
  for (const value of [purchase.lines, count.lines, transfer.lines]) assert.equal(Object.isFrozen(value), true);
});
