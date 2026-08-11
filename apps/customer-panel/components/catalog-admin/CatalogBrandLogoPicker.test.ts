import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = () => readFile(new URL("./CatalogBrandLogoPicker.tsx", import.meta.url), "utf8");

test("brand logo picker uses the existing tenant-scoped R2 asset authority", async () => {
  const value = await source();
  assert.match(value, /\/api\/storefront-assets/);
  assert.match(value, /data\.append\("kind", "logo"\)/);
  assert.match(value, /parseStorefrontAsset/);
  assert.match(value, /idempotency-key/);
  assert.match(value, /Marka logosu yükle/);
  assert.match(value, /Görseli kaldır/);
  assert.doesNotMatch(value, /<form/);
  assert.doesNotMatch(value, /x-store-id|x-tenant-id|localStorage|sessionStorage|supabase|\/api\/admin/);
});
