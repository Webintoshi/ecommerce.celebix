import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  parseStarterThemeCompositionConfig,
  type StarterFooterConfig,
  type StarterThemeComposition,
  type StarterThemeCompositionConfigV3,
} from "@celebix/saas-contracts";
import { Window } from "happy-dom";
import React, { type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import * as composerModel from "../../lib/starter-theme-composer-model.ts";

const require = createRequire(import.meta.url);
const styles = new Proxy({}, { get: (_target, key) => String(key) });

const FOOTER: StarterFooterConfig = Object.freeze({
  tone: "light",
  groups: Object.freeze([
    Object.freeze({
      heading: "Müşteri hizmetleri",
      links: Object.freeze([Object.freeze({ kind: "system", destination: "/favorites" })]),
    }),
    Object.freeze({
      heading: "Yasal bilgiler",
      links: Object.freeze([Object.freeze({ kind: "fixed_policy", policyKey: "kvkk" })]),
    }),
  ]),
  newsletter: Object.freeze({
    enabled: true,
    heading: "Özel haberler",
    body: "Sadece seçili duyuruları alın.",
    consentLabel: "İletişim izni veriyorum.",
  }),
  social: Object.freeze([Object.freeze({ network: "instagram", url: "https://instagram.com/fixture" })]),
});

const ASSET = "30000000-0000-4000-8000-000000000001";
const MOBILE_ASSET = "30000000-0000-4000-8000-000000000002";
const PRODUCT = "40000000-0000-4000-8000-000000000001";
const CATEGORY = "50000000-0000-4000-8000-000000000001";

const V3_FIXTURE: StarterThemeCompositionConfigV3 = Object.freeze({
  schemaVersion: 3,
  visual: Object.freeze({ colorScheme: "ocean", headingStyle: "sans", cornerStyle: "soft", headerStyle: "solid", productCardStyle: "compact", productImageRatio: "square", headerWidth: "wide", headerLayout: "stacked", sectionSpacing: "airy" }),
  announcement: Object.freeze({ enabled: true, items: Object.freeze(["Seçili duyuru"]), destination: "/favorites" }),
  navigation: Object.freeze({ rootCategoryIds: Object.freeze([CATEGORY]), featuredCategoryId: CATEGORY, featuredAssetId: ASSET }),
  sections: Object.freeze([
    Object.freeze({ sectionId: "home_product_row_11111111_1111_4111_8111_111111111111", kind: "product_row", enabled: true, heading: "İlk ürünler", source: "category", categoryId: CATEGORY, limit: 4 }),
    Object.freeze({ sectionId: "home_story_second", kind: "brand_story", enabled: false, eyebrow: "Köken", heading: "Hikâyemiz", body: "Korunacak metin.", assetId: ASSET, destination: "/favorites" }),
    Object.freeze({ sectionId: "home_hero_third", kind: "hero", enabled: true, slides: Object.freeze([Object.freeze({ eyebrow: "Yeni", heading: "Seçili hero", body: "Korunacak hero metni.", desktopAssetId: ASSET, mobileAssetId: MOBILE_ASSET, destination: "/products", productId: PRODUCT })]) }),
  ]),
  productDetail: Object.freeze({ galleryStyle: "rail", showSku: false, showBrand: false, showBreadcrumbs: false, showRelatedProducts: false, showApprovedReviews: false, mobileStickyPurchase: false, showSizeGuide: false, informationSections: Object.freeze(["description"] as const) }),
  cart: Object.freeze({ showCheckoutReadiness: false, showShippingProgress: true, showQuantitySelector: false, trustMessage: "Özel güven mesajı" }),
  footer: FOOTER,
});

type ComposerProps = Readonly<{
  activePanel: "visual" | "navigation" | "home" | "product" | "cart" | "footer";
  canManage: boolean;
  showPreview?: boolean;
  value: StarterThemeComposition;
  onChange: (value: StarterThemeComposition) => void;
}>;

type ComposerModule = Readonly<{ StarterThemeComposer: (props: ComposerProps) => ReactNode }>;

function compileComposer(): ComposerModule {
  const filename = new URL("./StarterThemeComposer.tsx", import.meta.url);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const load = (id: string): unknown => {
    if (id.endsWith(".css")) return { __esModule: true, default: styles };
    if (id === "@/components/settings/StarterThemePreview") return { StarterThemePreview: () => null };
    if (id === "@/components/settings/StarterFooterEditor") return { StarterFooterEditor: () => React.createElement("fieldset", null, React.createElement("legend", null, "Footer ayarları")) };
    if (id === "@/components/settings/StarterRetailSectionEditors") return { StarterRetailSectionEditor: () => null };
    if (id === "@/lib/catalog-onboarding-ui/client") return { catalogOnboardingClient: { listCategories: async () => [] } };
    if (id === "@/lib/catalog-ui/client") return { catalogApi: { listProducts: async () => ({ items: [] }) } };
    if (id === "@/lib/merchant-admin-ui/client") return { merchantAdminApi: { records: async () => [] } };
    if (id === "@/lib/starter-theme-composer-model") return composerModel;
    return require(id);
  };
  new Function("require", "module", "exports", output)(load, module, module.exports);
  return module.exports as ComposerModule;
}

async function settle(): Promise<void> {
  await React.act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

test("valid V3 opens every composer panel and one edit preserves the full composition", async () => {
  const window = new Window({ url: "https://fixture.invalid/settings/design" });
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  globalThis.window = window as unknown as Window & typeof globalThis.window;
  globalThis.document = window.document as unknown as Document;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  globalThis.fetch = async () => new Response(JSON.stringify({ assets: [] }), { status: 200 });

  const { StarterThemeComposer } = compileComposer();
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root: Root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  const changes: StarterThemeComposition[] = [];

  try {
    const panelMarkers = Object.freeze({
      visual: Object.freeze({ selector: "legend", text: "Görsel sistem" }),
      navigation: Object.freeze({ selector: "legend", text: "Duyuru ve navigasyon" }),
      home: Object.freeze({ selector: "#starter-sections-title", text: "Ana sayfa bölümleri" }),
      product: Object.freeze({ selector: "legend", text: "Ürün detayı" }),
      cart: Object.freeze({ selector: "legend", text: "Sepet deneyimi" }),
      footer: Object.freeze({ selector: "legend", text: "Footer ayarları" }),
    });
    for (const activePanel of Object.keys(panelMarkers) as readonly (keyof typeof panelMarkers)[]) {
      await React.act(async () => {
        root.render(React.createElement(StarterThemeComposer, {
          activePanel,
          canManage: true,
          showPreview: false,
          value: V3_FIXTURE,
          onChange: (value) => changes.push(value),
        }));
      });
      await settle();
      const marker = panelMarkers[activePanel];
      assert.equal(container.querySelector(marker.selector)?.textContent, marker.text, `${activePanel} panel should render its own control group`);
      assert.equal(changes.length, 0, `${activePanel} panel opening must not write`);
    }

    await React.act(async () => {
      root.render(React.createElement(StarterThemeComposer, {
        activePanel: "navigation",
        canManage: true,
        showPreview: false,
        value: V3_FIXTURE,
        onChange: (value) => changes.push(value),
      }));
    });
    await settle();
    const widthSelect = Array.from(container.querySelectorAll("label"))
      .find((label) => label.textContent?.includes("Header genişliği"))
      ?.querySelector("select");
    assert.ok(widthSelect);
    widthSelect.value = "contained";
    await React.act(async () => widthSelect.dispatchEvent(new window.Event("change", { bubbles: true })));

    assert.equal(changes.length, 1);
    const result = parseStarterThemeCompositionConfig(changes[0]);
    assert.equal(result.schemaVersion, 3);
    assert.deepEqual(result.sections.map((section) => "sectionId" in section ? section.sectionId : null), [
      "home_product_row_11111111_1111_4111_8111_111111111111",
      "home_story_second",
      "home_hero_third",
    ]);
    assert.deepEqual(result.footer, FOOTER);
    assert.deepEqual(result, {
      ...V3_FIXTURE,
      visual: { ...V3_FIXTURE.visual, headerWidth: "contained" },
    });
  } finally {
    await React.act(async () => root.unmount());
    await window.happyDOM.close();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});

test("adding a product row to V3 emits a parseable payload with a new stable identity", async () => {
  const window = new Window({ url: "https://fixture.invalid/settings/design" });
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const previousCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  globalThis.window = window as unknown as Window & typeof globalThis.window;
  globalThis.document = window.document as unknown as Document;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  globalThis.fetch = async () => new Response(JSON.stringify({ assets: [] }), { status: 200 });
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { randomUUID: () => "11111111-1111-4111-8111-111111111111" },
  });

  const { StarterThemeComposer } = compileComposer();
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root: Root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  const changes: StarterThemeComposition[] = [];

  try {
    await React.act(async () => {
      root.render(React.createElement(StarterThemeComposer, {
        activePanel: "home",
        canManage: true,
        showPreview: false,
        value: V3_FIXTURE,
        onChange: (value) => changes.push(value),
      }));
    });
    await settle();
    const add = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Bölüm ekle"));
    assert.ok(add);
    await React.act(async () => add.dispatchEvent(new window.Event("click", { bubbles: true })));

    assert.equal(changes.length, 1);
    const result = parseStarterThemeCompositionConfig(changes[0]);
    assert.equal(result.schemaVersion, 3);
    assert.deepEqual(result.sections.slice(0, 3).map((section) => "sectionId" in section ? section.sectionId : null), [
      "home_product_row_11111111_1111_4111_8111_111111111111",
      "home_story_second",
      "home_hero_third",
    ]);
    const sectionIds = result.sections.map((section) => "sectionId" in section ? section.sectionId : null);
    assert.equal(new Set(sectionIds).size, 4);
    assert.equal(sectionIds[3], "home_product_row_11111111_1111_4111_8111_111111111111_2");
    assert.deepEqual(result.sections[3], {
      kind: "product_row",
      sectionId: sectionIds[3],
      enabled: true,
      heading: "Yeni ürünler",
      source: "latest",
      limit: 8,
    });
  } finally {
    await React.act(async () => root.unmount());
    await window.happyDOM.close();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
    if (previousCrypto) Object.defineProperty(globalThis, "crypto", previousCrypto);
    else Reflect.deleteProperty(globalThis, "crypto");
  }
});

test("switching a V3 category product row source preserves its stable identity and order", async () => {
  const window = new Window({ url: "https://fixture.invalid/settings/design" });
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  globalThis.window = window as unknown as Window & typeof globalThis.window;
  globalThis.document = window.document as unknown as Document;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  globalThis.fetch = async () => new Response(JSON.stringify({ assets: [] }), { status: 200 });

  const { StarterThemeComposer } = compileComposer();
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root: Root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  const changes: StarterThemeComposition[] = [];
  const originalSectionIds = V3_FIXTURE.sections.map((section) => section.sectionId);

  try {
    for (const source of ["latest", "sale"] as const) {
      await React.act(async () => {
        root.render(React.createElement(StarterThemeComposer, {
          activePanel: "home",
          canManage: true,
          showPreview: false,
          value: V3_FIXTURE,
          onChange: (value) => changes.push(value),
        }));
      });
      await settle();
      changes.length = 0;

      const sourceSelect = Array.from(container.querySelectorAll("label"))
        .find((label) => label.firstChild?.textContent === "Kaynak")
        ?.querySelector("select");
      assert.ok(sourceSelect);
      sourceSelect.value = source;
      await React.act(async () => sourceSelect.dispatchEvent(new window.Event("change", { bubbles: true })));

      assert.equal(changes.length, 1, `${source} should emit one valid composition`);
      const result = parseStarterThemeCompositionConfig(changes[0]);
      assert.equal(result.schemaVersion, 3);
      assert.deepEqual(result.sections.map((section) => section.sectionId), originalSectionIds);
      assert.deepEqual(result.sections[0], {
        sectionId: V3_FIXTURE.sections[0].sectionId,
        kind: "product_row",
        enabled: true,
        heading: "İlk ürünler",
        source,
        limit: 4,
      });
      assert.deepEqual(result.sections.slice(1), V3_FIXTURE.sections.slice(1));
    }
  } finally {
    await React.act(async () => root.unmount());
    await window.happyDOM.close();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});

test("invalid composition shows an explicit editor error without writing", () => {
  const { StarterThemeComposer } = compileComposer();
  const changes: StarterThemeComposition[] = [];
  const markup = renderToStaticMarkup(React.createElement(StarterThemeComposer, {
    activePanel: "navigation",
    canManage: true,
    showPreview: false,
    value: { schemaVersion: 3, sections: [] } as never,
    onChange: (value) => changes.push(value),
  }));

  assert.match(markup, /role="alert"/);
  assert.match(markup, /Kayıtlı tema verisi açılamadı/);
  assert.equal(changes.length, 0);
});
