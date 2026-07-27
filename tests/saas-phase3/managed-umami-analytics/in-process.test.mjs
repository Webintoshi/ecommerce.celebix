import assert from "node:assert/strict";
import test from "node:test";

import { createAnalyticsHttpHandlers } from "../../../apps/customer-panel/lib/analytics-http/handler.ts";
import { createAnalyticsBrowserApi } from "../../../apps/customer-panel/lib/analytics-ui/client.ts";
import { deliverAnalyticsOutbox } from "../../../apps/storefront-shared/lib/analytics/delivery.ts";
import { PRODUCT_VIEW_EVENT, trackCommerceEvent } from "../../../apps/storefront-shared/lib/analytics/events.ts";
import { createSafeUmamiTracker, trackPageview } from "../../../apps/storefront-shared/lib/analytics/tracker-client.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const STORE_ID = "10000000-0000-4000-8000-000000000001";
const CONNECTION_ID = "20000000-0000-4000-8000-000000000001";
const WEBSITE_ID = "30000000-0000-4000-8000-000000000001";
const OPERATION_ID = "40000000-0000-4000-8000-000000000001";
const REQUEST_ID = "50000000-0000-4000-8000-000000000001";
const HOSTNAME = "atlas-store.celebix.site";
const NOW = new Date("2026-07-26T12:00:00.000Z");
const COOKIE = `__Host-celebix_panel=v1.key.${"A".repeat(43)}`;

function tenantContext() {
  return Object.freeze({
    schemaVersion: 1,
    requestId: REQUEST_ID,
    principal: Object.freeze({ id: "60000000-0000-4000-8000-000000000001", issuer: "https://identity.example.test/oidc", subject: "merchant" }),
    store: Object.freeze({ id: STORE_ID, slug: "atlas-store", status: "active" }),
    membership: Object.freeze({ id: "70000000-0000-4000-8000-000000000001", role: "store_owner", status: "active" }),
    entitlements: Object.freeze({
      schemaVersion: 1,
      planId: "80000000-0000-4000-8000-000000000001",
      planCode: "growth",
      version: 1,
      status: "active",
      features: Object.freeze(["analytics"]),
      limits: Object.freeze({ products: 100, staff: 5, storageBytes: 1_000_000 }),
      validFrom: "2026-01-01T00:00:00.000Z",
    }),
    resolvedHost: Object.freeze({
      schemaVersion: 1,
      hostname: HOSTNAME,
      domainId: "90000000-0000-4000-8000-000000000001",
      domainType: "platform_subdomain",
      storeId: STORE_ID,
      storeSlug: "atlas-store",
      canonicalHostname: HOSTNAME,
      status: "active",
      cacheVersion: 1,
    }),
    locale: "tr-TR",
  });
}

function connectionView(status = "active", version = 2) {
  return Object.freeze({
    schemaVersion: 1,
    provider: "umami",
    status,
    configured: true,
    hostname: HOSTNAME,
    version,
    lastVerifiedAt: NOW.toISOString(),
  });
}

function authority(status = "active", version = 2) {
  return Object.freeze({
    connectionId: CONNECTION_ID,
    websiteId: WEBSITE_ID,
    hostname: HOSTNAME,
    status,
    version,
    lastVerifiedAt: NOW.toISOString(),
  });
}

function analyticsSummary(range = "30d") {
  return Object.freeze({
    schemaVersion: 1,
    range,
    asOf: NOW.toISOString(),
    pageviews: 42,
    visitors: 17,
    visits: 20,
    bounces: 5,
    totalTimeSeconds: 600,
    activeVisitors: 3,
    bounceRateBasisPoints: 2500,
    averageVisitSeconds: 30,
    comparison: null,
    pageviewsSeries: Object.freeze([Object.freeze({ at: "2026-07-26T00:00:00.000Z", value: 42 })]),
    visitsSeries: Object.freeze([Object.freeze({ at: "2026-07-26T00:00:00.000Z", value: 20 })]),
  });
}

function metric(range = "30d", type = "path") {
  const labels = { path: "/products", referrer: "https://search.example", device: "desktop", country: "TR" };
  return Object.freeze({ schemaVersion: 1, range, type, asOf: NOW.toISOString(), items: Object.freeze([Object.freeze({ label: labels[type], value: 7 })]) });
}

function createFixture(options = {}) {
  const calls = [];
  let websiteReads = 0;
  const analytics = Object.freeze({
    async getConnection(input) { calls.push(["connection", input]); return connectionView(); },
    async getConnectionAuthority(input) { calls.push(["authority", input]); return authority(); },
    async beginConnection(input) {
      calls.push(["begin", input]);
      return Object.freeze({ ...authority("pending", 1), outcome: options.replayed ? "replayed" : "pending", replayed: options.replayed === true });
    },
    async activateConnection(input) {
      calls.push(["activate", input]);
      return Object.freeze({ status: "active", version: 2, updatedAt: NOW.toISOString(), replayed: options.replayed === true });
    },
    async disableConnection(input) {
      calls.push(["disable", input]);
      return Object.freeze({ status: "disabled", version: 3, updatedAt: NOW.toISOString(), replayed: false });
    },
  });
  const providerWebsite = Object.freeze({ id: WEBSITE_ID, name: "Celebix atlas-store", domain: HOSTNAME });
  const umami = Object.freeze({
    async getWebsite(input) {
      websiteReads += 1;
      calls.push(["website", input]);
      if (options.existingWebsite) return providerWebsite;
      if (options.unknownCreate && websiteReads > 1) return providerWebsite;
      return null;
    },
    async createWebsite(input) {
      calls.push(["create", input]);
      if (options.unknownCreate) throw new Error("provider outcome unknown");
      return providerWebsite;
    },
    async summary(input) {
      calls.push(["summary", input]);
      if (options.providerDown) throw new Error("private provider failure");
      return analyticsSummary(input.range);
    },
    async metrics(input) { calls.push(["metrics", input]); return metric(input.range, input.type); },
  });
  const access = Object.freeze({
    readiness: Object.freeze({ mode: "approved_staging" }),
    panelOrigin: ORIGIN,
    async resolveCredential() { return Object.freeze({ kind: "authenticated", session: Object.freeze({}), tenantContext: tenantContext() }); },
    async rotateCredential() { return Object.freeze({ kind: "unavailable" }); },
    async revokeCredential() { return Object.freeze({ kind: "unavailable" }); },
  });
  const cache = Object.freeze({ get() { return null; }, set() {}, invalidateConnection(connectionId) { calls.push(["invalidate", connectionId]); } });
  const runtime = Object.freeze({ mode: "approved_staging", access, analytics, umami, cache });
  const ids = [CONNECTION_ID, WEBSITE_ID];
  const handlers = createAnalyticsHttpHandlers({
    async resolveRuntime() { return runtime; },
    now() { return new Date(NOW); },
    requestId() { return REQUEST_ID; },
    uuid() { return ids.shift() ?? REQUEST_ID; },
  });

  async function fetcher(input) {
    const request = input instanceof Request ? input : new Request(input);
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.set("cookie", COOKIE);
    if (request.method === "POST") headers.set("origin", ORIGIN);
    const serverRequest = new Request(`http://customer-panel:3400${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.text(),
    });
    if (url.pathname === "/api/analytics/connection") return handlers.connection[request.method](serverRequest);
    if (url.pathname === "/api/analytics/summary") return handlers.summary.GET(serverRequest);
    if (url.pathname === "/api/analytics/metrics") return handlers.metrics.GET(serverRequest);
    throw new Error("unexpected analytics route");
  }

  return Object.freeze({ calls, handlers, browser: createAnalyticsBrowserApi(fetcher) });
}

function mutationRequest(body) {
  return new Request("http://customer-panel:3400/api/analytics/connection", {
    method: "POST",
    headers: { cookie: COOKIE, origin: ORIGIN, "content-type": "application/json", "idempotency-key": OPERATION_ID },
    body: JSON.stringify(body),
  });
}

test("authenticated browser connection read returns only the public DTO", async () => {
  const fixture = createFixture();
  const result = await fixture.browser.connection();
  assert.deepEqual(result, connectionView());
  assert.doesNotMatch(JSON.stringify(result), /websiteId|connectionId|storeId|principal|membership/i);
});

test("browser-supplied store and Website authority is rejected before repository or provider", async () => {
  const fixture = createFixture();
  const response = await fixture.handlers.connection.POST(mutationRequest({ intent: "enable", storeId: STORE_ID, websiteId: WEBSITE_ID }));
  assert.equal(response.status, 400);
  assert.equal(fixture.calls.length, 0);
});

test("enable creates exactly one provider website and activates the server-selected connection", async () => {
  const fixture = createFixture();
  assert.deepEqual(await fixture.browser.enable({ idempotencyKey: OPERATION_ID }), { status: "active", version: 2, updatedAt: NOW.toISOString(), replayed: false });
  assert.equal(fixture.calls.filter(([name]) => name === "create").length, 1);
  assert.deepEqual(fixture.calls.find(([name]) => name === "create")[1], { websiteId: WEBSITE_ID, name: "Celebix atlas-store", domain: HOSTNAME });
});

test("unknown provider create outcome performs one read-only recovery and no second write", async () => {
  const fixture = createFixture({ unknownCreate: true });
  const result = await fixture.browser.enable({ idempotencyKey: OPERATION_ID });
  assert.equal(result.status, "active");
  assert.equal(fixture.calls.filter(([name]) => name === "create").length, 1);
  assert.equal(fixture.calls.filter(([name]) => name === "website").length, 2);
});

test("connection replay reuses the pending Website ID without provider creation", async () => {
  const fixture = createFixture({ replayed: true, existingWebsite: true });
  const result = await fixture.browser.enable({ idempotencyKey: OPERATION_ID });
  assert.equal(result.replayed, true);
  assert.equal(fixture.calls.some(([name]) => name === "create"), false);
  assert.equal(fixture.calls.filter(([name]) => name === "activate").length, 1);
});

test("disable derives private connection authority server-side and invalidates only that connection", async () => {
  const fixture = createFixture();
  const result = await fixture.browser.disable({ idempotencyKey: OPERATION_ID, expectedVersion: 2 });
  assert.equal(result.status, "disabled");
  assert.deepEqual(fixture.calls.map(([name]) => name), ["authority", "disable", "invalidate"]);
  assert.equal(fixture.calls[1][1].tenantContext.store.id, STORE_ID);
});

test("exact-host storefront tracking projects sanitized path, title, referrer, and event data", () => {
  const payloads = [];
  const browser = Object.freeze({
    location: Object.freeze({ protocol: "https:", hostname: HOSTNAME, pathname: "/products/linen-shirt" }),
    document: Object.freeze({ title: "  Linen Shirt  ", referrer: "https://search.example/results?q=linen#top" }),
    umami: Object.freeze({ track(payload) { payloads.push(payload); } }),
  });
  const tracker = createSafeUmamiTracker({ websiteId: WEBSITE_ID, hostname: HOSTNAME, browser });
  trackPageview(tracker, browser);
  trackCommerceEvent(tracker, PRODUCT_VIEW_EVENT, browser);
  assert.deepEqual(payloads, [
    { website: WEBSITE_ID, hostname: HOSTNAME, url: "/products/linen-shirt", title: "Linen Shirt", referrer: "https://search.example" },
    { website: WEBSITE_ID, hostname: HOSTNAME, url: "/products/linen-shirt", name: "product_view", data: { product: "catalog_item" } },
  ]);
});

test("wrong and alias storefront hosts cannot emit pageviews or commerce events", () => {
  const payloads = [];
  const browser = Object.freeze({
    location: Object.freeze({ protocol: "https:", hostname: `www.${HOSTNAME}`, pathname: "/products" }),
    document: Object.freeze({ title: "Products", referrer: "" }),
    umami: Object.freeze({ track(payload) { payloads.push(payload); } }),
  });
  const tracker = createSafeUmamiTracker({ websiteId: WEBSITE_ID, hostname: HOSTNAME, browser });
  trackPageview(tracker, browser);
  trackCommerceEvent(tracker, PRODUCT_VIEW_EVENT, browser);
  assert.deepEqual(payloads, []);
});

test("authenticated summary crosses HTTP with exact managed analytics authority", async () => {
  const fixture = createFixture();
  const summary = await fixture.browser.summary("30d");
  assert.deepEqual(summary, analyticsSummary());
  assert.equal(fixture.calls.find(([name]) => name === "summary")[1].websiteId, WEBSITE_ID);
});

test("authenticated metrics bind exact range and type to the server-selected Website ID", async () => {
  const fixture = createFixture();
  assert.deepEqual(await fixture.browser.metrics("90d", "country"), metric("90d", "country"));
  const call = fixture.calls.find(([name]) => name === "metrics")[1];
  assert.deepEqual({ websiteId: call.websiteId, range: call.range, type: call.type }, { websiteId: WEBSITE_ID, range: "90d", type: "country" });
});

test("settled purchase outbox hands one aggregate event to the public collector", async () => {
  const claim = Object.freeze({ eventId: "a0000000-0000-4000-8000-000000000001", leaseToken: "a".repeat(64), websiteId: WEBSITE_ID, hostname: HOSTNAME, attemptCount: 1, payload: Object.freeze({ name: "purchase", valueCents: 12_900, currency: "TRY", source: "quick_link" }) });
  const calls = { delivered: [], failed: [], payloads: [] };
  const repository = Object.freeze({
    async claim() { return Object.freeze([claim]); },
    async delivered(input) { calls.delivered.push(input); },
    async failed(input) { calls.failed.push(input); },
  });
  const result = await deliverAnalyticsOutbox(repository, Object.freeze({ mode: "approved_staging", trackerScriptUrl: "https://analytics.example.test/script.js", collectorOrigin: "https://analytics.example.test" }), Object.freeze({
    now: () => new Date(NOW),
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) CelebixEvents/1.0 Safari/537.36",
    timeoutMs: 1_000,
    fetch: async (_url, init) => { calls.payloads.push(JSON.parse(init.body)); return new Response('{"cache":"header.payload.signature"}', { status: 200, headers: { "content-type": "application/json" } }); },
  }));
  assert.deepEqual(result, { claimed: 1, delivered: 1, retried: 0, terminal: 0 });
  assert.deepEqual(calls.payloads[0].payload, { website: WEBSITE_ID, hostname: HOSTNAME, url: "/checkout/complete", name: "purchase", data: { value: 129, currency: "TRY", source: "quick_link" } });
  assert.equal(calls.failed.length, 0);
});

test("provider outage rejects only analytics while catalog and order dashboard reads stay fulfilled", async () => {
  const fixture = createFixture({ providerDown: true });
  const [catalog, orders, analytics] = await Promise.allSettled([
    Promise.resolve(Object.freeze({ totalProducts: 1, activeProducts: 1 })),
    Promise.resolve(Object.freeze({ totalOrders: 1, fulfilledOrders: 1 })),
    fixture.browser.summary("30d"),
  ]);
  assert.deepEqual([catalog.status, orders.status, analytics.status], ["fulfilled", "fulfilled", "rejected"]);
  assert.doesNotMatch(String(analytics.reason), /private provider failure/);
});
