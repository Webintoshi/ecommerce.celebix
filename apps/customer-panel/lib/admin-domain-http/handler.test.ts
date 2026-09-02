import assert from "node:assert/strict";
import test from "node:test";

import type { AdminDomainView, TenantContext } from "@celebix/saas-contracts";
import type { AdminDomainService } from "@celebix/saas-domain-core";

import { createAdminDomainHttpHandlers } from "./handler.ts";

const CENTRAL = "https://panel.saas-staging.celebix.site";
const CUSTOM = "https://admin.guzidekuyumcu.com.tr";
const NOW = new Date("2026-09-02T12:00:00.000Z");
const REQUEST = "78000000-0000-4000-8000-000000000120";
const OPERATION = "79000000-0000-4000-8000-000000000120";
const DOMAIN = "77000000-0000-4000-8000-000000000120";
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 1).toString("base64url")}`;
const VIEW: AdminDomainView = Object.freeze({
  schemaVersion: 1, id: DOMAIN, hostname: "admin.guzidekuyumcu.com.tr", kind: "custom_alias", status: "pending_verification",
  primary: false, fallback: false, hostnameStatus: "pending", sslStatus: "pending", dnsStatus: "pending", originStatus: "pending",
  uiStatus: "dns_pending", dnsInstructions: Object.freeze([{ type: "CNAME" as const, name: "admin.guzidekuyumcu.com.tr", value: "customers.saas-staging.celebix.site" }]),
  verifiedAt: null, lastCheckedAt: null, version: 1, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
});
const TENANT = { schemaVersion: 1, requestId: REQUEST, principal: { id: "10000000-0000-4000-8000-000000000120", issuer: "https://id.test", subject: "owner" }, store: { id: "20000000-0000-4000-8000-000000000120", slug: "guzide-kuyumcu-4", status: "active" }, membership: { id: "30000000-0000-4000-8000-000000000120", role: "store_owner", status: "active" }, entitlements: { schemaVersion: 1, planId: "40000000-0000-4000-8000-000000000120", planCode: "pilot", version: 1, status: "active", features: ["custom_domains"], limits: { products: 100, staff: 5, storageBytes: 100, customDomains: 1 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" } satisfies TenantContext;

function service(overrides: Partial<AdminDomainService> = {}): AdminDomainService {
  return { async list() { return [VIEW]; }, async create() { return VIEW; }, async requestRecheck() { return VIEW; }, async makePrimary() { return VIEW; }, async disable() { return VIEW; }, ...overrides };
}
function handlers(domains: AdminDomainService) {
  return createAdminDomainHttpHandlers({
    async resolveRuntime() { return { domains, access: { readiness: { mode: "approved_staging" }, panelOrigin: CENTRAL, async resolveCredential() { return { kind: "authenticated", session: {}, tenantContext: TENANT }; }, async rotateCredential() { return { kind: "unavailable" }; }, async revokeCredential() { return { kind: "unavailable" }; } } } as never; },
    now: () => new Date(NOW), requestId: () => REQUEST,
  });
}
function request(path: string, method = "GET", body?: unknown, origin = CUSTOM, host = "admin.guzidekuyumcu.com.tr") {
  const headers = new Headers({ cookie: `__Host-celebix_panel=${CREDENTIAL}`, host });
  if (method !== "GET") { headers.set("origin", origin); headers.set("content-type", "application/json"); headers.set("idempotency-key", OPERATION); }
  return new Request(`http://customer-panel:3400${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

test("lists admin hostnames but denies merchant arbitrary admin creation", async () => {
  const calls: unknown[] = [];
  const selected = handlers(service({ async list(input) { calls.push(input); return [VIEW]; }, async create(input) { calls.push(input); return VIEW; } }));
  assert.equal((await selected.collection(request("/api/admin-domains"))).status, 200);
  const denied = await selected.collection(request("/api/admin-domains", "POST", { hostname: "admin.guzidekuyumcu.com.tr" }));
  assert.equal(denied.status, 405);
  assert.equal(denied.headers.get("allow"), "GET");
  assert.equal(calls.length, 1);
  assert.equal(JSON.stringify(calls).includes(CREDENTIAL), false);
});

test("custom admin collection mutation remains unavailable for every merchant origin", async () => {
  const selected = handlers(service());
  assert.equal((await selected.collection(request("/api/admin-domains", "POST", { hostname: "admin.guzidekuyumcu.com.tr" }, "https://attacker.test"))).status, 405);
  assert.equal((await selected.collection(request("/api/admin-domains", "POST", { hostname: "admin.guzidekuyumcu.com.tr" }, CUSTOM, "other.example.test"))).status, 405);
});

test("only admin recheck remains mutable while primary and disable are bundle-controlled", async () => {
  const calls: unknown[] = [];
  const selected = handlers(service({ async requestRecheck(input) { calls.push(input); return VIEW; }, async makePrimary(input) { calls.push(input); return VIEW; }, async disable(input) { calls.push(input); return VIEW; } }));
  assert.equal((await selected.recheck(request(`/api/admin-domains/${DOMAIN}/recheck`, "POST", { expectedVersion: 1 }), DOMAIN)).status, 200);
  assert.equal((await selected.primary(request(`/api/admin-domains/${DOMAIN}/primary`, "POST", { expectedVersion: 1 }), DOMAIN)).status, 405);
  assert.equal((await selected.item(request(`/api/admin-domains/${DOMAIN}`, "DELETE", { expectedVersion: 1 }), DOMAIN)).status, 405);
  assert.equal(calls.length, 1);
});
