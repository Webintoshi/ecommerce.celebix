import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";
import { MerchantAdminRepositoryError, PostgresMerchantAdminRepository, merchantAdminConfig } from "./index.ts";
import { merchantAdminKind } from "./validation.ts";

const STORE = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP = "55555555-5555-4555-8555-555555555555";
const PLAN = "66666666-6666-4666-8666-666666666666";
const RECORD = "71000000-0000-4000-8000-000000000001";
const CATEGORY = "81000000-0000-4000-8000-000000000001";
const CATEGORY_TWO = "81000000-0000-4000-8000-000000000002";
const ASSET = "82000000-0000-4000-8000-000000000001";
const PRODUCT = "83000000-0000-4000-8000-000000000001";
const OPERATION = "72000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-01T09:00:00.000Z");

function composition() {
  return {
    schemaVersion: 1,
    visual: { colorScheme: "neutral", headingStyle: "serif", cornerStyle: "soft", headerStyle: "overlay", productCardStyle: "editorial", productImageRatio: "portrait" },
    announcement: { enabled: true, items: ["Güvenli alışveriş"], destination: "/pages/odeme-teslimat" },
    navigation: { rootCategoryIds: [CATEGORY], featuredCategoryId: CATEGORY, featuredAssetId: ASSET },
    sections: [
      { kind: "hero", enabled: true, slides: [{ eyebrow: "Yeni sezon", heading: "Zamansız seçkiler", body: "Yeni ürünleri keşfedin.", desktopAssetId: ASSET, destination: "/products", productId: PRODUCT }] },
      { kind: "category_grid", enabled: true, heading: "Kategoriler", categoryIds: [CATEGORY] },
      { kind: "product_row", enabled: true, heading: "Yeni ürünler", source: "latest", limit: 8 },
      { kind: "split_campaign", enabled: true, panels: [{ heading: "Takılar", assetId: ASSET, destination: "/categories/takilar" }] },
      { kind: "brand_story", enabled: true, eyebrow: "Hikâyemiz", heading: "Özenle seçildi", body: "Kalıcı tasarımlar.", assetId: ASSET, destination: "/pages/hakkimizda" },
    ],
    productDetail: { galleryStyle: "grid", showSku: true, showBrand: true, showRelatedProducts: true, mobileStickyPurchase: true },
    cart: { showCheckoutReadiness: true, showShippingProgress: true, trustMessage: "Güvenli ödeme" },
  };
}

function invalidInput(error: unknown) {
  return error instanceof MerchantAdminRepositoryError && error.code === "invalid_input";
}

test("starter theme composition is a finite merchant-admin record kind", () => {
  assert.equal(merchantAdminKind("starter_theme_composition"), "starter_theme_composition");
});

test("starter theme composition accepts the exact bounded contract", () => {
  const parsed = merchantAdminConfig("starter_theme_composition" as never, composition());
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(JSON.stringify(parsed).includes("https://"), false);
});

test("starter theme composition rejects unknown and secret-bearing root fields", () => {
  assert.throws(() => merchantAdminConfig("starter_theme_composition" as never, { ...composition(), tenantId: STORE }), invalidInput);
  assert.throws(() => merchantAdminConfig("starter_theme_composition" as never, { ...composition(), apiSecret: "never" }), invalidInput);
});

test("starter theme composition rejects malformed and duplicate category references", () => {
  const value = composition();
  assert.throws(() => merchantAdminConfig("starter_theme_composition" as never, { ...value, navigation: { rootCategoryIds: ["not-a-uuid"] } }), invalidInput);
  assert.throws(() => merchantAdminConfig("starter_theme_composition" as never, { ...value, navigation: { rootCategoryIds: [CATEGORY, CATEGORY] } }), invalidInput);
});

test("starter theme composition requires featured category and asset as one pair", () => {
  const value = composition();
  assert.throws(() => merchantAdminConfig("starter_theme_composition" as never, { ...value, navigation: { rootCategoryIds: [CATEGORY], featuredCategoryId: CATEGORY } }), invalidInput);
  assert.throws(() => merchantAdminConfig("starter_theme_composition" as never, { ...value, navigation: { rootCategoryIds: [CATEGORY], featuredAssetId: ASSET } }), invalidInput);
});

test("starter theme composition rejects duplicate singleton sections", () => {
  const value = composition();
  assert.throws(() => merchantAdminConfig("starter_theme_composition" as never, { ...value, sections: [...value.sections, value.sections[0]] }), invalidInput);
});

test("starter theme composition keeps category product rows reference-exact", () => {
  const value = composition();
  assert.doesNotThrow(() => merchantAdminConfig("starter_theme_composition" as never, { ...value, sections: [{ kind: "product_row", enabled: true, heading: "Takılar", source: "category", categoryId: CATEGORY_TWO, limit: 4 }] }));
  assert.throws(() => merchantAdminConfig("starter_theme_composition" as never, { ...value, sections: [{ kind: "product_row", enabled: true, heading: "Takılar", source: "category", limit: 4 }] }), invalidInput);
});

test("starter theme composition rejects unsafe destinations and invented visual modes", () => {
  const value = composition();
  assert.throws(() => merchantAdminConfig("starter_theme_composition" as never, { ...value, announcement: { enabled: true, items: ["Duyuru"], destination: "https://evil.test" } }), invalidInput);
  assert.throws(() => merchantAdminConfig("starter_theme_composition" as never, { ...value, visual: { ...value.visual, headerStyle: "custom" } }), invalidInput);
});

test("starter theme composition rejects accessors without invoking them", () => {
  let invoked = false;
  const value = composition();
  Object.defineProperty(value, "navigation", { enumerable: true, get() { invoked = true; return {}; } });
  assert.throws(() => merchantAdminConfig("starter_theme_composition" as never, value), invalidInput);
  assert.equal(invoked, false);
});

test("repository sends the canonical composition through the generic versioned save authority", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const client = {
    async query(text: string, values: unknown[] = []) {
      calls.push({ text, values });
      const rows = text.includes("saas.merchant_admin_save") ? [{ outcome: "saved", result_payload: { id: RECORD, kind: "starter_theme_composition", status: "draft", version: 1, updatedAt: NOW.toISOString() } }] : [];
      return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
    },
    release() {},
  };
  const repository = new PostgresMerchantAdminRepository({
    pool: { async connect() { return client; } },
    role: "celebix_saas_app",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    uuid: () => RECORD,
    audit() {},
  });
  const tenantContext = { schemaVersion: 1, requestId: "private", principal: { id: PRINCIPAL, issuer: "https://id.test/oidc", subject: "private" }, store: { id: STORE, slug: "store", status: "active" }, membership: { id: MEMBERSHIP, role: "store_owner", status: "active" }, entitlements: { schemaVersion: 1, planId: PLAN, planCode: "growth", version: 2, status: "active", features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 1024 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" } as TenantContext;
  const saved = await repository.save({ tenantContext, now: NOW, operationId: OPERATION, kind: "starter_theme_composition", name: "Starter", config: composition() as never, status: "draft" });
  assert.equal(saved.kind, "starter_theme_composition");
  const write = calls.find((call) => call.text.includes("saas.merchant_admin_save"));
  assert.ok(write);
  assert.equal(write.values[11], "starter_theme_composition");
  assert.deepEqual(JSON.parse(write.values[13] as string), composition());
});
