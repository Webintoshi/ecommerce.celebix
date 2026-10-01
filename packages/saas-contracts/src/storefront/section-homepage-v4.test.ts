import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultStarterThemeComposition } from "../storefront-design/defaults.ts";
import * as storefront from "./validation.ts";
import * as design from "../storefront-design/validation.ts";

const ID = "40000000-0000-4000-8000-000000000001";
const ID2 = "40000000-0000-4000-8000-000000000002";
const composition = () => ({ ...createDefaultStarterThemeComposition(), schemaVersion: 4, sections: [] });
const slide = () => ({ slideId: "slide_banner_one", enabled: true, headline: "Banner", body: "", desktopImage: { kind: "media", mediaId: ID }, mobileImage: { kind: "asset", assetId: ID2 }, destination: { kind: "path", path: "/products" } });
const banner = () => ({ kind: "banner", sectionId: "home_banner_one", enabled: true, layout: "slider", autoplay: true, presentation: "image_only", slides: [slide()] });
const doc = () => ({ schemaVersion: 4, brand: { logo: null, favicon: null, primaryColor: "#123456", accentColor: "#654321", backgroundColor: "#FFFFFF", textColor: "#111111", fontFamily: "inter" }, hero: { enabled: true, slides: [{ headline: "Old banner", body: "", desktopImage: { kind: "media", mediaId: ID }, mobileImage: null, destination: { kind: "none" }, enabled: true }] }, promotion: { enabled: false, headline: "Offer", body: "", destination: { kind: "none" }, startsAt: null, endsAt: null }, announcement: { enabled: false, items: ["Notice"], icon: "none", speed: "normal", direction: "left", animation: "continuous" }, composition: createDefaultStarterThemeComposition() });

test("v4 accepts 50 independently identified repeated styled sections", () => {
  const sections = Array.from({ length: 50 }, (_, i) => ({ sectionId: `home_story_${i}`, kind: "brand_story", enabled: true, heading: `Story ${i}`, body: "Body", style: { background: "brand", width: "full", spacing: "large" } }));
  const parsed = storefront.parseStarterThemeCompositionConfig({ ...composition(), sections });
  assert.equal(parsed.schemaVersion, 4);
  assert.equal(parsed.sections.length, 50);
  assert.deepEqual((parsed.sections[49] as any).style, sections[49]!.style);
  assert.throws(() => storefront.parseStarterThemeCompositionConfig({ ...composition(), sections: [sections[0], sections[0]] }));
});

test("banner preserves media origins, internal paths and each selected layout", () => {
  for (const layout of ["single", "slider", "stacked"]) {
    const parsed = storefront.parseStarterThemeCompositionConfig({ ...composition(), sections: [{ ...banner(), layout }] });
    assert.deepEqual((parsed.sections[0] as any).slides[0], slide());
  }
  assert.throws(() => storefront.parseStarterThemeCompositionConfig({ ...composition(), sections: [{ ...banner(), slides: [{ ...slide(), destination: { kind: "path", path: "//evil.test" } }] }] }));
  assert.throws(() => storefront.parseStarterThemeCompositionConfig({ ...composition(), sections: [{ ...banner(), slides: [slide(), slide()] }] }));
});
test("v4 preserves real collection banner, footer and ordered menu destinations beside legacy categories", () => {
 const source = {
  ...composition(),
  navigation: { rootCategoryIds: [ID2], rootLinks: [{ kind: "catalog_collection", resourceId: ID }, { kind: "category", resourceId: ID2 }] },
  footer: { ...composition().footer, groups: [{ heading: "Keşfet", links: [{ kind: "catalog_collection", resourceId: ID }] }, ...composition().footer.groups.slice(1)] },
  sections: [{ ...banner(), slides: [{ ...slide(), destination: { kind: "catalog_collection", resourceId: ID } }] }],
 };
 const parsed = storefront.parseStarterThemeCompositionConfig(source);
 if (parsed.schemaVersion !== 4) throw new Error("expected_section_homepage_v4");
 assert.deepEqual(parsed.navigation.rootLinks, source.navigation.rootLinks);
 assert.deepEqual(parsed.footer.groups, source.footer.groups);
 assert.deepEqual((parsed.sections[0] as any).slides[0].destination, { kind: "catalog_collection", resourceId: ID });
 assert.deepEqual(storefront.parseBannerDestination({ kind: "collection", resourceId: ID2 }), { kind: "collection", resourceId: ID2 });
 assert.throws(() => storefront.parseBannerDestination({ kind: "catalog_collection", resourceId: "foreign" }));
});

test("manual rows retain merchant order and reject duplicate or mismatched product IDs", () => {
  const row = { kind: "product_row", sectionId: "home_manual_one", enabled: true, heading: "My products", source: "manual", productIds: [ID2, ID], limit: 4 };
  const parsed = storefront.parseStarterThemeCompositionConfig({ ...composition(), sections: [row] });
  assert.deepEqual((parsed.sections[0] as any).productIds, [ID2, ID]);
  assert.throws(() => storefront.parseStarterThemeCompositionConfig({ ...composition(), sections: [{ ...row, productIds: [ID, ID] }] }));
  assert.throws(() => storefront.parseStarterThemeCompositionConfig({ ...composition(), sections: [{ ...row, source: "latest" }] }));
});

test("v5 normalization retains both hero origins and is idempotent", () => {
  const normalize = (design as any).normalizeStorefrontDesignDocumentV5;
  assert.equal(typeof normalize, "function");
  const legacy = doc();
  const original = { ...legacy, composition: { ...legacy.composition, sections: [{ kind: "hero", sectionId: "home_old_hero", enabled: true, slides: [{ heading: "Overlay", desktopAssetId: ID2, destination: "/products", eyebrow: "Legacy", productId: ID }] }, ...legacy.composition.sections] } };
  const normalized = normalize(original);
  assert.equal(normalized.schemaVersion, 5);
  assert.equal(normalized.hero.enabled, false);
  assert.equal(normalized.composition.schemaVersion, 4);
  assert.equal(normalized.composition.sections[0].presentation, "image_only");
  assert.equal(normalized.composition.sections[1].presentation, "overlay");
  assert.deepEqual(normalized.composition.sections[0].slides[0].desktopImage, { kind: "media", mediaId: ID });
  assert.deepEqual(normalized.composition.sections[1].slides[0].desktopImage, { kind: "asset", assetId: ID2 });
  assert.deepEqual(normalize(normalized), normalized);
});

test("editor workspace and Apply mutation expose editable live v5 and enforce publication coherence", () => {
  const normalize = (design as any).normalizeStorefrontDesignDocumentV5;
  const parseEditor = (design as any).parseStorefrontDesignEditorWorkspace;
  const parseApply = (design as any).parseStorefrontDesignApplyMutation;
  assert.equal(typeof parseEditor, "function");
  assert.equal(typeof parseApply, "function");
  const normalized = normalize(doc());
  const now = "2026-09-30T12:00:00.000Z";
  const editor = { schemaVersion: 1, publishedVersion: 2, publishedAt: now, design: normalized, store: { name: "Atlas", timezone: "Europe/Istanbul" }, media: [{ id: ID, url: "https://media.example.test/image.webp", altText: "Image", mediaType: "image/webp", width: 1200, height: 800, reference: { kind: "media", mediaId: ID } }], destinations: [] };
  assert.deepEqual(parseEditor(editor).design, normalized);
  assert.throws(() => parseEditor({ ...editor, draft: normalized }));
  const published = { schemaVersion: 2, publicationVersion: 2, publishedAt: now, brand: normalized.brand, hero: { enabled: false, slides: [] }, promotion: { ...normalized.promotion, destination: null }, announcement: normalized.announcement, typography: normalized.typography };
  assert.equal(parseApply({ publishedVersion: 2, publishedAt: now, design: normalized, published }).publishedVersion, 2);
  assert.throws(() => parseApply({ publishedVersion: 3, publishedAt: now, design: normalized, published }));
});


test("v5 normalization retains imported brand HTTPS references", () => {
  const original = doc();
  const legacy = { kind: "legacy_https", url: "https://legacy.example.test/logo.webp" };
  const normalized = design.normalizeStorefrontDesignDocumentV5({ ...original, brand: { ...original.brand, logo: legacy }, hero: { ...original.hero, slides: [{ ...original.hero.slides[0], desktopImage: legacy }] } });
  assert.deepEqual(normalized.brand.logo, legacy);
  assert.deepEqual((normalized.composition.sections[0] as any).slides[0].desktopImage, legacy);
  assert.deepEqual(design.normalizeStorefrontDesignDocumentV5(normalized), normalized);
});

test("editor asset choices require their real purpose and media choices omit it", () => {
  const media = { id: ID, url: "https://media.example.test/image.webp", altText: "Image", mediaType: "image/webp", width: 1200, height: 800, reference: { kind: "media", mediaId: ID } };
  const asset = { ...media, id: ID2, reference: { kind: "asset", assetId: ID2 }, assetKind: "category" };
  const editor = { schemaVersion: 1, publishedVersion: 2, publishedAt: "2026-09-30T12:00:00.000Z", design: design.normalizeStorefrontDesignDocumentV5(doc()), store: { name: "Atlas", timezone: "Europe/Istanbul" }, media: [media, asset], destinations: [] };
  const parsed = design.parseStorefrontDesignEditorWorkspace(editor);
  assert.deepEqual(parsed.media, [media, asset]);
  assert.throws(() => design.parseStorefrontDesignEditorWorkspace({ ...editor, media: [{ ...asset, assetKind: undefined }] }));
  const { assetKind: _kind, ...missing } = asset;
  assert.throws(() => design.parseStorefrontDesignEditorWorkspace({ ...editor, media: [missing] }));
  assert.throws(() => design.parseStorefrontDesignEditorWorkspace({ ...editor, media: [{ ...asset, assetKind: "unknown" }] }));
  assert.throws(() => design.parseStorefrontDesignEditorWorkspace({ ...editor, media: [{ ...media, assetKind: "hero" }] }));
});
