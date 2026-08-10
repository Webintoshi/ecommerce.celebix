import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = () => readFile(new URL("./CategoryShowcaseEditor.tsx", import.meta.url), "utf8");

test("category showcase editor uses same-origin durable category asset and setting authorities", async () => {
  const value = await source();
  for (const token of ["catalogOnboardingClient.listCategories", "/api/storefront-assets", "merchantAdminApi.records(\"category_showcase\")", "merchantAdminApi.save(\"category_showcase\"", "buildCategoryShowcaseConfig"]) assert.match(value, new RegExp(token.replace(/[().]/g, "\\$&")));
  assert.doesNotMatch(value, /x-store-id|x-tenant-id|storeId|tenantId|localStorage|sessionStorage|R2_ACCESS|R2_SECRET/);
});

test("category showcase editor exposes bounded ordered accessible controls", async () => {
  const value = await source();
  for (const token of ["Kart ekle", "yukarı taşı", "aşağı taşı", "kartı kaldır", "Kategori seçin", "Görsel seçin", "role=\"alert\"", "role=\"status\"", "rows.length >= 8"]) assert.match(value, new RegExp(token));
  assert.match(value, /key=\{row[.]rowKey\}/);
  assert.doesNotMatch(value, /key=\{`\$\{index\}-\$\{row[.]categoryId\}-\$\{row[.]assetId\}`\}/);
});

test("category showcase editor owns heading visibility layout and ordered mappings", async () => {
  const value = await source();
  for (const token of [
    'useState<CategoryShowcaseLayout>("grid")',
    'value="duo"',
    'value="grid"',
    "İki büyük görsel",
    "Düzenli ızgara",
    "layout, rows",
  ]) assert.match(value, new RegExp(token.replace(/[().]/g, "\\$&")));
  assert.match(value, /layoutValue\s*!==\s*undefined\s*&&\s*layoutValue\s*!==\s*"duo"\s*&&\s*layoutValue\s*!==\s*"grid"/);
  assert.match(value, /layoutValue\s*[?][?]\s*"grid"/);
  assert.match(value, /layout:\s*"grid"/);
  assert.equal((value.match(/merchantAdminApi[.]save\("category_showcase"/g) ?? []).length, 1);
});
