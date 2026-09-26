import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import * as measurementForms from "../../lib/catalog-ui/product-measurements.ts";
import * as forms from "../../lib/catalog-ui/forms.ts";
import * as onboardingForms from "../../lib/catalog-onboarding-ui/forms.ts";
import * as money from "../../lib/catalog-ui/money.ts";
import * as dirtyNavigation from "../../lib/catalog-ui/dirty-navigation.ts";
import * as attributeVariants from "../../lib/catalog-onboarding-ui/attribute-variants.ts";

async function compile(file: string, imports: Record<string, unknown>) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module: { exports: Record<string, unknown> } = { exports: {} };
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "lucide-react") return new Proxy({}, { get: () => () => createElement("svg", { "aria-hidden": true }) });
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
    if (Object.hasOwn(imports, name)) return imports[name];
    throw new Error(`unexpected_import:${name}`);
  }, module, module.exports);
  return module.exports;
}

test("detail batch submission reveals invalid optional measurements and blank fields allow the atomic request", async () => {
  const browser = new Window({ url: "https://panel.example.test/products/product-test" });
  Reflect.set(browser, "confirm", () => true);
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, HTMLButtonElement: browser.HTMLButtonElement, Event: browser.Event, FormData: browser.FormData, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const fields = await compile("./ProductMeasurementFields.tsx", { "@/lib/catalog-ui/product-measurements": measurementForms });
  const identifier = (props: { value?: string; defaultValue?: string; onChange?(value: string): void }) => createElement("input", { value: props.value, defaultValue: props.defaultValue, onChange: (event: React.ChangeEvent<HTMLInputElement>) => props.onChange?.(event.currentTarget.value) });
  const builder = await compile("../catalog-onboarding/ProductVariantBuilder.tsx", {
    "@/components/catalog/ProductMeasurementFields": fields,
    "@/lib/catalog-onboarding-ui/forms": onboardingForms,
    "@/lib/catalog-onboarding-ui/attribute-variants": attributeVariants,
    "@/components/catalog/SkuInput": { SkuInput: identifier },
    "@/components/catalog/BarcodeInput": { BarcodeInput: identifier },
  });
  const product = { id: "product-test", title: "Bilezik", slug: "bilezik", status: "active", currency: "TRY", version: 1, updatedAt: "2026-09-26T00:00:00Z" };
  const row = { title: "Beyaz", sku: "", barcode: "", price: "100,00", compareAt: "", cost: "", stockQuantity: "7", continueSellingWhenOutOfStock: false, shippingDesi: "", hsCode: "", attributes: { Renk: "Beyaz" }, measurements: { weight: "14,8912" } };
  const requests: unknown[] = [];
  class ApiError extends Error {}
  const detail = await compile("./ProductDetailConsole.tsx", {
    "next/link": ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as React.ReactNode),
    "@/lib/catalog-ui/client": { CatalogApiError: ApiError, catalogApi: { getProduct: async () => ({ product, variants: [] }), createVariantBatch: async (_id: string, payload: unknown) => { requests.push(payload); return {}; } } },
    "@/lib/catalog-ui/forms": forms,
    "@/lib/catalog-ui/money": money,
    "@/lib/catalog-ui/dirty-navigation": dirtyNavigation,
    "@/lib/catalog-ui/product-measurements": measurementForms,
    "./ProductMeasurementFields": fields,
    "@/components/catalog-onboarding/ProductVariantBuilder": builder,
    "@/components/catalog/SkuInput": { SkuInput: identifier },
    "@/components/catalog/BarcodeInput": { BarcodeInput: identifier },
    "@/components/catalog-onboarding/ProductAdvancedEditor": { ProductAdvancedEditor: () => null },
    "@/components/catalog-onboarding/AttributeVariantPicker": { AttributeVariantPicker: ({ onChange }: { onChange(rows: unknown[]): void }) => createElement("button", { type: "button", onClick: () => onChange([row]) }, "Test kombinasyonu") },
    "@/lib/catalog-onboarding-ui/client": { CatalogOnboardingApiError: ApiError, catalogOnboardingClient: { getOptions: async () => ({ categories: [], channels: [], resources: [] }), getProductEditor: async () => ({ product, variants: [], profile: { productType: "physical", minimumPurchaseQuantity: 1, version: 1 }, channelIds: [], categoryIds: [], resourceIds: { collections: [], tags: [] } }) } },
    "./ProductDescriptionField": { ProductDescriptionField: () => createElement("textarea", { name: "description" }), ProductDescriptionPreview: () => null },
    "./ProductMediaManager": { ProductMediaManager: () => null, restoreArchiveFocus() {} },
    "@/components/reference-pricing/VariantPricingPolicyControl": { VariantPricingPolicyControl: () => null },
    "@/components/shared/PermanentDeleteDialog": { PermanentDeleteDialog: () => null },
    "@/components/panel/PanelTopbarChrome": { usePanelTopbarChrome() {} },
  });
  const Component = detail.ProductDetailConsole as React.ComponentType<Record<string, unknown>>;
  const { createRoot } = await import("react-dom/client");
  const container = browser.document.createElement("div"); browser.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  const button = (text: string) => [...container.querySelectorAll("button")].find((button) => button.textContent === text)!;
  const submit = async () => { const target = button("1 varyantı oluştur"); await act(async () => { target.closest("form")!.dispatchEvent(new browser.SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: target })); }); };
  try {
    await act(async () => root.render(createElement(Component, { productId: product.id, canManage: true })));
    await act(async () => button("Niteliklerden ekle").click());
    await act(async () => button("Test kombinasyonu").click());
    const weight = container.querySelector('input[name="measurement-weight"]')!;
    assert.equal(weight.closest("details")?.hasAttribute("open"), false);
    await submit();
    assert.equal(requests.length, 0);
    assert.equal(weight.getAttribute("aria-invalid"), "true");
    assert.equal(weight.closest("details")?.hasAttribute("open"), true);
    assert.match(weight.closest("details")?.textContent ?? "", /üç ondalık/);
    await act(async () => {
      Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(weight, "");
      weight.dispatchEvent(new browser.Event("input", { bubbles: true }));
    });
    await submit();
    assert.equal(requests.length, 1, container.querySelector('[role="alert"]')?.textContent);
    const payload = requests[0] as { variants: Record<string, unknown>[] };
    assert.equal(Object.hasOwn(payload.variants[0]!, "measurements"), false);
    assert.equal(payload.variants[0]!.stockQuantity, 7);
    assert.equal(payload.variants[0]!.priceCents, 10000);
    await act(async () => button("Niteliklerden ekle").click());
    await act(async () => button("Test kombinasyonu").click());
    const reopened = container.querySelector('input[name="measurement-weight"]')!;
    assert.equal(reopened.getAttribute("aria-invalid"), null, "opening a fresh batch resets submitted validation");
    assert.equal(reopened.closest("details")?.hasAttribute("open"), false);
    for (const [key, value] of Object.entries({ weight: "14.89", volume: "250,125", length: "3", width: "2,1", depth: "4.2", height: "0,001", area: "5.55", packageCount: "4" })) {
      const field = container.querySelector(`input[name="measurement-${key}"]`)!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(field, value);
        field.dispatchEvent(new browser.Event("input", { bubbles: true }));
      });
    }
    await submit();
    assert.equal(requests.length, 2);
    const filled = requests[1] as { variants: Record<string, unknown>[] };
    assert.deepEqual(filled.variants[0]!.measurements, {
      weight: { valueMilli: 14890, unit: "g" }, volume: { valueMilli: 250125, unit: "ml" },
      length: { valueMilli: 3000, unit: "cm" }, width: { valueMilli: 2100, unit: "cm" }, depth: { valueMilli: 4200, unit: "cm" },
      height: { valueMilli: 1, unit: "cm" }, area: { valueMilli: 5550, unit: "m2" }, packageCount: 4,
    });
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
});
