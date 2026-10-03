import assert from "node:assert/strict";
import test from "node:test";
import type { PublicStorefront, PublicStorefrontDesign, StoreMembershipRole, TenantContext } from "@celebix/saas-contracts";
import { resolvePanelStoreBranding, type PanelBrandingRepository } from "./service.ts";

const STORE = "41000000-0000-4000-8000-000000000001";
const OTHER_STORE = "41000000-0000-4000-8000-000000000099";
const HOST = "atlas.saas-staging.celebix.site";
const NOW = new Date("2026-10-03T09:00:00.000Z");
const LOGO = `https://media.saas-staging.celebix.site/stores/${STORE}/design/41000000-0000-4000-8000-000000000007.webp`;
const OPTIONS = [{ selectionKey: OTHER_STORE, displayName: "Başka mağaza" }, { selectionKey: STORE, displayName: "Atlas Kuyumcu" }] as const;

function context(role: StoreMembershipRole = "store_owner"): TenantContext {
  return {
    schemaVersion: 1, requestId: "41000000-0000-4000-8000-000000000008",
    principal: { id: "41000000-0000-4000-8000-000000000002", issuer: "https://identity.test", subject: "atlas" },
    store: { id: STORE, slug: "atlas", status: "active" },
    membership: { id: "41000000-0000-4000-8000-000000000003", role, status: "active" },
    entitlements: { schemaVersion: 1, planId: "41000000-0000-4000-8000-000000000004", planCode: "growth", version: 1, status: "active", features: ["catalog"], limits: { products: 100, staff: 5, storageBytes: 1_000_000_000 }, validFrom: "2026-01-01T00:00:00.000Z" },
    resolvedHost: { schemaVersion: 1, hostname: HOST, domainId: "41000000-0000-4000-8000-000000000005", domainType: "platform_subdomain", storeId: STORE, storeSlug: "atlas", canonicalHostname: HOST, status: "active", cacheVersion: 1 },
    locale: "tr-TR",
  };
}

function storefront(overrides: Partial<PublicStorefront> = {}): PublicStorefront {
  return {
    schemaVersion: 2, id: STORE, name: "Public Atlas", slug: "atlas", hostname: HOST, primaryHostname: HOST,
    canonicalUrl: `https://${HOST}/`, currency: "TRY", locale: "tr", themeKey: "starter",
    presentation: { schemaVersion: 1, displayName: "Public Atlas", theme: { colorScheme: "neutral", headingStyle: "serif", productCardStyle: "editorial", productImageRatio: "portrait", homeProductLimit: 8, showBrandStory: true }, hero: { enabled: false, headline: "Atlas", body: "", destination: "/products" }, seo: { allowIndex: false } },
    ...overrides,
  };
}

function design(logoUrl: string | null = LOGO): PublicStorefrontDesign {
  return {
    schemaVersion: 2, publicationVersion: 3, publishedAt: "2026-10-02T09:00:00.000Z",
    brand: { logo: logoUrl ? { url: logoUrl, altText: "Atlas logo" } : null, favicon: null, primaryColor: "#FF5A00", accentColor: "#171717", backgroundColor: "#FFFFFF", textColor: "#171717", fontFamily: "inter" },
    hero: { enabled: false, slides: [] },
    promotion: { headline: "Kampanya", body: "", destination: null, startsAt: null, endsAt: null, enabled: false },
    announcement: { items: ["Atlas"], icon: "none", speed: "normal", direction: "left", animation: "continuous", enabled: false },
    typography: { headingFont: { family: "Inter", category: "sans-serif", availableWeights: ["400"], source: "google" }, bodyFont: { family: "Inter", category: "sans-serif", availableWeights: ["400"], source: "google" }, headingWeight: "400", bodyWeight: "400", headingSizePx: 40, bodySizePx: 16 },
  };
}

function repository(input: { store?: PublicStorefront; published?: PublicStorefrontDesign; failure?: "store" | "design" } = {}) {
  const calls: Array<{ method: string; hostname: string }> = [];
  const value: PanelBrandingRepository = {
    async getPublicStorefront(read) {
      calls.push({ method: "store", hostname: read.hostname });
      if (input.failure === "store") throw Error("database_unavailable");
      return input.store ?? storefront();
    },
    async getPublicStorefrontDesign(read) {
      calls.push({ method: "published", hostname: read.storefront.hostname });
      if (input.failure === "design") throw Error("storefront_not_found");
      return input.published ?? design();
    },
  };
  return { value, calls };
}

test("every active role receives only the published logo and active store option name", async () => {
  for (const role of ["store_owner", "admin", "editor", "analyst", "cashier"] as const) {
    const selected = repository();
    const result = await resolvePanelStoreBranding({ context: context(role), storeOptions: OPTIONS, repository: selected.value, now: NOW });
    assert.deepEqual(result, { storeDisplayName: "Atlas Kuyumcu", storeLogoUrl: LOGO });
    assert.equal(Object.isFrozen(result), true);
    assert.deepEqual(selected.calls, [{ method: "store", hostname: HOST }, { method: "published", hostname: HOST }]);
  }
});

test("mismatched or inactive tenant authority never starts public reads", async () => {
  const base = context();
  const contexts = [
    { ...base, store: { ...base.store, status: "suspended" } },
    { ...base, membership: { ...base.membership, status: "suspended" } },
    { ...base, resolvedHost: undefined },
    { ...base, resolvedHost: { ...base.resolvedHost!, storeId: OTHER_STORE } },
    { ...base, resolvedHost: { ...base.resolvedHost!, storeSlug: "foreign" } },
    { ...base, resolvedHost: { ...base.resolvedHost!, status: "inactive" } },
  ];
  for (const invalid of contexts) {
    const selected = repository();
    const result = await resolvePanelStoreBranding({ context: invalid as TenantContext, storeOptions: OPTIONS, repository: selected.value, now: NOW });
    assert.deepEqual(result, { storeDisplayName: "Atlas Kuyumcu", storeLogoUrl: null });
    assert.deepEqual(selected.calls, []);
  }
});

test("a crossed store or canonical host cannot reach the published design read", async () => {
  for (const changed of [{ id: OTHER_STORE }, { slug: "foreign" }, { hostname: "foreign.example" }, { primaryHostname: "foreign.example" }]) {
    const selected = repository({ store: storefront(changed) });
    assert.deepEqual(await resolvePanelStoreBranding({ context: context(), storeOptions: OPTIONS, repository: selected.value, now: NOW }), { storeDisplayName: "Atlas Kuyumcu", storeLogoUrl: null });
    assert.deepEqual(selected.calls, [{ method: "store", hostname: HOST }]);
  }
});

test("unavailable configuration or database preserves the active name without a logo", async () => {
  for (const failure of ["store", "design"] as const) {
    assert.deepEqual(await resolvePanelStoreBranding({ context: context(), storeOptions: OPTIONS, repository: repository({ failure }).value, now: NOW }), { storeDisplayName: "Atlas Kuyumcu", storeLogoUrl: null });
  }
  assert.deepEqual(await resolvePanelStoreBranding({ context: context(), storeOptions: OPTIONS, repository: null, now: NOW }), { storeDisplayName: "Atlas Kuyumcu", storeLogoUrl: null });
  assert.deepEqual(await resolvePanelStoreBranding({ context: context(), repository: null, now: NOW }), { storeDisplayName: "atlas", storeLogoUrl: null });
});

test("published projection without an active resolved logo keeps name fallback", async () => {
  const selected = repository({ published: design(null) });
  assert.deepEqual(await resolvePanelStoreBranding({ context: context(), repository: selected.value, now: NOW }), { storeDisplayName: "Public Atlas", storeLogoUrl: null });
});

test("published legacy HTTPS URLs remain intact while malformed public URLs fail closed", async () => {
  const legacy = "https://legacy.example/retained-logo.png";
  const valid = await resolvePanelStoreBranding({ context: context(), storeOptions: OPTIONS, repository: repository({ published: design(legacy) }).value, now: NOW });
  assert.equal(valid?.storeLogoUrl, legacy);
  for (const url of ["javascript:alert(1)", "http://legacy.example/logo.png", "https://user:password@legacy.example/logo.png"]) {
    const result = await resolvePanelStoreBranding({ context: context(), storeOptions: OPTIONS, repository: repository({ published: design(url) }).value, now: NOW });
    assert.deepEqual(result, { storeDisplayName: "Atlas Kuyumcu", storeLogoUrl: null });
  }
});

test("model-only fixtures have no public reads or invented branding", async () => {
  const selected = repository();
  assert.equal(await resolvePanelStoreBranding({ context: null, repository: selected.value, now: NOW }), null);
  assert.deepEqual(selected.calls, []);
});
