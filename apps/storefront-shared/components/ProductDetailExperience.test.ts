import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name: string) => readFile(new URL(name, import.meta.url), "utf8");

test("related products derive store and category from persisted authority", async () => {
  const repository = await read("../../../packages/saas-data/src/storefront/repository.ts");
  assert.match(repository, /listRelatedPublicProducts/);
  assert.match(repository, /saas[.]public_storefront_related_products/);
  assert.doesNotMatch(repository, /input[.]storeId|input[.]categoryId/);
});

test("buy now reuses canonical cart before checkout", async () => {
  const source = await read("ProductPurchasePanel.tsx");
  assert.match(source, /replaceCart/);
  assert.match(source, /router[.]push\("\/checkout"\)/);
  assert.doesNotMatch(source, /window[.]location|computedTotal/);
});

test("detail experience composes canonical brand category policy and recommendation surfaces", async () => {
  const source = await read("ProductDetailExperience.tsx");
  for (const token of ["product.categoryPath", "product.brand", "ProductGallery", "ProductPurchasePanel", "ProductDescription", "relatedProducts", "POLICY_LINKS"]) assert.match(source, new RegExp(token.replace(".", "\\.")));
  assert.doesNotMatch(source, /storeId|tenantId|localStorage|sessionStorage/);
});

test("detail gallery and mobile purchase stay keyboard and viewport safe", async () => {
  const gallery = await read("ProductGallery.tsx");
  const styles = await read("product-detail-experience.module.css");
  assert.match(gallery, /aria-current/);
  assert.match(gallery, /gallery-mobile-track/);
  assert.match(await read("../app/globals.css"), /scroll-snap-type:\s*x mandatory/);
  assert.match(styles, /position:\s*sticky/);
  assert.match(styles, /@media\s*\(max-width:\s*1024px\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /prefers-reduced-motion/);
});
