import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

type Component = React.ComponentType<Record<string, unknown>>;
const selection = { query: "", filter: "all", order: "featured", offset: 24 };
const catalog = { title: "Kolyeler", slug: "kolyeler", navigation: { items: [{ name: "Kolyeler", slug: "kolyeler", children: [{ name: "Taşlı Kolyeler", slug: "tasli-kolyeler", children: [] }] }] } };
const base = { products: [{ id: "first" }, { id: "second" }], locale: "tr", cardStyle: "compact", imageRatio: "portrait", selection, total: 48, nextOffset: 48, path: "/kategori/kolyeler", catalog, preserveOrder: true };

async function withExplorer(run: (browser: Parameters<Parameters<typeof withProductBrowser>[0]>[0] & { pushes: Array<{ href: string; options: unknown }>; rerender: (props: Record<string, unknown>) => Promise<void> }) => Promise<void>) {
  const pushes: Array<{ href: string; options: unknown }> = [];
  const load = componentLoader({
    "next/link": { __esModule: true, default: ({ children, prefetch: _prefetch, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => React.createElement("a", props, children) },
    "next/navigation": { useRouter: () => ({ push(href: string, options: unknown) { pushes.push({ href, options }); } }) },
    "../../components/ProductGrid": { ProductGrid: ({ products, preserveOrder }: { products: readonly { id: string }[]; preserveOrder: boolean }) => React.createElement("div", { "data-test-products": products.map(({ id }) => id).join(","), "data-preserve-order": preserveOrder }) },
  });
  const { GuzideProductExplorer: Explorer } = load<{ GuzideProductExplorer: Component }>(new URL("../themes/guzide/GuzideProductExplorer.tsx", import.meta.url));
  await withProductBrowser(async (browser) => {
    const originalFormData = globalThis.FormData;
    Object.assign(globalThis, { FormData: window.FormData });
    const rerender = (props: Record<string, unknown>) => browser.render(React.createElement(Explorer, { ...base, ...props }));
    try {
      await rerender({});
      await run({ ...browser, pushes, rerender });
    } finally { Object.assign(globalThis, { FormData: originalFormData }); }
  });
}

test("Güzide catalog presents the real title, admin child tabs, server order and client pagination", async () => {
  await withExplorer(async ({ container }) => {
    assert.equal(container.querySelector("h1")?.textContent, "Kolyeler");
    assert.equal(container.querySelector('nav[aria-label="Kategoriler"] a[aria-current="page"]')?.getAttribute("href"), "/kategori/kolyeler");
    assert.ok(container.querySelector('a[href="/kategori/tasli-kolyeler"]'));
    assert.equal(container.querySelector("[data-test-products]")?.getAttribute("data-test-products"), "first,second");
    assert.equal(container.querySelector("[data-test-products]")?.getAttribute("data-preserve-order"), "true");
    assert.deepEqual([...container.querySelectorAll('nav[aria-label="Ürün sayfaları"] a')].map(a => a.getAttribute("href")), ["/kategori/kolyeler", "/kategori/kolyeler?offset=48"]);
    assert.ok(!container.textContent?.includes("gram"));
  });
});

test("Güzide filter applies the existing availability contract and resets paging, retaining server search and sort", async () => {
  await withExplorer(async ({ container, click, pushes, rerender }) => {
    await rerender({ selection: { query: "altın", filter: "all", order: "price-desc", offset: 24 } });
    await click('details[data-catalog-panel="filter"] summary');
    await click('input[name="filter"][value="available"]');
    await click('details[data-catalog-panel="filter"] button[type="submit"]');
    assert.deepEqual(pushes, [{ href: "/kategori/kolyeler?q=alt%C4%B1n&filter=available&sort=price-desc", options: { scroll: false } }]);
    assert.equal(container.querySelector<HTMLDetailsElement>('details[data-catalog-panel="filter"]')?.open, false);
    assert.equal(document.activeElement, container.querySelector('details[data-catalog-panel="filter"] summary'));
  });
});

test("Güzide sort applies only the supported order, and cancels draft choices with Escape", async () => {
  await withExplorer(async ({ container, click, pushes }) => {
    await click('details[data-catalog-panel="sort"] summary');
    await click('input[name="sort"][value="price-asc"]');
    await React.act(async () => { container.querySelector('details[data-catalog-panel="sort"]')?.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    assert.equal(container.querySelector<HTMLDetailsElement>('details[data-catalog-panel="sort"]')?.open, false);
    assert.equal(pushes.length, 0);
    await click('details[data-catalog-panel="sort"] summary');
    assert.equal(container.querySelector<HTMLInputElement>('input[name="sort"][value="featured"]')?.checked, true);
    await click('input[name="sort"][value="price-asc"]');
    await click('details[data-catalog-panel="sort"] button[type="submit"]');
    assert.equal(pushes[0]?.href, "/kategori/kolyeler?sort=price-asc");
  });
});

test("Güzide panels exclude one another and new server selection resets drafts", async () => {
  await withExplorer(async ({ container, click, rerender }) => {
    await click('details[data-catalog-panel="filter"] summary');
    await click('input[name="filter"][value="discounted"]');
    await click('details[data-catalog-panel="sort"] summary');
    assert.equal(container.querySelector<HTMLDetailsElement>('details[data-catalog-panel="filter"]')?.open, false);
    await rerender({ selection: { ...selection, filter: "available", order: "title-asc" } });
    assert.equal(container.querySelector<HTMLDetailsElement>('details[data-catalog-panel="sort"]')?.open, false);
    await click('details[data-catalog-panel="filter"] summary');
    assert.equal(container.querySelector<HTMLInputElement>('input[name="filter"][value="available"]')?.checked, true);
  });
});

test("Güzide empty filtered results offer clearing without manufacturing products", async () => {
  await withExplorer(async ({ container, rerender, click, pushes }) => {
    await rerender({ products: [], total: 0, nextOffset: null, selection: { ...selection, filter: "discounted", offset: 0 } });
    assert.match(container.textContent ?? "", /Sonuç bulunamadı/u);
    assert.equal(container.querySelector("[data-test-products]"), null);
    await click('button[data-catalog-clear]');
    assert.equal(pushes[0]?.href, "/kategori/kolyeler");
    assert.equal(container.querySelector('nav[aria-label="Ürün sayfaları"]'), null);
  });
});
