import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { CreateStarterTenantInput } from "@celebix/saas-contracts";
import type {
  OwnerTenantCoreAdapter,
  OwnerTenantCoreOutcome,
} from "../../../../lib/saas-tenant-core/adapter.ts";
import type { OwnerSaaSTenantRuntime } from "../../../../lib/saas-tenant-core/runtime.ts";

import { POST, createInternalSaaSTenantsPostHandler } from "./route.ts";

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

function postgresRuntime(adapter: OwnerTenantCoreAdapter): OwnerSaaSTenantRuntime {
  return {
    kind: "postgres",
    tenantCore: adapter,
    recovery: {
      recover: async () => ({
        ok: false,
        error: { schemaVersion: 1, code: "service_unavailable", retryable: true },
      }),
    },
  };
}

function successfulOutcome(replayed: boolean): OwnerTenantCoreOutcome {
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      operationId: "70000000-0000-4000-8000-000000000001",
      replayed,
      store: { id: "20000000-0000-4000-8000-000000000001", slug: input.store.slug, status: "active" },
      primaryDomain: {
        schemaVersion: 1,
        hostname: `${input.store.slug}.example.test`,
        domainId: "30000000-0000-4000-8000-000000000001",
        domainType: "platform_subdomain",
        storeId: "20000000-0000-4000-8000-000000000001",
        storeSlug: input.store.slug,
        canonicalHostname: `${input.store.slug}.example.test`,
        status: "active",
        cacheVersion: 1,
      },
      membership: {
        schemaVersion: 1,
        id: "40000000-0000-4000-8000-000000000001",
        principalId: "10000000-0000-4000-8000-000000000001",
        storeId: "20000000-0000-4000-8000-000000000001",
        role: "store_owner",
        status: "active",
        createdAt: input.requestedAt,
        updatedAt: input.requestedAt,
      },
      plan: {
        schemaVersion: 1,
        planId: "00000000-0000-4000-8000-000000000001",
        planCode: "free_starter",
        version: 1,
        status: "active",
        features: ["catalog", "orders", "customers", "content", "media", "analytics", "checkout"],
        limits: { products: 100, staff: 1, storageBytes: 1_000_000_000, monthlyOrders: 100, customDomains: 0 },
        validFrom: input.requestedAt,
      },
      mediaStorage: { schemaVersion: 1, status: "ready", version: 1 },
      provisioningStatus: "ready",
      panelUrl: `https://panel.example.test/stores/${input.store.slug}`,
      storefrontUrl: `https://${input.store.slug}.example.test`,
    },
  };
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
    runtime: { kind: "disabled", tenantCore: adapter, recovery: null },
    isTrustedRequest: async () => true,
  });

  const response = await handler(request(input));
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
});

test("enabled but untrusted request fails closed before body or adapter access", async () => {
  let calls = 0;
  const handler = createInternalSaaSTenantsPostHandler({
    runtime: postgresRuntime({
      createStarterTenant: async () => {
        calls += 1;
        throw new Error("must not run");
      },
    }),
    isTrustedRequest: async () => false,
  });

  const response = await handler(request({ password: "must-never-be-read" }));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "unauthenticated");
  assert.equal(calls, 0);
});

test("trusted malformed input is rejected without adapter invocation", async () => {
  let calls = 0;
  const handler = createInternalSaaSTenantsPostHandler({
    runtime: postgresRuntime({
      createStarterTenant: async () => {
        calls += 1;
        throw new Error("must not run");
      },
    }),
    isTrustedRequest: async () => true,
  });

  const response = await handler(request({ ...input, storeId: "caller-authority" }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "invalid_input");
  assert.equal(calls, 0);
});

test("unverified identity reaches Tenant Core mapping without database authority from the request", async () => {
  let calls = 0;
  const handler = createInternalSaaSTenantsPostHandler({
    runtime: postgresRuntime({
      createStarterTenant: async (received) => {
        calls += 1;
        assert.equal((received as { principal: { emailVerified: boolean } }).principal.emailVerified, false);
        return {
          ok: false,
          error: { schemaVersion: 1, code: "identity_unverified", field: "principal.emailVerified", retryable: false },
        };
      },
    }),
    isTrustedRequest: async () => true,
  });

  const response = await handler(request({ ...input, principal: { ...input.principal, emailVerified: false } }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "identity_unverified");
  assert.equal(calls, 1);
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
    runtime: postgresRuntime(adapter),
    isTrustedRequest: async () => true,
  });

  const response = await handler(request(input));
  assert.equal(response.status, 503);
  assert.equal(calls, 1);
});

test("trust verifier exceptions fail closed before reading the body or invoking the adapter", async () => {
  let bodyReads = 0;
  let adapterCalls = 0;
  const unsafeRequest = {
    json: async () => {
      bodyReads += 1;
      return input;
    },
  } as Request;
  const handler = createInternalSaaSTenantsPostHandler({
    runtime: postgresRuntime({
      createStarterTenant: async () => {
        adapterCalls += 1;
        throw new Error("must not run");
      },
    }),
    isTrustedRequest: async () => {
      throw new Error("private verifier detail");
    },
  });

  const response = await handler(unsafeRequest);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: { schemaVersion: 1, code: "service_unavailable", retryable: true },
  });
  assert.equal(bodyReads, 0);
  assert.equal(adapterCalls, 0);
});

test("adapter exceptions become a safe retryable transaction failure", async () => {
  const handler = createInternalSaaSTenantsPostHandler({
    runtime: postgresRuntime({
      createStarterTenant: async () => {
        throw new Error("private database stack and provider response");
      },
    }),
    isTrustedRequest: async () => true,
  });

  const response = await handler(request(input));
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    ok: false,
    error: { schemaVersion: 1, code: "tenant_transaction_failed", retryable: true },
  });
  assert.doesNotMatch(JSON.stringify(body), /private|database|stack|provider/i);
});

test("first creation is 201, replay is 200, and unknown COMMIT stays non-retryable", async () => {
  for (const [replayed, expectedStatus] of [[false, 201], [true, 200]] as const) {
    const handler = createInternalSaaSTenantsPostHandler({
      runtime: postgresRuntime({ createStarterTenant: async () => successfulOutcome(replayed) }),
      isTrustedRequest: async () => true,
    });
    const response = await handler(request(input));
    assert.equal(response.status, expectedStatus);
    assert.equal((await response.json()).value.replayed, replayed);
  }

  const unknown = createInternalSaaSTenantsPostHandler({
    runtime: postgresRuntime({
      createStarterTenant: async () => ({
        ok: false,
        error: { schemaVersion: 1, code: "tenant_transaction_failed", retryable: false },
      }),
    }),
    isTrustedRequest: async () => true,
  });
  const response = await unknown(request(input));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: { schemaVersion: 1, code: "tenant_transaction_failed", retryable: false },
  });
});

test("all tenant authority conflicts map to a safe 409 response", async () => {
  for (const code of ["slug_taken", "domain_conflict", "membership_conflict", "idempotency_mismatch"] as const) {
    const handler = createInternalSaaSTenantsPostHandler({
      runtime: postgresRuntime({
        createStarterTenant: async () => ({
          ok: false,
          error: { schemaVersion: 1, code, retryable: false },
        }),
      }),
      isTrustedRequest: async () => true,
    });
    const response = await handler(request(input));
    assert.equal(response.status, 409, code);
    assert.equal((await response.json()).error.code, code);
  }
});

test("responses and route sources expose no secrets or legacy provisioning fallback", async () => {
  const response = await POST(request({ password: "unsafe", token: "unsafe" }));
  const serialized = JSON.stringify(await response.json()).toLowerCase();
  assert.doesNotMatch(serialized, /unsafe|password|token|secret/);

  const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(routeSource, /store-provisioning|admin-deployment|storefront-deployment|create-store/i);
  assert.doesNotMatch(routeSource, /coolify|cloudflare|r2|logto|supabase/i);
  assert.doesNotMatch(routeSource, /process\.env|SELF_SERVE|INTERNAL_SAAS/i);
});
