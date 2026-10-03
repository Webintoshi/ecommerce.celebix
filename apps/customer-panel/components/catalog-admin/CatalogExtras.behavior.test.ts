import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as ReactDom from "react-dom";
import { parseCatalogSizeGuideConfig } from "@celebix/saas-contracts";
import { normalizeProductDescriptionHtml, normalizeProductDescriptionRichText } from "../../../../packages/platform-config/src/product-description-rich-text.ts";
import { formatTurkishMoney } from "../../lib/catalog-ui/money.ts";
import { merchantContentEditorHtml } from "../../lib/merchant-content-body-editor.ts";
import { Window } from "happy-dom";
import ts from "typescript";

const ID = "71000000-0000-4000-8000-000000000001";
const CATEGORY = "72000000-0000-4000-8000-000000000001";
const OTHER = "72000000-0000-4000-8000-000000000002";
const NOW = "2026-10-03T12:00:00.000Z";
const guideConfig = { schemaVersion: 1, type: "size_guide", heading: "Yüzük ölçüleri", body: "<p>İşletmenin ölçü bilgisi</p>", categoryIds: [CATEGORY], includeDescendants: true, enabled: true };
const guide = { id: ID, kind: "extra", name: "Yüzük rehberi", slug: "yuzuk-rehberi", config: guideConfig, productIds: [], productCount: 0, version: 3, status: "active", createdAt: NOW, updatedAt: NOW };
const option = { ...guide, id: "71000000-0000-4000-8000-000000000002", name: "Hediye paketi", slug: "hediye-paketi", config: { options: ["Kutulu"], priceAdjustmentCents: 2500 }, productCount: 7 };
const categories = [{ id: CATEGORY, name: "Yüzük", slug: "yuzuk", status: "active", depth: 1 }, { id: OTHER, name: "Kolye", slug: "kolye", status: "active", depth: 1 }, { id: "72000000-0000-4000-8000-000000000003", name: "Arşiv", slug: "arsiv", status: "archived", depth: 1 }].map((category, position) => ({ ...category, position, version: 1, createdAt: NOW, updatedAt: NOW }));
class ApiError extends Error { constructor(readonly code: string) { super(code); } }

async function withScreen(moduleName: string, exportName: string, props: Record<string, unknown>, options: { resource?: any; resources?: readonly any[]; save?: (...args: any[]) => Promise<any>; archive?: (...args: any[]) => Promise<any>; categories?: () => Promise<any> }, verify: (ctx: any) => Promise<void>) {
  const browser = new Window({ url: "https://panel.example.test/products/extras" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, HTMLTextAreaElement: browser.HTMLTextAreaElement, FormData: browser.FormData, Event: browser.Event, MouseEvent: browser.MouseEvent, MutationObserver: browser.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import("react-dom/client");
  const cache = new Map<string, Record<string, unknown>>();
  const pushes: string[] = [];
  const css: any = new Proxy({}, { get: (_target, key) => key === "__esModule" ? true : key === "default" ? css : String(key) });
  const api = { resource: async () => typeof options.resource === "function" ? options.resource() : options.resource ?? guide, resources: async () => options.resources ?? [guide, option], saveResource: options.save ?? (async () => ({})), archiveResource: options.archive ?? (async () => ({})) };
  async function load(name: string) {
    if (cache.has(name)) return cache.get(name)!;
    const files: Record<string, string> = { PricedEditor: "./CatalogResourceEditor.tsx", PricedPreview: "./CatalogExtraPreview.tsx", RichTextPreview: "../catalog/ProductDescriptionPreview.tsx", GuideDialog: "../../../../packages/storefront-design-ui/src/ProductSizeGuideDialog.tsx" };
    const source = await readFile(new URL(files[name] ?? `./extras/${name}.tsx`, import.meta.url), "utf8");
    const dependencies = [...source.matchAll(/from\s+["']\.\/([^"']+)["']/g)].map((match) => match[1]).filter((name) => !name.endsWith(".css"));
    for (const dependency of dependencies) await load(dependency!);
    const compiled = { exports: {} as Record<string, unknown> };
    const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    Function("require", "module", "exports", output)((id: string) => {
      if (id === "react") return React;
      if (id === "react-dom") return ReactDom;
      if (id === "react/jsx-runtime") return jsxRuntime;
      if (id === "next/link") return ({ href, children, ...rest }: any) => createElement("a", { href, ...rest }, children);
      if (id === "next/navigation") return { useRouter: () => ({ push: (path: string) => pushes.push(path), refresh: () => {} }) };
      if (id === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (id === "@celebix/saas-contracts") return { parseCatalogSizeGuideConfig };
      if (id === "@celebix/platform-config/src/product-description-rich-text" || id === "@celebix/platform-config/src/product-description-rich-text.ts") return { normalizeProductDescriptionRichText, normalizeProductDescriptionHtml };
      if (id === "@celebix/storefront-design-ui") return { ProductSizeGuideDialog: cache.get("GuideDialog")?.ProductSizeGuideDialog };
      if (id === "@/lib/catalog-admin-ui/client") return { catalogAdminApi: api, CatalogAdminApiError: ApiError };
      if (id === "@/lib/catalog-onboarding-ui/client") return { catalogOnboardingClient: { listCategories: options.categories ?? (async () => categories) } };
      if (id === "@/lib/catalog-onboarding-ui/attribute-resource") return { attributeSlug: (name: string) => name.toLowerCase().replaceAll("ü", "u").replaceAll("ö", "o").replaceAll("ı", "i").replaceAll("ğ", "g").replaceAll("ş", "s").replaceAll("ç", "c").replaceAll(" ", "-") };
      if (id === "@/components/content/MerchantContentBodyField") return { MerchantContentBodyField: ({ value, bodyFormat, onChange }: any) => { merchantContentEditorHtml(value, bodyFormat); return createElement("textarea", { "aria-label": "İçerik metni düzenleyicisi", value, onChange: (event: any) => onChange(event.currentTarget.value, "normalized_html", true) }); } };
      if (id === "@/components/catalog/ProductDescriptionPreview") return cache.get("RichTextPreview");
      if (id === "@/components/catalog-admin/CatalogResourceEditor") return cache.get("PricedEditor");
      if (id === "@/components/catalog-admin/CatalogExtraPreview") return cache.get("PricedPreview");
      if (id === "@/components/catalog-admin/CatalogBrandLogoPicker") return { CatalogBrandLogoPicker: () => null };
      if (id === "@/lib/catalog-admin-ui/brand-product-directory") return { brandLogoAssetId: () => undefined, loadBrandProductDirectory: async () => [] };
      if (id === "@/lib/catalog-admin-ui/brand-resource") return { saveBrandResource: async () => {} };
      if (id === "@/lib/catalog-admin-ui/resource-route") return { getCatalogResourceRouteDefinitionForKind: () => ({ segment: "extras", title: "Ekstra" }) };
      if (id === "@/lib/catalog-ui/client") return { catalogApi: { listProducts: async () => ({ items: [] }) } };
      if (id === "@/lib/catalog-ui/money") return { formatTurkishMoney };
      if (id === "@/components/panel/PanelPageShell") return { PanelPageShell: ({ children }: any) => children, PanelPageHeader: ({ actions }: any) => actions ?? null, PanelEmptyState: ({ title, description, action }: any) => createElement("div", null, title, description, action) };
      if (id.endsWith(".css")) return css;
      if (id.startsWith("./")) return cache.get(id.slice(2));
      throw new Error(`unexpected_import:${id}`);
    }, compiled, compiled.exports);
    cache.set(name, compiled.exports);
    return compiled.exports;
  }
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as any);
  for (const module of ["PricedEditor", "PricedPreview", "RichTextPreview", "GuideDialog"]) await load(module);
  const Component = (await load(moduleName))[exportName] as React.ComponentType<any>;
  const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
  const input = async (selector: string, value: string) => { const field: any = container.querySelector(selector); assert.ok(field, selector); const prototype = field.tagName === "TEXTAREA" ? browser.HTMLTextAreaElement.prototype : browser.HTMLInputElement.prototype; await act(async () => { Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value); field.dispatchEvent(new browser.Event("input", { bubbles: true })); }); };
  const submit = async () => { const form = container.querySelector("form"); assert.ok(form); await act(async () => { form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 0)); }); };
  try { await act(async () => { root.render(createElement(Component, props)); await new Promise((resolve) => setTimeout(resolve, 0)); }); await verify({ browser, container, input, submit, settle, pushes }); }
  finally { await act(async () => root.unmount()); for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); await browser.happyDOM.close(); }
}

test("Extras lists category guides and preserves priced option preview edit archive actions", async () => {
  const archived: string[] = [];
  await withScreen("CatalogExtrasConsole", "CatalogExtrasConsole", { canManage: true }, { archive: async (_kind, id) => { archived.push(id); } }, async ({ container, browser, settle }: any) => {
    assert.match(container.textContent, /Ölçü rehberi/);
    const rows = [...container.querySelectorAll("article")];
    const guideRow: any = rows.find((row: any) => row.textContent.includes("Yüzük rehberi"));
    assert.match(guideRow.textContent, /Yüzük/);
    assert.doesNotMatch(guideRow.textContent, /0 ürün/);
    for (const row of rows as any[]) for (const label of ["Önizle", "Düzenle", "Arşivle"]) assert.match(row.textContent, new RegExp(label));
    browser.confirm = () => true;
    await act(async () => { rows[1].querySelector("button").click(); });
    await settle();
    assert.deepEqual(archived, [option.id]);
  });
});

test("new Extras offers only working guide and priced option choices", async () => {
  await withScreen("CatalogExtraTypeChooser", "CatalogExtraTypeChooser", { canManage: true }, {}, async ({ container }: any) => {
    assert.ok(container.querySelector('a[href="/products/extras/size-guides/new"]'));
    assert.ok(container.querySelector('a[href="/products/extras/new?type=priced_option"]'));
    assert.equal(container.querySelectorAll("button:disabled").length, 0);
  });
});

test("guide rows show pending category names without calling active assignments missing", async () => {
  await withScreen("CatalogExtrasConsole", "CatalogExtrasConsole", { canManage: true }, { categories: async () => new Promise(() => {}) }, async ({ container }: any) => {
    assert.match(container.textContent, /Kategoriler yükleniyor/);
    assert.doesNotMatch(container.textContent, /artık etkin değil/);
  });
});

test("guide creation uses actual active categories, defaults and apply/cancel", async () => {
  const calls: any[] = [];
  await withScreen("CatalogSizeGuideEditor", "CatalogSizeGuideEditor", { canManage: true }, { save: async (...args) => { calls.push(args); } }, async ({ container, input, submit, pushes }: any) => {
    assert.ok(container.querySelector('a[href="/products/extras"]'));
    assert.match(container.textContent, /Uygula|Vazgeç/);
    assert.doesNotMatch(container.textContent, /Arşiv|AI/);
    await input('[name="name"]', "Yüzük rehberi");
    await input('textarea[aria-label="İçerik metni düzenleyicisi"]', "<p>Ölçü bilgisi</p><table><tr><td>12</td></tr></table>");
    await input('input[type="search"]', "Kolye");
    assert.equal(container.querySelector(`input[value="${CATEGORY}"]`), null);
    await act(async () => { container.querySelector(`input[value="${OTHER}"]`).click(); });
    await submit();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "extra");
    assert.deepEqual(calls[0][1], { name: "Yüzük rehberi", slug: "yuzuk-rehberi", config: { schemaVersion: 1, type: "size_guide", heading: "Ölçü rehberi", body: "<p>Ölçü bilgisi</p><table><tr><td>12</td></tr></table>", categoryIds: [OTHER], includeDescendants: true, enabled: true }, productIds: [] });
    assert.equal(typeof calls[0][2], "string");
    assert.deepEqual(pushes, ["/products/extras"]);
  });
});

test("guide retry preserves values and operation key until submitted content changes", async () => {
  const calls: any[] = [];
  await withScreen("CatalogSizeGuideEditor", "CatalogSizeGuideEditor", { canManage: true, resourceId: ID }, { save: async (...args) => { calls.push(args); throw new ApiError("unavailable"); } }, async ({ container, input, submit }: any) => {
    await input('[name="heading"]', "Beden rehberi");
    await act(async () => { container.querySelector('[name="enabled"]').click(); container.querySelector('[name="includeDescendants"]').click(); });
    await submit(); await submit();
    assert.equal(calls[0][2], calls[1][2]);
    assert.equal(container.querySelector('[name="heading"]').value, "Beden rehberi");
    assert.equal(container.querySelector('[name="enabled"]').checked, false);
    assert.equal(calls[1][1].expectedVersion, 3);
    assert.equal(calls[1][1].config.includeDescendants, false);
    await input('[name="heading"]', "Yeni beden rehberi"); await submit();
    assert.notEqual(calls[1][2], calls[2][2]);
  });
});

test("stored guide HTML opens safely without requiring a different content format or rewriting its body", async () => {
  const body = '<p>Ölçü <a href="https://example.com">bilgisi</a></p>';
  const calls: any[] = [];
  await withScreen("CatalogSizeGuideEditor", "CatalogSizeGuideEditor", { canManage: true, resourceId: ID }, { resource: { ...guide, config: { ...guideConfig, body } }, save: async (...args) => { calls.push(args); } }, async ({ container, submit }: any) => {
    assert.equal(container.querySelector('textarea[aria-label="İçerik metni düzenleyicisi"]').value, body);
    await submit();
    assert.equal(calls[0][1].config.body, body);
  });
});

test("version conflict keeps the guide draft and requires an explicit current-version review", async () => {
  let saves = 0;
  await withScreen("CatalogSizeGuideEditor", "CatalogSizeGuideEditor", { canManage: true, resourceId: ID }, { save: async () => { saves += 1; throw new ApiError("version_conflict"); } }, async ({ container, input, submit }: any) => {
    await input('[name="heading"]', "Benim taslağım"); await submit();
    assert.match(container.textContent, /başka|güncellendi/);
    assert.match(container.textContent, /korun/);
    assert.equal(container.querySelector('[name="heading"]').value, "Benim taslağım");
    await submit(); assert.equal(saves, 1);
    assert.ok([...container.querySelectorAll("button")].some((button: any) => /Güncel sürümü/.test(button.textContent)));
  });
});

test("generic edit and preview links route typed guides away from priced options", async () => {
  await withScreen("CatalogExtraEditor", "CatalogExtraEditor", { canManage: true, resourceId: ID }, {}, async ({ container }: any) => {
    assert.ok(container.querySelector('[name="heading"]'));
    assert.equal(container.querySelector('[name="options"]'), null);
  });
  await withScreen("CatalogExtraPreviewRouter", "CatalogExtraPreviewRouter", { resourceId: ID }, {}, async ({ container }: any) => {
    assert.match(container.textContent, /Yüzük ölçüleri|İşletmenin ölçü bilgisi/);
    assert.doesNotMatch(container.textContent, /Fiyat farkı|Seçenekler/);
  });
  await withScreen("CatalogExtraEditor", "CatalogExtraEditor", { canManage: true, resourceId: option.id }, { resource: option }, async ({ container }: any) => {
    assert.equal(container.querySelector('[name="options"]').value, "Kutulu");
    assert.equal(container.querySelector('[name="priceAdjustmentCents"]').value, "2500");
  });
});

test("guide preview opens the same accessible guide window and returns focus on Escape", async () => {
  await withScreen("CatalogSizeGuidePreview", "CatalogSizeGuidePreview", { resourceId: ID }, {}, async ({ browser, container }: any) => {
    const trigger = container.querySelector('button[aria-haspopup="dialog"]');
    assert.ok(trigger);
    await act(async () => { trigger.focus(); trigger.click(); });
    const dialog = browser.document.querySelector('[role="dialog"]');
    assert.ok(dialog);
    assert.match(dialog.textContent, /Yüzük ölçüleri.*İşletmenin ölçü bilgisi/);
    assert.equal(browser.document.activeElement, dialog.querySelector("button"));
    await act(async () => { browser.document.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    assert.equal(browser.document.querySelector('[role="dialog"]'), null);
    assert.equal(browser.document.activeElement, trigger);
  });
});

test("guide preview renders valid table sections and sanitizes stored HTML before insertion", async () => {
  const body = '<table><tr><th>Ölçü</th></tr><tr><td><strong>12</strong></td></tr></table><script>window.leak()</script><iframe src="https://example.com"></iframe><p><a href="javascript:alert(1)">Bilgi</a></p>';
  await withScreen("CatalogSizeGuidePreview", "CatalogSizeGuidePreview", { resourceId: ID }, { resource: { ...guide, config: { ...guideConfig, body } } }, async ({ browser, container }: any) => {
    await act(async () => { container.querySelector('button[aria-haspopup="dialog"]').click(); });
    const dialog = browser.document.querySelector('[role="dialog"]');
    assert.ok(dialog.querySelector("table > tbody > tr"));
    assert.equal(dialog.querySelector("td strong").textContent, "12");
    assert.equal(dialog.querySelector("script,iframe,[href^='javascript:']"), null);
  });
});
