import assert from "node:assert/strict";
import test from "node:test";
import { productStockPresentation } from "./stock-presentation.ts";

test("product stock display and CSV use active aggregate without replacing raw representative stock", () => {
  const variant = { stockTracking: true, stockQuantity: 1 };
  for (const [productStock, expected] of [
    [{ trackedVariantCount: 3, untrackedVariantCount: 0, trackedQuantity: 3 }, { label: "3 adet", className: "product-stock-low", csvValue: "3" }],
    [{ trackedVariantCount: 3, untrackedVariantCount: 0, trackedQuantity: 2 }, { label: "2 adet", className: "product-stock-low", csvValue: "2" }],
    [{ trackedVariantCount: 2, untrackedVariantCount: 0, trackedQuantity: 14 }, { label: "14 adet", className: "product-stock", csvValue: "14" }],
    [{ trackedVariantCount: 2, untrackedVariantCount: 0, trackedQuantity: 0 }, { label: "0 adet", className: "product-stock-out", csvValue: "0" }],
    [{ trackedVariantCount: 1, untrackedVariantCount: 1, trackedQuantity: 0 }, { label: "0 adet + takipsiz", className: "product-stock", csvValue: "0 adet + takipsiz" }],
    [{ trackedVariantCount: 1, untrackedVariantCount: 1, trackedQuantity: 2 }, { label: "2 adet + takipsiz", className: "product-stock", csvValue: "2 adet + takipsiz" }],
    [{ trackedVariantCount: 0, untrackedVariantCount: 1, trackedQuantity: 0 }, { label: "Takipsiz", className: "product-stock", csvValue: "Takipsiz" }],
    [{ trackedVariantCount: 0, untrackedVariantCount: 0, trackedQuantity: 0 }, { label: "—", className: "product-stock", csvValue: "" }],
  ] as const) {
    assert.deepEqual(productStockPresentation({ ...variant, productStock }), expected);
    assert.equal(variant.stockQuantity, 1);
  }
});

test("legacy stock summaries keep their existing label class and numeric CSV fallback", () => {
  assert.deepEqual(productStockPresentation(undefined), { label: "—", className: "product-stock", csvValue: "" });
  assert.deepEqual(productStockPresentation({ stockTracking: false, stockQuantity: 12 }), { label: "Takipsiz", className: "product-stock", csvValue: "12" });
  assert.deepEqual(productStockPresentation({ stockTracking: true, stockQuantity: 0 }), { label: "0 adet", className: "product-stock-out", csvValue: "0" });
});
