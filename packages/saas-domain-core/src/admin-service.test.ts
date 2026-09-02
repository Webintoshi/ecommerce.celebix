import assert from "node:assert/strict";
import test from "node:test";

import type { AdminDomainView, TenantContext } from "@celebix/saas-contracts";

import { CloudflareCustomHostnameError, createAdminDomainService, type AdminDomainPersistence } from "./index.ts";

const DOMAIN = "77777777-7777-4777-8777-777777777777";
const OPERATION = "88888888-8888-4888-8888-888888888888";
const NOW = new Date("2026-09-02T12:00:00.000Z");
const VIEW: AdminDomainView = Object.freeze({
  schemaVersion: 1, id: DOMAIN, hostname: "admin.example.com", kind: "custom_alias", status: "pending_verification",
  primary: false, fallback: false, hostnameStatus: "pending", sslStatus: "pending", dnsStatus: "pending", originStatus: "pending",
  uiStatus: "dns_pending", dnsInstructions: Object.freeze([]), verifiedAt: null, lastCheckedAt: null, version: 1,
  createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
});
const TENANT = {
  schemaVersion: 1, requestId: OPERATION, principal: { id: "11111111-1111-4111-8111-111111111111", issuer: "https://id.test", subject: "owner" },
  store: { id: "22222222-2222-4222-8222-222222222222", slug: "store", status: "active" },
  membership: { id: "33333333-3333-4333-8333-333333333333", role: "store_owner", status: "active" },
  entitlements: { schemaVersion: 1, planId: "44444444-4444-4444-8444-444444444444", planCode: "pilot", version: 1, status: "active", features: ["custom_domains"], limits: { products: 1, staff: 1, storageBytes: 1, customDomains: 1 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR",
} satisfies TenantContext;

function persistence(overrides: Partial<AdminDomainPersistence> = {}): AdminDomainPersistence {
  return {
    async list() { return [VIEW]; }, async prepareCreate() { return { domain: VIEW, replayed: false }; },
    async bindProvider(input) { return Object.freeze({ ...VIEW, version: input.expectedVersion + 1 }); },
    async requestRecheck() { return VIEW; }, async makePrimary() { return VIEW; }, async disable() { return VIEW; }, ...overrides,
  };
}

test("creates and binds an exact custom admin hostname with recoverable provider idempotency", async () => {
  let bound: unknown;
  const service = createAdminDomainService({
    repository: persistence({ async bindProvider(input) { bound = input; return Object.freeze({ ...VIEW, version: 2 }); } }),
    provider: {
      async create() { throw new CloudflareCustomHostnameError("unavailable", true); },
      async find() { return { providerHostnameId: "cf-admin-1", hostname: "admin.example.com", hostnameStatus: "pending", sslStatus: "pending", ownershipValidation: { type: "txt", name: "_cf-custom-hostname.admin.example.com", value: "token" }, certificateValidation: [] }; },
      async get() { throw new Error("unused"); }, async remove() { return { deleted: true }; },
    },
    hostnamePolicy: { reservedSuffixes: ["celebix.site"], cnameTarget: "customers.celebix.site" }, generateId: () => DOMAIN,
  });
  assert.equal((await service.create({ tenantContext: TENANT, now: NOW, operationId: OPERATION, hostname: "ADMIN.Example.com." })).version, 2);
  assert.deepEqual(bound, {
    tenantContext: TENANT, now: NOW, domainId: DOMAIN, expectedVersion: 1, providerHostnameId: "cf-admin-1",
    ownershipValidation: [{ type: "TXT", name: "_cf-custom-hostname.admin.example.com", value: "token" }], certificateValidation: [],
  });
});

test("does not repeat provider mutation for a durable admin operation replay", async () => {
  let creates = 0;
  const service = createAdminDomainService({
    repository: persistence({ async prepareCreate() { return { domain: VIEW, replayed: true }; }, async list() { return [Object.freeze({ ...VIEW, version: 2 })]; } }),
    provider: { async create() { creates += 1; throw new Error("wrong"); }, async find() { return null; }, async get() { throw new Error("wrong"); }, async remove() { throw new Error("wrong"); } },
    hostnamePolicy: { reservedSuffixes: ["celebix.site"], cnameTarget: "customers.celebix.site" }, generateId: () => DOMAIN,
  });
  assert.equal((await service.create({ tenantContext: TENANT, now: NOW, operationId: OPERATION, hostname: "admin.example.com" })).id, DOMAIN);
  assert.equal(creates, 0);
});
