import * as authoringImages from "../../lib/content-authoring-ui/image-alts.ts";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import { compile } from "../../lib/mira-final-test-support.ts";
import { beginCatalogMouseDrag, catalogSortKey, dropCatalogMouseDrag, hoverCatalogMouseDrag, installCatalogSortRects } from "./catalog-sort-test-utils.ts";

const existingMedia = [1, 2, 3].map((position) => ({ id: `saved-${position}`, version: 1, status: "active", sortOrder: position - 1, altText: `Açı ${position}`, publicUrl: `https://media.example.test/${position}.webp`, cleanupState: "retained" }));

async function withMediaManager(
  upload: (file: File) => Promise<unknown>,
  verify: (container: HTMLElement, browser: Window, rerender: (props: Record<string, unknown>) => Promise<void>) => Promise<void>,
  supplied: Readonly<{ media?: readonly Record<string, unknown>[]; api?: Record<string, unknown>; canManage?: boolean; canArchive?: boolean }> = {},
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
    Element: browser.Element, Node: browser.Node, Document: browser.Document,
    MouseEvent: browser.MouseEvent, KeyboardEvent: browser.KeyboardEvent,
    MutationObserver: browser.MutationObserver, ResizeObserver: browser.ResizeObserver,
    getComputedStyle: browser.getComputedStyle.bind(browser), requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
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
  let persisted = supplied.media ?? [];
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "@/lib/content-authoring-ui/image-alts") return authoringImages;
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "lucide-react") return new Proxy({}, { get: () => () => createElement("svg") });
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
    if (name === "./CatalogSortArea") return compile("components/catalog/CatalogSortArea.tsx");
    if (name === "@/lib/catalog-ui/media-client") return {
      ProductMediaApiError: class ProductMediaApiError extends Error {},
      productMediaApi: {
        list: async () => persisted,
        reorder: async (_productId: string, ids: readonly string[]) => {
          persisted = [...ids.map((id, sortOrder) => ({ ...persisted.find(item => item.id === id), sortOrder })), ...persisted.filter(item => item.status === "archived")];
          return persisted;
        },
        upload: async (_productId: string, input: { file: File }) => {
          await upload(input.file);
          return { media: { id: `media-${++nextId}`, status: "active", sortOrder: nextId, altText: "", publicUrl: "" } };
        },
        ...supplied.api,
      },
    };
    throw new Error(`unexpected_import:${name}`);
  }, compiled, compiled.exports);
  const { createRoot } = await import("react-dom/client");
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  try {
    const props = { productId: "product-1", canManage: supplied.canManage ?? true, canArchive: supplied.canArchive ?? false };
    const Component = compiled.exports.ProductMediaManager as React.ComponentType<typeof props>;
    await act(async () => root.render(createElement(Component, props)));
    await verify(container as unknown as HTMLElement, browser, async next => { await act(async () => root.render(createElement(Component, { ...props, ...next }))); });
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

test("saved gallery uses real sensors and only saves the confirmed drop, preserving alt text while dragging", async () => {
  const calls: string[][] = [];
  await withMediaManager(async () => {}, async (container, browser) => {
    const restore = installCatalogSortRects(browser, container);
    try {
      await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="2. görselin alt metnini düzenle"]')!.click());
      const alt = container.querySelector<HTMLInputElement>('form.altForm input')!;
      alt.value = "Kaydedilmemiş alt metin";
      await beginCatalogMouseDrag(browser, container, "saved-3");
      await hoverCatalogMouseDrag(browser, container, "saved-1");
      assert.equal(calls.length, 0);
      assert.equal(container.querySelectorAll('form.altForm input').length, 1);
      assert.equal(alt.value, "Kaydedilmemiş alt metin");
      await catalogSortKey(browser, "Escape");
      assert.equal(calls.length, 0);
      await beginCatalogMouseDrag(browser, container, "saved-3");
      await dropCatalogMouseDrag(browser, container, "saved-1");
      assert.deepEqual(calls, [["saved-3", "saved-1", "saved-2"]]);
      assert.equal(container.querySelector('article[data-sort-id]')?.getAttribute("data-sort-id"), "saved-3");
      assert.ok([...container.querySelectorAll("article img")].every(image => image.getAttribute("draggable") === "false"));
    } finally { restore(); }
  }, { media: existingMedia, api: { reorder: async (_productId: string, ids: string[]) => { calls.push(ids); return ids.map((id, sortOrder) => ({ ...existingMedia.find(item => item.id === id), sortOrder })); } } });
});

test("saved gallery ignores a duplicate arrow command before React flushes the pending save", async () => {
  const calls: string[][] = []; let finish!: (value: unknown) => void;
  await withMediaManager(async () => {}, async container => {
    const arrow = container.querySelector<HTMLButtonElement>('button[aria-label="3. görseli öne taşı"]')!;
    await act(async () => { arrow.click(); arrow.click(); });
    assert.equal(calls.length, 1, "the synchronous save guard prevents duplicate requests");
    await act(async () => finish(existingMedia));
  }, { media: existingMedia, api: { reorder: async (_productId: string, ids: string[]) => { calls.push(ids); return new Promise(resolve => { finish = resolve; }); } } });
});

test("a saved-gallery drag cannot reorder after upload or permission changes during the gesture", async () => {
  const calls: string[][] = []; let finishUpload!: () => void;
  await withMediaManager(() => new Promise(resolve => { finishUpload = () => resolve(undefined); }), async (container, browser, rerender) => {
    const restore = installCatalogSortRects(browser, container);
    try {
      await choose(container, browser, [new browser.File(["file"], "new.webp", { type: "image/webp" }) as unknown as File]);
      await beginCatalogMouseDrag(browser, container, "saved-3");
      await hoverCatalogMouseDrag(browser, container, "saved-1");
      await submit(container, browser);
      await dropCatalogMouseDrag(browser, container, "saved-1");
      assert.equal(calls.length, 0);
      await act(async () => finishUpload());
      await beginCatalogMouseDrag(browser, container, "saved-3");
      await hoverCatalogMouseDrag(browser, container, "saved-1");
      await rerender({ canManage: false });
      await dropCatalogMouseDrag(browser, container, "saved-1");
      assert.equal(calls.length, 0);
    } finally { restore(); }
  }, { media: existingMedia, api: { reorder: async (_productId: string, ids: string[]) => { calls.push(ids); return existingMedia; } } });
});

test("a failed gallery reorder retains the prior order and releases the save guard for retry", async () => {
  let calls = 0;
  await withMediaManager(async () => {}, async container => {
    const move = () => container.querySelector<HTMLButtonElement>('button[aria-label="3. görseli öne taşı"]')!;
    await act(async () => move().click());
    assert.equal(calls, 1);
    assert.deepEqual([...container.querySelectorAll("article[data-sort-id]")].map(item => item.getAttribute("data-sort-id")), ["saved-1", "saved-2", "saved-3"]);
    assert.ok(container.querySelector('[role="alert"]'));
    await act(async () => move().click());
    assert.equal(calls, 2);
    assert.deepEqual([...container.querySelectorAll("article[data-sort-id]")].map(item => item.getAttribute("data-sort-id")), ["saved-1", "saved-3", "saved-2"]);
  }, { media: existingMedia, api: { reorder: async (_productId: string, ids: string[]) => { if (++calls === 1) throw new Error("fixture_failure"); return ids.map((id, sortOrder) => ({ ...existingMedia.find(item => item.id === id), sortOrder })); } } });
});

test("saved-gallery alt editing, archive confirmation and restore remain operational", async () => {
  let archives = 0, restores = 0; const altTexts: unknown[] = [];
  await withMediaManager(async () => {}, async (container, browser) => {
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="1. görselin alt metnini düzenle"]')!.click());
    const field = container.querySelector<HTMLInputElement>('form.altForm input')!; field.value = "Yeni açı";
    await act(async () => container.querySelector("form.altForm")!.dispatchEvent(new browser.SubmitEvent("submit", { bubbles: true, cancelable: true }) as never));
    assert.deepEqual(altTexts, [{ expectedVersion: 1, altText: "Yeni açı" }]);
    assert.match(container.querySelector("article .altText")?.textContent ?? "", /Yeni açı/);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="1. görseli arşivle"]')!.click());
    assert.ok(container.querySelector('[role="alertdialog"]'));
    await act(async () => {
      const confirm = container.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')[1]!;
      confirm.click(); confirm.click();
    });
    assert.equal(archives, 1);
    assert.equal(container.querySelectorAll("article").length, 2);
    await act(async () => container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]!.click());
    assert.equal(container.querySelectorAll("article").length, 1);
    assert.ok(!container.querySelector('button[aria-roledescription="Sıralanabilir öğe"]'));
    await act(async () => container.querySelector<HTMLButtonElement>('.archiveActions button')!.click());
    assert.equal(restores, 1);
    await act(async () => container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[0]!.click());
    assert.equal(container.querySelectorAll("article").length, 3);
  }, { media: existingMedia, canArchive: true, api: {
    updateAlt: async (_productId: string, _mediaId: string, input: unknown) => { altTexts.push(input); return { media: { ...existingMedia[0], altText: "Yeni açı", version: 2 } }; },
    archive: async () => { archives++; return { media: { ...existingMedia[0], altText: "Yeni açı", version: 3, status: "archived" } }; },
    restore: async () => { restores++; return { media: { ...existingMedia[0], altText: "Yeni açı", version: 4 } }; },
  } });
});

test('saved-media authoring applies only explicit stable IDs through the normal versioned alt save',async()=>{
 let bridge:any;const saves:any[]=[];
 await withMediaManager(async()=>{},async(_container,_browser,rerender)=>{
  await rerender({onAuthoringMediaBridgeChange:(value:any)=>{bridge=value;}});const captured=bridge.captureImages();assert.equal(captured[0].thumbnailUrl,'/api/content-ai/image-source/product-1/saved-1');assert.equal(captured[0].url,'https://media.example.test/1.webp');
  await act(async()=>assert.equal(await bridge.applyImageAlts([{id:'saved-3',altText:'New third angle'}],captured),true));
  assert.deepEqual(saves,[{productId:'product-1',id:'saved-3',input:{expectedVersion:1,altText:'New third angle'}}]);
  const current=bridge.captureImages();assert.equal(current.find((image:any)=>image.id==='saved-1').altText,'Açı 1');assert.equal(current.find((image:any)=>image.id==='saved-3').altText,'New third angle');assert.equal(bridge.canApplyImageAlts([{id:'saved-3',altText:'Stale'}],captured),false);
 },{media:existingMedia,api:{updateAlt:async(productId:string,id:string,input:any)=>{saves.push({productId,id,input});return {media:{...existingMedia.find(item=>item.id===id),altText:input.altText,version:2}};}}});
});
