import assert from "node:assert/strict";
import test from "node:test";

import type { StoreDomainReplacementView, StoreDomainView, TenantContext } from "@celebix/saas-contracts";
import { StoreDomainServiceError, type StoreDomainService } from "@celebix/saas-domain-core";

import { createStoreDomainHttpHandlers } from "./handler.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const TENANT_ADMIN_ORIGIN = "https://guzide-kuyumcu-4.admin.saas-staging.celebix.site";
const OTHER_TENANT_ADMIN_ORIGIN = "https://other-store.admin.saas-staging.celebix.site";
const NOW = new Date("2026-08-05T12:00:00.000Z");
const REQUEST = "78000000-0000-4000-8000-000000000088";
const OPERATION = "79000000-0000-4000-8000-000000000088";
const DOMAIN = "77000000-0000-4000-8000-000000000088";
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 1).toString("base64url")}`;
const DOMAIN_VIEW: StoreDomainView = Object.freeze({ schemaVersion: 1, id: DOMAIN, hostname: "www.example.com", hostnameType: "custom_domain", status: "pending", primary: false, uiStatus: "dns_pending", dnsInstructions: Object.freeze([{ type: "CNAME" as const, name: "www.example.com", value: "shops.celebix.site" }]), verifiedAt: null, version: 1, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() });
const REPLACEMENT: StoreDomainReplacementView = Object.freeze({ schemaVersion: 1, id: OPERATION, sourceStorefrontDomainId: DOMAIN, targetStorefrontDomainId: "76000000-0000-4000-8000-000000000088", targetAdminDomainId: "75000000-0000-4000-8000-000000000088", status: "preparing", ready: false, version: 1, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() });

function tenant(role: "store_owner" | "analyst" = "store_owner"): TenantContext {
  return { schemaVersion: 1, requestId: REQUEST, principal: { id: "10000000-0000-4000-8000-000000000088", issuer: "https://id.test", subject: "private" }, store: { id: "20000000-0000-4000-8000-000000000088", slug: "guzide-kuyumcu-4", status: "active" }, membership: { id: "30000000-0000-4000-8000-000000000088", role, status: "active" }, entitlements: { schemaVersion: 1, planId: "40000000-0000-4000-8000-000000000088", planCode: "pilot", version: 1, status: "active", features: ["custom_domains"], limits: { products: 100, staff: 5, storageBytes: 100, customDomains: 1 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" };
}
function service(overrides: Partial<StoreDomainService> = {}): StoreDomainService {
  return { async list() { return [DOMAIN_VIEW]; }, async create() { return DOMAIN_VIEW; }, async listReplacements() { return [REPLACEMENT]; }, async createReplacement() { return REPLACEMENT; }, async activateReplacement() { return REPLACEMENT; }, async cancelReplacement() { return REPLACEMENT; }, async rollbackReplacement() { return REPLACEMENT; }, async requestRecheck() { return DOMAIN_VIEW; }, async makePrimary() { return DOMAIN_VIEW; }, async disable() { return DOMAIN_VIEW; }, ...overrides };
}
function handlers(domains: StoreDomainService, role: "store_owner" | "analyst" = "store_owner") {
  return createStoreDomainHttpHandlers({
    async resolveRuntime() { return { domains, access: { readiness: { mode: "approved_staging" }, panelOrigin: ORIGIN, async resolveCredential() { return { kind: "authenticated", session: {}, tenantContext: tenant(role) }; }, async rotateCredential() { return { kind: "unavailable" }; }, async revokeCredential() { return { kind: "unavailable" }; } } } as never; },
    now: () => new Date(NOW), requestId: () => REQUEST,
  });
}
function request(path: string, method = "GET", body?: unknown, origin = ORIGIN, operation = OPERATION) {
  const headers = new Headers({ cookie: `__Host-celebix_panel=${CREDENTIAL}` });
  if (method !== "GET") { headers.set("origin", origin); headers.set("content-type", "application/json"); headers.set("idempotency-key", operation); }
  return new Request(`http://internal:3400${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

test("lists and creates through server-derived tenant authority only", async () => {
  const calls: unknown[] = [];
  const selected = handlers(service({ async list(input) { calls.push(input); return [DOMAIN_VIEW]; }, async create(input) { calls.push(input); return DOMAIN_VIEW; } }));
  const list = await selected.collection(request("/api/store-domains"));
  const create = await selected.collection(request("/api/store-domains", "POST", { hostname: "www.example.com" }));
  assert.equal(list.status, 200); assert.deepEqual(await list.json(), { items: [DOMAIN_VIEW] });
  assert.equal(create.status, 202); assert.deepEqual(await create.json(), { domain: DOMAIN_VIEW });
  assert.equal((calls[1] as { operationId: string }).operationId, OPERATION);
  assert.equal(JSON.stringify(calls).includes(CREDENTIAL), false);
});

test("versioned recheck primary and removal use exact domain and version", async () => {
  const calls: unknown[] = [];
  const selected = handlers(service({ async requestRecheck(input) { calls.push(["recheck", input]); return DOMAIN_VIEW; }, async makePrimary(input) { calls.push(["primary", input]); return DOMAIN_VIEW; }, async disable(input) { calls.push(["disable", input]); return DOMAIN_VIEW; } }));
  assert.equal((await selected.recheck(request(`/api/store-domains/${DOMAIN}/recheck`, "POST", { expectedVersion: 1 }), DOMAIN)).status, 200);
  assert.equal((await selected.primary(request(`/api/store-domains/${DOMAIN}/primary`, "POST", { expectedVersion: 1 }), DOMAIN)).status, 200);
  assert.equal((await selected.item(request(`/api/store-domains/${DOMAIN}`, "DELETE", { expectedVersion: 1 }), DOMAIN)).status, 200);
  assert.deepEqual(calls.map((entry) => (entry as unknown[])[0]), ["recheck", "primary", "disable"]);
});

test("tenant admin domain mutations survive internal proxy delivery and stay store-bound", async () => {
  const calls: unknown[] = [];
  const selected = handlers(service({ async create(input) { calls.push(input); return DOMAIN_VIEW; } }));

  const accepted = await selected.collection(request("/api/store-domains", "POST", { hostname: "www.example.com" }, TENANT_ADMIN_ORIGIN));
  assert.equal(accepted.status, 202);
  assert.equal(calls.length, 1);

  const rejected = await selected.collection(request("/api/store-domains", "POST", { hostname: "www.example.com" }, OTHER_TENANT_ADMIN_ORIGIN));
  assert.equal(rejected.status, 403);
  assert.deepEqual(await rejected.json(), { code: "origin_denied" });
  assert.equal(calls.length, 1);
});

test("origin session permissions shape and private authority fail closed", async () => {
  const selected = handlers(service());
  assert.equal((await selected.collection(request("/api/store-domains", "POST", { hostname: "www.example.com" }, "https://attacker.test"))).status, 403);
  assert.equal((await selected.collection(request("/api/store-domains", "POST", { hostname: "www.example.com", storeId: "x" }))).status, 400);
  assert.equal((await selected.recheck(request(`/api/store-domains/${DOMAIN}/recheck`, "POST", { expectedVersion: 0 }), DOMAIN)).status, 400);
  assert.equal((await handlers(service(), "analyst").collection(request("/api/store-domains", "POST", { hostname: "www.example.com" }))).status, 403);
  const noCookie = new Request("http://internal:3400/api/store-domains");
  assert.equal((await selected.collection(noCookie)).status, 401);
});

test("finite domain failures map without exposing provider details", async () => {
  for (const [code, status] of [["feature_not_enabled", 403], ["limit_reached", 409], ["hostname_already_claimed", 409], ["provider_unavailable", 503]] as const) {
    const selected = handlers(service({ async create() { throw new StoreDomainServiceError(code); } }));
    const response = await selected.collection(request("/api/store-domains", "POST", { hostname: "www.example.com" }));
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { code });
  }
});

test("replacement endpoints keep source authority server-derived and transitions versioned", async () => {
  const calls: unknown[] = [];
  const selected = handlers(service({
    async listReplacements(input) { calls.push(["list", input]); return [REPLACEMENT]; },
    async createReplacement(input) { calls.push(["create", input]); return REPLACEMENT; },
    async activateReplacement(input) { calls.push(["activate", input]); return { ...REPLACEMENT, status: "activated", ready: true, version: 2 }; },
    async cancelReplacement(input) { calls.push(["cancel", input]); return { ...REPLACEMENT, status: "cancelled", version: 2 }; },
    async rollbackReplacement(input) { calls.push(["rollback", input]); return { ...REPLACEMENT, status: "rolled_back", version: 3 }; },
  }));
  assert.equal((await selected.replacements(request("/api/store-domain-replacements"))).status, 200);
  assert.equal((await selected.replacements(request("/api/store-domain-replacements", "POST", { sourceStorefrontDomainId: DOMAIN, hostname: "example.com" }))).status, 202);
  for (const action of ["activate", "cancel", "rollback"] as const) {
    assert.equal((await selected.replacementAction(request(`/api/store-domain-replacements/${OPERATION}/${action}`, "POST", { expectedVersion: 1 }), OPERATION, action)).status, 200);
  }
  assert.deepEqual(calls.map((entry) => (entry as unknown[])[0]), ["list", "create", "activate", "cancel", "rollback"]);
  assert.equal(JSON.stringify(calls).includes(CREDENTIAL), false);
});

test("replacement inputs and tenant origins fail closed", async () => {
  const selected = handlers(service());
  assert.equal((await selected.replacements(request("/api/store-domain-replacements", "POST", { sourceStorefrontDomainId: "bad", hostname: "example.com" }))).status, 400);
  assert.equal((await selected.replacements(request("/api/store-domain-replacements", "POST", { sourceStorefrontDomainId: DOMAIN, hostname: "example.com" }, OTHER_TENANT_ADMIN_ORIGIN))).status, 403);
  assert.equal((await selected.replacementAction(request(`/api/store-domain-replacements/${OPERATION}/activate`, "POST", { expectedVersion: 0 }), OPERATION, "activate")).status, 400);
});
