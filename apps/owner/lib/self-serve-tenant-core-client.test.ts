import assert from "node:assert/strict";
import test from "node:test";

import type { CreateStarterTenantInput } from "@celebix/saas-contracts";

type ClientModule = typeof import("./self-serve-tenant-core-client");
const clients = await import(new URL("./self-serve-tenant-core-client.ts", import.meta.url).href).catch(
  () => ({} as Partial<ClientModule>),
);

const input: CreateStarterTenantInput = {
  schemaVersion: 1,
  idempotencyKey: "ssik_test",
  principal: {
    issuer: "https://identity.example.test/oidc",
    subject: "subject_123",
    email: "owner@example.test",
    emailVerified: true,
  },
  store: {
    name: "Çiçek Pazarı",
    slug: "cicek-pazari",
    locale: "tr",
    currency: "TRY",
    themeKey: "starter",
  },
  consents: { privacyAcceptedAt: "2026-07-10T09:00:00.000Z" },
  requestedAt: "2026-07-10T10:00:00.000Z",
};

test("exports deterministic fake and disabled Tenant Core clients", () => {
  assert.equal(typeof clients.DeterministicFakeTenantCoreClient, "function");
  assert.equal(typeof clients.DisabledTenantCoreClient, "function");
});

test("the deterministic fake returns contract-compatible stable authority IDs", async () => {
  if (!clients.DeterministicFakeTenantCoreClient) return;
  const client = new clients.DeterministicFakeTenantCoreClient();
  const first = await client.createStarterTenant(input);
  const second = await client.createStarterTenant(input);

  assert.equal(first.ok, true);
  assert.deepEqual(second, first);
  if (!first.ok) return;
  assert.equal(first.value.store.slug, "cicek-pazari");
  assert.equal(first.value.membership.status, "active");
  assert.equal(first.value.membership.storeId, first.value.store.id);
  assert.equal(first.value.provisioningStatus, "ready");
});

test("the production placeholder fails closed without returning a fake URL", async () => {
  if (!clients.DisabledTenantCoreClient) return;
  const client = new clients.DisabledTenantCoreClient();
  const result = await client.createStarterTenant(input);

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "tenant_transaction_failed");
  assert.equal(result.error.retryable, false);
  assert.equal(JSON.stringify(result).includes("panelUrl"), false);
  assert.equal(JSON.stringify(result).includes("storefrontUrl"), false);
});

test("maps unknown failures to a typed safe customer-facing error", () => {
  if (!clients.mapTenantCoreError) return;
  const mapped = clients.mapTenantCoreError(
    new Error("postgres://private-user:private-password@10.0.0.4/tenant"),
  );

  assert.deepEqual(mapped, {
    schemaVersion: 1,
    code: "tenant_transaction_failed",
    retryable: false,
    safeMessage: "Mağaza oluşturma işlemi güvenli şekilde tamamlanamadı.",
  });
  assert.equal(JSON.stringify(mapped).includes("postgres"), false);
});
