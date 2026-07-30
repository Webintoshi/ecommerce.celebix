import assert from "node:assert/strict";
import test from "node:test";
import { parseStorefrontAsset } from "./index.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const ASSET = "20000000-0000-4000-8000-000000000001";
const NOW = "2026-07-30T12:00:00.000Z";
const value = Object.freeze({
  id: ASSET, storeId: STORE, kind: "hero", objectKey: `stores/${STORE}/storefront/hero/${ASSET}.webp`,
  publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/hero/${ASSET}.webp`,
  mediaType: "image/webp", altText: "Yaz koleksiyonu", width: 1600, height: 900, byteSize: 2048,
  status: "active", createdAt: NOW, updatedAt: NOW, version: 1,
});

test("storefront asset contract parses and deeply freezes an exact store-owned asset", () => {
  const parsed = parseStorefrontAsset(value);
  assert.deepEqual(parsed, value);
  assert.equal(Object.isFrozen(parsed), true);
});

test("storefront asset contract accepts the finite category kind with its tenant key", () => {
  const category = { ...value, kind: "category", objectKey: `stores/${STORE}/storefront/category/${ASSET}.webp`, publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/category/${ASSET}.webp` };
  assert.deepEqual(parseStorefrontAsset(category), category);
});

test("storefront asset contract rejects cross-store keys and noncanonical public URLs", () => {
  assert.throws(() => parseStorefrontAsset({ ...value, objectKey: `stores/30000000-0000-4000-8000-000000000001/storefront/hero/${ASSET}.webp` }), /storefront_asset_contract_invalid/);
  assert.throws(() => parseStorefrontAsset({ ...value, publicUrl: `${value.publicUrl}?v=1` }), /storefront_asset_contract_invalid/);
  assert.throws(() => parseStorefrontAsset({ ...value, publicUrl: value.publicUrl.replace("https:", "http:") }), /storefront_asset_contract_invalid/);
});

test("storefront asset contract rejects partial archive state, unknown keys, MIME mismatch and unsafe kind", () => {
  assert.throws(() => parseStorefrontAsset({ ...value, status: "archived" }), /storefront_asset_contract_invalid/);
  assert.throws(() => parseStorefrontAsset({ ...value, extra: true }), /storefront_asset_contract_invalid/);
  assert.throws(() => parseStorefrontAsset({ ...value, mediaType: "image/png" }), /storefront_asset_contract_invalid/);
  assert.throws(() => parseStorefrontAsset({ ...value, kind: "product" }), /storefront_asset_contract_invalid/);
});

test("storefront asset contract rejects accessors without invoking them", () => {
  let invoked = false;
  const candidate = Object.defineProperty({ ...value }, "publicUrl", { enumerable: true, get() { invoked = true; return value.publicUrl; } });
  assert.throws(() => parseStorefrontAsset(candidate), /storefront_asset_contract_invalid/);
  assert.equal(invoked, false);
});
