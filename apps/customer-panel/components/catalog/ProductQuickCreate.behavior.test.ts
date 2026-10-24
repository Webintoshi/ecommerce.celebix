import { installCatalogSortRects, beginCatalogMouseDrag, dropCatalogMouseDrag, dragCatalogItem, catalogSortKey } from "./catalog-sort-test-utils.ts";
import { compile as compileTaxFields } from "../../lib/mira-final-test-support.ts";
import * as productTax from "../../lib/catalog-ui/product-tax.ts";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import * as categoryTree from "../../lib/catalog-onboarding-ui/category-tree.ts";
import * as forms from "../../lib/catalog-onboarding-ui/forms.ts";
import * as measurementForms from "../../lib/catalog-ui/product-measurements.ts";
import * as mediaCompletion from "../../lib/catalog-onboarding-ui/media-completion.ts";
import * as drafts from "../../lib/catalog-ui/product-draft-session.ts";

const categoryId = "10000000-0000-4000-8000-000000000001";
const channelId = "20000000-0000-4000-8000-000000000001";
const options = {
  categories: [{ id: categoryId, name: "Elbiseler", position: 0 }],
  channels: [{ id: channelId, name: "Mağaza", kind: "storefront" }],
  resources: [], skuPrefix: "SIORA",
};
const created = { product: { id: "product-created", version: 1, status: "draft" }, variants: [], mediaCount: 0, replayed: false };

function draft(patch: Parameters<typeof drafts.updateProductDraft>[1] = {}) {
  const empty = drafts.createEmptyProductDraftSession();
  return drafts.updateProductDraft(empty, {
    title: "Pamuk elbise", categoryIds: [categoryId], taxChoice: "1000",
    variants: [{ ...empty.current.variants[0]!, price: "249,90", stockQuantity: "7", sku: "SIORA-001" }],
    ...patch,
  });
}

async function compile(sourceUrl: URL, imports: Record<string, unknown>) {
  const source = await readFile(sourceUrl, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "@/components/catalog/CatalogSortArea") return compileTaxFields("components/catalog/CatalogSortArea.tsx");
    if (name === "@/components/catalog/ProductTaxFields") return compileTaxFields("components/catalog/ProductTaxFields.tsx");
    if (name === "@/lib/catalog-ui/product-tax") return productTax;
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "lucide-react") return new Proxy({}, { get: () => () => createElement("svg", { "aria-hidden": true }) });
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
    if (Object.hasOwn(imports, name)) return imports[name];
    throw new Error(`unexpected_import:${name}`);
  }, compiled, compiled.exports);
  return compiled.exports;
}

async function withQuickCreate(
  supplied: Record<string, unknown> | ((browser: Window) => Record<string, unknown>),
  verify: (container: HTMLElement, browser: Window, rerender: (next: Record<string, unknown>) => Promise<void>) => Promise<void>,
  reserveBarcode: () => Promise<string> = async () => "9800000000007",
) {
  const browser = new Window({ url: "https://panel.example.test/products/new" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  const browserUrl = browser.URL as unknown as typeof URL;
  browserUrl.createObjectURL = () => "blob:quick-product-test";
  browserUrl.revokeObjectURL = () => {};
  for (const [key, value] of Object.entries({
    window: browser, document: browser.document, navigator: browser.navigator, Element: browser.Element, Node: browser.Node, Document: browser.Document, MutationObserver: browser.MutationObserver, ResizeObserver: browser.ResizeObserver, getComputedStyle: browser.getComputedStyle.bind(browser), requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
    HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement,
    HTMLButtonElement: browser.HTMLButtonElement, Event: browser.Event,
    MouseEvent: browser.MouseEvent, KeyboardEvent: browser.KeyboardEvent,
    FormData: browser.FormData, File: browser.File, URL: browserUrl,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import("react-dom/client");
  const barcode = await compile(new URL("./BarcodeInput.tsx", import.meta.url), {
    "@/lib/barcode-labels/reserve-internal": { reserveInternalBarcode: reserveBarcode },
  });
  class ApiError extends Error {}
  const measurements = await compile(new URL("./ProductMeasurementFields.tsx", import.meta.url), { "@/lib/catalog-ui/product-measurements": measurementForms });
  const quick = await compile(new URL("../catalog-onboarding/ProductQuickCreateDialog.tsx", import.meta.url), {
    "next/link": ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as React.ReactNode),
    "@/lib/catalog-onboarding-ui/client": { CatalogOnboardingApiError: ApiError, catalogOnboardingClient: {} },
    "@/lib/catalog-onboarding-ui/category-tree": categoryTree,
    "@/lib/catalog-onboarding-ui/forms": forms,
    "@/lib/catalog-onboarding-ui/media-completion": mediaCompletion,
    "@/lib/catalog-ui/product-draft-session": drafts,
    "@/lib/catalog-ui/media-client": { ProductMediaApiError: ApiError, productMediaApi: {} },
    "@/components/catalog/BarcodeInput": barcode,
    "@/components/catalog/ProductMeasurementFields": measurements,
    "@/components/catalog/SkuInput": { SkuInput: ({ value, onChange }: { value: string; onChange(value: string): void }) => createElement("input", { name: "sku", value, onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.value) }) },
  });
  const ProductQuickCreateDialog = quick.ProductQuickCreateDialog as React.ComponentType<Record<string, unknown>>;
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  const suppliedProps = typeof supplied === "function" ? supplied(browser) : supplied;
  const props = { open: true, options, mode: "page", onClose() {}, onCreated() {}, onAdvanced() {},
    mediaClient: { upload: async () => ({}) }, ...suppliedProps, api: { createProduct: async () => created, publishAfterMedia: async () => ({ ...created, product: { ...created.product, status: "active" } }), getProductEditor: async () => created, ...(suppliedProps.api as Record<string, unknown> ?? {}) } };
  try {
    await act(async () => { root.render(createElement(ProductQuickCreateDialog, props)); });
    await verify(container as unknown as HTMLElement, browser, async (next) => {
      await act(async () => { root.render(createElement(ProductQuickCreateDialog, { ...props, ...next })); });
    });
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of globals) descriptor
      ? Object.defineProperty(globalThis, key, descriptor)
      : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
}

async function submit(container: HTMLElement, browser: Window, intent: "draft" | "publish") {
  const form = container.querySelector("form")!;
  const button = container.querySelector(`button[value="${intent}"]`)!;
  await act(async () => { form.dispatchEvent(new browser.SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: button as never }) as unknown as Event); });
}

test("one save publishes after media completion even when submitted with Enter", async () => {
  const intents: { publish: boolean }[] = [];
  const finished: unknown[] = [];
  const sequence: string[] = [];
  await withQuickCreate({ draftSession: draft(), api: {
    createProduct: async (intent: { publish: boolean }) => { intents.push(intent); sequence.push("create"); return created; },
    publishAfterMedia: async () => { sequence.push("publish"); return { ...created, product: { ...created.product, status: "active" } }; },
    getProductEditor: async () => created,
  }, onCreated: (result: unknown) => finished.push(result) }, async (container, browser) => {
    const saves = [...container.querySelectorAll<HTMLButtonElement>('button[type="submit"]')];
    assert.deepEqual(saves.map(button => button.textContent), ["Kaydet"]);
    await act(async () => { container.querySelector("form")!.dispatchEvent(new browser.SubmitEvent("submit", { bubbles: true, cancelable: true }) as unknown as Event); });
    assert.equal(intents[0]?.publish, true);
    assert.deepEqual(sequence, ["create", "publish"]);
    assert.equal(finished.length, 1);
  });
});

async function input(container: HTMLElement, browser: Window, name: string, value: string) {
  const field = container.querySelector(`input[name="${name}"]`) as HTMLInputElement;
  await changeInput(field, browser, value);
}

async function changeInput(field: HTMLInputElement, browser: Window, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event);
  });
}

async function selectImages(container: HTMLElement, browser: Window, files: readonly File[]) {
  const field = container.querySelector('input[type="file"]') as HTMLInputElement;
  await act(async () => {
    Object.defineProperty(field, "files", { configurable: true, value: files });
    field.dispatchEvent(new browser.Event("change", { bubbles: true }) as unknown as Event);
  });
}

test("quick validation retains entered fields and barcode is saved in the atomic advanced create", async () => {
  const intents: unknown[] = [];
  const finished: unknown[] = [];
  const session = draft();
  await withQuickCreate({
    draftSession: draft({ variants: [{ ...session.current.variants[0]!, price: "geçersiz", barcode: "8691234567890" }] }),
    api: { createProduct: async (intent: unknown) => { intents.push(intent); return created; }, publishAfterMedia: async () => ({ ...created, product: { ...created.product, status: "active" } }), getProductEditor: async () => created },
    onCreated: (result: unknown) => finished.push(result),
  }, async (container, browser) => {
    await submit(container, browser, "publish");
    assert.equal(intents.length, 0);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /satış fiyatı/i);
    assert.equal((container.querySelector('input[name="title"]') as HTMLInputElement).value, "Pamuk elbise");
    assert.equal((container.querySelector('input[name="barcode"]') as HTMLInputElement).value, "8691234567890");
    assert.equal((container.querySelector('input[name="stockQuantity"]') as HTMLInputElement).value, "7");
    await input(container, browser, "price", "249,90");
    await submit(container, browser, "publish");
    assert.equal(intents.length, 1);
    const intent = intents[0] as { kind: string; publish: boolean; channelIds: string[]; variants: { barcode: string; sku: string; priceCents: number; stockQuantity: number }[] };
    assert.equal(intent.kind, "advanced");
    assert.equal(intent.publish, true);
    assert.deepEqual(intent.channelIds, [channelId]);
    assert.deepEqual({ barcode: intent.variants[0]!.barcode, sku: intent.variants[0]!.sku, priceCents: intent.variants[0]!.priceCents, stockQuantity: intent.variants[0]!.stockQuantity }, { barcode: "8691234567890", sku: "SIORA-001", priceCents: 24990, stockQuantity: 7 });
    assert.equal(finished.length, 1);
  });
});

test("quick optional fields stay blank-save compatible and persist all selected measurements through a draft handoff", async () => {
  const intents: unknown[] = [];
  const projections: drafts.ProductDraftSession[] = [];
  await withQuickCreate({ draftSession: draft(), onDraftSessionChange: (next: drafts.ProductDraftSession) => projections.push(next), api: { createProduct: async (intent: unknown) => { intents.push(intent); return created; } } }, async (container, browser) => {
    const fields = [...container.querySelectorAll<HTMLInputElement>('input[name^="measurement-"]')];
    assert.equal(fields.length, 8);
    assert.ok(fields.every((field) => !field.required && field.value === ""));
    assert.match(container.querySelector("details summary")?.textContent ?? "", /İsteğe bağlı/);
    const values = { weight: "14,89", volume: "250.125", length: "3", width: "2.1", depth: "4,2", height: "0.001", area: "5,55", packageCount: "6" };
    for (const [key, value] of Object.entries(values)) await input(container, browser, `measurement-${key}`, value);
    assert.deepEqual(projections.at(-1)?.current.variants[0]?.measurements, values);
    await submit(container, browser, "publish");
    assert.equal(intents.length, 1);
    assert.deepEqual((intents[0] as Record<string, unknown>).measurements, {
      weight: { valueMilli: 14890, unit: "g" }, volume: { valueMilli: 250125, unit: "ml" },
      length: { valueMilli: 3000, unit: "cm" }, width: { valueMilli: 2100, unit: "cm" }, depth: { valueMilli: 4200, unit: "cm" },
      height: { valueMilli: 1, unit: "cm" }, area: { valueMilli: 5550, unit: "m2" }, packageCount: 6,
    });
  });
  await withQuickCreate({ draftSession: draft(), api: { createProduct: async (intent: unknown) => { intents.push(intent); return created; } } }, async (container, browser) => {
    await submit(container, browser, "publish");
    assert.equal(Object.hasOwn(intents.at(-1) as object, "measurements"), false);
  });
});

test("invalid optional quick measurements keep entered values and reveal their group, then allow clearing", async () => {
  let creates = 0;
  await withQuickCreate({ draftSession: draft(), api: { createProduct: async () => { creates++; return created; } } }, async (container, browser) => {
    await input(container, browser, "measurement-weight", "14,8912");
    await submit(container, browser, "publish");
    assert.equal(creates, 0);
    const weight = container.querySelector('input[name="measurement-weight"]') as HTMLInputElement;
    assert.equal(weight.value, "14,8912");
    assert.equal(weight.getAttribute("aria-invalid"), "true");
    assert.equal(weight.closest("details")?.open, true);
    assert.match(container.textContent ?? "", /üç ondalık/);
    await input(container, browser, "measurement-weight", "");
    await submit(container, browser, "publish");
    assert.equal(creates, 1);
  });
});

test("media recovery retries the existing product and blocks duplicate creates", async () => {
  let creates = 0;
  let uploads = 0;
  const finished: unknown[] = [];
  const createdIds: string[] = [];
  await withQuickCreate((browser) => ({
    draftSession: draft({ media: [{ file: new browser.File(["image"], "cover.webp", { type: "image/webp" }) as unknown as File, altText: "Pamuk elbise", preview: "blob:cover" }] }),
    api: { createProduct: async () => { creates++; return created; }, publishAfterMedia: async () => created, getProductEditor: async () => created },
    mediaClient: { upload: async (productId: string) => { assert.equal(productId, created.product.id); uploads++; if (uploads === 1) throw new Error("upload_failed"); return {}; } },
    onCreated: (result: unknown) => finished.push(result),
    onCreatedProductChange: (productId: string) => createdIds.push(productId),
  }), async (container, browser) => {
    await submit(container, browser, "publish");
    assert.equal(creates, 1);
    assert.equal(uploads, 1);
    assert.equal(finished.length, 0);
    assert.deepEqual(createdIds, [created.product.id]);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /Ürün kaydı korundu/);
    assert.equal((container.querySelector('button[value="publish"]') as HTMLButtonElement).disabled, true);
    assert.equal(container.querySelector('a[href="/products/product-created"]')?.textContent, "Ürüne git");
    await submit(container, browser, "publish");
    await submit(container, browser, "publish");
    assert.equal(creates, 1);
    assert.equal(uploads, 1);
    const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Görselleri yeniden yükle")!;
    await act(async () => { retry.click(); retry.click(); });
    assert.equal(creates, 1);
    assert.equal(uploads, 2);
    assert.equal(finished.length, 1);
  });
});

test("adding images retains earlier files and alt text while cancel and total-limit rejection preserve the draft", async () => {
  const projections: drafts.ProductDraftSession[] = [];
  await withQuickCreate({ draftSession: draft(), onDraftSessionChange: (next: drafts.ProductDraftSession) => projections.push(next) }, async (container, browser) => {
    const first = new browser.File(["cover"], "cover.webp", { type: "image/webp" }) as unknown as File;
    const second = new browser.File(["detail"], "detail.webp", { type: "image/webp" }) as unknown as File;
    await selectImages(container, browser, [first]);
    assert.equal(projections.at(-1)?.current.media[0]?.file, first);
    await changeInput(container.querySelector('input[maxlength="500"]') as HTMLInputElement, browser, "Ön cep detayı");
    const originalPreview = projections.at(-1)?.current.media[0]?.preview;
    await selectImages(container, browser, [second]);
    const selected = projections.at(-1)!.current.media;
    assert.deepEqual(selected.map(({ file }) => file.name), ["cover.webp", "detail.webp"]);
    assert.deepEqual(selected.map(({ altText }) => altText), ["Ön cep detayı", ""]);
    assert.equal(selected[0]?.file, first);
    assert.equal(selected[1]?.file, second);
    assert.equal(selected[0]?.preview, originalPreview);
    const projectionCount = projections.length;
    await selectImages(container, browser, []);
    assert.equal(projections.length, projectionCount);
    assert.equal(projections.at(-1)?.current.media, selected);
    await selectImages(container, browser, Array.from({ length: 15 }, (_, index) => new browser.File(["extra"], `extra-${index}.webp`, { type: "image/webp" }) as unknown as File));
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /16/);
    assert.equal(projections.length, projectionCount);
    assert.equal(projections.at(-1)?.current.media, selected);
  });
});

async function dragImage(container: HTMLElement, browser: Window, from: number, to: number) {
  const source = container.querySelector(`button[aria-label="${from}. görseli seç"]`)?.closest('[data-sort-id]');
  const target = container.querySelector(`button[aria-label="${to}. görseli seç"]`)?.closest('[data-sort-id]');
  assert.ok(source && target, "images use real sortable sensors");
  const restore = installCatalogSortRects(browser, container);
  try { await dragCatalogItem(browser, container, source.getAttribute("data-sort-id")!, target.getAttribute("data-sort-id")!); }
  finally { restore(); }
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
}

test("quick creation preserves draft identities, cover and upload order after dragging and accessible moves", async () => {
  let latest: drafts.ProductDraftSession | undefined;
  const uploads: { file: File; altText: string }[] = [];
  let creates = 0;
  await withQuickCreate({ draftSession: draft(), onDraftSessionChange: (session: drafts.ProductDraftSession) => { latest = session; },
    api: { createProduct: async () => { creates++; return created; } },
    mediaClient: { upload: async (_id: string, selection: { file: File; altText: string }) => { uploads.push(selection); return {}; } },
  }, async (container, browser, rerender) => {
    const files = ["one", "two", "three"].map(value => new browser.File([value], "same.png", { type: "image/png" }) as unknown as File);
    await selectImages(container, browser, files);
    const before = latest!.current.media;
    assert.equal(new Set(before.map(image => image.localId)).size, 3, "duplicate filenames do not share image identities");
    for (const [index, value] of ["Ön", "Yan", "Arka"].entries()) await changeInput(container.querySelectorAll<HTMLInputElement>('input[maxlength="500"]')[index]!, browser, value);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="2. görseli seç"]')!.click());
    await dragImage(container, browser, 3, 1);
    assert.equal(creates, 0);
    assert.equal(uploads.length, 0);
    assert.deepEqual(latest!.current.media.map(image => image.file), [files[2], files[0], files[1]]);
    assert.equal(container.querySelector('.cover img')?.getAttribute("alt"), "Yan", "the selected preview follows its identity");
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="3. görseli öne taşı"]')!.click());
    assert.deepEqual(latest!.current.media.map(image => image.localId), [before[2]!.localId, before[1]!.localId, before[0]!.localId]);
    assert.deepEqual(latest!.current.media.map(image => image.altText), ["Arka", "Yan", "Ön"]);
    assert.equal(container.querySelector<HTMLButtonElement>('button[aria-label="1. görseli öne taşı"]')!.disabled, true);
    assert.equal(container.querySelector<HTMLButtonElement>('button[aria-label="3. görseli arkaya taşı"]')!.disabled, true);
    assert.ok([...container.querySelectorAll<HTMLImageElement>('.thumbnails img')].every(image => image.getAttribute("draggable") === "false"));
    await rerender({ key: "restored-order", draftSession: latest });
    assert.equal(container.querySelector('.cover img')?.getAttribute("alt"), "Arka", "restored first image is the cover");
    await submit(container, browser, "publish");
    assert.equal(creates, 1);
    assert.deepEqual(uploads.map(image => image.file), [files[2], files[1], files[0]]);
    assert.deepEqual(uploads.map(image => image.altText), ["Arka", "Yan", "Ön"]);
  });
});

test("quick creation prevents an in-flight image drop during save and recovery", async () => {
  let latest: drafts.ProductDraftSession | undefined, resolveCreate!: (value: unknown) => void;
  await withQuickCreate({ draftSession: draft(), onDraftSessionChange: (session: drafts.ProductDraftSession) => { latest = session; },
    api: { createProduct: () => new Promise(resolve => { resolveCreate = resolve; }) },
    mediaClient: { upload: async () => { throw new Error("upload_failed"); } },
  }, async (container, browser) => {
    await selectImages(container, browser, ["one", "two"].map(value => new browser.File([value], `${value}.png`, { type: "image/png" }) as unknown as File));
    const source = container.querySelector('button[aria-label="2. görseli seç"]')?.closest('[data-sort-id]');
    const target = container.querySelector('button[aria-label="1. görseli seç"]')?.closest('[data-sort-id]');
    assert.ok(source && target);
    installCatalogSortRects(browser, container);
    await beginCatalogMouseDrag(browser, container, source.getAttribute("data-sort-id")!);
    const before = latest!.current.media.map(image => image.localId);
    await submit(container, browser, "publish");
    await dropCatalogMouseDrag(browser, container, target.getAttribute("data-sort-id")!);
    assert.deepEqual(latest!.current.media.map(image => image.localId), before);
    assert.equal(container.querySelector<HTMLButtonElement>('button[aria-label="2. görseli öne taşı"]')!.matches(":disabled"), true);
    await act(async () => resolveCreate(created));
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /Ürün kaydı korundu/);
    assert.ok([...container.querySelectorAll<HTMLButtonElement>('button[aria-roledescription="Sıralanabilir öğe"]')].every(button => button.matches(":disabled")));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="2. görseli öne taşı"]')!.click());
    assert.deepEqual(latest!.current.media.map(image => image.localId), before);
  });
});

test("partial media recovery uploads only the failed file and publishes with the full media count", async () => {
  let creates = 0;
  const uploads: string[] = [];
  const published: { expectedProductVersion: number; expectedMediaCount: number }[] = [];
  const finished: unknown[] = [];
  await withQuickCreate((browser) => ({
    draftSession: draft({ media: [
      { file: new browser.File(["cover"], "cover.webp", { type: "image/webp" }) as unknown as File, altText: "Kapak", preview: "blob:cover" },
      { file: new browser.File(["detail"], "detail.webp", { type: "image/webp" }) as unknown as File, altText: "Detay", preview: "blob:detail" },
    ] }),
    api: {
      createProduct: async () => { creates++; return created; },
      publishAfterMedia: async (productId: string, command: { expectedProductVersion: number; expectedMediaCount: number }) => {
        assert.equal(productId, created.product.id);
        published.push(command);
        return { ...created, product: { ...created.product, status: "active" }, mediaCount: 2 };
      },
      getProductEditor: async () => created,
    },
    mediaClient: { upload: async (productId: string, selection: { file: File; altText: string }) => {
      assert.equal(productId, created.product.id);
      uploads.push(selection.file.name);
      if (selection.file.name === "detail.webp" && uploads.filter((name) => name === "detail.webp").length === 1) throw new Error("detail_upload_failed");
      return {};
    } },
    onCreated: (result: unknown) => finished.push(result),
  }), async (container, browser) => {
    await submit(container, browser, "publish");
    assert.equal(creates, 1);
    assert.deepEqual(uploads, ["cover.webp", "detail.webp"]);
    assert.equal(published.length, 0);
    assert.equal(finished.length, 0);
    const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Görselleri yeniden yükle")!;
    await act(async () => { retry.click(); });
    assert.equal(creates, 1);
    assert.deepEqual(uploads, ["cover.webp", "detail.webp", "detail.webp"]);
    assert.deepEqual(published, [{ expectedProductVersion: 1, expectedMediaCount: 2 }]);
    assert.equal(finished.length, 1);
    assert.equal((finished[0] as { mediaCount: number }).mediaCount, 2);
  });
});

test("detailed metadata and variant drafts cannot be reduced to a quick create", async () => {
  const session = draft();
  for (const protectedDraft of [draft({ description: "Korunan açıklama", seoTitle: "SEO başlığı" }), draft({ kind: "variant", variants: [{ ...session.current.variants[0]!, attributes: { Beden: "S" } }, { ...session.current.variants[0]!, attributes: { Beden: "M" } }] })]) {
    let creates = 0;
    let advanced = 0;
    const projections: drafts.ProductDraftSession[] = [];
    await withQuickCreate({ draftSession: protectedDraft, onDraftSessionChange: (next: drafts.ProductDraftSession) => projections.push(next), onAdvanced: () => { advanced++; },
      api: { createProduct: async () => { creates++; return created; }, publishAfterMedia: async () => created, getProductEditor: async () => created },
    }, async (container, browser) => {
      assert.equal((container.querySelector('button[value="publish"]') as HTMLButtonElement).disabled, true);
      await submit(container, browser, "publish");
      assert.equal(creates, 0);
      assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /detaylı formdan/);
      const handoff = [...container.querySelectorAll("button")].find((button) => button.textContent === "Detaylı forma dön")!;
      await act(async () => { handoff.click(); });
      assert.equal(advanced, 1);
      assert.equal(projections.at(-1)?.current.description, protectedDraft.current.description);
      assert.equal(projections.at(-1)?.current.seoTitle, protectedDraft.current.seoTitle);
      assert.deepEqual(projections.at(-1)?.current.variants, protectedDraft.current.variants);
    });
  }
});

test("page mode does not trap Tab and barcode reservation blocks saving and detailed handoff", async () => {
  let resolveBarcode!: (barcode: string) => void;
  let creates = 0;
  let advanced = 0;
  const busy: boolean[] = [];
  await withQuickCreate({ draftSession: draft(), onBusyChange: (value: boolean) => busy.push(value), onAdvanced: () => { advanced++; },
    api: { createProduct: async () => { creates++; return created; }, publishAfterMedia: async () => created, getProductEditor: async () => created },
  }, async (container, browser, rerender) => {
    const title = container.querySelector('input[name="title"]') as HTMLInputElement;
    title.focus();
    const tab = new browser.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    title.dispatchEvent(tab as unknown as Event);
    assert.equal(tab.defaultPrevented, false);
    await rerender({ mode: "dialog" });
    await act(async () => { (container.querySelector('button[aria-label="Dahili barkod oluştur"]') as HTMLButtonElement).click(); });
    assert.equal(busy.at(-1), true);
    assert.equal((container.querySelector('button[value="publish"]') as HTMLButtonElement).disabled, true);
    const handoff = [...container.querySelectorAll("button")].find((button) => button.textContent === "Gelişmiş ürün eklemeye geç")!;
    assert.equal(handoff.disabled, true);
    await act(async () => { handoff.click(); });
    await submit(container, browser, "publish");
    assert.equal(creates, 0);
    assert.equal(advanced, 0);
    await act(async () => { resolveBarcode("9800000000007"); });
    assert.equal(busy.at(-1), false);
    assert.equal((container.querySelector('input[name="barcode"]') as HTMLInputElement).value, "9800000000007");
    assert.equal((container.querySelector('button[value="publish"]') as HTMLButtonElement).disabled, false);
    assert.equal(handoff.disabled, false);
  }, () => new Promise<string>((resolve) => { resolveBarcode = resolve; }));
});


test("dialog Escape cancels keyboard image sorting without closing or discarding the draft",async()=>{
 let closes=0,latest:drafts.ProductDraftSession|undefined;
 await withQuickCreate({mode:"dialog",draftSession:draft(),onClose:()=>{closes++;},onDraftSessionChange:(session:drafts.ProductDraftSession)=>{latest=session;}},async(container,browser)=>{
  const files=["first","second"].map(name=>new browser.File([name],`${name}.png`,{type:"image/png"})as unknown as File);
  await selectImages(container,browser,files);
  const before=latest!.current.media.map(image=>image.localId);
  const restore=installCatalogSortRects(browser,container);
  try{
   const handle=container.querySelector<HTMLButtonElement>('button[aria-roledescription="Sıralanabilir öğe"]')!;assert.ok(handle);handle.focus();
   await catalogSortKey(browser,"Space",handle);assert.ok(container.querySelector('[data-sort-dragging="true"]'),"keyboard sensor is active");
   await catalogSortKey(browser,"ArrowRight",handle);
   await catalogSortKey(browser,"Escape",handle);
   assert.equal(closes,0,"Escape first cancels only the active sorting gesture");
   assert.equal(container.querySelector('[data-sort-dragging="true"]'),null);
   assert.deepEqual(latest!.current.media.map(image=>image.localId),before);assert.equal(latest!.current.title,"Pamuk elbise");
   assert.deepEqual(latest!.current.media.map(image=>image.file),files);
   const title=container.querySelector<HTMLInputElement>('input[name="title"]')!;title.focus();await catalogSortKey(browser,"Escape",title);
   assert.equal(closes,1,"ordinary dialog Escape still closes");
  }finally{restore();}
 });
});
