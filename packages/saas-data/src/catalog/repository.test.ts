import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";

import { CatalogRepositoryError, PostgresCatalogRepository } from "./index.ts";

const STORE_ID = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL_ID = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP_ID = "55555555-5555-4555-8555-555555555555";
const PLAN_ID = "66666666-6666-4666-8666-666666666666";
const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECOND_PRODUCT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VARIANT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SECOND_VARIANT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OPERATION_ID = "77777777-7777-4777-8777-777777777777";
const NOW = new Date("2026-07-16T08:00:00.000Z");

function tenantContext(overrides: Record<string, unknown> = {}): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "catalog-request-1",
    principal: { id: PRINCIPAL_ID, issuer: "https://identity.example/oidc", subject: "subject-1" },
    store: { id: STORE_ID, slug: "atlas-store", status: "active" },
    membership: { id: MEMBERSHIP_ID, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: PLAN_ID,
      planCode: "free_starter",
      version: 1,
      status: "active",
      features: ["catalog"],
      limits: { products: 10, staff: 1, storageBytes: 1024 },
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2027-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
    ...overrides,
  } as TenantContext;
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    storeId: STORE_ID,
    slug: "atlas-mug",
    title: "Atlas Mug",
    description: "Catalog fixture",
    status: "draft",
    currency: "TRY",
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    version: 1,
    ...overrides,
  };
}

function listVariantSummary(overrides: Record<string, unknown> = {}) {
  const summary: Record<string, unknown> = {
    productId: PRODUCT_ID,
    storeId: STORE_ID,
    variantId: VARIANT_ID,
    sku: "ATLAS-MUG-1",
    priceCents: 12_500,
    compareAtCents: 15_000,
    stockTracking: true,
    stockQuantity: 10,
    ...overrides,
  };
  if (overrides.sku === undefined && Object.hasOwn(overrides, "sku")) delete summary.sku;
  if (overrides.compareAtCents === undefined && Object.hasOwn(overrides, "compareAtCents")) delete summary.compareAtCents;
  return summary;
}

function variant(overrides: Record<string, unknown> = {}) {
  return {
    id: VARIANT_ID,
    productId: PRODUCT_ID,
    storeId: STORE_ID,
    title: "Default",
    sku: "ATLAS-MUG-1",
    barcode: "8690000000001",
    priceCents: 12_500,
    compareAtCents: 15_000,
    costCents: 7_000,
    stockTracking: true,
    stockQuantity: 10,
    status: "active",
    attributes: { color: "black" },
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    version: 1,
    ...overrides,
  };
}

function dashboardSummary(overrides: Record<string, unknown> = {}) {
  return {
    totalProducts: 4,
    activeProducts: 3,
    draftProducts: 1,
    productLimit: 10,
    activeVariants: 6,
    outOfStockVariants: 2,
    productsWithoutMedia: 1,
    activeMedia: 7,
    ...overrides,
  };
}

function createInput(extraProduct: Record<string, unknown> = {}) {
  return {
    tenantContext: tenantContext(),
    now: NOW,
    operationId: OPERATION_ID,
    product: {
      slug: "atlas-mug",
      title: "Atlas Mug",
      description: "Catalog fixture",
      status: "draft" as const,
      currency: "TRY",
      ...extraProduct,
    },
    initialVariant: {
      title: "Default",
      sku: "ATLAS-MUG-1",
      barcode: "8690000000001",
      priceCents: 12_500,
      compareAtCents: 15_000,
      costCents: 7_000,
      stockTracking: true,
      stockQuantity: 10,
      attributes: { color: "black" },
    },
  };
}

type Row = Record<string, unknown>;

class FakeClient {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: Array<boolean | Error | undefined> = [];
  private readonly responder: (text: string, values: unknown[]) => Row[];
  constructor(responder: (text: string, values: unknown[]) => Row[] = () => []) {
    this.responder = responder;
  }
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    return { rows: this.responder(text, values), rowCount: 0, command: "", oid: 0, fields: [] };
  }
  release(destroy?: boolean | Error) { this.releases.push(destroy); }
}

class FakePool {
  readonly clients: FakeClient[];
  connects = 0;
  constructor(...clients: FakeClient[]) { this.clients = clients; }
  async connect() {
    const client = this.clients[this.connects++];
    if (!client) throw new Error("unexpected pool checkout");
    return client;
  }
}

function repository(pool: FakePool, ids = [PRODUCT_ID, VARIANT_ID]) {
  let index = 0;
  return new PostgresCatalogRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 500, idleTransactionMs: 500 },
    generateId: () => ids[index++]!,
    audit: () => undefined,
  });
}

test("createProduct derives store authority from TenantContext and creates an initial variant atomically", async () => {
  const client = new FakeClient((text) => text.includes("saas.catalog_create_product")
    ? [{ outcome: "created", result_payload: { product: product(), initialVariant: variant() } }]
    : []);
  const result = await repository(new FakePool(client)).createProduct(createInput());
  assert.deepEqual(result, { product: product(), initialVariant: variant(), replayed: false });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.product), true);
  assert.equal(Object.isFrozen(result.initialVariant.attributes), true);
  const mutation = client.calls.find((call) => call.text.includes("saas.catalog_create_product"));
  assert.ok(mutation);
  assert.equal(mutation.values[0], STORE_ID);
  assert.equal(mutation.values.includes(PRODUCT_ID), true);
  assert.equal(mutation.values.includes(VARIANT_ID), true);
  assert.equal(mutation.values.includes("catalog-request-1"), false);
  assert.equal(mutation.values.includes("subject-1"), false);
  assert.deepEqual(client.releases, [undefined]);
});

test("createVariantBatch sends selected variants through one tenant-bound transaction", async () => {
  const black = variant({ id: VARIANT_ID, title: "Siyah / M", sku: "BLACK-M", attributes: { renk: "Siyah", beden: "M" } });
  const white = variant({ id: SECOND_VARIANT_ID, title: "Beyaz / S", sku: "BLACK-M", attributes: { renk: "Beyaz", beden: "S" } });
  const client = new FakeClient((text) => text.includes("saas.catalog_create_variants_batch") ? [{ outcome: "created", result_payload: { variants: [black, white] } }] : []);
  const selected = [black, white].map(({ title, sku, barcode, priceCents, compareAtCents, costCents, stockTracking, stockQuantity, attributes }) => ({ title, sku, barcode, priceCents, compareAtCents, costCents, stockTracking, stockQuantity, attributes }));
  const result = await repository(new FakePool(client), [VARIANT_ID, SECOND_VARIANT_ID]).createVariantBatch({ tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, productId: PRODUCT_ID, variants: selected });
  assert.deepEqual(result.variants, [black, white]);
  assert.equal(result.replayed, false);
  const write = client.calls.filter(({ text }) => text.includes("saas.catalog_create_variants_batch"));
  assert.equal(write.length, 1);
  assert.equal(write[0]?.values[0], STORE_ID);
  assert.equal(write[0]?.values[10], PRODUCT_ID);
  assert.deepEqual(write[0]?.values[11], [VARIANT_ID, SECOND_VARIANT_ID]);
  assert.deepEqual(client.releases, [undefined]);
});

test("createVariantBatch rejects duplicate combinations before database access", async () => {
  const pool = new FakePool();
  const first = { title: "Siyah / M", priceCents: 1200, stockTracking: true, stockQuantity: 2, attributes: { renk: "Siyah", beden: "M" } };
  await assert.rejects(repository(pool).createVariantBatch({ tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, productId: PRODUCT_ID, variants: [first, { ...first, title: "Yinelenen", attributes: { beden: "M", renk: "Siyah" } }] }), (error: unknown) => error instanceof CatalogRepositoryError && error.code === "invalid_input");
  assert.equal(pool.connects, 0);
});

test("concurrent cross-product SKU ownership rejection is reported as SKU conflict", async () => {
  const client = new FakeClient((text) => {
    if (text.includes("saas.catalog_create_variant")) {
      throw { code: "23505", constraint: "product_variants_store_sku_owner_key" };
    }
    return [];
  });
  await assert.rejects(repository(new FakePool(client)).createVariant({
    tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, productId: PRODUCT_ID,
    variant: { title: "Beyaz", sku: "RSA-001", priceCents: 100, stockTracking: true, stockQuantity: 1, attributes: { renk: "Beyaz" } },
  }), (error: unknown) => error instanceof CatalogRepositoryError && error.code === "sku_conflict");
});

test("a reserved barcode claimed by another variant reports a clear conflict", async () => {
  const client = new FakeClient((text) => {
    if (text.includes("saas.catalog_create_variant")) {
      throw { code: "23505", constraint: "product_variants_store_internal_barcode_key" };
    }
    return [];
  });
  await assert.rejects(repository(new FakePool(client)).createVariant({
    tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, productId: PRODUCT_ID,
    variant: { title: "Beyaz", barcode: "CXI-000000000123", priceCents: 100, stockTracking: true, stockQuantity: 1, attributes: { renk: "Beyaz" } },
  }), (error: unknown) => error instanceof CatalogRepositoryError && error.code === "barcode_conflict");
});

test("bulkMutateProducts sends one deterministic target set through one transaction", async () => {
  const second = product({ id: SECOND_PRODUCT_ID, title: "Atlas Ring", slug: "atlas-ring", status: "active", version: 5 });
  const client = new FakeClient((text) => {
    if (text.includes("saas.catalog_bulk_mutate_products")) {
      return [{ outcome: "committed", result_payload: { products: [product({ status: "active", version: 2 }), second] } }];
    }
    if (text.includes("saas.catalog_get_product_details_v2")) return [
      {
        product_id: PRODUCT_ID,
        outcome: "found",
        result_payload: {
          product: product({ status: "active", version: 2 }),
          variants: [variant({ pricingMethod: "usd", effectivePriceCents: 12_500 })],
        },
      },
      {
        product_id: SECOND_PRODUCT_ID,
        outcome: "found",
        result_payload: {
          product: second,
          variants: [variant({
            id: SECOND_VARIANT_ID, productId: SECOND_PRODUCT_ID,
            pricingMethod: "fixed_try", effectivePriceCents: 15_000,
          })],
        },
      },
    ];
    return [];
  });
  const result = await repository(new FakePool(client)).bulkMutateProducts({
    tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, action: "active",
    targets: [
      { productId: SECOND_PRODUCT_ID, expectedVersion: 4 },
      { productId: PRODUCT_ID, expectedVersion: 1 },
    ],
  });
  assert.equal(result.products.length, 2);
  assert.equal(result.replayed, false);
  const call = client.calls.find(({ text }) => text.includes("saas.catalog_bulk_mutate_products"));
  assert.ok(call);
  assert.equal(call.values[10], "active");
  assert.equal(call.values[11], JSON.stringify([
    { productId: PRODUCT_ID, expectedVersion: 1 },
    { productId: SECOND_PRODUCT_ID, expectedVersion: 4 },
  ]));
  assert.equal(client.calls.filter(({ text }) => text.startsWith("BEGIN ISOLATION")).length, 1);
  const priceCheck = client.calls.find(({ text }) => text.includes("saas.catalog_get_product_details_v2"));
  assert.ok(priceCheck);
  assert.deepEqual(priceCheck.values, [
    STORE_ID, PRINCIPAL_ID, MEMBERSHIP_ID, PLAN_ID, "free_starter", 1, 10, NOW,
    [PRODUCT_ID, SECOND_PRODUCT_ID],
  ]);
});

test("bulk activation rolls back when an enabled dynamic policy has no current price", async () => {
  const client = new FakeClient((text) => {
    if (text.includes("saas.catalog_bulk_mutate_products")) {
      return [{ outcome: "committed", result_payload: { products: [product({ status: "active", version: 2 })] } }];
    }
    if (text.includes("saas.catalog_get_product_details_v2")) return [{
      product_id: PRODUCT_ID,
      outcome: "found",
      result_payload: {
        product: product({ status: "active", version: 2 }),
        variants: [variant({ pricingMethod: "gold_gram", effectivePriceCents: null })],
      },
    }];
    return [];
  });

  await assert.rejects(() => repository(new FakePool(client)).bulkMutateProducts({
    tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, action: "active",
    targets: [{ productId: PRODUCT_ID, expectedVersion: 1 }],
  }), (error: unknown) => error instanceof CatalogRepositoryError && error.code === "dynamic_price_unavailable");

  assert.equal(client.calls.some(({ text }) => text === "ROLLBACK"), true);
  assert.deepEqual(client.releases, [undefined]);
});

test("bulk activation replay returns its durable result without reevaluating current prices", async () => {
  const client = new FakeClient((text) => {
    if (text.includes("saas.catalog_bulk_mutate_products")) {
      return [{ outcome: "operation_replayed", result_payload: { products: [product({ status: "active", version: 2 })] } }];
    }
    if (text.includes("saas.catalog_get_product_details_v2")) throw new Error("replay must not revalidate");
    return [];
  });

  const result = await repository(new FakePool(client)).bulkMutateProducts({
    tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, action: "active",
    targets: [{ productId: PRODUCT_ID, expectedVersion: 1 }],
  });

  assert.equal(result.replayed, true);
  assert.equal(client.calls.some(({ text }) => text.includes("saas.catalog_get_product_details_v2")), false);
});

test("bulk activation maps the transactional dynamic-pricing gate to one finite catalog error", async () => {
  const client = new FakeClient((text) => {
    if (text.includes("saas.catalog_bulk_mutate_products")) {
      throw new Error("PRICING_DYNAMIC_ACTIVATION_REQUIRED");
    }
    return [];
  });

  await assert.rejects(() => repository(new FakePool(client)).bulkMutateProducts({
    tenantContext: tenantContext(), now: NOW, operationId: OPERATION_ID, action: "active",
    targets: [{ productId: PRODUCT_ID, expectedVersion: 1 }],
  }), (error: unknown) => error instanceof CatalogRepositoryError && error.code === "dynamic_pricing_not_ready");

  assert.equal(client.calls.some(({ text }) => text === "ROLLBACK"), true);
  assert.deepEqual(client.releases, [undefined]);
});

test("bulkMutateProducts denies editor archive and analyst writes before pool checkout", async () => {
  for (const [role, action] of [["editor", "archive"], ["analyst", "draft"]] as const) {
    const pool = new FakePool();
    await assert.rejects(() => repository(pool).bulkMutateProducts({
      tenantContext: tenantContext({ membership: { id: MEMBERSHIP_ID, role, status: "active" } }),
      now: NOW, operationId: OPERATION_ID, action,
      targets: [{ productId: PRODUCT_ID, expectedVersion: 1 }],
    }), (error: unknown) => error instanceof CatalogRepositoryError && error.code === "membership_denied");
    assert.equal(pool.connects, 0);
  }
});

test("contract design rejects browser-supplied store authority before pool checkout", async () => {
  const pool = new FakePool();
  await assert.rejects(
    repository(pool).createProduct(createInput({ storeId: "99999999-9999-4999-8999-999999999999" })),
    (error: unknown) => error instanceof CatalogRepositoryError && error.code === "invalid_input",
  );
  assert.equal(pool.connects, 0);
});

test("missing catalog entitlement and invalid durable authority fail before SQL", async () => {
  const withoutCatalog = tenantContext();
  withoutCatalog.entitlements = { ...withoutCatalog.entitlements, features: [] };
  const malformedMembership = tenantContext({ membership: { id: "not-a-uuid", role: "store_owner", status: "active" } });
  for (const [context, code] of [[withoutCatalog, "feature_not_enabled"], [malformedMembership, "durable_authority_invalid"]] as const) {
    const pool = new FakePool();
    await assert.rejects(
      repository(pool).getProduct({ tenantContext: context, now: NOW, productId: PRODUCT_ID }),
      (error: unknown) => error instanceof CatalogRepositoryError && error.code === code,
    );
    assert.equal(pool.connects, 0);
  }
});

test("same operation replay returns the frozen prior projection without duplicate semantics", async () => {
  const client = new FakeClient((text) => text.includes("saas.catalog_create_product")
    ? [{ outcome: "operation_replayed", result_payload: { product: product(), initialVariant: variant() } }]
    : []);
  const result = await repository(new FakePool(client)).createProduct(createInput());
  assert.equal(result.replayed, true);
  assert.equal(client.calls.filter((call) => call.text.includes("catalog_create_product")).length, 1);
});

test("unknown COMMIT performs one fresh read-only recovery and never repeats the write", async () => {
  const writer = new FakeClient((text) => {
    if (text.includes("saas.catalog_create_product")) {
      return [{ outcome: "created", result_payload: { product: product(), initialVariant: variant() } }];
    }
    if (text === "COMMIT") throw new Error("connection lost after commit");
    return [];
  });
  const recovery = new FakeClient((text) => text.includes("saas.catalog_recover_operation")
    ? [{ outcome: "operation_replayed", result_payload: { product: product(), initialVariant: variant() } }]
    : []);
  const result = await repository(new FakePool(writer, recovery)).createProduct(createInput());
  assert.equal(result.replayed, true);
  assert.deepEqual(writer.releases, [true]);
  assert.equal(recovery.calls.some((call) => call.text === "BEGIN READ ONLY"), true);
  assert.equal(recovery.calls.filter((call) => call.text.includes("catalog_recover_operation")).length, 1);
  assert.equal(recovery.calls.some((call) => call.text.includes("catalog_create_product")), false);
});

test("a failed read-only recovery never rolls back or reuses either unknown-outcome client", async () => {
  const writer = new FakeClient((text) => {
    if (text.includes("saas.catalog_create_product")) {
      return [{ outcome: "created", result_payload: { product: product(), initialVariant: variant() } }];
    }
    if (text === "COMMIT") throw new Error("write commit response lost");
    return [];
  });
  const recovery = new FakeClient((text) => {
    if (text.includes("saas.catalog_recover_operation")) {
      return [{ outcome: "operation_replayed", result_payload: { product: product(), initialVariant: variant() } }];
    }
    if (text === "COMMIT") throw new Error("read-only commit response lost");
    return [];
  });
  await assert.rejects(
    repository(new FakePool(writer, recovery)).createProduct(createInput()),
    (error: unknown) => error instanceof CatalogRepositoryError && error.code === "unavailable",
  );
  assert.deepEqual(writer.releases, [true]);
  assert.deepEqual(recovery.releases, [true]);
  assert.equal(writer.calls.some((call) => call.text === "ROLLBACK"), false);
  assert.equal(recovery.calls.some((call) => call.text === "ROLLBACK"), false);
});

test("store-bound cursors fail closed in another TenantContext", async () => {
  const firstPageClient = new FakeClient((text) => text.includes("saas.catalog_list_products")
    ? [{ outcome: "listed", result_payload: {
      items: [product()], hasMore: true, catalogTotal: 1, featuredImages: {}, variantSummaries: {},
      cursorAnchor: { timestamp: NOW.toISOString(), title: null, id: PRODUCT_ID },
    } }]
    : []);
  const firstPage = await repository(new FakePool(firstPageClient)).listProducts({
    tenantContext: tenantContext(), now: NOW, pageSize: 1,
  });
  assert.equal(typeof firstPage.nextCursor, "string");
  const otherStore = tenantContext({ store: { id: "99999999-9999-4999-8999-999999999999", slug: "other-store", status: "active" } });
  const pool = new FakePool();
  await assert.rejects(
    repository(pool).listProducts({ tenantContext: otherStore, now: NOW, pageSize: 1, cursor: firstPage.nextCursor }),
    (error: unknown) => error instanceof CatalogRepositoryError && error.code === "invalid_input",
  );
  assert.equal(pool.connects, 0);
});

test("global list cursors bind search filters and sort before pool checkout", async () => {
  const firstPageClient = new FakeClient((text) => text.includes("saas.catalog_list_products_v4")
    ? [{ outcome: "listed", result_payload: {
      items: [product()],
      hasMore: true,
      catalogTotal: 1_631,
      featuredImages: {},
      variantSummaries: {},
      cursorAnchor: { timestamp: null, title: "atlas mug", id: PRODUCT_ID },
    } }]
    : []);
  const firstPage = await repository(new FakePool(firstPageClient)).listProducts({
    tenantContext: tenantContext(),
    now: NOW,
    pageSize: 20,
    search: "  Last SKU  ",
    status: "active",
    stock: "in-stock",
    categoryId: PRODUCT_ID,
    brandId: VARIANT_ID,
    collectionId: SECOND_PRODUCT_ID,
    sort: "title-asc",
  });
  assert.equal(firstPage.catalogTotal, 1_631);
  assert.equal(typeof firstPage.nextCursor, "string");

  const base = {
    tenantContext: tenantContext(),
    now: NOW,
    pageSize: 20,
    cursor: firstPage.nextCursor,
    search: "last sku",
    status: "active" as const,
    stock: "in-stock" as const,
    categoryId: PRODUCT_ID,
    brandId: VARIANT_ID,
    collectionId: SECOND_PRODUCT_ID,
    sort: "title-asc" as const,
  };
  const equivalentClient = new FakeClient((text) => text.includes("saas.catalog_list_products_v4")
    ? [{ outcome: "listed", result_payload: {
      items: [], hasMore: false, catalogTotal: 1_631, featuredImages: {}, variantSummaries: {}, cursorAnchor: null,
    } }]
    : []);
  const equivalentPool = new FakePool(equivalentClient);
  await repository(equivalentPool).listProducts(base);
  assert.equal(equivalentPool.connects, 1);
  assert.equal(equivalentClient.calls.find((call) => call.text.includes("catalog_list_products_v4"))?.values[8], "last sku");
  const mismatches = [
    { ...base, search: "Other" },
    { ...base, status: "draft" as const },
    { ...base, stock: "out-of-stock" as const },
    { ...base, categoryId: SECOND_PRODUCT_ID },
    { ...base, brandId: SECOND_VARIANT_ID },
    { ...base, collectionId: PRODUCT_ID },
    { ...base, sort: "title-desc" as const },
  ];
  for (const input of mismatches) {
    const pool = new FakePool();
    await assert.rejects(
      repository(pool).listProducts(input),
      (error: unknown) => error instanceof CatalogRepositoryError && error.code === "invalid_input",
    );
    assert.equal(pool.connects, 0);
  }
});

test("every valid maximum-length query produces a cursor accepted by the shared 2048-byte boundary", async () => {
  const longSearch = "ᾀ".repeat(200);
  const longTitle = "界".repeat(200);
  const client = new FakeClient((text) => text.includes("saas.catalog_list_products_v4")
    ? [{ outcome: "listed", result_payload: {
      items: [product({ title: longTitle })],
      hasMore: true,
      catalogTotal: 1_631,
      featuredImages: {},
      variantSummaries: {},
      cursorAnchor: { timestamp: null, title: longTitle, id: PRODUCT_ID },
    } }]
    : []);
  const result = await repository(new FakePool(client)).listProducts({
    tenantContext: tenantContext(),
    now: NOW,
    pageSize: 20,
    search: longSearch,
    status: "active",
    stock: "in-stock",
    categoryId: PRODUCT_ID,
    brandId: VARIANT_ID,
    collectionId: SECOND_PRODUCT_ID,
    sort: "title-asc",
  });

  assert.equal(typeof result.nextCursor, "string");
  assert.ok(result.nextCursor!.length <= 2_048);
});

test("listProducts returns only the first active media public projection for each listed product", async () => {
  const featuredImage = Object.freeze({
    publicUrl: "https://media.celebix.site/stores/11111111-1111-4111-8111-111111111111/products/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp",
    altText: "Ürün kapağı",
  });
  const client = new FakeClient((text) => text.includes("saas.catalog_list_products")
    ? [{ outcome: "listed", result_payload: {
      items: [product()],
      hasMore: false,
      catalogTotal: 1,
      featuredImages: { [PRODUCT_ID]: featuredImage },
      variantSummaries: {},
      cursorAnchor: null,
    } }]
    : []);

  const result = await repository(new FakePool(client)).listProducts({
    tenantContext: tenantContext(), now: NOW, pageSize: 20,
  });

  assert.deepEqual(result.featuredImages, { [PRODUCT_ID]: featuredImage });
  assert.equal(Object.isFrozen(result.featuredImages), true);
  assert.equal(Object.isFrozen(result.featuredImages?.[PRODUCT_ID]), true);
});

test("listProducts uses one v3 SQL read and returns a frozen safe variant summary with featured media", async () => {
  const featuredImage = Object.freeze({
    publicUrl: "https://media.celebix.site/stores/11111111-1111-4111-8111-111111111111/products/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp",
    altText: "Ürün kapağı",
  });
  const rawSummary = listVariantSummary();
  const client = new FakeClient((text) => text.includes("saas.catalog_list_products_v4")
    ? [{ outcome: "listed", result_payload: {
      items: [product()],
      hasMore: false,
      catalogTotal: 1,
      featuredImages: { [PRODUCT_ID]: featuredImage },
      variantSummaries: { [PRODUCT_ID]: rawSummary },
      cursorAnchor: null,
    } }]
    : []);

  const result = await repository(new FakePool(client)).listProducts({
    tenantContext: tenantContext(), now: NOW, pageSize: 20, status: "draft",
  });

  assert.deepEqual(result.variantSummaries, {
    [PRODUCT_ID]: {
      variantId: VARIANT_ID,
      sku: "ATLAS-MUG-1",
      priceCents: 12_500,
      compareAtCents: 15_000,
      stockTracking: true,
      stockQuantity: 10,
    },
  });
  assert.equal(Object.isFrozen(result.variantSummaries), true);
  assert.equal(Object.isFrozen(result.variantSummaries?.[PRODUCT_ID]), true);
  assert.deepEqual(result.featuredImages, { [PRODUCT_ID]: featuredImage });
  const listCalls = client.calls.filter((call) => call.text.includes("catalog_list_products"));
  assert.equal(listCalls.length, 1);
  assert.match(listCalls[0]!.text, /catalog_list_products_v4/);
  assert.deepEqual(listCalls[0]!.values.slice(8), [
    null, "draft", null, null, null, null, "updated-desc", 20, null, null, null,
  ]);
  assert.equal(client.calls.some((call) => call.text.includes("catalog_get_product_details")), false);
});

test("listProducts requires the v3 catalog total to be a safe non-negative integer", async () => {
  for (const catalogTotal of [undefined, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const client = new FakeClient((text) => text.includes("saas.catalog_list_products_v4")
      ? [{ outcome: "listed", result_payload: {
        items: [],
        hasMore: false,
        ...(catalogTotal === undefined ? {} : { catalogTotal }),
        featuredImages: {},
        variantSummaries: {},
        cursorAnchor: null,
      } }]
      : []);
    await assert.rejects(
      repository(new FakePool(client)).listProducts({ tenantContext: tenantContext(), now: NOW, pageSize: 20 }),
      (error: unknown) => error instanceof CatalogRepositoryError && error.code === "unavailable",
    );
  }
});

test("listProducts v3 fails closed on unknown, cross-tenant, duplicate, and unsafe summaries", async () => {
  const secondProduct = product({
    id: SECOND_PRODUCT_ID,
    slug: "atlas-second",
    title: "Atlas Second",
    createdAt: "2026-07-16T07:00:00.000Z",
    updatedAt: "2026-07-16T07:00:00.000Z",
  });
  const hostileMaps = [
    { "99999999-9999-4999-8999-999999999999": listVariantSummary() },
    { [PRODUCT_ID]: listVariantSummary({ productId: SECOND_PRODUCT_ID }) },
    { [PRODUCT_ID]: listVariantSummary({ storeId: "99999999-9999-4999-8999-999999999999" }) },
    {
      [PRODUCT_ID]: listVariantSummary(),
      [SECOND_PRODUCT_ID]: listVariantSummary({ productId: SECOND_PRODUCT_ID }),
    },
    { [PRODUCT_ID]: listVariantSummary({ variantId: "not-a-uuid" }) },
    { [PRODUCT_ID]: listVariantSummary({ sku: "invalid sku" }) },
    { [PRODUCT_ID]: listVariantSummary({ priceCents: Number.MAX_SAFE_INTEGER + 1 }) },
    { [PRODUCT_ID]: listVariantSummary({ stockQuantity: -1 }) },
  ];

  for (const variantSummaries of hostileMaps) {
    const client = new FakeClient((text) => text.includes("saas.catalog_list_products_v4")
      ? [{ outcome: "listed", result_payload: {
        items: [product(), secondProduct],
        hasMore: false,
        catalogTotal: 2,
        featuredImages: {},
        variantSummaries,
        cursorAnchor: null,
      } }]
      : []);
    await assert.rejects(
      repository(new FakePool(client)).listProducts({ tenantContext: tenantContext(), now: NOW, pageSize: 20 }),
      (error: unknown) => error instanceof CatalogRepositoryError && error.code === "unavailable",
    );
  }

  const valid = new FakeClient((text) => text.includes("saas.catalog_list_products_v4")
    ? [{ outcome: "listed", result_payload: {
      items: [product(), secondProduct],
      hasMore: false,
      catalogTotal: 2,
      featuredImages: {},
      variantSummaries: {
        [PRODUCT_ID]: listVariantSummary(),
        [SECOND_PRODUCT_ID]: listVariantSummary({
          productId: SECOND_PRODUCT_ID,
          variantId: SECOND_VARIANT_ID,
          sku: undefined,
          compareAtCents: undefined,
        }),
      },
      cursorAnchor: null,
    } }]
    : []);
  const parsed = await repository(new FakePool(valid)).listProducts({ tenantContext: tenantContext(), now: NOW, pageSize: 20 });
  assert.equal(parsed.variantSummaries?.[SECOND_PRODUCT_ID]?.variantId, SECOND_VARIANT_ID);
});

test("listVariantChoices returns one bounded tenant-scoped projection without crawling product details", async () => {
  const expected = [{
    productId: PRODUCT_ID,
    productTitle: "Atlas Mug",
    variantId: VARIANT_ID,
    variantTitle: "Default",
    sku: "ATLAS-MUG-1",
  }];
  const client = new FakeClient((text) => text.includes("saas.catalog_list_variant_choices")
    ? [{ outcome: "listed", result_payload: { items: expected } }]
    : []);
  const result = await repository(new FakePool(client)).listVariantChoices({
    tenantContext: tenantContext(),
    now: NOW,
  });
  assert.deepEqual(result, expected);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result[0]), true);
  const query = client.calls.find((call) => call.text.includes("saas.catalog_list_variant_choices"));
  assert.ok(query);
  assert.deepEqual(query.values, [
    STORE_ID, PRINCIPAL_ID, MEMBERSHIP_ID, PLAN_ID, "free_starter", 1, 10, NOW,
  ]);
  assert.equal(client.calls.some((call) => call.text.includes("catalog_get_product_details")), false);
});

test("getProductDetails derives store authority and returns ordered active variants from migration 019", async () => {
  const client = new FakeClient((text) => text.includes("saas.catalog_get_product_details")
    ? [{ outcome: "found", result_payload: { product: product(), variants: [variant()] } }]
    : []);
  const result = await repository(new FakePool(client)).getProductDetails({
    tenantContext: tenantContext(),
    now: NOW,
    productId: PRODUCT_ID,
  });
  assert.deepEqual(result, { product: product(), variants: [variant()] });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.product), true);
  assert.equal(Object.isFrozen(result.variants), true);
  assert.equal(Object.isFrozen(result.variants[0]?.attributes), true);
  const read = client.calls.find((call) => call.text.includes("saas.catalog_get_product_details"));
  assert.ok(read);
  assert.equal(read.values[0], STORE_ID);
  assert.equal(read.values[8], PRODUCT_ID);
  assert.equal(read.values[9], false);
});

test("getProductDetails accepts an archived product projection for panel lifecycle reads", async () => {
  const archived = { ...product(), status: "archived" };
  const client = new FakeClient((text) => text.includes("saas.catalog_get_product_details")
    ? [{ outcome: "found", result_payload: { product: archived, variants: [] } }]
    : []);
  const result = await repository(new FakePool(client)).getProductDetails({
    tenantContext: tenantContext(),
    now: NOW,
    productId: PRODUCT_ID,
    includeArchivedVariants: true,
  });
  assert.equal(result.product.status, "archived");
  assert.deepEqual(result.variants, []);
});

test("storefront product preview preserves an unavailable selling price instead of falling back to base cents", async () => {
  const client = new FakeClient((text) => text.includes("saas.catalog_get_product_preview_v2")
    ? [{ outcome: "found", result_payload: {
      canonicalStorefrontUrl: "https://pricing-isolated.test/products/atlas-mug",
      product: { id: PRODUCT_ID, slug: "atlas-mug", title: "Atlas Mug", status: "active", currency: "TRY", version: 1 },
      variants: [{ title: "Default", priceCents: null, stockTracking: false, stockQuantity: 0, attributes: {} }],
      media: [], merchandising: {},
    } }]
    : []);
  const result = await repository(new FakePool(client)).getProductPreview({
    tenantContext: tenantContext(), now: NOW, productId: PRODUCT_ID,
  });
  assert.equal(result.variants[0]?.priceCents, null);
  assert.ok(client.calls.some((call) => call.text.includes("catalog_get_product_preview_v2")));
});

test("repository enforces product operation roles before checking out a SQL client", async () => {
  const forbidden = [
    {
      role: "editor",
      invoke: (catalog: PostgresCatalogRepository) => catalog.archiveProduct({
        tenantContext: tenantContext({ membership: { id: MEMBERSHIP_ID, role: "editor", status: "active" } }),
        now: NOW,
        operationId: OPERATION_ID,
        productId: PRODUCT_ID,
        expectedVersion: 1,
      }),
    },
    {
      role: "analyst",
      invoke: (catalog: PostgresCatalogRepository) => catalog.updateProduct({
        tenantContext: tenantContext({ membership: { id: MEMBERSHIP_ID, role: "analyst", status: "active" } }),
        now: NOW,
        operationId: OPERATION_ID,
        productId: PRODUCT_ID,
        expectedVersion: 1,
        product: createInput().product,
      }),
    },
    {
      role: "analyst",
      invoke: (catalog: PostgresCatalogRepository) => catalog.createProduct({
        ...createInput(),
        tenantContext: tenantContext({ membership: { id: MEMBERSHIP_ID, role: "analyst", status: "active" } }),
      }),
    },
  ] as const;
  for (const entry of forbidden) {
    const pool = new FakePool();
    await assert.rejects(
      entry.invoke(repository(pool)),
      (error: unknown) => error instanceof CatalogRepositoryError && error.code === "membership_denied",
      entry.role,
    );
    assert.equal(pool.connects, 0);
  }
});

test("owner and admin archive while editor cannot, using the secured SQL boundary", async () => {
  for (const role of ["store_owner", "admin"] as const) {
    const archived = { ...product(), status: "archived", version: 2 };
    const client = new FakeClient((text) => text.includes("saas.catalog_archive_product")
      ? [{ outcome: "archived", result_payload: { product: archived } }]
      : []);
    const result = await repository(new FakePool(client)).archiveProduct({
      tenantContext: tenantContext({ membership: { id: MEMBERSHIP_ID, role, status: "active" } }),
      now: NOW,
      operationId: OPERATION_ID,
      productId: PRODUCT_ID,
      expectedVersion: 1,
    });
    assert.equal(result.product.status, "archived");
    const mutation = client.calls.find((call) => call.text.includes("saas.catalog_archive_product"));
    assert.ok(mutation);
    assert.match(mutation.text, /saas[.]catalog_archive_product\(/u);
    assert.doesNotMatch(mutation.text, /_authorized/u);
  }
});

test("product permanent deletion binds impact, exact confirmation, version, and operation id", async () => {
  const impact = {
    resourceKind: "product",
    resourceId: PRODUCT_ID,
    expectedVersion: 4,
    confirmationLabel: "Atlas Mug",
    effects: [
      { kind: "variants", count: 1, disposition: "delete" },
      { kind: "order_line_snapshots", count: 2, disposition: "retain_snapshot" },
    ],
  } as const;
  const reader = new FakeClient((text) => text.includes("saas.catalog_product_deletion_impact")
    ? [{ outcome: "found", result_payload: impact }]
    : []);
  assert.deepEqual(await repository(new FakePool(reader)).getProductDeletionImpact({
    tenantContext: tenantContext(), now: NOW, productId: PRODUCT_ID,
  }), impact);
  const impactCall = reader.calls.find(({ text }) => text.includes("saas.catalog_product_deletion_impact"));
  assert.ok(impactCall);
  assert.deepEqual(impactCall.values.slice(0, 9), [STORE_ID, PRINCIPAL_ID, MEMBERSHIP_ID, PLAN_ID, "free_starter", 1, 10, NOW, PRODUCT_ID]);

  const result = { resourceKind: "product", resourceId: PRODUCT_ID, deleted: true, auditId: OPERATION_ID, replayed: false } as const;
  const writer = new FakeClient((text) => text.includes("saas.delete_product")
    ? [{ outcome: "deleted", result_payload: result }]
    : []);
  assert.deepEqual(await repository(new FakePool(writer)).deleteProduct({
    tenantContext: tenantContext(), now: NOW, productId: PRODUCT_ID,
    operationId: OPERATION_ID, expectedVersion: 4, confirmation: "Atlas Mug",
  }), result);
  const deleteCall = writer.calls.find(({ text }) => text.includes("saas.delete_product"));
  assert.ok(deleteCall);
  assert.equal(deleteCall.values[8], OPERATION_ID);
  assert.equal(deleteCall.values[10], PRODUCT_ID);
  assert.equal(deleteCall.values[11], 4);
  assert.equal(deleteCall.values[12], "Atlas Mug");
});

test("product permanent deletion is denied to editor before SQL", async () => {
  const pool = new FakePool();
  await assert.rejects(
    repository(pool).deleteProduct({
      tenantContext: tenantContext({ membership: { id: MEMBERSHIP_ID, role: "editor", status: "active" } }),
      now: NOW, productId: PRODUCT_ID, operationId: OPERATION_ID, expectedVersion: 1, confirmation: "Atlas Mug",
    }),
    (error: unknown) => error instanceof CatalogRepositoryError && error.code === "membership_denied",
  );
  assert.equal(pool.connects, 0);
});

test("product media cleanup preparation commits before cleanup_pending is returned", async () => {
  const writer = new FakeClient((text) => text.includes("saas.delete_product(")
    ? [{ outcome: "cleanup_pending", result_payload: null }]
    : []);

  await assert.rejects(
    repository(new FakePool(writer)).deleteProduct({
      tenantContext: tenantContext(), now: NOW, productId: PRODUCT_ID,
      operationId: OPERATION_ID, expectedVersion: 4, confirmation: "Atlas Mug",
    }),
    (error: unknown) => error instanceof CatalogRepositoryError && error.code === "cleanup_pending",
  );
  assert.equal(writer.calls.some(({ text }) => text === "COMMIT"), true);
  assert.equal(writer.calls.some(({ text }) => text === "ROLLBACK"), false);
  assert.deepEqual(writer.releases, [undefined]);
});

test("unknown product deletion COMMIT recovers only from the immutable deletion ledger", async () => {
  const committed = { resourceKind: "product", resourceId: PRODUCT_ID, deleted: true, auditId: OPERATION_ID, replayed: false } as const;
  const replayed = { ...committed, replayed: true } as const;
  const writer = new FakeClient((text) => {
    if (text.includes("saas.delete_product(")) return [{ outcome: "deleted", result_payload: committed }];
    if (text === "COMMIT") throw new Error("commit response lost");
    return [];
  });
  const recovery = new FakeClient((text) => text.includes("saas.delete_product_recover")
    ? [{ outcome: "operation_replayed", result_payload: replayed }]
    : []);

  assert.deepEqual(await repository(new FakePool(writer, recovery)).deleteProduct({
    tenantContext: tenantContext(), now: NOW, productId: PRODUCT_ID,
    operationId: OPERATION_ID, expectedVersion: 4, confirmation: "Atlas Mug",
  }), replayed);
  assert.equal(recovery.calls.filter(({ text }) => text.includes("delete_product_recover")).length, 1);
  assert.equal(recovery.calls.some(({ text }) => text.includes("catalog_recover_operation")), false);
  assert.equal(recovery.calls.some(({ text }) => text.includes("saas.delete_product(")), false);
});

test("restoreProduct returns draft and preserves idempotent replay semantics", async () => {
  const restored = { ...product(), status: "draft", version: 3 };
  for (const [outcome, replayed] of [["restored", false], ["operation_replayed", true]] as const) {
    const client = new FakeClient((text) => text.includes("saas.catalog_restore_product")
      ? [{ outcome, result_payload: { product: restored } }]
      : []);
    const result = await repository(new FakePool(client)).restoreProduct({
      tenantContext: tenantContext(),
      now: NOW,
      operationId: OPERATION_ID,
      productId: PRODUCT_ID,
      expectedVersion: 2,
    });
    assert.equal(result.product.status, "draft");
    assert.equal(result.replayed, replayed);
    const mutation = client.calls.find((call) => call.text.includes("saas.catalog_restore_product"));
    assert.ok(mutation);
    assert.equal(mutation.values[10], PRODUCT_ID);
    assert.equal(mutation.values[11], 2);
  }
});

test("finite SQL outcomes and unexpected driver failures expose only stable safe errors", async () => {
  const denied = new FakeClient((text) => text.includes("saas.catalog_get_product")
    ? [{ outcome: "product_not_found", result_payload: null }]
    : []);
  await assert.rejects(
    repository(new FakePool(denied)).getProduct({ tenantContext: tenantContext(), now: NOW, productId: PRODUCT_ID }),
    (error: unknown) => error instanceof CatalogRepositoryError && error.message === "product_not_found",
  );

  const broken = new FakeClient((text) => {
    if (text.includes("saas.catalog_get_product")) throw new Error("driver detail SELECT private_table");
    return [];
  });
  await assert.rejects(
    repository(new FakePool(broken)).getProduct({ tenantContext: tenantContext(), now: NOW, productId: PRODUCT_ID }),
    (error: unknown) => error instanceof CatalogRepositoryError && error.message === "unavailable",
  );
});

test("getDashboardSummary derives authority from TenantContext and returns a frozen exact projection", async () => {
  const expected = dashboardSummary();
  const client = new FakeClient((text) => text.includes("saas.catalog_get_dashboard_summary")
    ? [{ outcome: "summarized", result_payload: expected }]
    : []);
  const result = await repository(new FakePool(client)).getDashboardSummary({
    tenantContext: tenantContext(),
    now: NOW,
  });
  assert.deepEqual(result, expected);
  assert.equal(Object.isFrozen(result), true);
  const query = client.calls.find((call) => call.text.includes("saas.catalog_get_dashboard_summary"));
  assert.ok(query);
  assert.deepEqual(query.values, [
    STORE_ID,
    PRINCIPAL_ID,
    MEMBERSHIP_ID,
    PLAN_ID,
    "free_starter",
    1,
    10,
    NOW,
  ]);
  assert.equal(query.values.includes("catalog-request-1"), false);
  assert.equal(query.values.includes("subject-1"), false);
});

test("getDashboardSummary rejects browser-supplied authority before pool checkout", async () => {
  const pool = new FakePool();
  await assert.rejects(
    repository(pool).getDashboardSummary({
      tenantContext: tenantContext(),
      now: NOW,
      storeId: STORE_ID,
    } as never),
    (error: unknown) => error instanceof CatalogRepositoryError && error.code === "invalid_input",
  );
  assert.equal(pool.connects, 0);
});

test("getDashboardSummary rejects malformed and internally inconsistent projections", async () => {
  const malformed = [
    dashboardSummary({ totalProducts: -1 }),
    dashboardSummary({ totalProducts: 1.5 }),
    dashboardSummary({ extra: 1 }),
    dashboardSummary({ activeProducts: 2 }),
    dashboardSummary({ outOfStockVariants: 7 }),
    dashboardSummary({ productsWithoutMedia: 5 }),
  ];
  for (const resultPayload of malformed) {
    const client = new FakeClient((text) => text.includes("saas.catalog_get_dashboard_summary")
      ? [{ outcome: "summarized", result_payload: resultPayload }]
      : []);
    await assert.rejects(
      repository(new FakePool(client)).getDashboardSummary({ tenantContext: tenantContext(), now: NOW }),
      (error: unknown) => error instanceof CatalogRepositoryError && error.code === "unavailable",
    );
  }
});
