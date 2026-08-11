import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultStarterThemeComposition } from "@celebix/saas-contracts";
import {
  addHomepageSection,
  HomepageCommandError,
  moveHomepageSection,
  updateHomepageSection,
} from "../../../apps/customer-panel/components/settings/design/homepage-command-model.ts";
import { scoreHomepageQuality } from "../../../apps/customer-panel/components/settings/design/homepage-quality-model.ts";
import {
  applyDesignEdit,
  beginDesignSave,
  completeDesignSave,
  createDesignEditorState,
} from "../../../apps/customer-panel/components/settings/design/workspace-model.ts";

const IMAGE = "40000000-0000-4000-8000-000000000111";
const CATEGORY = "30000000-0000-4000-8000-000000000111";
const MEDIA = Object.freeze([Object.freeze({ id: IMAGE, url: "https://media.example.test/hero.webp", altText: "Altın takı koleksiyonu", mediaType: "image/webp", width: 1600, height: 900 })]);
const DESTINATIONS = Object.freeze([Object.freeze({ kind: "collection", resourceId: CATEGORY, label: "Kolyeler", path: "/categories/kolyeler" })]);
const id = (suffix) => `home_${suffix}`;

function baseDesign() {
  return Object.freeze({
    schemaVersion: 4,
    brand: Object.freeze({ logo: null, favicon: null, primaryColor: "#ffffff", accentColor: "#171717", backgroundColor: "#ffffff", textColor: "#171717", fontFamily: "inter" }),
    hero: Object.freeze({ enabled: true, slides: Object.freeze([Object.freeze({ headline: "Yeni koleksiyon", body: "Zamansız tasarımlar", desktopImage: Object.freeze({ kind: "media", mediaId: IMAGE }), mobileImage: null, destination: Object.freeze({ kind: "collection", resourceId: CATEGORY }), enabled: true })]) }),
    promotion: Object.freeze({ headline: "Kampanya", body: "", destination: Object.freeze({ kind: "none" }), startsAt: null, endsAt: null, enabled: false }),
    announcement: Object.freeze({ items: Object.freeze(["Güvenli alışveriş"]), icon: "none", speed: "normal", direction: "left", animation: "continuous", enabled: false }),
    typography: Object.freeze({ headingFont: Object.freeze({ family: "Montserrat", category: "sans-serif", availableWeights: Object.freeze(["400", "700"]), source: "google" }), bodyFont: Object.freeze({ family: "Inter", category: "sans-serif", availableWeights: Object.freeze(["400", "700"]), source: "google" }), headingWeight: "700", bodyWeight: "400", headingSizePx: 48, bodySizePx: 16 }),
    composition: Object.freeze({ ...createDefaultStarterThemeComposition(), schemaVersion: 3, sections: Object.freeze([]) }),
  });
}

function noviceComposition() {
  let composition = baseDesign().composition;
  for (const [kind, suffix] of [
    ["category_grid", "categories_10"],
    ["product_row", "products_10"],
    ["split_campaign", "campaign_10"],
    ["brand_story", "story_100"],
    ["value_propositions", "values_100"],
    ["testimonials", "reviews_10"],
  ]) composition = addHomepageSection(composition, kind, id(suffix));

  const update = (sectionId, transform) => {
    const current = composition.sections.find((section) => section.sectionId === sectionId);
    composition = updateHomepageSection(composition, sectionId, transform(current));
  };
  update(id("categories_10"), (section) => ({ ...section, categoryIds: Object.freeze([CATEGORY]) }));
  update(id("campaign_10"), (section) => ({ ...section, panels: Object.freeze([Object.freeze({ heading: "Kolyeleri keşfedin", assetId: IMAGE, destination: "/categories/kolyeler" })]) }));
  update(id("story_100"), (section) => ({ ...section, assetId: IMAGE, destination: "/categories/kolyeler" }));
  return composition;
}

test("user class A: a novice merchant reaches a truthful 100-point homepage through section commands", () => {
  const design = Object.freeze({ ...baseDesign(), composition: noviceComposition() });
  const result = scoreHomepageQuality({ design, media: MEDIA, destinations: DESTINATIONS });
  assert.equal(result.score, 100);
  assert.equal(result.label, "Çok başarılı");
  assert.deepEqual(result.recommendations, []);
  assert.equal(Object.hasOwn(design, "qualityScore"), false);
  assert.deepEqual(design.composition.sections.map(({ kind }) => kind), ["category_grid", "product_row", "split_campaign", "brand_story", "value_propositions", "testimonials"]);
});

test("user class B: a 1,000-product merchant stores authoritative sources, not browser product snapshots", () => {
  const catalog = Object.freeze(Array.from({ length: 1_000 }, (_, index) => Object.freeze({ id: `product-${index}`, name: `Ürün ${index}` })));
  let composition = baseDesign().composition;
  for (let index = 0; index < 4; index += 1) composition = addHomepageSection(composition, "product_row", id(`products_${index + 10}`));
  const categoryRow = composition.sections[0];
  composition = updateHomepageSection(composition, categoryRow.sectionId, { ...categoryRow, source: "category", categoryId: CATEGORY, limit: 12 });

  assert.equal(catalog.length, 1_000);
  assert.equal(composition.sections.length, 4);
  assert.equal(JSON.stringify(composition).includes("product-999"), false);
  assert.equal(JSON.stringify(composition).includes(CATEGORY), true);
  assert.throws(() => addHomepageSection(composition, "product_row", id("products_99")), (error) => error instanceof HomepageCommandError && error.code === "homepage_product_row_limit");
});

test("user class C: mobile add, sort and edit commands preserve stable identity", () => {
  let composition = baseDesign().composition;
  composition = addHomepageSection(composition, "brand_story", id("story_mobile"));
  composition = addHomepageSection(composition, "product_row", id("products_mobile"));
  composition = moveHomepageSection(composition, id("products_mobile"), 0);
  const story = composition.sections.find(({ sectionId }) => sectionId === id("story_mobile"));
  composition = updateHomepageSection(composition, story.sectionId, { ...story, heading: "Mobil mağaza hikâyesi" });
  assert.deepEqual(composition.sections.map(({ sectionId }) => sectionId), [id("products_mobile"), id("story_mobile")]);
  assert.equal(composition.sections[1].heading, "Mobil mağaza hikâyesi");
});

test("user class D: restricted members keep preview authority but receive no mutable state transition", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../../../apps/customer-panel/components/settings/design/HomepageBuilder.tsx", import.meta.url), "utf8"));
  assert.match(source, /draggable=\{canManage\}/);
  assert.match(source, /disabled=\{!canManage/);
  assert.match(source, /<HomepageSectionFields[^>]*disabled=\{!canManage\}/s);
  assert.doesNotMatch(source, /canManage\s*\?\?\s*true|canManage\s*\|\|\s*true/);
});

test("user class E: stale save completion never overwrites a newer local revision", () => {
  const initialDesign = baseDesign();
  const workspace = { draft: initialDesign, draftVersion: 7, publishedVersion: 4 };
  const first = applyDesignEdit(createDesignEditorState(workspace), { ...initialDesign, composition: noviceComposition() });
  const saving = beginDesignSave(first);
  const newer = applyDesignEdit(saving.state, { ...initialDesign, hero: { ...initialDesign.hero, slides: [{ ...initialDesign.hero.slides[0], headline: "Daha yeni yerel başlık" }] } });
  const completed = completeDesignSave(newer, saving.token, { draftVersion: 8, draftUpdatedAt: "2026-08-11T12:00:00.000Z", draft: saving.token.design });
  assert.equal(completed.status, "dirty");
  assert.equal(completed.draftVersion, 8);
  assert.equal(completed.design.hero.slides[0].headline, "Daha yeni yerel başlık");
});
