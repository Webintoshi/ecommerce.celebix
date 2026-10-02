import assert from "node:assert/strict";
import test from "node:test";
import { catalogMigrationProducts } from "./validation.ts";

const variant = { title: "A", sku: "KLY-517-A", barcode: "6520052581127", priceCents: 1014000, stockQuantity: 1, attributes: { Harf: "A" }, measurements: { weight: { valueMilli: 2120, unit: "g" } } };
const sourceMetadata = { provider: "qukasoft", rawXml: "<product><quantity></quantity></product>", fields: { id: "6817", quantity: "", currency: "TRY" }, attributes: [], variants: [{ value1: "İ", quantity: "", barcode: "" }], weightCandidates: ["2.12"], issues: [{ code: "incomplete_variant", sourceVariantIndex: 8 }] };
const product = { sourceProductId: "6817", title: "Harf kolye", slug: "harf-kolye", status: "active", categorySlugs: [], brandSlugs: [], variant, additionalVariants: [{ ...variant, title: "B", sku: "KLY-517-B", barcode: "6520052211673" }], sourceImageDigests: [], sourceMetadata };

test("migration preserves complete child variants, exact gram metadata and unresolved source rows", () => {
  const parsed = catalogMigrationProducts([product])[0]!;
  assert.deepEqual(parsed.variant.measurements, { weight: { valueMilli: 2120, unit: "g" } });
  assert.equal(parsed.additionalVariants?.[0]?.sku, "KLY-517-B");
  assert.deepEqual(parsed.sourceMetadata, sourceMetadata);
});

test("migration rejects invalid measurements and oversized or unknown source metadata", () => {
  for (const candidate of [
    { ...product, variant: { ...variant, measurements: { weight: { valueMilli: 0, unit: "g" } } } },
    { ...product, variant: { ...variant, attributes: { "KDV oranı": "0.18" } } },
    { ...product, sourceMetadata: { ...sourceMetadata, provider: "unknown" } },
    { ...product, sourceMetadata: { ...sourceMetadata, fields: { ...sourceMetadata.fields, id: "999999" } } },
    { ...product, sourceMetadata: { ...sourceMetadata, rawXml: "x".repeat(70000) } },
    { ...product, additionalVariants: Array.from({ length: 50 }, () => variant) },
  ]) assert.throws(() => catalogMigrationProducts([candidate]), /invalid_input/);
});

test("migration rejects duplicate child barcodes and SKU ownership across products", () => {
  assert.throws(() => catalogMigrationProducts([{ ...product, additionalVariants: [variant] }]), /invalid_input/);
  assert.throws(() => catalogMigrationProducts([product, { ...product, sourceProductId: "6818", slug: "ikinci-kolye" }]), /invalid_input/);
});
