import assert from "node:assert/strict";
import test from "node:test";
import { PostgresPublicStorefrontRepository, PublicStorefrontRepositoryError } from "./index.ts";
import type { PostgresPoolLike } from "../postgres/pool.ts";

const STORE_ID = "10000000-0000-4000-8000-000000000001";
const HOSTNAME = "pilot.saas-staging.celebix.site";
const storefront = { schemaVersion: 2, id: STORE_ID, name: "Pilot Store", slug: "pilot-store", hostname: HOSTNAME, primaryHostname: HOSTNAME, canonicalUrl: `https://${HOSTNAME}/`, currency: "TRY", locale: "tr", themeKey: "starter", presentation: { schemaVersion: 1, displayName: "Pilot Store", theme: { colorScheme: "neutral", headingStyle: "serif", productCardStyle: "editorial", productImageRatio: "portrait", homeProductLimit: 8, showBrandStory: true }, hero: { enabled: true, headline: "Pilot Store", body: "Özenle seçilmiş ürünleri keşfedin.", destination: "/products" }, seo: { allowIndex: false } } } as const;
const CATEGORY_ID = "20000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "30000000-0000-4000-8000-000000000001";
const VARIANT_ID = "40000000-0000-4000-8000-000000000001";
const product = { id: PRODUCT_ID, slug: "altin-bileklik", title: "Altın Bileklik", currency: "TRY", status: "active", priceCents: 10_000, available: true, variants: [{ id: VARIANT_ID, title: "Standart", priceCents: 10_000, stockTracking: true, stockQuantity: 2, available: true, attributes: {} }], media: [] };

function repository(outcome = "found", resultPayload: unknown = storefront) {
  const queries: string[] = [];
  const client = { async query(text: string) { queries.push(text); return text.startsWith("SELECT outcome") ? { rows: [{ outcome, result_payload: resultPayload }], rowCount: 1 } : { rows: [], rowCount: 0 }; }, release() {} };
  const pool = { async connect() { return client; } } as unknown as PostgresPoolLike;
  return { queries, value: new PostgresPublicStorefrontRepository({ pool, role: "celebix_saas_host_resolver", timeouts: { poolCheckoutMs: 100, statementMs: 100, lockMs: 100, idleTransactionMs: 100 } }) };
}

test("public storefront repository selects exact host through the narrow resolver role", async () => {
  const fixture = repository();
  const selected = await fixture.value.getPublicStorefront({ hostname: HOSTNAME, now: new Date("2026-07-18T10:00:00.000Z") });
  assert.equal(selected.id, STORE_ID);
  assert.equal(fixture.queries.includes("SET LOCAL ROLE celebix_saas_host_resolver"), true);
  assert.equal(fixture.queries.some((query) => query.includes("resolve_public_storefront")), true);
});

test("public storefront repository maps unknown host to a finite not-found result", async () => {
  const fixture = repository("not_found", null);
  await assert.rejects(fixture.value.getPublicStorefront({ hostname: "unknown.saas-staging.celebix.site", now: new Date() }), (error) => error instanceof PublicStorefrontRepositoryError && error.code === "not_found");
});

test("public storefront repository reads one canonical category through the host resolver", async () => {
  const fixture = repository("found", { category: { id: CATEGORY_ID, name: "Bileklikler", slug: "bileklikler" }, items: [product] });
  const selected = await fixture.value.listPublicProductsByCategory({ storefront, now: new Date("2026-07-30T12:00:00.000Z"), slug: "bileklikler", limit: 48 });
  assert.deepEqual(selected.category, { id: CATEGORY_ID, name: "Bileklikler", slug: "bileklikler" });
  assert.deepEqual(selected.items, [product]);
  assert.equal(Object.isFrozen(selected), true);
  assert.equal(fixture.queries.some((query) => query.includes("public_list_products_by_category")), true);
});

test("public category reads reject hostile inputs and projections", async () => {
  const fixture = repository("found", { category: { id: CATEGORY_ID, name: "Bileklikler", slug: "bileklikler", storeId: STORE_ID }, items: [product] });
  await assert.rejects(fixture.value.listPublicProductsByCategory({ storefront, now: new Date(), slug: "../bileklikler", limit: 48 }), (error) => error instanceof PublicStorefrontRepositoryError && error.code === "invalid_input");
  await assert.rejects(fixture.value.listPublicProductsByCategory({ storefront, now: new Date(), slug: "bileklikler", limit: 48 }), (error) => error instanceof PublicStorefrontRepositoryError && error.code === "unavailable");
});
