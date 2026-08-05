import assert from "node:assert/strict";
import test from "node:test";

import type { StoreDomainView, TenantContext } from "@celebix/saas-contracts";
import { StoreDomainServiceError, type StoreDomainService } from "@celebix/saas-domain-core";

import { createStoreDomainHttpHandlers } from "./handler.ts";

const ORIGIN = "https://panel.test";
const NOW = new Date("2026-08-05T12:00:00.000Z");
const REQUEST = "78000000-0000-4000-8000-000000000088";
const OPERATION = "79000000-0000-4000-8000-000000000088";
const DOMAIN = "77000000-0000-4000-8000-000000000088";
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 1).toString("base64url")}`;
const DOMAIN_VIEW: StoreDomainView = Object.freeze({ schemaVersion: 1, id: DOMAIN, hostname: "www.example.com", hostnameType: "custom_domain", status: "pending", primary: false, uiStatus: "dns_pending", dnsInstructions: Object.freeze([{ type: "CNAME" as const, name: "www.example.com", value: "shops.celebix.site" }]), verifiedAt: null, version: 1, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() });

function tenant(role: "store_owner" | "analyst" = "store_owner"): TenantContext {
  return { schemaVersion: 1, requestId: REQUEST, principal: { id: "10000000-0000-4000-8000-000000000088", issuer: "https://id.test", subject: "private" }, store: { id: "20000000-0000-4000-8000-000000000088", slug: "store", status: "active" }, membership: { id: "30000000-0000-4000-8000-000000000088", role, status: "active" }, entitlements: { schemaVersion: 1, planId: "40000000-0000-4000-8000-000000000088", planCode: "pilot", version: 1, status: "active", features: ["custom_domains"], limits: { products: 100, staff: 5, storageBytes: 100, customDomains: 1 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" };
}
function service(overrides: Partial<StoreDomainService> = {}): StoreDomainService {
  return { async list() { return [DOMAIN_VIEW]; }, async create() { return DOMAIN_VIEW; }, async requestRecheck() { return DOMAIN_VIEW; }, async makePrimary() { return DOMAIN_VIEW; }, async disable() { return DOMAIN_VIEW; }, ...overrides };
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
