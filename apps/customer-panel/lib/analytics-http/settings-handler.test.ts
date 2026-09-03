import assert from "node:assert/strict";
import test from "node:test";
import { createCommerceAnalyticsSettingsHandler } from "./settings-handler.ts";

const ID = "10000000-0000-4000-8000-000000000001",
  NOW = new Date("2026-07-26T12:00:00.000Z"),
  PANEL = "https://panel.saas-staging.celebix.site",
  ORIGIN = "https://store.admin.saas-staging.celebix.site",
  COOKIE = "v1.key.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const settings = {
  candidateInactivityMinutes: 30,
  abandonedInactivityHours: 24,
  recoveryLinkHours: 72,
  automaticRecoveryEnabled: false,
  maximumMessageAttempts: 3,
  minimumMessageIntervalHours: 6,
  trackingPolicy: "anonymous_commerce",
  version: 1,
} as const;
function tenant(role = "store_owner") {
  return {
    schemaVersion: 1,
    requestId: ID,
    principal: {
      id: "20000000-0000-4000-8000-000000000001",
      issuer: "https://id.test",
      subject: "safe",
    },
    store: { id: ID, slug: "store", status: "active" },
    membership: {
      id: "30000000-0000-4000-8000-000000000001",
      role,
      status: "active",
    },
    entitlements: {
      schemaVersion: 1,
      planId: "00000000-0000-4000-8000-000000000001",
      planCode: "growth",
      version: 1,
      status: "active",
      features: ["analytics"],
      limits: { products: 1, staff: 1, storageBytes: 1 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  };
}
function fixture(role = "store_owner") {
  const calls: string[] = [];
  const runtime = {
    providerConfigured: true,
    access: {
      readiness: { mode: "approved_staging" },
      panelOrigin: PANEL,
      async resolveCredential() {
        return { kind: "authenticated", tenantContext: tenant(role) };
      },
    },
    analytics: {
      async commerceSettings() {
        calls.push("read");
        return settings;
      },
      async getConnection() {
        calls.push("connection");
        return {
          schemaVersion: 1,
          provider: "umami",
          status: "active",
          configured: true,
          hostname: "store.example.test",
          version: 1,
          lastVerifiedAt: NOW.toISOString(),
        };
      },
      async getConnectionAuthority() {
        calls.push("authority");
        return { websiteId: ID };
      },
      async updateCommerceSettings(input: Record<string, unknown>) {
        calls.push("update");
        return { ...settings, ...input, version: 2 };
      },
    },
    umami: {
      async getWebsite(websiteId: string) {
        calls.push("website");
        return { id: websiteId };
      },
    },
  };
  return {
    calls,
    handler: createCommerceAnalyticsSettingsHandler({
      resolveRuntime: async () => runtime as never,
      now: () => new Date(NOW),
      requestId: () => ID,
    }),
  };
}
function request(method = "GET", body?: unknown, origin = ORIGIN) {
  const headers = new Headers({
    host: "store.admin.saas-staging.celebix.site",
    cookie: `__Host-celebix_panel=${COOKIE}`,
  });
  if (method === "POST") {
    headers.set("origin", origin);
    headers.set("content-type", "application/json");
  }
  return new Request("http://internal:3400/api/analytics/settings", {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
test("settings read exposes safe connection state and real tenant thresholds", async () => {
  const value = fixture(),
    response = await value.handler(request());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.settings, settings);
  assert.deepEqual(body.connection, {
    provider: "umami",
    status: "active",
    configured: true,
    live: true,
  });
  assert.doesNotMatch(
    JSON.stringify(body),
    /hostname|websiteId|token|password/,
  );
});
test("analyst cannot read analytics settings or connection state", async () => {
  const value = fixture("analyst"),
    response = await value.handler(request());
  assert.equal(response.status, 403);
  assert.deepEqual(value.calls, []);
});
test("owner updates bounded settings while analyst and cross-origin mutation are denied", async () => {
  const body = { ...settings };
  delete (body as { version?: number }).version;
  const owner = fixture(),
    ok = await owner.handler(request("POST", { expectedVersion: 1, ...body }));
  assert.equal(ok.status, 200);
  assert.deepEqual(owner.calls, ["update"]);
  const analyst = fixture("analyst"),
    denied = await analyst.handler(
      request("POST", { expectedVersion: 1, ...body }),
    );
  assert.equal(denied.status, 403);
  assert.deepEqual(analyst.calls, []);
  assert.equal(
    (
      await fixture().handler(
        request("POST", { expectedVersion: 1, ...body }, "https://evil.test"),
      )
    ).status,
    403,
  );
});
test("settings body and method are exact", async () => {
  assert.equal(
    (
      await fixture().handler(
        request("POST", { expectedVersion: 1, ...settings, storeId: ID }),
      )
    ).status,
    400,
  );
  assert.equal((await fixture().handler(request("PUT"))).status, 405);
});
