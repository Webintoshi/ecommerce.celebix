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
const VARIANT_TWO = "77000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-07-22T18:00:00.000Z");

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

const GUIDE = { schemaVersion: 1, type: "size_guide", heading: "Ölçü rehberi", body: `<h2>Ölçüler</h2>\n<p>${"ü".repeat(9_000)}</p>`, categoryIds: ["79000000-0000-4000-8000-000000000001"], includeDescendants: true, enabled: true };

test("guide saves carry long rich text with durable authority, version and operation id", async () => {
  const writer = new Client((text) => text.includes("catalog_admin_save_resource") ? [{ outcome: "saved", result_payload: mutation(RESOURCE) }] : []);
  const result = await repository(new Pool([writer])).saveResource({ tenantContext: tenant(), now: NOW, operationId: OP, kind: "extra", resourceId: RESOURCE, expectedVersion: 5, name: "Yüzük rehberi", slug: "yuzuk-rehberi", config: GUIDE, productIds: [] });
  assert.equal(result.id, RESOURCE);
  const values = call(writer, "catalog_admin_save_resource").values;
  assert.deepEqual(values.slice(0, 8), [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW, OP]);
  assert.deepEqual(values.slice(9, 12), [RESOURCE, 5, "extra"]);
  assert.deepEqual(JSON.parse(String(values[15])), GUIDE);
  assert.deepEqual(values[16], []);
});

test("guide resource reads accept rich typed config from SQL", async () => {
  const guide = { id: RESOURCE, kind: "extra", name: "Yüzük rehberi", slug: "yuzuk-rehberi", config: GUIDE, status: "active", productIds: [], productCount: 0, version: 1, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };
  const reader = new Client((text) => text.includes("catalog_admin_list_resources") ? [{ outcome: "listed", result_payload: { items: [guide] } }] : []);
  assert.deepEqual((await repository(new Pool([reader])).listResources({ tenantContext: tenant(), now: NOW, kind: "extra" }))[0], guide);
});

test("guide validation rejects invalid schema and product links before acquiring SQL", async () => {
  const short = { ...GUIDE, body: "<p>Rehber</p>" };
  for (const entry of [
    { config: { ...short, categoryIds: [short.categoryIds[0], short.categoryIds[0]] }, productIds: [], kind: "extra" },
    { config: { ...short, priceCents: 1 }, productIds: [], kind: "extra" },
    { config: short, productIds: [PRODUCT], kind: "extra" },
    { config: short, productIds: [], kind: "definition" },
  ] as const) {
    await assert.rejects(() => repository(new Pool([])).saveResource({ tenantContext: tenant(), now: NOW, operationId: OP, name: "Rehber", slug: "rehber", ...entry }), (error: unknown) => error instanceof CatalogAdminRepositoryError && error.code === "invalid_input");
  }
});

test("guide assignment conflict returns its durable SQL outcome", async () => {
  const writer = new Client((text) => text.includes("catalog_admin_save_resource") ? [{ outcome: "category_guide_conflict", result_payload: {} }] : []);
  await assert.rejects(() => repository(new Pool([writer])).saveResource({ tenantContext: tenant(), now: NOW, operationId: OP, kind: "extra", name: "Rehber", slug: "rehber", config: { ...GUIDE, body: "<p>Rehber</p>" }, productIds: [] }), (error: unknown) => error instanceof CatalogAdminRepositoryError && error.code === "category_guide_conflict");
  assert.equal(writer.calls.at(-1)?.text, "ROLLBACK");
});

test("collection reads preserve full order and reject invalid authority before SQL", async () => {
  const productIds = Array.from({ length: 125 }, (_, i) => `72000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
  const reader = new Client((text) => text.includes("catalog_admin_collection_members") ? [{ outcome: "listed", result_payload: { items: [{ id: PRODUCT, title: "Keten", status: "active", priceCents: 12900 }], page: 1, pageSize: 20, totalCount: 125, orderedIds: productIds } }] : []);
  const config = { schemaVersion: 1, mode: "manual", published: false, featured: false, match: "all", rules: [], sort: "custom" } as const;
  const result = await repository(new Pool([reader])).collectionMembers({ tenantContext: tenant(), now: NOW, collectionId: RESOURCE, config, query: { page: 1, pageSize: 20, mode: "members" } });
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.orderedIds, productIds);
  assert.deepEqual(call(reader, "catalog_admin_collection_members").values.slice(0, 8), [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW, RESOURCE]);
  const invalidTenant = { ...tenant(), membership: { ...tenant().membership, status: "revoked" as never } };
  await assert.rejects(() => repository(new Pool([])).collectionMembers({ tenantContext: invalidTenant, now: NOW, collectionId: RESOURCE, query: { page: 1, pageSize: 20, mode: "members" } }), (error: unknown) => error instanceof Error && error.message === "membership_denied");
  await assert.rejects(() => repository(new Pool([])).listCollections({ tenantContext: tenant(), now: NOW, query: { page: 1, pageSize: 20, state: "all", sort: "updated", search: "a".repeat(101) } }), (error: unknown) => error instanceof CatalogAdminRepositoryError && error.code === "invalid_input");
});

test("collection restore uses one recovery after uncertain commit", async () => {
  const writer = new Client((text) => {
    if (text.includes("catalog_admin_restore_collection")) return [{ outcome: "restored", result_payload: mutation(RESOURCE) }];
    if (text === "COMMIT") throw new Error("wire");
    return [];
  });
  const recovery = new Client((text) => text.includes("catalog_admin_recover_operation") ? [{ outcome: "operation_replayed", result_payload: mutation(RESOURCE) }] : []);
  const result = await repository(new Pool([writer, recovery])).restoreCollection({ tenantContext: tenant(), now: NOW, operationId: OP, resourceId: RESOURCE, expectedVersion: 4 });
  assert.equal(result.replayed, true);
  assert.equal(writer.calls.filter(entry => entry.text.includes("catalog_admin_restore_collection")).length, 1);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  assert.deepEqual(writer.releases, [true]);
  assert.equal(recovery.calls.some(entry => entry.text.includes("catalog_admin_restore_collection")), false);
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

test("rich import persists every ordered variant through the additive v2 authority", async () => {
  const imports = new Client((text) => text.includes("catalog_admin_import_products_v2") ? [{ outcome: "imported", result_payload: mutation(JOB, "completed") }] : []);
  const imported = await repository(new Pool([imports]), [], [JOB, NEW_PRODUCT, VARIANT, VARIANT_TWO]).importProductsV2({
    tenantContext: tenant(),
    now: NOW,
    operationId: OP,
    fileName: "shopify-products.csv",
    products: [{
      title: "Deri Kordon",
      slug: "deri-kordon",
      description: "El yapımı",
      status: "active",
      variants: [
        { title: "Siyah", sku: "DK-SYH", barcode: "8680000000001", priceCents: 149900, compareAtCents: 169900, costCents: 60000, stockQuantity: 15, attributes: { Renk: "Siyah" } },
        { title: "Taba", sku: "DK-TABA", priceCents: 159900, stockQuantity: 7, attributes: { Renk: "Taba" } },
      ],
    }],
  });

  assert.equal(imported.status, "completed");
  const sql = call(imports, "catalog_admin_import_products_v2");
  assert.equal(sql.values[7], 100);
  assert.equal(sql.values[11], "shopify-products.csv");
  assert.deepEqual(JSON.parse(String(sql.values[12])), [{
    productId: NEW_PRODUCT,
    title: "Deri Kordon",
    slug: "deri-kordon",
    description: "El yapımı",
    status: "active",
    variants: [
      { variantId: VARIANT, title: "Siyah", sku: "DK-SYH", barcode: "8680000000001", priceCents: 149900, compareAtCents: 169900, costCents: 60000, stockQuantity: 15, attributes: { Renk: "Siyah" } },
      { variantId: VARIANT_TWO, title: "Taba", sku: "DK-TABA", barcode: null, priceCents: 159900, compareAtCents: null, costCents: null, stockQuantity: 7, attributes: { Renk: "Taba" } },
    ],
  }]);
});

test("feed preview authority is a read-only action check with no mutation input", async () => {
  const reader = new Client((text) => text.includes("catalog_admin_authorize_feed_preview") ? [{ outcome: "authorized", result_payload: {} }] : []);
  await repository(new Pool([reader])).authorizeFeedPreview({ tenantContext: tenant(), now: NOW });
  assert.equal(reader.calls[0]?.text, "BEGIN READ ONLY");
  assert.deepEqual(call(reader, "catalog_admin_authorize_feed_preview").values, [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW]);
});

test("rich import rejects duplicate SKU and malformed nested variants before SQL", async () => {
  const base = { title: "Deri Kordon", slug: "deri-kordon", status: "active" as const };
  const invalid = [
    [{ ...base, variants: [] }],
    [{ ...base, variants: [{ title: "A", sku: "DUP-1", priceCents: 1, stockQuantity: 1, attributes: {} }, { title: "B", sku: "DUP-1", priceCents: 2, stockQuantity: 1, attributes: {} }] }],
    [{ ...base, variants: [{ title: "A", priceCents: 1, stockQuantity: 1, attributes: { "bad key!": "x" } }] }],
  ];
  for (const products of invalid) {
    await assert.rejects(
      () => repository(new Pool([])).importProductsV2({ tenantContext: tenant(), now: NOW, operationId: OP, fileName: "x.csv", products }),
      (error: unknown) => error instanceof CatalogAdminRepositoryError && error.code === "invalid_input",
    );
  }
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

test("product import rejects slugs outside the durable product contract before SQL", async () => {
  for (const slug of ["x", "ab", "a".repeat(101)]) {
    await assert.rejects(
      () => repository(new Pool([])).importProducts({ tenantContext: tenant(), now: NOW, operationId: OP, fileName: "urunler.csv", rows: [{ title: "Yeni Ürün", slug, priceCents: 12900, stockQuantity: 8 }] }),
      (error: unknown) => error instanceof CatalogAdminRepositoryError && error.code === "invalid_input",
    );
  }
});
