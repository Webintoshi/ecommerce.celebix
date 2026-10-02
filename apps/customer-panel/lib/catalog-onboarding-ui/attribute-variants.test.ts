import assert from "node:assert/strict";
import test from "node:test";

import { attributeChoices, mergeSelectedVariants, reconcileVariantRows, updateSharedVariantDefault, variantAttributeKey } from "./attribute-variants.ts";

const resources = [
  { id: "10000000-0000-4000-8000-000000000001", kind: "attribute", name: "Renk", slug: "renk", config: { values: ["Siyah", "Beyaz"] }, status: "active", productIds: [], productCount: 0, version: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "10000000-0000-4000-8000-000000000002", kind: "attribute", name: "Beden", slug: "beden", config: { values: ["S", "M"] }, status: "active", productIds: [], productCount: 0, version: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "10000000-0000-4000-8000-000000000003", kind: "attribute", name: "Eski", slug: "eski", config: { values: ["X"] }, status: "archived", productIds: [], productCount: 0, version: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
] as const;

test("only active catalog attributes expose their saved values", () => {
  assert.deepEqual(attributeChoices(resources).map(({ name, key, values }) => ({ name, key, values })), [
    { name: "Renk", key: "renk", values: ["Siyah", "Beyaz"] },
    { name: "Beden", key: "beden", values: ["S", "M"] },
  ]);
});

test("a malformed active attribute does not hide the other saved choices", () => {
  const malformed = { ...resources[0]!, config: { values: ["Siyah", "siyah"] } };
  assert.deepEqual(attributeChoices([malformed, resources[1]!]).map(({ key }) => key), ["beden"]);
});

test("an explicit native key keeps its friendly label and imported variant identity", () => {
  const native = { ...resources[0], name: "Yüzük Ölçüsü", slug: "yuzuk-olcusu", config: { key: "yuzuk_olcusu", values: ["12", "14"] } };
  const choices = attributeChoices([native]);
  assert.deepEqual(choices.map(({ name, key, values }) => ({ name, key, values })), [
    { name: "Yüzük Ölçüsü", key: "yuzuk_olcusu", values: ["12", "14"] },
  ]);
  const options = choices.map((choice) => ({ name: choice.key, values: choice.values }));
  const result = mergeSelectedVariants({ options, selectedKeys: [variantAttributeKey({ yuzuk_olcusu: "12" })], current: [], existing: [], defaultPrice: "100,00", defaultStock: "1" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value[0]?.attributes, { yuzuk_olcusu: "12" });
    assert.deepEqual(reconcileVariantRows(options, result.value).kept, result.value);
  }
});

test("an invalid explicit native key is not replaced by its URL slug", () => {
  for (const key of ["", " key", "ölçü", "a".repeat(65), null, { name: "key" }]) {
    const malformed = { ...resources[0], config: { key, values: ["Siyah"] } };
    assert.deepEqual(attributeChoices([malformed, resources[1]]).map(({ key }) => key), ["beden"]);
  }
});

test("only checked combinations become variants with common defaults", () => {
  const rows = mergeSelectedVariants({
    options: [{ name: "renk", values: ["Siyah", "Beyaz"] }, { name: "beden", values: ["S", "M"] }],
    selectedKeys: [variantAttributeKey({ renk: "Siyah", beden: "M" }), variantAttributeKey({ renk: "Beyaz", beden: "S" })],
    current: [], existing: [], defaultPrice: "199,00", defaultStock: "5",
  });
  assert.equal(rows.ok, true);
  if (!rows.ok) return;
  assert.deepEqual(rows.value.map(({ title, attributes, price, stockQuantity }) => ({ title, attributes, price, stockQuantity })), [
    { title: "Siyah / M", attributes: { renk: "Siyah", beden: "M" }, price: "199,00", stockQuantity: "5" },
    { title: "Beyaz / S", attributes: { renk: "Beyaz", beden: "S" }, price: "199,00", stockQuantity: "5" },
  ]);
});

test("reselecting a combination preserves its edited price, stock and SKU", () => {
  const key = variantAttributeKey({ renk: "Siyah" });
  const first = mergeSelectedVariants({ options: [{ name: "renk", values: ["Siyah"] }], selectedKeys: [key], current: [], existing: [], defaultPrice: "100,00", defaultStock: "1" });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const second = mergeSelectedVariants({ options: [{ name: "renk", values: ["Siyah"] }], selectedKeys: [key], current: [{ ...first.value[0]!, price: "150,00", stockQuantity: "3", sku: "SIYAH-1" }], existing: [], defaultPrice: "100,00", defaultStock: "1" });
  assert.equal(second.ok, true);
  if (second.ok) assert.deepEqual([second.value[0]?.price, second.value[0]?.stockQuantity, second.value[0]?.sku], ["150,00", "3", "SIYAH-1"]);
});

test("an existing combination is rejected instead of duplicated", () => {
  const key = variantAttributeKey({ renk: "Siyah" });
  const result = mergeSelectedVariants({ options: [{ name: "renk", values: ["Siyah"] }], selectedKeys: [key], current: [], existing: [{ renk: "Siyah" }], defaultPrice: "100,00", defaultStock: "1" });
  assert.deepEqual(result, { ok: false, error: "Bu varyant kombinasyonu üründe zaten var." });
});

test("changing the common starting price updates untouched rows but preserves per-row edits", () => {
  const first = mergeSelectedVariants({ options: [{ name: "renk", values: ["Siyah", "Beyaz"] }], selectedKeys: [variantAttributeKey({ renk: "Siyah" }), variantAttributeKey({ renk: "Beyaz" })], current: [], existing: [], defaultPrice: "", defaultStock: "0" });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const rows = [{ ...first.value[0]!, price: "155,00" }, first.value[1]!];
  assert.deepEqual(updateSharedVariantDefault(rows, "price", "", "199,00").map(({ price }) => price), ["155,00", "199,00"]);
});

test("adding a value retains checked combinations and their row edits", () => {
  const edited = { title: "Siyah / M", sku: "RSA-1", barcode: "", price: "150,00", compareAt: "", cost: "", stockQuantity: "3", continueSellingWhenOutOfStock: false, shippingDesi: "", hsCode: "", attributes: { renk: "Siyah", beden: "M" } };
  const result = reconcileVariantRows([{ name: "renk", values: ["Siyah", "Beyaz"] }, { name: "beden", values: ["M", "L"] }], [edited]);
  assert.deepEqual(result.kept, [edited]);
  assert.deepEqual(result.removed, []);
});

test("removing a selected value reports only affected variant rows", () => {
  const black = { title: "Siyah", sku: "RSA-1", barcode: "", price: "150,00", compareAt: "", cost: "", stockQuantity: "3", continueSellingWhenOutOfStock: false, shippingDesi: "", hsCode: "", attributes: { renk: "Siyah" } };
  const white = { ...black, title: "Beyaz", attributes: { renk: "Beyaz" } };
  const result = reconcileVariantRows([{ name: "renk", values: ["Siyah"] }], [black, white]);
  assert.deepEqual(result.kept, [black]);
  assert.deepEqual(result.removed, [white]);
});

test("new selected rows receive color-only SKUs from the product base", () => {
  const result = mergeSelectedVariants({
    options: [{ name: "renk", values: ["Kırmızı"] }, { name: "beden", values: ["S", "M"] }],
    selectedKeys: [variantAttributeKey({ renk: "Kırmızı", beden: "S" }), variantAttributeKey({ renk: "Kırmızı", beden: "M" })],
    current: [], existing: [], defaultPrice: "199,00", defaultStock: "5", baseSku: "SRA-1341",
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.map(({ sku }) => sku), ["SRA-1341-KIRMIZI", "SRA-1341-KIRMIZI"]);
});

test("reselection with a product base preserves existing manual and blank row SKUs", () => {
  const first = mergeSelectedVariants({ options: [{ name: "renk", values: ["Siyah", "Beyaz"] }], selectedKeys: [variantAttributeKey({ renk: "Siyah" }), variantAttributeKey({ renk: "Beyaz" })], current: [], existing: [], defaultPrice: "100,00", defaultStock: "1" });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const rows = [{ ...first.value[0]!, sku: "MANUAL-42" }, first.value[1]!];
  const result = mergeSelectedVariants({ options: [{ name: "renk", values: ["Siyah", "Beyaz"] }], selectedKeys: [variantAttributeKey({ renk: "Siyah" }), variantAttributeKey({ renk: "Beyaz" })], current: rows, existing: [], defaultPrice: "100,00", defaultStock: "1", baseSku: "SRA-1341" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value[0], rows[0]);
    assert.equal(result.value[1], rows[1]);
  }
});

test("an overlong automatic SKU returns a selection error", () => {
  const result = mergeSelectedVariants({ options: [{ name: "renk", values: ["Kırmızı"] }], selectedKeys: [variantAttributeKey({ renk: "Kırmızı" })], current: [], existing: [], defaultPrice: "100,00", defaultStock: "1", baseSku: "A".repeat(60) });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.error.length > 0);
});
