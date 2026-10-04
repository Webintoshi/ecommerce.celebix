import assert from "node:assert/strict";
import test from "node:test";
import type { InventoryVariantChoice } from "./inventory-ui/form-choices.ts";

const money = await import("./inventory-ui/money.ts").catch(() => ({} as Record<string, unknown>));
const choices = await import("./inventory-ui/form-presentation.ts").catch(() => ({} as Record<string, unknown>));

test("purchase cost accepts Turkish and dot decimal lira without rounding cents", () => {
  assert.equal(typeof money.parseInventoryMoneyToCents, "function");
  const parse = money.parseInventoryMoneyToCents as (value: string) => number;
  for (const value of ["14,89", "14.89"]) assert.equal(parse(value), 1489);
  assert.equal(parse("0"), 0);
  assert.equal(parse("14,8"), 1480);
  assert.equal(parse("80000000,00"), 8_000_000_000);
  for (const value of ["", "1,234", "1.234,56", "-1", "1e3", " 1", "01,00", "80000000,01"]) {
    assert.throws(() => parse(value), /inventory_money_invalid/, value);
  }
  const format = money.formatInventoryMoneyInput as (value: number) => string;
  assert.equal(format(1489), "14,89");
});

test("variant search bounds dropdowns and retains each selected variant outside matches", () => {
  assert.equal(typeof choices.inventoryVariantOptions, "function");
  const filter = choices.inventoryVariantOptions as (variants: readonly InventoryVariantChoice[], query: string, selected: string) => readonly InventoryVariantChoice[];
  const variants = Array.from({ length: 5000 }, (_, index) => ({ variantId: String(index), productId: "product", productTitle: index === 4999 ? "İnce bilezik" : "Yüzük", variantTitle: "Altın", sku: `SKU-${index}` }));
  const defaults = filter(variants, "", "4999");
  assert.ok(defaults.length <= 51);
  assert.ok(defaults.some(variant => variant.variantId === "4999"));
  const matching = filter(variants, "ince SKU-4999", "7");
  assert.deepEqual(matching.map(variant => variant.variantId), ["7", "4999"]);
  assert.equal(filter(variants, "bulunmuyor", "").length, 0);
});
