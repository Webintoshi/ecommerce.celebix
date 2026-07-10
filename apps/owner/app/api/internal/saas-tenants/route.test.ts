import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { CreateStarterTenantInput } from "@celebix/saas-contracts";
import type { OwnerTenantCoreAdapter } from "../../../../lib/saas-tenant-core/adapter";

import { POST, createInternalSaaSTenantsPostHandler } from "./route";

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

function request(body: unknown) {
  return new Request("https://ecommerce.example.test/api/internal/saas-tenants", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("default route is disabled and returns controlled 503", async () => {
  const response = await POST(request(input));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: { schemaVersion: 1, code: "service_unavailable", retryable: true },
  });
});

test("disabled route never calls the adapter", async () => {
  let calls = 0;
  const adapter: OwnerTenantCoreAdapter = {
    createStarterTenant: async () => {
      calls += 1;
      throw new Error("must not run");
    },
  };
  const handler = createInternalSaaSTenantsPostHandler({
    enabled: false,
    isTrustedRequest: async () => true,
    adapter,
  });

  const response = await handler(request(input));
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
});

test("enabled but untrusted request fails closed before body or adapter access", async () => {
  let calls = 0;
  const handler = createInternalSaaSTenantsPostHandler({
    enabled: true,
    isTrustedRequest: async () => false,
    adapter: {
      createStarterTenant: async () => {
        calls += 1;
        throw new Error("must not run");
      },
    },
  });

  const response = await handler(request({ password: "must-never-be-read" }));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "unauthenticated");
  assert.equal(calls, 0);
});

test("trusted malformed input is rejected without adapter invocation", async () => {
  let calls = 0;
  const handler = createInternalSaaSTenantsPostHandler({
    enabled: true,
    isTrustedRequest: async () => true,
    adapter: {
      createStarterTenant: async () => {
        calls += 1;
        throw new Error("must not run");
      },
    },
  });

  const response = await handler(request({ ...input, storeId: "caller-authority" }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "invalid_input");
  assert.equal(calls, 0);
});

test("trusted valid input delegates to the configured adapter", async () => {
  let calls = 0;
  const adapter: OwnerTenantCoreAdapter = {
    createStarterTenant: async (received) => {
      calls += 1;
      assert.deepEqual(received, input);
      return {
        ok: false,
        error: { schemaVersion: 1, code: "service_unavailable", retryable: true },
      };
    },
  };
  const handler = createInternalSaaSTenantsPostHandler({
    enabled: true,
    isTrustedRequest: async () => true,
    adapter,
  });

  const response = await handler(request(input));
  assert.equal(response.status, 503);
  assert.equal(calls, 1);
});

test("responses and route sources expose no secrets or legacy provisioning fallback", async () => {
  const response = await POST(request({ password: "unsafe", token: "unsafe" }));
  const serialized = JSON.stringify(await response.json()).toLowerCase();
  assert.doesNotMatch(serialized, /unsafe|password|token|secret/);

  const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(routeSource, /store-provisioning|admin-deployment|storefront-deployment|create-store/i);
  assert.doesNotMatch(routeSource, /coolify|cloudflare|r2|logto|supabase/i);
});
