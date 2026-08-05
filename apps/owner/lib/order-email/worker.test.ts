import assert from "node:assert/strict";
import test from "node:test";

import type { OrderEmailClaim, OrderEmailProjection, OrderEmailWorkflowRepository } from "@celebix/saas-data";

import { sealOrderEmailRequest, type OrderEmailKeyring, type OrderEmailProviderRequest } from "./seal.ts";
import { createOrderEmailWorker } from "./worker.ts";

const NOW = new Date("2026-08-05T12:00:00.000Z");
const DELIVERY = "11111111-1111-4111-8111-111111111111";
const STORE = "22222222-2222-4222-8222-222222222222";
const ORDER = "33333333-3333-4333-8333-333333333333";
const LEASE = "44444444-4444-4444-8444-444444444444";
const keyring: OrderEmailKeyring = Object.freeze({ activeKeyId: "order_email_01", keys: Object.freeze({ order_email_01: Buffer.alloc(32, 4) }) });

function projection(): OrderEmailProjection {
  return {
    recipient: "customer@example.test", senderLabel: "Güzide Kuyumcu", replyTo: "destek@example.test",
    storeName: "Güzide Kuyumcu", primaryColor: "#171717", storefrontOrigin: "https://guzide.example.test",
    adminOrigin: "https://admin.guzide.example.test", orderNumber: "GK-1042", customerName: "Ada",
    currency: "TRY", subtotalCents: 100_000, shippingCents: 0, discountCents: 0, totalCents: 100_000,
    shippingAddress: { recipientName: "Ada", line1: "Gül Sok. 1", city: "İstanbul", country: "TR" },
    items: [{ productName: "Kolye", unitPriceCents: 100_000, quantity: 1, discountCents: 0, lineTotalCents: 100_000 }],
  };
}
function unsealed(attemptCount = 1): OrderEmailClaim {
  return Object.freeze({ kind: "unsealed", deliveryId: DELIVERY, storeId: STORE, orderId: ORDER, eventType: "order_received", recipientKind: "customer", attemptCount, idempotencyKey: `order-email/v1/${DELIVERY}`, projection: projection() });
}

class Repository implements OrderEmailWorkflowRepository {
  readonly sealed: unknown[] = [];
  readonly accepted: unknown[] = [];
  readonly failed: unknown[] = [];
  constructor(readonly items: OrderEmailClaim[]) {}
  async claim() { return this.items.length ? Object.freeze({ kind: "claimed" as const, leaseId: LEASE, items: Object.freeze(this.items) }) : Object.freeze({ kind: "empty" as const }); }
  async seal(input: unknown) { this.sealed.push(input); }
  async accept(input: unknown) { this.accepted.push(input); }
  async fail(input: any) { this.failed.push(input); return input.retryable ? "retry_scheduled" as const : "failed" as const; }
  async recordProviderEvent() { return "recorded" as const; }
}

test("first claim renders, substitutes test recipient, seals, sends, and accepts exactly once", async () => {
  const repository = new Repository([unsealed()]);
  const sent: { request: OrderEmailProviderRequest; key: string }[] = [];
  const worker = createOrderEmailWorker({
    repository, keyring, deliveryMode: "test", testRecipient: "qa@celebix.co", senderEmail: "siparis@notify.celebix.co",
    workerId: "order-email-1", now: () => NOW, leaseDurationMs: 90_000, claimLimit: 25, concurrency: 2,
    async send(request, key) { sent.push({ request, key }); return { kind: "accepted", providerMessageId: "resend-1042" }; },
  });
  assert.equal(await worker.runOnce(), "processed");
  assert.equal(repository.sealed.length, 1, JSON.stringify(repository.failed));
  assert.equal(repository.accepted.length, 1);
  assert.equal(repository.failed.length, 0);
  assert.equal(sent[0]?.request.to, "qa@celebix.co");
  assert.match(sent[0]?.request.subject ?? "", /^\[TEST\] /u);
  assert.equal(sent[0]?.request.from, "Güzide Kuyumcu <siparis@notify.celebix.co>");
  assert.equal(sent[0]?.key, `order-email/v1/${DELIVERY}`);
});

test("sealed retries reuse the byte-identical request and exact approved backoff", async () => {
  const request = Object.freeze({ from: "Güzide Kuyumcu <siparis@notify.celebix.co>", to: "customer@example.test", subject: "Siparişinizi aldık · GK-1042", html: "<p>Hazır</p>", text: "Hazır" });
  const envelope = sealOrderEmailRequest(request, keyring, () => Buffer.alloc(12, 5));
  const claim: OrderEmailClaim = Object.freeze({
    kind: "sealed", deliveryId: DELIVERY, storeId: STORE, orderId: ORDER, eventType: "order_received", recipientKind: "customer",
    attemptCount: 2, idempotencyKey: `order-email/v1/${DELIVERY}`, firstAttemptAt: NOW.toISOString(),
    idempotencyExpiresAt: new Date(NOW.getTime() + 86_400_000).toISOString(), sealKeyId: envelope.keyId,
    sealedRequest: envelope.bytes.toString("base64"), requestDigest: envelope.digest,
  });
  const repository = new Repository([claim]);
  const sent: OrderEmailProviderRequest[] = [];
  const worker = createOrderEmailWorker({
    repository, keyring, deliveryMode: "live", senderEmail: "siparis@notify.celebix.co", workerId: "order-email-1",
    now: () => NOW, leaseDurationMs: 90_000, claimLimit: 25, concurrency: 2,
    async send(value) { sent.push(value); return { kind: "retryable", code: "provider_unavailable" }; },
  });
  assert.equal(await worker.runOnce(), "processed");
  assert.deepEqual(sent, [request]);
  assert.equal(repository.sealed.length, 0);
  assert.deepEqual(repository.failed[0], {
    deliveryId: DELIVERY, leaseId: LEASE, workerId: "order-email-1", now: NOW,
    errorCode: "provider_unavailable", retryable: true, nextAttemptAt: new Date(NOW.getTime() + 120_000),
  });
});

test("expired or eighth-attempt work becomes terminal without unsafe additional retry", async () => {
  const request = Object.freeze({ from: "Store <siparis@notify.celebix.co>", to: "customer@example.test", subject: "Bilgi", html: "<p>Bilgi</p>", text: "Bilgi" });
  const envelope = sealOrderEmailRequest(request, keyring, () => Buffer.alloc(12, 6));
  const base = { kind: "sealed" as const, deliveryId: DELIVERY, storeId: STORE, orderId: ORDER, eventType: "order_received" as const, recipientKind: "customer" as const, idempotencyKey: `order-email/v1/${DELIVERY}`, firstAttemptAt: new Date(NOW.getTime() - 86_400_001).toISOString(), idempotencyExpiresAt: new Date(NOW.getTime() - 1).toISOString(), sealKeyId: envelope.keyId, sealedRequest: envelope.bytes.toString("base64"), requestDigest: envelope.digest };
  let sends = 0;
  const expiredRepository = new Repository([Object.freeze({ ...base, attemptCount: 3 })]);
  const common = { keyring, deliveryMode: "live" as const, senderEmail: "siparis@notify.celebix.co", workerId: "order-email-1", now: () => NOW, leaseDurationMs: 90_000, claimLimit: 25, concurrency: 2, async send() { sends += 1; return { kind: "retryable" as const, code: "provider_unavailable" }; } };
  await createOrderEmailWorker({ ...common, repository: expiredRepository }).runOnce();
  assert.equal(sends, 0);
  assert.equal((expiredRepository.failed[0] as any).errorCode, "idempotency_window_expired");
  assert.equal((expiredRepository.failed[0] as any).retryable, false);

  const liveBase = { ...base, firstAttemptAt: NOW.toISOString(), idempotencyExpiresAt: new Date(NOW.getTime() + 86_400_000).toISOString(), attemptCount: 8 };
  const eighthRepository = new Repository([Object.freeze(liveBase)]);
  await createOrderEmailWorker({ ...common, repository: eighthRepository }).runOnce();
  assert.equal(sends, 1);
  assert.equal((eighthRepository.failed[0] as any).retryable, false);
});
