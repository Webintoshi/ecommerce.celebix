export type BarcodeSelection = Readonly<{
  variantId: string;
  variantVersion: number;
  quantity: number;
}>;
export type BarcodeSelectableRow = Readonly<{
  variantId: string;
  variantVersion: number;
  stock: number;
  trackInventory: boolean;
}>;
export type BarcodeSelectionFilter = Readonly<{
  q?: string;
  status?: string;
  stockState?: string;
  categoryId?: string;
  brandId?: string;
  productId?: string;
  hasBarcode?: string;
}>;
export type BarcodeFilterableRow = BarcodeSelectableRow &
  Readonly<{
    productId: string;
    productTitle: string;
    variantTitle: string;
    sku?: string;
    barcode?: string;
    status: string;
    category?: Readonly<{ id: string }>;
    brand?: Readonly<{ id: string }>;
  }>;
export type BarcodeSelectionState = ReadonlyMap<string, BarcodeSelection>;
function quantity(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10000)
    throw new TypeError("barcode_quantity_invalid");
  return value;
}
function assertBounds(state: BarcodeSelectionState) {
  if (state.size > 500) throw new TypeError("barcode_selection_limit");
  const total = [...state.values()].reduce(
    (sum, selected) => sum + selected.quantity,
    0,
  );
  if (total > 5_000) throw new TypeError("barcode_label_limit");
}
export function upsertSelection(
  state: BarcodeSelectionState,
  row: BarcodeSelectableRow,
  nextQuantity: number,
): Map<string, BarcodeSelection> {
  const next = new Map(state);
  next.set(
    row.variantId,
    Object.freeze({
      variantId: row.variantId,
      variantVersion: row.variantVersion,
      quantity: quantity(nextQuantity),
    }),
  );
  assertBounds(next);
  return next;
}
export function togglePageSelection(
  state: BarcodeSelectionState,
  rows: readonly BarcodeSelectableRow[],
  selected: boolean,
): Map<string, BarcodeSelection> {
  const next = new Map(state);
  for (const row of rows) {
    if (selected)
      next.set(
        row.variantId,
        Object.freeze({
          variantId: row.variantId,
          variantVersion: row.variantVersion,
          quantity: next.get(row.variantId)?.quantity ?? 1,
        }),
      );
    else next.delete(row.variantId);
  }
  assertBounds(next);
  return next;
}
export function hiddenSelectionCount(
  rows: readonly BarcodeFilterableRow[],
  filter: BarcodeSelectionFilter,
): number {
  return rows.filter((row) => !selectionMatchesFilter(row, filter)).length;
}
export function selectionMatchesFilter(
  row: BarcodeFilterableRow,
  filter: BarcodeSelectionFilter,
): boolean {
  const query = filter.q?.trim().toLocaleLowerCase("tr-TR");
  if (
    query &&
    ![row.productTitle, row.variantTitle, row.sku ?? "", row.barcode ?? ""]
      .some((value) => value.toLocaleLowerCase("tr-TR").includes(query))
  )
    return false;
  if (filter.status && row.status !== filter.status) return false;
  if (filter.productId && row.productId !== filter.productId) return false;
  if (filter.categoryId && row.category?.id !== filter.categoryId) return false;
  if (filter.brandId && row.brand?.id !== filter.brandId) return false;
  if (filter.hasBarcode === "true" && row.barcode === undefined) return false;
  if (filter.hasBarcode === "false" && row.barcode !== undefined) return false;
  if (
    filter.stockState === "in_stock" &&
    (!row.trackInventory || row.stock <= 0)
  )
    return false;
  if (
    filter.stockState === "out_of_stock" &&
    (!row.trackInventory || row.stock !== 0)
  )
    return false;
  if (filter.stockState === "not_tracked" && row.trackInventory) return false;
  return true;
}
export function applyQuantityMode(
  state: BarcodeSelectionState,
  rows: readonly BarcodeSelectableRow[],
  mode: Readonly<
    { kind: "one" } | { kind: "all"; quantity: number } | { kind: "stock" }
  >,
): Readonly<{
  selection: Map<string, BarcodeSelection>;
  untracked: readonly string[];
}> {
  const byId = new Map(rows.map((row) => [row.variantId, row]));
  const next = new Map<string, BarcodeSelection>();
  const untracked: string[] = [];
  for (const selected of state.values()) {
    const row = byId.get(selected.variantId);
    let value = selected.quantity;
    if (mode.kind === "one") value = 1;
    else if (mode.kind === "all") value = quantity(mode.quantity);
    else if (row?.trackInventory) value = quantity(row.stock);
    else {
      value = 0;
      untracked.push(selected.variantId);
    }
    next.set(
      selected.variantId,
      Object.freeze({ ...selected, quantity: value }),
    );
  }
  assertBounds(next);
  return Object.freeze({
    selection: next,
    untracked: Object.freeze(untracked),
  });
}
