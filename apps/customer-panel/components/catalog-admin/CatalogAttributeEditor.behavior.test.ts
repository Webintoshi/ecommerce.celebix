import { compile as compileCatalogLoading } from "../../lib/mira-final-test-support.ts";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import { attributeSlug, attributeValueIdentity, parseAttributeMeasurementValue } from "../../lib/catalog-onboarding-ui/attribute-resource.ts";
import { saveBrandResource } from "../../lib/catalog-admin-ui/brand-resource.ts";

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
    if (name.endsWith("/CatalogWorkspaceLoading")) return compileCatalogLoading("components/catalog/CatalogWorkspaceLoading.tsx");if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "next/navigation") return { useRouter: () => ({ push() {}, refresh() {} }) };
    if (name === "@/components/catalog-admin/CatalogBrandLogoPicker") return { CatalogBrandLogoPicker: () => null };
    if (name === "@/components/panel/PanelPageShell") return { PanelPageShell: ({ children }: { children: React.ReactNode }) => children, PanelPageHeader: () => null };
    if (name === "@/lib/catalog-admin-ui/client") return { catalogAdminApi: { async resource() { return selectedResource; }, async saveResource(_kind: string, input: unknown) { if (failSave) throw new StubApiError("Bu URL anahtarı başka bir kayıtta kullanılıyor."); saved.push(input); } }, CatalogAdminApiError: StubApiError };
    if (name === "@/lib/catalog-admin-ui/brand-product-directory") return { brandLogoAssetId: () => undefined, loadBrandProductDirectory: async () => [] };
    if (name === "@/lib/catalog-onboarding-ui/attribute-resource") return { attributeSlug, attributeValueIdentity, parseAttributeMeasurementValue };
    if (name === "@/lib/catalog-admin-ui/brand-resource") return { saveBrandResource };
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
    selectedResource = { id: "22222222-2222-4222-8222-222222222222", kind: "attribute", name: "Yüzük Ölçüsü", slug: "yuzuk-olcusu", version: 5, config: { key: "yuzuk_olcusu", values: ["12"], source: { provider: "qukasoft" } }, productIds: [] };
    await act(async () => { root.render(createElement(Editor, { kind: "attribute", canManage: true, resourceId: "22222222-2222-4222-8222-222222222222" })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    const nativeName = container.querySelector('[name="name"]') as unknown as HTMLInputElement | null;
    const nativeDraft = container.querySelector('input[placeholder="Örn. Siyah"]') as unknown as HTMLInputElement | null;
    const nativeForm = container.querySelector("form");
    assert.ok(nativeName && nativeDraft && nativeForm);
    nativeName.value = "Yüzük Bedeni";
    nativeDraft.value = "14";
    await act(async () => { nativeForm.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.deepEqual(saved[3], { resourceId: "22222222-2222-4222-8222-222222222222", expectedVersion: 5, name: "Yüzük Bedeni", slug: "yuzuk-olcusu", config: { key: "yuzuk_olcusu", values: ["12", "14"], source: { provider: "qukasoft" } }, productIds: [] }, "nitelik adı ve değerleri düzenlenirken kaynak anahtarı ve diğer ayarlar korunmalı");
    const weightConfig = { enabled: false, starterTemplate: "agirlik", measurementField: "weight", values: ["250 g", "1 kg"] };
    selectedResource = { id: "33333333-3333-4333-8333-333333333333", kind: "attribute", name: "Ağırlık", slug: "agirlik", version: 1, config: weightConfig, productIds: [] };
    await act(async () => { root.render(createElement(Editor, { kind: "attribute", canManage: true, resourceId: "33333333-3333-4333-8333-333333333333" })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    const weightDraft = container.querySelector('#attribute-value-draft') as unknown as HTMLInputElement;
    const weightForm = container.querySelector("form")!;
    weightDraft.value = "1000 g";
    await act(async () => { weightForm.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(saved.length, 4, "1 kg ile aynı ağırlık tekrar kaydedilmemeli");
    assert.match(container.textContent ?? "", /Bu değer zaten eklendi/);
    weightDraft.value = "büyük paket";
    await act(async () => { weightForm.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(saved.length, 4, "ağırlık değeri sayı ve uygun birim içermeli");
    weightDraft.value = "750 g";
    const remove = container.querySelector('button[aria-label="250 g değerini kaldır"]') as unknown as HTMLButtonElement;
    await act(async () => { remove.click(); });
    await act(async () => { weightForm.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.deepEqual(saved[4], { resourceId: "33333333-3333-4333-8333-333333333333", expectedVersion: 1, name: "Ağırlık", slug: "agirlik", config: { ...weightConfig, values: ["1 kg", "750 g"] }, productIds: [] }, "hazır değer düzenlenebilir ve kapalı durum kaydetmekle değişmez");
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
});
