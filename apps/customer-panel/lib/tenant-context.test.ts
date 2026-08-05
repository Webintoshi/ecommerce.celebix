import assert from "node:assert/strict";
import test from "node:test";

import type {
  PlanEntitlements,
  ResolvedStoreHost,
  StoreMembership,
} from "@celebix/saas-contracts";

type TenantContextModule = typeof import("./tenant-context");
const tenantContexts = await import(new URL("./tenant-context.ts", import.meta.url).href).catch(
  () => ({} as Partial<TenantContextModule>),
);

const principal = {
  id: "principal_1",
  issuer: "https://identity.example.test/oidc",
  subject: "subject_123",
};

const membership: StoreMembership = {
  schemaVersion: 1,
  id: "membership_1",
  principalId: principal.id,
  storeId: "store_1",
  role: "store_owner",
  status: "active",
  createdAt: "2026-07-10T10:00:00.000Z",
  updatedAt: "2026-07-10T10:00:00.000Z",
};

const entitlements: PlanEntitlements = {
  schemaVersion: 1,
  planId: "plan_free",
  planCode: "free_starter",
  version: 1,
  status: "active",
  features: ["catalog"],
  limits: { products: 100, staff: 1, storageBytes: 1_000_000_000 },
  validFrom: "2026-07-10T10:00:00.000Z",
};

const host: ResolvedStoreHost = {
  schemaVersion: 1,
  hostname: "cicek-pazari.celebix.site",
  domainId: "domain_1",
  domainType: "platform_subdomain",
  storeId: "store_1",
  storeSlug: "cicek-pazari",
  canonicalHostname: "cicek-pazari.celebix.site",
  status: "active",
  cacheVersion: 1,
};

function build(overrides: Record<string, unknown> = {}) {
  assert.equal(typeof tenantContexts.buildTenantContext, "function");
  return tenantContexts.buildTenantContext!({
    requestId: "request_1",
    principal,
    membership,
    membershipAuthority: { issuer: principal.issuer, subject: principal.subject },
    store: { id: "store_1", slug: "cicek-pazari", status: "active", locale: "tr" },
    entitlements,
    resolvedHost: host,
    ...overrides,
  });
}

test("exports strict TenantContext construction", () => {
  assert.equal(typeof tenantContexts.buildTenantContext, "function");
  assert.equal(typeof tenantContexts.canUseTenantFeature, "function");
});

test("builds a secret-free TenantContext from matching server authority", () => {
  if (!tenantContexts.buildTenantContext) return;
  const result = build();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.context.principal.issuer, principal.issuer);
  assert.equal(result.context.membership.status, "active");
  assert.equal(result.context.store.id, "store_1");
  assert.equal(JSON.stringify(result.context).toLowerCase().includes("token"), false);
  assert.equal("client" in result.context, false);
});

test("email alone or mismatched issuer and subject cannot establish principal authority", () => {
  if (!tenantContexts.buildTenantContext) return;
  for (const authority of [
    { issuer: principal.issuer, subject: "wrong-subject", email: "owner@example.test" },
    { issuer: "https://attacker.example.test", subject: principal.subject, email: "owner@example.test" },
  ]) {
    const result = build({ membershipAuthority: authority });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "membership_denied");
  }
});

test("revoked and invited membership cannot create TenantContext", () => {
  if (!tenantContexts.buildTenantContext) return;
  for (const status of ["revoked", "invited"] as const) {
    const result = build({ membership: { ...membership, status } });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "membership_denied");
  }
});

test("inactive or mismatched selected store is denied", () => {
  if (!tenantContexts.buildTenantContext) return;
  const inactive = build({ store: { id: "store_1", slug: "cicek-pazari", status: "suspended", locale: "tr" } });
  assert.equal(inactive.ok, false);
  if (!inactive.ok) assert.equal(inactive.error.code, "store_inactive");

  const mismatch = build({ store: { id: "store_2", slug: "other", status: "active", locale: "tr" } });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.error.code, "membership_denied");
});

test("host and membership mismatch is denied", () => {
  if (!tenantContexts.buildTenantContext) return;
  const result = build({ resolvedHost: { ...host, storeId: "store_2" } });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "host_store_mismatch");
});

test("host store slug mismatch is denied even when store ID matches", () => {
  if (!tenantContexts.buildTenantContext) return;
  const result = build({ resolvedHost: { ...host, storeSlug: "different-store" } });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "host_store_mismatch");
});

test("unknown features remain denied", () => {
  if (!tenantContexts.canUseTenantFeature || !tenantContexts.buildTenantContext) return;
  const result = build();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(tenantContexts.canUseTenantFeature(result.context, "catalog"), true);
  assert.equal(tenantContexts.canUseTenantFeature(result.context, "orders"), false);
  assert.equal(tenantContexts.canUseTenantFeature(result.context, "unknown-feature"), false);
});
