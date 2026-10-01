import assert from "node:assert/strict";
import test from "node:test";
import { variantStockLabel } from "./product-variant-status.ts";

test("stock privacy changes visible copy without changing variant inventory", () => {
  const variant = Object.freeze({ available: true, stockTracking: true, stockQuantity: 7 });
  assert.equal(variantStockLabel(variant, false), "Stokta");
  assert.equal(variantStockLabel(variant), "7 adet");
  assert.equal(variant.stockQuantity, 7);
});

test("hidden stock counts still distinguish sold-out and untracked variants", () => {
  assert.equal(variantStockLabel({ available: false, stockTracking: true, stockQuantity: 0 }, false), "Tükendi");
  assert.equal(variantStockLabel({ available: true, stockTracking: false, stockQuantity: 0 }, false), "Stokta");
});
