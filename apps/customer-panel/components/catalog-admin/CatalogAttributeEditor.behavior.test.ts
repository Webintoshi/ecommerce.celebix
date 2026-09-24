import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";

test("attribute editor saves a name and selected values without asking for a technical key", async () => {
  const saved: unknown[] = [];
  let failSave = false;
  let selectedResource: unknown;
  class StubApiError extends Error { readonly code = "slug_conflict"; }
  const browser = new Window({ url: "https://panel.example.test/products/attributes/new" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: browser, document: browser.document, navigator: browser.navigator,
    HTMLElement: browser.HTMLElement, Event: browser.Event, MouseEvent: browser.MouseEvent,
    MutationObserver: browser.MutationObserver, FormData: browser.FormData, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const source = await readFile(new URL("./CatalogResourceEditor.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const styles = new Proxy({}, { get: (_target, key) => key === "__esModule" ? true : key === "default" ? styles : String(key) });
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "next/navigation") return { useRouter: () => ({ push() {}, refresh() {} }) };
    if (name === "@/components/catalog-admin/CatalogBrandLogoPicker") return { CatalogBrandLogoPicker: () => null };
    if (name === "@/components/panel/PanelPageShell") return { PanelPageShell: ({ children }: { children: React.ReactNode }) => children, PanelPageHeader: () => null };
    if (name === "@/lib/catalog-admin-ui/client") return { catalogAdminApi: { async resource() { return selectedResource; }, async saveResource(_kind: string, input: unknown) { if (failSave) throw new StubApiError("Bu URL anahtarı başka bir kayıtta kullanılıyor."); saved.push(input); } }, CatalogAdminApiError: StubApiError };
    if (name === "@/lib/catalog-admin-ui/brand-product-directory") return { brandLogoAssetId: () => undefined, loadBrandProductDirectory: async () => [] };
    if (name === "@/lib/catalog-ui/client") return { catalogApi: {} };
    if (name === "@/lib/catalog-admin-ui/resource-route") return { getCatalogResourceRouteDefinitionForKind: () => ({ title: "Nitelik", segment: "attributes" }) };
    if (name === "./catalog-admin-console.module.css") return styles;
    throw new Error(`unexpected_import:${name}`);
  }, compiled, compiled.exports);
  const Editor = compiled.exports.CatalogResourceEditor as React.ComponentType<{ kind: "attribute"; canManage: boolean; resourceId?: string }>;
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  try {
    await act(async () => { root.render(createElement(Editor, { kind: "attribute", canManage: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.ok(container.querySelector('[name="name"]'));
    assert.ok(!container.querySelector('[name="slug"]'), "URL anahtarı kullanıcıdan istenmemeli");
    const name = container.querySelector('[name="name"]') as unknown as HTMLInputElement | null;
    const draft = container.querySelector('input[placeholder="Örn. Siyah"]') as unknown as HTMLInputElement | null;
    assert.ok(name && draft, "değerler tek tek eklenebilmeli");
    await act(async () => {
      name.value = "Çocuk Bedeni";
      draft.value = "M";
    });
    const add = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Değer ekle");
    assert.ok(add);
    await act(async () => { add.click(); });
    assert.match(container.textContent ?? "", /M değerini kaldır|M×/);
    const form = container.querySelector("form");
    assert.ok(form);
    await act(async () => { form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.deepEqual(saved, [{ name: "Çocuk Bedeni", slug: "cocuk-bedeni", config: { values: ["M"] }, productIds: [] }]);
    draft.value = "L";
    await act(async () => { form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.deepEqual(saved[1], { name: "Çocuk Bedeni", slug: "cocuk-bedeni", config: { values: ["M", "L"] }, productIds: [] }, "son yazılan değer Kaydet ile kaybolmamalı");
    draft.value = "m";
    await act(async () => { form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(saved.length, 2, "aynı değer ikinci kez kaydedilmemeli");
    assert.match(container.textContent ?? "", /Bu değer zaten eklendi/);
    draft.value = "";
    failSave = true;
    await act(async () => { form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.match(container.textContent ?? "", /Bu adla bir nitelik zaten var/);
    assert.ok(container.querySelector("form"), "hata halinde düzenleme formu açık kalmalı");
    failSave = false;
    selectedResource = { id: "11111111-1111-4111-8111-111111111111", kind: "attribute", name: "Renk", slug: "renk", version: 3, config: { values: ["Siyah"] }, productIds: [] };
    await act(async () => { root.render(createElement(Editor, { kind: "attribute", canManage: true, resourceId: "11111111-1111-4111-8111-111111111111" })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    const editName = container.querySelector('[name="name"]') as unknown as HTMLInputElement | null;
    const editForm = container.querySelector("form");
    assert.ok(editName && editForm);
    editName.value = "Yeni Renk Adı";
    await act(async () => { editForm.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.deepEqual(saved[2], { resourceId: "11111111-1111-4111-8111-111111111111", expectedVersion: 3, name: "Yeni Renk Adı", slug: "renk", config: { values: ["Siyah"] }, productIds: [] }, "mevcut varyant anahtarı ad değişikliğinde korunmalı");
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
});
