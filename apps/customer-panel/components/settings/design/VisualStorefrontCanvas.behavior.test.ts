import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createDefaultStarterThemeComposition,
  type StarterThemeCompositionConfigV3,
  type StorefrontDesignDocument,
} from "@celebix/saas-contracts";
import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { createPreviewStorefrontDesign, isStorefrontPromotionActive } from "../../../../../packages/storefront-design-ui/src/model.ts";
import { createStorefrontTypographyResources } from "../../../../../packages/storefront-design-ui/src/typography.ts";

const require = createRequire(import.meta.url);
const styles = new Proxy({}, { get: (_target, key) => String(key) });
const CATEGORY = "50000000-0000-4000-8000-000000000001";
const NOW = "2026-09-14T09:00:00.000Z";

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

function compileCanvas(): CanvasModule {
  const filename = new URL("./VisualStorefrontCanvas.tsx", import.meta.url);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const load = (id: string): unknown => {
    if (id.endsWith(".css")) return { __esModule: true, default: styles };
    if (id === "@celebix/storefront-design-ui") return { ...compileRenderer(), createPreviewStorefrontDesign };
    return require(id);
  };
  new Function("require", "module", "exports", output)(load, module, module.exports);
  return module.exports as CanvasModule;
}

function renderCanvas(design: StorefrontDesignDocument): string {
  const { VisualStorefrontCanvas } = compileCanvas();
  return renderToStaticMarkup(React.createElement(VisualStorefrontCanvas, {
    design,
    storeName: "Fixture Store",
    publishedVersion: 7,
    publishedAt: NOW,
    media: [],
    destinations: [],
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
        Object.freeze({ heading: "CUSTOM_HELP", links: Object.freeze([Object.freeze({ kind: "system", destination: "/favorites" })]) }),
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
  assert.match(markup, /Örnek ürün 1/);
});

test("an intentionally empty homepage stays empty instead of fabricating catalog sections", () => {
  const markup = renderCanvas({ ...BASE_DESIGN, composition: composition(Object.freeze([])) });
  assert.match(markup, /data-empty-home="true"/);
  assert.equal((markup.match(/data-preview-section-kind=/g) ?? []).length, 0);
  assert.doesNotMatch(markup, /Örnek kategori|Kategorileri keşfedin|Öne çıkan ürünler/);
});

test("V3 footer options and the selected brand typography survive in the draft preview", () => {
  const markup = renderCanvas({ ...BASE_DESIGN, composition: composition(Object.freeze([])) });
  for (const text of ["CUSTOM_HELP", "CUSTOM_LEGAL", "CUSTOM_NEWSLETTER", "CUSTOM_NEWSLETTER_BODY", "instagram"]) assert.match(markup, new RegExp(text));
  assert.match(markup, /data-tone="light"/);
  assert.match(markup, /Taslak önizlemesi/);
  assert.match(markup, /--store-primary:#123456/);
  assert.match(markup, /--store-background:#FAFAF0/);
  assert.match(markup, /--store-heading-size:46px/);
  assert.match(markup, /family=Playfair\+Display:wght@700/);
});

test("mobile preview mode carries a container-scoped storefront breakpoint contract", () => {
  const css = readFileSync(new URL("../design-settings.module.css", import.meta.url), "utf8");
  assert.match(css, /[.]previewViewport\s+:global\([.]celebix-store-header\)[^}]*position:\s*relative[^}]*z-index:/s);
  assert.match(css, /[.]previewViewport\[data-mode="mobile"\][^{]*:global\([.]celebix-store-header nav\)[^}]*display:\s*none/s);
  assert.match(css, /@container design-preview \(max-width:\s*720px\)[^{]*\{[\s\S]*?:global\([.]celebix-store-header nav\)[^}]*display:\s*none/s);
});
