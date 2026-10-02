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
