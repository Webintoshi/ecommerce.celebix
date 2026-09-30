import assert from "node:assert/strict";
import test from "node:test";
import { parsePublicCollectionPage } from "./collections.ts";

const ID = "10000000-0000-4000-8000-000000000001";
const ASSET = "20000000-0000-4000-8000-000000000001";
const page = { collection: { id: ID, name: "Yeni sezon", slug: "yeni-sezon", cover: { url: `https://media.saas-staging.celebix.site/stores/${ID}/storefront/collection/${ASSET}.webp`, altText: "Yeni sezon", mediaType: "image/webp", width: 1200, height: 800 } }, items: [], total: 0, nextOffset: null };

test("public collection pages expose bounded public metadata and a dedicated cover", () => {
 const result = parsePublicCollectionPage(page);
 assert.equal(result.collection.cover?.url, page.collection.cover.url);
 assert.ok(Object.isFrozen(result.collection));
 assert.ok(Object.isFrozen(result.items));
});
test("public collection pages reject private fields, unsafe covers and invalid pagination", () => {
 for (const value of [
  { ...page, collection: { ...page.collection, productIds: [ID] } },
  { ...page, collection: { ...page.collection, cover: { ...page.collection.cover, url: "https://evil.example/a.webp" } } },
  { ...page, collection: { ...page.collection, slug: "../other" } },
  { ...page, nextOffset: -1 },
 ]) assert.throws(() => parsePublicCollectionPage(value));
});
