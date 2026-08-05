import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";

import {
  PostgresStoreDomainRepository,
  PostgresStoreDomainWorkflowRepository,
  StoreDomainRepositoryError,
} from "./index.ts";

const STORE = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP = "55555555-5555-4555-8555-555555555555";
const PLAN = "66666666-6666-4666-8666-666666666666";
const DOMAIN = "77777777-7777-4777-8777-777777777777";
const OPERATION = "88888888-8888-4888-8888-888888888888";
const LEASE = "99999999-9999-4999-8999-999999999999";
const NOW = new Date("2026-08-05T12:00:00.000Z");

function tenant(): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "private",
    principal: { id: PRINCIPAL, issuer: "https://id.test/oidc", subject: "private" },
    store: { id: STORE, slug: "store", status: "active" },
    membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: PLAN,
      planCode: "pilot",
      version: 1,
      status: "active",
      features: ["custom_domains"],
      limits: { products: 2_000, staff: 5, storageBytes: 10_000_000_000, customDomains: 1 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  };
}

type Row = Record<string, unknown>;
type Responder = (text: string, values: unknown[]) => Row[] | Promise<Row[]>;

class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: unknown[] = [];
  private readonly responder: Responder;
  constructor(responder: Responder = () => []) { this.responder = responder; }
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const rows = await this.responder(text, values);
    return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
  }
  release(value?: unknown) { this.releases.push(value); }
}

class Pool {
  private index = 0;
  private readonly clients: Client[];
  constructor(clients: Client[]) { this.clients = clients; }
  async connect() {
    const client = this.clients[this.index++];
    if (!client) throw new Error("checkout");
    return client;
  }
}

const TIMEOUTS = Object.freeze({ poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 });
const domain = Object.freeze({
  schemaVersion: 1,
  id: DOMAIN,
  hostname: "www.example.com",
  hostnameType: "custom_domain",
  status: "pending",
  primary: false,
  uiStatus: "dns_pending",
  dnsInstructions: [{ type: "CNAME", name: "www", value: "shops.celebix.site" }],
  verifiedAt: null,
  version: 1,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
});

function merchant(pool: Pool) {
  return new PostgresStoreDomainRepository({ pool, role: "celebix_saas_app", timeouts: TIMEOUTS });
}

function workflow(pool: Pool) {
  return new PostgresStoreDomainWorkflowRepository({ pool, role: "celebix_saas_workflow", timeouts: TIMEOUTS });
}

function call(client: Client, name: string) {
  const found = client.calls.find((entry) => entry.text.includes(`saas.${name}`));
  assert.ok(found);
  return found;
}

test("lists exact tenant domain projections through durable authority", async () => {
  const client = new Client((text) => text.includes("merchant_store_domain_list")
    ? [{ outcome: "listed", result_payload: { items: [domain] } }]
    : []);
  assert.deepEqual(await merchant(new Pool([client])).list({ tenantContext: tenant(), now: NOW }), [domain]);
  assert.deepEqual(call(client, "merchant_store_domain_list").values, [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "pilot", 1, NOW]);
  assert.equal(client.calls.some((entry) => entry.text === "SET LOCAL ROLE celebix_saas_app"), true);
});

test("prepares one idempotent custom hostname without browser tenant authority", async () => {
  const client = new Client((text) => text.includes("merchant_store_domain_prepare_create")
    ? [{ outcome: "prepared", result_payload: domain }]
    : []);
  const result = await merchant(new Pool([client])).prepareCreate({
    tenantContext: tenant(),
    now: NOW,
    operationId: OPERATION,
    fingerprint: "a".repeat(64),
    domainId: DOMAIN,
    hostname: "www.example.com",
    provider: "cloudflare_for_saas",
    cnameTarget: "shops.celebix.site",
  });
  assert.deepEqual(result, { domain, replayed: false });
  assert.deepEqual(call(client, "merchant_store_domain_prepare_create").values, [
    STORE, PRINCIPAL, MEMBERSHIP, PLAN, "pilot", 1, NOW, OPERATION, "a".repeat(64), DOMAIN,
    "www.example.com", "cloudflare_for_saas", "shops.celebix.site",
  ]);
});

test("marks a durable prepare replay so provider creation is never repeated", async () => {
  const client = new Client((text) => text.includes("merchant_store_domain_prepare_create")
    ? [{ outcome: "operation_replayed", result_payload: domain }]
    : []);
  const result = await merchant(new Pool([client])).prepareCreate({
    tenantContext: tenant(), now: NOW, operationId: OPERATION, fingerprint: "a".repeat(64), domainId: DOMAIN,
    hostname: "www.example.com", provider: "cloudflare_for_saas", cnameTarget: "shops.celebix.site",
  });
  assert.deepEqual(result, { domain, replayed: true });
});

test("claims bounded reconciliation work with the workflow role", async () => {
  const claim = Object.freeze({
    domainId: DOMAIN,
    storeId: STORE,
    hostname: "www.example.com",
    providerHostnameId: "cf-host-1",
    attemptCount: 1,
    leaseId: LEASE,
    leaseOwner: "domain-worker-1",
    leaseExpiresAt: new Date(NOW.getTime() + 30_000).toISOString(),
    requestedRemoval: false,
  });
  const client = new Client((text) => text.includes("store_domain_work_claim")
    ? [{ outcome: "claimed", result_payload: { items: [claim] } }]
    : []);
  assert.deepEqual(await workflow(new Pool([client])).claim({
    workerId: "domain-worker-1",
    now: NOW,
    leaseExpiresAt: new Date(NOW.getTime() + 30_000),
    limit: 5,
  }), [claim]);
  assert.equal(client.calls.some((entry) => entry.text === "SET LOCAL ROLE celebix_saas_workflow"), true);
  assert.deepEqual(call(client, "store_domain_work_claim").values.slice(0, 4), ["domain-worker-1", NOW, new Date(NOW.getTime() + 30_000), 5]);
});

test("rejects malformed durable projections and database unavailability", async () => {
  const malformed = new Client((text) => text.includes("merchant_store_domain_list")
    ? [{ outcome: "listed", result_payload: { items: [{ ...domain, providerHostnameId: "private" }] } }]
    : []);
  await assert.rejects(
    () => merchant(new Pool([malformed])).list({ tenantContext: tenant(), now: NOW }),
    (error: unknown) => error instanceof StoreDomainRepositoryError && error.code === "unavailable",
  );
  await assert.rejects(
    () => merchant(new Pool([])).list({ tenantContext: tenant(), now: NOW }),
    (error: unknown) => error instanceof StoreDomainRepositoryError && error.code === "unavailable",
  );
});
