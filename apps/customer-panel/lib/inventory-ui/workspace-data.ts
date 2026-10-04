import { parseInventoryLocation, type InventoryBalance, type InventoryLocation } from "@celebix/saas-contracts";

import { catalogApi } from "../catalog-ui/client.ts";
import { loadCatalogVariantChoices, type CatalogVariantChoice, type CatalogVariantChoiceApi } from "../catalog-ui/variant-choices.ts";
import { inventoryApi } from "./client.ts";
import type { InventoryFormChoices } from "./form-choices.ts";

export type InventoryWorkspaceData = Readonly<{
  locations: readonly InventoryLocation[];
  variants: readonly CatalogVariantChoice[];
  formChoices: InventoryFormChoices;
}>;
export type InventoryWorkspaceSnapshot = Readonly<{
  phase: "loading" | "loaded" | "error";
  data: InventoryWorkspaceData;
  revision: number;
}>;
type Dependencies = Readonly<{
  catalog: CatalogVariantChoiceApi;
  inventory: Pick<typeof inventoryApi, "listLocations">;
}>;

export const EMPTY_INVENTORY_WORKSPACE: InventoryWorkspaceData = Object.freeze({
  locations: Object.freeze([]),
  variants: Object.freeze([]),
  formChoices: Object.freeze({ products: Object.freeze([]), variants: Object.freeze([]), locations: Object.freeze([]) }),
});

export async function loadInventoryWorkspaceData(
  dependencies: Dependencies = { catalog: catalogApi, inventory: inventoryApi },
  signal: AbortSignal = new AbortController().signal,
): Promise<InventoryWorkspaceData> {
  try {
    const [catalog, rawLocations] = await Promise.all([
      loadCatalogVariantChoices(dependencies.catalog, signal),
      dependencies.inventory.listLocations(signal),
    ]);
    signal.throwIfAborted();
    if (!Array.isArray(rawLocations) || rawLocations.length > 500) throw new Error();
    const locations = Object.freeze(rawLocations.map(parseInventoryLocation));
    if (new Set(locations.map(({ id }) => id)).size !== locations.length) throw new Error();
    const formChoices: InventoryFormChoices = Object.freeze({
      products: catalog.products,
      variants: catalog.variants,
      locations: Object.freeze(locations.filter(({ status }) => status === "active").map(({ id, name, isDefault }) =>
        Object.freeze({ locationId: id, name, isDefault }))),
    });
    return Object.freeze({ locations, variants: catalog.variants, formChoices });
  } catch {
    signal.throwIfAborted();
    throw new Error("inventory_workspace_unavailable");
  }
}

export function createInventoryWorkspaceController(options: Readonly<{
  load?: (signal: AbortSignal) => Promise<InventoryWorkspaceData>;
  onChange?: (snapshot: InventoryWorkspaceSnapshot) => void;
}> = {}) {
  let disposed = false, generation = 0;
  let request: AbortController | undefined;
  let snapshot: InventoryWorkspaceSnapshot = Object.freeze({ phase: "loading", data: EMPTY_INVENTORY_WORKSPACE, revision: 0 });
  const publish = (next: InventoryWorkspaceSnapshot) => {
    if (!disposed) { snapshot = Object.freeze(next); options.onChange?.(snapshot); }
  };
  async function reload() {
    if (disposed) return;
    request?.abort();
    const controller = new AbortController();
    request = controller;
    const selected = ++generation;
    publish({ phase: "loading", data: EMPTY_INVENTORY_WORKSPACE, revision: snapshot.revision });
    try {
      const data = await (options.load ?? ((signal) => loadInventoryWorkspaceData(undefined, signal)))(controller.signal);
      if (!disposed && !controller.signal.aborted && selected === generation) {
        publish({ phase: "loaded", data, revision: snapshot.revision + 1 });
      }
    } catch {
      if (!disposed && !controller.signal.aborted && selected === generation) {
        publish({ phase: "error", data: EMPTY_INVENTORY_WORKSPACE, revision: snapshot.revision });
      }
    } finally {
      if (selected === generation && request === controller) request = undefined;
    }
  }
  return Object.freeze({
    getSnapshot: () => snapshot,
    reload,
    dispose() { disposed = true; generation += 1; request?.abort(); request = undefined; },
  });
}

export type StockRow = Readonly<{
  variantId: string;
  productId?: string;
  productTitle: string;
  variantTitle: string;
  sku?: string;
  quantity?: number;
  balance?: InventoryBalance;
  canCorrect: boolean;
}>;
export type StockFilter = "all" | "zero" | "low";

export function buildStockRows(variants: readonly CatalogVariantChoice[], balances: readonly InventoryBalance[]): readonly StockRow[] {
  const balanceByVariant = new Map(balances.map((item) => [item.variantId, item]));
  if (balanceByVariant.size !== balances.length) throw new Error("inventory_workspace_balances_invalid");
  const rows = new Map<string, StockRow>();
  for (const variant of variants) {
    const balance = balanceByVariant.get(variant.variantId);
    rows.set(variant.variantId, Object.freeze({
      ...variant,
      ...(balance ? { balance, quantity: balance.quantity } : {}),
      canCorrect: balance !== undefined,
    }));
  }
  for (const balance of balances) {
    if (!rows.has(balance.variantId)) rows.set(balance.variantId, Object.freeze({
      variantId: balance.variantId, productTitle: "Ürün bilgisi yüklenemedi", variantTitle: "",
      balance, quantity: balance.quantity, canCorrect: false,
    }));
  }
  return Object.freeze([...rows.values()].sort((left, right) =>
    left.productTitle.localeCompare(right.productTitle, "tr") || left.variantTitle.localeCompare(right.variantTitle, "tr")));
}

export function filterStockRows(rows: readonly StockRow[], filter: Readonly<{ search: string; status: StockFilter; lowThreshold: number }>): readonly StockRow[] {
  const query = filter.search.trim().toLocaleLowerCase("tr-TR");
  return Object.freeze(rows.filter((row) =>
    (!query || [row.productTitle, row.variantTitle, row.sku ?? ""].some((value) => value.toLocaleLowerCase("tr-TR").includes(query))) &&
    (filter.status === "all" || (filter.status === "zero" && row.quantity === 0) ||
      (filter.status === "low" && row.quantity !== undefined && row.quantity > 0 && row.quantity <= filter.lowThreshold))));
}

function csvCell(value: string) {
  const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function stockRowsCsv(rows: readonly StockRow[], locationName: string): string {
  return [
    ["Ürün", "Varyant", "SKU", "Depo", "Depo stoku"],
    ...rows.map((row) => [row.productTitle, row.variantTitle, row.sku ?? "", locationName, row.quantity === undefined ? "" : String(row.quantity)]),
  ].map((line) => line.map(csvCell).join(",")).join("\r\n");
}
