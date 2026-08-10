import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Window } from "happy-dom";
import * as React from "react";
import { act, createElement, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

import { buildCategoryShowcaseConfig } from "../../lib/category-showcase-model.ts";

const source = () => readFile(new URL("./CategoryShowcaseEditor.tsx", import.meta.url), "utf8");

const CATEGORY_ID = "81000000-0000-4000-8000-000000000001";
const ASSET_ID = "82000000-0000-4000-8000-000000000001";
const RECORD_ID = "83000000-0000-4000-8000-000000000001";
const NOW = "2026-08-10T12:00:00.000Z";

async function compileEditor(saveCalls: Array<Record<string, unknown>>, saveShouldFail = false) {
  const output = ts.transpileModule(await source(), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const icon = (props: Record<string, unknown>) => createElement("svg", props);
  const styles = new Proxy({}, {
    get: (_target, property) => property === "__esModule" ? true : property === "default" ? styles : String(property),
  });
  const compiledModule: { exports: { CategoryShowcaseEditor?: ComponentType<{ canManage: boolean }> } } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return React;
    if (specifier === "lucide-react") return { ArrowDown: icon, ArrowUp: icon, LoaderCircle: icon, Plus: icon, Save: icon, Trash2: icon };
    if (specifier === "@celebix/saas-contracts") return { parseStorefrontAsset: (value: unknown) => value };
    if (specifier === "@/lib/category-showcase-model") return { buildCategoryShowcaseConfig };
    if (specifier === "@/lib/catalog-onboarding-ui/client") return { catalogOnboardingClient: { listCategories: async () => [{ id: CATEGORY_ID, name: "Bileklikler", status: "active" }] } };
    if (specifier === "@/lib/merchant-admin-ui/client") return { merchantAdminApi: {
      records: async () => [{ id: RECORD_ID, kind: "category_showcase", name: "Ana sayfa kategori vitrini", config: { heading: "Kategorileri keşfedin", enabled: true, layout: "grid", items: [{ categoryId: CATEGORY_ID, assetId: ASSET_ID }] }, status: "active", version: 1, createdAt: NOW, updatedAt: NOW }],
      save: async (_kind: string, value: Record<string, unknown>) => {
        saveCalls.push(value);
        if (saveShouldFail) throw new Error("unavailable");
        return { id: RECORD_ID, kind: "category_showcase", status: "active", version: 2, updatedAt: NOW, replayed: false };
      },
    } };
    if (specifier === "./category-showcase-editor.module.css") return styles;
    throw new Error(`unexpected_category_showcase_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiledModule, compiledModule.exports);
  assert.ok(compiledModule.exports.CategoryShowcaseEditor);
  return compiledModule.exports.CategoryShowcaseEditor;
}

test("a valid layout selection is persisted automatically without a separate submit", async () => {
  const browser = new Window({ url: "https://panel.example/settings/design" });
  const previous = Object.fromEntries(["window", "document", "navigator", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, fetch: async () => Response.json({ assets: [{ id: ASSET_ID, kind: "category", status: "active", altText: "Bileklikler kategori görseli", url: "https://cdn.example/category.webp", width: 896, height: 1195 }] }) })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const calls: Array<Record<string, unknown>> = [];
  const Editor = await compileEditor(calls);
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  try {
    await act(async () => { root.render(createElement(React.StrictMode, null, createElement(Editor, { canManage: true }))); await new Promise((resolve) => setTimeout(resolve, 0)); });
    const duo = container.querySelector('input[name="category-showcase-layout"][value="duo"]') as unknown as HTMLInputElement | null;
    assert.ok(duo);
    await act(async () => { duo.click(); await new Promise((resolve) => setTimeout(resolve, 850)); });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]?.config, { heading: "Kategorileri keşfedin", enabled: true, layout: "duo", items: [{ categoryId: CATEGORY_ID, assetId: ASSET_ID }] });
    assert.match(container.textContent ?? "", /Kategori vitrini otomatik kaydedildi[.]/);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(previous)) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as Record<string, unknown>)[key];
    browser.close();
  }
});

test("a failed automatic save remains bounded until the merchant makes another change", async () => {
  const browser = new Window({ url: "https://panel.example/settings/design" });
  const previous = Object.fromEntries(["window", "document", "navigator", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, fetch: async () => Response.json({ assets: [{ id: ASSET_ID, kind: "category", status: "active", altText: "Bileklikler kategori görseli", url: "https://cdn.example/category.webp", width: 896, height: 1195 }] }) })) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const calls: Array<Record<string, unknown>> = [];
  const Editor = await compileEditor(calls, true);
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  try {
    await act(async () => { root.render(createElement(Editor, { canManage: true })); await new Promise((resolve) => setTimeout(resolve, 0)); });
    const duo = container.querySelector('input[name="category-showcase-layout"][value="duo"]') as unknown as HTMLInputElement | null;
    assert.ok(duo);
    await act(async () => { duo.click(); await new Promise((resolve) => setTimeout(resolve, 1_350)); });
    assert.equal(calls.length, 1);
    assert.match(container.textContent ?? "", /Kategori vitrini otomatik kaydedilemedi[.]/);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of Object.entries(previous)) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as Record<string, unknown>)[key];
    browser.close();
  }
});

test("category showcase editor uses same-origin durable category asset and setting authorities", async () => {
  const value = await source();
  for (const token of ["catalogOnboardingClient.listCategories", "/api/storefront-assets", "merchantAdminApi.records(\"category_showcase\")", "merchantAdminApi.save(\"category_showcase\"", "buildCategoryShowcaseConfig"]) assert.match(value, new RegExp(token.replace(/[().]/g, "\\$&")));
  assert.doesNotMatch(value, /x-store-id|x-tenant-id|storeId|tenantId|localStorage|sessionStorage|R2_ACCESS|R2_SECRET/);
});

test("category showcase editor exposes bounded ordered accessible controls", async () => {
  const value = await source();
  for (const token of ["Kart ekle", "yukarı taşı", "aşağı taşı", "kartı kaldır", "Kategori seçin", "Görsel seçin", "role=\"alert\"", "role=\"status\"", "rows.length >= 8"]) assert.match(value, new RegExp(token));
  assert.match(value, /key=\{row[.]rowKey\}/);
  assert.doesNotMatch(value, /key=\{`\$\{index\}-\$\{row[.]categoryId\}-\$\{row[.]assetId\}`\}/);
});

test("category showcase editor owns heading visibility layout and ordered mappings", async () => {
  const value = await source();
  for (const token of [
    'useState<CategoryShowcaseLayout>("grid")',
    'value="duo"',
    'value="grid"',
    "İki büyük görsel",
    "Düzenli ızgara",
    "layout, rows",
  ]) assert.match(value, new RegExp(token.replace(/[().]/g, "\\$&")));
  assert.match(value, /layoutValue\s*!==\s*undefined\s*&&\s*layoutValue\s*!==\s*"duo"\s*&&\s*layoutValue\s*!==\s*"grid"/);
  assert.match(value, /layoutValue\s*[?][?]\s*"grid"/);
  assert.match(value, /layout:\s*"grid"/);
  assert.equal((value.match(/merchantAdminApi[.]save\("category_showcase"/g) ?? []).length, 1);
});
