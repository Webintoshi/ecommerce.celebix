import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";

import {
  OrderEmailRepositoryError,
  PostgresOrderEmailWorkflowRepository,
  PostgresOrderRepository,
} from "../index.ts";

const STORE = "10000000-0000-4000-8000-000000000089";
const ORDER = "20000000-0000-4000-8000-000000000089";
const DELIVERY = "30000000-0000-4000-8000-000000000089";
const LEASE = "40000000-0000-4000-8000-000000000089";
const PRINCIPAL = "50000000-0000-4000-8000-000000000089";
const MEMBERSHIP = "60000000-0000-4000-8000-000000000089";
const PLAN = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-05T12:00:00.000Z");
const LEASE_EXPIRES = new Date("2026-08-05T12:05:00.000Z");
const IDEMPOTENCY_EXPIRES = new Date("2026-08-06T12:00:00.000Z");

type Row = Record<string, unknown>;
type Responder = (text: string, values: unknown[]) => Row[] | Promise<Row[]>;

class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: unknown[] = [];
  private readonly responder: Responder;
  constructor(responder: Responder) { this.responder = responder; }
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const rows = await this.responder(text, values);
    return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
  }
  release(value?: unknown) { this.releases.push(value); }
}

class Pool {
  private readonly client: Client;
  constructor(client: Client) { this.client = client; }
  async connect() { return this.client; }
}

const timeouts = Object.freeze({ poolCheckoutMs: 100, statementMs: 1_000, lockMs: 500, idleTransactionMs: 1_000 });

function projection() {
  return {
    recipient: "ada@example.test",
    senderLabel: "Güzide Kuyumcu",
    replyTo: "support@example.test",
    storeName: "Güzide Kuyumcu",
    primaryColor: "#a36b3f",
    logoUrl: "https://media.saas-staging.celebix.site/stores/logo.webp",
    storefrontOrigin: "https://guzide.saas-staging.celebix.site",
    adminOrigin: "https://guzide.admin.saas-staging.celebix.site",
    orderNumber: "CX-1001",
    customerName: "Ada Lovelace",
    currency: "TRY",
    subtotalCents: 12_000,
    shippingCents: 500,
    discountCents: 0,
    totalCents: 12_500,
    shippingAddress: { recipientName: "Ada Lovelace", line1: "Ada Sokak 1", city: "İstanbul", country: "TR" },
    tracking: null,
    items: [{ productName: "Altın Kolye", variantName: null, sku: "ALT-1", unitPriceCents: 12_000, quantity: 1, discountCents: 0, lineTotalCents: 12_000 }],
  };
}

function unsealedClaim(overrides: Record<string, unknown> = {}) {
  return {
    deliveryId: DELIVERY,
    storeId: STORE,
    orderId: ORDER,
    eventType: "order_received",
    recipientKind: "customer",
    attemptCount: 1,
    idempotencyKey: `order-email/v1/${DELIVERY}`,
    firstAttemptAt: null,
    idempotencyExpiresAt: null,
    sealKeyId: null,
    sealedRequest: null,
    requestDigest: null,
    projection: projection(),
    ...overrides,
  };
}

function sealedClaim(overrides: Record<string, unknown> = {}) {
  const request = Buffer.from("sealed request authority".padEnd(32, "!"));
  return unsealedClaim({
    attemptCount: 2,
    firstAttemptAt: NOW.toISOString(),
    idempotencyExpiresAt: IDEMPOTENCY_EXPIRES.toISOString(),
    sealKeyId: "order_email_01",
    sealedRequest: request.toString("base64"),
    requestDigest: "a".repeat(64),
    projection: null,
    ...overrides,
  });
}

function workflowRepository(client: Client) {
  return new PostgresOrderEmailWorkflowRepository({
    pool: new Pool(client), role: "celebix_saas_workflow", timeouts, uuid: () => LEASE,
  });
}

function tenantContext(): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "private-request",
    principal: { id: PRINCIPAL, issuer: "https://identity.example.test/oidc", subject: "private-subject" },
    store: { id: STORE, slug: "guzide", status: "active" },
    membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1, planId: PLAN, planCode: "free_starter", version: 1, status: "active",
      features: ["catalog", "orders"], limits: { products: 100, staff: 5, storageBytes: 1_024 },
      validFrom: "2026-01-01T00:00:00.000Z", validUntil: "2027-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  };
}

function orderRepository(client: Client) {
  return new PostgresOrderRepository({
    pool: new Pool(client), role: "celebix_saas_app", timeouts,
    generateId: () => DELIVERY, audit: () => undefined,
  });
}

function rpcCall(client: Client, name: string) {
  const selected = client.calls.find(({ text }) => text.includes(`saas.${name}`));
  assert.ok(selected, `${name} call missing`);
  return selected;
}

test("order email claim parses exact unsealed and sealed batches under workflow role", async () => {
  const unsealedClient = new Client((text) => text.includes("order_email_work_claim")
    ? [{ outcome: "claimed", result_payload: { items: [unsealedClaim()] } }] : []);
  const unsealed = await workflowRepository(unsealedClient).claim({
    workerId: "order.worker", now: NOW, leaseExpiresAt: LEASE_EXPIRES, limit: 25,
  });
  assert.equal(unsealed.kind, "claimed");
  if (unsealed.kind !== "claimed") return;
  assert.equal(unsealed.leaseId, LEASE);
  assert.equal(unsealed.items[0]?.kind, "unsealed");
  assert.equal(unsealed.items[0]?.projection.recipient, "ada@example.test");
  assert.equal(Object.isFrozen(unsealed.items[0]?.projection.items), true);
  const claimCall = rpcCall(unsealedClient, "order_email_work_claim");
  assert.match(claimCall.text, /\$1::text,\$2::timestamptz,\$3::timestamptz,\$4::integer,\$5::uuid/u);
  assert.deepEqual(claimCall.values, ["order.worker", NOW, LEASE_EXPIRES, 25, LEASE]);
  assert.equal(unsealedClient.calls.some(({ text }) => text === "SET LOCAL ROLE celebix_saas_workflow"), true);

  const sealedClient = new Client((text) => text.includes("order_email_work_claim")
    ? [{ outcome: "claimed", result_payload: { items: [sealedClaim()] } }] : []);
  const sealed = await workflowRepository(sealedClient).claim({ workerId: "order.worker", now: NOW, leaseExpiresAt: LEASE_EXPIRES, limit: 1 });
  assert.equal(sealed.kind, "claimed");
  if (sealed.kind !== "claimed") return;
  assert.equal(sealed.items[0]?.kind, "sealed");
  assert.equal(sealed.items[0]?.sealedRequest, Buffer.from("sealed request authority".padEnd(32, "!")).toString("base64"));
});

test("order email claim rejects cross-shape, corrupt, and extra provider data", async () => {
  for (const claim of [
    unsealedClaim({ sealedRequest: Buffer.from("wrong").toString("base64") }),
    sealedClaim({ projection: projection() }),
    sealedClaim({ idempotencyExpiresAt: "2026-08-07T12:00:00.000Z" }),
    unsealedClaim({ recipient: "ada@example.test" }),
  ]) {
    const client = new Client((text) => text.includes("order_email_work_claim")
      ? [{ outcome: "claimed", result_payload: { items: [claim] } }] : []);
    await assert.rejects(workflowRepository(client).claim({
      workerId: "order.worker", now: NOW, leaseExpiresAt: LEASE_EXPIRES, limit: 1,
    }), (error: unknown) => error instanceof OrderEmailRepositoryError && error.code === "unavailable");
  }
});

test("workflow mutations call only exact bounded RPCs", async () => {
  const client = new Client((text) => {
    if (text.includes("order_email_work_seal")) return [{ outcome: "sealed", result_payload: { deliveryId: DELIVERY } }];
    if (text.includes("order_email_work_accept")) return [{ outcome: "accepted", result_payload: { deliveryId: DELIVERY } }];
    if (text.includes("order_email_work_fail")) return [{ outcome: "retry_scheduled", result_payload: { deliveryId: DELIVERY, retryable: true } }];
    if (text.includes("order_email_provider_event_record")) return [{ outcome: "operation_replayed", result_payload: { providerEventId: "svix-089" } }];
    return [];
  });
  const repository = workflowRepository(client);
  const sealed = Buffer.alloc(64, 7);
  await repository.seal({
    deliveryId: DELIVERY, leaseId: LEASE, workerId: "order.worker", now: NOW,
    sealKeyId: "order_email_01", sealedRequest: sealed, requestDigest: "a".repeat(64),
    recipientDigest: "b".repeat(64), recipientMask: "a•••@example.test", firstAttemptAt: NOW,
    idempotencyExpiresAt: IDEMPOTENCY_EXPIRES,
  });
  await repository.accept({ deliveryId: DELIVERY, leaseId: LEASE, workerId: "order.worker", now: NOW, providerMessageId: "resend-message-089" });
  const fail = await repository.fail({ deliveryId: DELIVERY, leaseId: LEASE, workerId: "order.worker", now: NOW, errorCode: "provider_unavailable", retryable: true, nextAttemptAt: new Date("2026-08-05T12:00:30.000Z") });
  const receipt = await repository.recordProviderEvent({ providerEventId: "svix-089", providerMessageId: "resend-message-089", type: "delivered", occurredAt: NOW, receivedAt: NOW });
  assert.equal(fail, "retry_scheduled");
  assert.equal(receipt, "replayed");
  assert.deepEqual(rpcCall(client, "order_email_work_seal").values.slice(0, 6), [DELIVERY, LEASE, "order.worker", NOW, "order_email_01", sealed]);
  assert.equal(client.calls.some(({ text }) => /INSERT|UPDATE|DELETE/u.test(text)), false);
});

test("admin order repository lists masked deliveries and schedules a safe retry", async () => {
  const summary = {
    id: DELIVERY, eventType: "order_received", recipientKind: "customer",
    recipientMask: "a•••@example.test", status: "failed", occurredAt: NOW.toISOString(), canRetry: true,
  };
  const client = new Client((text) => {
    if (text.includes("order_email_admin_list")) return [{ outcome: "listed", result_payload: { items: [summary] } }];
    if (text.includes("order_email_admin_retry")) return [{ outcome: "scheduled", result_payload: summary }];
    return [];
  });
  const repository = orderRepository(client);
  const listed = await repository.listEmailDeliveries({ tenantContext: tenantContext(), now: NOW, orderId: ORDER });
  const retried = await repository.retryEmailDelivery({ tenantContext: tenantContext(), now: NOW, orderId: ORDER, deliveryId: DELIVERY });
  assert.deepEqual(listed, [summary]);
  assert.deepEqual(retried, summary);
  assert.equal(Object.isFrozen(listed), true);
  assert.deepEqual(rpcCall(client, "order_email_admin_list").values, [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "free_starter", 1, NOW, ORDER]);
  assert.deepEqual(rpcCall(client, "order_email_admin_retry").values, [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "free_starter", 1, NOW, ORDER, DELIVERY]);
});
