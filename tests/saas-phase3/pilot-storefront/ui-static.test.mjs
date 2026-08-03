import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("shared storefront exposes the required Hemenaku-derived public routes", async () => {
  const [home, products, detail, detailExperience, purchasePanel, card, gallery, styles] = await Promise.all([
    read("apps/storefront-shared/app/page.tsx"), read("apps/storefront-shared/app/products/page.tsx"),
    read("apps/storefront-shared/app/products/[slug]/page.tsx"), read("apps/storefront-shared/components/ProductDetailExperience.tsx"), read("apps/storefront-shared/components/ProductPurchasePanel.tsx"),
    read("apps/storefront-shared/components/ProductCard.tsx"), read("apps/storefront-shared/components/ProductGallery.tsx"),
    read("apps/storefront-shared/app/globals.css"),
  ]);
  assert.match(home, /Yeni Ürünler|Yeni ürünler/);
  assert.match(products, /Ürünler/);
  assert.match(detail, /<ProductDetailExperience product=\{item\}/);
  assert.match(detailExperience, /<ProductPurchasePanel product=\{product\}/);
  assert.match(purchasePanel, /product[.]variants/);
  assert.match(purchasePanel, /Varyant/);
  assert.match(purchasePanel, /Sepete ekle/);
  assert.match(purchasePanel, /Şimdi satın al/);
  assert.match(card, /media\[0\]/);
  assert.match(gallery, /sortOrder|product\.media/);
  assert.match(styles, /@media \(max-width:/);
});

test("storefront pages use only persisted public projections and domain-scoped canonical metadata", async () => {
  const sources = await Promise.all([
    read("apps/storefront-shared/lib/public-storefront.ts"), read("apps/storefront-shared/lib/default-runtime.ts"),
    read("apps/storefront-shared/app/page.tsx"), read("apps/storefront-shared/app/products/page.tsx"), read("apps/storefront-shared/app/products/[slug]/page.tsx"),
  ]);
  const combined = sources.join("\n");
  assert.match(combined, /PostgresPublicStorefrontRepository/);
  assert.match(combined, /canonicalUrl/);
  assert.doesNotMatch(combined, /headers\.get\(["']host["']\)|storeId.*searchParams|localStorage|costCents/);
});
