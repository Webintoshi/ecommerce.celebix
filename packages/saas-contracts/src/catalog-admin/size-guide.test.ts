import assert from "node:assert/strict";
import test from "node:test";
import * as contracts from "../index.ts";

const ID = "71000000-0000-4000-8000-000000000001";
const CATEGORY = "79000000-0000-4000-8000-000000000001";
const NOW = "2026-10-03T00:00:00.000Z";
const GUIDE = { schemaVersion: 1, type: "size_guide", heading: "Ölçü rehberi", body: "<p>İşletmenin rehberi</p>", categoryIds: [CATEGORY], includeDescendants: true, enabled: true };
function resource(config: unknown = GUIDE, productIds: string[] = [], kind = "extra") {
  return { id: ID, kind, name: "Yüzük rehberi", slug: "yuzuk-rehberi", config, status: "active", productIds, productCount: productIds.length, version: 1, createdAt: NOW, updatedAt: NOW };
}

test("typed extra guide response preserves ten thousand rich text characters and line breaks", () => {
  const richText = "<h2>Ölçüler</h2>\n<table><tbody><tr><td>İç çevre\tölçüsü</td></tr></tbody></table>\r\n";
  const body = richText + "ü".repeat(10_000 - richText.length);
  assert.equal(body.length, 10_000);
  const result = contracts.parseCatalogAdminResource(resource({ ...GUIDE, body }));
  assert.equal(result.config.body, body);
  assert.equal(Object.isFrozen(result.config), true);
  assert.equal(Object.isFrozen(result.config.categoryIds), true);
});

test("shared guide parser is exported and preserves the exact immutable schema", () => {
  const result = contracts.parseCatalogSizeGuideConfig(GUIDE);
  assert.deepEqual(result, GUIDE);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.categoryIds), true);
});

test("guide configs reject missing or unexpected keys, wrong types and invalid categories", () => {
  const missing = { ...GUIDE } as Record<string, unknown>;
  delete missing.enabled;
  for (const config of [
    missing, { ...GUIDE, priceCents: 1 }, { ...GUIDE, schemaVersion: 2 },
    { ...GUIDE, type: "option" },
    { ...GUIDE, heading: "" }, { ...GUIDE, heading: "x".repeat(121) },
    { ...GUIDE, body: "" }, { ...GUIDE, body: " \n\t " }, { ...GUIDE, body: "x".repeat(10_001) },
    { ...GUIDE, body: "a\u0000b" }, { ...GUIDE, body: "a\u000bb" },
    { ...GUIDE, categoryIds: [] }, { ...GUIDE, categoryIds: [CATEGORY, CATEGORY] },
    { ...GUIDE, categoryIds: ["foreign-category"] },
    { ...GUIDE, categoryIds: Array.from({ length: 65 }, (_, index) => `79000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`) },
    { ...GUIDE, enabled: "true" }, { ...GUIDE, includeDescendants: 1 },
  ]) assert.throws(() => contracts.parseCatalogSizeGuideConfig(config), /catalog_admin_contract_invalid/);
});

test("guide discriminator belongs only to extras and cannot include product links", () => {
  assert.throws(() => contracts.parseCatalogAdminResource(resource(GUIDE, [ID])));
  assert.throws(() => contracts.parseCatalogAdminResource(resource(GUIDE, [], "definition")));
});

test("priced options retain generic limits and product relationships", () => {
  const option = { type: "option", title: "Hediye paketi", priceCents: 1000 };
  const result = contracts.parseCatalogAdminResource(resource(option, [ID]));
  assert.deepEqual(result.config, option);
  assert.deepEqual(result.productIds, [ID]);
  for (const config of [{ type: "option", body: "x".repeat(1001) }, { type: "option", body: "a\nb" }]) {
    assert.throws(() => contracts.parseCatalogAdminResource(resource(config)));
  }
});
