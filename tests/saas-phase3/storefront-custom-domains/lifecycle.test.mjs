import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PANEL_COOKIE = /^__Host-celebix_panel=v1[.][a-z][a-z0-9_-]{2,31}[.][A-Za-z0-9_-]{43}$/u;
const ENABLED = process.env.CELEBIX_CUSTOM_DOMAIN_STAGING_RUN === "approved";

function required(source, key, maximum = 2_048) {
  const value = source[key];
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error("custom_domain_staging_configuration_missing");
  }
  return value;
}

function exactHttpsOrigin(source, key, hostnameSuffix) {
  const url = new URL(required(source, key, 512));
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash || !url.hostname.endsWith(hostnameSuffix)) {
    throw new Error("custom_domain_staging_configuration_invalid");
  }
  return url.origin;
}

export function parseStagingLifecycleConfig(source) {
  if (source.CELEBIX_CUSTOM_DOMAIN_STAGING_RUN !== "approved" || source.CELEBIX_DEPLOYMENT_TIER !== "staging") {
    throw new Error("custom_domain_staging_configuration_missing");
  }
  const panelOrigin = exactHttpsOrigin(source, "CELEBIX_CUSTOM_DOMAIN_STAGING_PANEL_ORIGIN", ".admin.saas-staging.celebix.site");
  const platformOrigin = exactHttpsOrigin(source, "CELEBIX_CUSTOM_DOMAIN_STAGING_PLATFORM_ORIGIN", ".saas-staging.celebix.site");
  const ownedSuffix = required(source, "CELEBIX_CUSTOM_DOMAIN_STAGING_OWNED_SUFFIX", 253).toLowerCase();
  if (!HOSTNAME.test(ownedSuffix) || !ownedSuffix.endsWith(".celebix.co") || ownedSuffix === "celebix.co" || ownedSuffix.includes("saas-staging")) {
    throw new Error("custom_domain_staging_configuration_invalid");
  }
  const panelCookie = required(source, "CELEBIX_CUSTOM_DOMAIN_STAGING_PANEL_COOKIE", 512);
  if (!PANEL_COOKIE.test(panelCookie)) throw new Error("custom_domain_staging_configuration_invalid");
  const storeId = required(source, "CELEBIX_CUSTOM_DOMAIN_STAGING_STORE_ID", 36);
  if (!UUID.test(storeId)) throw new Error("custom_domain_staging_configuration_invalid");
  return Object.freeze({ panelOrigin, platformOrigin, ownedSuffix, panelCookie, storeId });
}

async function jsonResponse(response) {
  const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (type !== "application/json") throw new Error(`custom_domain_staging_http_${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 2 || bytes.byteLength > 131_072) throw new Error("custom_domain_staging_response_invalid");
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  finally { bytes.fill(0); }
}

function createApi(config) {
  async function call(pathname, options = {}) {
    const method = options.method ?? "GET";
    const headers = new Headers({ cookie: config.panelCookie, accept: "application/json" });
    if (method !== "GET") {
      headers.set("origin", config.panelOrigin);
      headers.set("content-type", "application/json");
      headers.set("idempotency-key", randomUUID());
    }
    const response = await fetch(new URL(pathname, config.panelOrigin), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    const value = await jsonResponse(response);
    if (!response.ok) throw new Error(`custom_domain_staging_api_${typeof value?.code === "string" ? value.code : response.status}`);
    return value;
  }
  return Object.freeze({
    list: () => call("/api/store-domains").then((value) => value.items),
    create: (hostname) => call("/api/store-domains", { method: "POST", body: { hostname } }).then((value) => value.domain),
    recheck: (domain) => call(`/api/store-domains/${domain.id}/recheck`, { method: "POST", body: { expectedVersion: domain.version } }).then((value) => value.domain),
    primary: (domain) => call(`/api/store-domains/${domain.id}/primary`, { method: "POST", body: { expectedVersion: domain.version } }).then((value) => value.domain),
    remove: (domain) => call(`/api/store-domains/${domain.id}`, { method: "DELETE", body: { expectedVersion: domain.version } }).then((value) => value.domain),
  });
}

async function waitForActive(api, hostname) {
  const deadline = Date.now() + 8 * 60_000;
  let last;
  while (Date.now() < deadline) {
    last = (await api.list()).find((domain) => domain.hostname === hostname);
    if (last?.uiStatus === "active" && last.status === "active") return last;
    if (last?.uiStatus === "action_required" || last?.status === "disabled") throw new Error("custom_domain_staging_activation_failed");
    if (last && Date.now() + 15_000 < deadline) await api.recheck(last).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`custom_domain_staging_activation_timeout_${last?.uiStatus ?? "missing"}`);
}

test("staging lifecycle refuses missing and production-crossed authority before network access", () => {
  assert.throws(() => parseStagingLifecycleConfig({}), /custom_domain_staging_configuration_missing/u);
  assert.throws(() => parseStagingLifecycleConfig({ CELEBIX_CUSTOM_DOMAIN_STAGING_RUN: "approved", CELEBIX_DEPLOYMENT_TIER: "production" }), /custom_domain_staging_configuration_missing/u);
});

test("approved staging custom domain completes connect primary alias and removal", { skip: !ENABLED, timeout: 10 * 60_000 }, async () => {
  const config = parseStagingLifecycleConfig(process.env);
  const api = createApi(config);
  const hostname = `probe-${Date.now()}-${randomBytes(3).toString("hex")}.${config.ownedSuffix}`;
  let custom = null;
  try {
    const initial = await api.list();
    const platform = initial.find((domain) => domain.hostnameType === "platform_subdomain" && domain.status === "active");
    assert.ok(platform, "active_platform_domain_required");
    assert.equal(new URL(config.platformOrigin).hostname, platform.hostname);
    custom = await api.create(hostname);
    assert.equal(custom.hostname, hostname);
    assert.equal(custom.status, "pending");
    custom = await waitForActive(api, hostname);

    const health = await fetch(`https://${hostname}/api/health`, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    assert.equal(health.status, 200);
    assert.deepEqual(await jsonResponse(health), { schemaVersion: 1, status: "ok", storeId: config.storeId, hostname });

    custom = await api.primary(custom);
    assert.equal(custom.primary, true);
    const alias = await fetch(new URL("/products?domain=probe", config.platformOrigin), { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    assert.equal(alias.status, 308);
    assert.equal(alias.headers.get("location"), `https://${hostname}/products?domain=probe`);
    for (const pathname of ["/account/login", "/cart", "/checkout"]) {
      const response = await fetch(`https://${hostname}${pathname}`, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
      assert.equal(response.status, 200, pathname);
    }
  } finally {
    const current = await api.list().catch(() => []);
    const selected = current.find((domain) => domain.hostname === hostname);
    if (selected && selected.status !== "disabled") await api.remove(selected);
    const restored = await fetch(config.platformOrigin, { redirect: "manual", signal: AbortSignal.timeout(10_000) }).catch(() => null);
    assert.equal(restored?.status, 200, "platform_storefront_must_survive_cleanup");
  }
});
