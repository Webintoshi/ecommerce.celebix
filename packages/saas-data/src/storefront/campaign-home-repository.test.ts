import assert from "node:assert/strict";
import test from "node:test";

import { PostgresPublicStorefrontRepository, PublicStorefrontRepositoryError } from "./index.ts";
import type { PostgresPoolLike } from "../postgres/pool.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const HOST = "pilot.saas-staging.celebix.site";
const PRODUCT = "30000000-0000-4000-8000-000000000001";
const VARIANT = "40000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-01T09:00:00.000Z");

const presentation = {
  schemaVersion: 2,
  displayName: "Pilot Store",
  theme: { colorScheme: "neutral", headingStyle: "serif", productCardStyle: "editorial", productImageRatio: "portrait", homeProductLimit: 8, showBrandStory: true },
  hero: { enabled: true, headline: "Zamansız seçkiler", body: "Yeni ürünleri keşfedin.", destination: "/products" },
  visual: { colorScheme: "neutral", headingStyle: "serif", cornerStyle: "soft", headerStyle: "overlay", productCardStyle: "editorial", productImageRatio: "portrait" },
  navigation: { items: [] },
  sections: [{ kind: "product_row", key: "latest-0", heading: "Yeni ürünler", source: "latest", limit: 8 }],
  productDetail: { galleryStyle: "grid", showSku: true, showBrand: true, showRelatedProducts: true, mobileStickyPurchase: true },
  cart: { showCheckoutReadiness: true, showShippingProgress: true, trustMessage: "Güvenli ödeme" },
  seo: { allowIndex: false },
} as const;
const storefront = { schemaVersion: 2, id: STORE, name: "Pilot Store", slug: "pilot-store", hostname: HOST, primaryHostname: HOST, canonicalUrl: `https://${HOST}/`, currency: "TRY", locale: "tr", themeKey: "starter", presentation } as const;
const product = { id: PRODUCT, slug: "altin-bileklik", title: "Altın Bileklik", currency: "TRY", status: "active", priceCents: 10_000, available: true, variants: [{ id: VARIANT, title: "Standart", priceCents: 10_000, stockTracking: true, stockQuantity: 2, available: true, attributes: {} }], media: [] } as const;

function fixture(resultPayload: unknown = { presentation, productRows: [{ key: "latest-0", items: [product] }] }, outcome = "found") {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  let checkouts = 0;
  const client = {
    async query(text: string, values: unknown[] = []) {
      calls.push({ text, values });
      const rows = text.includes("saas.public_starter_retail_home") ? [{ outcome, result_payload: resultPayload }] : text.includes("saas.public_storefront_related_products") ? [{ outcome: "found", result_payload: [product] }] : [];
      return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
    },
    release() {},
  };
  const pool = { async connect() { checkouts += 1; return client; } } as unknown as PostgresPoolLike;
  return { calls, checkoutCount: () => checkouts, repository: new PostgresPublicStorefrontRepository({ pool, role: "celebix_saas_host_resolver", timeouts: { poolCheckoutMs: 100, statementMs: 100, lockMs: 100, idleTransactionMs: 100 } }) };
}

function unavailable(error: unknown) { return error instanceof PublicStorefrontRepositoryError && error.code === "unavailable"; }
function invalidInput(error: unknown) { return error instanceof PublicStorefrontRepositoryError && error.code === "invalid_input"; }

test("campaign home uses one exact host-resolver SQL boundary", async () => {
  const selected = fixture();
  const result = await selected.repository.resolveCampaignHome({ storefront, now: NOW });
  assert.equal(result.presentation.schemaVersion, 2);
  const call = selected.calls.find((entry) => entry.text.includes("saas.public_starter_retail_home"));
  assert.ok(call);
  assert.deepEqual(call.values, [STORE, HOST, NOW]);
  assert.equal(selected.calls.filter((entry) => entry.text.includes("saas.public_starter_retail_home")).length, 1);
  const related = await selected.repository.listRelatedPublicProducts({ storefront, now: NOW, productSlug: "altin-bileklik", limit: 4 });
  assert.equal(related.items[0]?.slug, "altin-bileklik");
  const relatedCall = selected.calls.find((entry) => entry.text.includes("saas.public_storefront_related_products"));
  assert.deepEqual(relatedCall?.values, [STORE, HOST, NOW, "altin-bileklik", 4]);
});

test("campaign home never accepts a browser store selector", async () => {
  const selected = fixture();
  await assert.rejects(selected.repository.resolveCampaignHome({ storefront, now: NOW, storeId: "20000000-0000-4000-8000-000000000001" } as never), invalidInput);
  assert.equal(selected.checkoutCount(), 0);
});

test("campaign home projection is deeply immutable", async () => {
  const result = await fixture().repository.resolveCampaignHome({ storefront, now: NOW });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.presentation), true);
  assert.equal(Object.isFrozen(result.productRows), true);
  assert.equal(Object.isFrozen(result.productRows[0]?.items), true);
});

test("campaign home requires the schema-v2 active composition", async () => {
  const legacy = { ...presentation, schemaVersion: 1 };
  await assert.rejects(fixture({ presentation: legacy, productRows: [] }).repository.resolveCampaignHome({ storefront, now: NOW }), unavailable);
});

test("campaign home requires unique row keys that exist in the presentation", async () => {
  const rows = [{ key: "latest-0", items: [product] }, { key: "latest-0", items: [] }];
  await assert.rejects(fixture({ presentation, productRows: rows }).repository.resolveCampaignHome({ storefront, now: NOW }), unavailable);
  await assert.rejects(fixture({ presentation, productRows: [{ key: "sale-9", items: [] }] }).repository.resolveCampaignHome({ storefront, now: NOW }), unavailable);
});

test("campaign home rejects private or cross-store projection fields", async () => {
  await assert.rejects(fixture({ presentation, productRows: [{ key: "latest-0", items: [product], storeId: STORE }] }).repository.resolveCampaignHome({ storefront, now: NOW }), unavailable);
  await assert.rejects(fixture({ presentation: { ...presentation, storeId: STORE }, productRows: [] }).repository.resolveCampaignHome({ storefront, now: NOW }), unavailable);
});

test("campaign home bounds each product row to its declared limit", async () => {
  const items = Array.from({ length: 9 }, () => product);
  await assert.rejects(fixture({ presentation, productRows: [{ key: "latest-0", items }] }).repository.resolveCampaignHome({ storefront, now: NOW }), unavailable);
});

test("campaign home rejects malformed product projections", async () => {
  await assert.rejects(fixture({ presentation, productRows: [{ key: "latest-0", items: [{ ...product, currency: "USD" }] }] }).repository.resolveCampaignHome({ storefront, now: NOW }), unavailable);
  await assert.rejects(fixture({ presentation, productRows: [{ key: "latest-0", items: [{ ...product, storeId: STORE }] }] }).repository.resolveCampaignHome({ storefront, now: NOW }), unavailable);
});

test("campaign home maps controlled not-found without returning a partial view", async () => {
  await assert.rejects(fixture(null, "not_found").repository.resolveCampaignHome({ storefront, now: NOW }), (error) => error instanceof PublicStorefrontRepositoryError && error.code === "not_found");
});

test("campaign home rejects hostname drift and malformed dates before SQL", async () => {
  const selected = fixture();
  await assert.rejects(selected.repository.resolveCampaignHome({ storefront: { ...storefront, hostname: "other.saas-staging.celebix.site" } as never, now: NOW }), invalidInput);
  await assert.rejects(selected.repository.resolveCampaignHome({ storefront, now: new Date("invalid") }), invalidInput);
  assert.equal(selected.checkoutCount(), 0);
});
