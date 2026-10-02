import assert from "node:assert/strict";
import test from "node:test";
import type { PublicProduct, PublicProductMedia, PublicProductVariant } from "@celebix/saas-contracts";
import { sioraColorGroups, sioraHasSameOptions, sioraInitialVariant, sioraNeedsOptionChoice, sioraOptionLabel, sioraVariantForColor, type SioraColorGroup } from "../themes/siora/product-options.ts";

const media = (id: string, sortOrder: number): PublicProductMedia => ({ id, productId: "product", url: `https://media.example/${id}.webp`, mediaType: "image/webp", altText: "Ürün", sortOrder });
const variant = (id: string, attributes: Readonly<Record<string, string>>, mediaIds?: readonly string[], available = true, title = id): PublicProductVariant => ({ id, title, attributes, mediaIds, available, priceCents: 1000, stockTracking: false, stockQuantity: 0 });
const product = (variants: readonly PublicProductVariant[], photos: readonly PublicProductMedia[] = [media("cover", 0), media("blue", 1), media("brown", 2)]): PublicProduct => ({ id: "product", slug: "product", title: "Ürün", currency: "TRY", status: "active", available: true, priceCents: 1000, variants, media: photos });
const group = (variants: readonly PublicProductVariant[]): SioraColorGroup => ({ key: "blue", label: "Mavi", variants, media: undefined });

test("initial choice follows an available variant assigned the canonical cover, then availability and API order", () => {
  const blue = variant("blue", { color: "mavi", size: "M" }, ["blue"]);
  const soldCover = variant("sold", { renk: "siyah" }, ["cover"], false);
  const brown = variant("brown", { colour: "kahve", size: "S" }, ["brown", "cover"]);
  const source = product([blue, soldCover, brown]);
  assert.equal(sioraInitialVariant(source), brown);
  assert.equal(sioraInitialVariant(product([blue, soldCover])), blue);
  assert.equal(sioraInitialVariant(product([soldCover, { ...blue, available: false }])), soldCover);
  assert.equal(sioraInitialVariant(product([])), undefined);
  assert.deepEqual(source.variants.map(({ id }) => id), ["blue", "sold", "brown"]);
});

test("color aliases group real variants, put the initial color first and preserve other groups and variant/media assignment order", () => {
  const source = product([
    variant("blue-small", { Color: "mavi", Size: "Small" }, ["blue"]),
    variant("black", { Renk: "siyah" }, ["cover"], false),
    variant("brown", { colour: "kahve", size: "Medium" }, ["brown", "cover"]),
    variant("blue-medium", { " renk ": "Mavi", Size: "Medıum" }, ["blue", "cover"]),
  ]);
  const groups = sioraColorGroups(source);
  assert.deepEqual(groups.map(({ label }) => label), ["Kahve", "Mavi", "Siyah"]);
  assert.deepEqual(groups[1].variants.map(({ id }) => id), ["blue-small", "blue-medium"]);
  assert.equal(groups[0].media?.id, "brown");
  assert.equal(groups[1].media?.id, "blue");
  assert.deepEqual(source.variants[2].mediaIds, ["brown", "cover"]);
});

test("group thumbnails use the public media resolver including legacy assignment and fallback without inventing photos", () => {
  const legacy = variant("legacy", { color: "MAVI" });
  const cover = media("cover", 0);
  const assigned = { ...media("assigned", 4), variantId: legacy.id };
  assert.equal(sioraColorGroups(product([legacy], [cover, assigned]))[0].media, assigned);
  assert.equal(sioraColorGroups(product([variant("missing", { renk: "kahve" }, ["missing-id"])], [assigned, cover]))[0].media, cover);
  assert.equal(sioraColorGroups(product([legacy], []))[0].media, undefined);
});

test("option labels omit every color alias and normalize named sizes only for display", () => {
  const medium = variant("medium-id", { colour: "Kahve", Size: "Medıum", fabric: "Denim" });
  assert.equal(sioraOptionLabel(medium), "M / Denim");
  assert.equal(sioraOptionLabel(variant("small", { Renk: "Mavi", beden: "Small" })), "S");
  assert.equal(sioraOptionLabel(variant("large", { Color: "Mavi", beden: "Large" })), "L");
  assert.deepEqual(medium.attributes, { colour: "Kahve", Size: "Medıum", fabric: "Denim" });
  assert.equal(sioraOptionLabel(variant("fallback", {}, undefined, true, "Tam başlık / XL")), "Tam başlık / XL");
  assert.equal(sioraOptionLabel(variant("color-only", { color: "Kahve" }, undefined, true, "Varsayılan")), "Varsayılan");
});

test("changing colors keeps the exact available non-color options, then falls back to first available/first", () => {
  const prior = variant("brown-medium", { Renk: "Kahve", size: "Medıum", fabric: "Denim" });
  const small = variant("blue-small", { color: "Mavi", size: "Small", fabric: "Denim" });
  const sold = variant("blue-sold", { color: "Mavi", size: "Medıum", fabric: "Denim" }, undefined, false);
  const matching = variant("blue-medium", { colour: "Mavi", Fabric: "Denim", Size: "Medıum" });
  assert.equal(sioraVariantForColor(group([small, sold, matching]), prior), matching);
  assert.equal(sioraVariantForColor(group([sold, small]), prior), small);
  assert.equal(sioraVariantForColor(group([sold]), prior), sold);
  assert.equal(sioraVariantForColor(group([]), prior), undefined);
  assert.equal(sioraVariantForColor(group([small, variant("abbreviation", { color: "Mavi", size: "M", fabric: "Denim" })]), prior), small, "display abbreviations do not rewrite stored option identity");
});

test("default and single color-only variants need no option selector; meaningful options and multiple variants do", () => {
  assert.equal(sioraNeedsOptionChoice(group([variant("default", {}, undefined, true, "Varsayılan")])), false);
  assert.equal(sioraNeedsOptionChoice(group([variant("color", { Colour: "Mavi" })])), false);
  assert.equal(sioraNeedsOptionChoice(group([variant("single-xl", {}, undefined, true, "XL")])), true);
  assert.equal(sioraNeedsOptionChoice(group([variant("size", { color: "Mavi", size: "Small" })])), true);
  assert.equal(sioraNeedsOptionChoice(group([variant("one", {}), variant("two", {})])), true);
  assert.deepEqual(sioraColorGroups(product([variant("default", {})])).map(({ key, label }) => ({ key, label })), [{ key: "__default__", label: "" }]);
});

test("seller MAVI is displayed as Mavi while raw color values and keys remain unchanged", () => {
  const source = variant("blue", { color: "MAVI" });
  const [color] = sioraColorGroups(product([source]));
  assert.equal(color.label, "Mavi");
  assert.equal(color.key, "mavı");
  assert.equal(source.attributes.color, "MAVI");
});

test("exact option comparison excludes color aliases but keeps raw size identity", () => {
  const small = variant("small", { color: "Kahve", size: "Small" });
  assert.equal(sioraHasSameOptions(small, variant("blue-small", { Renk: "MAVI", Size: "Small" })), true);
  assert.equal(sioraHasSameOptions(small, variant("blue-s", { colour: "MAVI", size: "S" })), false);
});
