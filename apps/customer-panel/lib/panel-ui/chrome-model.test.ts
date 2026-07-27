import assert from "node:assert/strict";
import test from "node:test";
import type { StoreMembershipRole, TenantContext } from "@celebix/saas-contracts";
import { createPanelChromeModel } from "./chrome-model.ts";

const CONTEXT: TenantContext = {
  schemaVersion: 1,
  requestId: "90000000-0000-4000-8000-000000000001",
  principal: {
    id: "10000000-0000-4000-8000-000000000001",
    issuer: "https://identity.example.test/oidc",
    subject: "merchant-subject",
  },
  store: { id: "20000000-0000-4000-8000-000000000001", slug: "atlas-store", status: "active" },
  membership: {
    id: "30000000-0000-4000-8000-000000000001",
    role: "store_owner",
    status: "active",
  },
  entitlements: {
    schemaVersion: 1,
    planId: "40000000-0000-4000-8000-000000000001",
    planCode: "free_starter",
    version: 3,
    status: "active",
    features: ["catalog", "media"],
    limits: { products: 100, staff: 1, storageBytes: 1_000_000_000 },
    validFrom: "2026-07-19T00:00:00.000Z",
  },
  resolvedHost: {
    schemaVersion: 1,
    hostname: "atlas-store.celebix.site",
    domainId: "50000000-0000-4000-8000-000000000001",
    domainType: "platform_subdomain",
    storeId: "20000000-0000-4000-8000-000000000001",
    storeSlug: "atlas-store",
    canonicalHostname: "atlas-store.celebix.site",
    status: "active",
    cacheVersion: 2,
  },
  locale: "tr-TR",
};

test("projects only the exact display contract", () => {
  assert.deepEqual(createPanelChromeModel(CONTEXT), {
    storeSlug: "atlas-store",
    membershipLabel: "Mağaza sahibi",
    planCode: "free_starter",
    planVersion: 3,
    entitlementStatus: "active",
    storefrontHostname: "atlas-store.celebix.site",
    locale: "tr-TR",
  });
});

test("maps every contract role to an exact Turkish label", () => {
  const labels: Record<StoreMembershipRole, string> = {
    store_owner: "Mağaza sahibi",
    admin: "Mağaza yöneticisi",
    editor: "İçerik editörü",
    analyst: "Analist",
  };
  for (const [role, label] of Object.entries(labels)) {
    const input = { ...CONTEXT, membership: { ...CONTEXT.membership, role } } as TenantContext;
    assert.equal(createPanelChromeModel(input).membershipLabel, label);
  }
});

test("returns an immutable projection", () => {
  assert.equal(Object.isFrozen(createPanelChromeModel(CONTEXT)), true);
});

test("chrome projection contains no enumerable authority graph", () => {
  const model = createPanelChromeModel(CONTEXT);
  assert.deepEqual(Object.keys(model).sort(), [
    "entitlementStatus", "locale", "membershipLabel", "planCode",
    "planVersion", "storeSlug", "storefrontHostname",
  ]);
});

test("chrome rejects prototype and malformed hostname authority", () => {
  const inherited = Object.create(CONTEXT);
  assert.throws(() => createPanelChromeModel(inherited), /panel_chrome_context_invalid/);
  const ported = { ...CONTEXT, resolvedHost: { ...CONTEXT.resolvedHost!, canonicalHostname: "atlas-store.celebix.site:443" } };
  assert.throws(() => createPanelChromeModel(ported as TenantContext), /panel_chrome_context_invalid/);
});

test("does not expose authority IDs, issuer, subject, request, or credentials", () => {
  const json = JSON.stringify(createPanelChromeModel(CONTEXT));
  for (const value of [
    CONTEXT.requestId,
    CONTEXT.principal.id,
    CONTEXT.principal.issuer,
    CONTEXT.principal.subject,
    CONTEXT.store.id,
    CONTEXT.membership.id,
    CONTEXT.entitlements.planId,
    CONTEXT.resolvedHost?.domainId,
  ]) assert.equal(json.includes(String(value)), false);
  assert.doesNotMatch(json, /principal|membershipId|storeId|planId|domainId|requestId|cookie|token/i);
});

test("fails closed for inactive or malformed durable authority", () => {
  const inactive = { ...CONTEXT, entitlements: { ...CONTEXT.entitlements, status: "expired" } };
  assert.throws(
    () => createPanelChromeModel(inactive as unknown as TenantContext),
    /panel_chrome_context_invalid/,
  );
  const malformed = { ...CONTEXT, store: { ...CONTEXT.store, slug: "Atlas Store" } };
  assert.throws(
    () => createPanelChromeModel(malformed as TenantContext),
    /panel_chrome_context_invalid/,
  );
});

test("accepts storefront hostname only from a matching durable resolved host", () => {
  const absent = { ...CONTEXT, resolvedHost: undefined };
  assert.equal(createPanelChromeModel(absent).storefrontHostname, undefined);
  const mismatch = {
    ...CONTEXT,
    resolvedHost: { ...CONTEXT.resolvedHost!, storeId: "60000000-0000-4000-8000-000000000001" },
  };
  assert.throws(
    () => createPanelChromeModel(mismatch as TenantContext),
    /panel_chrome_context_invalid/,
  );
});

for (const [label, resolvedHost] of [
  ["null", null],
  ["false", false],
  ["zero", 0],
  ["empty string", ""],
  ["whitespace-only string", " "],
] as const) {
  test(`fails closed for a present ${label} resolved host`, () => {
    const malformed = { ...CONTEXT, resolvedHost };
    assert.throws(
      () => createPanelChromeModel(malformed as unknown as TenantContext),
      (error: unknown) =>
        error instanceof Error && error.message === "panel_chrome_context_invalid",
    );
  });
}
