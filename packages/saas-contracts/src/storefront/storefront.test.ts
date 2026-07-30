import assert from "node:assert/strict";
import test from "node:test";

import { parsePublicProduct, parsePublicStorefront } from "./validation.ts";

const STORE_ID = "10000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "20000000-0000-4000-8000-000000000001";
const VARIANT_ID = "30000000-0000-4000-8000-000000000001";
const MEDIA_ID = "40000000-0000-4000-8000-000000000001";

test("public storefront contract accepts only the safe exact-domain projection", () => {
  const parsed = parsePublicStorefront({ schemaVersion: 1, id: STORE_ID, name: "Pilot Store", slug: "pilot-store", hostname: "pilot.saas-staging.celebix.site", primaryHostname: "pilot.saas-staging.celebix.site", canonicalUrl: "https://pilot.saas-staging.celebix.site/", currency: "TRY", locale: "tr", themeKey: "hemenaku" });
  assert.equal(Object.isFrozen(parsed), true);
  assert.throws(() => parsePublicStorefront({ ...parsed, membershipId: MEDIA_ID }));
  assert.throws(() => parsePublicStorefront({ ...parsed, hostname: "PILOT.saas-staging.celebix.site" }));
  assert.throws(() => parsePublicStorefront({ ...parsed, canonicalUrl: "https://other.example/" }));
});

test("public product contract excludes cost and archived authority while preserving ordered active media", () => {
  const parsed = parsePublicProduct({ id: PRODUCT_ID, slug: "pilot-product", title: "Pilot Product", description: "Storefront description", currency: "TRY", status: "active", priceCents: 12_500, compareAtCents: 15_000, available: true, variants: [{ id: VARIANT_ID, title: "Default", sku: "PILOT-ONE", priceCents: 12_500, compareAtCents: 15_000, stockTracking: true, stockQuantity: 3, available: true, attributes: { color: "black" } }], media: [{ id: MEDIA_ID, productId: PRODUCT_ID, url: `https://media.saas-staging.celebix.site/stores/${STORE_ID}/products/${PRODUCT_ID}/${MEDIA_ID}.webp`, mediaType: "image/webp", altText: "Pilot product front view", width: 1200, height: 1200, sortOrder: 0 }] });
  assert.equal(Object.isFrozen(parsed.variants), true);
  assert.equal("costCents" in parsed.variants[0]!, false);
  assert.throws(() => parsePublicProduct({ ...parsed, costCents: 1 }));
  assert.throws(() => parsePublicProduct({ ...parsed, status: "draft" }));
});

test("public product contract preserves bounded multiline Markdown descriptions", () => {
  const markdown = "## Ürün özeti\n\n- 14 ayar altın\n- El işçiliği\n\n**Bakım:** Yumuşak bir bez kullanın.\nÖlçü bilgisi ürün detayındadır.";
  const product = {
    id: PRODUCT_ID,
    slug: "markdown-product",
    title: "Markdown Product",
    description: markdown,
    currency: "TRY",
    status: "active",
    priceCents: 12_500,
    available: true,
    variants: [{ id: VARIANT_ID, title: "Default", sku: "MARKDOWN-ONE", priceCents: 12_500, stockTracking: true, stockQuantity: 3, available: true, attributes: {} }],
    media: [],
  };

  assert.equal(parsePublicProduct(product).description, markdown);
  assert.throws(() => parsePublicProduct({ ...product, description: "Güvenli\u0000olmayan açıklama" }));
  assert.throws(() => parsePublicProduct({ ...product, description: "Güvenli\tolmayan açıklama" }));
  assert.throws(() => parsePublicProduct({ ...product, description: "Güvenli\rolmayan açıklama" }));
});
