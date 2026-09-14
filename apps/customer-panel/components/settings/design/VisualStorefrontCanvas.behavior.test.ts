import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createDefaultStarterThemeComposition,
  type StarterThemeCompositionConfigV3,
  type StorefrontDesignDestinationOption,
  type StorefrontDesignDocument,
  type StorefrontDesignMediaOption,
} from "@celebix/saas-contracts";
import { Window } from "happy-dom";
import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { createPreviewStorefrontDesign, isStorefrontPromotionActive } from "../../../../../packages/storefront-design-ui/src/model.ts";
import { createStorefrontTypographyResources } from "../../../../../packages/storefront-design-ui/src/typography.ts";
import { starterThemeCategoryPlaceholderLabels } from "../../../lib/starter-theme-composer-model.ts";

const require = createRequire(import.meta.url);
const styles = new Proxy({}, { get: (_target, key) => String(key) });
const CATEGORY = "50000000-0000-4000-8000-000000000001";
const PAGE = "50000000-0000-4000-8000-000000000002";
const DESIGN_HERO_MEDIA = "50000000-0000-4000-8000-000000000003";
const COMPOSITION_DESKTOP_MEDIA = "50000000-0000-4000-8000-000000000004";
const COMPOSITION_MOBILE_MEDIA = "50000000-0000-4000-8000-000000000005";
const NOW = "2026-09-14T09:00:00.000Z";
const MEDIA = Object.freeze([Object.freeze({
  id: DESIGN_HERO_MEDIA,
  url: "https://cdn.example/design-hero.webp",
  altText: "Design hero",
  mediaType: "image/webp",
  width: 1600,
  height: 900,
})] satisfies readonly StorefrontDesignMediaOption[]);
const DESTINATIONS = Object.freeze([
  Object.freeze({ kind: "collection", resourceId: CATEGORY, label: "Fixture Category", path: "/collections/fixture" }),
  Object.freeze({ kind: "page", resourceId: PAGE, label: "Fixture Page", path: "/pages/fixture" }),
] satisfies readonly StorefrontDesignDestinationOption[]);

const BASE_DESIGN: StorefrontDesignDocument = Object.freeze({
  schemaVersion: 3,
  brand: Object.freeze({ logo: null, favicon: null, primaryColor: "#123456", accentColor: "#654321", backgroundColor: "#FAFAF0", textColor: "#121212", fontFamily: "playfair" }),
  typography: Object.freeze({
    headingFont: Object.freeze({ family: "Playfair Display", category: "serif", availableWeights: Object.freeze(["400", "700"] as const), source: "google" }),
    bodyFont: Object.freeze({ family: "Inter", category: "sans-serif", availableWeights: Object.freeze(["400", "500"] as const), source: "google" }),
    headingWeight: "700",
    bodyWeight: "400",
    headingSizePx: 46,
    bodySizePx: 17,
  }),
  hero: Object.freeze({ enabled: false, slides: Object.freeze([Object.freeze({ headline: "Fixture banner", body: "", desktopImage: null, mobileImage: null, destination: Object.freeze({ kind: "none" }), enabled: true })]) }),
  promotion: Object.freeze({ headline: "Fixture promotion", body: "", destination: Object.freeze({ kind: "none" }), startsAt: null, endsAt: null, enabled: false }),
  announcement: Object.freeze({ items: Object.freeze(["Fixture"]), icon: "none", speed: "normal", direction: "left", animation: "continuous", enabled: false }),
  composition: createDefaultStarterThemeComposition(),
});

type CanvasModule = Readonly<{ VisualStorefrontCanvas: (props: Readonly<Record<string, unknown>>) => ReactNode }>;
type PreviewModule = Readonly<{ StarterThemePreview: (props: Readonly<Record<string, unknown>>) => ReactNode }>;

function compileRenderer(): Readonly<{ StorefrontDesignRenderer: (props: Readonly<Record<string, unknown>>) => ReactNode }> {
  const filename = new URL("../../../../../packages/storefront-design-ui/src/StorefrontDesignRenderer.tsx", import.meta.url);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const load = (id: string): unknown => {
    if (id === "./model.ts") return { isStorefrontPromotionActive };
    if (id === "./typography.ts") return { createStorefrontTypographyResources };
    return require(id);
  };
  new Function("require", "module", "exports", output)(load, module, module.exports);
  return module.exports as Readonly<{ StorefrontDesignRenderer: (props: Readonly<Record<string, unknown>>) => ReactNode }>;
}

function compileScaffolds(): Readonly<{
  CategoryPlaceholderCards: (props: Readonly<Record<string, unknown>>) => ReactNode;
  ProductCards: (props: Readonly<Record<string, unknown>>) => ReactNode;
}> {
  const filename = new URL("../StarterThemePreviewScaffolds.tsx", import.meta.url);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const load = (id: string): unknown => id.endsWith(".css") ? { __esModule: true, default: styles } : require(id);
  new Function("require", "module", "exports", output)(load, module, module.exports);
  return module.exports as Readonly<{
    CategoryPlaceholderCards: (props: Readonly<Record<string, unknown>>) => ReactNode;
    ProductCards: (props: Readonly<Record<string, unknown>>) => ReactNode;
  }>;
}

function compileCanvas(): CanvasModule {
  const filename = new URL("./VisualStorefrontCanvas.tsx", import.meta.url);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const load = (id: string): unknown => {
    if (id.endsWith(".css")) return { __esModule: true, default: styles };
    if (id === "@celebix/storefront-design-ui") return { ...compileRenderer(), createPreviewStorefrontDesign };
    if (id === "../StarterThemePreviewScaffolds") return compileScaffolds();
    if (id === "../starter-footer-options") return {
      STARTER_FOOTER_POLICIES: Object.freeze([["kvkk", "KVKK"]]),
      STARTER_FOOTER_SYSTEM_LINKS: Object.freeze([["/favorites", "Favoriler"]]),
    };
    return require(id);
  };
  new Function("require", "module", "exports", output)(load, module, module.exports);
  return module.exports as CanvasModule;
}

function compilePreview(): PreviewModule {
  const filename = new URL("../StarterThemePreview.tsx", import.meta.url);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const load = (id: string): unknown => {
    if (id.endsWith(".css")) return { __esModule: true, default: styles };
    if (id === "./StarterThemePreviewScaffolds") return compileScaffolds();
    if (id === "@/lib/starter-theme-composer-model") return { starterThemeCategoryPlaceholderLabels };
    return require(id);
  };
  new Function("require", "module", "exports", output)(load, module, module.exports);
  return module.exports as PreviewModule;
}

function renderCanvas(
  design: StorefrontDesignDocument,
  options: Readonly<{
    media?: readonly StorefrontDesignMediaOption[];
    destinations?: readonly StorefrontDesignDestinationOption[];
  }> = {},
): string {
  const { VisualStorefrontCanvas } = compileCanvas();
  return renderToStaticMarkup(React.createElement(VisualStorefrontCanvas, {
    design,
    storeName: "Fixture Store",
    publishedVersion: 7,
    publishedAt: NOW,
    media: options.media ?? [],
    destinations: options.destinations ?? [],
    mode: "desktop",
    now: new Date(NOW),
    onSelectSurface: () => undefined,
  }));
}

function composition(sections: StarterThemeCompositionConfigV3["sections"]): StarterThemeCompositionConfigV3 {
  const defaults = createDefaultStarterThemeComposition();
  return Object.freeze({
    ...defaults,
    sections,
    footer: Object.freeze({
      tone: "light",
      groups: Object.freeze([
        Object.freeze({ heading: "CUSTOM_HELP", links: Object.freeze([
          Object.freeze({ kind: "system", destination: "/favorites" }),
          Object.freeze({ kind: "category", categoryId: CATEGORY }),
          Object.freeze({ kind: "page", pageId: PAGE }),
        ]) }),
        Object.freeze({ heading: "CUSTOM_LEGAL", links: Object.freeze([Object.freeze({ kind: "fixed_policy", policyKey: "kvkk" })]) }),
      ]),
      newsletter: Object.freeze({ enabled: true, heading: "CUSTOM_NEWSLETTER", body: "CUSTOM_NEWSLETTER_BODY", consentLabel: "CUSTOM_CONSENT" }),
      social: Object.freeze([Object.freeze({ network: "instagram", url: "https://instagram.com/fixture" })]),
    }),
  });
}

test("draft canvas renders every enabled homepage section in the configured order", () => {
  const ordered = Object.freeze([
    Object.freeze({ sectionId: "home_first_products", kind: "product_row", enabled: true, heading: "FIRST_PRODUCTS", source: "latest", limit: 4 }),
    Object.freeze({ sectionId: "home_hidden_story", kind: "brand_story", enabled: false, heading: "HIDDEN_STORY", body: "Not visible" }),
    Object.freeze({ sectionId: "home_second_categories", kind: "category_grid", enabled: true, heading: "SECOND_CATEGORIES", categoryIds: Object.freeze([CATEGORY]), layout: "grid" }),
    Object.freeze({ sectionId: "home_third_products", kind: "product_row", enabled: true, heading: "THIRD_PRODUCTS", source: "sale", limit: 8 }),
  ] satisfies StarterThemeCompositionConfigV3["sections"]);

  const markup = renderCanvas({ ...BASE_DESIGN, composition: composition(ordered) });
  const visibleHeadings = ["FIRST_PRODUCTS", "SECOND_CATEGORIES", "THIRD_PRODUCTS"] as const;
  assert.deepEqual(visibleHeadings.map((heading) => markup.includes(heading)), [true, true, true]);
  assert.ok(markup.indexOf(visibleHeadings[0]) < markup.indexOf(visibleHeadings[1]));
  assert.ok(markup.indexOf(visibleHeadings[1]) < markup.indexOf(visibleHeadings[2]));
  assert.equal((markup.match(/data-preview-section-kind="product_row"/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /HIDDEN_STORY/);
  assert.doesNotMatch(markup, /Katalog yer tutucusu|Aktif katalog/);
  assert.match(markup, /data-preview-content="example"/);
  assert.match(markup, /yayın vitrini katalog projeksiyonu/);
});

test("product-row scaffolds render the exact count requested by each row contract", () => {
  const rows = Object.freeze([
    Object.freeze({ sectionId: "home_products_four", kind: "product_row", enabled: true, heading: "FOUR_PRODUCTS", source: "latest", limit: 4 }),
    Object.freeze({ sectionId: "home_products_eight", kind: "product_row", enabled: true, heading: "EIGHT_PRODUCTS", source: "sale", limit: 8 }),
    Object.freeze({ sectionId: "home_products_twelve", kind: "product_row", enabled: true, heading: "TWELVE_PRODUCTS", source: "latest", limit: 12 }),
  ] satisfies StarterThemeCompositionConfigV3["sections"]);
  const markup = renderCanvas({ ...BASE_DESIGN, composition: composition(rows) });

  for (const [index, expectedCount] of [4, 8, 12].entries()) {
    const rowStart = markup.indexOf(`data-preview-section-id="${rows[index].sectionId}"`);
    const start = markup.indexOf('aria-label="Ürün sırası önizlemesi"', rowStart);
    const end = markup.indexOf("</section>", start);
    const rowMarkup = markup.slice(start, end);
    assert.equal((rowMarkup.match(/<article/g) ?? []).length, expectedCount);
  }
});

test("mobile canvas keeps the third product card visible at narrow and wide outer viewports", async () => {
  const designCss = readFileSync(new URL("../design-settings.module.css", import.meta.url), "utf8");
  const sharedPreviewCss = readFileSync(new URL("../starter-theme-preview.module.css", import.meta.url), "utf8");

  for (const outerWidth of [390, 1440]) {
    const window = new Window({ width: outerWidth, height: 844 });
    try {
      const style = window.document.createElement("style");
      style.textContent = `${designCss}\n${sharedPreviewCss}`;
      window.document.head.append(style);
      const viewport = window.document.createElement("div");
      viewport.className = "previewViewport";
      viewport.dataset.mode = "mobile";
      const grid = window.document.createElement("div");
      grid.className = "previewProducts canvasProductGrid";
      for (let index = 0; index < 4; index += 1) grid.append(window.document.createElement("article"));
      viewport.append(grid);
      window.document.body.append(viewport);

      assert.equal(window.innerWidth, outerWidth);
      assert.equal(window.getComputedStyle(grid.children[2]!).display, "grid", `outer ${outerWidth}, mobile 390 canvas`);
    } finally {
      await window.happyDOM.close();
    }
  }
});

test("legacy composer preview keeps its established three-card cap", () => {
  const { StarterThemePreview } = compilePreview();
  const productRow = Object.freeze({
    sectionId: "home_legacy_preview_products",
    kind: "product_row",
    enabled: true,
    heading: "LEGACY_PRODUCTS",
    source: "latest",
    limit: 12,
  }) satisfies StarterThemeCompositionConfigV3["sections"][number];
  for (const productTitles of [
    Object.freeze(["PRODUCT_ONE", "PRODUCT_TWO", "PRODUCT_THREE", "PRODUCT_FOUR"]),
    Object.freeze([]),
  ]) {
    const markup = renderToStaticMarkup(React.createElement(StarterThemePreview, {
      composition: composition(Object.freeze([productRow])),
      productTitles,
      storefrontHostname: null,
    }));
    const start = markup.indexOf('aria-label="Ürün sırası önizlemesi"');
    const end = markup.indexOf("</section>", start);
    const productMarkup = markup.slice(start, end);

    assert.equal((productMarkup.match(/<article/g) ?? []).length, 3);
    assert.doesNotMatch(productMarkup, /PRODUCT_FOUR|Örnek ürün 4/);
  }
});

test("an intentionally empty homepage stays empty instead of fabricating catalog sections", () => {
  const markup = renderCanvas({ ...BASE_DESIGN, composition: composition(Object.freeze([])) });
  assert.match(markup, /data-empty-home="true"/);
  assert.equal((markup.match(/data-preview-section-kind=/g) ?? []).length, 0);
  assert.doesNotMatch(markup, /Örnek kategori|Kategorileri keşfedin|Öne çıkan ürünler/);
});

test("V3 footer links, social URLs, and selected brand typography survive in the draft preview", () => {
  const markup = renderCanvas({ ...BASE_DESIGN, composition: composition(Object.freeze([])) }, { destinations: DESTINATIONS });
  for (const text of ["CUSTOM_HELP", "CUSTOM_LEGAL", "CUSTOM_NEWSLETTER", "CUSTOM_NEWSLETTER_BODY", "Favoriler", "Fixture Category", "/collections/fixture", "Fixture Page", "/pages/fixture", "KVKK", "instagram", "https://instagram.com/fixture"]) assert.match(markup, new RegExp(text));
  assert.match(markup, /data-tone="light"/);
  assert.match(markup, /Taslak önizlemesi/);
  assert.match(markup, /--store-primary:#123456/);
  assert.match(markup, /--store-background:#FAFAF0/);
  assert.match(markup, /--store-heading-size:46px/);
  assert.match(markup, /family=Playfair\+Display:wght@700/);
});

test("the top-level design hero owns output when it and a stored composition hero are enabled", () => {
  const storedHero = Object.freeze({
    sectionId: "home_composition_hero",
    kind: "hero",
    enabled: true,
    slides: Object.freeze([Object.freeze({
      heading: "COMPOSITION_HERO",
      desktopAssetId: COMPOSITION_DESKTOP_MEDIA,
      mobileAssetId: COMPOSITION_MOBILE_MEDIA,
      destination: "/products",
    })]),
  }) satisfies StarterThemeCompositionConfigV3["sections"][number];
  const design = {
    ...BASE_DESIGN,
    hero: Object.freeze({ enabled: true, slides: Object.freeze([Object.freeze({
      headline: "TOP_LEVEL_HERO",
      body: "",
      desktopImage: Object.freeze({ kind: "media", mediaId: DESIGN_HERO_MEDIA }),
      mobileImage: null,
      destination: Object.freeze({ kind: "none" }),
      enabled: true,
    })]) }),
    composition: composition(Object.freeze([storedHero])),
  } satisfies StorefrontDesignDocument;

  const markup = renderCanvas(design, { media: MEDIA });
  assert.match(markup, /TOP_LEVEL_HERO/);
  assert.doesNotMatch(markup, /COMPOSITION_HERO/);
  assert.equal((markup.match(/aria-label="Mağaza bannerları"/g) ?? []).length, 1);
});

test("stored section configuration is disclosed without fabricating unresolved storefront data", () => {
  const sections = Object.freeze([
    Object.freeze({
      sectionId: "home_composition_hero",
      kind: "hero",
      enabled: true,
      slides: Object.freeze([Object.freeze({
        heading: "COMPOSITION_HERO",
        desktopAssetId: COMPOSITION_DESKTOP_MEDIA,
        mobileAssetId: COMPOSITION_MOBILE_MEDIA,
        destination: "/products",
      })]),
    }),
    Object.freeze({ sectionId: "home_categories", kind: "category_grid", enabled: true, heading: "CATEGORIES", categoryIds: Object.freeze([CATEGORY]), layout: "duo" }),
  ] satisfies StarterThemeCompositionConfigV3["sections"]);
  const markup = renderCanvas({ ...BASE_DESIGN, composition: composition(sections) }, { destinations: DESTINATIONS });

  for (const text of [
    "COMPOSITION_HERO",
    `Masaüstü görsel kimliği: ${COMPOSITION_DESKTOP_MEDIA}`,
    `Mobil görsel kimliği: ${COMPOSITION_MOBILE_MEDIA}`,
    "Düzen: İki büyük görsel",
    "Fixture Category",
  ]) assert.match(markup, new RegExp(text));
  assert.match(markup, /yayın vitrininin sunucu tarafında çözümlenir/);
  const storedHeroMarkup = markup.slice(
    markup.indexOf('data-preview-section-kind="hero"'),
    markup.indexOf('data-preview-section-kind="category_grid"'),
  );
  assert.doesNotMatch(storedHeroMarkup, /<img|<picture|canvasExampleMedia/);
  assert.match(markup, /Kategori görsel alanları için örnek yerleşim/);
});
