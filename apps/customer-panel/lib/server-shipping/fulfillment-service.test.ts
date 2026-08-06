import assert from "node:assert/strict";
import test from "node:test";

import { createShippingFulfillmentService } from "./fulfillment-service.ts";

const NOW = new Date("2026-08-06T12:00:00.000Z");
const JOB = "50000000-0000-4000-8000-000000000001";
const SHIPMENT = "60000000-0000-4000-8000-000000000001";

test("replayed shipment action claims the durable job but calls provider create only once", async () => {
  let claimCount = 0, createCalls = 0;
  const tokenBytes: Uint8Array[] = [];
  const shipment = { id: SHIPMENT, providerCode: "basit_kargo", direction: "outgoing", status: "ready", barcode: "barcode", codAmountCents: 0, currency: "TRY", items: [{ orderItemId: "61000000-0000-4000-8000-000000000001", productName: "Ürün", quantity: 1 }], events: [{ id: "62000000-0000-4000-8000-000000000001", status: "ready", occurredAt: NOW.toISOString() }], label: { available: false }, version: 2, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };
  const claim = { jobId: JOB, jobKind: "create_shipment", storeId: "10000000-0000-4000-8000-000000000001", profileId: "40000000-0000-4000-8000-000000000001", quoteId: "63000000-0000-4000-8000-000000000001", shipmentId: SHIPMENT, credentialVersion: 1, leaseId: "64000000-0000-4000-8000-000000000001", workerId: "panel.request", fenceToken: 1, version: 2 };
  const runtime = {
    admin: {
      async beginShipment() { return { shipment: { ...shipment, status: "creating" }, jobId: JOB, replayed: claimCount > 0 }; },
      async currentShipment() { return shipment; },
    },
    workflow: {
      async claimFulfillment() { return claimCount++ === 0 ? claim : null; },
      async openFulfillment() { const bytes = new TextEncoder().encode("bk_live_secret_123456789"); tokenBytes.push(bytes); return { claim, providerCode: "basit_kargo", tokenBytes: bytes, packages: [{ heightCm: 10, widthCm: 10, depthCm: 10, weightKg: 1 }], brandProviderResourceId: null, addressProviderResourceId: null, handlers: [{ id: "65000000-0000-4000-8000-000000000001", handlerCode: "ARAS" }], order: { orderId: "66000000-0000-4000-8000-000000000001", orderNumber: "1001", customerName: "QA", customerEmail: null, customerPhone: "+905551112233", shippingAddress: { recipientName: "QA", line1: "Adres", district: "Kadıköy", city: "İstanbul", country: "TR" }, codAmountCents: 0, handlerCode: "ARAS", items: [{ orderItemId: "67000000-0000-4000-8000-000000000001", productName: "Ürün", sku: null, quantity: 1 }] } }; },
      async completeShipment() { return "completed" as const; },
    },
    adapter: {
      parseCredential(value: unknown) { return value as { token: string }; },
      async createShipment() { createCalls += 1; return { kind: "succeeded" as const, shipment: { providerReference: "provider-1", direction: "outgoing" as const, status: "ready" as const, providerStatus: "NEW", barcode: "barcode", currency: "TRY" as const } }; },
    },
    generateId() { return "68000000-0000-4000-8000-000000000001"; },
  };
  const service = createShippingFulfillmentService(runtime as never);
  const input = { tenantContext: {} as never, now: NOW, requestId: "request", orderId: "66000000-0000-4000-8000-000000000001", expectedOrderVersion: 3, quoteCredential: "quote_0123456789abcdef0123456789abcdef", optionId: "65000000-0000-4000-8000-000000000001", operationId: "69000000-0000-4000-8000-000000000001" };
  assert.equal((await service.beginShipment(input)).id, SHIPMENT);
  assert.equal((await service.beginShipment(input)).id, SHIPMENT);
  assert.equal(createCalls, 1);
  assert.equal(tokenBytes.every((bytes) => bytes.every((byte) => byte === 0)), true);
});
