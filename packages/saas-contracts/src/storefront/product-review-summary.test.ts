import assert from "node:assert/strict";
import test from "node:test";
import { parsePublicProduct, parsePublicProductV2 } from "./validation.ts";

const product = {
  id: "20000000-0000-4000-8000-000000000001", slug: "gercek-urun", title: "Ürün", currency: "TRY", status: "active", priceCents: 1000, available: true,
  variants: [{ id: "30000000-0000-4000-8000-000000000001", title: "Standart", priceCents: 1000, stockTracking: true, stockQuantity: 1, available: true, attributes: {} }], media: [],
};

test("public product summaries preserve fractional approved averages and the enabled empty state", () => {
  assert.equal(Object.hasOwn(parsePublicProduct(product), "reviewSummary"), false);
  for (const reviewSummary of [{ averageRating: 4.5, reviewCount: 24 }, { averageRating: 0, reviewCount: 0 }]) {
    const parsed = parsePublicProduct({ ...product, reviewSummary });
    assert.deepEqual(parsed.reviewSummary, reviewSummary);
    assert.equal(Object.isFrozen(parsed.reviewSummary), true);
    assert.deepEqual(parsePublicProductV2({ ...product, reviewSummary, seoTitle: null, seoDescription: null }).reviewSummary, reviewSummary);
  }
});

test("public product summaries reject impossible, private or non-finite ratings", () => {
  for (const reviewSummary of [
    null, { averageRating: 4.5 }, { averageRating: 4.5, reviewCount: -1 }, { averageRating: 4.5, reviewCount: 1.5 },
    { averageRating: 4.5, reviewCount: 0 }, { averageRating: 0, reviewCount: 1 }, { averageRating: 0.5, reviewCount: 1 },
    { averageRating: 5.1, reviewCount: 1 }, { averageRating: Number.NaN, reviewCount: 1 }, { averageRating: Infinity, reviewCount: 1 },
    { averageRating: 4.5, reviewCount: Number.MAX_SAFE_INTEGER + 1 }, { averageRating: "4.5", reviewCount: 2 },
    { averageRating: 4.5, reviewCount: 2, storeId: product.id },
  ]) assert.throws(() => parsePublicProduct({ ...product, reviewSummary }), /storefront_contract_invalid/u);
});
