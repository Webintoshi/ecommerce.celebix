import assert from "node:assert/strict";
import test from "node:test";
import type { TenantContext } from "@celebix/saas-contracts";
import { CatalogMigrationRepositoryError, PostgresCatalogMigrationRepository } from "./index.ts";

const STORE = "31000000-0000-4000-8000-000000000001";
const PRINCIPAL = "31000000-0000-4000-8000-000000000002";
const MEMBERSHIP = "31000000-0000-4000-8000-000000000003";
const PLAN = "31000000-0000-4000-8000-000000000004";
const JOB = "31000000-0000-4000-8000-000000000005";
const OPERATION = "31000000-0000-4000-8000-000000000006";
const PRODUCT = "31000000-0000-4000-8000-000000000007";
const VARIANT = "31000000-0000-4000-8000-000000000008";
const CATEGORY = "31000000-0000-4000-8000-000000000009";
const BRAND = "31000000-0000-4000-8000-00000000000a";
const DIGEST = "a".repeat(64);
const IMAGE_DIGEST = "b".repeat(64);
const NOW = new Date("2026-07-28T12:00:00.000Z");

function tenant(): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "private",
    principal: { id: PRINCIPAL, issuer: "https://identity.test/oidc", subject: "private" },
    store: { id: STORE, slug: "guzide-staging", status: "active" },
    membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: PLAN,
      planCode: "pilot",
      version: 1,
      status: "active",
      features: ["catalog"],
      limits: { products: 2_000, staff: 5, storageBytes: 10_000_000_000 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  } as TenantContext;
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
    const selected = this.clients[this.index++];
    if (!selected) throw new Error("checkout");
    return selected;
  }
}

function repository(pool: Pool, audit: string[] = [], ids: string[] = [JOB, CATEGORY, BRAND, PRODUCT, VARIANT]) {
  const generated = [...ids];
  return new PostgresCatalogMigrationRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    uuid: () => generated.shift() ?? PRODUCT,
    audit: (event) => { audit.push(event.type); },
  });
}

function call(client: Client, name: string) {
  const found = client.calls.find((entry) => entry.text.includes(`saas.${name}`));
  assert.ok(found);
  return found;
}

function projection(overrides: Record<string, unknown> = {}) {
  return {
    jobId: JOB,
    sourceDigest: DIGEST,
    status: "processing",
    totalProducts: 1_628,
    importedProducts: 0,
    totalMedia: 5_423,
    committedMedia: 0,
    failedMedia: 0,
    categoryCount: 50,
    brandCount: 6,
    version: 1,
    updatedAt: NOW.toISOString(),
    replayed: false,
    ...overrides,
  };
}

function product(sourceProductId = "30794") {
  return {
    sourceProductId,
    title: "14 Ayar Altın Yüzük",
    slug: `14-ayar-altin-yuzuk-${sourceProductId}`,
    description: "El işçiliği ürün.",
    status: "active" as const,
    categorySlugs: ["yuzukler"],
    brandSlugs: ["guzide-kuyumcu"],
    variant: {
      title: "Varsayılan",
      sku: `YZK-${sourceProductId}`,
      barcode: `868000000${sourceProductId}`,
      priceCents: 1_127_100,
      stockQuantity: 1,
      attributes: { "Ağırlık (g)": "2.35" },
    },
    sourceImageDigests: [IMAGE_DIGEST],
  };
}

test("begin creates one tenant-scoped job and deterministic taxonomy authority", async () => {
  const writer = new Client((text) => text.includes("catalog_migration_begin")
    ? [{ outcome: "begun", result_payload: projection() }]
    : []);
  const result = await repository(new Pool([writer])).begin({
    tenantContext: tenant(),
    now: NOW,
    operationId: OPERATION,
    sourceDigest: DIGEST,
    totalProducts: 1_628,
    totalMedia: 5_423,
    categories: [{ name: "Yüzükler", slug: "yuzukler" }],
    brands: [{ name: "Güzide Kuyumcu", slug: "guzide-kuyumcu" }],
  });

  assert.equal(result.jobId, JOB);
  const sql = call(writer, "catalog_migration_begin");
  assert.deepEqual(sql.values.slice(0, 8), [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "pilot", 1, 2_000, NOW]);
  assert.equal(sql.values[10], JOB);
  assert.deepEqual(JSON.parse(String(sql.values[14])), [{ id: CATEGORY, name: "Yüzükler", slug: "yuzukler" }]);
  assert.deepEqual(JSON.parse(String(sql.values[15])), [{ id: BRAND, name: "Güzide Kuyumcu", slug: "guzide-kuyumcu" }]);
});

test("importBatch writes at most 25 products and returns exact ordered source mappings", async () => {
  const writer = new Client((text) => text.includes("catalog_migration_import_batch")
    ? [{ outcome: "batch_imported", result_payload: {
      ...projection({ importedProducts: 1, version: 2 }),
      mappings: [{ sourceProductId: "30794", productId: PRODUCT }],
    } }]
    : []);
  const result = await repository(new Pool([writer]), [], [PRODUCT, VARIANT]).importBatch({
    tenantContext: tenant(), now: NOW, operationId: OPERATION, jobId: JOB, sourceDigest: DIGEST,
    products: [product()],
  });

  assert.deepEqual(result.mappings, [{ sourceProductId: "30794", productId: PRODUCT }]);
  const persisted = JSON.parse(String(call(writer, "catalog_migration_import_batch").values.at(-1)));
  assert.equal(persisted[0].productId, PRODUCT);
  assert.equal(persisted[0].variant.variantId, VARIANT);
  assert.deepEqual(persisted[0].sourceImageDigests, [IMAGE_DIGEST]);

  const tooMany = Array.from({ length: 26 }, (_, index) => product(String(40_000 + index)));
  await assert.rejects(
    () => repository(new Pool([])).importBatch({ tenantContext: tenant(), now: NOW, operationId: OPERATION, jobId: JOB, sourceDigest: DIGEST, products: tooMany }),
    (error: unknown) => error instanceof CatalogMigrationRepositoryError && error.code === "invalid_input",
  );
});

test("importBatch preserves safe Markdown paragraph line breaks", async () => {
  const writer = new Client((text) => text.includes("catalog_migration_import_batch")
    ? [{ outcome: "batch_imported", result_payload: {
      ...projection({ importedProducts: 1, version: 2 }),
      mappings: [{ sourceProductId: "30794", productId: PRODUCT }],
    } }]
    : []);
  await repository(new Pool([writer]), [], [PRODUCT, VARIANT]).importBatch({
    tenantContext: tenant(), now: NOW, operationId: OPERATION, jobId: JOB, sourceDigest: DIGEST,
    products: [{ ...product(), description: "Birinci paragraf\n\nİkinci paragraf" }],
  });
  const persisted = JSON.parse(String(call(writer, "catalog_migration_import_batch").values.at(-1)));
  assert.equal(persisted[0].description, "Birinci paragraf\n\nİkinci paragraf");
});

test("get is read-only and exposes counts without source URLs or tenant context", async () => {
  const reader = new Client((text) => text.includes("catalog_migration_get")
    ? [{ outcome: "found", result_payload: projection() }]
    : []);
  const result = await repository(new Pool([reader])).get({ tenantContext: tenant(), now: NOW, jobId: JOB });
  assert.equal(reader.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(result.totalMedia, 5_423);
  assert.equal(JSON.stringify(result).includes("guzidekuyumcu.com.tr"), false);
  assert.equal(JSON.stringify(result).includes(PRINCIPAL), false);
});

test("unknown COMMIT destroys the writer and performs exactly one read-only recovery", async () => {
  const writer = new Client((text) => {
    if (text.includes("catalog_migration_import_batch")) return [{ outcome: "batch_imported", result_payload: {
      ...projection({ importedProducts: 1, version: 2 }),
      mappings: [{ sourceProductId: "30794", productId: PRODUCT }],
    } }];
    if (text === "COMMIT") throw new Error("wire");
    return [];
  });
  const recovery = new Client((text) => text.includes("catalog_migration_recover_operation")
    ? [{ outcome: "operation_replayed", result_payload: {
      ...projection({ importedProducts: 1, version: 2, replayed: true }),
      mappings: [{ sourceProductId: "30794", productId: PRODUCT }],
    } }]
    : []);
  const audit: string[] = [];
  const result = await repository(new Pool([writer, recovery]), audit, [PRODUCT, VARIANT]).importBatch({
    tenantContext: tenant(), now: NOW, operationId: OPERATION, jobId: JOB, sourceDigest: DIGEST,
    products: [product()],
  });
  assert.equal(result.replayed, true);
  assert.deepEqual(writer.releases, [true]);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(recovery.calls.filter((entry) => entry.text.includes("catalog_migration_recover_operation")).length, 1);
  assert.equal(recovery.calls.some((entry) => entry.text.includes("catalog_migration_import_batch")), false);
  assert.deepEqual(audit, ["catalog_migration_commit_unknown"]);
});

test("malformed digests, duplicate identifiers and unknown outcomes fail closed", async () => {
  await assert.rejects(
    () => repository(new Pool([])).begin({ tenantContext: tenant(), now: NOW, operationId: OPERATION, sourceDigest: "raw-url", totalProducts: 1, totalMedia: 1, categories: [], brands: [] }),
    (error: unknown) => error instanceof CatalogMigrationRepositoryError && error.code === "invalid_input",
  );
  await assert.rejects(
    () => repository(new Pool([]), [], [PRODUCT, VARIANT, PRODUCT, VARIANT]).importBatch({ tenantContext: tenant(), now: NOW, operationId: OPERATION, jobId: JOB, sourceDigest: DIGEST, products: [product(), product()] }),
    (error: unknown) => error instanceof CatalogMigrationRepositoryError && error.code === "invalid_input",
  );
  const hostile = new Client((text) => text.includes("catalog_migration_get") ? [{ outcome: "surprise", result_payload: {} }] : []);
  await assert.rejects(
    () => repository(new Pool([hostile])).get({ tenantContext: tenant(), now: NOW, jobId: JOB }),
    (error: unknown) => error instanceof CatalogMigrationRepositoryError && error.code === "unavailable",
  );
});
