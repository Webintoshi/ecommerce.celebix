import assert from "node:assert/strict";
import test from "node:test";

import { runShippingFulfillmentJob } from "./fulfillment-worker.ts";

const JOB = "50000000-0000-4000-8000-000000000001";
const STORE = "10000000-0000-4000-8000-000000000001";
const PROFILE = "40000000-0000-4000-8000-000000000001";
const QUOTE = "60000000-0000-4000-8000-000000000001";
const SHIPMENT = "61000000-0000-4000-8000-000000000001";
const HANDLER = "62000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-06T12:00:00.000Z");

function claim(jobKind: "quote" | "create_shipment") {
  return { jobId: JOB, jobKind, storeId: STORE, profileId: PROFILE, quoteId: QUOTE, shipmentId: jobKind === "quote" ? null : SHIPMENT, credentialVersion: 1, leaseId: "80000000-0000-4000-8000-000000000001", workerId: "worker-1", fenceToken: 1, version: 2 };
}

function ids() {
  let value = 0;
  return () => `90000000-0000-4000-8000-${String(++value).padStart(12, "0")}`;
}

test("quote worker calls only quotePackages and atomically binds server handler resources", async () => {
  const tokenBytes = new TextEncoder().encode("bk_live_secret_123456789"), completed: unknown[] = [];
  let quoteCalls = 0, createCalls = 0;
  const selectedClaim = claim("quote");
  const runtime = {
    workflow: {
      async claimFulfillment() { return selectedClaim; },
      async openFulfillment() { return { claim: selectedClaim, providerCode: "basit_kargo", tokenBytes, packages: [{ heightCm: 10, widthCm: 20, depthCm: 30, weightKg: 1.5 }], brandProviderResourceId: "brand", addressProviderResourceId: "address", handlers: [{ id: HANDLER, handlerCode: "ARAS" }], order: null }; },
      async completeQuote(input: unknown) { completed.push(input); return "completed" as const; },
      async failFulfillment() { throw new Error("unexpected"); },
    },
    adapter: {
      parseCredential(value: unknown) { return value as { token: string }; },
      async quotePackages() { quoteCalls += 1; return { kind: "succeeded" as const, options: [{ handlerCode: "ARAS", handlerName: "Aras Kargo", desiKg: 2, priceCents: 12900, currency: "TRY" as const }] }; },
      async createShipment() { createCalls += 1; throw new Error("unexpected"); },
    },
    generateId: ids(),
  };
  assert.equal(await runShippingFulfillmentJob({ jobId: JOB, workerId: "worker-1", runtime: runtime as never, now: NOW }), "completed");
  assert.equal(quoteCalls, 1);
  assert.equal(createCalls, 0);
  assert.equal((completed[0] as { options: readonly { handlerResourceId: string }[] }).options[0]?.handlerResourceId, HANDLER);
  assert.equal(tokenBytes.every((byte) => byte === 0), true);
});

test("create transport ambiguity is marked unknown once and never requeued", async () => {
  const tokenBytes = new TextEncoder().encode("bk_live_secret_123456789"), unknowns: unknown[] = [];
  let createCalls = 0, failureCalls = 0;
  const selectedClaim = claim("create_shipment");
  const runtime = {
    workflow: {
      async claimFulfillment() { return selectedClaim; },
      async openFulfillment() { return { claim: selectedClaim, providerCode: "basit_kargo", tokenBytes, packages: [{ heightCm: 10, widthCm: 20, depthCm: 30, weightKg: 1.5 }], brandProviderResourceId: "brand", addressProviderResourceId: "address", handlers: [{ id: HANDLER, handlerCode: "ARAS" }], order: { orderId: "63000000-0000-4000-8000-000000000001", orderNumber: "1001", customerName: "Celebix QA", customerEmail: "qa@example.com", customerPhone: "+905551112233", shippingAddress: { recipientName: "Celebix QA", line1: "Test", district: "Kadıköy", city: "İstanbul", country: "TR" }, codAmountCents: 0, handlerCode: "ARAS", items: [{ orderItemId: "64000000-0000-4000-8000-000000000001", productName: "Ürün", sku: "SKU-1", quantity: 1 }] } }; },
      async markShipmentUnknown(input: unknown) { unknowns.push(input); return "marked_unknown" as const; },
      async failFulfillment() { failureCalls += 1; return "requeued" as const; },
    },
    adapter: {
      parseCredential(value: unknown) { return value as { token: string }; },
      async createShipment() { createCalls += 1; throw new Error("socket closed"); },
    },
    generateId: ids(),
  };
  assert.equal(await runShippingFulfillmentJob({ jobId: JOB, workerId: "worker-1", runtime: runtime as never, now: NOW }), "marked_unknown");
  assert.equal(createCalls, 1);
  assert.equal(unknowns.length, 1);
  assert.equal(failureCalls, 0);
  assert.equal(tokenBytes.every((byte) => byte === 0), true);
});
