import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultStarterThemeComposition, type MerchantAdminRecord, type PublicProduct, type StarterThemeCompositionConfigV3, type StorefrontDesignWorkspace, type TenantContext } from "@celebix/saas-contracts";
import type { MerchantAdminRepository, PublicStorefrontRepository, StorefrontAssetRepository } from "@celebix/saas-data";

import { createServerStorefrontDesignPreviewLoader, StorefrontDesignPreviewLoaderError } from "./loader-core.ts";
import { composeDraftCampaignProjection } from "../storefront-design-preview-model.ts";

const STORE = "41000000-0000-4000-8000-000000000001";
const PRINCIPAL = "41000000-0000-4000-8000-000000000002";
const MEMBERSHIP = "41000000-0000-4000-8000-000000000003";
const PLAN = "41000000-0000-4000-8000-000000000004";
const DOMAIN = "41000000-0000-4000-8000-000000000005";
const CATEGORY = "41000000-0000-4000-8000-000000000006";
const CATEGORY_B = "41000000-0000-4000-8000-000000000011";
const ASSET = "41000000-0000-4000-8000-000000000007";
const CATEGORY_ASSET = "41000000-0000-4000-8000-000000000009";
const CATEGORY_ASSET_B = "41000000-0000-4000-8000-000000000012";
const HOST = "atlas.saas-staging.celebix.site";
const NOW = new Date("2026-09-15T09:00:00.000Z");

function tenant(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "41000000-0000-4000-8000-000000000008",
    principal: { id: PRINCIPAL, issuer: "https://identity.test", subject: "atlas" },
    store: { id: STORE, slug: "atlas", status: "active" },
    membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: { schemaVersion: 1, planId: PLAN, planCode: "growth", version: 1, status: "active", features: ["catalog", "media"], limits: { products: 100, staff: 5, storageBytes: 1_000_000_000 }, validFrom: "2026-01-01T00:00:00.000Z" },
    resolvedHost: { schemaVersion: 1, hostname: HOST, domainId: DOMAIN, domainType: "platform_subdomain", storeId: STORE, storeSlug: "atlas", canonicalHostname: HOST, status: "active", cacheVersion: 1 },
    locale: "tr-TR",
    ...overrides,
  };
}

function product(index: number, input: Readonly<{ available?: boolean; sale?: boolean }> = {}): PublicProduct {
  const suffix = String(index).padStart(12, "0");
  return Object.freeze({
    id: `42000000-0000-4000-8000-${suffix}`,
    slug: `urun-${index}`,
    title: `Ürün ${index}`,
    description: `Taşınmaması gereken açıklama ${index}`,
    currency: "TRY",
    status: "active",
    priceCents: 10_000 + index,
    ...(input.sale ? { compareAtCents: 20_000 + index } : {}),
    available: input.available ?? true,
    variants: Object.freeze([{ id: `43000000-0000-4000-8000-${suffix}`, title: "Standart", priceCents: 10_000 + index, stockTracking: false, stockQuantity: 0, available: true, attributes: Object.freeze({ color: "secretly-unused" }) }]),
    media: Object.freeze([]),
  });
}

function composition(sections: StarterThemeCompositionConfigV3["sections"]): StarterThemeCompositionConfigV3 {
  return Object.freeze({ ...createDefaultStarterThemeComposition(), sections });
}

function workspace(extraDestinations: StorefrontDesignWorkspace["destinations"] = Object.freeze([])): StorefrontDesignWorkspace {
  const base = createDefaultStarterThemeComposition();
  const draft = { schemaVersion: 3 as const, brand: { logo: null, favicon: null, primaryColor: "#111111", accentColor: "#222222", backgroundColor: "#ffffff", textColor: "#111111", fontFamily: "inter" as const }, typography: { headingFont: { family: "Inter", category: "sans-serif" as const, availableWeights: ["400"] as const, source: "google" as const }, bodyFont: { family: "Inter", category: "sans-serif" as const, availableWeights: ["400"] as const, source: "google" as const }, headingWeight: "400" as const, bodyWeight: "400" as const, headingSizePx: 40, bodySizePx: 16 }, hero: { enabled: false, slides: [] }, promotion: { headline: "Kampanya", body: "", destination: { kind: "none" as const }, startsAt: null, endsAt: null, enabled: false }, announcement: { items: ["Atlas"], icon: "none" as const, speed: "normal" as const, direction: "left" as const, animation: "continuous" as const, enabled: false }, composition: base };
  return { schemaVersion: 3, draftVersion: 1, publishedVersion: 1, draftUpdatedAt: NOW.toISOString(), publishedAt: NOW.toISOString(), draft, published: { schemaVersion: 2, publicationVersion: 1, publishedAt: NOW.toISOString(), brand: { logo: null, favicon: null, primaryColor: "#111111", accentColor: "#222222", backgroundColor: "#ffffff", textColor: "#111111", fontFamily: "inter" }, hero: { enabled: false, slides: [] }, promotion: { headline: "Kampanya", body: "", destination: null, startsAt: null, endsAt: null, enabled: false }, announcement: draft.announcement, typography: draft.typography }, store: { name: "Atlas", timezone: "Europe/Istanbul" }, media: [], destinations: [{ kind: "collection", resourceId: CATEGORY, label: "Kolyeler", path: "/collections/kolyeler" }, ...extraDestinations] };
}

function fixture(overrides: Readonly<{ storefront?: Record<string, unknown>; showcaseEnabled?: boolean; merchantRecords?: readonly MerchantAdminRecord[] }> = {}) {
  const calls: Array<{ method: string; input: unknown }> = [];
  const latest = [product(1), product(2, { available: false }), product(3), product(4), product(5), product(6), product(7), product(8), product(9)];
  const sale = [product(11, { sale: true }), product(12), product(13, { sale: true, available: false }), product(14, { sale: true }), product(15, { sale: true }), product(16, { sale: true })];
  const category = [product(21), product(22, { available: false }), product(23), product(24)];
  const storefront = {
    schemaVersion: 2, id: STORE, name: "Atlas", slug: "atlas", hostname: HOST, primaryHostname: HOST, canonicalUrl: `https://${HOST}/`, currency: "TRY", locale: "tr", themeKey: "starter",
    presentation: { schemaVersion: 3, categoryShowcase: { heading: "Kategoriler", layout: "grid", items: [{ id: CATEGORY, name: "Kolyeler", slug: "kolyeler", image: { url: `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/category/${ASSET}.webp`, mediaType: "image/webp", altText: "Kolye", width: 800, height: 800 } }] }, sections: [] },
    ...overrides.storefront,
  } as never;
  const publicStorefront: PublicStorefrontRepository = {
    async getPublicStorefront(input) { calls.push({ method: "storefront", input }); return storefront; },
    async listPublicProducts(input) { calls.push({ method: `products:${input.limit}`, input }); return { items: [...latest, ...sale].slice(0, input.limit) }; },
    async listPublicProductsByCategory(input) { calls.push({ method: "category", input }); return { category: input.slug === "yuzukler" ? { id: CATEGORY_B, name: "Yüzükler", slug: "yuzukler" } : { id: CATEGORY, name: "Kolyeler", slug: "kolyeler" }, items: category.slice(0, input.limit) }; },
    async getPublicProductBySlug() { throw new Error("unexpected"); },
    async listPublicProductMedia() { throw new Error("unexpected"); },
    async getPublicStorefrontDesign() { throw new Error("unexpected"); },
  };
  const assets: StorefrontAssetRepository = {
    async listAssets(input) { calls.push({ method: "assets", input }); return [
      { id: ASSET, storeId: STORE, kind: "hero", objectKey: `stores/${STORE}/storefront/hero/${ASSET}.webp`, publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/hero/${ASSET}.webp`, mediaType: "image/webp", altText: "Hero", width: 1600, height: 900, byteSize: 1_000, status: "active", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), version: 1 },
      { id: CATEGORY_ASSET, storeId: STORE, kind: "category", objectKey: `stores/${STORE}/storefront/category/${CATEGORY_ASSET}.webp`, publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/category/${CATEGORY_ASSET}.webp`, mediaType: "image/webp", altText: "Kolye", width: 800, height: 800, byteSize: 1_000, status: "active", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), version: 1 },
      { id: CATEGORY_ASSET_B, storeId: STORE, kind: "category", objectKey: `stores/${STORE}/storefront/category/${CATEGORY_ASSET_B}.webp`, publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/category/${CATEGORY_ASSET_B}.webp`, mediaType: "image/webp", altText: "Yüzük", width: 800, height: 800, byteSize: 1_000, status: "active", createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), version: 1 },
    ]; },
    async createAsset() { throw new Error("mutation_must_not_run"); },
    async archiveAsset() { throw new Error("mutation_must_not_run"); },
    async recoverOperation() { throw new Error("mutation_must_not_run"); },
  };
  const merchantAdmin: Pick<MerchantAdminRepository, "list"> = { async list(input) { calls.push({ method: "category-config", input }); return overrides.merchantRecords ?? [{
    id: "41000000-0000-4000-8000-000000000010", kind: "category_showcase", name: "Kategoriler",
    config: { heading: "Ayrı vitrin", enabled: overrides.showcaseEnabled ?? false, layout: "grid", items: [{ categoryId: CATEGORY, assetId: CATEGORY_ASSET }] },
    status: "active", version: 1, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
  }]; } };
  return { calls, loader: createServerStorefrontDesignPreviewLoader({ publicStorefront, assets, merchantAdmin }) };
}

test("loader deduplicates draft sources and follows migration 113 row limits and availability order", async () => {
  const selected = fixture();
  const draft = composition(Object.freeze([
    { sectionId: "home_latest_1", kind: "product_row", enabled: true, heading: "Yeni 4", source: "latest", limit: 4 },
    { sectionId: "home_latest_2", kind: "product_row", enabled: true, heading: "Yeni 8", source: "latest", limit: 8 },
    { sectionId: "home_sale_1", kind: "product_row", enabled: true, heading: "İndirim", source: "sale", limit: 4 },
    { sectionId: "home_category_1", kind: "product_row", enabled: true, heading: "Kolye", source: "category", categoryId: CATEGORY, limit: 4 },
  ]));
  const result = await selected.loader.load({ tenantContext: tenant(), now: NOW, workspace: workspace(), composition: draft });
  assert.deepEqual(selected.calls.map(({ method }) => method), ["storefront", "products:48", "category"]);
  assert.deepEqual(result.productSources.map(({ key, items }) => [key, items.map(({ id }) => id)]), [
    ["category:41000000-0000-4000-8000-000000000006", [product(21).id, product(22).id, product(23).id, product(24).id]],
    ["latest", [product(1).id, product(2).id, product(3).id, product(4).id, product(5).id, product(6).id, product(7).id, product(8).id]],
    ["sale", [product(11).id, product(13).id, product(14).id, product(15).id]],
  ]);
  for (const source of result.productSources) for (const item of source.items) {
    for (const unused of ["description", "variants", "attributes", "reviews", "categoryPath", "merchandising", "status"]) assert.equal(Object.hasOwn(item, unused), false, unused);
  }
});

test("category preview resolves published V3 grid when the separate legacy showcase toggle is off", async () => {
  const image = { url: `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/category/${CATEGORY_ASSET}.webp`, mediaType: "image/webp", altText: "Kolye", width: 800, height: 800 };
  const selected = fixture({ storefront: { presentation: { schemaVersion: 3, sections: [
    { kind: "category_grid", sectionId: "home_category_grid_1", heading: "Yayındaki başlık", layout: "grid", items: [{ name: "Kolyeler", slug: "kolyeler", image }] },
  ] } } });
  const draft = composition(Object.freeze([
    { sectionId: "home_category_grid_1", kind: "category_grid", enabled: true, heading: "Taslak başlık", categoryIds: [CATEGORY], layout: "duo" },
  ]));
  const result = await selected.loader.load({ tenantContext: tenant(), now: NOW, workspace: workspace(), composition: draft });
  assert.equal(result.categoryShowcase.status, "ready");
  assert.deepEqual(result.categoryShowcase.value?.items.map(({ id }) => id), [CATEGORY]);
  const projection = composeDraftCampaignProjection({ composition: draft, storeName: "Atlas", destinations: workspace().destinations, resources: result });
  assert.equal(projection.sectionStates[0]?.status, "ready");
  assert.equal(projection.projection.presentation.categoryShowcase?.heading, "Taslak başlık");
});

test("draft-only category resolves active mapping despite disabled legacy showcase and absent published grid", async () => {
  const selected = fixture({ storefront: { presentation: { schemaVersion: 3, sections: [] } }, showcaseEnabled: false });
  const draft = composition(Object.freeze([
    { sectionId: "home_category_grid_new", kind: "category_grid", enabled: true, heading: "Yeni taslak", categoryIds: [CATEGORY], layout: "duo" },
  ]));
  const result = await selected.loader.load({ tenantContext: tenant(), now: NOW, workspace: workspace(), composition: draft });
  assert.equal(result.categoryShowcase.status, "ready");
  assert.deepEqual(result.categoryShowcase.value?.items.map(({ id, slug }) => [id, slug]), [[CATEGORY, "kolyeler"]]);
  const projection = composeDraftCampaignProjection({ composition: draft, storeName: "Atlas", destinations: workspace().destinations, resources: result });
  assert.equal(projection.sectionStates[0]?.status, "ready");
  assert.equal(projection.projection.presentation.sections[0]?.kind, "category_grid");
});

test("draft category grid combines per-category mappings from separate active showcase records", async () => {
  const record = (id: string, categoryId: string, assetId: string, updatedAt: string): MerchantAdminRecord => ({
    id, kind: "category_showcase", name: "Kategoriler", config: { enabled: false, heading: "Ayrı vitrin", layout: "grid", items: [{ categoryId, assetId }] },
    status: "active", version: 1, createdAt: NOW.toISOString(), updatedAt,
  });
  const selected = fixture({ storefront: { presentation: { schemaVersion: 3, sections: [] } }, merchantRecords: [
    record("41000000-0000-4000-8000-000000000014", CATEGORY_B, CATEGORY_ASSET_B, "2026-09-16T09:00:00.000Z"),
    record("41000000-0000-4000-8000-000000000013", CATEGORY, CATEGORY_ASSET, "2026-09-15T09:00:00.000Z"),
  ] });
  const draft = composition(Object.freeze([
    { sectionId: "home_category_grid_two", kind: "category_grid", enabled: true, heading: "İki kategori", categoryIds: [CATEGORY, CATEGORY_B], layout: "duo" },
  ]));
  const selectedWorkspace = workspace([{ kind: "collection", resourceId: CATEGORY_B, label: "Yüzükler", path: "/collections/yuzukler" }]);
  const result = await selected.loader.load({ tenantContext: tenant(), now: NOW, workspace: selectedWorkspace, composition: draft });
  assert.deepEqual(result.categoryShowcase.value?.items.map(({ id }) => id), [CATEGORY, CATEGORY_B]);
  const projection = composeDraftCampaignProjection({ composition: draft, storeName: "Atlas", destinations: selectedWorkspace.destinations, resources: result });
  assert.equal(projection.sectionStates[0]?.status, "ready");
});

test("loader reuses a source product for a matching hotspot without a product-detail query", async () => {
  const selected = fixture(); const productId = product(1).id;
  const draft = composition(Object.freeze([
    { sectionId: "home_latest_hotspot", kind: "product_row", enabled: true, heading: "Yeni", source: "latest", limit: 4 },
    { sectionId: "home_hero_hotspot", kind: "hero", enabled: true, slides: [{ heading: "Hero", desktopAssetId: ASSET, destination: "/products/urun-1", productId }] },
  ]));
  const result = await selected.loader.load({ tenantContext: tenant(), now: NOW, workspace: workspace(Object.freeze([{ kind: "product", resourceId: productId, label: "Ürün 1", path: "/products/urun-1" }])), composition: draft });
  assert.deepEqual(selected.calls.map(({ method }) => method), ["storefront", "products:4", "assets"]);
  assert.equal(result.hotspots[0]?.value?.title, "Ürün 1");
});

test("loader resolves only selected tenant assets and never returns private object keys", async () => {
  const selected = fixture();
  const draft = composition(Object.freeze([{ sectionId: "home_hero_1", kind: "hero", enabled: true, slides: [{ heading: "Hero", desktopAssetId: ASSET, destination: "/products" }] }]));
  const result = await selected.loader.load({ tenantContext: tenant(), now: NOW, workspace: workspace(), composition: draft });
  assert.deepEqual(result.assets, [{ id: ASSET, status: "ready", image: { url: `https://media.saas-staging.celebix.site/stores/${STORE}/storefront/hero/${ASSET}.webp`, mediaType: "image/webp", altText: "Hero", width: 1600, height: 900 } }]);
  assert.equal(JSON.stringify(result).includes("objectKey"), false);
});

test("loader refuses missing or mismatched canonical tenant authority before dependent reads", async () => {
  const missing = fixture();
  await assert.rejects(missing.loader.load({ tenantContext: tenant({ resolvedHost: undefined }), now: NOW, workspace: workspace(), composition: composition(Object.freeze([])) }), (error) => error instanceof StorefrontDesignPreviewLoaderError && error.code === "unavailable");
  assert.deepEqual(missing.calls, []);

  const mismatch = fixture({ storefront: { primaryHostname: "other.saas-staging.celebix.site" } });
  await assert.rejects(mismatch.loader.load({ tenantContext: tenant(), now: NOW, workspace: workspace(), composition: composition(Object.freeze([{ sectionId: "home_latest_1", kind: "product_row", enabled: true, heading: "Yeni", source: "latest", limit: 4 }])) }), (error) => error instanceof StorefrontDesignPreviewLoaderError && error.code === "unavailable");
  assert.deepEqual(mismatch.calls.map(({ method }) => method), ["storefront"]);
});
