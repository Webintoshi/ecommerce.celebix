import assert from "node:assert/strict";
import test from "node:test";

import { assignVariantSkus, composeVariantSku, deriveProductBaseSku } from "./attribute-variants.ts";

test("color precedes size and Turkish labels become canonical ASCII SKU suffixes", () => {
  assert.equal(composeVariantSku("SRA-1341", { beden: "M", renk: "Kırmızı" }), "SRA-1341-KIRMIZI");
  assert.equal(composeVariantSku("SRA-1341", { renk: "Kırmızı", beden: "S" }), "SRA-1341-KIRMIZI");
  assert.equal(composeVariantSku("SRA-1341", { "Ürün Rengi": "Çığ ÖŞü İı", size: "XL" }), "SRA-1341-CIG-OSU-II");
  assert.equal(composeVariantSku("SRA-1341", { color: "Ac\u0327ık  mavi" }), "SRA-1341-ACIK-MAVI");
});

test("exact color aliases are recognized without treating unrelated attributes as colors", () => {
  for (const key of ["renk", "rengi", "urun-rengi", "renk-secenegi", "color", "colour"]) {
    assert.equal(composeVariantSku("SRA-1", { [key]: "Siyah", numara: "42" }), "SRA-1-SIYAH");
  }
  for (const key of ["beden", "size", "numara"]) assert.equal(composeVariantSku("SRA-1", { [key]: "XL" }), "SRA-1-XL");
  assert.equal(composeVariantSku("SRA-1", { "renk-kodu": "Siyah", size: "L" }), "SRA-1-L");
});

test("missing base stays blank and an unrelated attribute retains the base SKU", () => {
  assert.equal(composeVariantSku("", { renk: "Kırmızı" }), "");
  assert.equal(composeVariantSku("SRA-1341", { malzeme: "Pamuk" }), "SRA-1341");
  assert.equal(composeVariantSku("SRA-1341", {}), "SRA-1341");
});

test("invalid or overlong SKU composition is rejected without truncation", () => {
  assert.throws(() => composeVariantSku("INVALID BASE", { renk: "Mavi" }), TypeError);
  assert.throws(() => composeVariantSku("SRA-1", { renk: "💙" }), TypeError);
  assert.equal(composeVariantSku("A".repeat(59), { size: "XXXX" }).length, 64);
  assert.throws(() => composeVariantSku("A".repeat(60), { size: "XXXX" }), TypeError);
});

test("assignment fills blank rows while preserving manual codes and every other field", () => {
  const mediaIds = ["media-1"];
  const blank = { sku: "", attributes: { renk: "Kırmızı", beden: "S" }, price: "99,00", stockQuantity: "3", mediaIds };
  const manual = { ...blank, sku: "MANUAL-42", attributes: { renk: "Mavi", beden: "M" } };
  const result = assignVariantSkus("SRA-1341", [blank, manual]);
  assert.deepEqual(result[0], { ...blank, sku: "SRA-1341-KIRMIZI" });
  assert.equal(result[0]?.mediaIds, mediaIds);
  assert.equal(result[1], manual);
  assert.equal(blank.sku, "");
});

test("a changed base updates only codes matching the previous automatic value", () => {
  const rows: readonly { sku: string; attributes: Readonly<Record<string, string>> }[] = [
    { sku: "SRA-1-KIRMIZI", attributes: { renk: "Kırmızı", beden: "S" } },
    { sku: "MANUAL-42", attributes: { renk: "Mavi" } },
    { sku: "", attributes: { beden: "XL" } },
  ];
  assert.deepEqual(assignVariantSkus("SRA-2", rows, "SRA-1").map(({ sku }) => sku), ["SRA-2-KIRMIZI", "MANUAL-42", "SRA-2-XL"]);
  assert.equal(assignVariantSkus("SRA-2", rows)[0], rows[0]);
});

test("clearing the product base clears its automatic codes while preserving manual codes", () => {
  assert.deepEqual(assignVariantSkus("", [
    { sku: "SRA-1-KIRMIZI", attributes: { renk: "Kırmızı" } },
    { sku: "MANUAL-42", attributes: { renk: "Mavi" } },
  ], "SRA-1").map(({ sku }) => sku), ["", "MANUAL-42"]);
});

test("base derivation prefers an unsuffixed standard row over earlier variant SKUs", () => {
  assert.equal(deriveProductBaseSku([
    { sku: "SRA-1-KIRMIZI", attributes: { renk: "Kırmızı", beden: "S" } },
    { sku: "SRA-1341", attributes: {} },
  ]), "SRA-1341");
});

test("base derivation removes only the exact suffix belonging to that variant", () => {
  assert.equal(deriveProductBaseSku([{ sku: "SRA-1341-KIRMIZI", attributes: { renk: "Kırmızı", beden: "M" } }]), "SRA-1341");
  assert.equal(deriveProductBaseSku([{ sku: "SRA-1341-XL", attributes: { size: "XL" } }]), "SRA-1341");
  assert.equal(deriveProductBaseSku([{ sku: "SRA-1341-MAVI", attributes: { renk: "Kırmızı" } }]), "SRA-1341-MAVI");
  assert.equal(deriveProductBaseSku([{ sku: "SRA-1-KIRMIZI-M", attributes: { renk: "Kırmızı", beden: "M" } }]), "SRA-1-KIRMIZI-M");
  assert.equal(deriveProductBaseSku([{ sku: "SRA-KIRMIZI-KIRMIZI", attributes: { renk: "Kırmızı" } }]), "SRA-KIRMIZI");
  assert.equal(deriveProductBaseSku([{ attributes: { renk: "Kırmızı" } }]), "");
  assert.equal(deriveProductBaseSku([]), "");
});
