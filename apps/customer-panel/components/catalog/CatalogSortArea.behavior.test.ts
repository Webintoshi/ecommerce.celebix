import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import React, { act, createElement } from "react";
import { Window } from "happy-dom";
import ts from "typescript";
import { dragCatalogItem, installCatalogSortRects } from "./catalog-sort-test-utils.ts";

const require = createRequire(import.meta.url);
type SortModule = typeof import("./CatalogSortArea.tsx");

async function loadComponents(): Promise<SortModule> {
  let source: string;
  try { source = await readFile(new URL("./CatalogSortArea.tsx", import.meta.url), "utf8"); }
  catch { return {} as SortModule; }
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiled = { exports: {} };
  Function("require", "module", "exports", output)((name: string) => name.endsWith(".css")
    ? { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) }
    : require(name), compiled, compiled.exports);
  return compiled.exports as SortModule;
}

async function withSort(run: (fixture: {
  container: HTMLElement; browser: Window; calls: string[][];
  render(props?: { ids?: readonly string[]; disabled?: boolean; layout?: "grid" | "list" }): Promise<void>;
  mouse(type: string, x: number, y: number, target?: Element): Promise<void>;
  key(code: string, target?: Element): Promise<void>;
  touch(type: string, x: number, y: number, target?: Element): Promise<void>;
  pause(ms: number): Promise<void>;
}) => Promise<void>) {
  const browser = new Window({ url: "https://fixture.invalid/products/new" });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  let ids: readonly string[] = ["a", "b", "c"];
  let layout = "list";
  const rect = (left: number, top: number, width: number, height: number) => new browser.DOMRect(left, top, width, height);
  browser.HTMLElement.prototype.getBoundingClientRect = function () {
    const id = this.closest("[data-sort-id]")?.getAttribute("data-sort-id");
    const index = id ? ids.indexOf(id) : -1;
    return index < 0 ? rect(0, 0, 800, 600) : layout === "grid" ? rect((index % 2) * 120, Math.floor(index / 2) * 120, 100, 100) : rect(0, index * 120, 100, 100);
  };
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator,
    HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, Document: browser.Document,
    MouseEvent: browser.MouseEvent, KeyboardEvent: browser.KeyboardEvent, Event: browser.Event,
    MutationObserver: browser.MutationObserver, ResizeObserver: browser.ResizeObserver,
    getComputedStyle: browser.getComputedStyle.bind(browser), requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser), IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const container = browser.document.createElement("div"); browser.document.body.append(container);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(container as never);
  const calls: string[][] = [];
  try {
    const { CatalogSortArea, CatalogSortItem } = await loadComponents();
    assert.equal(typeof CatalogSortArea, "function", "the reusable sortable area exists");
    assert.equal(typeof CatalogSortItem, "function");
    const pause = async (ms: number) => { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); };
    const render = async (props: { ids?: readonly string[]; disabled?: boolean; layout?: "grid" | "list" } = {}) => {
      ids = props.ids ?? ids; layout = props.layout ?? layout;
      const children = ids.map(id => createElement(CatalogSortItem, { id, key: id, children: drag => createElement(React.Fragment, {},
          createElement("button", { ...drag.handleProps, "data-grip": id }, "Taşı"),
          createElement("button", { ...drag.pointerProps, type: "button", "data-image": id }, "Görsel"),
          createElement("input", { "data-field": id, defaultValue: `Değer ${id}` }),
        ) }));
      await act(async () => root.render(createElement(CatalogSortArea, { ids, disabled: props.disabled, layout: layout as "list", label: "Ürün sırası", getLabel: id => `Ürün ${id}`, onMove: (source, target) => { calls.push([source, target]); }, children })));
      await pause(1);
    };
    const mouse = async (type: string, x: number, y: number, target?: Element) => {
      await act(async () => (target ?? browser.document).dispatchEvent(new browser.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === "mouseup" ? 0 : 1, clientX: x, clientY: y }) as never));
    };
    const key = async (code: string, target?: Element) => {
      await act(async () => (target ?? browser.document).dispatchEvent(new browser.KeyboardEvent("keydown", { bubbles: true, cancelable: true, code, key: code === "Space" ? " " : code }) as never));
      await pause(1);
    };
    const touch = async (type: string, x: number, y: number, target?: Element) => {
      const event = new browser.TouchEvent(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : [{ identifier: 1, clientX: x, clientY: y }] });
      Object.defineProperty(event, "changedTouches", { value: [{ identifier: 1, clientX: x, clientY: y }] });
      await act(async () => (target ?? browser.document).dispatchEvent(event as never));
    };
    await run({ container: container as unknown as HTMLElement, browser, calls, render, mouse, key, touch, pause });
  } finally {
    await act(async () => root.unmount());
    await browser.happyDOM.close();
    for (const [key, value] of previous) value ? Object.defineProperty(globalThis, key, value) : Reflect.deleteProperty(globalThis, key);
  }
}

test("real mouse sensor previews a list move and commits only after dropping", async () => withSort(async f => {
  await f.render();
  await f.mouse("mousedown", 30, 30, f.container.querySelector('[data-grip="a"]')!);
  await f.mouse("mousemove", 38, 30); await f.mouse("mousemove", 30, 270);
  assert.equal(f.calls.length, 0);
  assert.ok(f.container.querySelector('[data-sort-dragging="true"]'));
  assert.equal(f.container.querySelectorAll("input").length, 3, "the overlay never duplicates form fields");
  await f.mouse("mouseup", 30, 270);
  assert.deepEqual(f.calls, [["a", "c"]]);
}));

test("real keyboard sensor supports grid coordinates and Escape cancellation", async () => withSort(async f => {
  await f.render({ layout: "grid" });
  const grip = f.container.querySelector<HTMLButtonElement>('[data-grip="a"]')!; grip.focus();
  await f.key("Space", grip); await f.key("ArrowRight");
  assert.equal(f.calls.length, 0);
  await f.key("Escape"); assert.deepEqual(f.calls, []);
  grip.focus(); await f.key("Space", grip); await f.key("ArrowDown"); await f.key("Space");
  assert.deepEqual(f.calls, [["a", "c"]]);
}));

test("outside drops, tiny mouse movements and ordinary field editing do not reorder", async () => withSort(async f => {
  await f.render();
  const grip = f.container.querySelector('[data-grip="a"]')!;
  await f.mouse("mousedown", 30, 30, grip); await f.mouse("mousemove", 33, 30); await f.mouse("mouseup", 33, 30);
  await f.mouse("mousedown", 30, 30, f.container.querySelector('[data-field="a"]')!); await f.mouse("mousemove", 30, 270); await f.mouse("mouseup", 30, 270);
  await f.mouse("mousedown", 30, 30, grip); await f.mouse("mousemove", 38, 30); await f.mouse("mousemove", 700, 550); await f.mouse("mouseup", 700, 550);
  assert.deepEqual(f.calls, []);
}));

test("disabling or changing identities during a gesture rejects the pending drop", async () => withSort(async f => {
  for (const updates of [[{ disabled: true }], [{ ids: ["a", "c", "b"] }], [{ disabled: true }, { disabled: false }], [{ ids: ["a", "c", "b"] }, { ids: ["a", "b", "c"] }]]) {
    await f.render({ ids: ["a", "b", "c"], disabled: false });
    await f.mouse("mousedown", 30, 30, f.container.querySelector('[data-grip="a"]')!);
    await f.mouse("mousemove", 38, 30); await f.mouse("mousemove", 30, 270);
    for (const update of updates) await f.render(update);
    await f.mouse("mouseup", 30, 270);
  }
  assert.deepEqual(f.calls, []);
}));

test("real touch sensor requires a hold and supports image-button dragging", async () => withSort(async f => {
  await f.render();
  const image = f.container.querySelector('[data-image="a"]')!;
  await f.touch("touchstart", 30, 30, image); await f.touch("touchend", 30, 30, image);
  assert.deepEqual(f.calls, []);
  await f.touch("touchstart", 30, 30, image); await f.touch("touchmove", 45, 30, image); await f.pause(170);
  assert.ok(!f.container.querySelector('[data-sort-dragging="true"]'), "moving before the hold cancels touch activation");
  await f.touch("touchend", 45, 30, image);
  await f.touch("touchstart", 30, 30, image); await f.pause(170);
  await f.touch("touchmove", 30, 270, image); await f.touch("touchend", 30, 270, image);
  assert.deepEqual(f.calls, [["a", "c"]]);
}));

test("consumer fixture helpers drive the real shared mouse sensor", async () => withSort(async f => {
  await f.render();
  const restore = installCatalogSortRects(f.browser, f.container, "list");
  try {
    await dragCatalogItem(f.browser, f.container, "a", "c");
    assert.deepEqual(f.calls, [["a", "c"]]);
  } finally { restore(); }
}));
