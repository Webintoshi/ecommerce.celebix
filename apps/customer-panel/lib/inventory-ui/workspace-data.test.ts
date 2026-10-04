import assert from "node:assert/strict";
import test from "node:test";
import type { InventoryBalance, InventoryLocation } from "@celebix/saas-contracts";
import type { CatalogVariantChoice } from "../catalog-ui/variant-choices.ts";

const id = (value: number) => `${String(value).padStart(8, "0")}-1111-4111-8111-${String(value).padStart(12, "0")}`;
const NOW = "2026-10-04T09:00:00.000Z";
const location = (value: number, status: InventoryLocation["status"] = "active"): InventoryLocation => ({
  id: id(value), name: value === 1 ? "Ana depo" : "Arşiv depo", isDefault: value === 1,
  status, archiveEligibility: { canArchive: false, reason: value === 1 ? "default" : "archived" },
  version: 1, createdAt: NOW, updatedAt: NOW,
});
const variant = (value: number, title = "Kupa"): CatalogVariantChoice => ({
  variantId: id(value), productId: id(value + 100), productTitle: title,
  variantTitle: value === 10 ? "Kırmızı" : "Mavi", sku: `KUPA-${value}`,
});
const balance = (value: number, quantity: number): InventoryBalance => ({
  locationId: id(1), variantId: id(value), quantity, version: 1, updatedAt: NOW,
});
const loadModule = () => import("./workspace-data.ts").catch(() => ({} as Record<string, unknown>));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("workspace loads the direct catalog projection and depots together, keeping archived names outside form choices", async () => {
  const module = await loadModule();
  assert.equal(typeof module.loadInventoryWorkspaceData, "function");
  const pending = deferred<readonly CatalogVariantChoice[]>();
  let locationsStarted = false;
  const resultPromise = (module.loadInventoryWorkspaceData as Function)({
    catalog: {
      listVariantChoices() { return pending.promise; },
      async listProducts() { throw new Error("direct projection must be used"); },
      async getProduct() { throw new Error("direct projection must be used"); },
    },
    inventory: { async listLocations() { locationsStarted = true; return [location(1), location(2, "archived")]; } },
  }, new AbortController().signal);
  assert.equal(locationsStarted, true, "depot loading must not wait for catalog completion");
  pending.resolve([variant(10), variant(11)]);
  const result = await resultPromise;
  assert.equal(result.locations.length, 2);
  assert.deepEqual(result.formChoices.locations, [{ locationId: id(1), name: "Ana depo", isDefault: true }]);
  assert.deepEqual(result.variants.map((item: CatalogVariantChoice) => item.sku), ["KUPA-10", "KUPA-11"]);
});

test("one failed workspace source rejects the result instead of publishing a partial empty catalog", async () => {
  const module = await loadModule();
  assert.equal(typeof module.loadInventoryWorkspaceData, "function");
  await assert.rejects(() => (module.loadInventoryWorkspaceData as Function)({
    catalog: { async listVariantChoices() { throw new Error("catalog unavailable"); }, async listProducts() { throw new Error(); }, async getProduct() { throw new Error(); } },
    inventory: { async listLocations() { return [location(1)]; } },
  }, new AbortController().signal), /inventory_workspace_unavailable/);
});

test("workspace reload discards a late prior result and an aborted completion", async () => {
  const module = await loadModule();
  assert.equal(typeof module.createInventoryWorkspaceController, "function");
  const first = deferred<any>(), second = deferred<any>();
  const signals: AbortSignal[] = [];
  let calls = 0;
  const controller = (module.createInventoryWorkspaceController as Function)({
    load(signal: AbortSignal) { signals.push(signal); return ++calls === 1 ? first.promise : second.promise; },
  });
  const initial = controller.reload();
  const newer = controller.reload();
  assert.equal(signals[0].aborted, true);
  second.resolve({ locations: [location(1)], variants: [variant(11)], formChoices: { products: [], variants: [variant(11)], locations: [] } });
  await newer;
  assert.equal(controller.getSnapshot().phase, "loaded");
  assert.equal(controller.getSnapshot().revision, 1);
  first.resolve({ locations: [], variants: [variant(10)], formChoices: { products: [], variants: [variant(10)], locations: [] } });
  await initial;
  assert.equal(controller.getSnapshot().data.variants[0].variantId, id(11));
  controller.dispose();
});

test("stock rows retain explicit zero, absent balance and uncatalogued balance as distinct states", async () => {
  const module = await loadModule();
  assert.equal(typeof module.buildStockRows, "function");
  const rows = (module.buildStockRows as Function)([variant(10), variant(11)], [balance(10, 0), balance(12, 4)]);
  const zero = rows.find((row: any) => row.variantId === id(10));
  const absent = rows.find((row: any) => row.variantId === id(11));
  const unknown = rows.find((row: any) => row.variantId === id(12));
  assert.equal(zero.quantity, 0);
  assert.equal(zero.canCorrect, true);
  assert.equal(absent.quantity, undefined);
  assert.equal(absent.canCorrect, false);
  assert.equal(unknown.quantity, 4);
  assert.equal(unknown.productTitle, "Ürün bilgisi yüklenemedi");
  assert.equal(unknown.canCorrect, false);
});

test("stock filters search product variant and SKU and never count missing balance as no stock", async () => {
  const module = await loadModule();
  assert.equal(typeof module.filterStockRows, "function");
  const rows = (module.buildStockRows as Function)([variant(10, "Fincan"), variant(11), variant(12)], [balance(10, 0), balance(11, 4)]);
  assert.deepEqual((module.filterStockRows as Function)(rows, { search: "kupa-11", status: "all", lowThreshold: 3 }).map((row: any) => row.variantId), [id(11)]);
  assert.deepEqual((module.filterStockRows as Function)(rows, { search: "kırmızı", status: "all", lowThreshold: 3 }).map((row: any) => row.variantId), [id(10)]);
  assert.deepEqual((module.filterStockRows as Function)(rows, { search: "", status: "zero", lowThreshold: 3 }).map((row: any) => row.variantId), [id(10)]);
  assert.equal((module.filterStockRows as Function)(rows, { search: "", status: "low", lowThreshold: 3 }).length, 0);
  assert.deepEqual((module.filterStockRows as Function)(rows, { search: "", status: "low", lowThreshold: 4 }).map((row: any) => row.variantId), [id(11)]);
});

test("visible stock CSV keeps missing quantities blank and escapes names without exposing identifiers", async () => {
  const module = await loadModule();
  assert.equal(typeof module.stockRowsCsv, "function");
  const rows = (module.buildStockRows as Function)([variant(10, '=HYPERLINK("x")'), variant(11)], [balance(10, 0)]);
  const csv = (module.stockRowsCsv as Function)(rows, "Ana depo");
  assert.ok(csv.startsWith('"Ürün","Varyant","SKU","Depo","Depo stoku"\r\n'));
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /"KUPA-11","Ana depo",""/);
  assert.ok(!csv.includes(id(10)));
});
