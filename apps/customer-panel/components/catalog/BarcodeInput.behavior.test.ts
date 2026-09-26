import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";

async function withBarcodeInput(
  props: Record<string, unknown>,
  verify: (container: HTMLElement, browser: Window, rerender: (next: Record<string, unknown>) => Promise<void>) => Promise<void>,
) {
  const browser = new Window({ url: "https://panel.example.test/products/new" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: browser, document: browser.document, navigator: browser.navigator,
    HTMLElement: browser.HTMLElement, Event: browser.Event, MouseEvent: browser.MouseEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const source = await readFile(new URL("./BarcodeInput.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "lucide-react") return { ScanBarcode: () => createElement("svg", { "aria-hidden": true }) };
    if (name === "@/lib/barcode-labels/reserve-internal") return { reserveInternalBarcode: async () => "9800000000007" };
    if (name === "./barcode-input.module.css") return { default: { control: "control", input: "input", generate: "generate", error: "error" } };
    throw new Error(`unexpected_import:${name}`);
  }, compiled, compiled.exports);
  const BarcodeInput = compiled.exports.BarcodeInput as React.ComponentType<Record<string, unknown>>;
  const container = browser.document.createElement("form");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  try {
    await act(async () => { root.render(createElement(BarcodeInput, props)); });
    await verify(container as unknown as HTMLElement, browser, async (next) => {
      await act(async () => { root.render(createElement(BarcodeInput, next)); });
    });
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of globals) descriptor
      ? Object.defineProperty(globalThis, key, descriptor)
      : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
}

test("icon fills an empty barcode field but does not submit the product", async () => {
  let requested = 0;
  let submitted = 0;
  await withBarcodeInput({ name: "barcode", reserve: async () => { requested++; return "9800000000007"; } }, async (container, browser) => {
    container.addEventListener("submit", () => { submitted++; });
    const button = container.querySelector('button[aria-label="Dahili barkod oluştur"]') as HTMLButtonElement;
    assert.ok(button);
    assert.equal(button.type, "button");
    assert.match(button.title, /13 haneli 98 veya 99 ile başlayan dahili barkod/);
    await act(async () => { button.click(); });
    assert.equal((container.querySelector('input[name="barcode"]') as HTMLInputElement).value, "9800000000007");
    assert.equal(new browser.FormData(browser.document.querySelector("form")!).get("barcode"), "9800000000007");
    assert.equal(requested, 1);
    assert.equal(submitted, 0);
    assert.equal(button.disabled, true);
  });
});

test("existing barcode is never overwritten and a pending click is not duplicated", async () => {
  let resolve!: (value: string) => void;
  let requested = 0;
  await withBarcodeInput({ defaultValue: "8691234567890", reserve: async () => { requested++; return "9800000000007"; } }, async (container) => {
    const button = container.querySelector("button") as HTMLButtonElement;
    assert.equal(button.disabled, true);
    await act(async () => { button.click(); });
    assert.equal(requested, 0);
  });
  await withBarcodeInput({ reserve: () => { requested++; return new Promise<string>((done) => { resolve = done; }); } }, async (container) => {
    const button = container.querySelector("button") as HTMLButtonElement;
    await act(async () => { button.click(); button.click(); });
    assert.equal(requested, 1);
    assert.equal(button.disabled, true);
    await act(async () => { resolve("9900000000004"); });
    assert.equal((container.querySelector("input") as HTMLInputElement).value, "9900000000004");
  });
});

test("failed reservation leaves the barcode empty and reports an actionable error", async () => {
  await withBarcodeInput({ reserve: async () => { throw new Error("forbidden"); } }, async (container) => {
    await act(async () => { (container.querySelector("button") as HTMLButtonElement).click(); });
    assert.equal((container.querySelector("input") as HTMLInputElement).value, "");
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /yetkiniz yok/i);
  });
});

test("a removed variant never receives a late barcode reservation", async () => {
  let resolve!: (value: string) => void;
  const changed: string[] = [];
  const oldVariant = {};
  const newVariant = {};
  const reserve = () => new Promise<string>((done) => { resolve = done; });
  await withBarcodeInput({ value: "", reservationIdentity: oldVariant, reserve, onChange: (value: string) => changed.push(value) }, async (container, _browser, rerender) => {
    await act(async () => { (container.querySelector("button") as HTMLButtonElement).click(); });
    await rerender({ value: "", reservationIdentity: newVariant, reserve, onChange: (value: string) => changed.push(value) });
    await act(async () => { resolve("9800000000007"); });
    assert.equal((container.querySelector("input") as HTMLInputElement).value, "");
    assert.deepEqual(changed, []);
  });
});

test("busy notifications are paired and late reservations cannot overwrite manual or unmounted fields", async () => {
  let resolve!: (value: string) => void;
  const changed: string[] = [];
  const busy: boolean[] = [];
  let generated = 0;
  const identity = {};
  const reserve = () => new Promise<string>((done) => { resolve = done; });
  const props = { value: "", reservationIdentity: identity, reserve,
    onChange: (value: string) => changed.push(value), onBusyChange: (value: boolean) => busy.push(value),
    onGenerated: () => { generated++; }, actionLabel: "Oluştur" };
  await withBarcodeInput(props, async (container, _browser, rerender) => {
    await act(async () => { (container.querySelector("button") as HTMLButtonElement).click(); });
    assert.deepEqual(busy, [true]);
    await rerender({ ...props, value: "MANUAL-0001" });
    await act(async () => { resolve("9800000000007"); });
    assert.equal((container.querySelector("input") as HTMLInputElement).value, "MANUAL-0001");
    assert.deepEqual(changed, []);
    assert.equal(generated, 0);
    assert.deepEqual(busy, [true, false]);
  });
  const unmountedBusy: boolean[] = [];
  let completeAfterUnmount!: (value: string) => void;
  await withBarcodeInput({ reserve: () => new Promise<string>((done) => { completeAfterUnmount = done; }),
    onBusyChange: (value: boolean) => unmountedBusy.push(value), onChange: (value: string) => changed.push(value),
  }, async (container) => {
    await act(async () => { (container.querySelector("button") as HTMLButtonElement).click(); });
    assert.deepEqual(unmountedBusy, [true]);
  });
  assert.deepEqual(unmountedBusy, [true, false]);
  await act(async () => { completeAfterUnmount("9900000000004"); });
  assert.deepEqual(unmountedBusy, [true, false]);
  assert.deepEqual(changed, []);
});
