import assert from "node:assert/strict";
import test from "node:test";
import type { PurchaseOrder } from "@celebix/saas-contracts";
import { createPurchasingConsoleController } from "./console-controller.ts";

const id = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const now = "2026-10-04T10:00:00.000Z";
const purchase = (status: PurchaseOrder["status"]): PurchaseOrder => ({
  id, locationId, supplierName: "Tedarikçi", status, lines: [], totalCostCents: 0,
  version: 1, createdAt: now, updatedAt: now,
});

test("partial receipts cannot be cancelled even by a stale event handler", async () => {
  let calls = 0;
  const subject = createPurchasingConsoleController({
    initial: purchase("partially_received"), canRead: true, canManage: true,
    api: {
      async getPurchaseOrder() { return purchase("partially_received"); },
      async savePurchaseOrder() { throw new Error("unexpected save"); },
      async receivePurchaseOrder() { throw new Error("unexpected receipt"); },
      async transitionPurchaseOrder() { calls += 1; throw new Error("unexpected cancellation"); },
    },
  });
  await subject.cancel();
  assert.equal(calls, 0);
  assert.equal(subject.getSnapshot().phase, "loaded");
  assert.equal(subject.getSnapshot().record?.status, "partially_received");
});

test("an unreceived ordered purchase still cancels with its expected version", async () => {
  let calls = 0;
  const subject = createPurchasingConsoleController({
    initial: purchase("ordered"), canRead: true, canManage: true,
    api: {
      async getPurchaseOrder() { return { ...purchase("cancelled"), version: 2 }; },
      async savePurchaseOrder() { throw new Error("unexpected save"); },
      async receivePurchaseOrder() { throw new Error("unexpected receipt"); },
      async transitionPurchaseOrder(orderId, intent) {
        calls += 1;
        assert.equal(orderId, id);
        assert.deepEqual(intent, { expectedVersion: 1, transition: "cancel" });
        return { id, status: "cancelled", version: 2, updatedAt: now, replayed: false };
      },
    },
  });
  await subject.cancel();
  assert.equal(calls, 1);
  assert.equal(subject.getSnapshot().record?.status, "cancelled");
});
