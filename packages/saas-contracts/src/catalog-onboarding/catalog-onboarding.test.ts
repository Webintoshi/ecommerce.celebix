import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCatalogOnboardingIntent,
  parseCatalogOnboardingOptions,
  parseCatalogOnboardingResult,
  parseCatalogProductEditorProjection,
} from "./index.ts";

const STORE_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const VARIANT_ID = "33333333-3333-4333-8333-333333333333";
const CATEGORY_ID = "44444444-4444-4444-8444-444444444444";
const RESOURCE_ID = "55555555-5555-4555-8555-555555555555";
const CHANNEL_ID = "66666666-6666-4666-8666-666666666666";
const LOCATION_ID = "77777777-7777-4777-8777-777777777777";
const TIME = "2026-07-28T10:00:00.000Z";

function product(status: "draft" | "active" = "draft") {
  return {
    id: PRODUCT_ID,
    storeId: STORE_ID,
    slug: "seramik-kupa",
    title: "Seramik Kupa",
    status,
    currency: "TRY",
    createdAt: TIME,
    updatedAt: TIME,
    version: 1,
  };
}

function variant() {
  return {
    id: VARIANT_ID,
    productId: PRODUCT_ID,
    storeId: STORE_ID,
    title: "Standart",
    priceCents: 12990,
    stockTracking: true,
    stockQuantity: 0,
    status: "active",
    attributes: {},
    createdAt: TIME,
    updatedAt: TIME,
    version: 1,
  };
}

function profile() {
  return {
    productType: "physical",
    minimumPurchaseQuantity: 1,
    version: 1,
    updatedAt: TIME,
  };
}

function resources() {
  return {
    collections: [RESOURCE_ID],
    tags: [],
    attributes: [],
    extras: [],
    definitions: [],
  };
}

test("quick intent requires only title and price and applies no browser authority", () => {
  const parsed = parseCatalogOnboardingIntent({
    kind: "quick",
    title: "Seramik Kupa",
    priceCents: 12990,
    publish: true,
  });

  assert.deepEqual(parsed, {
    kind: "quick",
    title: "Seramik Kupa",
    priceCents: 12990,
    publish: true,
  });
  assert.ok(Object.isFrozen(parsed));
  for (const privateKey of ["storeId", "tenantId", "principalId", "membershipId", "planId"]) {
    assert.throws(() => parseCatalogOnboardingIntent({ ...parsed, [privateKey]: STORE_ID }), /catalog_onboarding_contract_invalid/);
  }
});

test("quick intent accepts only bounded optional stock and one canonical category", () => {
  assert.deepEqual(parseCatalogOnboardingIntent({
    kind: "quick",
    title: "Seramik Kupa",
    priceCents: 0,
    publish: false,
    stockQuantity: 12,
    categoryId: CATEGORY_ID,
  }), {
    kind: "quick",
    title: "Seramik Kupa",
    priceCents: 0,
    publish: false,
    stockQuantity: 12,
    categoryId: CATEGORY_ID,
  });
  assert.throws(() => parseCatalogOnboardingIntent({ kind: "quick", title: "Kupa", priceCents: 10, publish: true, stockQuantity: -1 }), /catalog_onboarding_contract_invalid/);
  assert.throws(() => parseCatalogOnboardingIntent({ kind: "quick", title: " Kupa", priceCents: 10, publish: true }), /catalog_onboarding_contract_invalid/);
});

test("advanced intent preserves bounded variants merchandising and assignments", () => {
  const parsed = parseCatalogOnboardingIntent({
    kind: "advanced",
    productType: "physical",
    title: "Seramik Kupa",
    description: "El yapımı seramik kupa",
    publish: false,
    variants: [{
      title: "Standart",
      sku: "KUPA-01",
      priceCents: 12990,
      compareAtCents: 14990,
      costCents: 6000,
      stockTracking: true,
      stockQuantity: 8,
      attributes: { Renk: "Beyaz" },
      continueSellingWhenOutOfStock: false,
      unitPricing: { measuredQuantityMilli: 1000, measuredUnit: "piece", baseQuantityMilli: 1000, baseUnit: "piece" },
      shippingDesiMilli: 2500,
      hsCode: "691200",
      inventory: [{ locationId: LOCATION_ID, quantity: 8 }],
    }],
    categoryIds: [CATEGORY_ID],
    resourceIds: { brand: RESOURCE_ID, ...resources() },
    channelIds: [CHANNEL_ID],
    profile: {
      supplierName: "Celebix Tedarik",
      googleProductCategoryId: "6049",
      seoTitle: "Seramik Kupa",
      seoDescription: "El yapımı seramik kupa satın alın.",
      minimumPurchaseQuantity: 1,
      maximumPurchaseQuantity: 5,
    },
  });

  assert.equal(parsed.kind, "advanced");
  assert.equal(parsed.variants.length, 1);
  assert.equal(parsed.variants[0]?.shippingDesiMilli, 2500);
  assert.ok(Object.isFrozen(parsed));
  assert.ok(Object.isFrozen(parsed.variants));
  assert.ok(Object.isFrozen(parsed.variants[0]?.attributes));
  assert.ok(Object.isFrozen(parsed.resourceIds.collections));
});

test("advanced intent rejects digital shipping duplicate ids and invalid commerce arithmetic", () => {
  const base = {
    kind: "advanced",
    productType: "digital",
    title: "E-kitap",
    publish: false,
    variants: [{
      title: "PDF",
      priceCents: 1000,
      stockTracking: false,
      stockQuantity: 0,
      attributes: {},
      continueSellingWhenOutOfStock: false,
      inventory: [],
    }],
    categoryIds: [],
    resourceIds: resources(),
    channelIds: [],
    profile: { minimumPurchaseQuantity: 1 },
  };
  assert.throws(() => parseCatalogOnboardingIntent({ ...base, variants: [{ ...base.variants[0], shippingDesiMilli: 1000 }] }), /catalog_onboarding_contract_invalid/);
  assert.throws(() => parseCatalogOnboardingIntent({ ...base, categoryIds: [CATEGORY_ID, CATEGORY_ID] }), /catalog_onboarding_contract_invalid/);
  assert.throws(() => parseCatalogOnboardingIntent({ ...base, profile: { minimumPurchaseQuantity: 5, maximumPurchaseQuantity: 4 } }), /catalog_onboarding_contract_invalid/);
});

test("onboarding options are exact active display projections and deeply frozen", () => {
  const parsed = parseCatalogOnboardingOptions({
    categories: [{ id: CATEGORY_ID, name: "Kupalar", slug: "kupalar", position: 0 }],
    resources: [{ id: RESOURCE_ID, kind: "brand", name: "Celebix" }],
    locations: [{ id: LOCATION_ID, name: "Ana depo", isDefault: true }],
    channels: [{ id: CHANNEL_ID, kind: "storefront", name: "Online mağaza" }],
  });
  assert.equal(parsed.categories[0]?.name, "Kupalar");
  assert.ok(Object.isFrozen(parsed.categories));
  assert.ok(Object.isFrozen(parsed.categories[0]));
  assert.ok(Object.isFrozen(parsed.resources));
  assert.throws(() => parseCatalogOnboardingOptions({ ...parsed, databaseUrl: "postgres://private" }), /catalog_onboarding_contract_invalid/);
});

test("editor and mutation result preserve exact persisted product authority", () => {
  const editor = parseCatalogProductEditorProjection({
    product: product(),
    variants: [{
      variant: variant(),
      continueSellingWhenOutOfStock: false,
      inventory: [{ locationId: LOCATION_ID, quantity: 0 }],
    }],
    profile: profile(),
    categoryIds: [CATEGORY_ID],
    resourceIds: resources(),
    channelIds: [CHANNEL_ID],
    mediaCount: 0,
  });
  const result = parseCatalogOnboardingResult({
    product: product("active"),
    variants: [variant()],
    profile: profile(),
    categoryIds: [CATEGORY_ID],
    resourceIds: resources(),
    channelIds: [CHANNEL_ID],
    mediaCount: 0,
    replayed: false,
  });
  assert.equal(editor.product.id, PRODUCT_ID);
  assert.equal(result.product.status, "active");
  assert.ok(Object.isFrozen(editor.variants[0]?.inventory));
  assert.ok(Object.isFrozen(result));
  assert.throws(() => parseCatalogOnboardingResult({ ...result, sql: "SELECT secret" }), /catalog_onboarding_contract_invalid/);
});
