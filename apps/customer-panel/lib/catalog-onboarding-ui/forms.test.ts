import assert from "node:assert/strict";
import test from "node:test";

import { buildAdvancedCreateIntent, buildQuickCreateIntent, parseTurkishMoneyToCents } from "./forms.ts";

test("quick create keeps an optional complete SKU", () => {
  assert.deepEqual(buildQuickCreateIntent({ title: "Kupa", price: "100,00", publish: false, sku: "RSA-001" }), {
    ok: true, value: { kind: "quick", title: "Kupa", priceCents: 10000, publish: false, sku: "RSA-001" },
  });
  assert.equal(buildQuickCreateIntent({ title: "Kupa", price: "100,00", publish: false, sku: "" }).ok, true);
});

const CATEGORY = "11111111-1111-4111-8111-111111111111";
const CHANNEL = "22222222-2222-4222-8222-222222222222";

test("quick measurement input saves directly, and barcode create retains it without requiring other optional fields", () => {
  const input = { title: "Bilezik", price: "100,00", publish: false, measurements: { weight: "14.89", area: "0,25" } };
  const measurements = { weight: { valueMilli: 14890, unit: "g" }, area: { valueMilli: 250, unit: "m2" } };
  const quick = buildQuickCreateIntent(input);
  assert.equal(quick.ok, true);
  if (quick.ok) assert.deepEqual(quick.value, { kind: "quick", title: "Bilezik", priceCents: 10000, publish: false, measurements });
  const barcode = buildQuickCreateIntent({ ...input, barcode: "9800000000007", channelIds: [] });
  assert.equal(barcode.ok, true);
  if (barcode.ok && barcode.value.kind === "advanced") assert.deepEqual(barcode.value.variants[0]?.measurements, measurements);
  const blank = buildQuickCreateIntent({ ...input, measurements: { weight: "" } });
  assert.equal(blank.ok, true);
  if (blank.ok) assert.equal(Object.hasOwn(blank.value, "measurements"), false);
  assert.equal(buildQuickCreateIntent({ ...input, measurements: { packageCount: "1,5" } }).ok, false);
});

test("quick barcode uses an atomic advanced create while retaining the selected sales channel", () => {
  assert.deepEqual(buildQuickCreateIntent({
    title: " Kupa ", price: "129,90", stockQuantity: "4", sku: "RSA-001",
    barcode: "9800000000007", categoryId: CATEGORY, channelIds: [CHANNEL], publish: true,
  }), {
    ok: true,
    value: {
      kind: "advanced", productType: "physical", title: "Kupa", publish: true,
      variants: [{
        title: "Standart", sku: "RSA-001", barcode: "9800000000007", priceCents: 12990,
        stockTracking: true, stockQuantity: 4, attributes: {},
        continueSellingWhenOutOfStock: false, inventory: [],
      }],
      categoryIds: [CATEGORY],
      resourceIds: { collections: [], tags: [], attributes: [], extras: [], definitions: [] },
      channelIds: [CHANNEL], profile: { minimumPurchaseQuantity: 1 },
    },
  });
});

test("barcode drafts allow an explicit empty channel selection and manual codes", () => {
  const result = buildQuickCreateIntent({ title: "Kupa", price: "0", barcode: " MANUAL-001 ", channelIds: [], publish: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.kind, "advanced");
  if (result.value.kind !== "advanced") return;
  assert.equal(result.value.variants[0]?.barcode, "MANUAL-001");
  assert.equal(result.value.variants[0]?.stockQuantity, 0);
  assert.deepEqual(result.value.categoryIds, []);
  assert.deepEqual(result.value.channelIds, []);
});

test("quick barcode never drops missing channels, malformed identifiers or publishing category", () => {
  const input = { title: "Kupa", price: "129,90", publish: false, barcode: "9800000000007" };
  assert.deepEqual(buildQuickCreateIntent(input), { ok: false, error: "Ürün satış kanalları yüklenemedi." });
  for (const barcode of ["bad\ncode", "a".repeat(129), 123 as never]) {
    assert.equal(buildQuickCreateIntent({ ...input, barcode, channelIds: [] }).ok, false);
  }
  for (const channelIds of [["not-a-uuid"], [CHANNEL, CHANNEL], "invalid" as never]) {
    assert.equal(buildQuickCreateIntent({ ...input, channelIds }).ok, false);
  }
  assert.deepEqual(buildQuickCreateIntent({ ...input, channelIds: [CHANNEL], publish: true }), {
    ok: false, error: "Satışa açmadan önce kategori seçin.",
  });
});

test("empty optional barcode retains the original lightweight quick-create contract", () => {
  assert.deepEqual(buildQuickCreateIntent({ title: "Kupa", price: "129,90", barcode: " ", channelIds: [CHANNEL], publish: false }), {
    ok: true, value: { kind: "quick", title: "Kupa", priceCents: 12990, publish: false },
  });
});

test("quick form keeps drafts lightweight and requires category before publishing", () => {
  assert.deepEqual(buildQuickCreateIntent({ title: "Kupa", price: "129,90", publish: false }), {
    ok: true,
    value: { kind: "quick", title: "Kupa", priceCents: 12990, publish: false },
  });
  assert.deepEqual(buildQuickCreateIntent({ title: "Kupa", price: "129,90", publish: true }), {
    ok: false,
    error: "Satışa açmadan önce kategori seçin.",
  });
  assert.deepEqual(buildQuickCreateIntent({ title: " Kupa ", price: "1.299,90", publish: false, stockQuantity: "4", categoryId: CATEGORY }), {
    ok: true,
    value: { kind: "quick", title: "Kupa", priceCents: 129990, publish: false, stockQuantity: 4, categoryId: CATEGORY },
  });
  assert.deepEqual(buildQuickCreateIntent({ title: " Kupa ", price: "1.299,90", publish: true, stockQuantity: "4", categoryId: CATEGORY }), {
    ok: true,
    value: { kind: "quick", title: "Kupa", priceCents: 129990, publish: true, stockQuantity: 4, categoryId: CATEGORY },
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
