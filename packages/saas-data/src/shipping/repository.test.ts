import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";

import { PostgresShippingAdminRepository } from "./repository.ts";
import type { ShippingCredentialKeyring } from "./credential-crypto.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000001";
const PLAN = "00000000-0000-4000-8000-000000000101";
const PROFILE = "40000000-0000-4000-8000-000000000001";
const JOB = "50000000-0000-4000-8000-000000000001";
const OPERATION = "60000000-0000-4000-8000-000000000001";
const ORDER = "70000000-0000-4000-8000-000000000001";
const QUOTE = "71000000-0000-4000-8000-000000000001";
const QUOTE_JOB = "72000000-0000-4000-8000-000000000001";
const OPTION = "73000000-0000-4000-8000-000000000001";
const SHIPMENT = "74000000-0000-4000-8000-000000000001";
const SHIPMENT_JOB = "75000000-0000-4000-8000-000000000001";
const EVENT = "76000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-06T12:00:00.000Z");
const CONNECTION = Object.freeze({
  providerCode: "basit_kargo" as const,
  displayName: "Basit Kargo",
  status: "pending" as const,
  credentialVersion: 1,
  codDeliveredMarksPaid: false,
  version: 1,
});

function tenant(): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "shipping-request",
    principal: { id: PRINCIPAL, issuer: "https://identity.test", subject: "owner" },
    store: { id: STORE, slug: "shipping", status: "active" },
    membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1, planId: PLAN, planCode: "starter", version: 1, status: "active",
      features: ["integrations"], limits: { products: 1, staff: 1, storageBytes: 1 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  } as TenantContext;
}

class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  private readonly responder: (text: string, values: unknown[]) => Record<string, unknown>[];
  constructor(responder: (text: string, values: unknown[]) => Record<string, unknown>[]) { this.responder = responder; }
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const rows = this.responder(text, values);
    return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
  }
  release() {}
}

function keyring(): ShippingCredentialKeyring {
  return Object.freeze({ activeKeyId: "shipping.current", keys: Object.freeze([
    Object.freeze({ keyId: "shipping.current", key: new Uint8Array(32).fill(7) }),
  ]) });
}

test("connection save resolves private identity, writes ciphertext, and never sends the raw token to SQL", async () => {
  const client = new Client((text) => {
    if (text.includes("shipping_connection_setup")) return [{ outcome: "not_found", result_payload: null }];
    if (text.includes("shipping_connection_save")) return [{ outcome: "saved", result_payload: CONNECTION }];
    return [];
  });
  const ids = [PROFILE, JOB];
  const repository = new PostgresShippingAdminRepository({
    pool: { async connect() { return client; } }, role: "celebix_saas_app", keyring: keyring(),
    generateId() { return ids.shift()!; }, audit() {},
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
  });
  const result = await repository.saveConnection({
    tenantContext: tenant(), now: NOW, providerCode: "basit_kargo", operationId: OPERATION,
    token: "bk_live_secret_123456789",
  });
  assert.equal(result.connection.status, "pending");
  assert.equal(result.validationJobId, JOB);
  const serialized = JSON.stringify(client.calls);
  assert.doesNotMatch(serialized, /bk_live_secret_123456789/u);
  const save = client.calls.find((call) => call.text.includes("shipping_connection_save"));
  assert.ok(save);
  assert.match(String(save.values[12]), /"algorithm":"A256GCM"/u);
});

test("current returns only the public connection projection", async () => {
  const client = new Client((text) => text.includes("shipping_connection_current")
    ? [{ outcome: "found", result_payload: CONNECTION }]
    : []);
  const repository = new PostgresShippingAdminRepository({
    pool: { async connect() { return client; } }, role: "celebix_saas_app", keyring: keyring(),
    generateId() { return PROFILE; }, audit() {},
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
  });
  assert.deepEqual(await repository.current({ tenantContext: tenant(), now: NOW, providerCode: "basit_kargo" }), CONNECTION);
});

test("shipping quote begins with a deterministic opaque credential and replays the same durable job", async () => {
  let beginCalls = 0;
  const packages = Object.freeze([{ heightCm: 10, widthCm: 20, depthCm: 30, weightKg: 1.5 }]);
  const client = new Client((text) => text.includes("shipping_quote_begin") ? [{
    outcome: beginCalls++ === 0 ? "queued" : "operation_replayed",
    result_payload: { jobId: QUOTE_JOB, quote: { quoteId: QUOTE, status: "queued", expiresAt: "2026-08-06T12:10:00.000000Z", currency: "TRY", packages, options: [], version: 1 } },
  }] : []);
  const ids = [QUOTE, QUOTE_JOB, "71000000-0000-4000-8000-000000000002", "72000000-0000-4000-8000-000000000002"];
  const repository = new PostgresShippingAdminRepository({
    pool: { async connect() { return client; } }, role: "celebix_saas_app", keyring: keyring(), generateId() { return ids.shift()!; }, audit() {},
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
  });
  const input = { tenantContext: tenant(), now: NOW, orderId: ORDER, expectedOrderVersion: 3, packages, operationId: OPERATION };
  const first = await repository.beginQuote(input), replay = await repository.beginQuote(input);
  assert.match(first.credential, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(first.credential, replay.credential);
  assert.equal(replay.jobId, QUOTE_JOB);
  assert.equal(replay.replayed, true);
  assert.doesNotMatch(JSON.stringify(client.calls), new RegExp(first.credential, "u"));
});

test("shipment begin sends only quote digest and parses the safe shipment projection", async () => {
  const projection = {
    id: SHIPMENT, providerCode: "basit_kargo", direction: "outgoing", status: "creating", priceCents: 12900,
    codAmountCents: 0, currency: "TRY", items: [{ orderItemId: ORDER, productName: "Ürün", quantity: 1 }],
    events: [{ id: EVENT, status: "creating", occurredAt: "2026-08-06T12:00:00.000000Z" }],
    label: { available: false }, version: 1, createdAt: "2026-08-06T12:00:00.000000Z", updatedAt: "2026-08-06T12:00:00.000000Z",
  };
  const client = new Client((text) => text.includes("shipping_shipment_begin")
    ? [{ outcome: "queued", result_payload: { jobId: SHIPMENT_JOB, shipment: projection } }]
    : text.includes("shipping_shipment_for_order") ? [{ outcome: "found", result_payload: projection }] : []);
  const ids = [SHIPMENT, SHIPMENT_JOB, EVENT];
  const repository = new PostgresShippingAdminRepository({
    pool: { async connect() { return client; } }, role: "celebix_saas_app", keyring: keyring(), generateId() { return ids.shift()!; }, audit() {},
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
  });
  const quoteCredential = "quote_0123456789abcdef0123456789abcdef";
  const result = await repository.beginShipment({ tenantContext: tenant(), now: NOW, orderId: ORDER, expectedOrderVersion: 3, quoteCredential, optionId: OPTION, operationId: OPERATION });
  assert.equal(result.shipment.id, SHIPMENT);
  assert.equal(result.jobId, SHIPMENT_JOB);
  assert.doesNotMatch(JSON.stringify(client.calls), new RegExp(quoteCredential, "u"));
  assert.equal((await repository.currentShipmentForOrder({ tenantContext: tenant(), now: NOW, orderId: ORDER }))?.id, SHIPMENT);
});
