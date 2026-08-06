import assert from "node:assert/strict";
import test from "node:test";

import { sealShippingCredential } from "./credential-crypto.ts";
import { PostgresShippingWorkflowRepository } from "./workflow-repository.ts";

const JOB = "50000000-0000-4000-8000-000000000001";
const LEASE = "80000000-0000-4000-8000-000000000001";
const STORE = "10000000-0000-4000-8000-000000000001";
const PROFILE = "40000000-0000-4000-8000-000000000001";
const QUOTE = "60000000-0000-4000-8000-000000000001";
const SHIPMENT = "61000000-0000-4000-8000-000000000001";
const HANDLER = "62000000-0000-4000-8000-000000000001";
const OPTION = "63000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-06T12:00:00.000Z");
const keyring = Object.freeze({ activeKeyId: "shipping.current", keys: Object.freeze([
  Object.freeze({ keyId: "shipping.current", key: new Uint8Array(32).fill(9) }),
]) });
const envelope = sealShippingCredential({
  plaintext: new TextEncoder().encode("bk_live_secret_123456789"), storeId: STORE, profileId: PROFILE,
  providerCode: "basit_kargo", credentialVersion: 1, keyring,
});

class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const rows = text.includes("shipping_fulfillment_claim_job") ? [{ outcome: "claimed", result_payload: {
      jobId: JOB, jobKind: "create_shipment", storeId: STORE, profileId: PROFILE, quoteId: QUOTE,
      shipmentId: SHIPMENT, credentialVersion: 1, leaseId: LEASE, fenceToken: 1, version: 2,
    } }] : text.includes("shipping_fulfillment_open") ? [{ outcome: "opened", result_payload: {
      jobKind: "create_shipment", providerCode: "basit_kargo", credentialEnvelope: envelope,
      credentialDigest: "a".repeat(64), credentialKeyId: "shipping.current", credentialVersion: 1,
      storeId: STORE, profileId: PROFILE, quoteId: QUOTE, shipmentId: SHIPMENT,
      packages: [{ heightCm: 10, widthCm: 20, depthCm: 30, weightKg: 1.5 }],
      brandProviderResourceId: "brand", addressProviderResourceId: "address", handlers: [{ id: HANDLER, handlerCode: "ARAS" }],
      order: { orderId: "64000000-0000-4000-8000-000000000001", orderNumber: "1001", customerName: "Celebix QA", customerEmail: "qa@example.com", customerPhone: "+905551112233", shippingAddress: { recipientName: "Celebix QA", line1: "Test", city: "İstanbul", country: "TR" }, codAmountCents: 0, handlerCode: "ARAS", items: [{ orderItemId: "65000000-0000-4000-8000-000000000001", productName: "Ürün", sku: "SKU-1", quantity: 1 }] },
    } }] : text.includes("shipping_quote_complete") ? [{ outcome: "completed", result_payload: {} }] : text.includes("shipping_validation_claim_job") ? [{ outcome: "claimed", result_payload: {
      jobId: JOB, storeId: STORE, profileId: PROFILE, providerCode: "basit_kargo", credentialVersion: 1,
      leaseId: LEASE, fenceToken: 1, version: 2,
    } }] : text.includes("shipping_validation_open_credential") ? [{ outcome: "opened", result_payload: {
      providerCode: "basit_kargo", credentialEnvelope: envelope, credentialDigest: "a".repeat(64),
      credentialKeyId: "shipping.current", credentialVersion: 1,
    } }] : [];
    return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
  }
  release() {}
}

test("an exact validation lease opens one credential bound to that claim", async () => {
  const client = new Client();
  const repository = new PostgresShippingWorkflowRepository({
    pool: { async connect() { return client; } }, role: "celebix_saas_workflow", keyring,
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
  });
  const claim = await repository.claimValidation({ jobId: JOB, workerId: "worker-1", now: NOW, leaseSeconds: 30, leaseId: LEASE });
  assert.ok(claim);
  const credential = await repository.openClaimedCredential({ claim, now: NOW });
  assert.equal(new TextDecoder().decode(credential.tokenBytes), "bk_live_secret_123456789");
  assert.equal(credential.providerCode, "basit_kargo");
  credential.tokenBytes.fill(0);
});

test("an exact fulfillment lease opens provider inputs without exposing the sealed envelope", async () => {
  const client = new Client();
  const repository = new PostgresShippingWorkflowRepository({
    pool: { async connect() { return client; } }, role: "celebix_saas_workflow", keyring,
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
  });
  const claim = await repository.claimFulfillment({ jobId: JOB, workerId: "worker-1", now: NOW, leaseSeconds: 30, leaseId: LEASE });
  assert.ok(claim);
  assert.equal(claim.jobKind, "create_shipment");
  const opened = await repository.openFulfillment({ claim, now: NOW });
  assert.equal(new TextDecoder().decode(opened.tokenBytes), "bk_live_secret_123456789");
  assert.equal(opened.order?.handlerCode, "ARAS");
  assert.equal(Object.hasOwn(opened, "credentialEnvelope"), false);
  opened.tokenBytes.fill(0);
});
