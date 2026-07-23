import assert from "node:assert/strict";
import test from "node:test";

import {
  INVENTORY_COUNT_STATUSES,
  INVENTORY_LOCATION_ARCHIVE_BLOCK_REASONS,
  INVENTORY_MOVEMENT_KINDS,
  INVENTORY_TRANSFER_STATUSES,
  PURCHASE_ORDER_STATUSES,
  parseInventoryBalance,
  parseInventoryCount,
  parseInventoryCountLine,
  parseInventoryLocation,
  parseInventoryLocationArchiveInput,
  parseInventoryLocationSaveInput,
  parseInventoryLocationMutationResult,
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
  return {
    id: LOCATION_ID,
    name: "Main warehouse",
    isDefault: true,
    status: "active",
    archiveEligibility: { canArchive: false, reason: "default" },
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
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
function lineId(index: number) {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${index.toString(16).padStart(12, "0")}`;
}

test("inventory contracts export the exact immutable enum registries", () => {
  assert.deepEqual(INVENTORY_MOVEMENT_KINDS, ["opening", "catalog_adjustment", "purchase_receipt", "count_adjustment", "transfer_out", "transfer_in", "transfer_return", "checkout_sale"]);
  assert.deepEqual(PURCHASE_ORDER_STATUSES, ["draft", "ordered", "partially_received", "received", "cancelled"]);
  assert.deepEqual(INVENTORY_COUNT_STATUSES, ["draft", "counting", "committed", "cancelled"]);
  assert.deepEqual(INVENTORY_TRANSFER_STATUSES, ["draft", "in_transit", "received", "cancelled"]);
  assert.deepEqual(INVENTORY_LOCATION_ARCHIVE_BLOCK_REASONS, ["default", "positive_on_hand", "reserved", "open_purchase", "open_count", "open_transfer", "archived"]);
  for (const registry of [INVENTORY_MOVEMENT_KINDS, PURCHASE_ORDER_STATUSES, INVENTORY_COUNT_STATUSES, INVENTORY_TRANSFER_STATUSES, INVENTORY_LOCATION_ARCHIVE_BLOCK_REASONS]) assert.equal(Object.isFrozen(registry), true);
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
  assert.equal(Object.isFrozen(location.archiveEligibility), true);
});

test("inventory location archive eligibility is exact, finite and status-consistent", () => {
  const eligible = parseInventoryLocation({
    ...locationFixture(),
    isDefault: false,
    archiveEligibility: { canArchive: true, reason: null },
  });
  assert.deepEqual(eligible.archiveEligibility, { canArchive: true, reason: null });
  for (const reason of INVENTORY_LOCATION_ARCHIVE_BLOCK_REASONS) {
    const status = reason === "archived" ? "archived" : "active";
    const isDefault = reason === "default";
    const location = parseInventoryLocation({
      ...locationFixture(),
      status,
      isDefault,
      archiveEligibility: { canArchive: false, reason },
    });
    assert.deepEqual(location.archiveEligibility, { canArchive: false, reason });
  }
  assert.throws(() => parseInventoryLocation({ ...locationFixture(), archiveEligibility: { canArchive: true, reason: "default" } }));
  assert.throws(() => parseInventoryLocation({ ...locationFixture(), isDefault: false, archiveEligibility: { canArchive: false, reason: "unknown" } }));
  assert.throws(() => parseInventoryLocation({ ...locationFixture(), isDefault: false, archiveEligibility: { canArchive: false, reason: "default" } }));
  assert.throws(() => parseInventoryLocation({ ...locationFixture(), status: "archived", isDefault: false, archiveEligibility: { canArchive: true, reason: null } }));
});

test("inventory location commands parse exact frozen create update archive projections", () => {
  const create = parseInventoryLocationSaveInput({ operationId: ID, name: "Secondary warehouse" });
  const update = parseInventoryLocationSaveInput({ operationId: ID, locationId: LOCATION_ID, expectedVersion: 2, name: "City warehouse" });
  const archive = parseInventoryLocationArchiveInput({ operationId: ID, locationId: LOCATION_ID, expectedVersion: 3 });
  const result = parseInventoryLocationMutationResult({ id: LOCATION_ID, status: "active", version: 2, updatedAt: LATER, replayed: false });
  assert.deepEqual(create, { operationId: ID, name: "Secondary warehouse" });
  assert.equal(update.expectedVersion, 2);
  assert.equal(archive.locationId, LOCATION_ID);
  assert.equal(result.status, "active");
  for (const value of [create, update, archive, result]) assert.equal(Object.isFrozen(value), true);
});

test("inventory location commands reject browser authority ambiguous targets and hostile values", () => {
  assert.throws(() => parseInventoryLocationSaveInput({ operationId: ID, name: " Secondary", storeId: ID }));
  assert.throws(() => parseInventoryLocationSaveInput({ operationId: ID, locationId: LOCATION_ID, name: "Missing version" }));
  assert.throws(() => parseInventoryLocationSaveInput({ operationId: ID, expectedVersion: 1, name: "Missing target" }));
  assert.throws(() => parseInventoryLocationArchiveInput({ operationId: ID, locationId: LOCATION_ID, expectedVersion: Number.MAX_SAFE_INTEGER }));
  assert.throws(() => parseInventoryLocationMutationResult({ id: LOCATION_ID, status: "deleted", version: 2, updatedAt: LATER, replayed: false }));
});

test("inventory DTOs reject hidden authority and unsafe quantities", () => {
  assert.throws(() => parseInventoryBalance({ ...balanceFixture(), storeId: ID }));
  assert.throws(() => parseInventoryCountLine({ ...countLineFixture(), countedQuantity: -1 }));
  assert.throws(() => parsePurchaseOrderLine({ ...purchaseLineFixture(), unitCostCents: Number.MAX_SAFE_INTEGER, orderedQuantity: 999999 }));
});

test("inventory DTOs reject noncanonical values, duplicate lines and invalid arithmetic", () => {
  assert.throws(() => parseInventoryLocation({ ...locationFixture(), id: "aaaaaaaa-1111-4111-8111-111111111111".toUpperCase() }));
  assert.throws(() => parseInventoryBalance({ ...balanceFixture(), updatedAt: "2026-07-23T12:00:00Z" }));
  assert.throws(() => parsePurchaseOrderLine({ ...purchaseLineFixture(), lineCostCents: 999 }));
  assert.throws(() => parsePurchaseOrder({ id: ID, locationId: LOCATION_ID, supplierName: "Atlas Supply", status: "draft", lines: [purchaseLineFixture(), purchaseLineFixture()], totalCostCents: 2000, version: 1, createdAt: NOW, updatedAt: NOW }));
  assert.throws(() => parseInventoryCount({ id: ID, locationId: LOCATION_ID, status: "draft", lines: Array.from({ length: 501 }, (_, index) => ({ ...countLineFixture(), id: lineId(index) })), version: 1, createdAt: NOW, updatedAt: NOW }));
  assert.throws(() => parseInventoryTransfer({ id: ID, sourceLocationId: LOCATION_ID, destinationLocationId: LOCATION_ID, status: "draft", lines: [transferLineFixture()], version: 1, createdAt: NOW, updatedAt: NOW }));
});

test("every inventory quantity field accepts zero and rejects negative fractional and overflowing values", () => {
  assert.equal(parseInventoryMovement({ id: ID, locationId: LOCATION_ID, variantId: VARIANT_ID, kind: "opening", quantity: 0, occurredAt: NOW }).quantity, 0);
  assert.equal(parsePurchaseOrderLine({ ...purchaseLineFixture(), orderedQuantity: 0, receivedQuantity: 0, lineCostCents: 0 }).orderedQuantity, 0);
  assert.equal(parseInventoryTransferLine({ ...transferLineFixture(), quantity: 0 }).quantity, 0);
  for (const invalidQuantity of [-1, 0.5, 2_147_483_648]) {
    assert.throws(() => parseInventoryMovement({ id: ID, locationId: LOCATION_ID, variantId: VARIANT_ID, kind: "opening", quantity: invalidQuantity, occurredAt: NOW }));
    assert.throws(() => parsePurchaseOrderLine({ ...purchaseLineFixture(), orderedQuantity: invalidQuantity, receivedQuantity: 0, lineCostCents: 0 }));
    assert.throws(() => parseInventoryTransferLine({ ...transferLineFixture(), quantity: invalidQuantity }));
  }
});

test("inventory line arrays use a fixed descriptor length and reject hostile shapes", () => {
  const tooManyLines = Array.from({ length: 501 }, (_, index) => ({ ...countLineFixture(), id: lineId(index) }));
  let lengthReads = 0;
  const proxy = new Proxy(tooManyLines, {
    get(target, property, receiver) {
      if (property === "length") return lengthReads++ === 0 ? 0 : 501;
      return Reflect.get(target, property, receiver);
    },
  });
  const sparse = new Array(1) as Array<ReturnType<typeof countLineFixture>>;
  const getter = [] as Array<ReturnType<typeof countLineFixture>>;
  let getterCalled = false;
  Object.defineProperty(getter, "0", { enumerable: true, configurable: true, get() { getterCalled = true; return countLineFixture(); } });
  const symbol = [countLineFixture()];
  Object.defineProperty(symbol, Symbol("hidden"), { value: "hidden", enumerable: true });
  const nonEnumerable = [countLineFixture()];
  Object.defineProperty(nonEnumerable, "0", { value: countLineFixture(), enumerable: false, writable: true, configurable: true });
  for (const lines of [proxy, sparse, getter, symbol, nonEnumerable]) {
    assert.throws(() => parseInventoryCount({ id: ID, locationId: LOCATION_ID, status: "draft", lines, version: 1, createdAt: NOW, updatedAt: NOW }));
  }
  assert.equal(lengthReads, 0);
  assert.equal(getterCalled, false);
});

test("inventory timestamp ordering normalizes millisecond precision to microseconds", () => {
  const milliseconds = "2026-07-23T12:00:00.123Z";
  const microseconds = "2026-07-23T12:00:00.123456Z";
  const earlier = parseInventoryLocation({ ...locationFixture(), createdAt: milliseconds, updatedAt: microseconds });
  const equal = parseInventoryLocation({ ...locationFixture(), createdAt: milliseconds, updatedAt: "2026-07-23T12:00:00.123000Z" });
  const equalReversed = parseInventoryLocation({ ...locationFixture(), createdAt: "2026-07-23T12:00:00.123000Z", updatedAt: milliseconds });
  assert.equal(earlier.createdAt, "2026-07-23T12:00:00.123000Z");
  assert.equal(equal.updatedAt, "2026-07-23T12:00:00.123000Z");
  assert.equal(equalReversed.updatedAt, "2026-07-23T12:00:00.123000Z");
  assert.throws(() => parseInventoryLocation({ ...locationFixture(), createdAt: microseconds, updatedAt: milliseconds }));
});

test("inventory line arrays permit empty drafts while remaining frozen", () => {
  const purchase = parsePurchaseOrder({ id: ID, locationId: LOCATION_ID, supplierName: "Atlas Supply", status: "draft", lines: [], totalCostCents: 0, version: 1, createdAt: NOW, updatedAt: NOW });
  const count = parseInventoryCount({ id: ID, locationId: LOCATION_ID, status: "draft", lines: [], version: 1, createdAt: NOW, updatedAt: NOW });
  const transfer = parseInventoryTransfer({ id: ID, sourceLocationId: LOCATION_ID, destinationLocationId: OTHER_LOCATION_ID, status: "draft", lines: [], version: 1, createdAt: NOW, updatedAt: NOW });
  for (const value of [purchase.lines, count.lines, transfer.lines]) assert.equal(Object.isFrozen(value), true);
});
