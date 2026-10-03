import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { createDefaultStarterThemeComposition } from "@celebix/saas-contracts";
import { normalizeProductDescriptionHtml } from "@celebix/platform-config/src/product-description-rich-text.ts";
import { availableProductsFirst } from "../lib/public-product-ordering.ts";
import { categoryPath, productIndexPath } from "../lib/storefront-routes.ts";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

const product = {
  id: "20000000-0000-4000-8000-000000000001", slug: "ring", title: "Yüzük", currency: "TRY", status: "active", priceCents: 1000, available: true,
  variants: [], media: [], merchandising: { highlights: [], certifications: [], sizeGuide: { heading: "Yüzük ölçüsü nasıl alınır?", body: "İşletmenin ölçü açıklaması" } },
};
type Component = React.ComponentType<Record<string, unknown>>;

test("guide opens a focused modal, traps keyboard focus, closes with Escape and returns focus", async () => {
  const { ProductDetailPreview } = componentLoader()<{ ProductDetailPreview: Component }>(new URL("../../../packages/storefront-design-ui/src/ProductDetailPresentation.tsx", import.meta.url));
  await withProductBrowser(async ({ container, render }) => {
    await render(React.createElement(ProductDetailPreview, { product, options: createDefaultStarterThemeComposition().productDetail, cart: { showQuantitySelector: true }, mode: "desktop" }));
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
    assert.ok(trigger, "guide is an actionable modal trigger");
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await React.act(async () => trigger.click());
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    assert.ok(dialog);
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.ok(dialog.textContent?.includes("İşletmenin ölçü açıklaması"));
    const close = dialog.querySelector<HTMLButtonElement>('button[aria-label="Rehberi kapat"]');
    assert.ok(close);
    assert.equal(document.activeElement, close);
    await React.act(async () => close.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
    assert.equal(document.activeElement, close, "single control remains inside the dialog");
    await React.act(async () => close.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, trigger);
    assert.equal(document.body.style.overflow, "");
    assert.equal(container.hasAttribute("inert"), false);
  });
});

test("design hides guide control when disabled or when no guide is assigned", async () => {
  const { ProductDetailPreview } = componentLoader()<{ ProductDetailPreview: Component }>(new URL("../../../packages/storefront-design-ui/src/ProductDetailPresentation.tsx", import.meta.url));
  await withProductBrowser(async ({ container, render }) => {
    const options = createDefaultStarterThemeComposition().productDetail;
    await render(React.createElement(ProductDetailPreview, { product, options: { ...options, showSizeGuide: false }, cart: { showQuantitySelector: true }, mode: "mobile" }));
    assert.equal(container.querySelector('button[aria-haspopup="dialog"]'), null);
    await render(React.createElement(ProductDetailPreview, { product: { ...product, merchandising: undefined }, options, cart: { showQuantitySelector: true }, mode: "mobile" }));
    assert.equal(container.querySelector('button[aria-haspopup="dialog"]'), null);
  });
});


test("public guide renders a sanitized merchant table and does not expose executable markup", async () => {
  const loadDialog = componentLoader();
  const { ProductSizeGuideDialog } = loadDialog<{ ProductSizeGuideDialog: Component }>(new URL("../../../packages/storefront-design-ui/src/ProductSizeGuideDialog.tsx", import.meta.url));
  const load = componentLoader({
    "@celebix/storefront-design-ui": { ProductSizeGuideDialog },
    "@/lib/product-description.ts": { renderStarterProductDescription: normalizeProductDescriptionHtml },
  });
  const { ProductSizeGuide } = load<{ ProductSizeGuide: Component }>(new URL("./ProductInformationDisclosures.tsx", import.meta.url));
  await withProductBrowser(async ({ container, render }) => {
    await render(React.createElement(ProductSizeGuide, { heading: "Ölçü rehberi", body: '<table><tr><th>Ölçü</th><td>İşletme ölçüsü</td></tr></table><script>alert(1)</script><a href="javascript:alert(1)">Bağlantı</a>' }));
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
    assert.ok(trigger);
    await React.act(async () => trigger.click());
    const dialog = document.querySelector('[role="dialog"]');
    assert.equal(dialog?.querySelector("td")?.textContent, "İşletme ölçüsü");
    assert.equal(dialog?.querySelector("script"), null);
    assert.equal(dialog?.querySelector('a[href^="javascript:"]'), null);
  });
});


test("Guzide theme presents the category guide as the same modal near its purchase area", async () => {
  const loadDialog = componentLoader();
  const { ProductSizeGuideDialog } = loadDialog<{ ProductSizeGuideDialog: Component }>(new URL("../../../packages/storefront-design-ui/src/ProductSizeGuideDialog.tsx", import.meta.url));
  const wrapper = ({ children }: { children?: React.ReactNode }) => React.createElement("section", null, children);
  const load = componentLoader({
    "@celebix/storefront-design-ui": { ProductSizeGuideDialog },
    "@/lib/product-description.ts": { renderStarterProductDescription: normalizeProductDescriptionHtml },
    "@/lib/public-product-ordering.ts": { availableProductsFirst },
    "@/lib/storefront-routes.ts": { categoryPath, productIndexPath },
    "../../components/ProductVariantMedia": { ProductVariantMediaProvider: wrapper },
    "./GuzideProductPurchase": { GuzideProductPurchase: wrapper },
    "./GuzideProductGallery": { GuzideProductGallery: () => null },
    "./GuzideProductReturn": { GuzideProductReturn: () => null },
    "../../components/ProductCard": { ProductCard: () => null },
    "../../components/ProductApprovedReviews": { ProductApprovedReviews: () => null },
  });
  const { GuzideProductDetailExperience } = load<{ GuzideProductDetailExperience: Component }>(new URL("../themes/guzide/GuzideProductDetailExperience.tsx", import.meta.url));
  await withProductBrowser(async ({ container, render }) => {
    await render(React.createElement(GuzideProductDetailExperience, { product, locale: "tr", relatedProducts: [], publishedPolicies: [], options: { ...createDefaultStarterThemeComposition().productDetail, showBreadcrumbs: false }, showQuantitySelector: true }));
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]');
    assert.ok(trigger, "Guzide guide uses modal trigger");
    assert.equal(trigger.textContent, "Yüzük ölçüsü nasıl alınır?↗");
    await React.act(async () => trigger.click());
    assert.ok(document.querySelector('[role="dialog"]')?.textContent?.includes("İşletmenin ölçü açıklaması"));
  });
});
