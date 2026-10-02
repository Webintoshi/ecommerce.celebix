import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import * as pricingModel from "../../lib/reference-pricing-ui/model.ts";
import * as pricingDecimal from "../../lib/reference-pricing-ui/decimal.ts";
import { ReferencePricingApiError, referencePricingErrorState } from "../../lib/reference-pricing-ui/client.ts";

const GOLD = "30000000-0000-4000-8000-000000000002";
const OTHER_GOLD = "30000000-0000-4000-8000-000000000003";
const USD = "30000000-0000-4000-8000-000000000004";
const VARIANT = "40000000-0000-4000-8000-000000000001";
const SET = "20000000-0000-4000-8000-000000000001";
const UTC = "2026-09-20T12:00:00.000000Z";
const definitions = [
  { id: GOLD, kind: "gold_gram", label: "Gram satış", createdAt: UTC },
  { id: USD, kind: "usd", label: "USD satış", createdAt: UTC },
];

async function compile(file: string, api: Record<string, unknown>) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module: { exports: Record<string, unknown> } = { exports: {} };
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "lucide-react") return new Proxy({}, { get: () => () => createElement("svg", { "aria-hidden": true }) });
    if (name === "next/link") return ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as React.ReactNode);
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
    if (name === "@/lib/reference-pricing-ui/model") return pricingModel;
    if (name === "@/lib/reference-pricing-ui/decimal") return pricingDecimal;
    if (name === "@/lib/reference-pricing-ui/client") return { ReferencePricingApiError, referencePricingErrorState, referencePricingApi: api };
    if (name === "@/components/panel/PanelPageShell") return { PanelPageShell: ({ children }: { children: React.ReactNode }) => createElement("main", null, children), PanelPageHeader: () => null, PanelStatusBadge: ({ children }: { children: React.ReactNode }) => createElement("span", null, children) };
    throw new Error(`unexpected_import:${name}`);
  }, module, module.exports);
  return module.exports;
}

async function mount(file: string, exported: string, api: Record<string, unknown>, props: Record<string, unknown>) {
  const browser = new Window({ url: "https://panel.example.test/settings/pricing" });
  const confirmations: string[] = [];
  Reflect.set(browser, "confirm", (message: string) => { confirmations.push(message); return true; });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, HTMLButtonElement: browser.HTMLButtonElement, Event: browser.Event, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const compiled = await compile(file, api);
  const Component = compiled[exported] as React.ComponentType<Record<string, unknown>>;
  const { createRoot } = await import("react-dom/client");
  const container = browser.document.createElement("div"); browser.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  await act(async () => root.render(createElement(Component, props)));
  return {
    browser, container, confirmations,
    button: (text: string) => [...container.querySelectorAll("button")].find((button) => button.textContent === text)!,
    input: (text: string) => { const field = [...container.querySelectorAll("label")].find((label) => label.textContent?.includes(text))?.querySelector("input"); assert.ok(field, `Missing input: ${text}`); return field; },
    select: (text: string) => { const field = [...container.querySelectorAll("label")].find((label) => label.textContent?.includes(text))?.querySelector("select"); assert.ok(field, `Missing select: ${text}`); return field; },
    async cleanup() {
      await act(async () => root.unmount()); await browser.happyDOM.cancelAsync();
      for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    },
  };
}

function settingsApi(selected = definitions) {
  const previewRequests: Record<string, unknown>[] = [], activationRequests: Record<string, unknown>[] = [];
  const active = { setId: SET, version: 1, stateVersion: 1, isActive: true, createdAt: UTC, values: selected.map((definition) => ({ referenceId: definition.id, kind: definition.kind, label: definition.label, rateTry: definition.kind === "gold_gram" ? "5000" : "40", active: true })) };
  let unavailableVariants = 0;
  const preview = (request: Record<string, unknown>) => ({ setId: request.setId, scopeDigest: "a".repeat(64), affectedProducts: 3, affectedVariants: 4, fixedOverrideVariants: 0, unavailableVariants, entries: [], nextCursor: null });
  const api: Record<string, unknown> = {
    listDefinitions: async () => ({ items: selected }),
    listSets: async () => ({ activeSetId: SET, stateVersion: 1, items: [], nextCursor: null }),
    getSet: async () => active,
    saveSet: async (intent: Record<string, unknown>) => ({ ...active, setId: intent.setId, isActive: false }),
    preview: async (intent: Record<string, unknown>) => { previewRequests.push(intent); return preview(intent); },
    activate: async (intent: Record<string, unknown>) => { activationRequests.push(intent); return { setId: intent.setId, version: 2, stateVersion: 2, activatedAt: UTC }; },
  };
  return { api, previewRequests, activationRequests, preview, unavailable(value: number) { unavailableVariants = value; } };
}

test("catalog gram binding is explicit and the selected tariff reaches preview and activation", async () => {
  const fixture = settingsApi();
  const view = await mount("./ReferencePricingConsole.tsx", "ReferencePricingConsole", fixture.api, { canRead: true, canManage: true });
  try {
    const choice = view.input("Gramı olan ürünleri bu tarifeye bağla");
    assert.equal(choice.checked, false);
    await act(async () => choice.click());
    await act(async () => view.button("Taslağı kaydet").click());
    await act(async () => view.button("Fiyat önizlemesi").click());
    await act(async () => view.button("Sunucuda önizle").click());
    assert.equal(fixture.previewRequests[0]?.catalogGramReferenceId, GOLD);
    assert.equal(view.button("Onayla ve uygula").disabled, false);
    await act(async () => view.button("Onayla ve uygula").click());
    assert.equal(fixture.activationRequests[0]?.catalogGramReferenceId, GOLD);
    assert.match(view.confirmations[0]!, /3 ürün ve 4 varyant/);
  } finally { await view.cleanup(); }
});

test("multiple gram tariffs require a choice and unavailable native gram prices cannot be applied", async () => {
  const fixture = settingsApi([...definitions, { id: OTHER_GOLD, kind: "gold_gram", label: "Diğer gram satış", createdAt: UTC }]);
  fixture.unavailable(1);
  const view = await mount("./ReferencePricingConsole.tsx", "ReferencePricingConsole", fixture.api, { canRead: true, canManage: true });
  try {
    await act(async () => view.input("Gramı olan ürünleri bu tarifeye bağla").click());
    const tariff = view.select("Gram tarifesi");
    assert.equal(tariff.value, "");
    await act(async () => view.button("Taslağı kaydet").click());
    await act(async () => view.button("Fiyat önizlemesi").click());
    assert.equal(view.button("Sunucuda önizle").disabled, true);
    await act(async () => { tariff.value = OTHER_GOLD; tariff.dispatchEvent(new view.browser.Event("change", { bubbles: true })); });
    await act(async () => view.button("Sunucuda önizle").click());
    assert.equal(fixture.previewRequests[0]?.catalogGramReferenceId, OTHER_GOLD);
    assert.equal(view.button("Onayla ve uygula").disabled, true);
    assert.match(view.container.textContent!, /hesaplanamıyor/);
    assert.equal(fixture.activationRequests.length, 0);
    await act(async () => { tariff.value = GOLD; tariff.dispatchEvent(new view.browser.Event("change", { bubbles: true })); });
    assert.equal(view.button("Onayla ve uygula"), undefined);
    fixture.unavailable(0);
    await act(async () => view.button("Sunucuda önizle").click());
    assert.equal(fixture.previewRequests[1]?.catalogGramReferenceId, GOLD);
    assert.equal(view.button("Onayla ve uygula").disabled, false);
    await act(async () => { const rate = view.input("Mağaza satış referansı (TL)"); Object.getOwnPropertyDescriptor(view.browser.HTMLInputElement.prototype, "value")!.set!.call(rate, "6600"); rate.dispatchEvent(new view.browser.Event("input", { bubbles: true })); });
    assert.equal(view.button("Onayla ve uygula"), undefined);
    assert.equal(view.button("Sunucuda önizle").disabled, true);
  } finally { await view.cleanup(); }
});

test("changing gram binding rejects an in-flight preview and ordinary preview omits the binding", async () => {
  const fixture = settingsApi();
  let resolvePreview!: (value: unknown) => void;
  fixture.api.preview = async (intent: Record<string, unknown>) => { fixture.previewRequests.push(intent); return new Promise((resolve) => { resolvePreview = resolve; }); };
  const view = await mount("./ReferencePricingConsole.tsx", "ReferencePricingConsole", fixture.api, { canRead: true, canManage: true });
  try {
    await act(async () => view.input("Gramı olan ürünleri bu tarifeye bağla").click());
    await act(async () => view.button("Taslağı kaydet").click());
    await act(async () => view.button("Fiyat önizlemesi").click());
    await act(async () => view.button("Sunucuda önizle").click());
    await act(async () => view.input("Gramı olan ürünleri bu tarifeye bağla").click());
    await act(async () => resolvePreview(fixture.preview(fixture.previewRequests[0]!)));
    assert.equal(view.button("Onayla ve uygula"), undefined);
    await act(async () => view.button("Sunucuda önizle").click());
    assert.equal(Object.hasOwn(fixture.previewRequests[1]!, "catalogGramReferenceId"), false);
    await act(async () => resolvePreview(fixture.preview(fixture.previewRequests[1]!)));
    assert.equal(view.button("Onayla ve uygula").disabled, false);
    await act(async () => { const channel = view.select("Kanal"); channel.value = "quick_order"; channel.dispatchEvent(new view.browser.Event("change", { bubbles: true })); });
    assert.equal(view.button("Onayla ve uygula"), undefined);
  } finally { await view.cleanup(); }
});

test("gold policy prefill uses native grams and preserves merchant text across method switches", async () => {
  const api = { getPolicy: async () => { throw new ReferencePricingApiError("not_found", 404); }, listDefinitions: async () => ({ items: definitions }) };
  const view = await mount("./VariantPricingPolicyControl.tsx", "VariantPricingPolicyControl", api, { variantId: VARIANT, variantVersion: 1, fixedPriceCents: 10000, canManage: true, measurements: { weight: { valueMilli: 14890, unit: "g" } }, onSaved() {}, onClose() {} });
  try {
    const method = view.select("Yöntem");
    await act(async () => { method.value = "gold_gram"; method.dispatchEvent(new view.browser.Event("change", { bubbles: true })); });
    assert.equal(view.input("Fiyatlandırma gramı").value, "14,89");
    await act(async () => { const grams = view.input("Fiyatlandırma gramı"); Object.getOwnPropertyDescriptor(view.browser.HTMLInputElement.prototype, "value")!.set!.call(grams, "12,25"); grams.dispatchEvent(new view.browser.Event("input", { bubbles: true })); });
    await act(async () => { method.value = "fixed_try"; method.dispatchEvent(new view.browser.Event("change", { bubbles: true })); });
    await act(async () => { method.value = "gold_gram"; method.dispatchEvent(new view.browser.Event("change", { bubbles: true })); });
    assert.equal(view.input("Fiyatlandırma gramı").value, "12,25");
  } finally { await view.cleanup(); }
});

test("stored pricing grams remain authoritative over native catalog weight", async () => {
  const policy = { method: "gold_gram", referenceId: GOLD, metalGrams: "7.125", purityMode: "direct", laborMode: "none", upliftPercent: "0", allowFullDiscount: false };
  const api = { getPolicy: async () => ({ variantId: VARIANT, variantVersion: 1, version: 1, policy, updatedAt: UTC }), listDefinitions: async () => ({ items: definitions }) };
  const view = await mount("./VariantPricingPolicyControl.tsx", "VariantPricingPolicyControl", api, { variantId: VARIANT, variantVersion: 1, fixedPriceCents: 10000, canManage: true, measurements: { weight: { valueMilli: 1250, unit: "kg" } }, onSaved() {}, onClose() {} });
  try { assert.equal(view.input("Fiyatlandırma gramı").value, "7,125"); }
  finally { await view.cleanup(); }
});
