import assert from "node:assert/strict";
import test from "node:test";

import type { StoreDomainView, TenantContext } from "@celebix/saas-contracts";

import {
  CloudflareCustomHostnameError,
  createStoreDomainService,
  type StoreDomainPersistence,
} from "./index.ts";

const STORE = "33333333-3333-4333-8333-333333333333";
const DOMAIN = "77777777-7777-4777-8777-777777777777";
const OPERATION = "88888888-8888-4888-8888-888888888888";
const NOW = new Date("2026-08-05T12:00:00.000Z");
const VIEW: StoreDomainView = Object.freeze({
  schemaVersion: 1, id: DOMAIN, hostname: "www.example.com", hostnameType: "custom_domain", status: "pending",
  primary: false, uiStatus: "dns_pending", dnsInstructions: Object.freeze([]), verifiedAt: null, version: 1,
  createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
});

const TENANT = {
  schemaVersion: 1, requestId: "request", principal: { id: "44444444-4444-4444-8444-444444444444", issuer: "https://id.test", subject: "subject" },
  store: { id: STORE, slug: "store", status: "active" }, membership: { id: "55555555-5555-4555-8555-555555555555", role: "store_owner", status: "active" },
  entitlements: { schemaVersion: 1, planId: "66666666-6666-4666-8666-666666666666", planCode: "pilot", version: 1, status: "active", features: ["custom_domains"], limits: { products: 1, staff: 1, storageBytes: 1, customDomains: 1 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR",
} satisfies TenantContext;

function persistence(overrides: Partial<StoreDomainPersistence> = {}): StoreDomainPersistence {
  return {
    async list() { return [VIEW]; },
    async prepareCreate() { return { domain: VIEW, replayed: false }; },
    async bindProvider(input) { return Object.freeze({ ...VIEW, version: input.expectedVersion + 1 }); },
    async requestRecheck() { return VIEW; }, async makePrimary() { return VIEW; }, async disable() { return VIEW; },
    ...overrides,
  };
}

test("creates a normalized hostname and binds recovered ambiguous provider authority once", async () => {
  let creates = 0;
  let bound: unknown;
  const service = createStoreDomainService({
    repository: persistence({ async bindProvider(input) { bound = input; return Object.freeze({ ...VIEW, version: 2 }); } }),
    provider: {
      async create() { creates += 1; throw new CloudflareCustomHostnameError("unavailable", true); },
      async find() { return { providerHostnameId: "cf-host-1", hostname: "www.example.com", hostnameStatus: "pending", sslStatus: "pending", ownershipValidation: { type: "txt", name: "_cf-custom-hostname.www.example.com", value: "token" }, certificateValidation: [] }; },
      async get() { throw new Error("unused"); }, async remove() { return { deleted: true }; },
    },
    hostnamePolicy: { reservedSuffixes: ["celebix.site"], cnameTarget: "shops.celebix.site" },
    generateId: () => DOMAIN,
  });
  assert.equal((await service.create({ tenantContext: TENANT, now: NOW, operationId: OPERATION, hostname: "WWW.Example.com." })).version, 2);
  assert.equal(creates, 1);
  assert.deepEqual(bound, {
    tenantContext: TENANT, now: NOW, domainId: DOMAIN, expectedVersion: 1, providerHostnameId: "cf-host-1",
    ownershipValidation: [{ type: "TXT", name: "_cf-custom-hostname.www.example.com", value: "token" }], certificateValidation: [],
  });
});

test("a durable operation replay returns current state without another provider mutation", async () => {
  let providerCreates = 0;
  const service = createStoreDomainService({
    repository: persistence({ async prepareCreate() { return { domain: VIEW, replayed: true }; } }),
    provider: {
      async create() { providerCreates += 1; throw new Error("wrong"); }, async get() { throw new Error("wrong"); },
      async find() { return { providerHostnameId: "cf-host-1", hostname: "www.example.com", hostnameStatus: "pending", sslStatus: "pending", ownershipValidation: null, certificateValidation: [] }; },
      async remove() { throw new Error("wrong"); },
    },
    hostnamePolicy: { reservedSuffixes: ["celebix.site"], cnameTarget: "shops.celebix.site" }, generateId: () => DOMAIN,
  });
  assert.equal((await service.create({ tenantContext: TENANT, now: NOW, operationId: OPERATION, hostname: "www.example.com" })).version, 2);
  assert.equal(providerCreates, 0);
});

test("forwards versioned merchant actions only through persistence authority", async () => {
  let primary: unknown;
  const service = createStoreDomainService({
    repository: persistence({ async makePrimary(input) { primary = input; return Object.freeze({ ...VIEW, status: "active", primary: true, verifiedAt: NOW.toISOString(), uiStatus: "active" }); } }),
    provider: { async create() { throw new Error("unused"); }, async get() { throw new Error("unused"); }, async find() { return null; }, async remove() { return { deleted: true }; } },
    hostnamePolicy: { reservedSuffixes: ["celebix.site"], cnameTarget: "shops.celebix.site" }, generateId: () => DOMAIN,
  });
  await service.makePrimary({ tenantContext: TENANT, now: NOW, domainId: DOMAIN, expectedVersion: 2 });
  assert.deepEqual(primary, { tenantContext: TENANT, now: NOW, domainId: DOMAIN, expectedVersion: 2 });
});
