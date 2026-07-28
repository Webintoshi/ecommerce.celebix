import assert from "node:assert/strict";
import test from "node:test";

import type { CatalogOnboardingResult, TenantContext } from "@celebix/saas-contracts";

import { CatalogOnboardingRepositoryError, PostgresCatalogOnboardingRepository } from "./index.ts";

const STORE = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP = "55555555-5555-4555-8555-555555555555";
const PLAN = "66666666-6666-4666-8666-666666666666";
const OPERATION = "70000000-0000-4000-8000-000000000001";
const PRODUCT = "71000000-0000-4000-8000-000000000001";
const VARIANT = "72000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-28T12:00:00.000Z");

function tenant(): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "private",
    principal: { id: PRINCIPAL, issuer: "https://identity.example.test/oidc", subject: "private" },
    store: { id: STORE, slug: "magaza", status: "active" },
    membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: PLAN,
      planCode: "growth",
      version: 2,
      status: "active",
      features: ["catalog"],
      limits: { products: 100, staff: 5, storageBytes: 1024 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  } as TenantContext;
}

function onboardingResult(replayed = false): CatalogOnboardingResult {
  return {
    product: {
      id: PRODUCT,
      storeId: STORE,
      slug: "seramik-kupa",
      title: "Seramik Kupa",
      status: "draft",
      currency: "TRY",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      version: 1,
    },
    variants: [{
      id: VARIANT,
      productId: PRODUCT,
      storeId: STORE,
      title: "Standart",
      priceCents: 12990,
      stockTracking: true,
      stockQuantity: 0,
      status: "active",
      attributes: {},
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      version: 1,
    }],
    profile: {
      productType: "physical",
      minimumPurchaseQuantity: 1,
      version: 1,
      updatedAt: NOW.toISOString(),
    },
    categoryIds: [],
    resourceIds: { collections: [], tags: [], attributes: [], extras: [], definitions: [] },
    channelIds: [],
    mediaCount: 0,
    replayed,
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

function repository(pool: Pool, audit: string[] = [], ids: string[] = [PRODUCT, VARIANT]) {
  const generated = [...ids];
  return new PostgresCatalogOnboardingRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    uuid: () => generated.shift() ?? PRODUCT,
    audit: (event) => { audit.push(event.type); },
  });
}

function sqlCall(client: Client, name: string) {
  const selected = client.calls.filter(({ text }) => text.includes(`saas.${name}`));
  assert.equal(selected.length, 1);
  return selected[0]!;
}

test("createProduct validates, fingerprints, and sends one SQL mutation", async () => {
  const writer = new Client((text) => text.includes("catalog_onboard_product")
    ? [{ outcome: "created", result_payload: onboardingResult() }]
    : []);
  const result = await repository(new Pool([writer])).createProduct({
    tenantContext: tenant(),
    now: NOW,
    operationId: OPERATION,
    intent: { kind: "quick", title: "Seramik Kupa", priceCents: 12990, publish: false },
  });

  assert.equal(result.product.slug, "seramik-kupa");
  const call = sqlCall(writer, "catalog_onboard_product");
  assert.deepEqual(call.values.slice(0, 8), [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, 100, NOW]);
  assert.equal(call.values[8], OPERATION);
  assert.match(String(call.values[9]), /^[a-f0-9]{64}$/);
  assert.equal(call.values[10], PRODUCT);
  assert.deepEqual(call.values[11], [VARIANT]);
  assert.deepEqual(JSON.parse(String(call.values[12])), { kind: "quick", title: "Seramik Kupa", priceCents: 12990, publish: false });
  assert.equal(writer.calls.filter(({ text }) => text === "BEGIN ISOLATION LEVEL READ COMMITTED").length, 1);
});

test("unknown COMMIT destroys writer and performs exactly one read-only recovery", async () => {
  let commits = 0;
  const writer = new Client((text) => {
    if (text.includes("catalog_onboard_product")) return [{ outcome: "created", result_payload: onboardingResult() }];
    if (text === "COMMIT" && commits++ === 0) throw new Error("wire");
    return [];
  });
  const recovery = new Client((text) => text.includes("catalog_recover_onboarding_operation")
    ? [{ outcome: "operation_replayed", result_payload: onboardingResult(true) }]
    : []);
  const audit: string[] = [];
  const result = await repository(new Pool([writer, recovery]), audit).createProduct({
    tenantContext: tenant(), now: NOW, operationId: OPERATION,
    intent: { kind: "quick", title: "Seramik Kupa", priceCents: 12990, publish: false },
  });

  assert.equal(result.replayed, true);
  assert.deepEqual(writer.releases, [true]);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(recovery.calls.filter(({ text }) => text.includes("catalog_recover_onboarding_operation")).length, 1);
  assert.equal(recovery.calls.some(({ text }) => text.includes("catalog_onboard_product")), false);
  assert.deepEqual(audit, ["catalog_onboarding_commit_unknown"]);
});

test("reads use read-only transactions and exact durable authority", async () => {
  const options = { categories: [], resources: [], locations: [], channels: [] };
  const reader = new Client((text) => text.includes("catalog_get_onboarding_options")
    ? [{ outcome: "found", result_payload: options }]
    : []);
  assert.deepEqual(await repository(new Pool([reader])).getOptions({ tenantContext: tenant(), now: NOW }), options);
  assert.equal(reader.calls[0]?.text, "BEGIN READ ONLY");
  assert.deepEqual(sqlCall(reader, "catalog_get_onboarding_options").values, [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, 100, NOW]);
});

test("unknown keys and browser store authority fail before SQL", async () => {
  await assert.rejects(
    () => repository(new Pool([])).createProduct({
      tenantContext: tenant(), now: NOW, operationId: OPERATION,
      intent: { kind: "quick", title: "Kupa", priceCents: 100, publish: false },
      storeId: STORE,
    } as never),
    (error: unknown) => error instanceof CatalogOnboardingRepositoryError && error.code === "invalid_input",
  );
});

test("operation outcomes are mapped to fixed repository errors", async () => {
  const writer = new Client((text) => text.includes("catalog_onboard_product")
    ? [{ outcome: "product_limit_reached", result_payload: null }]
    : []);
  await assert.rejects(
    () => repository(new Pool([writer])).createProduct({
      tenantContext: tenant(), now: NOW, operationId: OPERATION,
      intent: { kind: "quick", title: "Kupa", priceCents: 100, publish: false },
    }),
    (error: unknown) => error instanceof CatalogOnboardingRepositoryError && error.code === "product_limit_reached",
  );
});
