import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(new URL("./products/route.ts", import.meta.url), "utf8");

function getSetInitializer(source, name) {
  const match = source.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(match, `${name} set initializer bulunamadi`);
  return match[1];
}

test("product create retries can strip storefront badge columns for older light postgres stores", () => {
  const optionalColumns = getSetInitializer(routeSource, "OPTIONAL_PRODUCT_COLUMNS");

  for (const column of ["is_featured", "is_bestseller"]) {
    assert.match(
      optionalColumns,
      new RegExp(`"${column}"`),
      `${column} eksik kolon hatasinda payload'dan dusurulebilmeli`,
    );
  }
});

test("product create rolls back the parent product when post-create variant persistence fails", () => {
  assert.match(
    routeSource,
    /async function rollbackCreatedProduct\(/,
    "urun olusturulduktan sonra varyant veya fetch hatasi olursa temizlik yardimcisi olmali",
  );
  assert.match(
    routeSource,
    /\.from\("product_variants"\)[\s\S]*?\.select\("id"\)[\s\S]*?\.eq\("product_id", productId\)/,
    "rollback once product_id ile varyant id'lerini bulmali",
  );
  assert.match(
    routeSource,
    /deleteProductVariantsById\(supabase, [^)]+\)/,
    "rollback light_postgres uyumlu id bazli varyant silmeyi kullanmali",
  );
  assert.match(
    routeSource,
    /\.from\("products"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("id", productId\)/,
    "rollback ana urun satirini da temizlemeli",
  );
  assert.match(
    routeSource,
    /catch \(postCreateError\)[\s\S]*?await rollbackCreatedProduct\(supabase, product\.id\)[\s\S]*?throw postCreateError/,
    "urun insertinden sonraki hatalar rollback edilip yukari firlatilmali",
  );
});

test("product variant create retries duplicate generated SKUs before failing", () => {
  assert.match(
    routeSource,
    /function isDuplicateVariantSkuError\(/,
    "product_variants sku unique hatasi sabit bicimde siniflandirilmali",
  );
  assert.match(
    routeSource,
    /function regenerateVariantInsertSkus[\s\S]*?variantsPayload:/,
    "otomatik uretilen varyant SKU'lari tekrar denenebilmelidir",
  );
  assert.match(
    routeSource,
    /isDuplicateVariantSkuError\(variantsError\)[\s\S]*?regenerateVariantInsertSkus\(/,
    "insert dongusu duplicate sku hatasinda yeni SKU payload'i ile tekrar denemeli",
  );
});
