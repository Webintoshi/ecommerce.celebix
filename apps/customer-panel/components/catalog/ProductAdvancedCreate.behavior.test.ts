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
import * as mediaCompletion from "../../lib/catalog-onboarding-ui/media-completion.ts";
import * as drafts from "../../lib/catalog-ui/product-draft-session.ts";
import * as attributes from "../../lib/catalog-onboarding-ui/attribute-variants.ts";
import * as skuPrefix from "../../lib/catalog-ui/sku-prefix.ts";
import * as dirtyNavigation from "../../lib/catalog-ui/dirty-navigation.ts";

const categoryId = "10000000-0000-4000-8000-000000000001";
const channelId = "20000000-0000-4000-8000-000000000001";
const attributeId = "30000000-0000-4000-8000-000000000001";
const options = {
  categories: [{ id: categoryId, name: "Elbiseler", position: 0 }],
  channels: [{ id: channelId, name: "Mağaza", kind: "storefront" }], resources: [], skuPrefix: "SIORA",
};
const created = { product: { id: "product-created", version: 1, status: "draft" }, variants: [], mediaCount: 0, replayed: false };
function draft() {
  const empty = drafts.createEmptyProductDraftSession();
  return drafts.updateProductDraft(empty, {
    title: "Pamuk elbise", categoryIds: [categoryId],
    variants: [{ ...empty.current.variants[0]!, title: "Standart", price: "249,90", stockQuantity: "7", sku: "SIORA-001", barcode: "8691234567890", compareAt: "299,90", cost: "150,00", shippingDesi: "2,5", hsCode: "6104", continueSellingWhenOutOfStock: true }],
  });
}

async function compile(url: URL, imports: Record<string, unknown>) {
  const source = await readFile(url, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "react") return React;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "lucide-react") return new Proxy({}, { get: () => () => createElement("svg", { "aria-hidden": true }) });
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
    if (Object.hasOwn(imports, name)) return imports[name];
    throw new Error(`unexpected_import:${name}`);
  }, compiled, compiled.exports);
  return compiled.exports;
}

type Harness = Readonly<{
  container: HTMLElement;
  browser: Window;
  latest(): drafts.ProductDraftSession;
  stage(rows: readonly drafts.ProductDraftVariant[]): Promise<void>;
  remount(session: drafts.ProductDraftSession): Promise<void>;
}>;
async function withAdvanced(supplied: Record<string, unknown>, verify: (harness: Harness) => Promise<void>, reserve = async () => "9800000000007") {
  const browser = new Window({ url: "https://panel.example.test/products/new?mode=advanced" });
  Reflect.set(browser, "confirm", () => true);
  const globals = new Map<string, PropertyDescriptor | undefined>();
  const browserUrl = browser.URL as unknown as typeof URL;
  let blobIndex = 0;
  browserUrl.createObjectURL = () => `blob:advanced-${++blobIndex}`;
  browserUrl.revokeObjectURL = () => {};
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, HTMLButtonElement: browser.HTMLButtonElement, Event: browser.Event, MouseEvent: browser.MouseEvent, KeyboardEvent: browser.KeyboardEvent, FormData: browser.FormData, File: browser.File, URL: browserUrl, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import("react-dom/client");
  const barcode = await compile(new URL("./BarcodeInput.tsx", import.meta.url), { "@/lib/barcode-labels/reserve-internal": { reserveInternalBarcode: reserve } });
  const sku = await compile(new URL("./SkuInput.tsx", import.meta.url), { "@/lib/catalog-ui/sku-prefix": skuPrefix });
  const builder = await compile(new URL("../catalog-onboarding/ProductVariantBuilder.tsx", import.meta.url), { "@/components/catalog/SkuInput": sku, "@/components/catalog/BarcodeInput": barcode, "@/lib/catalog-onboarding-ui/attribute-variants": attributes, "@/lib/catalog-onboarding-ui/forms": forms });
  const classification = await compile(new URL("../catalog-onboarding/ProductClassificationPicker.tsx", import.meta.url), {});
  let stagedRows: readonly drafts.ProductDraftVariant[] = [];
  class ApiError extends Error {}
  const advanced = await compile(new URL("../catalog-onboarding/ProductAdvancedEditor.tsx", import.meta.url), {
    "next/link": ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as React.ReactNode),
    "@/lib/catalog-onboarding-ui/client": { CatalogOnboardingApiError: ApiError, catalogOnboardingClient: {} },
    "@/lib/catalog-onboarding-ui/category-tree": categoryTree,
    "@/lib/catalog-onboarding-ui/forms": forms,
    "@/lib/catalog-onboarding-ui/media-completion": mediaCompletion,
    "@/lib/catalog-ui/product-draft-session": drafts,
    "@/lib/catalog-ui/dirty-navigation": dirtyNavigation,
    "@/lib/catalog-onboarding-ui/attribute-variants": attributes,
    "@/lib/catalog-ui/media-client": { productMediaApi: {} },
    "@/components/catalog/ProductDescriptionField": { ProductDescriptionField: ({ defaultValue, onValueChange, readOnly }: { defaultValue: string; onValueChange(value: string): void; readOnly: boolean }) => createElement("textarea", { name: "description", defaultValue, readOnly, onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onValueChange(event.currentTarget.value) }) },
    "./ProductClassificationPicker": classification,
    "./ProductVariantBuilder": builder,
    // Selection contract is isolated here; resource fetch/matrix rules have their own tests.
    "./AttributeVariantPicker": { AttributeVariantPicker: ({ onChange, onAttributeIdsChange }: { onChange(rows: readonly drafts.ProductDraftVariant[]): void; onAttributeIdsChange(ids: readonly string[]): void }) => createElement("button", { type: "button", "data-testid": "stage-variants", onClick() { onChange(stagedRows); onAttributeIdsChange([attributeId]); } }, "Seçimi değiştir") },
  });
  const Advanced = advanced.ProductAdvancedEditor as React.ComponentType<Record<string, unknown>>;
  const container = browser.document.createElement("div"); browser.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  let latest = (supplied.draftSession as drafts.ProductDraftSession | undefined) ?? draft();
  const props = { options, onCancel() {}, onCreated() {}, api: { createProduct: async () => created, publishAfterMedia: async () => created, getProductEditor: async () => created }, mediaClient: { upload: async () => ({}) }, draftSession: latest, onDraftSessionChange: (session: drafts.ProductDraftSession) => { latest = session; }, ...supplied };
  let key = 0;
  try {
    await act(async () => { root.render(createElement(Advanced, { ...props, key })); });
    await verify({ container: container as unknown as HTMLElement, browser, latest: () => latest,
      async stage(rows) { stagedRows = rows; await act(async () => { (container.querySelector('[data-testid="stage-variants"]') as unknown as HTMLButtonElement).click(); }); },
      async remount(session) { latest = session; await act(async () => { root.render(createElement(Advanced, { ...props, key: ++key, draftSession: session })); }); },
    });
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
}
async function click(container: HTMLElement, text: string) {
  const button = [...container.querySelectorAll("button")].find((button) => button.textContent?.startsWith(text));
  assert.ok(button, `button ${text} exists`);
  await act(async () => button.click());
}
async function submit(container: HTMLElement, browser: Window) {
  const form = container.querySelector("form")!;
  await act(async () => { form.dispatchEvent(new browser.SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: container.querySelector('button[value="draft"]') as never }) as unknown as Event); });
}

const standard = draft().current.variants[0]!;
const newSmall = { ...standard, title: "S", sku: "", barcode: "", compareAt: "", cost: "", shippingDesi: "", hsCode: "", continueSellingWhenOutOfStock: false, attributes: { beden: "S" } };

test("staged combinations leave the standard barcode visible until confirmation and inherit common sale fields only", async () => {
  let creates = 0;
  await withAdvanced({ api: { createProduct: async () => { creates++; return created; } } }, async ({ container, browser, latest, stage }) => {
    const barcode = container.querySelector('input[aria-label="Ürün barkodu"]') as HTMLInputElement;
    assert.equal(barcode.value, standard.barcode);
    assert.equal(barcode.closest("details"), null);
    assert.doesNotMatch(container.textContent ?? "", /Basit ürün|Varyantlı ürün/);
    await click(container, "Varyant ekle");
    await stage([newSmall]);
    assert.equal((container.querySelector('input[aria-label="Ürün barkodu"]') as HTMLInputElement).value, standard.barcode);
    assert.equal(latest().current.kind, "simple");
    await submit(container, browser);
    assert.equal(creates, 0, "unconfirmed combination never creates a product");
    await click(container, "Seçilenleri ekle");
    assert.equal(latest().current.kind, "variant");
    assert.deepEqual(latest().current.standardVariant, standard);
    const row = latest().current.variants[0]!;
    assert.deepEqual([row.sku, row.barcode], ["", ""]);
    assert.deepEqual([row.compareAt, row.cost, row.shippingDesi, row.hsCode, row.continueSellingWhenOutOfStock], [standard.compareAt, standard.cost, standard.shippingDesi, standard.hsCode, true]);
    assert.equal((container.querySelector('input[aria-label="S barkod"]') as HTMLInputElement).closest("details"), null);
    assert.equal(browser.document.activeElement?.textContent, "Varyant ekle", "focus returns to the add control after apply");
    Reflect.set(browser, "confirm", () => false);
    await click(container, "Kaldır");
    assert.equal(latest().current.kind, "variant");
    Reflect.set(browser, "confirm", () => true);
    await click(container, "Kaldır");
    assert.equal(latest().current.kind, "simple");
    assert.deepEqual(latest().current.variants, [standard]);
    assert.equal(latest().current.standardVariant, undefined);
    assert.equal((container.querySelector('input[aria-label="Ürün barkodu"]') as HTMLInputElement).value, standard.barcode);
  });
});

test("a remounted variant draft restores its standard backup and reselecting combinations preserves edited identities", async () => {
  const small = { ...newSmall, sku: "SIORA-S", barcode: "9800000000007", price: "275,00", stockQuantity: "3", cost: "175,00" };
  const session = drafts.updateProductDraft(draft(), { kind: "variant", variants: [small], standardVariant: standard });
  await withAdvanced({ draftSession: session }, async ({ container, latest, stage, remount }) => {
    await click(container, "Varyant ekle");
    await stage([]);
    await stage([{ ...newSmall, price: "100,00" }]);
    await click(container, "Seçilenleri ekle");
    assert.deepEqual(latest().current.variants[0], small, "reselected existing identity keeps every entered field");
    await remount(latest());
    await click(container, "Kaldır");
    assert.deepEqual(latest().current.variants, [standard]);
  });
});

test("pending real barcode reservation blocks save and the generated barcode is included in the create request", async () => {
  let resolve!: (barcode: string) => void;
  const intents: unknown[] = [];
  const session = drafts.updateProductDraft(draft(), { variants: [{ ...standard, barcode: "" }] });
  await withAdvanced({ draftSession: session, api: { createProduct: async (intent: unknown) => { intents.push(intent); return created; }, publishAfterMedia: async () => created, getProductEditor: async () => created } }, async ({ container, browser }) => {
    await act(async () => { (container.querySelector('button[aria-label="Dahili barkod oluştur"]') as HTMLButtonElement).click(); });
    assert.equal((container.querySelector('button[value="draft"]') as HTMLButtonElement).disabled, true);
    await submit(container, browser);
    assert.equal(intents.length, 0);
    await act(async () => { resolve("9800000000007"); });
    assert.equal((container.querySelector('button[value="draft"]') as HTMLButtonElement).disabled, false);
    await submit(container, browser);
    assert.equal(intents.length, 1);
    assert.equal((intents[0] as { variants: { barcode: string }[] }).variants[0]!.barcode, "9800000000007");
  }, () => new Promise<string>((done) => { resolve = done; }));
});

test("a delayed barcode reservation survives price and stock edits on the same create variant", async () => {
  let resolve!: (barcode: string) => void;
  const session = drafts.updateProductDraft(draft(), { kind: "variant", variants: [newSmall], standardVariant: standard });
  await withAdvanced({ draftSession: session }, async ({ container, browser, latest }) => {
    await act(async () => { (container.querySelector('button[aria-label="Dahili barkod oluştur"]') as HTMLButtonElement).click(); });
    for (const [label, value] of [["S satış fiyatı", "275,00"], ["S stok", "3"]]) {
      const input = container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
      await act(async () => {
        Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(input, value);
        input.dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event);
      });
    }
    assert.deepEqual([latest().current.variants[0]!.price, latest().current.variants[0]!.stockQuantity], ["275,00", "3"]);
    await act(async () => { resolve("9800000000007"); });
    assert.equal((container.querySelector('input[aria-label="S barkod"]') as HTMLInputElement).value, "9800000000007");
    assert.deepEqual([latest().current.variants[0]!.price, latest().current.variants[0]!.stockQuantity, latest().current.variants[0]!.barcode], ["275,00", "3", "9800000000007"]);
    assert.equal((container.querySelector('button[value="draft"]') as HTMLButtonElement).disabled, false);
  }, () => new Promise<string>((done) => { resolve = done; }));
});
