import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import ts from "typescript";
import type { PublicStarterHomeSection } from "@celebix/saas-contracts";

async function bannerRenderer() {
  const source = await readFile(new URL("./StorefrontBanner.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace('from "react"', `from "${import.meta.resolve("react")}"`)
    .replace('from "react/jsx-runtime"', `from "${import.meta.resolve("react/jsx-runtime")}"`);
  return (await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`)).StorefrontBanner as typeof import("./StorefrontBanner.tsx").StorefrontBanner;
}

const image = (name: string) => ({ url: `https://media.celebix.site/${name}.webp`, altText: name, mediaType: "image/webp" as const, width: 1600, height: 900 });
const section = (layout: "single" | "slider" | "stacked") => ({ kind: "banner" as const, sectionId: "home_banner_test" as const, layout, autoplay: true, presentation: "image_only" as const,
  slides: [{ slideId: "slide_first", enabled: true, headline: "Bir", body: "A", desktopImage: image("desktop-a"), mobileImage: image("mobile-a"), destination: "/products/a" },
    { slideId: "slide_hidden", enabled: false, headline: "Gizli", body: "", desktopImage: image("hidden"), mobileImage: null, destination: null },
    { slideId: "slide_second", enabled: true, headline: "İki", body: "B", desktopImage: image("desktop-b"), mobileImage: null, destination: "/products/b" }] }) satisfies Extract<PublicStarterHomeSection, { kind: "banner" }>;

test("single and stacked banners use mobile images, desktop fallback and lazy media", async () => {
  const Banner = await bannerRenderer();
  const single = renderToStaticMarkup(React.createElement(Banner, { section: section("single"), previewMode: "mobile" }));
  assert.match(single, /src="https:\/\/media.celebix.site\/mobile-a.webp"/);
  assert.doesNotMatch(single, /desktop-b|hidden.webp|aria-roledescription="carousel"/);
  const stacked = renderToStaticMarkup(React.createElement(Banner, { section: section("stacked"), previewMode: "mobile" }));
  assert.match(stacked, /mobile-a.webp/);
  assert.match(stacked, /desktop-b.webp/);
  assert.equal((stacked.match(/loading="lazy"/g) ?? []).length, 2);
  assert.doesNotMatch(stacked, /hidden.webp|aria-roledescription="carousel"/);
});

test("slider excludes disabled slides, controls active slide and pauses autoplay after interaction", async () => {
  const Banner = await bannerRenderer();
  const window = new Window({ url: "https://shop.example/" });
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window as unknown as typeof globalThis.window;
  globalThis.document = window.document as unknown as Document;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let tick: (() => void) | undefined;
  let cleared = false;
  window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
  window.setInterval = ((callback: () => void, milliseconds: number) => { assert.equal(milliseconds, 5000); tick = callback; return 7; }) as unknown as typeof window.setInterval;
  window.clearInterval = (() => { cleared = true; }) as typeof window.clearInterval;
  const container = window.document.createElement("div"); window.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  try {
    await React.act(async () => root.render(React.createElement(Banner, { section: section("slider") })));
    assert.equal(container.querySelectorAll("article").length, 2);
    assert.equal(container.querySelector('[data-active="true"]')?.getAttribute("data-slide-id"), "slide_first");
    await React.act(async () => tick?.());
    assert.equal(container.querySelector('[data-active="true"]')?.getAttribute("data-slide-id"), "slide_second");
    await React.act(async () => (container.querySelector('button[aria-label="Sonraki banner"]') as unknown as HTMLButtonElement)?.click());
    assert.equal(container.querySelector('[data-active="true"]')?.getAttribute("data-slide-id"), "slide_first");
    assert.equal(cleared, true);
    assert.equal(container.querySelector('[data-active="false"]')?.getAttribute("aria-hidden"), "true");
    assert.equal(container.querySelector('[data-active="false"] a')?.getAttribute("tabindex"), "-1");
  } finally {
    await React.act(async () => root.unmount());
    await window.happyDOM.close();
    globalThis.window = previous.window; globalThis.document = previous.document;
  }
});

test("overlay banners retain copy and product hotspots while image-only banners hide copy visually", async () => {
  const Banner = await bannerRenderer();
  const configured = section("single");
  const overlay = { ...configured, presentation: "overlay" as const, slides: [{ ...configured.slides[0]!, eyebrow: "Seçki", hotspot: { productSlug: "kolye", title: "Altın Kolye", priceCents: 10000, currency: "TRY" as const } }] };
  const markup = renderToStaticMarkup(React.createElement(Banner, { section: overlay, destinationHref: (path) => `/tr${path}` }));
  assert.match(markup, /celebix-store-banner-copy/);
  assert.match(markup, /Seçki/);
  assert.match(markup, /Altın Kolye/);
  assert.match(markup, /href="\/tr\/products\/kolye"/);
});
