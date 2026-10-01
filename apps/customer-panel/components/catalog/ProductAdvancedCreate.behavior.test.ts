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
import * as variantMediaCompletion from "../../lib/catalog-onboarding-ui/variant-media-completion.ts";
import * as mediaCompletion from "../../lib/catalog-onboarding-ui/media-completion.ts";
import * as drafts from "../../lib/catalog-ui/product-draft-session.ts";
import * as attributes from "../../lib/catalog-onboarding-ui/attribute-variants.ts";
import * as skuPrefix from "../../lib/catalog-ui/sku-prefix.ts";
import * as dirtyNavigation from "../../lib/catalog-ui/dirty-navigation.ts";

class HarnessApiError extends Error { constructor(public code: string) { super(code); } }

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
async function withAdvanced(supplied: Record<string, unknown>, verify: (harness: Harness) => Promise<void>, reserve = async () => "9800000000007", authoringPanel: React.ComponentType<any> = () => null) {
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
  const measurements = await compile(new URL("./ProductMeasurementFields.tsx", import.meta.url), { "@/lib/catalog-ui/product-measurements": measurementForms });
  const builder = await compile(new URL("../catalog-onboarding/ProductVariantBuilder.tsx", import.meta.url), { "@/components/catalog/SkuInput": sku, "@/components/catalog/BarcodeInput": barcode, "@/lib/catalog-onboarding-ui/attribute-variants": attributes, "@/lib/catalog-onboarding-ui/forms": forms, "@/components/catalog/ProductMeasurementFields": measurements });
  const classification = await compile(new URL("../catalog-onboarding/ProductClassificationPicker.tsx", import.meta.url), {});
  let stagedRows: readonly drafts.ProductDraftVariant[] = [];
  const ApiError = HarnessApiError;
  const textAuthoring = await compile(new URL("../content-authoring/ContentAuthoringTextField.tsx", import.meta.url), {"@/lib/content-authoring-ui/state": await import("../../lib/content-authoring-ui/state.ts")});
  const galleryDialog = await compile(new URL("./VariantGalleryDialog.tsx", import.meta.url), {});
  const galleryEditor = await compile(new URL("./ProductVariantGalleryEditor.tsx", import.meta.url), {"./VariantGalleryDialog":galleryDialog,"@/lib/catalog-ui/variant-media-client":{productVariantMediaApi:{},ProductVariantMediaApiError:HarnessApiError}});
  const advanced = await compile(new URL("../catalog-onboarding/ProductAdvancedEditor.tsx", import.meta.url), {
    "@/components/content-authoring/ContentAuthoringTextField": textAuthoring,
    "@/components/content-authoring/ContentAuthoringPanel": {ContentAuthoringPanel:authoringPanel},
    "next/link": ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as React.ReactNode),
    "@/lib/catalog-onboarding-ui/client": { CatalogOnboardingApiError: ApiError, catalogOnboardingClient: {} },
    "@/lib/catalog-onboarding-ui/category-tree": categoryTree,
    "@/lib/catalog-onboarding-ui/forms": forms,
    "@/lib/catalog-ui/product-measurements": measurementForms,
    "@/lib/catalog-onboarding-ui/media-completion": mediaCompletion,
    "@/lib/catalog-onboarding-ui/variant-media-completion":variantMediaCompletion,
    "@/components/catalog/ProductVariantGalleryEditor":galleryEditor,
    "@/lib/catalog-ui/variant-media-client":{productVariantMediaApi:{},ProductVariantMediaApiError:HarnessApiError},
    "@/lib/catalog-ui/product-draft-session": drafts,
    "@/lib/catalog-ui/dirty-navigation": dirtyNavigation,
    "@/lib/catalog-onboarding-ui/attribute-variants": attributes,
    "@/lib/catalog-admin-ui/client": { catalogAdminApi: { resources: async () => [{ id: attributeId, kind: "attribute", name: "Beden", slug: "beden", status: "active", config: { values: ["S", "M", "L"] } }] } },
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

test("advanced optional measurements restore after remount and save without changing stock or pricing", async () => {
  const measurements = { weight: "14,89", weightUnit: "g", width: "2.125", area: "0,5", packageCount: "3" };
  const intents: unknown[] = [];
  const original = drafts.updateProductDraft(draft(), { variants: [{ ...standard, measurements }] });
  await withAdvanced({ draftSession: original, api: { createProduct: async (intent: unknown) => { intents.push(intent); return created; } } }, async ({ container, browser, latest, remount }) => {
    const weight = () => container.querySelector('input[name="measurement-weight"]') as HTMLInputElement;
    assert.equal(weight().value, "14,89");
    assert.ok([...container.querySelectorAll<HTMLInputElement>('input[name^="measurement-"]')].every((field) => !field.required));
    await act(async () => {
      Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(weight(), "14.99");
      weight().dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event);
    });
    assert.equal(latest().current.variants[0]?.measurements?.weight, "14.99");
    await remount(latest());
    assert.equal(weight().value, "14.99");
    await submit(container, browser);
    assert.equal(intents.length, 1);
    const variant = (intents[0] as { variants: Record<string, unknown>[] }).variants[0]!;
    assert.deepEqual(variant.measurements, { weight: { valueMilli: 14990, unit: "g" }, width: { valueMilli: 2125, unit: "cm" }, area: { valueMilli: 500, unit: "m2" }, packageCount: 3 });
    assert.equal(variant.priceCents, 24990);
    assert.equal(variant.stockQuantity, 7);
  });
});

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

const authoringGeneration = {
  id: "40000000-0000-4000-8000-000000000001", draftId: "40000000-0000-4000-8000-000000000002",
  draft: { seoTitle: "Generated SEO", seoDescription: "Generated summary" },
};
function ApplyingPanel({bridge}: {bridge: {capture(): unknown; canApply(field: string, generation: unknown, selection: null): boolean; apply(field: string, generation: unknown, selection: null): boolean}}) {
  return createElement("button", {type:"button", onClick: () => {
    assert.equal(bridge.canApply("description",authoringGeneration,null),false);
    assert.equal(bridge.canApply("seoTitle",{draft:{}},null),false);
    assert.equal(bridge.canApply("seoTitle",authoringGeneration,null),true);
    assert.equal(bridge.canApply("seoDescription",authoringGeneration,null),true);
    assert.equal(bridge.apply("seoTitle", authoringGeneration, null), true);
    assert.equal(bridge.apply("seoDescription", authoringGeneration, null), true);
  }}, "Apply SEO fixture");
}
const existingEditor = {
  product: { id: "50000000-0000-4000-8000-000000000001", title: "Saved product", description: "Saved description", version: 7 },
  profile: { productType: "physical", minimumPurchaseQuantity: 1, version: 9, seoTitle: "Manual SEO", seoDescription: "Manual summary" },
  variants: [], categoryIds: [categoryId], channelIds: [channelId], resourceIds: { collections: [], tags: [], attributes: [], extras: [], definitions: [] },
  contentOrigins: {description: {generationId:"60000000-0000-4000-8000-000000000001",draftId:"60000000-0000-4000-8000-000000000002"}},
};
for (const layout of ["create", "default", "rail"] as const) test(`AI SEO applies both real fields with undo/redo and saves their origins in ${layout} editor`, async () => {
  const requests: any[] = [];
  const dirty: boolean[] = [];
  const initial = drafts.updateProductDraft(draft(), {seoTitle:"Manual SEO",seoDescription:"Manual summary"});
  const supplied = layout === "create" ? {draftSession: initial} : {draftSession:undefined,editor:existingEditor,presentation:layout};
  await withAdvanced({...supplied,onDirtyChange:(value:boolean)=>dirty.push(value),api:{
    createProduct: async (payload:unknown)=>{requests.push(payload);return created;},
    updateMerchandising: async (_id:string,payload:unknown)=>{requests.push(payload);return created;},
  }}, async ({container,browser,latest,remount}) => {
    assert.deepEqual(dirty, [], "mount must not mark fields dirty");
    await click(container,"AI ile SEO oluştur");
    await click(container,"Apply SEO fixture");
    assert.equal(requests.length,0,"applying is not saving");
    const title = container.querySelector<HTMLInputElement>('[name="seoTitle"]')!;
    assert.equal(title.value,"Generated SEO");
    assert.equal(container.querySelector<HTMLTextAreaElement>('[name="seoDescription"]')!.value,"Generated summary");
    await act(async()=>title.dispatchEvent(new browser.KeyboardEvent("keydown",{key:"z",ctrlKey:true,bubbles:true,cancelable:true}) as unknown as Event));
    assert.equal(title.value,"Manual SEO");
    if(layout==="create") assert.equal(latest().current.contentOrigins?.seoTitle,null);
    await act(async()=>title.dispatchEvent(new browser.KeyboardEvent("keydown",{key:"z",ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}) as unknown as Event));
    assert.equal(title.value,"Generated SEO");
    if(layout==="create") { const saved=latest(); await remount(saved); assert.equal(container.querySelector<HTMLInputElement>('[name="seoTitle"]')!.value,"Generated SEO"); }
    await submit(container,browser);
    assert.equal(requests.length,1);
    assert.deepEqual(requests[0].contentOrigins.seoTitle,{generationId:authoringGeneration.id,draftId:authoringGeneration.draftId});
    assert.deepEqual(requests[0].contentOrigins.seoDescription,requests[0].contentOrigins.seoTitle);
    assert.equal(requests[0].profile.seoTitle,"Generated SEO");
    if(layout!=="create") {assert.equal(requests[0].expectedProfileVersion,9);assert.equal(Object.hasOwn(requests[0].contentOrigins,"description"),false);assert.equal(dirty.at(-1),false);}
  }, undefined, ApplyingPanel);
});


test("SEO generation captures the current unsaved general product draft and rejects its later revision", async()=>{
  let title="Unsaved product",description="Unsaved description",revision="first";
  let bridge:any;
  const snapshots=await import("../../lib/content-authoring-ui/state.ts");
  await withAdvanced({draftSession:undefined,editor:existingEditor,presentation:"rail",captureProductAuthoringDraft:()=>({currentDraft:{title,description,variants:[]},productVersion:8,draftRevision:revision})},async({container})=>{
    await click(container,"AI ile SEO oluştur");
    const current=bridge.capture();
    assert.equal(current.request.currentDraft.title,title);
    assert.equal(current.request.currentDraft.description,description);
    assert.equal(current.request.productVersion,8);
    const captured=snapshots.captureAuthoringSnapshot(current.request,{...current.lifecycle,storeKey:"shop"});
    const result={...authoringGeneration,productId:current.request.productId,status:"completed",sourceFingerprint:"a".repeat(64),draft:{...authoringGeneration.draft,sourceFingerprint:"a".repeat(64)}};
    result.draftId=current.request.draftId;
    assert.equal(snapshots.canApplyAuthoringDraft(captured,captured,result as any),true);
    description="Later manual description";revision="second";
    const next=bridge.capture();
    assert.equal(next.request.currentDraft.description,description);
    assert.equal(snapshots.canApplyAuthoringDraft(captured,snapshots.captureAuthoringSnapshot(next.request,{...next.lifecycle,storeKey:"shop"}),result as any),false);
  },undefined,(props:any)=>{bridge=props.bridge;return null;});
});

for(const code of ["version_conflict","unavailable"] as const) test(`SEO ${code} keeps applied text, origin and dirty state until an acknowledged save`,async()=>{
 let failed=true,updates=0;const requests:any[]=[],dirty:boolean[]=[];
 await withAdvanced({draftSession:undefined,editor:existingEditor,presentation:"rail",onDirtyChange:(value:boolean)=>dirty.push(value),onUpdated:()=>updates++,api:{updateMerchandising:async(_id:string,payload:unknown)=>{requests.push(payload);if(failed)throw new HarnessApiError(code);return created;}}},async({container,browser})=>{
  await click(container,"AI ile SEO oluştur");await click(container,"Apply SEO fixture");await submit(container,browser);
  assert.equal(updates,0);assert.equal(dirty.at(-1),true);assert.equal(container.querySelector<HTMLInputElement>('[name="seoTitle"]')!.value,"Generated SEO");
  assert.equal(requests[0].expectedProfileVersion,9);assert.deepEqual(requests[0].contentOrigins,{seoTitle:{generationId:authoringGeneration.id,draftId:authoringGeneration.draftId},seoDescription:{generationId:authoringGeneration.id,draftId:authoringGeneration.draftId}});
  assert.match(container.textContent??"",code==="version_conflict"?/Yerel alanlarınız korunuyor/:/unavailable/);
  failed=false;await submit(container,browser);assert.equal(updates,1);assert.equal(dirty.at(-1),false);assert.deepEqual(requests[1],requests[0]);
 },undefined,ApplyingPanel);
});


test("advanced AI capture maps saved variant slug keys to verified selected resource UUIDs and refuses unknown metadata",async()=>{
 const contract=await import("@celebix/saas-contracts");let bridge:any;
 const matrixDraft=drafts.updateProductDraft(draft(),{kind:"variant",variants:[newSmall],resourceAttributeIds:[attributeId]});
 await withAdvanced({draftSession:matrixDraft},async({container,remount})=>{
  await click(container,"AI ile SEO oluştur");
  const captured=bridge.capture();
  assert.deepEqual(captured.request.currentDraft.variants[0].attributes,[{attributeId,value:"S"}]);
  const parsed=contract.parseContentAuthoringRequest(captured.request);assert.equal(parsed.currentDraft.variants?.[0]?.attributes?.[0]?.attributeId,attributeId);
  const invalid=drafts.updateProductDraft(matrixDraft,{variants:[{...newSmall,attributes:{missing:"S"}}]});
  await remount(invalid);await click(container,"AI ile SEO oluştur");
  assert.throws(()=>bridge.capture(),/attribute_metadata_unavailable/,"unknown slugs must never become client-invented references");
 },undefined,(props:any)=>{bridge=props.bridge;return null;});
});


test("existing rail exposes its real SEO controllers to a shared description bundle without opening a second panel",async()=>{
 let bridge:any;const dirty:boolean[]=[],requests:any[]=[];
 await withAdvanced({draftSession:undefined,editor:existingEditor,presentation:"rail",onAuthoringBridgeChange:(value:any)=>{bridge=value;},onDirtyChange:(value:boolean)=>dirty.push(value),api:{updateMerchandising:async(_id:string,payload:unknown)=>{requests.push(payload);return created;}}},async({container,browser})=>{
  assert.ok(bridge);assert.equal(dirty.at(-1)??false,false);
  const before=bridge.capture();assert.equal(before.request.currentDraft.seoTitle,"Manual SEO");
  await act(async()=>assert.equal(bridge.apply("seoDescription",authoringGeneration,null),true));
  assert.equal(container.querySelector<HTMLInputElement>('[name="seoTitle"]')!.value,"Manual SEO");assert.equal(container.querySelector<HTMLTextAreaElement>('[name="seoDescription"]')!.value,"Generated summary");assert.equal(dirty.at(-1),true);assert.equal(requests.length,0);
  assert.notEqual(bridge.capture().lifecycle.draftRevision,before.lifecycle.draftRevision);
  await submit(container,browser);assert.equal(requests[0].expectedProfileVersion,9);assert.deepEqual(requests[0].contentOrigins,{seoDescription:{generationId:authoringGeneration.id,draftId:authoringGeneration.draftId}});
 });
 assert.equal(bridge,null,"unmounted rail must remove its controller bridge");
});


test("existing SEO rail request controls do not dirty saved fields and ordinary SEO typing still does",async()=>{
 const compiled=await compile(new URL("../content-authoring/ContentAuthoringPanel.tsx",import.meta.url),{
  "@/components/panel/PanelLayoutClient":{usePanelChromeModel:()=>({activeStoreSelectionKey:"fixture-store"})},
  "@/lib/content-authoring-ui/store-writing-preferences":await import("../../lib/content-authoring-ui/store-writing-preferences.ts"),
  "@/lib/content-authoring-ui/client":await import("../../lib/content-authoring-ui/client.ts"),
  "@/lib/content-authoring-ui/state":await import("../../lib/content-authoring-ui/state.ts"),
  "@/lib/server-content-authoring/render":await import("../../lib/server-content-authoring/render.ts"),
 });
 const dirty:boolean[]=[];
 await withAdvanced({draftSession:undefined,editor:existingEditor,presentation:"rail",onDirtyChange:(value:boolean)=>dirty.push(value)},async({container,browser})=>{
  await click(container,"AI ile SEO oluştur");const panel=container.querySelector('[aria-label="AI ile içerik"]')!;
  await act(async()=>panel.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1].click());
  await act(async()=>panel.querySelector('details summary')!.dispatchEvent(new browser.MouseEvent("click",{bubbles:true}) as unknown as Event));
  const tone=panel.querySelectorAll<HTMLSelectElement>('select')[1];await act(async()=>{tone.value="professional";tone.dispatchEvent(new browser.Event("change",{bubbles:true}) as unknown as Event);});
  assert.equal(dirty.at(-1)??false,false);assert.equal(container.querySelector<HTMLElement>('footer')!.hidden,true);
  const seo=container.querySelector<HTMLInputElement>('[name="seoTitle"]')!;await act(async()=>{Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype,"value")!.set!.call(seo,"Manually edited SEO");seo.dispatchEvent(new browser.Event("input",{bubbles:true}) as unknown as Event);});
  assert.equal(dirty.at(-1),true);assert.equal(container.querySelector<HTMLElement>('footer')!.hidden,false);assert.equal(seo.value,"Manually edited SEO");
 },undefined,(props:any)=>createElement(compiled.ContentAuthoringPanel as React.ComponentType<any>,{...props,preferencesApi:{records:async()=>[]}}));
});

test("advanced product resumes the same draft after gallery reply loss and remount, with stable uploaded IDs and operation key",async()=>{
 const original=draft();
 const red={...original.current.variants[0]!,title:"Kırmızı S",attributes:{renk:"Kırmızı",beden:"S"}},blue={...red,title:"Mavi S",attributes:{renk:"Mavi",beden:"S"},sku:"BLUE",barcode:""};
 const session=drafts.updateProductDraft(original,{kind:"variant",variants:[red,blue]});
 const product={...created,variants:[{id:"variant-blue",sku:"BLUE",attributes:blue.attributes},{id:"variant-red",sku:red.sku,barcode:red.barcode,attributes:red.attributes}]};
 let creates=0,uploads=0,completed=0;const saves:any[]=[];
 await withAdvanced({draftSession:session,onCreated:()=>completed++,api:{createProduct:async()=>{creates++;return product;}},mediaClient:{upload:async()=>({media:{id:`real-media-${++uploads}`}})},galleryClient:{save:async(_id:string,input:any)=>{saves.push(input);if(saves.length===1)throw new Error("Galeri bağlantısı kesildi.");return {gallery:{productId:product.product.id,version:2,assignments:input.assignments},replayed:true};}}},async({container,browser,latest,remount})=>{
  const chooser=container.querySelector<HTMLInputElement>('input[type="file"]')!;
  await act(async()=>{Object.defineProperty(chooser,"files",{configurable:true,value:[new browser.File(["one"],"same.png",{type:"image/png"}),new browser.File(["two"],"same.png",{type:"image/png"})]});chooser.dispatchEvent(new browser.Event("change",{bubbles:true}) as unknown as Event);});
  const trigger=container.querySelector<HTMLButtonElement>('button[aria-label="Kırmızı S görsellerini seç"]');assert.ok(trigger);
  await act(async()=>trigger.click());
  await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="2. görselini seç"]')!.click());
  await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="1. görselini seç"]')!.click());
  await click(container,"Uygula");
  await submit(container,browser);
  assert.equal(completed,0,"failed gallery save must keep the form open");assert.equal(creates,1);assert.equal(uploads,2);assert.match(container.querySelector('[role="alert"]')?.textContent??"",/Galeri bağlantısı/);
  assert.deepEqual(saves[0].assignments,[{variantId:"variant-red",mediaIds:["real-media-2","real-media-1"]}]);
  const recovery=latest();assert.ok(recovery.current.creationRecovery);
  const titleInput=container.querySelector<HTMLInputElement>('input[name="title"]')!;
  const priceInput=container.querySelector<HTMLInputElement>('input[aria-label="Kırmızı S satış fiyatı"]')!;
  const removeButton=container.querySelector<HTMLButtonElement>('button[aria-label="Seçili görseli kaldır"]')!;
  assert.equal(Boolean(titleInput.closest("fieldset[disabled]")),true,"created title must be immutable during recovery");
  assert.equal(Boolean(priceInput.closest("fieldset[disabled]")),true,"created variant price must be immutable during recovery");
  assert.equal(Boolean(removeButton.closest("fieldset[disabled]")),true,"uploaded media cannot be removed from the pending recovery");
  assert.equal(container.querySelector<HTMLTextAreaElement>('textarea[name="description"]')!.readOnly,true,"rich product description is also immutable during recovery");
  await act(async()=>removeButton.click());
  assert.equal(latest().current.media.length,2);assert.deepEqual(latest().current.creationRecovery,recovery.current.creationRecovery);
  assert.equal(container.querySelector<HTMLButtonElement>('button[value="draft"]')!.matches(":disabled"),false,"recovery retry stays enabled");
  await remount(recovery);
  // Native FormData excludes descendants of a disabled fieldset; happy-dom does not.
  const NativeFormData=browser.FormData;
  Object.defineProperty(globalThis,"FormData",{configurable:true,writable:true,value:class extends NativeFormData{constructor(form?:HTMLFormElement){super(form?.querySelector("fieldset:disabled")?undefined:form as never);}}});
  await submit(container,browser);
  assert.equal(creates,1);assert.equal(uploads,2);assert.equal(completed,1);assert.equal(saves[0].operationId,saves[1].operationId);
 });
});

test("removing a local product image clears its variant links before creation",async()=>{
 const original=draft();const session=drafts.updateProductDraft(original,{kind:"variant",variants:[{...original.current.variants[0]!,title:"Kırmızı S",attributes:{renk:"Kırmızı",beden:"S"}}]});
 await withAdvanced({draftSession:session},async({container,browser,latest})=>{
  const chooser=container.querySelector<HTMLInputElement>('input[type="file"]')!;
  await act(async()=>{Object.defineProperty(chooser,"files",{configurable:true,value:[new browser.File(["one"],"one.png",{type:"image/png"}),new browser.File(["two"],"two.png",{type:"image/png"})]});chooser.dispatchEvent(new browser.Event("change",{bubbles:true}) as unknown as Event);});
  await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="Kırmızı S görsellerini seç"]')!.click());
  await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="1. görselini seç"]')!.click());await click(container,"Uygula");
  assert.equal(latest().current.variants[0]!.mediaIds?.length,1);
  await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="Seçili görseli kaldır"]')!.click());
  assert.deepEqual(latest().current.variants[0]!.mediaIds,[]);
 });
});
