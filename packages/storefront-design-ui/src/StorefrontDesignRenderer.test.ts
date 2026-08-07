import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import {
  createDefaultStarterThemeComposition,
  type StorefrontDesignDocument,
} from "@celebix/saas-contracts";

import { createPreviewStorefrontDesign, isStorefrontPromotionActive } from "./model.ts";
import { createStorefrontTypographyResources } from "./typography.ts";

const MEDIA = "70000000-0000-4000-8000-000000000001";
const MOBILE_MEDIA = "70000000-0000-4000-8000-000000000002";
const DESTINATION = "80000000-0000-4000-8000-000000000001";
const NOW = "2026-08-03T09:00:00.000Z";
const DESIGN: StorefrontDesignDocument = { schemaVersion: 3, brand: { logo: { kind: "media", mediaId: MEDIA }, favicon: null, primaryColor: "#FF5A00", accentColor: "#171717", backgroundColor: "#FFFFFF", textColor: "#171717", fontFamily: "manrope" }, hero: { enabled: true, slides: [{ headline: "Güzide Kuyumcu", body: "Zamansız tasarımlar", desktopImage: { kind: "media", mediaId: MEDIA }, mobileImage: null, destination: { kind: "product", resourceId: DESTINATION }, enabled: true }] }, promotion: { headline: "Yaz fırsatı", body: "Seçili ürünlerde", destination: { kind: "none" }, startsAt: "2026-08-01T00:00:00.000Z", endsAt: "2026-08-10T00:00:00.000Z", enabled: true }, announcement: { items: ["Ücretsiz kargo", "Güvenli ödeme"], icon: "truck", speed: "normal", direction: "left", animation: "continuous", enabled: true }, typography: { headingFont: { family: "Playfair Display", category: "serif", availableWeights: ["400", "700"], source: "google" }, bodyFont: { family: "Inter", category: "sans-serif", availableWeights: ["400", "500", "700"], source: "google" }, headingWeight: "700", bodyWeight: "400", headingSizePx: 48, bodySizePx: 17 }, composition: createDefaultStarterThemeComposition() };

async function loadStorefrontDesignRenderer() {
  const sourceUrl = new URL("./StorefrontDesignRenderer.tsx", import.meta.url);
  const source = await readFile(sourceUrl, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
    .replace('from "react"', `from "${import.meta.resolve("react")}"`)
    .replace('from "react/jsx-runtime"', `from "${import.meta.resolve("react/jsx-runtime")}"`)
    .replace('from "./model.ts"', `from "${new URL("./model.ts", import.meta.url).href}"`)
    .replace('from "./typography.ts"', `from "${new URL("./typography.ts", import.meta.url).href}"`);
  const loaded = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  return loaded.StorefrontDesignRenderer as typeof import("./StorefrontDesignRenderer.tsx").StorefrontDesignRenderer;
}

test("preview resolves only tenant media and destination options into the public renderer contract", () => {
  const selected = createPreviewStorefrontDesign({ draft: DESIGN, publishedVersion: 3, publishedAt: NOW, media: [{ id: MEDIA, url: "https://media.example/guzide.png", altText: "Güzide", mediaType: "image/png", width: 1200, height: 800 }], destinations: [{ kind: "product", resourceId: DESTINATION, label: "Altın Kolye", path: "/products/altin-kolye" }] });
  assert.equal(selected.hero.slides[0]?.desktopImage?.url, "https://media.example/guzide.png");
  assert.equal(selected.hero.slides[0]?.destination?.path, "/products/altin-kolye");
  assert.equal(JSON.stringify(selected).includes(MEDIA), false);
  assert.equal(JSON.stringify(selected).includes(DESTINATION), false);
  assert.deepEqual(selected.typography, DESIGN.typography);
});

test("typography resources combine only selected Google families and exact weights", () => {
  const resources = createStorefrontTypographyResources(DESIGN.typography);
  assert.equal(resources.stylesheetUrl, "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400&display=swap");
  assert.equal(resources.style["--store-heading-font"], '"Playfair Display", Georgia, "Times New Roman", serif');
  assert.equal(resources.style["--store-body-font"], '"Inter", ui-sans-serif, system-ui, sans-serif');
  assert.equal(resources.style["--store-heading-weight"], "700");
  assert.equal(resources.style["--store-body-weight"], "400");
  assert.equal(resources.style["--store-heading-size"], "48px");
  assert.equal(resources.style["--store-body-size"], "17px");
});

test("typography resources deduplicate one family and fail closed for hostile runtime data", () => {
  const sameFamily = createStorefrontTypographyResources({
    ...DESIGN.typography,
    headingFont: DESIGN.typography.bodyFont,
    headingWeight: "700",
  });
  assert.equal(sameFamily.stylesheetUrl, "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap");
  assert.throws(() => createStorefrontTypographyResources({ ...DESIGN.typography, headingFont: { ...DESIGN.typography.headingFont, family: "Inter;src:url(evil)" } } as typeof DESIGN.typography), /storefront_typography_invalid/);
  assert.throws(() => createStorefrontTypographyResources({ ...DESIGN.typography, headingSizePx: 100 } as typeof DESIGN.typography), /storefront_typography_invalid/);
  assert.throws(() => createStorefrontTypographyResources({ ...DESIGN.typography, bodyWeight: "900" } as unknown as typeof DESIGN.typography), /storefront_typography_invalid/);
});

test("preview fails closed when a draft references deleted media or destination", () => {
  assert.throws(() => createPreviewStorefrontDesign({ draft: DESIGN, publishedVersion: 3, publishedAt: NOW, media: [], destinations: [] }), /storefront_design_preview_invalid/);
});

test("promotion activity uses the exact enabled UTC interval", () => {
  const publicDesign = createPreviewStorefrontDesign({ draft: { ...DESIGN, brand: { ...DESIGN.brand, logo: null }, hero: { ...DESIGN.hero, slides: [{ ...DESIGN.hero.slides[0]!, desktopImage: null, destination: { kind: "none" } }] } }, publishedVersion: 3, publishedAt: NOW, media: [], destinations: [] });
  assert.equal(isStorefrontPromotionActive(publicDesign.promotion, new Date(NOW)), true);
  assert.equal(isStorefrontPromotionActive(publicDesign.promotion, new Date("2026-08-20T00:00:00.000Z")), false);
  assert.equal(isStorefrontPromotionActive({ ...publicDesign.promotion, enabled: false }, new Date(NOW)), false);
});

test("image banners render as responsive media without a visible text panel", async () => {
  const StorefrontDesignRenderer = await loadStorefrontDesignRenderer();
  const publicDesign = createPreviewStorefrontDesign({
    draft: {
      ...DESIGN,
      announcement: { ...DESIGN.announcement, enabled: false },
      promotion: { ...DESIGN.promotion, enabled: false },
      hero: {
        enabled: true,
        slides: [{
          ...DESIGN.hero.slides[0]!,
          mobileImage: { kind: "media", mediaId: MOBILE_MEDIA },
        }],
      },
    },
    publishedVersion: 3,
    publishedAt: NOW,
    media: [
      { id: MEDIA, url: "https://media.example/guzide-desktop.png", altText: "Güzide banner", mediaType: "image/png", width: 1920, height: 720 },
      { id: MOBILE_MEDIA, url: "https://media.example/guzide-mobile.png", altText: "Güzide mobil banner", mediaType: "image/png", width: 720, height: 960 },
    ],
    destinations: [{ kind: "product", resourceId: DESTINATION, label: "Altın Kolye", path: "/products/altin-kolye" }],
  });

  const markup = renderToStaticMarkup(createElement(StorefrontDesignRenderer, {
    design: publicDesign,
    storeName: "Güzide Kuyumcu",
    now: new Date(NOW),
    showHeader: false,
  }));

  assert.match(markup, /href="\/products\/altin-kolye"/);
  assert.match(markup, /src="https:\/\/media[.]example\/guzide-desktop[.]png"/);
  assert.match(markup, /srcSet="https:\/\/media[.]example\/guzide-mobile[.]png"/);
  assert.match(markup, /<h1 class="celebix-store-hero-title-sr">Güzide Kuyumcu<\/h1>/);
  assert.doesNotMatch(markup, /celebix-store-hero-copy/);
  assert.doesNotMatch(markup, /Zamansız tasarımlar/);
  assert.doesNotMatch(markup, />Keşfet</);
  assert.match(markup, /rel="preconnect" href="https:\/\/fonts[.]googleapis[.]com"/);
  assert.match(markup, /rel="preconnect" href="https:\/\/fonts[.]gstatic[.]com" crossorigin="anonymous"/);
  assert.match(markup, /rel="stylesheet" href="https:\/\/fonts[.]googleapis[.]com\/css2\?family=Playfair\+Display:wght@700&amp;family=Inter:wght@400&amp;display=swap"/);
  assert.match(markup, /--store-heading-font:&quot;Playfair Display&quot;, Georgia, &quot;Times New Roman&quot;, serif/);
  assert.match(markup, /--store-body-size:17px/);
});

test("renderer source owns exact brand tokens and no unsafe HTML path", async () => {
  const source = await readFile(new URL("./StorefrontDesignRenderer.tsx", import.meta.url), "utf8");
  for (const token of ["--store-primary", "--store-accent", "--store-background", "--store-text"]) assert.match(source, new RegExp(token));
  assert.match(source, /isStorefrontPromotionActive/);
  assert.match(source, /design[.]announcement[.]enabled/);
  assert.match(source, /design[.]hero[.]enabled/);
  assert.match(source, /5_000/);
  assert.match(source, /aria-label="Önceki banner"/);
  assert.match(source, /aria-label="Sonraki banner"/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /showHeader = true/);
  assert.match(source, /showHeader \?/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|mediaId|resourceId/);
});
