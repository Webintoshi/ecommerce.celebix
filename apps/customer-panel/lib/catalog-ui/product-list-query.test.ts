import assert from "node:assert/strict";
import test from "node:test";

import {
  parseProductListUrlQuery,
  productListUrlQuery,
} from "./product-list-query.ts";

const CATEGORY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRAND = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const COLLECTION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

test("product list URL state round-trips every canonical server query dimension", () => {
  const state = {
    search: "  Son SKU  ",
    status: "active" as const,
    stock: "out-of-stock" as const,
    categoryId: CATEGORY,
    brandId: BRAND,
    collectionId: COLLECTION,
    sort: "created-asc" as const,
  };
  const serialized = productListUrlQuery(state);
  assert.equal(serialized, `q=Son+SKU&status=active&stock=out-of-stock&category=${CATEGORY}&brand=${BRAND}&collection=${COLLECTION}&sort=created-asc`);
  assert.deepEqual(parseProductListUrlQuery(new URLSearchParams(serialized)), { ...state, search: "Son SKU" });
});

test("product list URL state defaults safely and omits empty/default values", () => {
  assert.deepEqual(parseProductListUrlQuery(new URLSearchParams("q=+++&sort=price-asc")), { sort: "updated-desc" });
  assert.equal(productListUrlQuery({ sort: "updated-desc" }), "");
  assert.equal(productListUrlQuery({ search: "  Atlas  ", sort: "updated-desc" }), "q=Atlas");
});
