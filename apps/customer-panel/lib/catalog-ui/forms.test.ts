import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCreateProductPayload,
  buildProductUpdatePayload,
  buildVariantPayload,
} from "./forms.ts";

const VALID = Object.freeze({
  title: "Atlas Kupa",
  slug: "atlas-kupa",
  description: "Dayanıklı seramik kupa",
  status: "draft",
  currency: "TRY",
  variantTitle: "Standart",
  sku: "ATLAS-KUPA-1",
  barcode: "8690000000001",
  price: "125,50",
  compareAt: "150,00",
  cost: "70,25",
  stockTracking: true,
  stockQuantity: "12",
});

test("create payload matches the exact catalog contract and never contains store authority", () => {
  const result = buildCreateProductPayload(VALID);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    product: {
      slug: "atlas-kupa",
      title: "Atlas Kupa",
      description: "Dayanıklı seramik kupa",
      status: "draft",
      currency: "TRY",
    },
    initialVariant: {
      title: "Standart",
      sku: "ATLAS-KUPA-1",
      barcode: "8690000000001",
      priceCents: 12_550,
      compareAtCents: 15_000,
      costCents: 7_025,
      stockTracking: true,
      stockQuantity: 12,
      attributes: {},
    },
  });
  assert.equal(JSON.stringify(result.value).includes("storeId"), false);
});

test("blank optional values are omitted from the API payload", () => {
  const result = buildCreateProductPayload({
    ...VALID,
    description: "",
    sku: "",
    barcode: "",
    compareAt: "",
    cost: "",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(Object.hasOwn(result.value.product, "description"), false);
  assert.equal(Object.hasOwn(result.value.initialVariant, "sku"), false);
  assert.equal(Object.hasOwn(result.value.initialVariant, "barcode"), false);
  assert.equal(Object.hasOwn(result.value.initialVariant, "compareAtCents"), false);
  assert.equal(Object.hasOwn(result.value.initialVariant, "costCents"), false);
});

test("unknown and invalid fields fail client-side", () => {
  const cases = [
    { ...VALID, storeId: "browser-store" },
    { ...VALID, title: "" },
    { ...VALID, slug: "Atlas Kupa" },
    { ...VALID, status: "archived" },
    { ...VALID, currency: "USD" },
    { ...VALID, price: "12,501" },
    { ...VALID, compareAt: "100,00" },
    { ...VALID, stockQuantity: "1.5" },
    { ...VALID, sku: "lower-case" },
  ];
  for (const candidate of cases) {
    assert.equal(buildCreateProductPayload(candidate).ok, false, JSON.stringify(candidate));
  }
});

test("update payloads use the exact currently rendered version", () => {
  const product = buildProductUpdatePayload({
    title: VALID.title,
    slug: VALID.slug,
    description: VALID.description,
    status: "active",
    currency: "TRY",
  }, 7);
  assert.deepEqual(product, {
    ok: true,
    value: {
      expectedVersion: 7,
      product: {
        slug: "atlas-kupa",
        title: "Atlas Kupa",
        description: "Dayanıklı seramik kupa",
        status: "active",
        currency: "TRY",
      },
    },
  });

  const variant = buildVariantPayload({
    title: VALID.variantTitle,
    sku: VALID.sku,
    barcode: VALID.barcode,
    price: VALID.price,
    compareAt: VALID.compareAt,
    cost: VALID.cost,
    stockTracking: VALID.stockTracking,
    stockQuantity: VALID.stockQuantity,
  }, 4);
  assert.equal(variant.ok, true);
  if (variant.ok) assert.equal(variant.value.expectedVersion, 4);
});
