import assert from "node:assert/strict";
import test from "node:test";
import type { TenantContext } from "@celebix/saas-contracts";
import { CatalogAdminRepositoryError, PostgresCatalogAdminRepository } from "./index.ts";

const STORE = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP = "55555555-5555-4555-8555-555555555555";
const PLAN = "66666666-6666-4666-8666-666666666666";
const RESOURCE = "71000000-0000-4000-8000-000000000001";
const PRODUCT = "72000000-0000-4000-8000-000000000001";
const REVIEW = "73000000-0000-4000-8000-000000000001";
const OP = "74000000-0000-4000-8000-000000000001";
const JOB = "75000000-0000-4000-8000-000000000001";
const NEW_PRODUCT = "76000000-0000-4000-8000-000000000001";
const VARIANT = "77000000-0000-4000-8000-000000000001";
const PREVIEW = "78000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-22T18:00:00.000Z");
const LATER = "2026-07-22T18:15:00.000Z";

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
function repository(pool: Pool, audit: string[] = [], generatedIds: string[] = [RESOURCE, JOB, NEW_PRODUCT, VARIANT]) {
  const ids = [...generatedIds];
  return new PostgresCatalogAdminRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    uuid: () => ids.shift() ?? RESOURCE,
    audit: (event) => { audit.push(event.type); },
  });
}
function call(client: Client, name: string) {
  const found = client.calls.find((entry) => entry.text.includes(`saas.${name}`));
  assert.ok(found);
  return found;
}
function mutation(id: string, status = "active") {
  return { id, version: 1, status, updatedAt: NOW.toISOString() };
}
function preview(status = "prepared") {
  return {
    id: PREVIEW, format: "shopify_csv", fileName: "products.csv",
    digest: "a".repeat(64), status,
    rows: [{ title: "Kahve", slug: "kahve", priceCents: 25000, sku: "KHV-1", stockQuantity: 5 }],
    totalRows: 1, version: status === "prepared" ? 1 : 2,
    expiresAt: LATER, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
  };
}

test("import preview prepare read and commit use only canonical rows and durable authority", async () => {
  const prepare = new Client((text) => text.includes("catalog_admin_prepare_import_preview") ? [{ outcome: "prepared", result_payload: preview() }] : []);
  const prepared = await repository(new Pool([prepare])).prepareImport({
    tenantContext: tenant(), now: NOW, operationId: OP, previewId: PREVIEW,
    format: "shopify_csv", fileName: "products.csv", digest: "a".repeat(64),
    rows: preview().rows,
  });
  assert.equal(prepared.id, PREVIEW);
  const prepareCall = call(prepare, "catalog_admin_prepare_import_preview");
  assert.equal(prepareCall.values.includes("raw,csv"), false);
  assert.match(String(prepareCall.values.at(-1)), /Kahve/);

  const reader = new Client((text) => text.includes("catalog_admin_get_import_preview") ? [{ outcome: "found", result_payload: preview() }] : []);
  assert.equal((await repository(new Pool([reader])).getImportPreview({ tenantContext: tenant(), now: NOW, previewId: PREVIEW })).status, "prepared");

  const commit = new Client((text) => {
    if (text.includes("catalog_admin_get_import_preview"))
      return [{ outcome: "found", result_payload: preview() }];
    if (text.includes("catalog_admin_commit_import_preview"))
      return [{ outcome: "imported", result_payload: mutation(JOB, "completed") }];
    return [];
  });
  assert.equal((await repository(new Pool([commit]), [], [JOB]).commitImportPreview({
    tenantContext: tenant(), now: NOW, operationId: OP, previewId: PREVIEW, expectedVersion: 1,
  })).status, "completed");
  const snapshotIndex = commit.calls.findIndex((entry) =>
    entry.text.includes("catalog_admin_get_import_preview")
  );
  const mutationIndex = commit.calls.findIndex((entry) =>
    entry.text.includes("catalog_admin_commit_import_preview")
  );
  assert.ok(snapshotIndex > -1 && snapshotIndex < mutationIndex);
  assert.deepEqual(commit.calls[mutationIndex]?.values.slice(12, 15), [
    "shopify_csv", "a".repeat(64), JSON.stringify(preview().rows),
  ]);
  const changedDigest = new Client((text) => {
    if (text.includes("catalog_admin_get_import_preview"))
      return [{ outcome: "found", result_payload: { ...preview(), digest: "b".repeat(64) } }];
    if (text.includes("catalog_admin_commit_import_preview"))
      return [{ outcome: "imported", result_payload: mutation(JOB, "completed") }];
    return [];
  });
  await repository(new Pool([changedDigest]), [], [JOB]).commitImportPreview({
    tenantContext: tenant(), now: NOW, operationId: OP,
    previewId: PREVIEW, expectedVersion: 1,
  });
  assert.notEqual(
    call(commit, "catalog_admin_commit_import_preview").values[9],
    call(changedDigest, "catalog_admin_commit_import_preview").values[9],
  );
});

test("import preview unknown commit destroys writer and recovers exactly once read-only", async () => {
  const writer = new Client((text) => {
    if (text.includes("catalog_admin_get_import_preview"))
      return [{ outcome: "found", result_payload: preview() }];
    if (text.includes("catalog_admin_commit_import_preview"))
      return [{ outcome: "imported", result_payload: mutation(JOB, "completed") }];
    if (text === "COMMIT") throw new Error("wire");
    return [];
  });
  const recovery = new Client((text) =>
    text.includes("catalog_admin_recover_import_preview_operation")
      ? [{ outcome: "operation_replayed", result_payload: mutation(JOB, "completed") }]
      : [],
  );
  const result = await repository(new Pool([writer, recovery]), [], [JOB])
    .commitImportPreview({
      tenantContext: tenant(), now: NOW, operationId: OP,
      previewId: PREVIEW, expectedVersion: 1,
    });
  assert.equal(result.replayed, true);
  assert.deepEqual(writer.releases, [true]);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(recovery.calls.filter((entry) =>
    entry.text.includes("catalog_admin_recover_import_preview_operation")
  ).length, 1);
  assert.equal(recovery.calls.some((entry) =>
    entry.text.includes("catalog_admin_commit_import_preview")
  ), false);
  assert.equal(writer.calls.filter((entry) =>
    entry.text.includes("catalog_admin_get_import_preview")
  ).length, 1);
  assert.equal(recovery.calls.some((entry) =>
    entry.text.includes("catalog_admin_get_import_preview")
  ), false);
});

test("resource reads and saves use exact durable authority", async () => {
  const reader = new Client((text) => text.includes("catalog_admin_list_resources") ? [{ outcome: "listed", result_payload: { items: [{ id: RESOURCE, kind: "collection", name: "Yeni Gelenler", slug: "yeni-gelenler", config: { featured: true }, status: "active", productIds: [PRODUCT], productCount: 1, version: 1, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }] } }] : []);
  const result = await repository(new Pool([reader])).listResources({ tenantContext: tenant(), now: NOW, kind: "collection" });
  assert.equal(result[0]?.productCount, 1);
  assert.deepEqual(call(reader, "catalog_admin_list_resources").values, [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW, "collection"]);

  const writer = new Client((text) => text.includes("catalog_admin_save_resource") ? [{ outcome: "saved", result_payload: mutation(RESOURCE) }] : []);
  const saved = await repository(new Pool([writer])).saveResource({ tenantContext: tenant(), now: NOW, operationId: OP, kind: "collection", name: "Yeni Gelenler", slug: "yeni-gelenler", config: { featured: true }, productIds: [PRODUCT] });
  assert.equal(saved.id, RESOURCE);
  assert.deepEqual(call(writer, "catalog_admin_save_resource").values.slice(0, 7), [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW]);
});

test("review moderation and import keep private input out of projections", async () => {
  const reviews = new Client((text) => text.includes("catalog_admin_list_reviews") ? [{ outcome: "listed", result_payload: { items: [{ id: REVIEW, productId: PRODUCT, productTitle: "Keten Gömlek", reviewerName: "Ada", rating: 5, body: "Çok iyi.", status: "pending", version: 1, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }] } }] : []);
  assert.equal((await repository(new Pool([reviews])).listReviews({ tenantContext: tenant(), now: NOW, status: "pending" }))[0]?.rating, 5);

  const imports = new Client((text) => text.includes("catalog_admin_import_products") ? [{ outcome: "imported", result_payload: mutation(JOB, "completed") }] : []);
  const imported = await repository(new Pool([imports]), [], [JOB, NEW_PRODUCT, VARIANT]).importProducts({ tenantContext: tenant(), now: NOW, operationId: OP, fileName: "urunler.csv", rows: [{ title: "Yeni Ürün", slug: "yeni-urun", priceCents: 12900, sku: "YENI-1", stockQuantity: 8 }] });
  assert.equal(imported.status, "completed");
  const sql = call(imports, "catalog_admin_import_products");
  assert.equal(sql.values[7], 100);
  assert.match(String(sql.values.at(-1)), new RegExp(NEW_PRODUCT));
  assert.match(String(sql.values.at(-1)), new RegExp(VARIANT));
});

test("unknown commit destroys the writer and performs one read-only recovery", async () => {
  let commits = 0;
  const writer = new Client((text) => {
    if (text.includes("catalog_admin_archive_resource")) return [{ outcome: "archived", result_payload: mutation(RESOURCE, "archived") }];
    if (text === "COMMIT" && commits++ === 0) throw new Error("wire");
    return [];
  });
  const recovery = new Client((text) => text.includes("catalog_admin_recover_operation") ? [{ outcome: "operation_replayed", result_payload: mutation(RESOURCE, "archived") }] : []);
  const audit: string[] = [];
  const result = await repository(new Pool([writer, recovery]), audit).archiveResource({ tenantContext: tenant(), now: NOW, operationId: OP, resourceId: RESOURCE, expectedVersion: 1 });
  assert.equal(result.replayed, true);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(recovery.calls.some((entry) => entry.text.includes("catalog_admin_archive_resource")), false);
  assert.deepEqual(writer.releases, [true]);
  assert.deepEqual(audit, ["catalog_admin_commit_unknown"]);
});

test("invalid cross-tenant or malformed input fails before SQL", async () => {
  await assert.rejects(() => repository(new Pool([])).saveResource({ tenantContext: tenant(), now: NOW, operationId: OP, kind: "collection", name: "X", slug: "x", config: {}, productIds: [PRODUCT, PRODUCT] }), (error: unknown) => error instanceof CatalogAdminRepositoryError && error.code === "invalid_input");
});
