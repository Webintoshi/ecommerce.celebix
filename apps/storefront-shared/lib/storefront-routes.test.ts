import assert from "node:assert/strict";
import test from "node:test";

import {
  categoryPath,
  localizePublicStorefrontDesign,
  localizeStorefrontPath,
  productIndexPath,
  productPath,
  storefrontRouteVariant,
} from "./storefront-routes.ts";

test("Turkish storefront routes use customer-facing Turkish slugs", () => {
  assert.equal(productIndexPath("tr"), "/urunler");
  assert.equal(productPath("tr-TR", "altin-kolye"), "/urun/altin-kolye");
  assert.equal(categoryPath("tr", "kolyeler"), "/kategori/kolyeler");
  assert.equal(storefrontRouteVariant("tr-TR"), "localized");
});

test("non-Turkish storefront routes keep the established English slugs", () => {
  assert.equal(productIndexPath("en"), "/products");
  assert.equal(productPath("en-US", "gold-necklace"), "/products/gold-necklace");
  assert.equal(categoryPath("en", "necklaces"), "/categories/necklaces");
  assert.equal(storefrontRouteVariant("en-US"), "legacy");
});

test("stored internal destinations are localized without losing query or hash state", () => {
  assert.equal(localizeStorefrontPath("/products", "tr"), "/urunler");
  assert.equal(
    localizeStorefrontPath("/products/altin-kolye?variant=ince#detay", "tr-TR"),
    "/urun/altin-kolye?variant=ince#detay",
  );
  assert.equal(
    localizeStorefrontPath("/categories/kolyeler?sort=new", "tr"),
    "/kategori/kolyeler?sort=new",
  );
  assert.equal(localizeStorefrontPath("/products/altin-kolye", "en"), "/products/altin-kolye");
  assert.equal(localizeStorefrontPath("https://example.test/products/item", "tr"), "https://example.test/products/item");
});

test("published design destinations use the same Turkish public route contract", () => {
  const design = {
    hero: { slides: [{ destination: { path: "/products/altin-kolye" } }] },
    promotion: { destination: { path: "/categories/kolyeler" } },
  };
  const selected = localizePublicStorefrontDesign(design as never, "tr");
  assert.equal(selected.hero.slides[0]?.destination?.path, "/urun/altin-kolye");
  assert.equal(selected.promotion.destination?.path, "/kategori/kolyeler");
  assert.equal(localizePublicStorefrontDesign(design as never, "en"), design);
});
