import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";
import { categoryPath, localizeStorefrontPath, productIndexPath } from "../lib/storefront-routes.ts";

const navigation = { items: [{ name: "Kolyeler", slug: "kolyeler", children: [] }] };
const load = componentLoader({
  "next/link": { __esModule: true, default: ({ prefetch: _prefetch, ...props }: Record<string, unknown>) => React.createElement("a", props) },
  "next/navigation": { useRouter: () => ({ push: () => assert.fail("panel routes through its owner") }) },
  "@/lib/storefront-routes.ts": { categoryPath, localizeStorefrontPath, productIndexPath },
});

test("Güzide search locks only the current layer, focuses search and traps keyboard before Escape", async () => {
  const { GuzideSearchPanel: Panel } = load<{ GuzideSearchPanel: React.ComponentType<Record<string, unknown>> }>(new URL("../themes/guzide/GuzideSearchPanel.tsx", import.meta.url));
  let closed = 0;
  await withProductBrowser(async ({ container, render }) => {
    document.body.style.overflow = "clip";
    await render(React.createElement(Panel, { navigation, locale: "tr", onClose: () => closed++, onNavigate: () => {} }));
    assert.equal(document.body.style.overflow, "hidden");
    const input = container.querySelector<HTMLInputElement>('input[name="q"]')!;
    assert.equal(document.activeElement, input);
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    const last = container.querySelector<HTMLElement>('a[href="/kategori/kolyeler"]')!;
    await React.act(async () => {
      last.focus();
      last.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    });
    assert.equal(document.activeElement, container.querySelector('button[aria-label="Aramayı kapat"]'));
    await React.act(async () => {
      input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    assert.equal(closed, 1);
    await render(null);
    assert.equal(document.body.style.overflow, "clip", "the original page scroll setting is restored");
  });
});

test("Güzide search shows real suggestions on the current page and dismisses before product navigation", async () => {
  const { GuzideSearchPanel: Panel } = load<{ GuzideSearchPanel: React.ComponentType<Record<string, unknown>> }>(new URL("../themes/guzide/GuzideSearchPanel.tsx", import.meta.url));
  const destinations: string[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ items: [{ id: "gold", title: "14 Ayar Altın Kolye", href: "/urun/altin-kolye", priceCents: 864600, currency: "TRY", available: true, imageUrl: "https://media.example.test/kolye.webp", imageAlt: "Altın Kolye" }] })) as typeof fetch;
  try {
    await withProductBrowser(async ({ container, render, click }) => {
      await render(React.createElement(Panel, { navigation, locale: "tr", onClose: () => {}, onNavigate: (href: string) => destinations.push(href) }));
      const input = container.querySelector<HTMLInputElement>('input[name="q"]')!;
      await React.act(async () => {
        input.value = "kolye";
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 280));
      });
      await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 280)); });
      assert.ok(container.textContent?.includes("14 Ayar Altın Kolye"));
      assert.ok(container.querySelector('a[href="/urun/altin-kolye"] img'));
      assert.equal(window.location.pathname, "/products/example", "typing does not navigate");
      await click('a[href="/urun/altin-kolye"]');
      assert.deepEqual(destinations, ["/urun/altin-kolye"]);
    });
  } finally { globalThis.fetch = previous; }
});
