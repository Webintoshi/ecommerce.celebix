import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import React from "react";
import { Window } from "happy-dom";
import ts from "typescript";

const require = createRequire(import.meta.url);

export function componentLoader(overrides: Readonly<Record<string, unknown>> = {}) {
  const cache = new Map<string, unknown>();
  function load<T>(filename: URL): T {
    if (cache.has(filename.href)) return cache.get(filename.href) as T;
    assert.ok(existsSync(filename), `component exists: ${filename.pathname}`);
    const output = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    cache.set(filename.href, module.exports);
    Function("require", "module", "exports", output)((name: string) => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name.startsWith(".")) {
        for (const extension of /\.tsx?$/.test(name) ? [""] : [".tsx", ".ts"]) {
          const target = new URL(name + extension, filename);
          if (existsSync(fileURLToPath(target))) return load(target);
        }
      }
      return require(name);
    }, module, module.exports);
    return module.exports as T;
  }
  return load;
}

export async function withProductBrowser(run: (browser: Readonly<{
  container: HTMLElement;
  render: (element: React.ReactNode) => Promise<void>;
  click: (selector: string) => Promise<void>;
  change: (selector: string, value: string) => Promise<void>;
}>) => Promise<void>) {
  const window = new Window({ url: "https://fixture.invalid/products/example" });
  const previous = { window: globalThis.window, document: globalThis.document, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  Object.assign(globalThis, { window, document: window.document, requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window), IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  try {
    await run({
      container: container as unknown as HTMLElement,
      render: async (element) => { await React.act(async () => root.render(element)); },
      click: async (selector) => { const element = container.querySelector(selector); assert.ok(element, selector); await React.act(async () => (element as unknown as HTMLElement).click()); },
      change: async (selector, value) => {
        const element = container.querySelector(selector); assert.ok(element, selector);
        await React.act(async () => { const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set; setter?.call(element, value); element.dispatchEvent(new window.Event("change", { bubbles: true })); });
      },
    });
  } finally {
    await React.act(async () => root.unmount());
    await window.happyDOM.close();
    Object.assign(globalThis, previous);
  }
}
