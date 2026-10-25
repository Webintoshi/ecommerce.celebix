import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement, useState } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";

import { attributeChoices, mergeSelectedVariants, reconcileVariantRows, updateSharedVariantDefault, variantAttributeKey } from "./catalog-onboarding-ui/attribute-variants.ts";
import { attributeValueIdentity, buildAttributeResourceMutation, parseAttributeMeasurementValue, saveAttributeForPicker } from "./catalog-onboarding-ui/attribute-resource.ts";
import { buildVariantMatrix } from "./catalog-onboarding-ui/variant-matrix.ts";
import type { VariantDraft } from "../components/catalog-onboarding/ProductVariantBuilder.tsx";

const resources = [
  { id: "11111111-1111-4111-8111-111111111111", kind: "attribute", name: "Renk", slug: "renk", status: "active", config: { values: ["Siyah", "Beyaz"] } },
  { id: "22222222-2222-4222-8222-222222222222", kind: "attribute", name: "Beden", slug: "beden", status: "active", config: { values: ["S", "M"] } },
];

async function withPicker(savedResources: readonly unknown[], verify: (input: { container: ReturnType<Window["document"]["createElement"]>; click(label: string, combination?: boolean): Promise<void>; staged(): readonly VariantDraft[]; browser: Window }) => Promise<void>) {
  const browser = new Window({ url: "https://panel.example.test/products/new?mode=advanced" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: browser, document: browser.document, navigator: browser.navigator,
    HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, Event: browser.Event, InputEvent: browser.InputEvent, MouseEvent: browser.MouseEvent,
    MutationObserver: browser.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const source = await readFile(new URL("../components/catalog-onboarding/AttributeVariantPicker.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const styles = new Proxy({}, { get: (_target, key) => key === "__esModule" ? true : key === "default" ? styles : String(key) });
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "@/lib/catalog-admin-ui/client") return { catalogAdminApi: { async resources() { return savedResources; } }, CatalogAdminApiError: class extends Error {} };
    if (name === "@/lib/catalog-onboarding-ui/attribute-variants") return { attributeChoices, mergeSelectedVariants, reconcileVariantRows, updateSharedVariantDefault, variantAttributeKey };
    if (name === "@/lib/catalog-onboarding-ui/attribute-resource") return { attributeValueIdentity, buildAttributeResourceMutation, parseAttributeMeasurementValue, saveAttributeForPicker };
    if (name === "@/lib/catalog-onboarding-ui/variant-matrix") return { buildVariantMatrix };
    if (name === "./attribute-variant-picker.module.css" || name === "./create-advanced.module.css") return styles;
    throw new Error(`unexpected_import:${name}`);
  }, compiled, compiled.exports);
  const Picker = compiled.exports.AttributeVariantPicker as React.ComponentType<{ value: readonly VariantDraft[]; onChange(value: readonly VariantDraft[]): void }>;
  const { createRoot } = await import("react-dom/client");
  const container = browser.document.createElement("div");
  browser.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  let staged: readonly VariantDraft[] = [];
  function Harness() {
    const [value, setValue] = useState<readonly VariantDraft[]>([]);
    return createElement(Picker, { value, onChange(next) { staged = next; setValue(next); } });
  }
  const click = async (label: string, combination = false) => {
    const scope = combination ? container.querySelector('[aria-label="Satılacak kombinasyonlar"]')! : container;
    const input = [...scope.querySelectorAll("label")].find((node) => node.textContent?.trim() === label)?.querySelector("input");
    assert.ok(input, `missing ${label}`);
    await act(async () => { input.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  };
  try {
    await act(async () => { root.render(createElement(Harness)); await new Promise((resolve) => setTimeout(resolve, 0)); });
    await verify({ container, click, staged: () => staged, browser });
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
}

test("attribute picker renders saved values and stages only checked combinations", async () => {
  await withPicker(resources, async ({ container, click, staged, browser }) => {
    assert.match(container.textContent ?? "", /Renk/);
    await click("Renk");
    await click("Beden");
    await click("Siyah");
    await click("Beyaz");
    await click("M");
    assert.match(container.textContent ?? "", /Siyah \/ M/);
    assert.match(container.textContent ?? "", /Beyaz \/ M/);
    await click("Siyah / M");
    assert.deepEqual(staged().map(({ title, attributes }) => ({ title, attributes })), [{ title: "Siyah / M", attributes: { renk: "Siyah", beden: "M" } }]);
    let confirmations = 0;
    Object.defineProperty(browser, "confirm", { configurable: true, value: () => { confirmations++; return false; } });
    await click("Siyah / M");
    assert.equal(confirmations, 1);
    assert.equal(staged().length, 1);
    Object.defineProperty(browser, "confirm", { configurable: true, value: () => true });
    await click("Siyah / M");
    assert.equal(staged().length, 0);
    assert.ok([...container.querySelectorAll("button")].some((node) => node.textContent?.includes("Renk için değer ekle")));
  });
});

test("bound picker selection stages physical weight while disabled presets are neither shown nor invalid", async () => {
  const weight = { ...resources[0], name: "Gramaj", slug: "gramaj", config: { key: "net_weight", measurementField: "weight", values: ["250 g"] } };
  const disabled = { ...resources[1], name: "Kapalı nitelik", config: { enabled: false, values: [] } };
  await withPicker([weight, disabled], async ({ container, click, staged, browser }) => {
    assert.doesNotMatch(container.textContent, /Kapalı nitelik|değeri geçersiz/);
    await click("Gramaj"); await click("250 g"); await click("250 g", true);
    assert.deepEqual(staged()[0]?.measurements, { weight: "250", weightUnit: "g" }); assert.equal(staged()[0]?.shippingDesi, ""); assert.deepEqual(staged()[0]?.attributes, { net_weight: "250 g" });
    const edit = [...container.querySelectorAll("button")].find((button) => button.textContent === "Gramaj için değer ekle")!;
    await act(async () => edit.click());
    const input = container.querySelector('input[aria-label="Yeni nitelik değeri"]')!;
    const add = [...container.querySelectorAll("button")].find((button) => button.textContent === "Değer ekle")!;
    await act(async () => { Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(input, "500 g"); input.dispatchEvent(new browser.Event("input", { bubbles: true })); });
    await act(async () => add.click());
    assert.ok(container.querySelector('[aria-label="500 g değerini kaldır"]'), "a valid controlled value must reach the inline editor before checking rejections");
    for (const raw of ["0,25 kg", "250 ml"]) {
      await act(async () => { Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(input, raw); input.dispatchEvent(new browser.Event("input", { bubbles: true })); });
      await act(async () => add.click());
      assert.ok(container.querySelector('[role="alert"]'), `inline addition must reject ${raw}`);
      assert.equal([...container.querySelectorAll("button")].some((button) => button.getAttribute("aria-label") === `${raw} değerini kaldır`), false);
    }
  });
});
