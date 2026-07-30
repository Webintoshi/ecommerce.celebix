import assert from "node:assert/strict";
import test from "node:test";

import { buildCategoryShowcaseConfig } from "./category-showcase-model.ts";

const CATEGORY_A = "81000000-0000-4000-8000-000000000001";
const CATEGORY_B = "81000000-0000-4000-8000-000000000002";
const ASSET_A = "82000000-0000-4000-8000-000000000001";
const ASSET_B = "82000000-0000-4000-8000-000000000002";

test("builds one immutable ordered category showcase config", () => {
  const config = buildCategoryShowcaseConfig({
    heading: "  Koleksiyonları keşfedin  ", enabled: true,
    rows: [{ categoryId: CATEGORY_B, assetId: ASSET_B }, { categoryId: CATEGORY_A, assetId: ASSET_A }],
  });
  assert.deepEqual(config, {
    heading: "Koleksiyonları keşfedin", enabled: true,
    items: [{ categoryId: CATEGORY_B, assetId: ASSET_B }, { categoryId: CATEGORY_A, assetId: ASSET_A }],
  });
  assert.equal(Object.isFrozen(config), true);
  assert.equal(Object.isFrozen(config.items), true);
  assert.equal(config.items.every(Object.isFrozen), true);
});

test("rejects incomplete duplicate excessive and hostile category showcase input", () => {
  for (const value of [
    { heading: "", enabled: true, rows: [{ categoryId: CATEGORY_A, assetId: ASSET_A }] },
    { heading: "Başlık\u0000", enabled: true, rows: [{ categoryId: CATEGORY_A, assetId: ASSET_A }] },
    { heading: "Kategoriler", enabled: "true", rows: [{ categoryId: CATEGORY_A, assetId: ASSET_A }] },
    { heading: "Kategoriler", enabled: true, rows: [] },
    { heading: "Kategoriler", enabled: true, rows: [{ categoryId: "category", assetId: ASSET_A }] },
    { heading: "Kategoriler", enabled: true, rows: [{ categoryId: CATEGORY_A, assetId: "asset" }] },
    { heading: "Kategoriler", enabled: true, rows: [{ categoryId: CATEGORY_A, assetId: ASSET_A }, { categoryId: CATEGORY_A, assetId: ASSET_B }] },
    { heading: "Kategoriler", enabled: true, rows: [{ categoryId: CATEGORY_A, assetId: ASSET_A }, { categoryId: CATEGORY_B, assetId: ASSET_A }] },
    { heading: "Kategoriler", enabled: true, rows: Array.from({ length: 9 }, (_, index) => ({ categoryId: `81000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, assetId: `82000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}` })) },
  ]) assert.throws(() => buildCategoryShowcaseConfig(value as never), /category_showcase_invalid/);
});
