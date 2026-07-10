import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { CreateStarterTenantInput } from "@celebix/saas-contracts";
import type { CreateStarterTenantService } from "@celebix/saas-tenant-core";

import {
  createOwnerTenantCoreAdapter,
  createUnavailableOwnerTenantCoreAdapter,
} from "./adapter";

const input: CreateStarterTenantInput = {
  schemaVersion: 1,
  idempotencyKey: "owner-internal-1",
  principal: {
    issuer: "https://auth.example.test/oidc",
    subject: "subject-1",
    email: "owner@example.test",
    emailVerified: true,
  },
  store: {
    name: "Ornek Magaza",
    slug: "ornek-magaza",
    locale: "tr",
    currency: "TRY",
    themeKey: "starter",
  },
  consents: { privacyAcceptedAt: "2026-07-10T00:00:00.000Z" },
  requestedAt: "2026-07-10T00:00:00.000Z",
};

test("default Owner adapter is unavailable and fail-closed", async () => {
  const result = await createUnavailableOwnerTenantCoreAdapter().createStarterTenant(input);
  assert.deepEqual(result, {
    ok: false,
    error: { schemaVersion: 1, code: "service_unavailable", retryable: true },
  });
});

test("configured Owner adapter delegates only through the Tenant Core service interface", async () => {
  let calls = 0;
  const service: CreateStarterTenantService = {
    execute: async (received) => {
      calls += 1;
      assert.deepEqual(received, input);
      return {
        ok: false,
        error: { schemaVersion: 1, code: "tenant_transaction_failed", retryable: true },
      };
    },
  };

  const result = await createOwnerTenantCoreAdapter(service).createStarterTenant(input);
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
});

test("Owner adapter imports no database, service-role, or dedicated provisioning implementation", () => {
  const source = readFileSync(new URL("./adapter.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /supabase|service.?role|database_url|coolify|cloudflare|r2|logto/i);
  assert.doesNotMatch(source, /store-provisioning|admin-deployment|storefront-deployment|create-store/i);
});
