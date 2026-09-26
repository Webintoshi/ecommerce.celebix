import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import { parseStorefrontAsset, type CatalogCategory, type StorefrontAsset } from "@celebix/saas-contracts";
import * as categoryTree from "../../lib/catalog-onboarding-ui/category-tree.ts";
import * as categoryInteractions from "../../lib/catalog-onboarding-ui/category-interactions.ts";
import * as categoryImage from "../../lib/catalog-onboarding-ui/category-image.ts";

type Props = Record<string, unknown>;
type SeoDraft = Readonly<{ metaTitle: string; metaDescription: string }>;
type SeoHarness = Readonly<{
  load: (categoryId: string) => Promise<Readonly<{ draft: SeoDraft }>>;
  save: (categoryId: string, categoryName: string, state: unknown, draft: SeoDraft) => Promise<Readonly<{ draft: SeoDraft }>>;
}>;
const PARENT = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const CHILD_A = "10000000-0000-4000-8000-000000000003";
const CHILD_B = "10000000-0000-4000-8000-000000000004";
const ARCHIVED = "10000000-0000-4000-8000-000000000005";
const ASSET_A = "20000000-0000-4000-8000-000000000001";
const ASSET_B = "20000000-0000-4000-8000-000000000002";
const STORE = "30000000-0000-4000-8000-000000000001";
const NOW = "2026-09-26T00:00:00.000Z";

function asset(id: string, altText: string): StorefrontAsset {
  return parseStorefrontAsset({ id, storeId: STORE, kind: "category", objectKey: `stores/${STORE}/storefront/category/${id}.webp`, publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/category/${id}.webp`, mediaType: "image/webp", altText, width: 12, height: 16, byteSize: 3, status: "active", createdAt: NOW, updatedAt: NOW, version: 1 });
}
const mediaA = asset(ASSET_A, "Pantolon görseli");
const mediaB = asset(ASSET_B, "Triko görseli");
function category(id: string, name: string, position: number, version: number, options: Partial<CatalogCategory> = {}): CatalogCategory {
  return Object.freeze({ id, name, slug: name.toLowerCase(), position, version, depth: options.parentId ? 2 : 1, status: "active", createdAt: NOW, updatedAt: NOW, ...options });
}
function fixtures(): readonly CatalogCategory[] {
  return [
    category(PARENT, "Pantolon", 1, 3, { image: { assetId: ASSET_A, altText: mediaA.altText, publicUrl: mediaA.publicUrl, width: 12, height: 16 } }),
    category(OTHER, "Triko", 2, 5, { image: { assetId: ASSET_B, altText: mediaB.altText, publicUrl: mediaB.publicUrl, width: 12, height: 16 } }),
    category(CHILD_A, "Jean", 1, 7, { parentId: PARENT }),
    category(CHILD_B, "Kargo", 2, 9, { parentId: PARENT }),
    category(ARCHIVED, "Önceki sezon", 3, 2, { status: "archived", archivedAt: NOW }),
  ];
}
class ApiError extends Error {
  constructor(readonly code: string) { super(code); }
}
function testApi(rows: readonly CatalogCategory[]) {
  let current = rows;
  const writes: Array<Readonly<{ id: string; input: { expectedVersion: number; fields: Record<string, unknown> } }>> = [];
  const orders: Array<{ groups: readonly categoryInteractions.CategoryOrderGroup[] }> = [];
  const api = {
    async listCategories() { return current; },
    async createCategory() { throw new Error("unexpected create"); },
    async updateCategory(id: string, input: { expectedVersion: number; fields: Record<string, unknown> }) {
      writes.push({ id, input });
      const old = current.find(item => item.id === id)!;
      if (input.expectedVersion !== old.version) throw new ApiError("version_conflict");
      const saved = { ...old, ...input.fields, image: input.fields.image ?? undefined, version: old.version + 1 } as CatalogCategory;
      current = current.map(item => item.id === id ? saved : item);
      return { category: saved, replayed: false };
    },
    async archiveCategory() { throw new Error("unexpected archive"); },
    async reorderCategories(input: { groups: readonly categoryInteractions.CategoryOrderGroup[] }) {
      orders.push(input);
      const positions = new Map(input.groups.flatMap(group => group.orderedCategoryIds.map((id, index) => [id, index + 1] as const)));
      const changed = current.filter(item => positions.has(item.id)).map(item => ({ ...item, position: positions.get(item.id)!, version: item.version + 1 }));
      const byId = new Map(changed.map(item => [item.id, item])); current = current.map(item => byId.get(item.id) ?? item);
      return { categories: changed, replayed: false };
    },
    async getCategoryDeletionImpact() { throw new Error("unexpected deletion impact"); },
    async deleteCategory() { throw new Error("unexpected deletion"); },
  };
  return { api, writes, orders, replaceRows(next: readonly CatalogCategory[]) { current = next; } };
}

async function compile(url: URL, imports: Record<string, unknown>) {
  const source = await readFile(url, "utf8");
  const compiled = { exports: {} as Record<string, unknown> };
  Function("require", "module", "exports", ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText)((name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "lucide-react") return new Proxy({}, { get: () => () => createElement("svg", { "aria-hidden": true }) });
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
    if (Object.hasOwn(imports, name)) return imports[name];
    throw new Error(`unexpected_import:${name}`);
  }, compiled, compiled.exports);
  return compiled.exports;
}

async function withManager(
  supplied: Props,
  verify: (container: HTMLElement, browser: Window, rerender: (next: Props) => Promise<void>) => Promise<void>,
  fetcher: typeof fetch = (async () => ({ ok: true, json: async () => ({ assets: [mediaA, mediaB] }) } as Response)) as typeof fetch,
  seoClient: SeoHarness = { async load() { return { draft: { metaTitle: "", metaDescription: "" } }; }, async save() { throw new Error("unexpected SEO write"); } },
) {
  const browser = new Window({ url: "https://panel.example.test/products/categories", width: 1024, height: 768 });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  const urls = browser.URL as unknown as typeof URL;
  let objectUrl = 0;
  urls.createObjectURL = () => `blob:category-test-${++objectUrl}`; urls.revokeObjectURL = () => {};
  class Image {
    naturalWidth = 12; naturalHeight = 16; onload?: () => void;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  }
  Object.defineProperty(browser, "Image", { value: Image });
  Object.defineProperty(browser.HTMLCanvasElement.prototype, "getContext", { value: () => ({ drawImage() {} }) });
  Object.defineProperty(browser.HTMLCanvasElement.prototype, "toBlob", { value: (done: (blob: Blob) => void) => done(new browser.Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }) as unknown as Blob) });
  if (!browser.HTMLDialogElement.prototype.showModal) Object.defineProperty(browser.HTMLDialogElement.prototype, "showModal", { value: function(this: HTMLDialogElement) { this.open = true; } });
  if (!browser.HTMLDialogElement.prototype.close) Object.defineProperty(browser.HTMLDialogElement.prototype, "close", { value: function(this: HTMLDialogElement) { this.open = false; } });
  const originalRects = Object.getOwnPropertyDescriptor(browser.HTMLElement.prototype, "getClientRects");
  Object.defineProperty(browser.HTMLElement.prototype, "getClientRects", { configurable: true, value: function(this: HTMLElement) { return this.closest("[hidden]") ? [] : [{ width: 44, height: 44 }]; } });
  for (const [key, value] of Object.entries({
    window: browser, document: browser.document, navigator: browser.navigator,
    HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, HTMLButtonElement: browser.HTMLButtonElement,
    Event: browser.Event, MouseEvent: browser.MouseEvent, KeyboardEvent: browser.KeyboardEvent,
    FormData: browser.FormData, File: browser.File, URL: urls, fetch: fetcher, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const media = await compile(new URL("./CategoryMediaField.tsx", import.meta.url), {
    "@celebix/saas-contracts": { parseStorefrontAsset }, "@/lib/catalog-onboarding-ui/category-image": categoryImage,
  });
  const manager = await compile(new URL("./CategoryManager.tsx", import.meta.url), {
    "@celebix/saas-contracts": { parseStorefrontAsset },
    "@/lib/catalog-onboarding-ui/client": { CatalogOnboardingApiError: ApiError, catalogOnboardingClient: {} },
    "@/components/panel/PanelTopbarChrome": { PanelTopbarBridge: () => null },
    "@/lib/catalog-onboarding-ui/category-tree": categoryTree,
    "@/lib/catalog-onboarding-ui/category-interactions": categoryInteractions,
    "@/lib/catalog-onboarding-ui/category-seo": { EMPTY_CATEGORY_SEO: { metaTitle: "", metaDescription: "" }, categorySeoClient: seoClient },
    "@/components/shared/PermanentDeleteDialog": { PermanentDeleteDialog: () => null },
    "./CategoryMediaField": media,
  });
  const Component = manager.CategoryManager as React.ComponentType<Props>;
  const container = browser.document.createElement("div"); browser.document.body.append(container);
  const { createRoot } = await import("react-dom/client"); const root = createRoot(container as unknown as HTMLElement);
  let props = { canManage: true, canArchive: true, canDelete: false, canManageSeo: false, ...supplied };
  try {
    await act(async () => root.render(createElement(Component, props)));
    await frames(browser);
    await verify(container as unknown as HTMLElement, browser, async (next) => { props = { ...props, ...next }; await act(async () => root.render(createElement(Component, props))); await frames(browser); });
  } finally {
    await act(async () => root.unmount());
    await browser.happyDOM.waitUntilComplete();
    if (originalRects) Object.defineProperty(browser.HTMLElement.prototype, "getClientRects", originalRects);
    else Reflect.deleteProperty(browser.HTMLElement.prototype, "getClientRects");
    for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
}
async function frames(browser: Window) { await act(async () => { await new Promise<void>(resolve => browser.requestAnimationFrame(() => resolve())); }); }
async function click(button: HTMLButtonElement, browser: Window) { assert.ok(button); await act(async () => button.click()); await frames(browser); }
function button(container: HTMLElement, text: string) { return [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim() === text)!; }
function categoryButton(container: HTMLElement, id: string) { return container.querySelector<HTMLButtonElement>(`[data-category-id="${id}"] [data-category-primary-action]`)!; }
async function changeName(container: HTMLElement, browser: Window, value: string) {
  const field = container.querySelector<HTMLInputElement>('input[name="name"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event); });
}
async function submitEditor(container: HTMLElement, browser: Window) {
  const form = container.querySelector<HTMLFormElement>("form.editorForm")!;
  assert.ok(form); await act(async () => form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event)); await frames(browser);
}

test("read-only category opens with reachable close focus and uses its projected image without the asset library", async () => {
  let assetReads = 0; const data = testApi(fixtures());
  await withManager({ api: data.api, canManage: false, canArchive: false }, async (container, browser) => {
    await click(categoryButton(container, PARENT), browser);
    const close = container.querySelector<HTMLButtonElement>('button[aria-label="Kategori editörünü kapat"]')!;
    assert.equal(browser.document.activeElement, close);
    assert.equal(container.querySelector<HTMLInputElement>('input[name="name"]')!.disabled, true);
    assert.equal(container.querySelector<HTMLInputElement>('input[name="position"]')!.disabled, true);
    assert.equal(container.querySelector<HTMLImageElement>('section[aria-label="Kategori görseli"] img')!.src, mediaA.publicUrl);
    assert.equal(button(container, "Yeni kategori").disabled, true);
    assert.equal(container.querySelector("details.seoSection"), null, "SEO fields must stay hidden without their separate permission");
    assert.equal(assetReads, 0);
    assert.equal(data.writes.length, 0);
  }, (async () => { assetReads++; throw new Error("analyst must not request asset library"); }) as typeof fetch);
});

test("failed media selection belongs to its category and cannot appear in the next category editor", async () => {
  let uploads = 0; const data = testApi(fixtures());
  const fetcher = async (_input: unknown, init?: RequestInit) => init?.method === "POST"
    ? (uploads++, { ok: false, status: 503 } as Response)
    : { ok: true, json: async () => ({ assets: [mediaA, mediaB] }) } as Response;
  await withManager({ api: data.api }, async (container, browser) => {
    await click(categoryButton(container, PARENT), browser);
    const file = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(file, "files", { configurable: true, value: [new browser.File([new Uint8Array([1, 2, 3])], "pantolon.png", { type: "image/png" })] });
    await act(async () => file.dispatchEvent(new browser.Event("change", { bubbles: true }) as unknown as Event));
    assert.equal(uploads, 1); assert.match(container.textContent ?? "", /Seçiminiz korundu/);
    assert.equal(button(container, "Kaydet").disabled, true, "a pending image must not be silently omitted from category save");
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="Kategori editörünü kapat"]')!, browser);
    let confirmation = container.querySelector<HTMLDialogElement>("dialog")!;
    assert.ok(confirmation.open, "a failed upload must remain pending until explicitly discarded");
    await click(button(confirmation, "Vazgeç"), browser);
    assert.match(container.textContent ?? "", /Seçiminiz korundu/, "canceling confirmation must preserve the failed media attempt");
    assert.ok(button(container, "Tekrar dene"));
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="Kategori editörünü kapat"]')!, browser);
    confirmation = container.querySelector<HTMLDialogElement>("dialog")!;
    await click(button(confirmation, "Kaydetmeden devam et"), browser);
    await click(categoryButton(container, OTHER), browser);
    assert.doesNotMatch(container.textContent ?? "", /Seçiminiz korundu/);
    assert.equal(container.querySelector<HTMLImageElement>('section[aria-label="Kategori görseli"] img')!.src, mediaB.publicUrl);
    assert.equal(data.writes.length, 0);
  }, fetcher as typeof fetch);
});

test("sibling order cancel restores positions and save sends one full parent group with original versions", async () => {
  const data = testApi(fixtures());
  await withManager({ api: data.api }, async (container, browser) => {
    await click(button(container, "Sırala"), browser);
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="Kargo kategorisini yukarı taşı"]')!, browser);
    assert.equal(container.querySelector(`[data-category-id="${CHILD_B}"] .rowOrder`)!.textContent, "1");
    await click(button(container, "Vazgeç"), browser);
    assert.equal(data.orders.length, 0);
    await click(button(container, "Tümünü aç"), browser);
    assert.equal(container.querySelector(`[data-category-id="${CHILD_B}"] .rowOrder`)!.textContent, "2");
    assert.equal(container.querySelector(`[data-category-id="${OTHER}"] .rowOrder`)!.textContent, "2");
    await click(button(container, "Sırala"), browser);
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="Kargo kategorisini yukarı taşı"]')!, browser);
    await click(button(container, "Sıralamayı kaydet"), browser);
    assert.deepEqual(data.orders, [{ groups: [{ parentId: PARENT, orderedCategoryIds: [CHILD_B, CHILD_A], expectedVersions: [{ categoryId: CHILD_A, version: 7 }, { categoryId: CHILD_B, version: 9 }] }] }]);
    assert.ok(container.querySelector(`[data-category-id="${ARCHIVED}"]`), "partial reorder results must preserve archived rows");
    assert.equal(container.querySelector(`[data-category-id="${OTHER}"] .rowOrder`)!.textContent, "2");
  });
});

test("canceling dirty confirmation preserves the controlled draft and its editor identity", async () => {
  const data = testApi(fixtures());
  await withManager({ api: data.api }, async (container, browser) => {
    await click(categoryButton(container, PARENT), browser);
    await changeName(container, browser, "Kaydedilmemiş Pantolon");
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="Kategori editörünü kapat"]')!, browser);
    const dialog = container.querySelector<HTMLDialogElement>("dialog")!;
    assert.ok(dialog.open); assert.match(dialog.textContent ?? "", /Değişiklikler kaydedilmedi/);
    assert.equal(container.querySelector('[role="dialog"]'), null, "editor must be suspended while confirmation is modal");
    await click(button(dialog, "Vazgeç"), browser);
    assert.equal(container.querySelector<HTMLInputElement>('input[name="name"]')!.value, "Kaydedilmemiş Pantolon");
    assert.equal(container.querySelector("#category-editor-title")!.textContent, "Pantolon");
    assert.equal(container.querySelector('[data-category-id="' + PARENT + '"]')!.getAttribute("data-selected"), "true");
    assert.equal(data.writes.length, 0);
  });
});

test("a remotely refreshed category cannot replace the version captured by an unsaved draft", async () => {
  const initial = fixtures(); const data = testApi(initial);
  await withManager({ api: data.api }, async (container, browser, rerender) => {
    await click(categoryButton(container, OTHER), browser);
    await changeName(container, browser, "Yeni Triko");
    data.replaceRows(initial.map(item => item.id === OTHER ? { ...item, version: 6, name: "Uzak Triko" } : item));
    await rerender({ api: { ...data.api } });
    assert.equal(container.querySelector<HTMLInputElement>('input[name="name"]')!.value, "Yeni Triko");
    await submitEditor(container, browser);
    assert.equal(data.writes.length, 1);
    assert.equal(data.writes[0]!.input.expectedVersion, 5);
    assert.equal(container.querySelector<HTMLInputElement>('input[name="name"]')!.value, "Yeni Triko");
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /sizden önce değiştirildi/);
  });
});

test("after category creation succeeds and SEO fails, retry preserves SEO values and saves only SEO", async () => {
  const initial = fixtures(), data = testApi(initial);
  const createdId = "10000000-0000-4000-8000-000000000006";
  let creates = 0;
  const seoWrites: Array<Readonly<{ id: string; name: string; draft: SeoDraft }>> = [];
  const api = { ...data.api, async createCategory(fields: Record<string, unknown>) {
    creates += 1;
    const created = category(createdId, String(fields.name), Number(fields.position), 1);
    data.replaceRows([...initial, created]);
    return { category: created, replayed: false };
  } };
  const seo: SeoHarness = {
    async load() { throw new Error("a new category has no SEO record to fetch"); },
    async save(id, name, _state, draft) {
      seoWrites.push({ id, name, draft: { ...draft } });
      if (seoWrites.length === 1) throw new Error("SEO hizmeti şu anda kullanılamıyor.");
      return { draft: { ...draft } };
    },
  };
  await withManager({ api, canManageSeo: true }, async (container, browser) => {
    await click(button(container, "Yeni kategori"), browser);
    await changeName(container, browser, "Yeni koleksiyon");
    const details = container.querySelector<HTMLDetailsElement>("details.seoSection")!;
    await act(async () => { details.open = true; details.dispatchEvent(new browser.Event("toggle") as unknown as Event); });
    await frames(browser);
    const title = details.querySelector<HTMLInputElement>("input")!;
    const description = details.querySelector<HTMLTextAreaElement>("textarea")!;
    assert.ok(title); assert.ok(description);
    await act(async () => {
      Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(title, "Yeni koleksiyon SEO");
      title.dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event);
    });
    await act(async () => {
      Object.getOwnPropertyDescriptor(browser.HTMLTextAreaElement.prototype, "value")!.set!.call(description, "Yeni koleksiyonun arama açıklaması.");
      description.dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event);
    });
    await submitEditor(container, browser);
    assert.equal(creates, 1); assert.equal(data.writes.length, 0); assert.equal(seoWrites.length, 1);
    assert.equal(seoWrites[0]!.id, createdId);
    assert.equal(container.querySelector<HTMLInputElement>('input[name="name"]')!.value, "Yeni koleksiyon");
    assert.equal(container.querySelector<HTMLInputElement>("details.seoSection input")!.value, "Yeni koleksiyon SEO");
    assert.equal(container.querySelector<HTMLTextAreaElement>("details.seoSection textarea")!.value, "Yeni koleksiyonun arama açıklaması.");
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /Kategori kaydedildi\. SEO kaydedilemedi/);
    assert.ok(container.querySelector(`[data-category-id="${createdId}"]`));
    assert.equal(button(container, "Kaydet").disabled, false, "only the unsaved SEO portion should remain retryable");
    await submitEditor(container, browser);
    assert.equal(creates, 1, "SEO retry must never create a second category");
    assert.equal(data.writes.length, 0, "SEO retry must not reapply the already saved category mutation");
    assert.equal(seoWrites.length, 2); assert.deepEqual(seoWrites[1], seoWrites[0]);
    assert.equal(button(container, "Kaydet").disabled, true);
    assert.equal(container.querySelector('[role="alert"]'), null);
  }, undefined, seo);
});
