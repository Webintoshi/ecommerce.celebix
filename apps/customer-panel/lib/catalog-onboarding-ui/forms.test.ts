import assert from "node:assert/strict";
import test from "node:test";

import { buildAdvancedCreateIntent, buildQuickCreateIntent, parseTurkishMoneyToCents } from "./forms.ts";

const CATEGORY = "11111111-1111-4111-8111-111111111111";

test("quick form needs only name and Turkish sale price", () => {
  assert.deepEqual(buildQuickCreateIntent({ title: "Kupa", price: "129,90", publish: true }), {
    ok: true,
    value: { kind: "quick", title: "Kupa", priceCents: 12990, publish: true },
  });
  assert.deepEqual(buildQuickCreateIntent({ title: " Kupa ", price: "1.299,90", publish: false, stockQuantity: "4", categoryId: CATEGORY }), {
    ok: true,
    value: { kind: "quick", title: "Kupa", priceCents: 129990, publish: false, stockQuantity: 4, categoryId: CATEGORY },
  });
});

test("money and quick fields fail closed without inventing values", () => {
  assert.equal(parseTurkishMoneyToCents("1.299,90"), 129990);
  for (const price of ["", "12.34", "1,234", "-1", "1 299,90", "₺20", "NaN"]) {
    assert.equal(parseTurkishMoneyToCents(price), null);
  }
  assert.equal(buildQuickCreateIntent({ title: "", price: "10,00", publish: true }).ok, false);
  assert.equal(buildQuickCreateIntent({ title: "Kupa", price: "10,00", publish: true, stockQuantity: "-1" }).ok, false);
  assert.equal(buildQuickCreateIntent({ title: "Kupa", price: "10,00", publish: true, storeId: CATEGORY } as never).ok, false);
});

test("advanced builder delegates to the exact contract and rejects duplicate authority", () => {
  const value = {
    kind: "advanced" as const,
    productType: "physical" as const,
    title: "Varyantlı kupa",
    publish: false,
    variants: [{ title: "Beyaz", priceCents: 12000, stockTracking: true, stockQuantity: 2, attributes: { Renk: "Beyaz" }, continueSellingWhenOutOfStock: false, inventory: [] }],
    categoryIds: [CATEGORY],
    resourceIds: { collections: [], tags: [], attributes: [], extras: [], definitions: [] },
    channelIds: [],
    profile: { minimumPurchaseQuantity: 1 },
  };
  assert.deepEqual(buildAdvancedCreateIntent(value), { ok: true, value });
  assert.equal(buildAdvancedCreateIntent({ ...value, categoryIds: [CATEGORY, CATEGORY] }).ok, false);
  assert.equal(buildAdvancedCreateIntent({ ...value, tenantId: CATEGORY } as never).ok, false);
});
