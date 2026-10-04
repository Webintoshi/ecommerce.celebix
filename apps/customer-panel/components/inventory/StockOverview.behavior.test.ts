import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import * as dataModule from "../../lib/inventory-ui/workspace-data.ts";
import type { InventoryBalance, InventoryLocation } from "@celebix/saas-contracts";

const id = (value: number) => `${String(value).padStart(8, "0")}-1111-4111-8111-${String(value).padStart(12, "0")}`;
const NOW = "2026-10-04T09:00:00.000Z";
const locations: readonly InventoryLocation[] = [1, 2].map((value) => ({
  id: id(value), name: value === 1 ? "Ana depo" : "Mağaza", isDefault: value === 1, status: "active",
  archiveEligibility: { canArchive: false, reason: value === 1 ? "default" : "positive_on_hand" }, version: 1, createdAt: NOW, updatedAt: NOW,
}));
const variants = [10, 11].map((value) => ({ variantId: id(value), productId: id(100 + value), productTitle: value === 10 ? "Fincan" : "Kupa", variantTitle: value === 10 ? "Kırmızı" : "Mavi", sku: `KUPA-${value}` }));
const workspace: dataModule.InventoryWorkspaceData = {
  locations, variants,
  formChoices: { products: variants.map(({ productId, productTitle }) => ({ productId, title: productTitle })), variants, locations: locations.map(({ id, name, isDefault }) => ({ locationId: id, name, isDefault })) },
};
const balance = (location: number, variant: number, quantity: number): InventoryBalance => ({ locationId: id(location), variantId: id(variant), quantity, version: 1, updatedAt: NOW });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

async function mount(
  balances: (locationId: string, signal?: AbortSignal) => Promise<readonly InventoryBalance[]>,
  verify: (harness: { container: HTMLElement; browser: Window; edit: (selector: string, value: string) => Promise<void>; settle: () => Promise<void>; corrections: unknown[]; purchases: unknown[]; purchaseCount: () => number }) => Promise<void>,
  options: { canManage?: boolean; canPurchase?: boolean; data?: dataModule.InventoryWorkspaceData } = {},
) {
  const source = await readFile(new URL("./StockOverview.tsx", import.meta.url), "utf8").catch(() => "");
  assert.ok(source, "the stock overview component must exist");
  const browser = new Window({ url: "https://panel.example.test/products/stock" });
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Event: browser.Event, MouseEvent: browser.MouseEvent, MutationObserver: browser.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const styles: any = new Proxy({}, { get: (_target, key) => key === "__esModule" ? true : key === "default" ? styles : String(key) });
  const modules = new Map<string, any>();
  async function compile(name: "InventoryWorkspaceContext" | "StockOverview") {
    if (modules.has(name)) return modules.get(name);
    const text = name === "StockOverview" ? source : await readFile(new URL(`./${name}.tsx`, import.meta.url), "utf8");
    const output = ts.transpileModule(text, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const compiled = { exports: {} as Record<string, unknown> };
    Function("require", "module", "exports", output)((path: string) => {
      if (path === "react") return React;
      if (path === "react/jsx-runtime") return jsxRuntime;
      if (path === "@/lib/inventory-ui/workspace-data") return { ...dataModule, createInventoryWorkspaceController: (controllerOptions: any) => dataModule.createInventoryWorkspaceController({ ...controllerOptions, load: async () => options.data ?? workspace }) };
      if (path === "@/lib/inventory-ui/client") return { inventoryApi: { listBalances: balances } };
      if (path === "@/components/inventory/InventoryWorkspaceContext" || path === "./InventoryWorkspaceContext") return modules.get("InventoryWorkspaceContext");
      if (path === "next/link") return { __esModule: true, default: ({ href, children, ...props }: any) => createElement("a", { ...props, href }, children) };
      if (path === "./stock-overview.module.css") return styles;
      throw new Error(`unexpected_import:${path}`);
    }, compiled, compiled.exports);
    modules.set(name, compiled.exports);
    return compiled.exports;
  }
  const { InventoryWorkspaceProvider } = await compile("InventoryWorkspaceContext");
  const { StockOverview } = await compile("StockOverview");
  const { createRoot } = await import("react-dom/client");
  const container = browser.document.createElement("div"); browser.document.body.append(container);
  const root = createRoot(container as unknown as HTMLElement);
  const corrections: unknown[] = [], purchases: unknown[] = [];
  const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
  const edit = async (selector: string, value: string) => {
    const field: any = container.querySelector(selector); assert.ok(field, selector);
    const prototype = field.tagName === "SELECT" ? browser.HTMLSelectElement.prototype : browser.HTMLInputElement.prototype;
    await act(async () => { Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value); field.dispatchEvent(new browser.Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
    await settle();
  };
  try {
    await act(async () => root.render(createElement(InventoryWorkspaceProvider, { inventoryCanRead: true }, createElement(StockOverview, { canManage: options.canManage ?? true, canPurchase: options.canPurchase, onCorrect: (selection: unknown) => corrections.push(selection), onPurchase: (selection: unknown) => purchases.push(selection) }))));
    await settle(); await settle();
    await verify({ container: container as unknown as HTMLElement, browser, edit, settle, corrections, purchases, purchaseCount: () => purchases.length });
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    await browser.happyDOM.close();
  }
}

test("stock overview filters authoritative zero separately from missing balance and corrects only a known recorded row", async () => {
  await mount(async () => [balance(1, 10, 0), balance(1, 12, 4)], async ({ container, browser, edit, corrections }) => {
    assert.equal((container.querySelector('[aria-label="Depo"]') as HTMLSelectElement).value, id(1));
    assert.match(container.textContent ?? "", /Kayıt yok/);
    assert.match(container.textContent ?? "", /Ürün bilgisi yüklenemedi/);
    assert.ok(!(container.textContent ?? "").includes(id(12)));
    const correct = container.querySelector('button[aria-label="Fincan · Kırmızı stokunu düzelt"]');
    assert.ok(correct);
    await act(async () => correct.dispatchEvent(new browser.MouseEvent("click", { bubbles: true }) as unknown as Event));
    assert.deepEqual(corrections, [{ locationId: id(1), variantId: id(10) }]);
    await edit('[aria-label="Stok durumu"]', "zero");
    assert.match(container.textContent ?? "", /Fincan/);
    assert.ok(!(container.textContent ?? "").includes("Kayıt yok"));
    assert.ok(!(container.textContent ?? "").includes("Ürün bilgisi yüklenemedi"));
    await edit('[aria-label="Stok durumu"]', "all");
    await edit('[aria-label="Stokta ürün ara"]', "KUPA-11");
    assert.match(container.textContent ?? "", /Kupa/);
    assert.ok(!(container.textContent ?? "").includes("Fincan"));
    assert.equal(container.querySelector('button[aria-label="Kupa · Mavi stokunu düzelt"]')?.hasAttribute("disabled"), true);
  });
});

test("changing depot ignores a late previous balance response and keeps loading apart from zero stock", async () => {
  const first = deferred<readonly InventoryBalance[]>(), second = deferred<readonly InventoryBalance[]>();
  await mount((locationId) => locationId === id(1) ? first.promise : second.promise, async ({ container, edit, settle }) => {
    assert.match(container.textContent ?? "", /Depo stoku yükleniyor/);
    assert.equal(container.querySelector('[data-stock-quantity="0"]'), null);
    await edit('[aria-label="Depo"]', id(2));
    second.resolve([balance(2, 10, 8)]); await settle();
    assert.equal(container.querySelector('[data-stock-quantity="8"]')?.textContent, "8");
    first.resolve([balance(1, 10, 42)]); await settle();
    assert.equal(container.querySelector('[data-stock-quantity="42"]'), null);
    assert.equal(container.querySelector('[data-stock-quantity="8"]')?.textContent, "8");
  });
});

test("adding stock passes the clicked variant and currently selected depot without correcting a known balance", async () => {
  const reads: string[] = [];
  await mount(async locationId => { reads.push(locationId); return [balance(locationId === id(1) ? 1 : 2, 10, 4)]; }, async ({ container, browser, edit, corrections, purchases }) => {
    async function purchaseMissingRow() {
      const row = [...container.querySelectorAll("tr")].find(item => item.textContent?.includes("Kupa"));
      assert.ok(row);
      const action = [...row.querySelectorAll("button")].find(button => button.textContent === "Stok ekle");
      assert.ok(action);
      await act(async () => action.dispatchEvent(new browser.MouseEvent("click", { bubbles: true }) as unknown as Event));
    }
    await purchaseMissingRow();
    assert.equal((purchases[0] as { locationId?: string })?.locationId, id(1));
    assert.equal((purchases[0] as { variantId?: string })?.variantId, id(11));
    assert.deepEqual(purchases, [{ locationId: id(1), variantId: id(11) }]);
    await edit('[aria-label="Depo"]', id(2));
    await purchaseMissingRow();
    assert.deepEqual(purchases.at(-1), { locationId: id(2), variantId: id(11) });
    const known = [...container.querySelectorAll("tr")].find(item => item.textContent?.includes("Fincan"));
    assert.ok(known);
    assert.equal(known.querySelector("button"), null);
    assert.equal(known.querySelector('[data-stock-quantity="4"]')?.textContent, "4");
    assert.deepEqual(corrections, []);
    assert.deepEqual(reads, [id(1), id(2)]);
  }, { canManage: false, canPurchase: true });
});

test("empty stock purchase carries only the selected depot and read-only users get no purchase actions", async () => {
  const empty = { ...workspace, variants: [], formChoices: { ...workspace.formChoices, products: [], variants: [] } };
  await mount(async () => [], async ({ container, browser, edit, purchases }) => {
    await edit('[aria-label="Depo"]', id(2));
    const action = [...container.querySelectorAll("button")].find(button => button.textContent === "Satın alma oluştur");
    assert.ok(action);
    await act(async () => action.dispatchEvent(new browser.MouseEvent("click", { bubbles: true }) as unknown as Event));
    assert.equal((purchases[0] as { locationId?: string })?.locationId, id(2));
    assert.deepEqual(purchases, [{ locationId: id(2) }]);
  }, { data: empty, canManage: false, canPurchase: true });
  await mount(async () => [], async ({ container, purchases, corrections }) => {
    assert.ok(![...container.querySelectorAll("button")].some(button => /Stok ekle|Satın alma oluştur|Stok düzelt/.test(button.textContent ?? "")));
    assert.deepEqual(purchases, []);
    assert.deepEqual(corrections, []);
  }, { canManage: false, canPurchase: false });
});

test("failed balance lookup renders a retry action without a fabricated zero stock row", async () => {
  let attempts = 0;
  await mount(async () => { if (++attempts === 1) throw new Error("offline"); return [balance(1, 10, 0)]; }, async ({ container, browser, settle }) => {
    assert.match(container.textContent ?? "", /Depo stoku yüklenemedi/);
    assert.equal(container.querySelector('[data-stock-quantity="0"]'), null);
    const retry = [...container.querySelectorAll("button")].find((button) => button.textContent === "Tekrar dene");
    assert.ok(retry);
    await act(async () => retry.dispatchEvent(new browser.MouseEvent("click", { bubbles: true }) as unknown as Event)); await settle();
    assert.equal(container.querySelector('[data-stock-quantity="0"]')?.textContent, "0");
  });
});

test("CSV download contains only the currently visible stock rows", async () => {
  let exported: Blob | undefined;
  const createDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: (blob: Blob) => { exported = blob; return "blob:stock-export"; } });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: () => undefined });
  try {
    await mount(async () => [balance(1, 10, 0), balance(1, 11, 5)], async ({ container, browser, edit }) => {
      await edit('[aria-label="Stokta ürün ara"]', "KUPA-11");
      const download = [...container.querySelectorAll("button")].find((button) => button.textContent === "CSV indir");
      assert.ok(download);
      await act(async () => download.dispatchEvent(new browser.MouseEvent("click", { bubbles: true }) as unknown as Event));
      assert.ok(exported);
      const csv = await exported.text();
      assert.match(csv, /"Kupa","Mavi","KUPA-11","Ana depo","5"/);
      assert.ok(!csv.includes("Fincan"));
      assert.ok(!csv.includes(id(11)));
    });
  } finally {
    if (createDescriptor) Object.defineProperty(URL, "createObjectURL", createDescriptor);
    if (revokeDescriptor) Object.defineProperty(URL, "revokeObjectURL", revokeDescriptor);
  }
});
