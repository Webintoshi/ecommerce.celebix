import assert from "node:assert/strict";
import test from "node:test";
import {
  applyQuantityMode,
  hiddenSelectionCount,
  selectionMatchesFilter,
  togglePageSelection,
  upsertSelection,
} from "./selection.ts";

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n: number, stock: number, trackInventory = true) => ({
  variantId: id(n),
  variantVersion: 1,
  stock,
  trackInventory,
});
test("single page and cross-page selection keep only safe versioned quantities", () => {
  let state = new Map();
  state = upsertSelection(state, row(1, 3), 1);
  state = togglePageSelection(state, [row(2, 0), row(3, 5)], true);
  assert.deepEqual(
    [...state.values()],
    [
      [id(1), 1, 1],
      [id(2), 1, 1],
      [id(3), 1, 1],
    ].map(([variantId, variantVersion, quantity]) => ({
      variantId,
      variantVersion,
      quantity,
    })),
  );
  const selectedRows = [
    { ...row(1, 3), productId: id(10), productTitle: "Altın", variantTitle: "M", sku: "A-1", barcode: "CODE-1", status: "active" },
    { ...row(2, 0), productId: id(11), productTitle: "Gümüş", variantTitle: "L", status: "draft" },
    { ...row(3, 5), productId: id(12), productTitle: "Bronz", variantTitle: "S", status: "active" },
  ];
  assert.equal(hiddenSelectionCount(selectedRows, { status: "active" }), 1);
  assert.equal(selectionMatchesFilter(selectedRows[0]!, { q: "A-1" }), true);
  assert.equal(
    hiddenSelectionCount(selectedRows, { status: "" }),
    0,
    "cross-page absence must not mean filter exclusion",
  );
});
test("quantity modes reject fractions negatives and explain untracked stock", () => {
  const selected = new Map([
    [id(1), { variantId: id(1), variantVersion: 1, quantity: 1 }],
    [id(2), { variantId: id(2), variantVersion: 1, quantity: 1 }],
  ]);
  assert.throws(() =>
    applyQuantityMode(selected, [row(1, 3), row(2, 4)], {
      kind: "all",
      quantity: -1,
    }),
  );
  assert.throws(() =>
    applyQuantityMode(selected, [row(1, 3), row(2, 4)], {
      kind: "all",
      quantity: 1.5,
    }),
  );
  const result = applyQuantityMode(selected, [row(1, 3), row(2, 4, false)], {
    kind: "stock",
  });
  assert.equal(result.selection.get(id(1))?.quantity, 3);
  assert.equal(result.selection.get(id(2))?.quantity, 0);
  assert.deepEqual(result.untracked, [id(2)]);
});

test("selection fails closed above 500 variants or 5000 labels", () => {
  const fiveHundred = new Map(
    Array.from({ length: 500 }, (_, index) => {
      const selected = row(index + 1, 1);
      return [
        selected.variantId,
        { ...selected, quantity: 1 },
      ] as const;
    }),
  );
  assert.throws(
    () => upsertSelection(fiveHundred, row(501, 1), 1),
    /barcode_selection_limit/,
  );
  assert.throws(
    () => upsertSelection(new Map(), row(1, 1), 5001),
    /barcode_label_limit/,
  );
  assert.equal(fiveHundred.size, 500);
});
