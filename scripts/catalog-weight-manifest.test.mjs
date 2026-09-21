import assert from "node:assert/strict";
import test from "node:test";

import { buildCatalogWeightManifest } from "./catalog-weight-manifest.mjs";

const STORE_ID = "a828862c-4cc1-475a-89cc-5fbee31eb43f";
const VARIANT_ID = "10000000-0000-4000-8000-000000000001";
const AUDIT_PRINCIPAL_ID = "90000000-0000-4000-8000-000000000001";

function product(overrides = {}) {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    title: "Anonim ürün",
    status: "active",
    version: 2,
    description: "Ağırlık: 3,25 gr",
    variants: [{ id: VARIANT_ID, title: "Varsayılan", sku: "SAFE-1", version: 4 }],
    existingDeclaration: null,
    pricingPolicy: null,
    ...overrides,
  };
}

test("manifest writes only clear single empty targets and preserves all non-weight facts", () => {
  const manifest = buildCatalogWeightManifest({
    storeId: STORE_ID,
    tenantSlug: "guzide-kuyumcu-4",
    sourceHead: "a".repeat(40),
    generatedAt: "2026-09-21T09:00:00.000Z",
    operationId: "30000000-0000-4000-8000-000000000001",
    auditPrincipalId: AUDIT_PRINCIPAL_ID,
    products: [
      product(),
      product({ id: "20000000-0000-4000-8000-000000000002", description: "Ürün 2,92 gramdır. Ağırlıkta %10 sapma olabilir." }),
      product({ id: "20000000-0000-4000-8000-000000000003", description: "Ağırlık 2,1 gram. Net ağırlık 2,4 gram." }),
      product({ id: "20000000-0000-4000-8000-000000000004", description: "14 ayar / 0,25 ct / 18 cm" }),
      product({ id: "20000000-0000-4000-8000-000000000005", existingDeclaration: { id: "40000000-0000-4000-8000-000000000001", version: 2 } }),
      product({ id: "20000000-0000-4000-8000-000000000006", variants: [
        { id: VARIANT_ID, title: "S", sku: "SAFE-S", version: 1 },
        { id: "10000000-0000-4000-8000-000000000002", title: "M", sku: "SAFE-M", version: 1 },
      ] }),
    ],
  });
  assert.deepEqual(manifest.counts, { products: 6, variants: 7, group1: 1, group2: 1, group3: 1, group4: 1, group5: 1, group6: 1, eligibleWrites: 1 });
  assert.equal(manifest.entries[0].action, "import_declared_weight");
  assert.equal(manifest.entries[0].target.variantId, VARIANT_ID);
  assert.equal(manifest.entries[0].pricingVerified, false);
  assert.deepEqual(manifest.protectedChanges, { price: 0, stock: 0, pricingPolicy: 0, activationGate: 0 });
  assert.equal(manifest.entries.some((entry) => "priceCents" in entry || "stockQuantity" in entry || "metalGrams" in entry), false);
});

test("manifest is deterministic, store-bound, and treats an existing pricing gram as protected review", () => {
  const input = {
    storeId: STORE_ID,
    tenantSlug: "guzide-kuyumcu-4",
    sourceHead: "b".repeat(40),
    generatedAt: "2026-09-21T09:00:00.000Z",
    operationId: "30000000-0000-4000-8000-000000000001",
    auditPrincipalId: AUDIT_PRINCIPAL_ID,
    products: [product({ pricingPolicy: { method: "gold_gram", metalGrams: "3.25", version: 2 } })],
  };
  const first = buildCatalogWeightManifest(input);
  const second = buildCatalogWeightManifest(input);
  assert.deepEqual(first, second);
  assert.equal(first.entries[0].group, 5);
  assert.equal(first.entries[0].skipReason, "pricing_weight_preserved");
  assert.equal(first.storeId, STORE_ID);
  assert.throws(() => buildCatalogWeightManifest({ ...input, storeId: "wrong" }));
});
