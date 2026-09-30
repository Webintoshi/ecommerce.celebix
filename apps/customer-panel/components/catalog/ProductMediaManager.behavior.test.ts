import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";

async function withMediaManager(
  upload: (file: File) => Promise<unknown>,
  verify: (container: HTMLElement, browser: Window) => Promise<void>,
) {
  const browser = new Window({ url: "https://panel.example.test/products/example" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  const browserUrl = browser.URL as unknown as typeof URL;
  browserUrl.createObjectURL = () => "blob:product-media-test";
  browserUrl.revokeObjectURL = () => {};
  for (const [key, value] of Object.entries({
    window: browser, document: browser.document, navigator: browser.navigator,
    HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement,
    HTMLButtonElement: browser.HTMLButtonElement, Event: browser.Event,
    File: browser.File, FormData: browser.FormData, URL: browserUrl,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const source = await readFile(new URL("./ProductMediaManager.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  let nextId = 0;
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "lucide-react") return new Proxy({}, { get: () => () => createElement("svg") });
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
    if (name === "@/lib/catalog-ui/media-client") return {
      ProductMediaApiError: class ProductMediaApiError extends Error {},
      productMediaApi: {
        list: async () => [],
        upload: async (_productId: string, input: { file: File }) => {
          await upload(input.file);
          return { media: { id: `media-${++nextId}`, status: "active", sortOrder: nextId, altText: "", publicUrl: "" } };
        },
      },
    };
    throw new Error(`unexpected_import:${name}`);
  }, compiled, compiled.exports);
  const { createRoot } = await import("react-dom/client");
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  try {
    await act(async () => root.render(createElement(compiled.exports.ProductMediaManager as React.ComponentType<{ productId: string; canManage: boolean }>, { productId: "product-1", canManage: true })));
    await verify(container as unknown as HTMLElement, browser);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of globals) descriptor
      ? Object.defineProperty(globalThis, key, descriptor)
      : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
}

async function choose(container: HTMLElement, browser: Window, files: File[]) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  assert.equal(input.multiple, true, "bilgisayar dosya seçicisi çoklu seçime izin vermeli");
  await act(async () => {
    Object.defineProperty(input, "files", { configurable: true, value: files });
    input.dispatchEvent(new browser.Event("change", { bubbles: true }) as unknown as Event);
  });
}

async function submit(container: HTMLElement, browser: Window) {
  const form = container.querySelector("form.uploadForm")!;
  await act(async () => {
    form.dispatchEvent(new browser.SubmitEvent("submit", { bubbles: true, cancelable: true }) as unknown as Event);
  });
}

test("existing product accepts several images in one selection and uploads them in order", async () => {
  const uploaded: string[] = [];
  await withMediaManager(async (file) => { uploaded.push(file.name); }, async (container, browser) => {
    await choose(container, browser, [
      new browser.File(["first"], "first.webp", { type: "image/webp" }) as unknown as File,
      new browser.File(["second"], "second.png", { type: "image/png" }) as unknown as File,
    ]);
    await submit(container, browser);
    assert.deepEqual(uploaded, ["first.webp", "second.png"]);
    assert.equal(container.querySelectorAll("article.card").length, 2);
  });
});

test("a failed image stops the batch without removing images already uploaded", async () => {
  const attempted: string[] = [];
  await withMediaManager(async (file) => {
    attempted.push(file.name);
    if (file.name === "second.webp") throw new Error("upload_failed");
  }, async (container, browser) => {
    await choose(container, browser, ["first.webp", "second.webp", "third.webp"].map((name) =>
      new browser.File([name], name, { type: "image/webp" }) as unknown as File,
    ));
    await submit(container, browser);
    assert.deepEqual(attempted, ["first.webp", "second.webp"]);
    assert.equal(container.querySelectorAll("article.card").length, 1);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /1 görsel yüklendi/);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /yüklenmeyen görseli yeniden seçin/);
    assert.match(container.querySelector('[role="alert"] button')?.textContent ?? "", /Galeriyi yenile/);
    assert.match(container.textContent ?? "", /Kalan 1 görsel seçili/);
  });
});

test("selection above the product's 16-image limit is rejected before upload", async () => {
  let uploads = 0;
  await withMediaManager(async () => { uploads++; }, async (container, browser) => {
    await choose(container, browser, Array.from({ length: 17 }, (_, index) =>
      new browser.File(["image"], `${index}.webp`, { type: "image/webp" }) as unknown as File,
    ));
    assert.equal(uploads, 0);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /en fazla 16 görsel/);
    assert.equal(container.querySelector("form.uploadForm")?.getAttribute("data-expanded"), "false");
  });
});
