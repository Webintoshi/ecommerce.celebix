import assert from "node:assert/strict";
import test from "node:test";

import type { PublicProduct } from "@celebix/saas-contracts";
import { availableProductsFirst } from "./public-product-ordering.ts";

function product(id: string, available: boolean): PublicProduct {
  return Object.freeze({
    id,
    slug: `urun-${id}`,
    title: `Ürün ${id}`,
    currency: "TRY",
    status: "active",
    priceCents: 1_000,
    available,
    variants: Object.freeze([
      Object.freeze({
        id: `${id}-variant`,
        title: "Standart",
        priceCents: 1_000,
        stockTracking: true,
        stockQuantity: available ? 1 : 0,
        available,
        attributes: Object.freeze({}),
      }),
    ]),
    media: Object.freeze([]),
  });
}

test("availableProductsFirst keeps category order stable while moving sold-out products to the end", () => {
  const items = Object.freeze([
    product("sold-first", false),
    product("active-a", true),
    product("sold-middle", false),
    product("active-b", true),
    product("sold-last", false),
  ]);

  const ordered = availableProductsFirst(items);

  assert.deepEqual(ordered.map(({ id }) => id), [
    "active-a",
    "active-b",
    "sold-first",
    "sold-middle",
    "sold-last",
  ]);
  assert.deepEqual(items.map(({ id }) => id), [
    "sold-first",
    "active-a",
    "sold-middle",
    "active-b",
    "sold-last",
  ]);
  assert.equal(Object.isFrozen(ordered), true);
});
