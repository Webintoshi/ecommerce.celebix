import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";
import type { ProductExplorerProps } from "./ProductExplorer";

function loadExplorer(pushes: unknown[]) {
  const load = componentLoader({
    "next/navigation": { useRouter: () => ({ push: (...args: unknown[]) => pushes.push(args) }) },
    "../../components/CartStatusProvider": { useCartStatus: () => ({ visualTheme: "siora-deniz" }) },
    "../../components/CatalogProductList": { CatalogProductList: () => null },
    "../../components/CommercePolicyProvider": { useCommercePolicy: () => ({ hidePrices: false }) },
    "./useSioraPanelHistory": { useSioraPanelHistory: () => ({ open: () => true, close: async () => true }) },
  });
  const { SioraProductExplorer: Explorer } = load<{ SioraProductExplorer: React.ComponentType<ProductExplorerProps> }>(new URL("../themes/siora/SioraProductExplorer.tsx", import.meta.url));
  return Explorer;
}

const typeSearch = (input: HTMLInputElement, value: string) => React.act(async () => {
  input.value = value;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
});

async function submit(form: HTMLFormElement) {
  const previousFormData = globalThis.FormData;
  try {
    globalThis.FormData = window.FormData;
    await React.act(async () => {
      form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    });
  } finally {
    globalThis.FormData = previousFormData;
  }
}

test("Siora catalog search keeps a long Turkish input and reports the limit before navigating", async () => {
  const pushes: unknown[] = [];
  const Explorer = loadExplorer(pushes);

  await withProductBrowser(async ({ container, render }) => {
    await render(React.createElement(Explorer, {
      catalog: { title: "Alt Giyim", slug: "alt-giyim", navigation: { items: [] } },
      selection: { query: "", order: "featured", filter: "available", offset: 24 },
      locale: "tr", products: [], total: 0, nextOffset: null, path: "/kategori/alt-giyim",
      cardStyle: "editorial", imageRatio: "square",
    }));
    assert.equal(container.querySelector("h1")?.textContent, "Alt Giyim");

    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    const longQuery = "ş".repeat(51);
    await typeSearch(input, longQuery);
    await submit(input.form!);
    assert.equal(input.value, longQuery);
    assert.equal(input.getAttribute("aria-invalid"), "true");
    assert.match(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent ?? "", /kısalt/iu);
    assert.equal(document.activeElement, input);
    assert.deepEqual(pushes, []);

    const validQuery = longQuery.slice(1);
    await typeSearch(input, validQuery);
    assert.equal(input.getAttribute("aria-invalid"), "false");
    await submit(input.form!);
    assert.deepEqual(pushes, [[`/kategori/alt-giyim?q=${encodeURIComponent(validQuery)}&filter=available`, { scroll: false }]]);
  });
});

test("Siora filters use the applied query and keep an unsubmitted search draft", async () => {
  const pushes: unknown[] = [];
  const Explorer = loadExplorer(pushes);

  await withProductBrowser(async ({ container, render, click }) => {
    const props: ProductExplorerProps = {
      selection: { query: "elbise", order: "featured", filter: "all", offset: 24 },
      locale: "tr", products: [], total: 0, nextOffset: null, path: "/urunler",
      cardStyle: "editorial", imageRatio: "square",
    };
    await render(React.createElement(Explorer, props));
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    const dialog = container.querySelector<HTMLDialogElement>("dialog")!;
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => { dialog.open = false; };

    const longQuery = "ş".repeat(51);
    await typeSearch(input, longQuery);
    await click(".siora-filter-trigger");
    assert.equal(dialog.open, true);
    assert.equal(input.getAttribute("aria-invalid"), "false");
    await click('input[name="filter"][value="available"]');
    await submit(dialog.querySelector("form")!);
    assert.equal(dialog.open, false);
    assert.deepEqual(pushes, [["/urunler?q=elbise&filter=available", { scroll: false }]]);

    const filteredProps: ProductExplorerProps = {
      ...props,
      selection: { ...props.selection, filter: "available", offset: 0 },
    };
    await render(React.createElement(Explorer, filteredProps));
    assert.equal(input.value, longQuery);
    assert.equal(input.getAttribute("aria-invalid"), "false");
    await typeSearch(input, "etek");
    await click(".siora-filter-trigger");
    await click('input[name="sort"][value="title-asc"]');
    await submit(dialog.querySelector("form")!);
    assert.deepEqual(pushes[1], ["/urunler?q=elbise&filter=available&sort=title-asc", { scroll: false }]);

    await render(React.createElement(Explorer, {
      ...filteredProps,
      selection: { ...filteredProps.selection, query: "bluz" },
    }));
    assert.equal(input.value, "bluz");
  });
});
