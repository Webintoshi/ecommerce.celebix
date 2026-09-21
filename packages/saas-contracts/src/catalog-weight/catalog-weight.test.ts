import assert from "node:assert/strict";
import test from "node:test";

import {
  extractCatalogWeightDeclaration,
  parseCatalogWeightEditorProjection,
  parseCatalogWeightSaveIntent,
} from "./index.ts";
import { parsePublicProduct } from "../storefront/index.ts";

test("extracts an exact unlabeled product weight without claiming net metal", () => {
  assert.deepEqual(extractCatalogWeightDeclaration("<p>Ağırlık: 3,25 gr</p>"), {
    kind: "single",
    gramsMilli: 3_250,
    scope: "unspecified",
    salesUnit: "unspecified",
    approximate: false,
    toleranceBasisPoints: null,
    sourceExcerpt: "Ağırlık: 3,25 gr",
  });
});

test("extracts explicit net gold weight but never emits pricing policy data", () => {
  const result = extractCatalogWeightDeclaration("Net altın ağırlığı: 3.25 g");
  assert.deepEqual(result, {
    kind: "single",
    gramsMilli: 3_250,
    scope: "net_metal",
    salesUnit: "unspecified",
    approximate: false,
    toleranceBasisPoints: null,
    sourceExcerpt: "Net altın ağırlığı: 3.25 g",
  });
  assert.equal(Object.hasOwn(result, "metalGrams"), false);
  assert.equal(Object.hasOwn(result, "pricingMethod"), false);
});

test("preserves a real Güzide production tolerance as approximate", () => {
  const result = extractCatalogWeightDeclaration(`
    <ul><li>Ürün %100 gerçek 14 ayar altın ve 2.92 gramdır.</li></ul>
    <script>throw new Error("must not execute")</script>
    <p>Belirtilen ağırlıkta üretimden kaynaklı (+/-) %10 sapma oluşabilmektedir.</p>
  `);
  assert.deepEqual(result, {
    kind: "single",
    gramsMilli: 2_920,
    scope: "unspecified",
    salesUnit: "unspecified",
    approximate: true,
    toleranceBasisPoints: 1_000,
    sourceExcerpt: "Ürün %100 gerçek 14 ayar altın ve 2.92 gramdır.",
  });
});

test("keeps explicit pair and set scope without dividing or spreading values", () => {
  assert.deepEqual(extractCatalogWeightDeclaration("Çift ağırlığı: 4 gram"), {
    kind: "single",
    gramsMilli: 4_000,
    scope: "total_product",
    salesUnit: "pair",
    approximate: false,
    toleranceBasisPoints: null,
    sourceExcerpt: "Çift ağırlığı: 4 gram",
  });
  assert.deepEqual(extractCatalogWeightDeclaration("Set ağırlığı: 12 gram"), {
    kind: "single",
    gramsMilli: 12_000,
    scope: "total_product",
    salesUnit: "set",
    approximate: false,
    toleranceBasisPoints: null,
    sourceExcerpt: "Set ağırlığı: 12 gram",
  });
});

test("returns review-only ranges and rejects shipping, carat, length, and ambiguous separators", () => {
  assert.deepEqual(extractCatalogWeightDeclaration("3,10–3,40 gr"), {
    kind: "range",
    minimumGramsMilli: 3_100,
    maximumGramsMilli: 3_400,
    scope: "unspecified",
    salesUnit: "unspecified",
    sourceExcerpt: "3,10–3,40 gr",
  });
  assert.deepEqual(extractCatalogWeightDeclaration("Kargo ağırlığı: 200 g"), { kind: "none", reason: "shipping_weight" });
  assert.deepEqual(extractCatalogWeightDeclaration("14 ayar / 0,25 ct / 18 cm"), { kind: "none", reason: "not_found" });
  assert.deepEqual(extractCatalogWeightDeclaration("Ağırlık: 1.250 gram"), { kind: "none", reason: "ambiguous_decimal" });
});

test("marks multiple different declarations as conflicting and deduplicates identical repeats", () => {
  assert.deepEqual(extractCatalogWeightDeclaration("Ağırlık 2,10 gram. Net ağırlık 2,40 gram."), {
    kind: "conflict",
    reason: "multiple_values",
    valuesGramsMilli: [2_100, 2_400],
  });
  assert.equal(extractCatalogWeightDeclaration("Ağırlık 2,10 gram. 14K ALTIN 2,10 Gram").kind, "single");
});

test("treats imported literal newline markers as boundaries instead of joining unrelated watch fields", () => {
  assert.deepEqual(extractCatalogWeightDeclaration(
    "Ağırlık: 100 Gr \\n Kordon Genişliği: 20 mm \\n 12/24 Göstergesi: Yok",
  ), {
    kind: "single",
    gramsMilli: 100_000,
    scope: "unspecified",
    salesUnit: "unspecified",
    approximate: false,
    toleranceBasisPoints: null,
    sourceExcerpt: "Ağırlık: 100 Gr",
  });
});

test("decodes common Turkish HTML entities before unit matching", () => {
  assert.deepEqual(extractCatalogWeightDeclaration(
    "&Uuml;r&uuml;n 2.30 gramdır. Sipariş s&uuml;resi 7 g&uuml;nd&uuml;r.",
  ), {
    kind: "single",
    gramsMilli: 2_300,
    scope: "unspecified",
    salesUnit: "unspecified",
    approximate: false,
    toleranceBasisPoints: null,
    sourceExcerpt: "2.30 gramdır",
  });
});

test("strict editor projection keeps capability and admin audit data private to this contract", () => {
  const projection = parseCatalogWeightEditorProjection({
    profileMode: "jewelry",
    productVersion: 3,
    declarations: [{
      id: "10000000-0000-4000-8000-000000000001",
      productId: "20000000-0000-4000-8000-000000000001",
      variantId: null,
      gramsMilli: 3_250,
      scope: "unspecified",
      salesUnit: "pair",
      approximate: true,
      toleranceBasisPoints: 1_000,
      source: "description",
      sourceExcerpt: "Ağırlık: 3,25 gr",
      sourceDigest: "a".repeat(64),
      sourceProductVersion: 3,
      pricingVerified: false,
      version: 1,
      updatedAt: "2026-09-21T08:00:00.000Z",
    }],
  });
  assert.equal(projection.profileMode, "jewelry");
  assert.equal(projection.declarations[0]?.pricingVerified, false);
  assert.throws(() => parseCatalogWeightEditorProjection({ ...projection, privateToken: "no" }));
});

test("manual save intent accepts general weight while forbidding source and pricing verification injection", () => {
  assert.deepEqual(parseCatalogWeightSaveIntent({
    operationId: "30000000-0000-4000-8000-000000000001",
    expectedProductVersion: 4,
    expectedDeclarationVersion: 0,
    target: { level: "product", variantId: null },
    declaration: {
      gramsMilli: 100_000,
      scope: "total_product",
      salesUnit: "single",
      approximate: false,
      toleranceBasisPoints: null,
    },
  }).declaration.gramsMilli, 100_000);
  assert.throws(() => parseCatalogWeightSaveIntent({
    operationId: "30000000-0000-4000-8000-000000000001",
    expectedProductVersion: 4,
    expectedDeclarationVersion: 0,
    target: { level: "product", variantId: null },
    declaration: {
      gramsMilli: 100_000,
      scope: "total_product",
      salesUnit: "single",
      approximate: false,
      toleranceBasisPoints: null,
      source: "description",
      pricingVerified: true,
    },
  }));
});

test("profile opt-in is explicit for three isolated sector modes", () => {
  const base = { productVersion: 1, declarations: [] };
  assert.equal(parseCatalogWeightEditorProjection({ ...base, profileMode: null }).profileMode, null);
  assert.equal(parseCatalogWeightEditorProjection({ ...base, profileMode: "general" }).profileMode, "general");
  assert.equal(parseCatalogWeightEditorProjection({ ...base, profileMode: "jewelry" }).profileMode, "jewelry");
});

test("public product contract rejects declared weight and its audit source", () => {
  const product = {
    id: "20000000-0000-4000-8000-000000000001",
    slug: "guvenli-urun",
    title: "Güvenli ürün",
    currency: "TRY",
    status: "active",
    priceCents: 12_500,
    available: true,
    variants: [{
      id: "10000000-0000-4000-8000-000000000001",
      title: "Standart",
      priceCents: 12_500,
      stockTracking: true,
      stockQuantity: 1,
      available: true,
      attributes: {},
    }],
    media: [],
  };
  assert.doesNotThrow(() => parsePublicProduct(product));
  assert.throws(() => parsePublicProduct({ ...product, declaredWeight: { gramsMilli: 3_250 } }));
  assert.throws(() => parsePublicProduct({ ...product, sourceDigest: "a".repeat(64) }));
});
