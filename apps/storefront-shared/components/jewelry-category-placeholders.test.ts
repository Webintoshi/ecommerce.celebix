import assert from "node:assert/strict";
import test from "node:test";

import type { PublicStarterHomeSection, PublicStarterNavigation } from "@celebix/saas-contracts";

import { deriveJewelryCategoryPlaceholders } from "./jewelry-category-placeholders.ts";

const navigation = Object.freeze({
  items: Object.freeze([
    Object.freeze({ name: "Kolyeler", slug: "kolyeler", children: Object.freeze([]) }),
    Object.freeze({ name: "Bileklikler", slug: "bileklikler", children: Object.freeze([]) }),
    Object.freeze({ name: "Yüzükler", slug: "yuzukler", children: Object.freeze([]) }),
    Object.freeze({ name: "Küpeler", slug: "kupeler", children: Object.freeze([]) }),
    Object.freeze({ name: "Bilezikler", slug: "bilezikler", children: Object.freeze([]) }),
  ]),
}) satisfies PublicStarterNavigation;

const image = Object.freeze({
  url: "https://cdn.example.test/kolye.webp",
  mediaType: "image/webp" as const,
  altText: "Kolye",
  width: 1200,
  height: 1500,
});

test("unresolved navigation categories receive stable bounded placeholder labels beside configured content", () => {
  const sections = Object.freeze([Object.freeze({
    kind: "product_row" as const,
    key: "latest-4",
    heading: "Yeni ürünler",
    source: "latest" as const,
    limit: 4,
  })]) satisfies readonly PublicStarterHomeSection[];
  const placeholders = deriveJewelryCategoryPlaceholders(navigation, sections);

  assert.deepEqual(placeholders, [
    { name: "Kolyeler", slug: "kolyeler", label: "PLACEHOLDER 1", destination: "/categories/kolyeler" },
    { name: "Bileklikler", slug: "bileklikler", label: "PLACEHOLDER 2", destination: "/categories/bileklikler" },
    { name: "Yüzükler", slug: "yuzukler", label: "PLACEHOLDER 3", destination: "/categories/yuzukler" },
    { name: "Küpeler", slug: "kupeler", label: "PLACEHOLDER 4", destination: "/categories/kupeler" },
  ]);
});

test("an intentionally empty homepage never receives implicit category content", () => {
  const placeholders = deriveJewelryCategoryPlaceholders(navigation, Object.freeze([]));

  assert.deepEqual(placeholders, []);
  assert.equal(Object.isFrozen(placeholders), true);
});

test("resolved category imagery is never duplicated as a placeholder", () => {
  const sections = Object.freeze([
    Object.freeze({
      kind: "category_grid" as const,
      heading: "Koleksiyonlar",
      layout: "grid" as const,
      items: Object.freeze([
        Object.freeze({ name: "Kolyeler", slug: "kolyeler", image }),
        Object.freeze({ name: "Yüzükler", slug: "yuzukler", image }),
      ]),
    }),
  ]) satisfies readonly PublicStarterHomeSection[];

  assert.deepEqual(deriveJewelryCategoryPlaceholders(navigation, sections), [
    { name: "Bileklikler", slug: "bileklikler", label: "PLACEHOLDER 1", destination: "/categories/bileklikler" },
    { name: "Küpeler", slug: "kupeler", label: "PLACEHOLDER 2", destination: "/categories/kupeler" },
    { name: "Bilezikler", slug: "bilezikler", label: "PLACEHOLDER 3", destination: "/categories/bilezikler" },
  ]);
});

test("placeholder projection is deeply immutable and does not mutate public authority", () => {
  const before = JSON.stringify(navigation);
  const sections = Object.freeze([Object.freeze({
    kind: "product_row" as const,
    key: "latest-4",
    heading: "Yeni ürünler",
    source: "latest" as const,
    limit: 4,
  })]) satisfies readonly PublicStarterHomeSection[];
  const placeholders = deriveJewelryCategoryPlaceholders(navigation, sections, 2);

  assert.equal(Object.isFrozen(placeholders), true);
  assert.equal(Object.isFrozen(placeholders[0]), true);
  assert.equal(placeholders.length, 2);
  assert.equal(JSON.stringify(navigation), before);
});

test("placeholder tiles expose only canonical category destinations and editable labels", () => {
  const sections = Object.freeze([Object.freeze({
    kind: "product_row" as const,
    key: "latest-4",
    heading: "Yeni ürünler",
    source: "latest" as const,
    limit: 4,
  })]) satisfies readonly PublicStarterHomeSection[];
  const items = deriveJewelryCategoryPlaceholders(navigation, sections, 2);

  assert.deepEqual(items.map(({ destination, label }) => ({ destination, label })), [
    { destination: "/categories/kolyeler", label: "PLACEHOLDER 1" },
    { destination: "/categories/bileklikler", label: "PLACEHOLDER 2" },
  ]);
  assert.doesNotMatch(JSON.stringify(items), /tenantId|storeId|categoryId|assetId/);
});
