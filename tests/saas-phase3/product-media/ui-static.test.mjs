import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Hemenaku product detail exposes real bounded media management controls", async () => {
  const [manager, detail, client] = await Promise.all([
    read("apps/customer-panel/components/catalog/ProductMediaManager.tsx"),
    read("apps/customer-panel/components/catalog/ProductDetailConsole.tsx"),
    read("apps/customer-panel/lib/catalog-ui/media-client.ts"),
  ]);
  assert.match(detail, /<ProductMediaManager productId=\{productId\}/);
  assert.match(manager, /type="file"/);
  assert.match(manager, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(manager, /role="progressbar"/);
  assert.match(manager, /Birincil görsel/);
  assert.match(manager, /Yukarı taşı|Aşağı taşı/);
  assert.match(manager, /Görseli arşivlemeyi onayla/);
  assert.match(manager, /altText/);
  assert.doesNotMatch(`${manager}\n${client}`, /x-store-id|x-tenant-id|localStorage|storeId:/);
});

test("product creation offers image selection and uploads only after durable product creation", async () => {
  const source = await read("apps/customer-panel/components/catalog/ProductCreateForm.tsx");
  assert.match(source, /type="file"/);
  assert.match(source, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.ok(source.indexOf("catalogApi.createProduct") < source.indexOf("productMediaApi.upload"));
  assert.match(source, /Yükleme ilerlemesi/);
  assert.match(source, /Görsel alt metni/);
});
