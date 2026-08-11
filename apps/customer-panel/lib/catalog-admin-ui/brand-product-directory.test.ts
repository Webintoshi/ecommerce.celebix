import assert from "node:assert/strict";
import test from "node:test";

import { loadBrandProductDirectory } from "./brand-product-directory.ts";

const PRODUCT_A = "72000000-0000-4000-8000-000000000001";
const PRODUCT_B = "72000000-0000-4000-8000-000000000002";
const PRODUCT_C = "72000000-0000-4000-8000-000000000003";

test("brand product directory resolves active and draft product names with representative SKUs", async () => {
  const draftInputs: unknown[] = [];
  const directory = await loadBrandProductDirectory({
    async listVariantChoices() {
      return [
        { productId: PRODUCT_A, productTitle: "Altın Kolye", variantId: "73000000-0000-4000-8000-000000000001", variantTitle: "55 cm", sku: "KL-55" },
        { productId: PRODUCT_A, productTitle: "Altın Kolye", variantId: "73000000-0000-4000-8000-000000000002", variantTitle: "60 cm", sku: "KL-60" },
        { productId: PRODUCT_B, productTitle: "Pırlanta Yüzük", variantId: "73000000-0000-4000-8000-000000000003", variantTitle: "14", sku: "YZ-14" },
      ];
    },
    async listProducts(input) {
      draftInputs.push(input);
      return input.cursor === undefined
        ? { items: [{ id: PRODUCT_C, title: "Taslak Bileklik", status: "draft" }], nextCursor: "draft-next" }
        : { items: [], nextCursor: undefined };
    },
  });

  assert.deepEqual(draftInputs, [{ status: "draft" }, { status: "draft", cursor: "draft-next" }]);
  assert.deepEqual(directory.map(({ id, title, representativeSku, variantCount, status }) => ({ id, title, representativeSku, variantCount, status })), [
    { id: PRODUCT_A, title: "Altın Kolye", representativeSku: "KL-55", variantCount: 2, status: "active" },
    { id: PRODUCT_B, title: "Pırlanta Yüzük", representativeSku: "YZ-14", variantCount: 1, status: "active" },
    { id: PRODUCT_C, title: "Taslak Bileklik", representativeSku: undefined, variantCount: 0, status: "draft" },
  ]);
});

test("brand product directory fails closed on repeated draft cursors", async () => {
  await assert.rejects(() => loadBrandProductDirectory({
    async listVariantChoices() { return []; },
    async listProducts() { return { items: [], nextCursor: "same" }; },
  }), /brand_product_directory_unavailable/);
});
