import assert from "node:assert/strict";
import test from "node:test";

import {
  clampPurchaseQuantity,
  decrementPurchaseQuantity,
  incrementPurchaseQuantity,
} from "./product-purchase-quantity.ts";

test("purchase quantity stays inside the one-to-ninety-nine boundary", () => {
  assert.equal(clampPurchaseQuantity(0), 1);
  assert.equal(clampPurchaseQuantity(100), 99);
  assert.equal(decrementPurchaseQuantity(1), 1);
  assert.equal(incrementPurchaseQuantity(99), 99);
});

test("purchase quantity normalizes decimals and non-finite values", () => {
  assert.equal(clampPurchaseQuantity(4.9), 4);
  assert.equal(clampPurchaseQuantity(Number.NaN), 1);
  assert.equal(clampPurchaseQuantity(Number.POSITIVE_INFINITY), 1);
  assert.equal(decrementPurchaseQuantity(5), 4);
  assert.equal(incrementPurchaseQuantity(5), 6);
});
