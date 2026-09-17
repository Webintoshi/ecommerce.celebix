import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultStarterThemeComposition, type TenantContext } from "@celebix/saas-contracts";

import { createStorefrontDesignPreviewHttpHandler } from "./handler-core.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const STORE = "61000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-09-15T12:00:00.000Z");
const REQUEST = "61000000-0000-4000-8000-000000000002";
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 0x61).toString("base64url")}`;

function tenant(role: TenantContext["membership"]["role"] = "analyst"): TenantContext {
  return { schemaVersion: 1, requestId: REQUEST, principal: { id: "61000000-0000-4000-8000-000000000003", issuer: "https://identity.test", subject: "analyst" }, store: { id: STORE, slug: "atlas", status: "active" }, membership: { id: "61000000-0000-4000-8000-000000000004", role, status: "active" }, entitlements: { schemaVersion: 1, planId: "61000000-0000-4000-8000-000000000005", planCode: "growth", version: 1, status: "active", features: ["content"], limits: { products: 10, staff: 2, storageBytes: 1000 }, validFrom: NOW.toISOString() }, resolvedHost: { schemaVersion: 1, hostname: "atlas.saas-staging.celebix.site", canonicalHostname: "atlas.saas-staging.celebix.site", domainId: "61000000-0000-4000-8000-000000000006", domainType: "platform_subdomain", storeId: STORE, storeSlug: "atlas", status: "active", cacheVersion: 1 }, locale: "tr-TR" };
}

function fixture(role: TenantContext["membership"]["role"] = "analyst") {
  const calls: string[] = [];
  const resources = Object.freeze({ schemaVersion: 1 as const, dependencyKey: "key", productSources: Object.freeze([]), assets: Object.freeze([]), hotspots: Object.freeze([]), categoryShowcase: Object.freeze({ status: "missing" as const }) });
  const workspace = { schemaVersion: 3, draftVersion: 1, publishedVersion: 1, draftUpdatedAt: NOW.toISOString(), publishedAt: NOW.toISOString(), draft: {}, published: {}, store: { name: "Atlas", timezone: "Europe/Istanbul" }, media: [], destinations: [] } as never;
  const runtime = { access: { readiness: { mode: "approved_staging" }, panelOrigin: ORIGIN, async resolveCredential() { return { kind: "authenticated", session: {}, tenantContext: tenant(role) }; } }, design: { async getWorkspace() { calls.push("getWorkspace"); return workspace; } }, loader: { async load(input: any) { calls.push("load"); assert.equal(input.tenantContext.store.id, STORE); return resources; } } };
  return { calls, resources, handler: createStorefrontDesignPreviewHttpHandler({ async resolveRuntime() { return runtime as never; }, now: () => new Date(NOW), requestId: () => REQUEST }) };
}

function request(body: unknown, headers: HeadersInit = {}, path = "/api/storefront-design/preview"): Request {
  const value = JSON.stringify(body); const selected = new Headers(headers);
  selected.set("cookie", `__Host-celebix_panel=${CREDENTIAL}`); if (!selected.has("origin")) selected.set("origin", ORIGIN); selected.set("content-type", "application/json"); selected.set("content-length", String(Buffer.byteLength(value)));
  return new Request(`http://customer-panel:3400${path}`, { method: "POST", headers: selected, body: value });
}

test("authenticated configuration.read POST returns bounded resources without a mutation authority", async () => {
  const selected = fixture("analyst");
  const response = await selected.handler(request({ composition: createDefaultStarterThemeComposition() }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { code: "ok", resources: selected.resources });
  assert.deepEqual(selected.calls, ["getWorkspace", "load"]);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("preview POST rejects private authority input, foreign origin, and non-exact body before reads", async () => {
  for (const candidate of [
    request({ composition: createDefaultStarterThemeComposition() }, { "x-store-id": STORE }),
    request({ composition: createDefaultStarterThemeComposition() }, { origin: "https://evil.test" }),
    request({ composition: createDefaultStarterThemeComposition(), storeId: STORE }),
  ]) {
    const selected = fixture(); const response = await selected.handler(candidate);
    assert.ok([400, 403].includes(response.status)); assert.deepEqual(selected.calls, []);
  }
});
