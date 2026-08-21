import assert from "node:assert/strict";
import test from "node:test";

import type { PublicProduct } from "@celebix/saas-contracts";
import { selectProducts } from "./product-explorer.ts";

function product(id: string, title: string, priceCents: number, available = true, compareAtCents?: number): PublicProduct {
  return Object.freeze({
    id,
    slug: `urun-${id}`,
    title,
    currency: "TRY",
    status: "active",
    priceCents,
    ...(compareAtCents === undefined ? {} : { compareAtCents }),
    available,
    variants: Object.freeze([]),
    media: Object.freeze([]),
  });
}

test("explorer performs Turkish-aware search, availability filtering and stable price ordering", () => {
  const items = Object.freeze([
    product("p-high", "İnci Yüzük", 20_000, true),
    product("p-low", "Zarif yüzük", 10_000, true, 12_000),
    product("p-sold", "Klasik Yüzük", 8_000, false),
  ]);
  assert.deepEqual(
    selectProducts(items, { query: "yüzük", filter: "available", order: "price-asc" }).map(({ id }) => id),
    ["p-low", "p-high"],
  );
  assert.deepEqual(items.map(({ id }) => id), ["p-high", "p-low", "p-sold"]);
});

test("explorer exposes only truthful discounted products and deterministic title ordering", () => {
  const items = [
    product("plain", "Kolye", 1_000),
    product("discounted", "Altın Bileklik", 2_000, true, 3_000),
    product("not-discounted", "Yüzük", 4_000, true, 4_000),
  ];
  assert.deepEqual(selectProducts(items, { query: "", filter: "discounted", order: "featured" }).map(({ id }) => id), ["discounted"]);
  assert.deepEqual(selectProducts(items, { query: "", filter: "all", order: "title-asc" }).map(({ id }) => id), ["discounted", "plain", "not-discounted"]);
});

test("explorer always moves sold-out products behind matching available products", () => {
  const items = [
    product("sold-cheap", "Tükenmiş Ucuz Bileklik", 1_000, false),
    product("active-mid", "Stokta Orta Bileklik", 5_000, true),
    product("sold-expensive", "Tükenmiş Pahalı Bileklik", 9_000, false),
    product("active-low", "Stokta Ucuz Bileklik", 2_000, true),
  ];

  assert.deepEqual(
    selectProducts(items, { query: "bileklik", filter: "all", order: "price-asc" }).map(({ id }) => id),
    ["active-low", "active-mid", "sold-cheap", "sold-expensive"],
  );
});

test("explorer rejects no view mode and returns a new frozen selection", () => {
  const items = [product("one", "Tek", 1_000)];
  const selected = selectProducts(items, { query: "bulunmuyor", filter: "all", order: "price-desc" });
  assert.deepEqual(selected, []);
  assert.equal(Object.isFrozen(selected), true);
  assert.notEqual(selected, items);
});
