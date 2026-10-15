import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { act, createElement } from "react";
import { compile, withEditor } from "../settings/design/design-editor-test-utils.ts";
import { buildStockRows, filterStockRows, stockRowsCsv } from "../../lib/inventory-ui/workspace-data.ts";
import * as pricingModel from "../../lib/reference-pricing-ui/model.ts";
import * as pricingDecimal from "../../lib/reference-pricing-ui/decimal.ts";
import { referencePricingErrorState } from "../../lib/reference-pricing-ui/client.ts";

const LOCATION = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
const VARIANT = "20000000-0000-4000-8000-000000000001";
const REFERENCE = "30000000-0000-4000-8000-000000000001";
const SET = "40000000-0000-4000-8000-000000000001";
const UTC = "2026-10-15T09:00:00.000Z";
const locations = [LOCATION, OTHER].map((id, index) => ({ id, name: index ? "İkinci depo" : "Ana depo", isDefault: !index, status: "active" }));
const variants = [{ variantId: VARIANT, productId: SET, productTitle: "Fincan", variantTitle: "Kırmızı", sku: "FINCAN" }];
const balance = (locationId: string, quantity: number) => ({ locationId, variantId: VARIANT, quantity, version: 1, updatedAt: UTC });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
const shell = {
  PanelPageShell: ({ children }: any) => createElement("main", null, children),
  PanelPageHeader: () => null,
  PanelStatusBadge: ({ children }: any) => createElement("span", null, children),
  PanelActionButton: ({ children, primary, ...props }: any) => createElement("a", props, children),
  PanelEmptyState: ({ title, description }: any) => createElement("div", null, createElement("h2", null, title), createElement("p", null, description)),
};
const link = { __esModule: true, default: ({ children, ...props }: any) => createElement("a", props, children) };
function stockFixture(load: (id: string, signal?: AbortSignal) => Promise<readonly any[]>) {
  let workspace: any = { inventoryCanRead: true, phase: "loaded", locations, variants, revision: 1 };
  const { StockOverview } = compile<any>(new URL("./StockOverview.tsx", import.meta.url), {
    "next/link": link,
    "@/lib/inventory-ui/client": { inventoryApi: { listBalances: load } },
    "@/lib/inventory-ui/workspace-data": { buildStockRows, filterStockRows, stockRowsCsv },
    "./InventoryWorkspaceContext": { useInventoryWorkspace: () => workspace },
  });
  const component = () => createElement<any>(StockOverview, { canManage: true, canPurchase: true, onCorrect() {}, onPurchase() {} });
  return { component, workspace(next: object) { workspace = { ...workspace, ...next }; } };
}

test("same-depot metadata refresh keeps the resolved stock DOM and disables stock actions", async () => {
  const next = deferred<readonly any[]>(); let reads = 0;
  const fixture = stockFixture(async id => ++reads === 1 ? [balance(id, 7)] : next.promise);
  await withEditor(async ({ container, render }) => {
    await render(fixture.component()); await settle();
    const quantity = container.querySelector('[data-stock-quantity="7"]'); assert.ok(quantity);
    fixture.workspace({ phase: "loading", locations: [], variants: [] }); await render(fixture.component());
    assert.ok(container.querySelector('[data-stock-quantity="7"]') === quantity, "same-depot stock node remains mounted");
    assert.equal(container.querySelector('[aria-label="Depo stokları"]')?.getAttribute("aria-busy"), "true");
    assert.equal(container.querySelector('button[aria-label="Fincan · Kırmızı stokunu düzelt"]')?.hasAttribute("disabled"), true);
    fixture.workspace({ phase: "loaded", locations, variants, revision: 2 }); await render(fixture.component());
    assert.ok(container.querySelector('[data-stock-quantity="7"]') === quantity, "same-depot stock node remains mounted");
    next.resolve([balance(LOCATION, 9)]); await settle();
    assert.equal(container.querySelector('[data-stock-quantity="9"]')?.textContent, "9");
  });
});

test("changing depot hides previous quantities immediately and ignores the aborted depot response", async () => {
  const old = deferred<readonly any[]>(), next = deferred<readonly any[]>(); let reads = 0;
  const fixture = stockFixture(async id => ++reads === 1 ? [balance(id, 7)] : id === LOCATION ? old.promise : next.promise);
  await withEditor(async ({ container, render, change }) => {
    await render(fixture.component()); await settle();
    fixture.workspace({ revision: 2 }); await render(fixture.component());
    await change(container.querySelector('[aria-label="Depo"]') as HTMLSelectElement, OTHER);
    assert.equal(container.querySelector('[data-stock-quantity="7"]'), null);
    next.resolve([balance(OTHER, 12)]); await settle();
    old.resolve([balance(LOCATION, 99)]); await settle();
    assert.equal(container.querySelector('[data-stock-quantity="99"]'), null);
    assert.equal(container.querySelector('[data-stock-quantity="12"]')?.textContent, "12");
  });
});

test("stock refresh errors retain frozen same-depot values and lost read access hides them", async () => {
  const next = deferred<readonly any[]>(); let reads = 0;
  const fixture = stockFixture(async id => ++reads === 1 ? [balance(id, 7)] : next.promise);
  await withEditor(async ({ container, render }) => {
    await render(fixture.component()); await settle();
    fixture.workspace({ revision: 2 }); await render(fixture.component());
    next.reject(new Error("offline")); await settle();
    assert.ok(container.querySelector('[data-stock-quantity="7"]'), "same-depot values remain visible after failed refresh");
    assert.equal(container.querySelector('button[aria-label="Fincan · Kırmızı stokunu düzelt"]')?.hasAttribute("disabled"), true);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /yüklenemedi.*Son alınan/s);
    fixture.workspace({ inventoryCanRead: false }); await render(fixture.component());
    assert.equal(container.querySelector('[data-stock-quantity]'), null);
    assert.match(container.textContent ?? "", /yetkiniz yok/);
  });
});

function referenceFixture() {
  const next = deferred<any>(); let reads = 0;
  const definitions = [{ id: REFERENCE, kind: "usd", label: "USD satış", createdAt: UTC }];
  const api = {
    listDefinitions: async () => ++reads === 1 ? { items: definitions } : next.promise,
    listSets: async () => ({ activeSetId: SET, stateVersion: 1, items: [], nextCursor: null }),
    getSet: async () => ({ setId: SET, version: 1, stateVersion: 1, isActive: true, createdAt: UTC, values: [{ referenceId: REFERENCE, kind: "usd", label: "USD satış", rateTry: "40", active: true }] }),
    apply: async () => ({ setId: SET, version: 2, stateVersion: 2, activatedAt: UTC }),
  };
  const { ReferencePricingConsole } = compile<any>(new URL("../reference-pricing/ReferencePricingConsole.tsx", import.meta.url), {
    "lucide-react": { Plus: () => null, X: () => null },
    "@/components/panel/PanelPageShell": shell,
    "@/lib/reference-pricing-ui/model": pricingModel,
    "@/lib/reference-pricing-ui/decimal": pricingDecimal,
    "@/lib/reference-pricing-ui/client": { referencePricingApi: api, referencePricingErrorState },
  });
  return { next, definitions, component: (canRead = true) => createElement(ReferencePricingConsole, { canRead, canManage: true }) };
}

test("reference apply refresh keeps the existing form DOM while disabling writes", async () => {
  const fixture = referenceFixture();
  await withEditor(async ({ container, render, click }) => {
    await render(fixture.component()); await settle();
    const field = container.querySelector('input[inputmode="decimal"]'); assert.ok(field);
    const save = [...container.querySelectorAll("button")].find(button => button.textContent === "Kaydet"); assert.ok(save);
    await click(save); await settle();
    assert.ok(container.querySelector('input[inputmode="decimal"]') === field, "reference form node remains mounted");
    assert.equal(field.hasAttribute("disabled"), true);
    assert.equal(container.querySelector('[data-reference-pricing]')?.getAttribute("aria-busy"), "true");
    fixture.next.resolve({ items: fixture.definitions }); await settle();
    assert.ok(container.querySelector('input[inputmode="decimal"]') === field, "reference form node remains mounted");
    assert.equal(field.hasAttribute("disabled"), false);
  });
});

test("reference refresh failure and permission loss show no stale editable authority", async () => {
  const fixture = referenceFixture();
  await withEditor(async ({ container, render, click }) => {
    await render(fixture.component()); await settle();
    await click([...container.querySelectorAll("button")].find(button => button.textContent === "Kaydet")!); await settle();
    fixture.next.reject(new Error("offline")); await settle();
    assert.ok(container.querySelector('input[inputmode="decimal"]'), "resolved form remains visible after failed refresh");
    assert.equal(container.querySelector('input[inputmode="decimal"]')?.hasAttribute("disabled"), true);
    assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /yüklenemedi.*kilitli/s);
    await render(fixture.component(false));
    assert.equal(container.querySelector('[role="tablist"]'), null);
    assert.match(container.textContent ?? "", /yetkiniz yok/);
  });
});

test("inventory and price-list data regions reserve a normal five-row footprint across truth states", async () => {
  const { InventoryListState } = compile<any>(new URL("./InventoryListState.tsx", import.meta.url), { "@/components/panel/PanelPageShell": shell });
  const { PriceListListPresentation } = compile<any>(new URL("../pricing/PriceListConsole.tsx", import.meta.url), {
    "next/link": link, "@/components/panel/PanelPageShell": shell,
    "@/lib/catalog-ui/variant-choices": {}, "@/lib/customer-ui/client": {}, "@/lib/pricing-ui/client": {},
  });
  await withEditor(async ({ container, render }) => {
    for (const state of ["loading", "loaded", "error"]) {
      await render(createElement<any>(InventoryListState, { state, count: state === "loaded" ? 1 : 0, error: "offline", emptyTitle: "Yok", emptyDescription: "", onRetry() {} }, createElement("table", null, createElement("tbody", null, createElement("tr", null, createElement("td", null, "Kayıt"))))));
      assert.ok(container.querySelector('[data-inventory-list-body]'));
      await render(createElement(PriceListListPresentation, { phase: state, items: [], tags: [], canManage: true, onRetry() {} }));
      assert.ok(container.querySelector('[data-price-list-body]'));
    }
  });
  for (const file of ["./inventory-console.module.css", "../pricing/price-list-console.module.css"]) {
    const css = await readFile(new URL(file, import.meta.url), "utf8");
    assert.match(css, /\.listBody\s*\{[^}]*min-height:\s*360px/s);
    assert.doesNotMatch(css, /\.listBody\s*\{[^}]*(?:max-height|overflow:\s*hidden)/s);
  }
});

test("a failed same-scope inventory list refresh keeps its rows beside the read error",async()=>{
 const { InventoryListState }=compile<any>(new URL("./InventoryListState.tsx",import.meta.url),{"@/components/panel/PanelPageShell":shell});
 await withEditor(async({container,render})=>{
  const view=(state:string)=>createElement<any>(InventoryListState,{state,count:1,error:"Liste yüklenemedi.",emptyTitle:"Yok",emptyDescription:"",onRetry(){}},createElement("table",null,createElement("tbody",null,createElement("tr",null,createElement("td",null,"Kayıt")))));
  await render(view("loaded"));const row=container.querySelector("tr");assert.ok(row);await render(view("loading"));assert.ok(container.querySelector("tr")===row);
  await render(view("error"));assert.ok(container.querySelector("tr")===row,"same list row survives failed refresh");assert.match(container.querySelector('[role="alert"]')?.textContent??"",/Son alınan kayıtlar/);
  await render(view("denied"));assert.equal(container.querySelector("tr"),null);
 });
});
