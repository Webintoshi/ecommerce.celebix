import assert from "node:assert/strict";
import test from "node:test";
import React, { createContext, useContext } from "react";
import { buildDefaultStarterPresentation, type PublicStorefront, type PublicStorefrontDesign } from "@celebix/saas-contracts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";
import { SIORA_STOREFRONT_ID } from "../themes/siora/theme.ts";
import { ALPLER_STOREFRONT_ID } from "../themes/alpler/theme.ts";

type Component = React.ComponentType<Record<string, unknown>>;
const design: PublicStorefrontDesign = {
  schemaVersion: 2, publicationVersion: 2, publishedAt: "2026-10-01T00:00:00.000Z",
  brand: { logo: { url: "https://media.example/tenant-logo.png", altText: "Mağaza logosu" }, favicon: null, primaryColor: "#242421", accentColor: "#242421", backgroundColor: "#FFFFFF", textColor: "#242421", fontFamily: "inter" },
  hero: { enabled: false, slides: [] },
  promotion: { enabled: false, headline: "", body: "", destination: null, startsAt: null, endsAt: null },
  announcement: { enabled: false, items: [], icon: "none", speed: "normal", direction: "left", animation: "continuous" },
  typography: { headingFont: { family: "Inter", category: "sans-serif", availableWeights: ["400", "700"], source: "google" }, bodyFont: { family: "Inter", category: "sans-serif", availableWeights: ["400", "700"], source: "google" }, headingWeight: "700", bodyWeight: "400", headingSizePx: 40, bodySizePx: 16 },
};

function storefront(id: string, name = "Butik Siora"): PublicStorefront {
  return { schemaVersion: 2, id, name, slug: "fixture-store", hostname: "fixture.invalid", primaryHostname: "fixture.invalid", canonicalUrl: "https://fixture.invalid/", currency: "TRY", locale: "tr", themeKey: "starter", presentation: buildDefaultStarterPresentation({ name }) };
}

function frameLoader() {
  const CartContext = createContext<{ visualTheme?: string } | null>(null);
  return componentLoader({
    "@celebix/storefront-design-ui": { createStorefrontTypographyResources: () => ({ style: {}, stylesheetUrl: "https://fonts.example/fixture.css" }) },
    "./CartStatusProvider": { CartStatusProvider({ children, visualTheme }: { children: React.ReactNode; visualTheme?: string }) { return React.createElement(CartContext.Provider, { value: { visualTheme } }, children); } },
    "./FavoriteStatusProvider": { FavoriteStatusProvider({ children }: { children: React.ReactNode }) { return React.createElement(React.Fragment, null, children); } },
    "./Header": { Header({ storefront: source }: { storefront: PublicStorefront }) { const cart = useContext(CartContext); assert.ok(cart, "tenant header is mounted within the existing cart provider"); return React.createElement("header", { "data-frame-header": "tenant", "data-tenant-id": source.id, "data-cart-theme": cart.visualTheme }, source.presentation.displayName); } },
    "./checkout/CheckoutChrome": { CheckoutHeader({ storefront: source, logo }: { storefront: PublicStorefront; logo: PublicStorefrontDesign["brand"]["logo"] }) { assert.ok(useContext(CartContext), "checkout retains the cart provider"); return React.createElement("header", { "data-frame-header": "checkout", "data-tenant-id": source.id, "data-logo": logo?.url }, "Ödeme"); } },
    "./Footer": { Footer({ checkout }: { checkout: boolean }) { return React.createElement("footer", { "data-frame-footer": checkout ? "checkout" : "store" }); } },
  });
}

test("immersive Siora product mounts the normal tenant header alongside the product content", async () => {
  const load = frameLoader();
  const { StorefrontFrame: Frame } = load<{ StorefrontFrame: Component }>(new URL("./StorefrontFrame.tsx", import.meta.url));
  await withProductBrowser(async ({ container, render }) => {
    await render(React.createElement(Frame, { storefront: storefront(SIORA_STOREFRONT_ID), design, immersiveProduct: true }, React.createElement("article", { "data-product-content": "true" }, "Ürün")));
    const header = container.querySelector('[data-frame-header="tenant"]');
    assert.ok(header, "Siora product pages retain their tenant header");
    assert.equal(container.querySelectorAll("header").length, 1);
    assert.equal(header.getAttribute("data-tenant-id"), SIORA_STOREFRONT_ID);
    assert.equal(header.getAttribute("data-cart-theme"), "siora-deniz");
    assert.equal(container.querySelector('[data-frame-header="checkout"]'), null);
    assert.equal(container.querySelector(".starter-storefront")?.getAttribute("data-siora-product"), "true");
    assert.equal(container.querySelector("main [data-product-content]")?.textContent, "Ürün");
  });
});

test("Siora checkout mounts only CheckoutHeader even if the immersive product flag is supplied", async () => {
  const load = frameLoader();
  const { StorefrontFrame: Frame } = load<{ StorefrontFrame: Component }>(new URL("./StorefrontFrame.tsx", import.meta.url));
  await withProductBrowser(async ({ container, render }) => {
    await render(React.createElement(Frame, { storefront: storefront(SIORA_STOREFRONT_ID), design, checkout: true, immersiveProduct: true }, "Ödeme içeriği"));
    const header = container.querySelector('[data-frame-header="checkout"]');
    assert.ok(header);
    assert.equal(container.querySelectorAll("header").length, 1);
    assert.equal(container.querySelector('[data-frame-header="tenant"]'), null);
    assert.equal(header.getAttribute("data-logo"), design.brand.logo?.url);
    assert.equal(container.querySelector(".starter-storefront")?.getAttribute("data-storefront-checkout"), "true");
    assert.equal(container.querySelector(".starter-storefront")?.hasAttribute("data-siora-product"), false);
    assert.equal(container.querySelector("footer")?.getAttribute("data-frame-footer"), "checkout");
  });
});

test("ordinary Siora pages keep their normal tenant header without immersive product styling", async () => {
  const load = frameLoader();
  const { StorefrontFrame: Frame } = load<{ StorefrontFrame: Component }>(new URL("./StorefrontFrame.tsx", import.meta.url));
  await withProductBrowser(async ({ container, render }) => {
    await render(React.createElement(Frame, { storefront: storefront(SIORA_STOREFRONT_ID), design }, "Katalog"));
    assert.equal(container.querySelectorAll('[data-frame-header="tenant"]').length, 1);
    assert.equal(container.querySelector('[data-frame-header="checkout"]'), null);
    assert.equal(container.querySelector(".starter-storefront")?.hasAttribute("data-siora-product"), false);
    assert.equal(container.querySelector("footer")?.getAttribute("data-frame-footer"), "store");
  });
});

test("other tenants retain their normal header and checkout choice when immersiveProduct is enabled", async () => {
  const load = frameLoader();
  const { StorefrontFrame: Frame } = load<{ StorefrontFrame: Component }>(new URL("./StorefrontFrame.tsx", import.meta.url));
  await withProductBrowser(async ({ container, render }) => {
    for (const id of [ALPLER_STOREFRONT_ID, "a828862c-4cc1-475a-89cc-5fbee31eb43f", "00000000-0000-4000-8000-000000000001"]) {
      const source = storefront(id, "Diğer mağaza");
      await render(React.createElement(Frame, { storefront: source, design, immersiveProduct: true }, "Ürün"));
      assert.equal(container.querySelectorAll('[data-frame-header="tenant"]').length, 1);
      assert.equal(container.querySelector('[data-frame-header="tenant"]')?.getAttribute("data-tenant-id"), id);
      assert.equal(container.querySelector('[data-frame-header="checkout"]'), null);
      assert.equal(container.querySelector(".starter-storefront")?.hasAttribute("data-siora-product"), false);
      await render(React.createElement(Frame, { storefront: source, design, checkout: true, immersiveProduct: true }, "Ödeme"));
      assert.equal(container.querySelectorAll('[data-frame-header="checkout"]').length, 1);
      assert.equal(container.querySelector('[data-frame-header="tenant"]'), null);
    }
  });
});
