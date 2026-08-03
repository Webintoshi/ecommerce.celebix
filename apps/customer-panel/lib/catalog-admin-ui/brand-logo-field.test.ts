import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Window } from "happy-dom";
import * as React from "react";
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

const ROOT = new URL("../../", import.meta.url);
const LOGO = "20000000-0000-4000-8000-000000000001";
const STORE = "10000000-0000-4000-8000-000000000001";
const NOW = "2026-08-03T12:00:00.000Z";
const logo = Object.freeze({ id: LOGO, storeId: STORE, kind: "logo", objectKey: `stores/${STORE}/storefront/logo/${LOGO}.webp`, publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/logo/${LOGO}.webp`, mediaType: "image/webp", altText: "Güzide Kuyumcu", width: 480, height: 160, byteSize: 2048, status: "active", createdAt: NOW, updatedAt: NOW, version: 1 });

function installDomGlobals(window: Window): () => void {
  const replacements = { window, document: window.document, navigator: window.navigator, Node: window.Node, Element: window.Element, HTMLElement: window.HTMLElement, HTMLInputElement: window.HTMLInputElement, Event: window.Event, MouseEvent: window.MouseEvent, MutationObserver: window.MutationObserver, getComputedStyle: window.getComputedStyle.bind(window), requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window), IS_REACT_ACT_ENVIRONMENT: true } as const;
  const originals = new Map<PropertyKey, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(replacements)) { originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value }); }
  return () => { for (const [name, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, name, descriptor) : Reflect.deleteProperty(globalThis, name); };
}

async function compileField() {
  const source = await readFile(new URL("components/catalog-admin/BrandLogoField.tsx", ROOT), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const styles = new Proxy({}, { get: (_target, property) => property === "__esModule" ? true : property === "default" ? styles : String(property) });
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return React;
    if (specifier === "./catalog-admin-console.module.css") return styles;
    throw new Error(`unexpected_brand_logo_field_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  return compiled.exports.BrandLogoField as (props: Readonly<Record<string, unknown>>) => ReactNode;
}

test("mounted brand logo field uploads, previews, selects and removes without archiving", async () => {
  const window = new Window({ url: "https://panel.example.test/products/brands/new" });
  const restore = installDomGlobals(window);
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  const changes: Array<string | undefined> = [];
  const uploads: File[] = [];
  try {
    const Field = await compileField();
    const properties = { assets: [logo], selectedId: LOGO, disabled: false, brandName: "Güzide Kuyumcu", onChange(value: string | undefined) { changes.push(value); }, async onUpload(file: File) { uploads.push(file); } };
    await act(async () => { root.render(createElement(Field, properties)); });
    const input = container.querySelector('input[aria-label="Marka logosu"]') as HTMLInputElement | null;
    const preview = container.querySelector('img[alt="Güzide Kuyumcu"]');
    assert.ok(input);
    assert.ok(preview);
    assert.equal(input.accept, "image/jpeg,image/png,image/webp");
    const file = new window.File([new Uint8Array([1, 2, 3])], "logo.webp", { type: "image/webp" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => { (input.dispatchEvent as (event: unknown) => boolean)(new window.Event("change", { bubbles: true })); });
    const upload = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Logoyu yükle");
    assert.ok(upload);
    await act(async () => { upload.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); await Promise.resolve(); });
    assert.equal(uploads.length, 1);
    const remove = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Logoyu kaldır");
    assert.ok(remove);
    await act(async () => { remove.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    assert.deepEqual(changes, [undefined]);
    assert.equal(container.textContent?.includes("Arşivle"), false);
  } finally {
    await act(async () => { root.unmount(); });
    restore();
    window.close();
  }
});

test("brand logo field preserves and can explicitly remove an existing logo while the library is unavailable", async () => {
  const window = new Window({ url: "https://panel.example.test/products/brands/brand-a/edit" });
  const restore = installDomGlobals(window);
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  const changes: Array<string | undefined> = [];
  try {
    const Field = await compileField();
    await act(async () => { root.render(createElement(Field, { assets: [], selectedId: LOGO, disabled: false, brandName: "Güzide Kuyumcu", onChange(value: string | undefined) { changes.push(value); }, async onUpload() {} })); });
    assert.match(container.textContent ?? "", /Mevcut logo korunuyor/);
    const select = container.querySelector("select");
    assert.equal(select?.value, LOGO);
    const remove = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Logoyu kaldır");
    assert.ok(remove);
    await act(async () => { remove.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
    assert.deepEqual(changes, [undefined]);
  } finally {
    await act(async () => { root.unmount(); });
    restore();
    window.close();
  }
});
