import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCatalogAdminImportJob,
  parseCatalogImportPreview,
  parseCatalogAdminResource,
  parseProductReview,
} from "./validation.ts";

const NOW = "2026-07-22T18:00:00.000Z";
const LATER = "2026-07-22T18:15:00.000Z";
const ID = "11111111-1111-4111-8111-111111111111";

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
