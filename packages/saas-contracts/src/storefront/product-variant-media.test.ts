import assert from "node:assert/strict";
import test from "node:test";
import * as storefront from "./index.ts";
import { parsePublicProduct, parsePublicProductVariant } from "./validation.ts";
import type { PublicProduct, PublicProductMedia } from "./types.ts";

const PRODUCT = "20000000-0000-4000-8000-000000000001";
const RED = "30000000-0000-4000-8000-000000000001";
const WHITE = "30000000-0000-4000-8000-000000000002";
const GENERAL = "40000000-0000-4000-8000-000000000001";
const FRONT = "40000000-0000-4000-8000-000000000002";
const BACK = "40000000-0000-4000-8000-000000000003";
const MISSING = "40000000-0000-4000-8000-000000000004";
const variant = { id: RED, title: "Kırmızı / M", priceCents: 1000, stockTracking: false, stockQuantity: 0, available: true, attributes: { color: "Kırmızı", size: "M" } };
const media = (id: string, sortOrder: number, variantId?: string): PublicProductMedia => ({ id, productId: PRODUCT, sortOrder, url: `https://media.example/${id}.webp`, mediaType: "image/webp", altText: "Ürün", ...(variantId ? { variantId } : {}) });
const product: PublicProduct = { id: PRODUCT, slug: "ornek-urun", title: "Örnek ürün", currency: "TRY", status: "active", priceCents: 1000, available: true, variants: [variant, { ...variant, id: WHITE, title: "Beyaz / M" }], media: [media(GENERAL, 0), media(FRONT, 1, RED), media(BACK, 2, RED)] };

function resolve(value: PublicProduct, variantId?: string | null) {
  const fn = (storefront as unknown as { resolvePublicProductVariantMedia?: (product: PublicProduct, id?: string | null) => readonly PublicProductMedia[] }).resolvePublicProductVariantMedia;
  assert.equal(typeof fn, "function", "public variant gallery resolver is exported");
  return fn!(value, variantId).map(({ id }) => id);
}

test("variant galleries preserve assignment order and allow another size to reuse the same images", () => {
  const value = { ...product, variants: [{ ...variant, mediaIds: [BACK, FRONT] }, { ...variant, id: WHITE, mediaIds: [FRONT, BACK] }] };
  assert.deepEqual(resolve(value, RED), [BACK, FRONT]);
  assert.deepEqual(resolve(value, WHITE), [FRONT, BACK]);
  assert.deepEqual(product.media.map(({ id }) => id), [GENERAL, FRONT, BACK]);
});

test("missing gallery metadata uses legacy variant images while explicit empty uses the general gallery", () => {
  assert.deepEqual(resolve(product, RED), [FRONT, BACK]);
  assert.deepEqual(resolve({ ...product, variants: [{ ...variant, mediaIds: [] }] }, RED), [GENERAL, FRONT, BACK]);
  assert.deepEqual(resolve(product, WHITE), [GENERAL, FRONT, BACK]);
  assert.deepEqual(resolve(product, "unknown"), [GENERAL, FRONT, BACK]);
  assert.deepEqual(resolve(product), [GENERAL, FRONT, BACK]);
});

test("missing or archived references are filtered and an empty resolved assignment falls back to general media", () => {
  assert.deepEqual(resolve({ ...product, variants: [{ ...variant, mediaIds: [MISSING, BACK] }] }, RED), [BACK]);
  assert.deepEqual(resolve({ ...product, variants: [{ ...variant, mediaIds: [MISSING] }] }, RED), [GENERAL, FRONT, BACK]);
  assert.deepEqual(resolve({ ...product, variants: [{ ...variant, mediaIds: [] }], media: [] }, RED), []);
  assert.deepEqual(resolve({ ...product, variants: [{ ...variant, mediaIds: [] }], media: [media(FRONT, 0, RED)] }, RED), [FRONT]);
});

test("gallery resolution never uses media belonging to another product and sorts legacy/general images", () => {
  const value = { ...product, media: [media(BACK, 2, RED), media(GENERAL, 0), media(FRONT, 1, RED), { ...media(MISSING, 3), productId: WHITE }] };
  assert.deepEqual(resolve(value, RED), [FRONT, BACK]);
  assert.deepEqual(resolve(value, WHITE), [GENERAL, FRONT, BACK]);
  assert.deepEqual(resolve({ ...value, variants: [{ ...variant, mediaIds: [MISSING] }] }, RED), [GENERAL, FRONT, BACK]);
});

test("public variant gallery parsing preserves omission and explicit empty and accepts 16 ordered unique media IDs", () => {
  assert.equal(Object.hasOwn(parsePublicProductVariant(variant), "mediaIds"), false);
  assert.deepEqual(parsePublicProductVariant({ ...variant, mediaIds: [] }).mediaIds, []);
  const ids = Array.from({ length: 16 }, (_, index) => `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
  const parsed = parsePublicProductVariant({ ...variant, mediaIds: ids });
  assert.deepEqual(parsed.mediaIds, ids);
  assert.ok(Object.isFrozen(parsed.mediaIds));
  assert.deepEqual(parsePublicProduct({ ...product, variants: [{ ...variant, mediaIds: [BACK, FRONT] }] }).variants[0]?.mediaIds, [BACK, FRONT]);
});

test("public gallery parsing rejects duplicates, malformed UUIDs, foreign IDs, sparse arrays and more than 16 references", () => {
  for (const mediaIds of [[FRONT, FRONT], ["not-a-uuid"], [undefined], null, [FRONT, ...Array(16).fill(BACK)]]) assert.throws(() => parsePublicProductVariant({ ...variant, mediaIds }));
  const sparse = Array(1);
  assert.throws(() => parsePublicProductVariant({ ...variant, mediaIds: sparse }));
  assert.throws(() => parsePublicProduct({ ...product, variants: [{ ...variant, mediaIds: [MISSING] }] }));
});


test("general fallback retains tagged sort-zero media before untagged sort-one media", () => {
  const value = { ...product, media: [media(GENERAL, 1), media(FRONT, 0, RED)], variants: [{ ...variant, mediaIds: [] }] };
  assert.deepEqual(resolve(value, RED), [FRONT, GENERAL]);
  assert.deepEqual(resolve({ ...value, variants: [{ ...variant, mediaIds: [MISSING] }] }, RED), [FRONT, GENERAL]);
  assert.deepEqual(resolve({ ...value, variants: [variant] }, RED), [FRONT]);
  assert.deepEqual(resolve({ ...value, variants: [{ ...variant, id: WHITE }] }, WHITE), [FRONT, GENERAL]);
});
