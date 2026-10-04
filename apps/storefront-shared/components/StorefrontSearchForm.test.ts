import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

test("live search debounces typing, discards obsolete replies and supports keyboard selection", async () => {
  const source = new URL("./StorefrontSearchForm.tsx", import.meta.url);
  assert.equal(existsSync(source), true, "shared live search form must exist");
  const pushes: string[] = [];
  const calls: { url: string; signal: AbortSignal; resolve(response: Response): void }[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = ((url: string, options: { signal: AbortSignal }) => new Promise<Response>(resolve => calls.push({ url, signal: options.signal, resolve }))) as typeof fetch;
  const load = componentLoader({ "next/navigation": { useRouter: () => ({ push: (href: string) => pushes.push(href) }) } });
  const { StorefrontSearchForm: Form } = load<{ StorefrontSearchForm: React.ComponentType }>(source);
  try {
    await withProductBrowser(async ({ container, render }) => {
      await render(React.createElement(Form));
      const input = container.querySelector<HTMLInputElement>('input[name="q"]')!;
      const type = async (value: string) => React.act(async () => { input.value = value; input.dispatchEvent(new window.Event("input", { bubbles: true })); });
      await type("ay");
      await type("ayakkabi");
      await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 280)); });
      assert.equal(calls.length, 1);
      assert.match(calls[0].url, /q=ayakkabi/);
      await type("nike");
      assert.equal(calls[0].signal.aborted, true);
      await React.act(async () => { calls[0].resolve(Response.json({ items: [{ id: "old", title: "OLD", href: "/urun/old", priceCents: 10, currency: "TRY" }] })); await new Promise(resolve => setTimeout(resolve, 280)); });
      assert.equal(container.textContent?.includes("OLD"), false);
      assert.equal(calls.length, 2);
      await React.act(async () => { calls[1].resolve(Response.json({ items: [{ id: "new", title: "Nike Ayakkabı", href: "/urun/nike", priceCents: 1489, currency: "TRY", imageUrl: null, imageAlt: "", available: true }] })); });
      assert.equal(input.getAttribute("aria-expanded"), "true");
      assert.ok(container.textContent?.includes("Nike Ayakkabı"));
      await React.act(async () => { input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })); });
      assert.ok(input.getAttribute("aria-activedescendant"));
      await React.act(async () => { input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
      assert.deepEqual(pushes, ["/urun/nike"]);
    });
  } finally { globalThis.fetch = previous; }
});

async function withSuggestionLinks(clientNavigation: boolean, run: (browser: { container: HTMLElement; pushes: string[]; reopen: () => Promise<void> }) => Promise<void>, onNavigate?: (href: string) => void) {
  const pushes: string[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ items: [{ id: "necklace", title: "Altın Kolye", href: "/urun/altin-kolye", priceCents: 10000, currency: "TRY", imageUrl: null, imageAlt: "", available: true }] })) as typeof fetch;
  const load = componentLoader({ "next/navigation": { useRouter: () => ({ push: (href: string) => pushes.push(href) }) } });
  const { StorefrontSearchForm: Form } = load<{ StorefrontSearchForm: React.ComponentType<Record<string, unknown>> }>(new URL("./StorefrontSearchForm.tsx", import.meta.url));
  try {
    await withProductBrowser(async ({ container, render }) => {
      let key = 0;
      const reopen = async () => {
        await render(React.createElement(Form, { key: ++key, defaultValue: "altın kolye", clientNavigation, onNavigate }));
        await React.act(async () => { container.querySelector<HTMLInputElement>('input[name="q"]')!.focus(); });
        await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 280)); });
        assert.ok(container.querySelector('a[href="/urun/altin-kolye"]'), "real suggestion is ready");
      };
      await reopen();
      await run({ container, pushes, reopen });
    });
  } finally { globalThis.fetch = previous; }
}

async function activate(container: HTMLElement, selector: string, options: MouseEventInit = {}) {
  const anchor = container.querySelector(selector);
  assert.ok(anchor, selector);
  const event = new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...options });
  await React.act(async () => { anchor.dispatchEvent(event); });
  return event;
}

test("Güzide search suggestions and all-results links navigate within the app and dismiss their panel", async () => {
  await withSuggestionLinks(true, async ({ container, pushes, reopen }) => {
    const selected = await activate(container, 'a[href="/urun/altin-kolye"]');
    assert.equal(selected.defaultPrevented, true);
    assert.deepEqual(pushes, ["/urun/altin-kolye"]);
    assert.equal(container.querySelector(".store-search-suggestions"), null);
    await reopen();
    const all = await activate(container, ".store-search-all");
    assert.equal(all.defaultPrevented, true);
    assert.deepEqual(pushes, ["/urun/altin-kolye", "/search?q=alt%C4%B1n%20kolye"]);
    assert.equal(container.querySelector(".store-search-suggestions"), null);
  });
});

test("search can defer result, keyboard and form navigation to its enclosing overlay", async () => {
  const destinations: string[] = [];
  await withSuggestionLinks(true, async ({ container, pushes, reopen }) => {
    await activate(container, 'a[href="/urun/altin-kolye"]');
    assert.deepEqual(destinations, ["/urun/altin-kolye"]);
    assert.deepEqual(pushes, [], "the overlay must consume its history entry before routing");
    await reopen();
    const input = container.querySelector<HTMLInputElement>('input[name="q"]')!;
    await React.act(async () => {
      input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });
    await React.act(async () => {
      input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    assert.equal(destinations.length, 2);
    await reopen();
    const previous = globalThis.FormData;
    try {
      globalThis.FormData = window.FormData;
      await React.act(async () => {
        container.querySelector("form")!.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      });
    } finally { globalThis.FormData = previous; }
    assert.deepEqual(destinations, ["/urun/altin-kolye", "/urun/altin-kolye", "/search?q=alt%C4%B1n%20kolye"]);
    assert.deepEqual(pushes, []);
    assert.equal(container.querySelector(".store-search-suggestions"), null);
  }, href => destinations.push(href));
});

test("Güzide client search preserves modified-click behavior and other tenant defaults do not push routes", async () => {
  await withSuggestionLinks(true, async ({ container, pushes }) => {
    const modified = await activate(container, 'a[href="/urun/altin-kolye"]', { metaKey: true });
    assert.equal(modified.defaultPrevented, false);
    assert.deepEqual(pushes, []);
  });
  await withSuggestionLinks(false, async ({ container, pushes }) => {
    const legacy = await activate(container, ".store-search-all");
    assert.equal(legacy.defaultPrevented, false);
    assert.deepEqual(pushes, []);
  });
});
