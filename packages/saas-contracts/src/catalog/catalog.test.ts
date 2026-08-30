import assert from "node:assert/strict";
import test from "node:test";

import {
  CATALOG_PRODUCT_SORTS,
  CATALOG_PRODUCT_STOCK_FILTERS,
  PRODUCT_STATUSES,
  VARIANT_STATUSES,
  catalogProductListQueryBinding,
  catalogProductListQueryDigest,
  parseCatalogProductListQuery,
  parseCatalogProductListVariantSummary,
  parseProduct,
  parseProductVariant,
} from "./index.ts";

import { parseCatalogBulkProductIntent, parseCatalogProductPageSize } from "./index.ts";

const PRODUCT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VARIANT_ID = "22222222-2222-4222-8222-222222222222";
const STORE_ID = "33333333-3333-4333-8333-333333333333";
const CREATED_AT = "2026-07-16T08:00:00.000Z";

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    storeId: STORE_ID,
    slug: "atlas-mug",
    title: "Atlas Mug",
    description: "A durable catalog fixture",
    status: "draft",
    currency: "TRY",
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    version: 1,
    ...overrides,
  };
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
    attributes: { color: "black", size: "standard" },
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    version: 1,
    ...overrides,
  };
}

test("exports the exact immutable catalog status registries", () => {
  assert.deepEqual(PRODUCT_STATUSES, ["draft", "active", "archived"]);
  assert.deepEqual(VARIANT_STATUSES, ["active", "archived"]);
  assert.equal(Object.isFrozen(PRODUCT_STATUSES), true);
  assert.equal(Object.isFrozen(VARIANT_STATUSES), true);
});

test("normalizes and freezes the exact global product-list query contract", () => {
  assert.deepEqual(CATALOG_PRODUCT_STOCK_FILTERS, ["in-stock", "out-of-stock", "untracked"]);
  assert.deepEqual(CATALOG_PRODUCT_SORTS, ["updated-desc", "title-asc", "title-desc", "created-desc", "created-asc"]);
  assert.equal(Object.isFrozen(CATALOG_PRODUCT_STOCK_FILTERS), true);
  assert.equal(Object.isFrozen(CATALOG_PRODUCT_SORTS), true);

  const parsed = parseCatalogProductListQuery({
    search: "  SoN SKU  ",
    status: "archived",
    stock: "out-of-stock",
    categoryId: PRODUCT_ID,
    brandId: VARIANT_ID,
    collectionId: STORE_ID,
    sort: "title-asc",
  });
  assert.deepEqual(parsed, {
    search: "SoN SKU",
    status: "archived",
    stock: "out-of-stock",
    categoryId: PRODUCT_ID,
    brandId: VARIANT_ID,
    collectionId: STORE_ID,
    sort: "title-asc",
  });
  assert.equal(Object.isFrozen(parsed), true);
  assert.deepEqual(parseCatalogProductListQuery({ search: "   " }), { sort: "updated-desc" });
  assert.deepEqual(parseCatalogProductListQuery({}), { sort: "updated-desc" });
});

test("global product-list query rejects unknown dimensions and unsafe values", () => {
  for (const value of [
    { unexpected: true },
    { search: "x".repeat(201) },
    { search: "unsafe\u0000query" },
    { status: "deleted" },
    { stock: "hidden" },
    { categoryId: "foreign" },
    { brandId: PRODUCT_ID.toUpperCase() },
    { collectionId: null },
    { sort: "price-asc" },
  ]) {
    assert.throws(() => parseCatalogProductListQuery(value), /catalog_contract_invalid/);
  }
});

test("global product-list query exposes a reusable versioned canonical cursor binding", () => {
  const first = catalogProductListQueryBinding({ search: "  SoN SKU  ", status: "active", sort: "title-asc" });
  const equivalent = catalogProductListQueryBinding({ search: "son sku", status: "active", sort: "title-asc" });
  assert.deepEqual(first, {
    version: 1,
    search: "son sku",
    status: "active",
    stock: null,
    categoryId: null,
    brandId: null,
    collectionId: null,
    sort: "title-asc",
  });
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(equivalent, first);
  const firstDigest = catalogProductListQueryDigest({ search: "  SoN SKU  ", status: "active", sort: "title-asc" });
  assert.equal(firstDigest, catalogProductListQueryDigest({ search: "son sku", status: "active", sort: "title-asc" }));
  assert.equal(
    catalogProductListQueryDigest({ search: "İSTANBUL ÖZEL" }),
    catalogProductListQueryDigest({ search: "istanbul özel" }),
  );
  assert.equal(
    catalogProductListQueryDigest({ search: "I\u0307STANBUL ÖZEL" }),
    catalogProductListQueryDigest({ search: "İSTANBUL ÖZEL" }),
  );
  assert.equal(
    catalogProductListQueryDigest({ search: "IŞIK" }),
    catalogProductListQueryDigest({ search: "ışık" }),
  );
  assert.equal(
    catalogProductListQueryDigest({ search: "ÉLAN" }),
    catalogProductListQueryDigest({ search: "élan" }),
  );
  assert.notEqual(firstDigest, catalogProductListQueryDigest({ search: "other", status: "active", sort: "title-asc" }));
  assert.match(firstDigest, /^catalog-product-list-query:v1:/u);
});

test("product list page size is one of the three merchant choices", () => {
  assert.equal(parseCatalogProductPageSize(20), 20);
  assert.equal(parseCatalogProductPageSize(50), 50);
  assert.equal(parseCatalogProductPageSize(100), 100);
  for (const value of [0, 1, 19, 21, 49, 99, 101, "20", null]) {
    assert.throws(() => parseCatalogProductPageSize(value), /catalog_contract_invalid/);
  }
});

test("bulk product intent accepts one bounded unique versioned target set without browser authority", () => {
  const parsed = parseCatalogBulkProductIntent({
    action: "active",
    targets: [
      { productId: "11111111-1111-4111-8111-111111111111", expectedVersion: 3 },
      { productId: "22222222-2222-4222-8222-222222222222", expectedVersion: 7 },
    ],
  });
  assert.equal(parsed.action, "active");
  assert.equal(parsed.targets.length, 2);
  assert.equal(Object.isFrozen(parsed.targets), true);

  for (const value of [
    { action: "active", targets: [] },
    { action: "delete", targets: [{ productId: "11111111-1111-4111-8111-111111111111", expectedVersion: 1 }] },
    { action: "draft", targets: [{ productId: "11111111-1111-4111-8111-111111111111", expectedVersion: 0 }] },
    { action: "archive", targets: [
      { productId: "11111111-1111-4111-8111-111111111111", expectedVersion: 1 },
      { productId: "11111111-1111-4111-8111-111111111111", expectedVersion: 2 },
    ] },
    { action: "draft", targets: [{ productId: "11111111-1111-4111-8111-111111111111", expectedVersion: 1 }], storeId: "forged" },
  ]) assert.throws(() => parseCatalogBulkProductIntent(value), /catalog_contract_invalid/);
});

test("parses and deeply freezes exact product and variant projections", () => {
  const parsedProduct = parseProduct(product());
  const parsedVariant = parseProductVariant(variant());
  assert.deepEqual(parsedProduct, product());
  assert.deepEqual(parsedVariant, variant());
  assert.equal(Object.isFrozen(parsedProduct), true);
  assert.equal(Object.isFrozen(parsedVariant), true);
  assert.equal(Object.isFrozen(parsedVariant.attributes), true);
});

test("rejects extra keys, noncanonical identifiers, text, currency, and timestamps", () => {
  for (const value of [
    product({ unexpected: true }),
    product({ id: PRODUCT_ID.toUpperCase() }),
    product({ slug: "Atlas-Mug" }),
    product({ title: " Atlas Mug" }),
    product({ currency: "try" }),
    product({ updatedAt: "2026-07-16T08:00:00Z" }),
    product({ version: 0 }),
  ]) {
    assert.throws(() => parseProduct(value), /catalog_contract_invalid/);
  }
});

test("rejects unsafe money, stock, SKU, barcode, and attribute values", () => {
  for (const value of [
    variant({ sku: "atlas-mug-1" }),
    variant({ barcode: " 8690000000001" }),
    variant({ priceCents: -1 }),
    variant({ priceCents: 1.2 }),
    variant({ compareAtCents: 12_499 }),
    variant({ stockQuantity: -1 }),
    variant({ attributes: [] }),
    variant({ attributes: { color: 7 } }),
    variant({ attributes: { ["a".repeat(65)]: "value" } }),
    variant({ attributes: Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`k${index}`, "v"])) }),
  ]) {
    assert.throws(() => parseProductVariant(value), /catalog_contract_invalid/);
  }
});

test("optional product and variant fields must be omitted or canonical", () => {
  const { description: _description, ...withoutOptionals } = product();
  const {
    sku: _sku,
    barcode: _barcode,
    compareAtCents: _compareAtCents,
    costCents: _costCents,
    ...variantWithoutOptionals
  } = variant();
  assert.equal(parseProduct(withoutOptionals).description, undefined);
  assert.equal(parseProductVariant(variantWithoutOptionals).sku, undefined);
  assert.throws(() => parseProduct(product({ description: "" })), /catalog_contract_invalid/);
  assert.throws(() => parseProductVariant(variant({ sku: null })), /catalog_contract_invalid/);
});

test("product descriptions preserve safe Markdown line breaks and reject other controls", () => {
  const markdown = "Birinci paragraf\n\n- Birinci madde\n- İkinci madde";

  assert.equal(parseProduct(product({ description: markdown })).description, markdown);

  for (const control of ["\u0000", "\u0008", "\u000b", "\r", "\u001f", "\u007f"]) {
    assert.throws(
      () => parseProduct(product({ description: `Güvenli metin${control}değil` })),
      /catalog_contract_invalid/,
    );
  }
});

test("parses and freezes the exact product-list variant summary projection", () => {
  const summary = {
    variantId: VARIANT_ID,
    sku: "ATLAS-MUG-1",
    priceCents: 12_500,
    compareAtCents: 15_000,
    stockTracking: true,
    stockQuantity: 10,
  };

  const parsed = parseCatalogProductListVariantSummary(summary);

  assert.deepEqual(parsed, summary);
  assert.equal(Object.isFrozen(parsed), true);
  assert.deepEqual(parseCatalogProductListVariantSummary({
    variantId: VARIANT_ID,
    priceCents: 0,
    stockTracking: false,
    stockQuantity: 0,
  }), {
    variantId: VARIANT_ID,
    priceCents: 0,
    stockTracking: false,
    stockQuantity: 0,
  });
});

test("product-list variant summary rejects extra keys and unsafe list values", () => {
  const valid = {
    variantId: VARIANT_ID,
    sku: "ATLAS-MUG-1",
    priceCents: 12_500,
    compareAtCents: 15_000,
    stockTracking: true,
    stockQuantity: 10,
  };
  for (const value of [
    { ...valid, productId: PRODUCT_ID },
    { ...valid, variantId: "not-a-uuid" },
    { ...valid, sku: "atlas-mug-1" },
    { ...valid, priceCents: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, compareAtCents: 12_499 },
    { ...valid, stockQuantity: -1 },
    { ...valid, stockTracking: "true" },
  ]) {
    assert.throws(() => parseCatalogProductListVariantSummary(value), /catalog_contract_invalid/);
  }
});
