import assert from "node:assert/strict";
import test from "node:test";
import React, { act, createElement, useState } from "react";
import { Window } from "happy-dom";
import { compile } from "../../lib/mira-final-test-support.ts";
import { dragCatalogItem, installCatalogSortRects } from "./catalog-sort-test-utils.ts";

test("default variant builder retains a pending barcode reservation when rows are dragged", async () => {
  const browser = new Window({ url: "https://panel.example.test/products/new" });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator,
    HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, HTMLButtonElement: browser.HTMLButtonElement,
    Element: browser.Element, Node: browser.Node, Document: browser.Document, MouseEvent: browser.MouseEvent,
    KeyboardEvent: browser.KeyboardEvent, Event: browser.Event, MutationObserver: browser.MutationObserver,
    ResizeObserver: browser.ResizeObserver, getComputedStyle: browser.getComputedStyle.bind(browser),
    requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
    IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const host = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(host as never);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(host as never);
  const restoreRects = installCatalogSortRects(browser, host as unknown as HTMLElement, "list");
  let finish!: (barcode: string) => void;
  let calls = 0;
  const { ProductVariantBuilder, emptyVariant } = compile("components/catalog-onboarding/ProductVariantBuilder.tsx", {
    "@/lib/barcode-labels/reserve-internal": { reserveInternalBarcode: () => { calls++; return new Promise<string>(resolve => { finish = resolve; }); } },
  });
  function Harness() {
    const [variants, setVariants] = useState(() => [
      { ...emptyVariant("Kırmızı"), localId: "red" },
      { ...emptyVariant("Mavi"), localId: "blue" },
    ]);
    return createElement(ProductVariantBuilder, { variants, onChange: setVariants, allowMultiple: true });
  }
  try {
    await act(async () => root.render(createElement(Harness)));
    const red = host.querySelector('[data-sort-id="red"]')!;
    const originalInput = red.querySelector<HTMLInputElement>('input[name="barcode"]')!;
    const generate = red.querySelector<HTMLButtonElement>('button[aria-label="Dahili barkod oluştur"]')!;
    await act(async () => generate.click());
    assert.equal(calls, 1);
    await dragCatalogItem(browser, host as unknown as HTMLElement, "red", "blue");
    assert.deepEqual([...host.querySelectorAll("[data-sort-id]")].map(row => row.getAttribute("data-sort-id")), ["blue", "red"]);
    assert.equal(host.querySelector('[data-sort-id="red"] input[name="barcode"]'), originalInput);
    await act(async () => finish("9800000000007"));
    assert.equal(originalInput.value, "9800000000007", "the returned barcode belongs to the same stable row after a move");
    assert.equal(host.querySelector<HTMLInputElement>('[data-sort-id="blue"] input[name="barcode"]')!.value, "");
  } finally {
    await act(async () => root.unmount()); restoreRects();
    for (const [key, value] of previous) value ? Object.defineProperty(globalThis, key, value) : Reflect.deleteProperty(globalThis, key);
    browser.happyDOM.abort();
  }
});
