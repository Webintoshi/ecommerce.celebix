import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import * as jsxRuntime from "react/jsx-runtime";
import * as lucide from "lucide-react";
import { Window } from "happy-dom";
import ts from "typescript";

type ThumbnailProps = Readonly<{ imageUrl?: string | null; className: string }>;

async function mountedThumbnail(verify: (
  container: HTMLElement,
  browser: Window,
  render: (imageUrl?: string | null) => Promise<void>,
) => Promise<void>) {
  const browser = new Window({ url: "https://panel.example.test/products" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: browser, document: browser.document, navigator: browser.navigator,
    HTMLElement: browser.HTMLElement, Event: browser.Event, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const source = await readFile(new URL("../shared/ProductThumbnail.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "lucide-react") return lucide;
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
    throw new Error(`unexpected_import:${name}`);
  }, compiled, compiled.exports);
  const Component = compiled.exports.ProductThumbnail as React.ComponentType<ThumbnailProps>;
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const render = async (imageUrl?: string | null) => {
    await act(async () => root.render(createElement(Component, { imageUrl, className: "productFrame" })));
  };
  try {
    await verify(container as unknown as HTMLElement, browser, render);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of globals) descriptor
      ? Object.defineProperty(globalThis, key, descriptor)
      : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
}

test("product photos load lazily inside a decorative fixed frame", async () => {
  await mountedThumbnail(async (container, _browser, render) => {
    await render("https://media.example.test/product.webp");
    const frame = container.querySelector(".productFrame")!;
    const image = frame.querySelector("img")!;
    assert.equal(image.getAttribute("src"), "https://media.example.test/product.webp");
    assert.equal(image.getAttribute("alt"), "");
    assert.equal(frame.getAttribute("aria-hidden"), "true");
    assert.equal(image.getAttribute("loading"), "lazy");
    assert.equal(image.getAttribute("decoding"), "async");
    assert.equal(image.getAttribute("width"), "40");
    assert.equal(image.getAttribute("height"), "40");
    assert.equal(frame.textContent, "");
  });
});

test("missing product photos use the package fallback without a broken image request", async () => {
  await mountedThumbnail(async (container, _browser, render) => {
    for (const imageUrl of [undefined, null, "", "   "]) {
      await render(imageUrl);
      assert.equal(container.querySelector("img") === null, true);
      assert.ok(container.querySelector(".productFrame svg"));
    }
  });
});

test("a failed photo preserves its frame and each changed URL gets a fresh attempt", async () => {
  await mountedThumbnail(async (container, browser, render) => {
    const first = "https://media.example.test/first.webp";
    const second = "https://media.example.test/second.webp";
    await render(first);
    const frame = container.querySelector(".productFrame");
    for (const imageUrl of [first, second, first]) {
      await render(imageUrl);
      const image = container.querySelector("img")!;
      assert.ok(image, "changing the URL resets its previous error state");
      assert.equal(image.getAttribute("src"), imageUrl);
      await act(async () => image.dispatchEvent(new browser.Event("error") as unknown as Event));
      assert.equal(container.querySelector("img") === null, true);
      assert.ok(container.querySelector(".productFrame svg"));
      assert.equal(container.querySelector(".productFrame") === frame, true);
    }
  });
});
