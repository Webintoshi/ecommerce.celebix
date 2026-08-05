import assert from "node:assert/strict";
import test from "node:test";

import { parseReadinessConfig, verifyReadiness } from "./verify-cloudflare-saas-readiness.mjs";

const CONFIG = Object.freeze({
  deploymentTier: "staging",
  apiToken: "cf_test_authority_0000000000000001",
  accountId: "a".repeat(32),
  zoneId: "b".repeat(32),
  tunnelId: "10000000-0000-4000-8000-000000000001",
  fallbackOrigin: "shops-origin.saas-staging.celebix.site",
  cnameTarget: "shops.saas-staging.celebix.site",
  storefrontProbeHostname: "guzide-kuyumcu-4.saas-staging.celebix.site",
  storefrontProbeStoreId: "33333333-3333-4333-8333-333333333333",
  customHostnameLimit: 100,
});

function cloudflare(result, resultInfo) {
  return Response.json({ success: true, errors: [], messages: [], result, ...(resultInfo ? { result_info: resultInfo } : {}) });
}

function dependencies(overrides = {}) {
  const calls = [];
  const fetch = async (request) => {
    calls.push(request);
    const url = new URL(request.url);
    if (url.hostname === CONFIG.storefrontProbeHostname) return Response.json({ schemaVersion: 1, status: "ok", storeId: CONFIG.storefrontProbeStoreId, hostname: CONFIG.storefrontProbeHostname });
    if (url.pathname === `/client/v4/zones/${CONFIG.zoneId}`) return cloudflare({ id: CONFIG.zoneId, status: "active" });
    if (url.pathname.endsWith("/custom_hostnames/fallback_origin")) return cloudflare({ origin: CONFIG.fallbackOrigin, status: "active" });
    if (url.pathname.endsWith("/custom_hostnames")) return cloudflare([], { page: 1, per_page: 5, count: 0, total_count: 4 });
    if (url.pathname.endsWith("/dns_records")) return cloudflare([{ id: "c".repeat(32), type: "CNAME", name: CONFIG.cnameTarget, content: CONFIG.fallbackOrigin, proxied: true }]);
    if (url.pathname.endsWith("/connections")) return cloudflare([
      { id: "20000000-0000-4000-8000-000000000001", is_pending_reconnect: false },
      { id: "20000000-0000-4000-8000-000000000002", is_pending_reconnect: false },
    ]);
    if (url.pathname.endsWith(`/${CONFIG.tunnelId}`)) return cloudflare({ id: CONFIG.tunnelId, status: "healthy" });
    throw new Error("unexpected_request");
  };
  return {
    calls,
    value: {
      fetch,
      resolveDns: async () => [{ address: "104.16.0.1", family: 4 }],
      ...overrides,
    },
  };
}

test("read-only preflight verifies the exact Cloudflare for SaaS and redundant Tunnel authority", async () => {
  const fixture = dependencies();
  assert.deepEqual(await verifyReadiness(CONFIG, fixture.value), {
    zone: "active",
    customHostnameQuota: "ready",
    fallbackOrigin: "active",
    cnameTarget: "ready",
    tunnel: "healthy",
    storefront: "healthy",
  });
  assert.equal(fixture.calls.every((request) => request.method === "GET"), true);
  assert.equal(fixture.calls.filter((request) => new URL(request.url).hostname === "api.cloudflare.com").every((request) => request.headers.get("authorization") === `Bearer ${CONFIG.apiToken}`), true);
  assert.equal(fixture.calls.find((request) => new URL(request.url).hostname === CONFIG.storefrontProbeHostname)?.headers.has("authorization"), false);
  assert.equal(new URL(fixture.calls.find((request) => new URL(request.url).hostname === CONFIG.storefrontProbeHostname)?.url ?? "https://invalid.test").pathname, "/api/health");
});

test("preflight reports exhausted quota inactive fallback wrong proxied target and unavailable tunnel", async () => {
  const fixture = dependencies({
    resolveDns: async () => [],
    fetch: async (request) => {
      const url = new URL(request.url);
      if (url.hostname === CONFIG.storefrontProbeHostname) return Response.json({ schemaVersion: 1, status: "ok", storeId: CONFIG.storefrontProbeStoreId, hostname: `alias.${CONFIG.storefrontProbeHostname}` });
      if (url.pathname === `/client/v4/zones/${CONFIG.zoneId}`) return cloudflare({ id: CONFIG.zoneId, status: "active" });
      if (url.pathname.endsWith("/custom_hostnames/fallback_origin")) return cloudflare({ origin: "wrong.saas-staging.celebix.site", status: "pending_deployment" });
      if (url.pathname.endsWith("/custom_hostnames")) return cloudflare([], { page: 1, per_page: 5, count: 5, total_count: 100 });
      if (url.pathname.endsWith("/dns_records")) return cloudflare([{ type: "CNAME", name: CONFIG.cnameTarget, content: "wrong.saas-staging.celebix.site", proxied: false }]);
      if (url.pathname.endsWith("/connections")) return cloudflare([]);
      if (url.pathname.endsWith(`/${CONFIG.tunnelId}`)) return cloudflare({ id: CONFIG.tunnelId, status: "down" });
      throw new Error("unexpected_request");
    },
  });

  assert.deepEqual(await verifyReadiness(CONFIG, fixture.value), {
    zone: "active",
    customHostnameQuota: "exhausted",
    fallbackOrigin: "mismatch",
    cnameTarget: "mismatch",
    tunnel: "down",
    storefront: "unhealthy",
  });
});

test("malformed Cloudflare responses fail closed without leaking the API token", async () => {
  const fixture = dependencies({ fetch: async () => new Response(`secret=${CONFIG.apiToken}`, { status: 502 }) });
  const result = await verifyReadiness(CONFIG, fixture.value);
  assert.deepEqual(result, {
    zone: "unavailable",
    customHostnameQuota: "unavailable",
    fallbackOrigin: "unavailable",
    cnameTarget: "unavailable",
    tunnel: "unavailable",
    storefront: "unhealthy",
  });
  assert.equal(JSON.stringify(result).includes(CONFIG.apiToken), false);
});

test("configuration is exact staging-bound and refuses missing quota or production-crossed hosts", () => {
  const environment = {
    CELEBIX_DEPLOYMENT_TIER: "staging",
    CLOUDFLARE_SAAS_API_TOKEN: CONFIG.apiToken,
    CLOUDFLARE_SAAS_ACCOUNT_ID: CONFIG.accountId,
    CLOUDFLARE_SAAS_ZONE_ID: CONFIG.zoneId,
    CLOUDFLARE_SAAS_TUNNEL_ID: CONFIG.tunnelId,
    CELEBIX_CUSTOM_DOMAIN_FALLBACK_ORIGIN: CONFIG.fallbackOrigin,
    CELEBIX_CUSTOM_DOMAIN_CNAME_TARGET: CONFIG.cnameTarget,
    CELEBIX_CUSTOM_DOMAIN_STOREFRONT_PROBE_HOSTNAME: CONFIG.storefrontProbeHostname,
    CELEBIX_CUSTOM_DOMAIN_STOREFRONT_PROBE_STORE_ID: CONFIG.storefrontProbeStoreId,
    CELEBIX_CLOUDFLARE_CUSTOM_HOSTNAME_LIMIT: "100",
  };
  assert.deepEqual(parseReadinessConfig(environment), CONFIG);
  assert.throws(() => parseReadinessConfig({ ...environment, CELEBIX_CLOUDFLARE_CUSTOM_HOSTNAME_LIMIT: undefined }), /custom_domain_readiness_config_invalid/u);
  assert.throws(() => parseReadinessConfig({ ...environment, CELEBIX_CUSTOM_DOMAIN_CNAME_TARGET: "shops.celebix.site" }), /custom_domain_readiness_config_invalid/u);
});
