import assert from "node:assert/strict";
import test from "node:test";

import { attributeChoices, mergeSelectedVariants, updateSharedVariantDefault, variantAttributeKey } from "./attribute-variants.ts";

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
