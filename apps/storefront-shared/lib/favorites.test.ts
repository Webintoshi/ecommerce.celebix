import assert from "node:assert/strict";
import test from "node:test";

import type { PublicProduct } from "@celebix/saas-contracts";
import {
  favoritesStorageKey,
  parseFavoriteProductIds,
  readFavoriteResolutionRequest,
  reconcileFavoriteProductIds,
  toggleFavoriteProductId,
} from "./favorites.ts";

const FIRST = "10000000-0000-4000-8000-000000000001";
const SECOND = "10000000-0000-4000-8000-000000000002";

function product(id: string): PublicProduct {
  return Object.freeze({ id, slug: `urun-${id.slice(-4)}`, title: "Ürün", currency: "TRY", status: "active", priceCents: 100, available: true, variants: Object.freeze([]), media: Object.freeze([]) });
}

test("favorites are isolated by canonical hostname and only canonical UUID arrays survive", () => {
  assert.equal(favoritesStorageKey("shop.example.test"), "celebix:storefront:favorites:v1:shop.example.test");
  assert.notEqual(favoritesStorageKey("other.example.test"), favoritesStorageKey("shop.example.test"));
  assert.deepEqual(parseFavoriteProductIds(JSON.stringify([FIRST, SECOND, FIRST])), [FIRST, SECOND]);
  assert.deepEqual(parseFavoriteProductIds(JSON.stringify([FIRST, "not-an-id"])), []);
  assert.deepEqual(parseFavoriteProductIds("{}"), []);
  assert.throws(() => favoritesStorageKey("SHOP.example.test"), /storefront_favorites_invalid_hostname/u);
});

test("favorites never exceed one hundred and canonical resolution removes missing IDs", () => {
  const ids = Array.from({ length: 101 }, (_, index) => `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
  assert.deepEqual(parseFavoriteProductIds(JSON.stringify(ids)), []);
  assert.deepEqual(reconcileFavoriteProductIds([FIRST, SECOND], [product(SECOND)]), [SECOND]);
  assert.deepEqual(toggleFavoriteProductId([FIRST], SECOND), [FIRST, SECOND]);
  assert.deepEqual(toggleFavoriteProductId([FIRST, SECOND], FIRST), [SECOND]);
});

test("favorite resolution accepts only exact same-origin JSON POST authority", async () => {
  const accepted = await readFavoriteResolutionRequest(new Request("http://internal:3400/api/favorites/resolve", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://shop.example.test", "x-forwarded-host": "shop.example.test" },
    body: JSON.stringify({ productIds: [FIRST, SECOND] }),
  }), "https://shop.example.test");
  assert.deepEqual(accepted, [FIRST, SECOND]);

  for (const request of [
    new Request("http://internal:3400/api/favorites/resolve", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ productIds: [FIRST] }) }),
    new Request("http://internal:3400/api/favorites/resolve?x=1", { method: "POST", headers: { "content-type": "application/json", origin: "https://shop.example.test" }, body: JSON.stringify({ productIds: [FIRST] }) }),
    new Request("http://internal:3400/api/favorites/resolve", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example", "x-forwarded-host": "shop.example.test" }, body: JSON.stringify({ productIds: [FIRST] }) }),
    new Request("http://internal:3400/api/favorites/resolve", { method: "POST", headers: { "content-type": "application/json", origin: "https://shop.example.test" }, body: JSON.stringify({ productIds: [FIRST], storeId: SECOND }) }),
  ]) await assert.rejects(readFavoriteResolutionRequest(request, "https://shop.example.test"), /storefront_favorites_request_invalid/u);
});
