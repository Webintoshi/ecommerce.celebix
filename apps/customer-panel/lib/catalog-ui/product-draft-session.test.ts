import assert from "node:assert/strict";
import test from "node:test";

import {
  commitProductDraft,
  createEmptyProductDraftSession,
  mergeQuickProductDraft,
  productDraftIsDirty,
  quickDraftRequiresDetailedSave,
  replaceProductDraft,
  updateProductDraft,
  type ProductDraft,
  type ProductDraftVariant,
} from "./product-draft-session.ts";

test("optional measurements survive quick-detailed handoff, remain independently frozen and can be cleared", () => {
  const empty = createEmptyProductDraftSession();
  const projection = { title: "", sku: "", barcode: "", price: "", stockQuantity: "", categoryId: "", media: [] };
  const blank = mergeQuickProductDraft(empty, { ...projection, measurements: {} });
  assert.equal(productDraftIsDirty(blank), false, "mounting old empty drafts does not invent measurements");
  const values = { weight: "14,89", weightUnit: "g", depth: "4.5" };
  const filled = mergeQuickProductDraft(empty, { ...projection, measurements: values });
  values.weight = "99";
  assert.equal(filled.current.variants[0]?.measurements?.weight, "14,89");
  assert.equal(Object.isFrozen(filled.current.variants[0]?.measurements), true);
  assert.equal(quickDraftRequiresDetailedSave(filled.current), false, "quick create now saves measurement metadata");
  const unrelated = mergeQuickProductDraft(filled, { ...projection, title: "Bilezik" });
  assert.deepEqual(unrelated.current.variants[0]?.measurements, { weight: "14,89", weightUnit: "g", depth: "4.5" });
  const cleared = mergeQuickProductDraft(unrelated, { ...projection, title: "Bilezik", measurements: {} });
  assert.deepEqual(cleared.current.variants[0]?.measurements, {});
});

test("quick fields and the exact selected File survive the advanced-mode handoff", () => {
  const image = new File([new Uint8Array([1, 2, 3])], "atlas.webp", { type: "image/webp" });
  const session = mergeQuickProductDraft(createEmptyProductDraftSession(), {
    title: "Atlas Kolye",
    sku: "RSA-001",
    barcode: "9800000000007",
    price: "12.500,00",
    stockQuantity: "7",
    categoryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    media: [{ file: image, altText: "Altın kolye", preview: "blob:atlas" }],
  });

  assert.equal(session.current.title, "Atlas Kolye");
  assert.equal(session.current.variants[0]?.price, "12.500,00");
  assert.equal(session.current.variants[0]?.sku, "RSA-001");
  assert.equal(session.current.variants[0]?.barcode, "9800000000007");
  assert.equal(session.current.variants[0]?.stockQuantity, "7");
  assert.deepEqual(session.current.categoryIds, ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);
  assert.equal(session.current.media[0]?.file, image);
  assert.equal(session.current.media[0]?.altText, "Altın kolye");
  assert.equal(Object.isFrozen(session.current), true);
  assert.equal(Object.isFrozen(session.current.variants), true);
  assert.equal(Object.isFrozen(session.current.media), true);
});

test("a simple quick barcode edit is retained and can be explicitly cleared", () => {
  const quick = { title: "Atlas", sku: "RSA-001", price: "100,00", stockQuantity: "2", categoryId: "", media: [] };
  const reserved = mergeQuickProductDraft(createEmptyProductDraftSession(), { ...quick, barcode: "9800000000007" });
  const untouched = mergeQuickProductDraft(reserved, quick);
  assert.equal(untouched.current.variants[0]?.barcode, "9800000000007");
  const cleared = mergeQuickProductDraft(untouched, { ...quick, barcode: "" });
  assert.equal(cleared.current.variants[0]?.barcode, "");
  assert.equal(productDraftIsDirty(cleared), true);
});

test("quick-mode projection keeps complete variant identities and multiple categories", () => {
  const base = createEmptyProductDraftSession();
  const variants = [
    { ...base.current.variants[0]!, title: "Siyah / S", sku: "RSA-S", barcode: "9800000000007", price: "100,00", stockQuantity: "2", attributes: { Renk: "Siyah", Beden: "S" } },
    { ...base.current.variants[0]!, title: "Siyah / M", sku: "RSA-M", barcode: "9800000000014", price: "110,00", stockQuantity: "3", attributes: { Renk: "Siyah", Beden: "M" } },
  ];
  const categoryIds = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"];
  const advanced = updateProductDraft(base, { kind: "variant", variants, categoryIds, description: "Yerel açıklama", seoTitle: "SEO başlığı" });
  const quick = mergeQuickProductDraft(advanced, {
    title: "Yeni ürün adı", sku: "", barcode: "", price: "", stockQuantity: "", categoryId: "", media: [],
  });
  assert.deepEqual(quick.current.variants, advanced.current.variants);
  assert.deepEqual(quick.current.categoryIds, categoryIds);
  assert.equal(quick.current.description, "Yerel açıklama");
  assert.equal(quick.current.seoTitle, "SEO başlığı");
  assert.equal(quick.current.title, "Yeni ürün adı");
  assert.deepEqual(advanced.current.variants, variants);
});

test("one remaining attribute variant is not rewritten as a simple quick product", () => {
  const base = createEmptyProductDraftSession();
  const advanced = updateProductDraft(base, {
    variants: [{ ...base.current.variants[0]!, title: "Siyah", barcode: "9800000000007", attributes: { Renk: "Siyah" } }],
  });
  const quick = mergeQuickProductDraft(advanced, {
    title: "Atlas", sku: "", barcode: "", price: "", stockQuantity: "", categoryId: "", media: [],
  });
  assert.deepEqual(quick.current.variants, advanced.current.variants);
});

test("quick-only saves are blocked whenever detailed fields would be discarded", () => {
  const base = createEmptyProductDraftSession().current;
  const richPatches: readonly Partial<ProductDraft>[] = [
    { kind: "variant" }, { variants: [] }, { variants: [base.variants[0]!, base.variants[0]!] },
    { productType: "digital" }, { description: "Ürün açıklaması" }, { brandId: "brand-id" },
    { collectionIds: ["collection-id"] }, { tagIds: ["tag-id"] },
    { resourceAttributeIds: ["attribute-id"] }, { resourceExtraIds: ["extra-id"] }, { resourceDefinitionIds: ["definition-id"] },
    { supplierName: "Tedarikçi" }, { minimumOrderQuantity: "2" }, { maximumOrderQuantity: "10" },
    { googleProductCategoryId: "1604" }, { seoTitle: "SEO başlığı" }, { seoDescription: "SEO açıklaması" },
    { categoryIds: ["category-a", "category-b"] },
  ];
  for (const patch of richPatches) {
    assert.equal(quickDraftRequiresDetailedSave({ ...base, ...patch }), true, JSON.stringify(patch));
  }
  const variantPatches: readonly Partial<ProductDraftVariant>[] = [
    { attributes: { Renk: "Siyah" } }, { compareAt: "120,00" }, { cost: "80,00" },
    { shippingDesi: "1,50" }, { hsCode: "1234" }, { continueSellingWhenOutOfStock: true },
  ];
  for (const patch of variantPatches) {
    assert.equal(quickDraftRequiresDetailedSave({ ...base, variants: [{ ...base.variants[0]!, ...patch }] }), true, JSON.stringify(patch));
  }
});

test("quick core fields, optional barcode and default advanced values remain quick-save compatible", () => {
  const session = mergeQuickProductDraft(createEmptyProductDraftSession(), {
    title: "Atlas", sku: "RSA-001", barcode: "9800000000007", price: "100,00", stockQuantity: "2", categoryId: "category-a", media: [],
  });
  assert.equal(quickDraftRequiresDetailedSave(session.current), false);
  assert.equal(quickDraftRequiresDetailedSave({ ...session.current, minimumOrderQuantity: "1", channelIds: ["storefront-id"] }, ["storefront-id"]), false);
});

test("quick-only saves distinguish default channels from explicit channel changes", () => {
  const base = createEmptyProductDraftSession().current;
  const defaults = ["storefront-a", "storefront-b"];
  assert.equal(quickDraftRequiresDetailedSave(base, defaults), false);
  assert.equal(quickDraftRequiresDetailedSave({ ...base, channelIds: ["storefront-b", "storefront-a"] }, defaults), false);
  assert.equal(quickDraftRequiresDetailedSave({ ...base, channelIds: ["storefront-a"] }, defaults), true);
  assert.equal(quickDraftRequiresDetailedSave({ ...base, channelIds: ["marketplace-a"] }, defaults), true);
  assert.equal(quickDraftRequiresDetailedSave({ ...base, channelIds: defaults }), true);
  assert.equal(quickDraftRequiresDetailedSave({ ...base, channelIds: [], channelSelectionTouched: true }, defaults), true);
  assert.equal(quickDraftRequiresDetailedSave({ ...base, channelIds: defaults, channelSelectionTouched: true }, defaults), true);
});

test("a channel change marker survives quick handoff while an untouched marker does not dirty the draft", () => {
  const base = createEmptyProductDraftSession();
  const untouched = updateProductDraft(base, { channelSelectionTouched: false });
  assert.equal(Object.hasOwn(untouched.current, "channelSelectionTouched"), false);
  assert.equal(productDraftIsDirty(untouched), false);
  const selected = updateProductDraft(base, { channelSelectionTouched: true, channelIds: [] });
  const quick = mergeQuickProductDraft(selected, {
    title: "Atlas", sku: "", barcode: "", price: "", stockQuantity: "", categoryId: "", media: [],
  });
  assert.equal(quick.current.channelSelectionTouched, true);
  assert.equal(quickDraftRequiresDetailedSave(quick.current, ["storefront-id"]), true);
});

test("standard barcode backup survives quick-mode projection and is independently frozen", () => {
  const base = createEmptyProductDraftSession();
  const standardVariant = { ...base.current.variants[0]!, sku: "RSA-001", barcode: "9800000000007", price: "100,00", stockQuantity: "2" };
  const advanced = updateProductDraft(base, {
    kind: "variant", standardVariant,
    variants: [{ ...standardVariant, title: "Siyah", sku: "RSA-S", barcode: "9800000000014", attributes: { Renk: "Siyah" } }],
  });
  const quick = mergeQuickProductDraft(advanced, {
    title: "Atlas", sku: "", barcode: "", price: "", stockQuantity: "", categoryId: "", media: [],
  });
  assert.deepEqual(quick.current.standardVariant, standardVariant);
  assert.notEqual(quick.current.standardVariant, standardVariant);
  assert.equal(Object.isFrozen(quick.current.standardVariant), true);
  assert.equal(Object.isFrozen(quick.current.standardVariant?.attributes), true);
  assert.equal(quick.current.variants[0]?.barcode, "9800000000014");
});

test("restoring the standard option clears its temporary backup without a false dirty change", () => {
  const base = createEmptyProductDraftSession();
  const expanded = updateProductDraft(base, {
    kind: "variant", standardVariant: base.current.variants[0]!,
    variants: [{ ...base.current.variants[0]!, title: "Siyah", attributes: { Renk: "Siyah" } }],
  });
  const restored = updateProductDraft(expanded, {
    kind: "simple", variants: [expanded.current.standardVariant!], standardVariant: undefined,
  });
  assert.equal(Object.hasOwn(restored.current, "standardVariant"), false);
  assert.equal(productDraftIsDirty(restored), false);
});

test("nested variant and media edits independently make a draft dirty", () => {
  const image = new File(["atlas"], "atlas.png", { type: "image/png" });
  const selected = mergeQuickProductDraft(createEmptyProductDraftSession(), {
    title: "Atlas",
    sku: "",
    price: "100,00",
    stockQuantity: "1",
    categoryId: "",
    media: [{ file: image, altText: "", preview: "blob:atlas" }],
  });
  const committed = commitProductDraft(selected);

  assert.equal(productDraftIsDirty(committed), false);
  assert.equal(productDraftIsDirty(updateProductDraft(committed, {
    variants: [{ ...committed.current.variants[0]!, stockQuantity: "2" }],
  })), true);
  assert.equal(productDraftIsDirty(updateProductDraft(committed, {
    media: [{ ...committed.current.media[0]!, altText: "Yeni alt metin" }],
  })), true);
});

test("explicit server replacement resets the baseline without mutating the local conflict draft", () => {
  const local = updateProductDraft(createEmptyProductDraftSession(), { title: "Yerel taslak" });
  const localSnapshot = local.current;
  const replaced = replaceProductDraft(local, { ...local.current, title: "Sunucu sürümü" });

  assert.equal(local.current, localSnapshot);
  assert.equal(local.current.title, "Yerel taslak");
  assert.equal(replaced.current.title, "Sunucu sürümü");
  assert.equal(replaced.initial.title, "Sunucu sürümü");
  assert.equal(productDraftIsDirty(replaced), false);
});
