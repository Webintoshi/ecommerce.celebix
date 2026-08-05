import assert from "node:assert/strict";
import test from "node:test";

import type { PlanEntitlements, ResolvedStoreHost, StoreMembership } from "@celebix/saas-contracts";
import type { PanelSession } from "./session";
import type { PanelAuthorizationDataPort } from "./panel-access";

type AccessModule = typeof import("./panel-access");
const access = await import(new URL("./panel-access.ts", import.meta.url).href).catch(
  () => ({} as Partial<AccessModule>),
);

const session: PanelSession = {
  id: "opaque_session_1234567890",
  principal: {
    id: "principal_1",
    issuer: "https://identity.example.test/oidc",
    subject: "subject_1",
  },
  activeStoreId: "store_1",
  createdAt: "2026-07-10T10:00:00.000Z",
  rotatedAt: "2026-07-10T10:00:00.000Z",
  expiresAt: "2026-07-10T18:00:00.000Z",
};

function membership(status: StoreMembership["status"] = "active"): StoreMembership {
  return {
    schemaVersion: 1,
    id: "membership_1",
    principalId: "principal_1",
    storeId: "store_1",
    role: "store_owner",
    status,
    createdAt: "2026-07-10T10:00:00.000Z",
    updatedAt: "2026-07-10T10:00:00.000Z",
  };
}

const entitlements: PlanEntitlements = {
  schemaVersion: 1,
  planId: "plan_1",
  planCode: "free_starter",
  version: 1,
  status: "active",
  features: ["catalog"],
  limits: { products: 100, staff: 1, storageBytes: 1_000_000_000 },
  validFrom: "2026-07-10T10:00:00.000Z",
};

const host: ResolvedStoreHost = {
  schemaVersion: 1,
  hostname: "store-1.celebix.site",
  domainId: "domain_1",
  domainType: "platform_subdomain",
  storeId: "store_1",
  storeSlug: "store-1",
  canonicalHostname: "store-1.celebix.site",
  status: "active",
  cacheVersion: 1,
};

function dataPort(status: StoreMembership["status"] = "active"): PanelAuthorizationDataPort {
  return {
    async getMemberships() {
      return [membership(status)];
    },
    async getPrincipalAuthority() {
      return { issuer: session.principal.issuer, subject: session.principal.subject };
    },
    async getStore() {
      return { id: "store_1", slug: "store-1", status: "active", locale: "tr" };
    },
    async getEntitlements() {
      return entitlements;
    },
    async getResolvedHost() {
      return host;
    },
  };
}

test("exports the current-membership panel access resolver", () => {
  assert.equal(typeof access.resolvePanelTenantContext, "function");
});

test("builds TenantContext only after current membership and store data are revalidated", async () => {
  if (!access.resolvePanelTenantContext) return;
  const result = await access.resolvePanelTenantContext({
    requestId: "request_1",
    session,
    dataPort: dataPort(),
  });

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.context.store.id, "store_1");
});

test("a revoked current membership cannot rely on stale session selection", async () => {
  if (!access.resolvePanelTenantContext) return;
  const result = await access.resolvePanelTenantContext({
    requestId: "request_1",
    session,
    dataPort: dataPort("revoked"),
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "membership_denied");
});

test("missing authorization records fail closed instead of fabricating membership or store", async () => {
  if (!access.resolvePanelTenantContext) return;
  const missingPort = dataPort();
  missingPort.getStore = async () => null;
  const result = await access.resolvePanelTenantContext({
    requestId: "request_1",
    session,
    dataPort: missingPort,
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "store_inactive");
});
