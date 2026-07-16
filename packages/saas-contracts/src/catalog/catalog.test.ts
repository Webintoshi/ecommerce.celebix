import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCT_STATUSES,
  VARIANT_STATUSES,
  parseProduct,
  parseProductVariant,
} from "./index.ts";

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
