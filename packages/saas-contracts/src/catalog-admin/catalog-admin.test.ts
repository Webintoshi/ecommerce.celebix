import assert from "node:assert/strict";
import test from "node:test";

import {
  CATALOG_ADMIN_RESOURCE_KINDS,
  parseBarcodeLabelRows,
  parseCatalogAdminImportJob,
  parseCatalogImportPreview,
  parseCatalogAdminResource,
  parseProductReview,
} from "./index.ts";

const NOW = "2026-07-22T18:00:00.000Z";
const LATER = "2026-07-22T18:15:00.000Z";
const ID = "11111111-1111-4111-8111-111111111111";
const VARIANT_ID = "22222222-2222-4222-8222-222222222222";

test("tag is the only added catalog resource kind", () => {
  assert.deepEqual(CATALOG_ADMIN_RESOURCE_KINDS, [
    "collection",
    "brand",
    "attribute",
    "extra",
    "definition",
    "tag",
  ]);
});

test("barcode labels include only exact persisted codes and are deeply immutable", () => {
  const rows = parseBarcodeLabelRows([
    {
      productId: ID,
      variantId: VARIANT_ID,
      productTitle: "Çanta",
      variantTitle: "Siyah",
      sku: "CNT-1",
      barcode: "869000000001",
    },
  ]);
  assert.equal(rows[0]?.barcode, "869000000001");
  assert.equal(Object.isFrozen(rows), true);
  assert.equal(Object.isFrozen(rows[0]), true);
  assert.throws(() =>
    parseBarcodeLabelRows([
      {
        productId: ID,
        variantId: VARIANT_ID,
        productTitle: "Çanta",
        variantTitle: "Siyah",
      },
    ]),
  );
});

test("barcode label rows enforce exact UUID title SKU barcode and count bounds", () => {
  const valid = {
    productId: ID,
    variantId: VARIANT_ID,
    productTitle: "Çanta",
    variantTitle: "Siyah",
    barcode: "ABC123",
  };
  for (const hostile of [
    {
      ...valid,
      productId: "aaaaaaaa-1111-4111-8111-111111111111".toUpperCase(),
    },
    { ...valid, productTitle: "" },
    { ...valid, variantTitle: "x".repeat(201) },
    { ...valid, sku: "bad sku" },
    { ...valid, barcode: "12345" },
    { ...valid, barcode: "x".repeat(65) },
    { ...valid, barcode: "8690-0000" },
    { ...valid, generated: true },
  ]) {
    assert.throws(() => parseBarcodeLabelRows([hostile]));
  }
  assert.throws(() => parseBarcodeLabelRows({}));
  assert.throws(() =>
    parseBarcodeLabelRows(Array.from({ length: 501 }, () => valid)),
  );
});

test("import preview is exact, bounded and immutable", () => {
  const value = parseCatalogImportPreview({
    id: ID,
    format: "shopify_csv",
    fileName: "products.csv",
    digest: "a".repeat(64),
    status: "prepared",
    rows: [
      {
        title: "Kahve",
        slug: "kahve",
        priceCents: 25000,
        sku: "KHV-1",
        stockQuantity: 5,
      },
    ],
    totalRows: 1,
    version: 1,
    expiresAt: LATER,
    createdAt: NOW,
    updatedAt: NOW,
  });
  assert.equal(Object.isFrozen(value.rows), true);
  assert.throws(() =>
    parseCatalogImportPreview({ ...value, rawCsv: "secret" }),
  );
});

test("parses and freezes exact catalog administration resources", () => {
  const value = parseCatalogAdminResource({
    id: ID,
    kind: "collection",
    name: "Yeni Gelenler",
    slug: "yeni-gelenler",
    description: "Vitrin koleksiyonu",
    config: { featured: true },
    status: "active",
    productIds: [ID],
    productCount: 1,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  });
  assert.equal(value.kind, "collection");
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.config), true);
  assert.equal(Object.isFrozen(value.productIds), true);
  for (const hostile of [
    { ...value, storeId: ID },
    { ...value, kind: "unknown" },
    { ...value, name: " bad" },
    { ...value, config: { secret: "x".repeat(9000) } },
  ])
    assert.throws(() => parseCatalogAdminResource(hostile));
});

test("parses strict review moderation DTOs", () => {
  const value = parseProductReview({
    id: ID,
    productId: ID,
    productTitle: "Keten Gömlek",
    reviewerName: "Ada",
    rating: 5,
    title: "Çok iyi",
    body: "Ürün beklentimi karşıladı.",
    status: "pending",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  });
  assert.equal(Object.isFrozen(value), true);
  for (const hostile of [
    { ...value, rating: 0 },
    { ...value, reviewerEmail: "ada@example.com" },
    { ...value, status: "deleted" },
  ])
    assert.throws(() => parseProductReview(hostile));
});

test("parses completed durable import jobs without raw rows", () => {
  const value = parseCatalogAdminImportJob({
    id: ID,
    fileName: "urunler.csv",
    status: "completed",
    totalRows: 2,
    succeededRows: 2,
    failedRows: 0,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  });
  assert.equal(Object.isFrozen(value), true);
  assert.throws(() =>
    parseCatalogAdminImportJob({ ...value, rows: [{ title: "secret" }] }),
  );
});
