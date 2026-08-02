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

test("detail experience composes canonical brand category merchandising policy and recommendation surfaces", async () => {
  const source = await read("ProductDetailExperience.tsx");
  for (const token of ["product.categoryPath", "product.brand", "product.merchandising", "product.reviews", "ProductGallery", "ProductPurchasePanel", "ProductInformationDisclosures", "ProductApprovedReviews", "relatedProducts"]) assert.match(source, new RegExp(token.replace(".", "\\.")));
  assert.doesNotMatch(source, /Organic cotton|premium linen|ready to ship|Rachel F[.]|Leslie M[.]/u);
  assert.doesNotMatch(source, /storeId|tenantId|localStorage|sessionStorage/);
});

test("product detail resolves schema-v3 controls and published policy authority", async () => {
  const page = await read("../app/products/[slug]/page.tsx");
  assert.match(page, /presentation[.]schemaVersion === 3/u);
  assert.match(page, /LEGACY_PRODUCT_DETAIL/u);
  assert.match(page, /runtime[.]content[.]getPolicy/u);
  assert.match(page, /buildPublicPolicyPage/u);
  assert.match(page, /payment_delivery/u);
  assert.match(page, /returns_exchanges/u);
  assert.doesNotMatch(page, /policy.*body\s*:/iu);
});

test("detail gallery and mobile purchase stay keyboard and viewport safe", async () => {
  const gallery = await read("ProductGallery.tsx");
  const galleryModel = await read("product-gallery-model.ts");
  const styles = await read("product-detail-experience.module.css");
  const globalStyles = await read("../app/globals.css");
  assert.match(gallery, /aria-current/);
  assert.match(gallery, /aria-modal="true"/);
  assert.match(gallery, /galleryEscapeRequested\(event[.]key\)/);
  assert.match(gallery, /scheduleGalleryFocus\(zoomTriggerRef[.]current/);
  assert.match(gallery, /productGalleryReducer/);
  assert.match(galleryModel, /key === "Escape"/);
  assert.match(galleryModel, /target\?\.focus\(\)/);
  assert.match(gallery, /style\?: "grid" \| "rail"/);
  assert.match(gallery, /gallery-\$\{style\}/);
  assert.match(gallery, /gallery-mobile-track/);
  assert.match(globalStyles, /scroll-snap-type:\s*x mandatory/);
  assert.match(globalStyles, /[.]gallery-mobile-track img\s*\{[^}]*height:\s*auto/u);
  assert.match(globalStyles, /[.]gallery-rail [.]gallery-mobile-track/u);
  assert.match(globalStyles, /[.]gallery-rail [.]gallery-mobile-track\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2/u);
  assert.match(globalStyles, /[.]gallery-thumbnails\s*\{[^}]*flex-direction:\s*column/u);
  assert.match(globalStyles, /[.]gallery-zoom-backdrop/u);
  assert.match(styles, /position:\s*sticky/);
  assert.match(styles, /@media\s*\(max-width:\s*1024px\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /prefers-reduced-motion/);
});
