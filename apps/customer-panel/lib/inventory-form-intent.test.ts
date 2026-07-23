import assert from "node:assert/strict";
import test from "node:test";

import type { InventoryCount, InventoryTransfer, PurchaseOrder } from "@celebix/saas-contracts";
import {
  buildInventoryOperationIntent,
  buildPurchaseReceiptIntent,
  initialPurchaseReceiptQuantities,
  purchaseReceiptRevision,
  type InventoryOperationDraft,
} from "./inventory-ui/form-intent.ts";

const ORDER = "11111111-1111-4111-8111-111111111111";
const COUNT = "22222222-2222-4222-8222-222222222222";
const TRANSFER = "33333333-3333-4333-8333-333333333333";
const LOCATION = "44444444-4444-4444-8444-444444444444";
const DESTINATION = "55555555-5555-4555-8555-555555555555";
const LINE = "66666666-6666-4666-8666-666666666666";
const VARIANT = "77777777-7777-4777-8777-777777777777";
const SECOND_LINE = "88888888-8888-4888-8888-888888888888";
const NOW = "2026-07-23T10:00:00.000Z";
const choices = Object.freeze({ locationIds: new Set([LOCATION, DESTINATION]), variantIds: new Set([VARIANT]) });
const line = Object.freeze({ lineId: LINE, variantId: VARIANT, quantity: "1", unitCostCents: "250" });
const draft = (overrides: Partial<InventoryOperationDraft> = {}): InventoryOperationDraft => Object.freeze({
  mode: "purchase", supplierName: "Tedarikçi", locationId: LOCATION,
  sourceLocationId: "", destinationLocationId: "", lines: Object.freeze([line]), ...overrides,
});
const purchase: PurchaseOrder = Object.freeze({
  id: ORDER, locationId: LOCATION, supplierName: "Tedarikçi", status: "draft",
  lines: Object.freeze([Object.freeze({ id: LINE, variantId: VARIANT, orderedQuantity: 5, receivedQuantity: 3, unitCostCents: 250, lineCostCents: 1250 })]),
  totalCostCents: 1250, version: 3, createdAt: NOW, updatedAt: NOW,
});
const count: InventoryCount = Object.freeze({
  id: COUNT, locationId: LOCATION, status: "draft",
  lines: Object.freeze([Object.freeze({ id: LINE, variantId: VARIANT, expectedQuantity: 2, countedQuantity: 1 })]),
  version: 4, createdAt: NOW, updatedAt: NOW,
});
const transfer: InventoryTransfer = Object.freeze({
  id: TRANSFER, sourceLocationId: LOCATION, destinationLocationId: DESTINATION, status: "draft",
  lines: Object.freeze([Object.freeze({ id: LINE, variantId: VARIANT, quantity: 1 })]),
  version: 2, createdAt: NOW, updatedAt: NOW,
});

test("builds exact create and versioned edit intents without private authority", () => {
  assert.deepEqual(buildInventoryOperationIntent(draft(), choices), {
    ok: true,
    value: {
      locationId: LOCATION, supplierName: "Tedarikçi",
      lines: [{ lineId: LINE, variantId: VARIANT, orderedQuantity: 1, unitCostCents: 250 }],
    },
  });
  assert.deepEqual(buildInventoryOperationIntent(draft({ record: purchase }), choices), {
    ok: true,
    value: {
      orderId: ORDER, expectedVersion: 3, locationId: LOCATION, supplierName: "Tedarikçi",
      lines: [{ lineId: LINE, variantId: VARIANT, orderedQuantity: 1, unitCostCents: 250 }],
    },
  });
});

test("count accepts exact zero while transfer requires distinct persisted active locations", () => {
  assert.deepEqual(buildInventoryOperationIntent(draft({
    mode: "count", record: count, supplierName: "", locationId: LOCATION,
    lines: Object.freeze([{ ...line, quantity: "0" }]),
  }), choices), {
    ok: true,
    value: {
      countId: COUNT, expectedVersion: 4, locationId: LOCATION,
      lines: [{ lineId: LINE, variantId: VARIANT, countedQuantity: 0 }],
    },
  });
  assert.equal(buildInventoryOperationIntent(draft({
    mode: "transfer", record: transfer, supplierName: "", locationId: "",
    sourceLocationId: LOCATION, destinationLocationId: LOCATION,
  }), choices).ok, false);
  assert.deepEqual(buildInventoryOperationIntent(draft({
    mode: "transfer", record: transfer, supplierName: "", locationId: "",
    sourceLocationId: LOCATION, destinationLocationId: DESTINATION,
  }), choices), {
    ok: true,
    value: {
      transferId: TRANSFER, expectedVersion: 2, sourceLocationId: LOCATION, destinationLocationId: DESTINATION,
      lines: [{ lineId: LINE, variantId: VARIANT, quantity: 1 }],
    },
  });
});

test("rejects unknown duplicate variants and out-of-contract finite quantities", () => {
  assert.equal(buildInventoryOperationIntent(draft({ lines: Object.freeze([line, { ...line, lineId: ORDER }]) }), choices).ok, false);
  assert.equal(buildInventoryOperationIntent(draft({ lines: Object.freeze([{ ...line, variantId: ORDER }]) }), choices).ok, false);
  assert.equal(buildInventoryOperationIntent(draft({ lines: Object.freeze([{ ...line, quantity: "-1" }]) }), choices).ok, false);
});

test("receipt builder keeps exact positive partial quantities and rejects zero-only or over-remaining input", () => {
  const receiptRecord = Object.freeze({ ...purchase, status: "ordered" as const });
  assert.deepEqual(buildPurchaseReceiptIntent(receiptRecord, { [LINE]: "1" }), {
    ok: true,
    value: [{ lineId: LINE, quantity: 1 }],
  });
  assert.equal(buildPurchaseReceiptIntent(receiptRecord, { [LINE]: "0" }).ok, false);
  assert.deepEqual(buildPurchaseReceiptIntent(receiptRecord, { [LINE]: "3" }), {
    ok: false,
    message: "Kalan miktardan fazla teslim alınamaz.",
  });
});

test("receipt draft resets on exact durable id/version and hidden completed lines cannot contribute", () => {
  const twoLines = Object.freeze({
    ...purchase,
    status: "partially_received" as const,
    version: 4,
    lines: Object.freeze([
      Object.freeze({ ...purchase.lines[0]!, receivedQuantity: 5 }),
      Object.freeze({ ...purchase.lines[0]!, id: SECOND_LINE, orderedQuantity: 4, receivedQuantity: 2 }),
    ]),
  });
  assert.equal(purchaseReceiptRevision(twoLines), `${ORDER}:4`);
  assert.deepEqual(initialPurchaseReceiptQuantities(twoLines), { [SECOND_LINE]: "0" });
  assert.deepEqual(buildPurchaseReceiptIntent(twoLines, { [LINE]: "5", [SECOND_LINE]: "2" }), {
    ok: true,
    value: [{ lineId: SECOND_LINE, quantity: 2 }],
  });
});
