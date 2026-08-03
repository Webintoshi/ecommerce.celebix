import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { adaptStarterPresentationV1, buildDefaultStarterPresentation, parsePublicStarterThemePresentation } from "@celebix/saas-contracts";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const STORE = "10000000-0000-4000-8000-000000000001";
const ASSET = "30000000-0000-4000-8000-000000000001";
const IMAGE = Object.freeze({ url: `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/hero/${ASSET}.webp`, mediaType: "image/webp", altText: "Yeni sezon", width: 1600, height: 1000 });

test("legacy schema v1 storefronts adapt deterministically without losing their public route", () => {
  const adapted = adaptStarterPresentationV1({
    schemaVersion: 1,
    displayName: "Eski Mağaza",
    theme: { colorScheme: "neutral", headingStyle: "serif", productCardStyle: "editorial", productImageRatio: "portrait", homeProductLimit: 8, showBrandStory: false },
    hero: { enabled: true, headline: "Eski Mağaza", body: "Seçki", destination: "/products" },
    seo: { allowIndex: false },
  });
  assert.equal(adapted.schemaVersion, 3);
  assert.equal(adapted.hero.destination, "/products");
  assert.deepEqual(adapted.sections.map(({ kind }) => kind), ["hero", "product_row"]);
  assert.equal(Object.isFrozen(adapted), true);
});

test("schema v3 full retail composition remains public-only and preserves the campaign harness registration", async () => {
  const defaults = buildDefaultStarterPresentation({ name: "Campaign Mağaza" });
  const parsed = parsePublicStarterThemePresentation({
    ...defaults,
    announcement: { items: ["Güvenli alışveriş"], destination: "/policies/payment-delivery" },
    navigation: { items: [{ name: "Takılar", slug: "takilar", children: [] }] },
    sections: [
      { kind: "hero", slides: [{ heading: "Yeni sezon", desktopImage: IMAGE, destination: "/products" }] },
      { kind: "category_grid", heading: "Kategoriler", items: [{ name: "Takılar", slug: "takilar", image: IMAGE }] },
      { kind: "product_row", key: "latest-0", heading: "Yeni ürünler", source: "latest", limit: 8 },
      { kind: "split_campaign", panels: [{ heading: "Takılar", image: IMAGE, destination: "/categories/takilar" }] },
      { kind: "brand_story", heading: "Özenle seçildi", body: "Kalıcı tasarımlar." },
    ],
  });
  assert.equal(parsed.schemaVersion, 3);
  assert.equal(JSON.stringify(parsed).includes("objectKey"), false);
  assert.equal(JSON.stringify(parsed).includes("tenantId"), false);
  const matrix = JSON.parse(await readFile(path.join(ROOT, "tests/saas-phase3/current-test-matrix.json"), "utf8"));
  assert.deepEqual(matrix.requiredPostgresqlHarnesses.at(-1), { file: "tests/saas-phase3/starter-theme-composition/postgres-harness.mjs", total: 32 });
});

test("new and empty stores use deterministic truth without invented media or commerce", () => {
  const defaults = buildDefaultStarterPresentation({ name: "Boş Mağaza" });
  assert.equal(defaults.schemaVersion, 3);
  assert.deepEqual(defaults.navigation.items, []);
  assert.equal(defaults.sections.some((section) => section.kind === "product_row"), true);
  const encoded = JSON.stringify(defaults);
  assert.doesNotMatch(encoded, /"reviews":|reviewerName|"rating":|stockQuantity|"discount":|https?:\/\//iu);
  assert.equal(Object.isFrozen(defaults.sections), true);
});
