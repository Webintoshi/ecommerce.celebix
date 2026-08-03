import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = () => readFile(new URL("./StorefrontAssetManager.tsx", import.meta.url), "utf8");

test("storefront asset manager uses only same-origin durable asset and setting APIs", async () => {
  const value = await source();
  assert.match(value, /\/api\/storefront-assets/);
  assert.match(value, /merchantAdminApi\.save/);
  assert.match(value, /assetId/);
  assert.match(value, /pendingUploadOperation/);
  assert.doesNotMatch(value, /x-store-id|x-tenant-id|R2_ACCESS|R2_SECRET|publicOrigin|localStorage|sessionStorage/);
});

test("storefront asset manager exposes loading error empty upload selection bindings archive and focus restoration", async () => {
  const value = await source();
  for (const token of ["Yükleniyor", "Henüz vitrin görseli yok", "role=\"alert\"", "Yükle", "Arşivle", "Hero olarak kullan", "Logo olarak kullan", "Sosyal görsel olarak kullan", "Kategori görseli", "focus()"]) assert.match(value, new RegExp(token));
});
