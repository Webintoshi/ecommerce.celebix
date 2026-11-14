import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";
import type { ProductExplorerProps } from "./ProductExplorer";

test("Siora catalog search keeps a long Turkish input and reports the limit before navigating", async () => {
  const pushes: unknown[] = [];
  const load = componentLoader({
    "next/navigation": { useRouter: () => ({ push: (...args: unknown[]) => pushes.push(args) }) },
    "../../components/CartStatusProvider": { useCartStatus: () => ({ visualTheme: "siora-deniz" }) },
    "../../components/CatalogProductList": { CatalogProductList: () => null },
    "../../components/CommercePolicyProvider": { useCommercePolicy: () => ({ hidePrices: false }) },
    "./useSioraPanelHistory": { useSioraPanelHistory: () => ({ open: () => true, close: async () => true }) },
  });
  const { SioraProductExplorer: Explorer } = load<{ SioraProductExplorer: React.ComponentType<ProductExplorerProps> }>(new URL("../themes/siora/SioraProductExplorer.tsx", import.meta.url));

  await withProductBrowser(async ({ container, render }) => {
    await render(React.createElement(Explorer, {
      catalog: { title: "Alt Giyim", slug: "alt-giyim", navigation: { items: [] } },
      selection: { query: "", order: "featured", filter: "available", offset: 24 },
      locale: "tr", products: [], total: 0, nextOffset: null, path: "/kategori/alt-giyim",
      cardStyle: "editorial", imageRatio: "square",
    }));
    assert.equal(container.querySelector("h1")?.textContent, "Alt Giyim");

    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    const type = (value: string) => React.act(async () => {
      input.value = value;
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    const submit = async () => {
      const previousFormData = globalThis.FormData;
      try {
        globalThis.FormData = window.FormData;
        await React.act(async () => {
          input.form!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
        });
      } finally {
        globalThis.FormData = previousFormData;
      }
    };
    const longQuery = "ş".repeat(51);
    await type(longQuery);
    await submit();
    assert.equal(input.value, longQuery);
    assert.equal(input.getAttribute("aria-invalid"), "true");
    assert.match(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent ?? "", /kısalt/iu);
    assert.equal(document.activeElement, input);
    assert.deepEqual(pushes, []);

    const validQuery = longQuery.slice(1);
    await type(validQuery);
    assert.equal(input.getAttribute("aria-invalid"), "false");
    await submit();
    assert.deepEqual(pushes, [[`/kategori/alt-giyim?q=${encodeURIComponent(validQuery)}&filter=available`, { scroll: false }]]);
  });
});
