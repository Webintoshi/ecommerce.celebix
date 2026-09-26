import assert from "node:assert/strict";
import test from "node:test";
import { parseCatalogCategory, parseCatalogCategoryFields, parseCatalogCategoryOrderFields, parseCatalogCategoryOrderResult } from "./validation.ts";

const A = "74000000-0000-4000-8000-000000000001";
const B = "74000000-0000-4000-8000-000000000002";
const ASSET = "75000000-0000-4000-8000-000000000001";
const STORE = "33333333-3333-4333-8333-333333333333";
const category = { id: A, name: "Pantolon", slug: "pantolon", position: 1, depth: 1, status: "active", version: 1, createdAt: "2026-09-26T09:00:00.000Z", updatedAt: "2026-09-26T09:00:00.000Z" };
const group = { orderedCategoryIds: [B, A], expectedVersions: [{ categoryId: A, version: 2 }, { categoryId: B, version: 1 }] };

test("existing category fields retain absent image; null and asset association are distinct", () => {
  const fields = { name: "Pantolon", position: 1 };
  assert.deepEqual(parseCatalogCategoryFields(fields), fields);
  assert.equal(Object.hasOwn(parseCatalogCategory(category), "image"), false);
  assert.deepEqual(parseCatalogCategoryFields({ ...fields, image: null }), { ...fields, image: null });
  assert.deepEqual(parseCatalogCategoryFields({ ...fields, image: { assetId: ASSET, altText: "Pantolon görseli" } }).image, { assetId: ASSET, altText: "Pantolon görseli" });
  assert.throws(() => parseCatalogCategoryFields({ ...fields, image: { assetId: ASSET, altText: "", publicUrl: "https://host.test/file" } }));
});

test("category image projection only accepts the first-party category asset path", () => {
  const publicUrl = `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/category/${ASSET}.webp`;
  assert.equal(parseCatalogCategory({ ...category, image: { assetId: ASSET, altText: "", publicUrl, width: 600, height: 800 } }).image?.publicUrl, publicUrl);
  for (const url of [publicUrl.replace("media.saas-staging.celebix.site", "foreign.test"), `${publicUrl}?token=secret`, publicUrl.replace(`/category/${ASSET}`, `/category/${B}`), publicUrl.replace("https:", "javascript:")]) {
    assert.throws(() => parseCatalogCategory({ ...category, image: { assetId: ASSET, altText: "", publicUrl: url } }));
  }
  assert.throws(() => parseCatalogCategory({ ...category, image: null }));
});

test("atomic order validates unique complete expected-version sets before sending", () => {
  assert.deepEqual(parseCatalogCategoryOrderFields({ groups: [group] }), { groups: [group] });
  for (const groups of [[], [group, group], [{ ...group, orderedCategoryIds: [A, A] }], [{ ...group, expectedVersions: [{ categoryId: A, version: 1 }] }], [{ ...group, expectedVersions: [{ categoryId: A, version: 1 }, { categoryId: B, version: 0 }] }], [{ ...group, parentId: null }]]) {
    assert.throws(() => parseCatalogCategoryOrderFields({ groups }));
  }
  assert.throws(() => parseCatalogCategoryOrderFields({ groups: [group, { ...group, parentId: ASSET }] }));
  assert.throws(() => parseCatalogCategoryOrderResult({ categories: [category, category], replayed: false }));
});
