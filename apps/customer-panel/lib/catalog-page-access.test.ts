import assert from "node:assert/strict";
import test from "node:test";

import type {
  StoreMembershipRole,
  TenantContext,
} from "@celebix/saas-contracts";

import {
  CATALOG_PAGE_ACTIONS,
  isCatalogPageActionAllowed,
} from "./catalog-page-access.ts";
import { decideServerPanelAccess } from "./server-panel-access/decision-policy.ts";

function tenantContext(role: StoreMembershipRole): TenantContext {
  return Object.freeze({
    schemaVersion: 1,
    requestId: "catalog-page-access-test",
    principal: Object.freeze({
      id: "10000000-0000-4000-8000-000000000001",
      issuer: "https://issuer.test/oidc",
      subject: "catalog-page-access-test",
    }),
    store: Object.freeze({
      id: "20000000-0000-4000-8000-000000000001",
      slug: "catalog-page-access-test",
      status: "active",
    }),
    membership: Object.freeze({
      id: "30000000-0000-4000-8000-000000000001",
      role,
      status: "active",
    }),
    entitlements: Object.freeze({
      schemaVersion: 1,
      planId: "40000000-0000-4000-8000-000000000001",
      planCode: "free_starter",
      version: 1,
      status: "active",
      features: Object.freeze(["catalog"] as const),
      limits: Object.freeze({ products: 100, staff: 5, storageBytes: 1024 }),
      validFrom: "2026-07-22T00:00:00.000Z",
    }),
    locale: "tr-TR",
  });
}

function signedIn(role: StoreMembershipRole) {
  const context = tenantContext(role);
  return decideServerPanelAccess({
    kind: "authenticated",
    session: Object.freeze({
      id: "50000000-0000-4000-8000-000000000001",
      principal: context.principal,
      activeStoreId: context.store.id,
      createdAt: "2026-07-22T17:00:00.000Z",
      rotatedAt: "2026-07-22T17:30:00.000Z",
      expiresAt: "2026-07-23T01:00:00.000Z",
    }),
    tenantContext: context,
  });
}

test("real signed-in decision binds catalog pages to their exact production actions", () => {
  assert.deepEqual(CATALOG_PAGE_ACTIONS, {
    tags: "catalog_admin.manage",
    barcodeLabels: "catalog_admin.read",
  });

  const owner = signedIn("store_owner");
  const analyst = signedIn("analyst");
  assert.equal(owner.kind, "render");
  assert.equal(analyst.kind, "render");
  if (owner.kind !== "render" || analyst.kind !== "render") return;

  assert.equal(
    isCatalogPageActionAllowed(owner.tenantContext, CATALOG_PAGE_ACTIONS.tags),
    true,
  );
  assert.equal(
    isCatalogPageActionAllowed(analyst.tenantContext, CATALOG_PAGE_ACTIONS.tags),
    false,
  );
  assert.equal(
    isCatalogPageActionAllowed(
      analyst.tenantContext,
      CATALOG_PAGE_ACTIONS.barcodeLabels,
    ),
    true,
  );
});
