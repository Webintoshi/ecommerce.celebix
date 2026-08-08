import assert from "node:assert/strict";
import test from "node:test";
import {
  storefrontAssetRatioLabel,
  storefrontAssetRatioMatches,
  storefrontAssetRatioOptions,
} from "./storefront-asset-upload-model.ts";

test("storefront media choices expose only the useful ratios for each destination", () => {
  assert.deepEqual(storefrontAssetRatioOptions("hero").map(({ value }) => value), ["16:9", "3:4"]);
  assert.deepEqual(storefrontAssetRatioOptions("category").map(({ value }) => value), ["1:1", "3:4", "4:5"]);
  assert.deepEqual(storefrontAssetRatioOptions("logo").map(({ value }) => value), ["1:1", "16:9"]);
  assert.deepEqual(storefrontAssetRatioOptions("social").map(({ value }) => value), ["1:1", "16:9"]);
  assert.deepEqual(storefrontAssetRatioOptions("favicon").map(({ value }) => value), ["1:1"]);
});

test("storefront media ratio matching accepts real portrait assets within two percent", () => {
  assert.equal(storefrontAssetRatioMatches(896, 1195, "3:4"), true);
  assert.equal(storefrontAssetRatioMatches(895, 1195, "3:4"), true);
  assert.equal(storefrontAssetRatioMatches(1000, 1000, "1:1"), true);
  assert.equal(storefrontAssetRatioMatches(1600, 900, "16:9"), true);
  assert.equal(storefrontAssetRatioMatches(896, 1195, "4:5"), false);
});

test("storefront media ratio matching rejects invalid dimensions and labels custom ratios truthfully", () => {
  assert.equal(storefrontAssetRatioMatches(0, 1195, "3:4"), false);
  assert.equal(storefrontAssetRatioMatches(Number.NaN, 100, "1:1"), false);
  assert.equal(storefrontAssetRatioMatches(100, Number.POSITIVE_INFINITY, "1:1"), false);
  assert.equal(storefrontAssetRatioLabel(896, 1195), "3:4");
  assert.equal(storefrontAssetRatioLabel(1200, 1200), "1:1");
  assert.equal(storefrontAssetRatioLabel(1024, 768), "Özel oran");
});
