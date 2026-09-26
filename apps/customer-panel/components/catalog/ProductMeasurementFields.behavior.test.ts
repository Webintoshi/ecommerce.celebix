import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import * as measurements from "../../lib/catalog-ui/product-measurements.ts";
import { buildVariantUpdatePayload } from "../../lib/catalog-ui/forms.ts";

test("detail measurement fields reopen saved decimals and units, preserve partial edits and explicitly clear all fields", async () => {
  const browser = new Window({ url: "https://panel.example.test/products/product-test" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, Event: browser.Event, FormData: browser.FormData, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const source = await readFile(new URL("./ProductMeasurementFields.tsx", import.meta.url), "utf8");
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "lucide-react") return { ChevronDown: () => createElement("svg", { "aria-hidden": true }) };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
    if (name === "@/lib/catalog-ui/product-measurements") return measurements;
    throw new Error(`unexpected_import:${name}`);
  }, compiled, compiled.exports);
  const Fields = compiled.exports.ProductMeasurementFields as React.ComponentType<Record<string, unknown>>;
  const { createRoot } = await import("react-dom/client");
  const container = browser.document.createElement("div"); browser.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  const saved = { weight: { valueMilli: 14890, unit: "g" as const }, volume: { valueMilli: 125, unit: "l" as const }, height: { valueMilli: 2005, unit: "m" as const }, packageCount: 6 };
  const input = (key: string) => container.querySelector(`input[name="measurement-${key}"]`) as unknown as HTMLInputElement;
  const change = async (key: string, value: string) => { await act(async () => {
    Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(input(key), value);
    input(key).dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event);
  }); };
  const formPayload = () => {
    const data = new browser.FormData(container.querySelector("form")!);
    return buildVariantUpdatePayload({ title: "Standart", sku: "", barcode: "", price: "100,00", compareAt: "", cost: "", stockTracking: true, stockQuantity: "7", measurements: measurements.readProductMeasurementForm(data as unknown as FormData) }, 4, { Renk: "Beyaz" });
  };
  try {
    await act(async () => root.render(createElement("form", {}, createElement(Fields, { defaultValue: measurements.measurementsToDraft(saved) }))));
    assert.equal(input("weight").value, "14,89");
    assert.equal(input("volume").value, "0,125");
    assert.equal((container.querySelector('select[name="measurement-heightUnit"]') as unknown as HTMLSelectElement).value, "m");
    assert.equal(input("width").value, "", "dimensions remain independently optional");
    assert.ok([...container.querySelectorAll('input[name^="measurement-"]')].every((field) => !(field as unknown as HTMLInputElement).required));
    const untouched = formPayload(); assert.equal(untouched.ok, true);
    if (untouched.ok) assert.deepEqual(untouched.value.variant.measurements, saved);
    await change("weight", "14.99");
    await change("height", "");
    const edited = formPayload(); assert.equal(edited.ok, true);
    if (edited.ok) {
      assert.deepEqual(edited.value.variant.measurements, { weight: { valueMilli: 14990, unit: "g" }, volume: { valueMilli: 125, unit: "l" }, packageCount: 6 });
      assert.equal(edited.value.variant.stockQuantity, 7);
      assert.equal(edited.value.variant.priceCents, 10000);
      assert.deepEqual(edited.value.variant.attributes, { Renk: "Beyaz" });
    }
    for (const { key } of measurements.MEASUREMENT_FIELDS) await change(key, "");
    await change("packageCount", "");
    const cleared = formPayload(); assert.equal(cleared.ok, true);
    if (cleared.ok) assert.equal(cleared.value.variant.measurements, null);
    await act(async () => root.render(createElement("form", {}, createElement(Fields, { key: "reopened", defaultValue: measurements.measurementsToDraft(saved) }))));
    assert.equal(input("weight").value, "14,89", "reopening uses stored values, not abandoned local edits");
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
});
