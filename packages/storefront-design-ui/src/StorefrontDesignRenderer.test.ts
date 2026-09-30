import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import {
  createDefaultStarterThemeComposition,
  normalizeStorefrontDesignDocumentV5,
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
  const navigationSource = await readFile(new URL("./StorefrontNavigation.tsx", import.meta.url), "utf8");
  const navigation = ts.transpileModule(navigationSource, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace('from "react"', `from "${import.meta.resolve("react")}"`)
    .replace('from "react/jsx-runtime"', `from "${import.meta.resolve("react/jsx-runtime")}"`);
  const navigationUrl = `data:text/javascript;base64,${Buffer.from(navigation).toString("base64")}`;
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
    .replace('from "./typography.ts"', `from "${new URL("./typography.ts", import.meta.url).href}"`)
    .replace('from "./StorefrontNavigation.tsx"', `from "${navigationUrl}"`);
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
test("category and real collection menu items sharing a slug keep distinct paths", async () => {
 const source = await readFile(new URL("./StorefrontNavigation.tsx", import.meta.url), "utf8");
 const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText.replace('from "react"', `from "${import.meta.resolve("react")}"`).replace('from "react/jsx-runtime"', `from "${import.meta.resolve("react/jsx-runtime")}"`);
 const { StorefrontNavigationItems } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
 const items = [{ name: "Kategori", slug: "yeni", children: [] }, { name: "Koleksiyon", slug: "yeni", kind: "catalog_collection", resourceId: DESTINATION, path: "/collections/yeni", children: [] }];
 const html = renderToStaticMarkup(createElement(StorefrontNavigationItems, { items }));
 assert.match(html, /href="\/categories\/yeni"/);
 assert.match(html, /href="\/collections\/yeni"/);
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

test("V5 preview preserves retained brand URLs without media library entries", () => {
  const draft = normalizeStorefrontDesignDocumentV5({ ...DESIGN, brand: { ...DESIGN.brand, logo: null }, hero: { enabled: false, slides: [{ ...DESIGN.hero.slides[0]!, desktopImage: null, destination: { kind: "none" } }] } });
  const selected = createPreviewStorefrontDesign({
    draft: { ...draft, brand: { ...draft.brand, logo: { kind: "legacy_https", url: "https://legacy.example/logo.png" }, favicon: { kind: "legacy_https", url: "https://legacy.example/favicon.png" } } },
    publishedVersion: 3, publishedAt: NOW, media: [], destinations: [],
  });
  assert.deepEqual(selected.brand.logo, { url: "https://legacy.example/logo.png", altText: "" });
  assert.deepEqual(selected.brand.favicon, { url: "https://legacy.example/favicon.png", altText: "" });
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

test("editor mode exposes exact storefront surfaces while default markup remains unchanged", async () => {
  const StorefrontDesignRenderer = await loadStorefrontDesignRenderer();
  const publicDesign = createPreviewStorefrontDesign({
    draft: DESIGN,
    publishedVersion: 3,
    publishedAt: NOW,
    media: [{ id: MEDIA, url: "https://media.example/guzide.png", altText: "Güzide", mediaType: "image/png", width: 1200, height: 800 }],
    destinations: [{ kind: "product", resourceId: DESTINATION, label: "Altın Kolye", path: "/products/altin-kolye" }],
  });
  const baseProps = { design: publicDesign, storeName: "Güzide Kuyumcu", now: new Date(NOW) } as const;

  const defaultMarkup = renderToStaticMarkup(createElement(StorefrontDesignRenderer, baseProps));
  const editorMarkup = renderToStaticMarkup(createElement(StorefrontDesignRenderer, {
    ...baseProps,
    editor: { selectedSurface: "hero", onSelectSurface: () => undefined },
  }));

  assert.doesNotMatch(defaultMarkup, /data-design-surface|celebix-store-edit-control|Düzenle/);
  for (const surface of ["announcement", "brand", "navigation", "hero", "promotion", "cart"]) {
    assert.match(editorMarkup, new RegExp(`data-design-surface="${surface}"`));
  }
  assert.match(editorMarkup, /data-design-surface="hero"[^>]*aria-pressed="true"/);
  assert.match(editorMarkup, /aria-label="Logo ve marka alanını düzenle"/);
  assert.match(editorMarkup, /aria-label="Header ve menü alanını düzenle"/);
  assert.match(editorMarkup, /aria-label="Yan sepet alanını düzenle"/);
});

test("renderer source owns exact brand tokens and no unsafe HTML path", async () => {
  const source = await readFile(new URL("./StorefrontDesignRenderer.tsx", import.meta.url), "utf8");
  for (const token of ["--store-primary", "--store-accent", "--store-background", "--store-text"]) assert.match(source, new RegExp(token));
  assert.match(source, /isStorefrontPromotionActive/);
  assert.match(source, /announcement[.]enabled/);
  assert.match(source, /design[.]hero[.]enabled/);
  assert.match(source, /5_000/);
  assert.match(source, /aria-label="Önceki banner"/);
  assert.match(source, /aria-label="Sonraki banner"/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /showHeader = true/);
  assert.match(source, /showHeader \?/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|mediaId|resourceId/);
});


test("explicit mobile preview selects the mobile image regardless of browser width", async () => {
  const Renderer = await loadStorefrontDesignRenderer();
  const design = createPreviewStorefrontDesign({ draft: { ...DESIGN, hero: { ...DESIGN.hero, slides: [{ ...DESIGN.hero.slides[0]!, mobileImage: { kind: "media", mediaId: MOBILE_MEDIA } }] } }, publishedVersion: 3, publishedAt: NOW,
    media: [{ id: MEDIA, url: "https://media.example/desktop.webp", altText: "Desktop", mediaType: "image/webp", width: 1600, height: 900 }, { id: MOBILE_MEDIA, url: "https://media.example/mobile.webp", altText: "Mobile", mediaType: "image/webp", width: 700, height: 900 }],
    destinations: [{ kind: "product", resourceId: DESTINATION, label: "Product", path: "/products/product" }] });
  const markup = renderToStaticMarkup(createElement(Renderer, { design, storeName: "Atlas", now: new Date(NOW), previewMode: "mobile" }));
  assert.match(markup, /<img[^>]*src="https:\/\/media.example\/mobile.webp"/);
  assert.doesNotMatch(markup, /<source media=/);
});

test("composition announcement controls content destination visibility and section spacing", async () => {
  const Renderer = await loadStorefrontDesignRenderer();
  const design = createPreviewStorefrontDesign({draft:DESIGN,publishedVersion:3,publishedAt:NOW,media:[{id:MEDIA,url:"https://media.example/banner.webp",altText:"Banner",mediaType:"image/webp",width:1000,height:600}],destinations:[{kind:"product",resourceId:DESTINATION,label:"Product",path:"/products/product"}]});
  const base = createDefaultStarterThemeComposition();
  const presentation = {schemaVersion:3,visual:{...base.visual,sectionSpacing:"airy"},announcement:{items:["Yetkili duyuru"],destination:"/pages/duyuru"},navigation:{items:[]}} as const;
  const visible = renderToStaticMarkup(createElement(Renderer,{design,storeName:"Atlas",now:new Date(NOW),presentation:presentation as never}));
  assert.match(visible,/href="\/pages\/duyuru"/);
  assert.match(visible,/Yetkili duyuru/);
  assert.doesNotMatch(visible,/Ücretsiz kargo/);
  assert.match(visible,/data-animation="continuous"/);
  assert.match(visible,/--store-section-spacing:112px/);
  const hidden = renderToStaticMarkup(createElement(Renderer,{design,storeName:"Atlas",now:new Date(NOW),presentation:{...presentation,announcement:undefined} as never}));
  assert.doesNotMatch(hidden,/aria-label="Mağaza duyuruları"/);
});

test("renderer previews nested navigation and featured images through native keyboard disclosures", async () => {
  const Renderer = await loadStorefrontDesignRenderer();
  const design = createPreviewStorefrontDesign({ draft: DESIGN, publishedVersion: 3, publishedAt: NOW, media: [{ id: MEDIA, url: "https://media.example/banner.webp", altText: "Banner", mediaType: "image/webp", width: 1000, height: 600 }], destinations: [{ kind: "product", resourceId: DESTINATION, label: "Product", path: "/products/product" }] });
  const presentation = { schemaVersion: 3, visual: createDefaultStarterThemeComposition().visual, navigation: { items: [{ name: "Kolyeler", slug: "kolyeler", children: [{ name: "Altın", slug: "altin", children: [{ name: "İnce", slug: "ince", children: [] }] }], featured: { name: "Kolyeler", slug: "kolyeler", image: { url: "https://media.example/kolye.webp", altText: "Öne çıkan kolye", mediaType: "image/webp", width: 800, height: 800 } } }] } };
  const markup = renderToStaticMarkup(createElement(Renderer, { design, storeName: "Atlas", now: new Date(NOW), presentation: presentation as never, previewMode: "mobile" }));
  assert.match(markup, /<details class="celebix-store-mobile-nav"><summary>Menü/);
  assert.match(markup, /href="\/categories\/altin"/);
  assert.match(markup, /href="\/categories\/ince"/);
  assert.match(markup, /alt="Öne çıkan kolye"/);
  assert.match(markup, /--store-section-spacing:64px/);
  assert.doesNotMatch(markup, /storeId|tenantId|mediaId|resourceId/);
  const desktop = renderToStaticMarkup(createElement(Renderer, { design, storeName: "Atlas", now: new Date(NOW), presentation: presentation as never, previewMode: "desktop" }));
  // The canvas prevents link navigation. Its disclosure title must therefore
  // be plain text so clicking the category name still opens the menu.
  assert.match(desktop, /<summary class="celebix-store-nav-summary">Kolyeler<span/);
  assert.doesNotMatch(desktop, /<summary[^>]*><a/);
});
