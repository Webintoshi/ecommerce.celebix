import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultStarterThemeComposition,
  type HomepageSectionId,
  type StarterThemeCompositionConfigV3,
  type StarterThemeSectionConfigV3,
} from "@celebix/saas-contracts";

import {
  addHomepageSection,
  duplicateHomepageSection,
  HomepageCommandError,
  moveHomepageSection,
  removeHomepageSection,
  restoreRemovedHomepageSection,
  setHomepageSectionVisibility,
  updateHomepageSection,
} from "./homepage-command-model.ts";

const id = (value: string) => `home_${value}` as HomepageSectionId;

function composition(): StarterThemeCompositionConfigV3 {
  return createDefaultStarterThemeComposition();
}

function expectCode(run: () => unknown, code: string): void {
  assert.throws(run, (error) => error instanceof HomepageCommandError && error.code === code && error.message === code);
}

test("adds every editable body-section kind at a requested position with frozen safe defaults", () => {
  let next = { ...composition(), sections: Object.freeze([]) } as StarterThemeCompositionConfigV3;
  const kinds = ["category_grid", "product_row", "split_campaign", "brand_story", "value_propositions", "testimonials"] as const;
  kinds.forEach((kind, index) => {
    next = addHomepageSection(next, kind, id(`section_${index + 10}`), index);
  });

  assert.deepEqual(next.sections.map(({ kind }) => kind), kinds);
  assert.equal(Object.isFrozen(next), true);
  assert.equal(Object.isFrozen(next.sections), true);
  assert.equal(Object.isFrozen(next.sections[0]), true);
  assert.deepEqual(next.sections[0], {
    kind: "category_grid",
    sectionId: "home_section_10",
    enabled: true,
    heading: "Kategorileri keşfedin",
    categoryIds: [],
    layout: "grid",
  });
  assert.deepEqual(next.sections[2], {
    kind: "split_campaign",
    sectionId: "home_section_12",
    enabled: true,
    panels: [],
  });
});

test("duplicates only repeatable product rows and keeps both sections independent", () => {
  const original = addHomepageSection(composition(), "product_row", id("products_10"));
  const duplicated = duplicateHomepageSection(original, id("products_10"), id("products_11"));

  assert.deepEqual(duplicated.sections.map(({ sectionId }) => sectionId), ["home_product_row_1", "home_products_10", "home_products_11"]);
  assert.notEqual(duplicated.sections[1], duplicated.sections[2]);
  expectCode(() => duplicateHomepageSection(addHomepageSection(composition(), "brand_story", id("story_100")), id("story_100"), id("story_101")), "homepage_section_not_repeatable");
});

test("moves, updates and changes visibility without mutating previous compositions", () => {
  const first = addHomepageSection(composition(), "brand_story", id("story_100"));
  const second = addHomepageSection(first, "testimonials", id("reviews_10"));
  const moved = moveHomepageSection(second, id("reviews_10"), 0);
  const story = moved.sections.find((section) => section.sectionId === id("story_100")) as Extract<StarterThemeSectionConfigV3, { kind: "brand_story" }>;
  const updated = updateHomepageSection(moved, story.sectionId, { ...story, heading: "Bizim hikâyemiz" });
  const hidden = setHomepageSectionVisibility(updated, id("reviews_10"), false);

  assert.deepEqual(second.sections.map(({ sectionId }) => sectionId), ["home_product_row_1", "home_story_100", "home_reviews_10"]);
  assert.deepEqual(moved.sections.map(({ sectionId }) => sectionId), ["home_reviews_10", "home_product_row_1", "home_story_100"]);
  assert.equal((updated.sections[2] as Extract<StarterThemeSectionConfigV3, { kind: "brand_story" }>).heading, "Bizim hikâyemiz");
  assert.equal(hidden.sections[0]?.enabled, false);
  assert.equal(moved.sections[0]?.enabled, true);
});

test("remove returns one-level undo and restore returns the exact frozen previous composition", () => {
  const before = addHomepageSection(composition(), "brand_story", id("story_100"));
  const result = removeHomepageSection(before, id("story_100"));

  assert.equal(result.undo.label, "Bölümü geri getir");
  assert.equal(result.composition.sections.some(({ sectionId }) => sectionId === id("story_100")), false);
  assert.deepEqual(restoreRemovedHomepageSection(result.undo), before);
  assert.equal(Object.isFrozen(result.undo), true);
});

test("rejects unknown IDs, duplicate IDs, kind replacement, fixed hero and invalid positions with stable safe codes", () => {
  const base = composition();
  expectCode(() => addHomepageSection(base, "hero", id("hero_100")), "homepage_section_kind_fixed");
  expectCode(() => addHomepageSection(base, "product_row", id("product_row_1")), "homepage_section_id_duplicate");
  expectCode(() => moveHomepageSection(base, id("missing_10"), 0), "homepage_section_not_found");
  expectCode(() => moveHomepageSection(base, id("product_row_1"), 4), "homepage_section_index_invalid");
  expectCode(() => removeHomepageSection(base, id("missing_10")), "homepage_section_not_found");
  const replacement = addHomepageSection(base, "brand_story", id("story_100")).sections.at(-1)!;
  expectCode(() => updateHomepageSection(base, id("product_row_1"), replacement), "homepage_section_kind_mismatch");
});

test("enforces singleton, four product-row and twelve-section limits", () => {
  const withStory = addHomepageSection(composition(), "brand_story", id("story_100"));
  expectCode(() => addHomepageSection(withStory, "brand_story", id("story_101")), "homepage_section_singleton_exists");

  let fourRows = composition();
  for (let index = 2; index <= 4; index += 1) fourRows = addHomepageSection(fourRows, "product_row", id(`products_${index}0`));
  expectCode(() => addHomepageSection(fourRows, "product_row", id("products_50")), "homepage_product_row_limit");

  const repeatable = fourRows.sections.find(({ kind }) => kind === "product_row")!;
  let full: StarterThemeCompositionConfigV3 = { ...fourRows, sections: Object.freeze(Array.from({ length: 12 }, (_, index) => ({ ...repeatable, sectionId: id(`full_${index + 10}`) }))) };
  expectCode(() => addHomepageSection(full, "testimonials", id("reviews_10")), "homepage_section_total_limit");
});
