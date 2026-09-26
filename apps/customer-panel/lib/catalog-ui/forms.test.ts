import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCreateProductPayload,
  buildProductUpdatePayload,
  buildVariantCreatePayload,
  buildVariantBatchPayload,
  buildVariantUpdatePayload,
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

test("batch variant form keeps checked combinations and per-row price and stock", () => {
  const rows = [
    { ...VALID_VARIANT, title: "Siyah / M", sku: "", price: "199,00", compareAt: "", stockQuantity: "5", attributes: { renk: "Siyah", beden: "M" } },
    { ...VALID_VARIANT, title: "Beyaz / S", sku: "BEYAZ-S", price: "249,00", compareAt: "", stockQuantity: "2", attributes: { renk: "Beyaz", beden: "S" } },
  ];
  const result = buildVariantBatchPayload(rows);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.variants.map(({ priceCents, stockQuantity, sku, attributes }) => ({ priceCents, stockQuantity, sku, attributes })), [
    { priceCents: 19900, stockQuantity: 5, sku: undefined, attributes: { renk: "Siyah", beden: "M" } },
    { priceCents: 24900, stockQuantity: 2, sku: "BEYAZ-S", attributes: { renk: "Beyaz", beden: "S" } },
  ]);
  assert.equal(buildVariantBatchPayload([...rows, rows[0]!]).ok, false);
});

test("batch variants of one product may share a SKU", () => {
  const rows = [
    { ...VALID_VARIANT, title: "Beyaz", sku: "RSA-001", attributes: { renk: "Beyaz" } },
    { ...VALID_VARIANT, title: "Siyah", sku: "RSA-001", attributes: { renk: "Siyah" } },
  ];
  const result = buildVariantBatchPayload(rows);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.variants.map(({ sku }) => sku), ["RSA-001", "RSA-001"]);
});

test("batch forms project neutral shared draft fields and preserve optional measurements without dropping unsupported data", () => {
  const row = { ...VALID_VARIANT, attributes: { Renk: "Beyaz" }, continueSellingWhenOutOfStock: false, shippingDesi: "", hsCode: "", measurements: { weight: "14,89" } };
  const result = buildVariantBatchPayload([row]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.variants[0]?.measurements, { weight: { valueMilli: 14890, unit: "g" } });
    assert.equal(Object.hasOwn(result.value.variants[0]!, "continueSellingWhenOutOfStock"), false);
  }
  assert.equal(buildVariantBatchPayload([{ ...row, continueSellingWhenOutOfStock: true }]).ok, false);
  assert.equal(buildVariantBatchPayload([{ ...row, shippingDesi: "1" }]).ok, false);
  assert.equal(buildVariantBatchPayload([{ ...row, storeId: "unexpected" } as never]).ok, false);
});

const VALID_VARIANT = Object.freeze({
  title: VALID.variantTitle,
  sku: VALID.sku,
  barcode: VALID.barcode,
  price: VALID.price,
  compareAt: VALID.compareAt,
  cost: VALID.cost,
  stockTracking: VALID.stockTracking,
  stockQuantity: VALID.stockQuantity,
});

function buildExistingVariantUpdate(
  overrides: Readonly<Record<string, unknown>>,
  existingAttributes: Readonly<Record<string, string>>,
) {
  return buildVariantUpdatePayload(
    { ...VALID_VARIANT, ...overrides },
    4,
    existingAttributes,
  );
}

test("variant measurements create optionally, update atomically, preserve omitted callers and clear explicitly", () => {
  const draft = { weight: "14,89", weightUnit: "g", depth: "2.125", packageCount: "6" };
  const measurements = { weight: { valueMilli: 14890, unit: "g" }, depth: { valueMilli: 2125, unit: "cm" }, packageCount: 6 };
  const created = buildVariantCreatePayload({ ...VALID_VARIANT, measurements: draft });
  assert.equal(created.ok, true);
  if (created.ok) assert.deepEqual(created.value.variant.measurements, measurements);
  const updated = buildExistingVariantUpdate({ measurements: draft }, { Renk: "Beyaz" });
  assert.equal(updated.ok, true);
  if (updated.ok) {
    assert.deepEqual(updated.value.variant.measurements, measurements);
    assert.deepEqual(updated.value.variant.attributes, { Renk: "Beyaz" });
    assert.equal(updated.value.expectedVersion, 4);
    assert.equal(updated.value.variant.stockQuantity, 12);
    assert.equal(updated.value.variant.priceCents, 12550);
  }
  const omitted = buildExistingVariantUpdate({}, {});
  assert.equal(omitted.ok, true);
  if (omitted.ok) assert.equal(Object.hasOwn(omitted.value.variant, "measurements"), false);
  const cleared = buildExistingVariantUpdate({ measurements: { weight: "", packageCount: "" } }, {});
  assert.equal(cleared.ok, true);
  if (cleared.ok) assert.equal(cleared.value.variant.measurements, null);
  const blankCreated = buildVariantCreatePayload({ ...VALID_VARIANT, measurements: {} });
  assert.equal(blankCreated.ok, true);
  if (blankCreated.ok) assert.equal(Object.hasOwn(blankCreated.value.variant, "measurements"), false);
  assert.equal(buildExistingVariantUpdate({ measurements: { weight: "14,8912" } }, {}).ok, false);
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

  const variant = buildVariantUpdatePayload({
    title: VALID.variantTitle,
    sku: VALID.sku,
    barcode: VALID.barcode,
    price: VALID.price,
    compareAt: VALID.compareAt,
    cost: VALID.cost,
    stockTracking: VALID.stockTracking,
    stockQuantity: VALID.stockQuantity,
  }, 4, {});
  assert.equal(variant.ok, true);
  if (variant.ok) assert.equal(variant.value.expectedVersion, 4);
});

test("basic price edit preserves every existing variant attribute and key order", () => {
  const existingAttributes = { Renk: "Altın", Boyut: "18" };
  const result = buildExistingVariantUpdate({ price: "130,00" }, existingAttributes);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.variant.priceCents, 13_000);
  assert.deepEqual(result.value.variant.attributes, existingAttributes);
  assert.deepEqual(Object.keys(result.value.variant.attributes), ["Renk", "Boyut"]);
});

test("basic SKU and stock edit preserves existing variant attributes", () => {
  const existingAttributes = { Renk: "Altın", Boyut: "18" };
  const result = buildExistingVariantUpdate({ sku: "ATLAS-KUPA-2", stockQuantity: "7" }, existingAttributes);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.variant.sku, "ATLAS-KUPA-2");
  assert.equal(result.value.variant.stockQuantity, 7);
  assert.deepEqual(result.value.variant.attributes, existingAttributes);
});

test("basic edit preserves an existing empty attribute map", () => {
  const result = buildExistingVariantUpdate({ price: "130,00" }, {});

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.variant.attributes, {});
});

test("variant creation still emits a valid empty frozen attribute map", () => {
  const result = buildVariantCreatePayload(VALID_VARIANT);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.variant.attributes, {});
  assert.equal(Object.isFrozen(result.value.variant.attributes), true);
});

test("variant update does not mutate attribute input and freezes its result", () => {
  const existingAttributes = { Renk: "Altın", Boyut: "18" };
  const snapshot = { ...existingAttributes };
  const result = buildExistingVariantUpdate({ price: "130,00" }, existingAttributes);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(existingAttributes, snapshot);
  assert.notEqual(result.value.variant.attributes, existingAttributes);
  assert.equal(Object.isFrozen(result.value), true);
  assert.equal(Object.isFrozen(result.value.variant), true);
  assert.equal(Object.isFrozen(result.value.variant.attributes), true);
});
