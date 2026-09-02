import assert from "node:assert/strict";
import test from "node:test";

import type { AdminDomainView, StoreDomainView, TenantContext } from "@celebix/saas-contracts";

import {
  CloudflareCustomHostnameError,
  createStoreDomainService,
  type AdminDomainPersistence,
  type StoreDomainPersistence,
} from "./index.ts";

const STORE = "33333333-3333-4333-8333-333333333333";
const DOMAIN = "77777777-7777-4777-8777-777777777777";
const ADMIN_DOMAIN = "99999999-9999-4999-8999-999999999999";
const OPERATION = "88888888-8888-4888-8888-888888888888";
const NOW = new Date("2026-08-05T12:00:00.000Z");
const VIEW: StoreDomainView = Object.freeze({
  schemaVersion: 1, id: DOMAIN, hostname: "www.example.com", hostnameType: "custom_domain", status: "pending",
  primary: false, uiStatus: "dns_pending", dnsInstructions: Object.freeze([]), verifiedAt: null, version: 1,
  createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
});
const ADMIN_VIEW: AdminDomainView = Object.freeze({
  schemaVersion: 1, id: ADMIN_DOMAIN, hostname: "admin.example.com", kind: "custom_alias", status: "pending_verification",
  primary: false, fallback: false, hostnameStatus: "pending", sslStatus: "pending", dnsStatus: "pending", originStatus: "pending",
  uiStatus: "dns_pending", dnsInstructions: Object.freeze([]), verifiedAt: null, lastCheckedAt: null, version: 1,
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

function adminPersistence(overrides: Partial<AdminDomainPersistence> = {}): AdminDomainPersistence {
  return {
    async list() { return [ADMIN_VIEW]; }, async prepareCreate() { return { domain: ADMIN_VIEW, replayed: false }; },
    async bindProvider(input) { return Object.freeze({ ...ADMIN_VIEW, version: input.expectedVersion + 1 }); },
    async requestRecheck() { return ADMIN_VIEW; }, async makePrimary() { return ADMIN_VIEW; }, async disable() { return ADMIN_VIEW; },
    ...overrides,
  };
}

test("prepares and provisions one storefront/admin bundle with separate configured targets", async () => {
  const prepared: unknown[] = [];
  const bound: unknown[] = [];
  const ids = [DOMAIN, ADMIN_DOMAIN];
  const service = createStoreDomainService({
    repository: persistence({
      async prepareBundle(input) { prepared.push(input); return { storefront: VIEW, admin: ADMIN_VIEW, replayed: false }; },
      async bindProvider(input) { bound.push(["storefront", input]); return Object.freeze({ ...VIEW, version: 2 }); },
    }),
    adminRepository: adminPersistence({ async bindProvider(input) { bound.push(["admin", input]); return Object.freeze({ ...ADMIN_VIEW, version: 2 }); } }),
    provider: {
      async create(hostname) { return { providerHostnameId: `cf-${hostname}`, hostname, hostnameStatus: "pending", sslStatus: "pending", ownershipValidation: null, certificateValidation: [] }; },
      async find() { return null; }, async get() { throw new Error("unused"); }, async remove() { return { deleted: true }; },
    },
    adminProvider: {
      async create(hostname) { return { providerHostnameId: `cf-${hostname}`, hostname, hostnameStatus: "pending", sslStatus: "pending", ownershipValidation: null, certificateValidation: [] }; },
      async find() { return null; }, async get() { throw new Error("unused"); }, async remove() { return { deleted: true }; },
    },
    hostnamePolicy: { reservedSuffixes: ["celebix.site"], cnameTarget: "shops.celebix.site" },
    adminHostnamePolicy: { reservedSuffixes: ["celebix.site"], cnameTarget: "customers.celebix.site" },
    generateId: () => ids.shift() ?? "wrong",
  });

  const created = await service.create({ tenantContext: TENANT, now: NOW, operationId: OPERATION, hostname: "https://www.example.com" });
  assert.equal(created.version, 2);
  assert.deepEqual(prepared, [{
    tenantContext: TENANT, now: NOW, operationId: OPERATION, fingerprint: "bfd707fef5d5c19cc5d4ee1feccdbf2eb459e115b113c1000b80944afc203186",
    domainId: DOMAIN, hostname: "www.example.com", provider: "cloudflare_for_saas", cnameTarget: "shops.celebix.site",
    adminDomainId: ADMIN_DOMAIN, adminHostname: "admin.example.com", adminCnameTarget: "customers.celebix.site",
  }]);
  assert.deepEqual(bound.map((entry) => { const [purpose, value] = entry as [string, { domainId: string; providerHostnameId: string }]; return [purpose, value.domainId, value.providerHostnameId]; }), [
    ["storefront", DOMAIN, "cf-www.example.com"], ["admin", ADMIN_DOMAIN, "cf-admin.example.com"],
  ]);
});

test("keeps a bound storefront when admin provisioning fails and resumes the companion on replay", async () => {
  let replayed = false, storefront = VIEW, admin = ADMIN_VIEW, adminFinds = 0;
  const ids = [DOMAIN, ADMIN_DOMAIN, DOMAIN, ADMIN_DOMAIN];
  const service = createStoreDomainService({
    repository: persistence({
      async prepareBundle() { const result = { storefront: VIEW, admin: ADMIN_VIEW, replayed }; replayed = true; return result; },
      async list() { return [storefront]; },
      async bindProvider(input) { storefront = Object.freeze({ ...VIEW, version: input.expectedVersion + 1 }); return storefront; },
    }),
    adminRepository: adminPersistence({
      async list() { return [admin]; },
      async bindProvider(input) { admin = Object.freeze({ ...ADMIN_VIEW, version: input.expectedVersion + 1 }); return admin; },
    }),
    provider: { async create(hostname) { return { providerHostnameId: "cf-store", hostname, hostnameStatus: "pending", sslStatus: "pending", ownershipValidation: null, certificateValidation: [] }; }, async find(hostname) { return { providerHostnameId: "cf-store", hostname, hostnameStatus: "pending", sslStatus: "pending", ownershipValidation: null, certificateValidation: [] }; }, async get() { throw new Error("unused"); }, async remove() { return { deleted: true }; } },
    adminProvider: { async create() { throw new CloudflareCustomHostnameError("unavailable", true); }, async find(hostname) { adminFinds += 1; return adminFinds === 1 ? null : { providerHostnameId: "cf-admin", hostname, hostnameStatus: "pending", sslStatus: "pending", ownershipValidation: null, certificateValidation: [] }; }, async get() { throw new Error("unused"); }, async remove() { return { deleted: true }; } },
    hostnamePolicy: { reservedSuffixes: ["celebix.site"], cnameTarget: "shops.celebix.site" },
    adminHostnamePolicy: { reservedSuffixes: ["celebix.site"], cnameTarget: "customers.celebix.site" },
    generateId: () => ids.shift() ?? "wrong",
  });
  assert.equal((await service.create({ tenantContext: TENANT, now: NOW, operationId: OPERATION, hostname: "www.example.com" })).version, 2);
  assert.equal(admin.version, 1);
  assert.equal((await service.create({ tenantContext: TENANT, now: NOW, operationId: OPERATION, hostname: "www.example.com" })).version, 2);
  assert.equal(admin.version, 2);
});

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
