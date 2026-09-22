import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("shared permanent deletion dialog requires exact label and irreversible acknowledgement", async () => {
  const dialog = await source("components/shared/PermanentDeleteDialog.tsx");
  assert.match(dialog, /confirmation === impact[.]confirmationLabel/u);
  assert.match(dialog, /acknowledged/u);
  assert.match(dialog, /geri alınamayacağını/u);
  assert.match(dialog, /role="alertdialog"/u);
  assert.match(dialog, /event[.]key === "Escape"/u);
  assert.match(dialog, /Kalıcı olarak sil/u);
});

test("product and category surfaces receive server-derived delete capability and keep archive separate", async () => {
  const [productPage, categoryPage, product, category] = await Promise.all([
    source("app/products/[productId]/page.tsx"),
    source("app/products/categories/page.tsx"),
    source("components/catalog/ProductDetailConsole.tsx"),
    source("components/catalog-onboarding/CategoryManager.tsx"),
  ]);
  assert.match(productPage, /isMerchantActionAllowed\(role, "catalog_admin[.]delete"\)/u);
  assert.match(categoryPage, /isMerchantActionAllowed\(tenantContext[.]membership[.]role, "catalog_admin[.]delete"\)/u);
  for (const selected of [product, category]) {
    assert.match(selected, /get(?:Product|Category)DeletionImpact/u);
    assert.match(selected, /delete(?:Product|Category)/u);
    assert.match(selected, /crypto[.]randomUUID\(\)/u);
    assert.match(selected, /Kalıcı sil/u);
    assert.match(selected, /Arşivle/u);
  }
});
