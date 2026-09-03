import assert from "node:assert/strict";
import test from "node:test";
import {
  createUmamiClient,
  UmamiProviderError,
  type UmamiFetch,
} from "./client.ts";
import type { UmamiPrivateApiConfig } from "./config.ts";
const WEBSITE = "50000000-0000-4000-8000-000000000001",
  NOW = new Date("2026-07-26T12:00:00.000Z"),
  CONFIG: UmamiPrivateApiConfig = Object.freeze({
    mode: "approved_staging",
    apiBaseUrl: "https://analytics.example.test",
    username: "admin",
    password: "private-password",
    timeoutMs: 3000,
    maximumResponseBytes: 262144,
    maximumMetricRows: 100,
  });
function response(
  status: number,
  value: unknown,
  headers: HeadersInit = { "content-type": "application/json" },
) {
  return new Response(value === undefined ? undefined : JSON.stringify(value), {
    status,
    headers,
  });
}
function login() {
  return response(200, { token: "bearer-token" });
}
function site() {
  return { id: WEBSITE, name: "Celebix Store", domain: "store.example.test" };
}
function officialWebsite() {
  return {
    ...site(),
    resetAt: null,
    userId: "60000000-0000-4000-8000-000000000001",
    teamId: null,
    createdBy: "60000000-0000-4000-8000-000000000001",
    createdAt: "2026-07-26T12:00:00.000Z",
    updatedAt: "2026-07-26T12:00:00.000Z",
    deletedAt: null,
    replayEnabled: false,
    replayConfig: null,
    shareId: null,
  };
}
function fixture(
  values: Array<
    Response | ((request: Request) => Response | Promise<Response>)
  >,
) {
  const requests: Request[] = [];
  const fetch: UmamiFetch = async (request) => {
    requests.push(request.clone());
    const value = values.shift();
    if (!value) throw Error("missing");
    return typeof value === "function" ? value(request) : value;
  };
  return { client: createUmamiClient(CONFIG, { fetch }), requests };
}
test("login bearer use and exact v3 create body", async () => {
  const f = fixture([login(), response(200, site())]);
  assert.deepEqual(
    await f.client.createWebsite({
      websiteId: WEBSITE,
      name: "Celebix Store",
      domain: "store.example.test",
    }),
    site(),
  );
  assert.equal(
    f.requests[0]?.url,
    "https://analytics.example.test/api/auth/login",
  );
  assert.deepEqual(JSON.parse(await f.requests[0]!.text()), {
    username: "admin",
    password: "private-password",
  });
  assert.equal(
    f.requests[1]?.headers.get("authorization"),
    "Bearer bearer-token",
  );
  assert.deepEqual(JSON.parse(await f.requests[1]!.text()), {
    id: WEBSITE,
    name: "Celebix Store",
    domain: "store.example.test",
  });
});
test("official Umami 3.1 website metadata projects only the trusted identity fields", async () => {
  const value = await fixture([
    login(),
    response(200, officialWebsite()),
  ]).client.getWebsite(WEBSITE);
  assert.deepEqual(value, site());
});
test("unknown Umami website metadata remains fail closed", async () => {
  await assert.rejects(
    () =>
      fixture([
        login(),
        response(200, { ...officialWebsite(), unexpected: true }),
      ]).client.getWebsite(WEBSITE),
    /umami_provider_response_invalid/,
  );
});
test("one token is cached across reads", async () => {
  const f = fixture([login(), response(200, site()), response(200, site())]);
  await f.client.getWebsite(WEBSITE);
  await f.client.getWebsite(WEBSITE);
  assert.equal(
    f.requests.filter((r) => r.url.endsWith("/api/auth/login")).length,
    1,
  );
});
test("read-only 401 relogs and retries once", async () => {
  const f = fixture([
    login(),
    response(401, {}),
    login(),
    response(200, site()),
  ]);
  assert.deepEqual(await f.client.getWebsite(WEBSITE), site());
  assert.equal(
    f.requests.filter((r) => r.url.endsWith(`/api/websites/${WEBSITE}`)).length,
    2,
  );
});
test("write 401 never retries create", async () => {
  const f = fixture([login(), response(401, {})]);
  await assert.rejects(
    () =>
      f.client.createWebsite({
        websiteId: WEBSITE,
        name: "Celebix Store",
        domain: "store.example.test",
      }),
    /umami_provider_unavailable/,
  );
  assert.equal(
    f.requests.filter(
      (r) => r.method === "POST" && r.url.endsWith("/api/websites"),
    ).length,
    1,
  );
});
test("manual redirects and non-success statuses fail closed", async () => {
  for (const value of [
    response(
      302,
      {},
      { "content-type": "application/json", location: "https://evil.test" },
    ),
    response(500, {}),
  ]) {
    const f = fixture([login(), value]);
    await assert.rejects(
      () => f.client.getWebsite(WEBSITE),
      /umami_provider_unavailable/,
    );
    assert.equal(f.requests[1]?.redirect, "manual");
  }
});
test("content type and declared length are exact and bounded", async () => {
  for (const value of [
    response(200, site(), { "content-type": "text/plain" }),
    response(200, site(), {
      "content-type": "application/json",
      "content-length": "262145",
    }),
  ])
    await assert.rejects(
      () => fixture([login(), value]).client.getWebsite(WEBSITE),
      /umami_provider_response_/,
    );
});
test("stream overflow fatal UTF-8 and JSON are rejected", async () => {
  const badUtf = new Response(new Uint8Array([0xff]), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    badJson = new Response("{", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    big = new Response(new Uint8Array(262145), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  for (const value of [badUtf, badJson, big])
    await assert.rejects(
      () => fixture([login(), value]).client.getWebsite(WEBSITE),
      /umami_provider_response_/,
    );
});
test("get website maps 404 to null and rejects mismatched identities", async () => {
  assert.equal(
    await fixture([login(), response(404, {})]).client.getWebsite(WEBSITE),
    null,
  );
  await assert.rejects(
    () =>
      fixture([
        login(),
        response(200, {
          ...site(),
          id: "50000000-0000-4000-8000-000000000002",
        }),
      ]).client.getWebsite(WEBSITE),
    /umami_provider_response_invalid/,
  );
});
test("summary merges official Umami 3.1 stats sessions and active visitors", async () => {
  const stats = {
      pageviews: 10,
      visitors: 6,
      visits: 7,
      bounces: 2,
      totaltime: 140,
      comparison: {
        pageviews: 1,
        visitors: 1,
        visits: 1,
        bounces: 0,
        totaltime: 20,
      },
    },
    series = {
      pageviews: [{ x: "2026-07-25T00:00:00.000Z", y: 4 }],
      sessions: [{ x: "2026-07-25T00:00:00.000Z", y: 3 }],
    };
  const f = fixture([
    login(),
    response(200, stats),
    response(200, series),
    response(200, { visitors: 2 }),
  ]);
  const result = await f.client.summary({
    websiteId: WEBSITE,
    range: "7d",
    timezone: "Europe/Istanbul",
    now: NOW,
  });
  assert.equal(result.bounceRateBasisPoints, 2857);
  assert.equal(result.averageVisitSeconds, 20);
  assert.equal(result.activeVisitors, 2);
  assert.deepEqual(result.visitsSeries, [
    { at: "2026-07-25T00:00:00.000Z", value: 3 },
  ]);
  assert.equal(Object.isFrozen(result), true);
});
test("summary exact range sends the same merchant period to Umami", async () => {
  const stats = {
      pageviews: 0,
      visitors: 0,
      visits: 0,
      bounces: 0,
      totaltime: 0,
      comparison: null,
    },
    series = { pageviews: [], sessions: [] };
  const f = fixture([
    login(),
    response(200, stats),
    response(200, series),
    response(200, { visitors: 0 }),
  ]);
  await f.client.summary({
    websiteId: WEBSITE,
    range: "7d",
    timezone: "Europe/Istanbul",
    now: NOW,
    start: new Date("2026-07-25T21:00:00.000Z"),
    end: NOW,
  });
  assert.ok(f.requests[1]?.url.includes("startAt=1785013200000"));
  assert.ok(f.requests[1]?.url.includes("endAt=1785067200000"));
});
test("summary canonicalizes official Umami local bucket timestamps", async () => {
  const stats = {
      pageviews: 1,
      visitors: 1,
      visits: 1,
      bounces: 1,
      totaltime: 0,
      comparison: {
        pageviews: 0,
        visitors: 0,
        visits: 0,
        bounces: 0,
        totaltime: 0,
      },
    },
    series = {
      pageviews: [{ x: "2026-07-27 00:00:00", y: 1 }],
      sessions: [{ x: "2026-07-27 00:00:00", y: 1 }],
    };
  const result = await fixture([
    login(),
    response(200, stats),
    response(200, series),
    response(200, { visitors: 0 }),
  ]).client.summary({
    websiteId: WEBSITE,
    range: "30d",
    timezone: "Europe/Istanbul",
    now: NOW,
  });
  assert.deepEqual(result.pageviewsSeries, [
    { at: "2026-07-26T21:00:00.000Z", value: 1 },
  ]);
  assert.deepEqual(result.visitsSeries, [
    { at: "2026-07-26T21:00:00.000Z", value: 1 },
  ]);
});
test("metrics parse and sanitize provider rows", async () => {
  const f = fixture([
    login(),
    response(200, [
      { x: "/products", y: 4 },
      { x: "/", y: 2 },
    ]),
  ]);
  const result = await f.client.metrics({
    websiteId: WEBSITE,
    range: "30d",
    timezone: "Europe/Istanbul",
    type: "path",
    now: NOW,
  });
  assert.deepEqual(result.items, [
    { label: "/products", value: 4 },
    { label: "/", value: 2 },
  ]);
  assert.equal(Object.isFrozen(result.items), true);
});
test("event metrics accept only the canonical commerce event vocabulary", async () => {
  const valid = await fixture([
    login(),
    response(200, [
      { x: "product_view", y: 4 },
      { x: "add_to_cart", y: 2 },
    ]),
  ]).client.metrics({
    websiteId: WEBSITE,
    range: "30d",
    timezone: "Europe/Istanbul",
    type: "event",
    now: NOW,
  });
  assert.deepEqual(valid.items, [
    { label: "product_view", value: 4 },
    { label: "add_to_cart", value: 2 },
  ]);
  await assert.rejects(
    () =>
      fixture([
        login(),
        response(200, [{ x: "purchase_from_browser", y: 1 }]),
      ]).client.metrics({
        websiteId: WEBSITE,
        range: "30d",
        timezone: "Europe/Istanbul",
        type: "event",
        now: NOW,
      }),
    /umami_provider_response_invalid/,
  );
});
test("funnel report preserves true ordered unique visitor progression", async () => {
  const f = fixture([
    login(),
    response(200, [
      { type: "event", value: "product_view", visitors: 7 },
      { type: "event", value: "add_to_cart", visitors: 4 },
    ]),
  ]);
  const result = await f.client.eventSessions({
    websiteId: WEBSITE,
    start: new Date("2026-07-01T00:00:00.000Z"),
    end: NOW,
    eventNames: ["product_view", "add_to_cart"],
  });
  assert.deepEqual(result.items, [
    { label: "product_view", value: 7 },
    { label: "add_to_cart", value: 4 },
  ]);
  assert.equal(new URL(f.requests[1]!.url).pathname, "/api/reports/funnel");
  assert.equal(f.requests[1]?.method, "POST");
});
test("overview event rates use independent unique sessions rather than an ordered funnel cohort", async () => {
  const f = fixture([
    login(),
    response(200, {
      data: { events: 12, visitors: 5, visits: 7, uniqueEvents: 1 },
    }),
    response(200, {
      data: { events: 9, visitors: 4, visits: 9, uniqueEvents: 1 },
    }),
  ]);
  const result = await f.client.independentEventSessions({
    websiteId: WEBSITE,
    start: new Date("2026-07-01T00:00:00.000Z"),
    end: NOW,
    eventNames: ["product_view", "add_to_cart"],
  });
  assert.deepEqual(result.items, [
    { label: "product_view", value: 7 },
    { label: "add_to_cart", value: 9 },
  ]);
  assert.ok(
    f.requests
      .slice(1)
      .every(
        (request) =>
          request.url.includes("/events/stats?") &&
          request.url.includes("event="),
      ),
  );
});
test("funnel report carries global dimensions and product/category filters on every ordered step", async () => {
  const f = fixture([
    login(),
    response(200, [{ type: "event", value: "product_view", visitors: 1 }]),
  ]);
  await f.client.eventSessions({
    websiteId: WEBSITE,
    start: new Date("2026-07-01T00:00:00.000Z"),
    end: NOW,
    eventNames: ["product_view"],
    filters: {
      device: "mobile",
      source: "google",
      campaign: "summer",
      currency: "TRY",
      productId: WEBSITE,
      categoryId: "50000000-0000-4000-8000-000000000002",
    },
  });
  const body = JSON.parse(await f.requests[1]!.text());
  assert.deepEqual(body.filters, {
    device: "mobile",
    utmSource: "google",
    utmCampaign: "summer",
  });
  assert.deepEqual(body.parameters.steps[0].filters, [
    { property: "product_id", operator: "eq", value: WEBSITE },
    {
      property: "category_id",
      operator: "eq",
      value: "50000000-0000-4000-8000-000000000002",
    },
    { property: "currency", operator: "eq", value: "TRY" },
  ]);
});
test("paid funnel preserves exact opaque-session order beyond two thousand raw events", async () => {
  const reference = `h1_${"a".repeat(64)}`,
    row = (page: number) => ({
      data: [
        {
          sessionId: WEBSITE,
          propertyKeys: ["anonymous_session_ref"],
          propertyValues: [reference],
          createdAt: "2026-07-20T10:00:00.000Z",
        },
      ],
      count: 2501,
      page,
      pageSize: 1000,
    }),
    f = fixture([
      login(),
      response(200, row(1)),
      response(200, row(2)),
      response(200, row(3)),
    ]);
  const result = await f.client.eventSessions({
    websiteId: WEBSITE,
    start: new Date("2026-07-01T00:00:00.000Z"),
    end: NOW,
    eventNames: ["product_view", "purchase"],
    verifiedPurchases: [
      {
        anonymousSessionRef: reference,
        occurredAt: "2026-07-20T11:00:00.000Z",
      },
      {
        anonymousSessionRef: `h1_${"b".repeat(64)}`,
        occurredAt: "2026-07-20T11:00:00.000Z",
      },
    ],
    filters: { currency: "TRY" },
  });
  assert.deepEqual(result.items, [
    { label: "product_view", value: 1 },
    { label: "purchase", value: 1 },
  ]);
  assert.equal(f.requests.length, 4);
  for (const request of f.requests.slice(1))
    assert.equal(
      new URL(request.url).searchParams.get("pf_currency"),
      "1.eq.TRY",
    );
});
test("paid funnel partitions high-volume ranges and merges opaque sessions exactly", async () => {
  const reference = `h1_${"c".repeat(64)}`,
    event = {
      sessionId: WEBSITE,
      propertyKeys: ["anonymous_session_ref"],
      propertyValues: [reference],
      createdAt: "2026-07-20T10:00:00.000Z",
    },
    f = fixture([
      login(),
      response(200, { data: [], count: 10001, page: 1, pageSize: 1000 }),
      response(200, { data: [event], count: 1, page: 1, pageSize: 1000 }),
      response(200, { data: [event], count: 1, page: 1, pageSize: 1000 }),
    ]);
  const result = await f.client.eventSessions({
    websiteId: WEBSITE,
    start: new Date("2026-07-01T00:00:00.000Z"),
    end: NOW,
    eventNames: ["product_view", "purchase"],
    verifiedPurchases: [
      {
        anonymousSessionRef: reference,
        occurredAt: "2026-07-20T11:00:00.000Z",
      },
    ],
  });
  assert.deepEqual(result.items, [
    { label: "product_view", value: 1 },
    { label: "purchase", value: 1 },
  ]);
  assert.equal(f.requests.length, 4);
  const ranges = f.requests.slice(1).map((request) => {
    const url = new URL(request.url);
    return `${url.searchParams.get("startAt")}:${url.searchParams.get("endAt")}`;
  });
  assert.equal(new Set(ranges).size, 3);
});
test("provider traffic filters reject PII before a request is sent", async () => {
  const f = fixture([]);
  await assert.rejects(
    f.client.eventSessions({
      websiteId: WEBSITE,
      start: new Date("2026-07-01T00:00:00.000Z"),
      end: NOW,
      eventNames: ["product_view"],
      filters: { source: "user@example.test" },
    }),
    /umami_provider_input_invalid/,
  );
  assert.equal(f.requests.length, 0);
});
test("product event values use bounded server aggregation and preserve safe filters", async () => {
  const f = fixture([
    login(),
    response(200, [
      { value: WEBSITE, total: 3 },
      { value: "50000000-0000-4000-8000-000000000003", total: 8000 },
    ]),
  ]);
  const result = await f.client.eventPropertyValues({
    websiteId: WEBSITE,
    start: new Date("2026-07-01T00:00:00.000Z"),
    end: NOW,
    eventName: "product_view",
    propertyName: "product_id",
    productIds: [WEBSITE],
    filters: {
      device: "desktop",
      source: "direct",
      currency: "TRY",
      categoryId: "50000000-0000-4000-8000-000000000002",
    },
  });
  assert.deepEqual(result.items, [{ label: WEBSITE, value: 3 }]);
  const url = new URL(f.requests[1]!.url);
  assert.equal(url.pathname, `/api/websites/${WEBSITE}/event-data/values`);
  assert.equal(url.searchParams.get("event"), "product_view");
  assert.equal(url.searchParams.get("eventName"), "product_view");
  assert.equal(url.searchParams.get("propertyName"), "product_id");
  assert.equal(url.searchParams.get("utmSource"), "direct");
  assert.equal(url.searchParams.get("device"), "desktop");
  assert.equal(
    url.searchParams.get("pf_category_id"),
    "1.eq.50000000-0000-4000-8000-000000000002",
  );
  assert.equal(url.searchParams.get("pf_currency"), "1.eq.TRY");
  assert.equal(url.searchParams.get("pf_product_id"), `1.re.^(?:${WEBSITE})$`);
  assert.equal(
    url.searchParams.get("epf1"),
    `1.re.product_id.^(?:${WEBSITE})$`,
  );
});
test("product event values batch a full product page into four server-side filters", async () => {
  const productIds = Array.from(
      { length: 100 },
      (_, index) =>
        `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    ),
    f = fixture([
      login(),
      ...[0, 25, 50, 75].map((index) =>
        response(200, [{ value: productIds[index], total: index + 1 }]),
      ),
    ]);
  const result = await f.client.eventPropertyValues({
    websiteId: WEBSITE,
    start: new Date("2026-07-01T00:00:00.000Z"),
    end: NOW,
    eventName: "product_view",
    propertyName: "product_id",
    productIds,
  });
  assert.equal(f.requests.length, 5);
  assert.deepEqual(
    result.items.map((row) => row.label),
    [productIds[75], productIds[50], productIds[25], productIds[0]],
  );
  for (const request of f.requests.slice(1)) {
    const filter = new URL(request.url).searchParams.get("epf1") ?? "";
    assert.match(filter, /^1[.]re[.]product_id[.]\^[(][?][:]/);
    assert.equal((filter.match(/50000000-/g) ?? []).length, 25);
  }
});
test("acquisition breakdown keeps per-source visitor and event-session counts distinct", async () => {
  const row = {
    utmSource: "google",
    utmMedium: "cpc",
    utmCampaign: "summer",
    visitors: 10,
    views: 15,
  };
  const f = fixture([
    login(),
    response(200, [row]),
    response(200, [{ ...row, visitors: 8, views: 8 }]),
    response(200, [{ ...row, visitors: 5, views: 5 }]),
    response(200, [{ ...row, visitors: 3, views: 3 }]),
  ]);
  const result = await f.client.acquisitionBreakdown({
    websiteId: WEBSITE,
    start: new Date("2026-07-01T00:00:00.000Z"),
    end: NOW,
  });
  assert.deepEqual(result.items, [
    {
      source: "google",
      medium: "cpc",
      campaign: "summer",
      visitors: 10,
      pageviews: 15,
      productViews: 8,
      addsToCart: 5,
      checkouts: 3,
    },
  ]);
  assert.equal(
    f.requests.filter((request) =>
      request.url.endsWith("/api/reports/breakdown"),
    ).length,
    4,
  );
});
test("non-monotonic funnel and oversized event pivots fail closed", async () => {
  await assert.rejects(
    () =>
      fixture([
        login(),
        response(200, [
          { type: "event", value: "product_view", visitors: 2 },
          { type: "event", value: "add_to_cart", visitors: 3 },
        ]),
      ]).client.eventSessions({
        websiteId: WEBSITE,
        start: new Date("2026-07-01T00:00:00.000Z"),
        end: NOW,
        eventNames: ["product_view", "add_to_cart"],
      }),
    /umami_provider_response_invalid/,
  );
  const config = { ...CONFIG, maximumMetricRows: 1 };
  await assert.rejects(
    () =>
      fixtureWith(config, [
        login(),
        response(200, [
          { value: WEBSITE, total: 1 },
          { value: "50000000-0000-4000-8000-000000000003", total: 1 },
        ]),
      ]).client.eventPropertyValues({
        websiteId: WEBSITE,
        start: new Date("2026-07-01T00:00:00.000Z"),
        end: NOW,
        eventName: "product_view",
        propertyName: "product_id",
        productIds: [WEBSITE, "50000000-0000-4000-8000-000000000003"],
      }),
    /umami_provider_response_too_large/,
  );
});
test("request timeout produces only the stable provider error", async () => {
  const config = { ...CONFIG, timeoutMs: 5 };
  const client = createUmamiClient(config, {
    fetch: async () => new Promise(() => undefined),
  });
  await assert.rejects(
    () => client.getWebsite(WEBSITE),
    (error: unknown) =>
      error instanceof UmamiProviderError &&
      error.message === "umami_provider_timeout",
  );
});
test("maximum metric rows is enforced", async () => {
  const config = { ...CONFIG, maximumMetricRows: 1 };
  await assert.rejects(
    () =>
      fixtureWith(config, [
        login(),
        response(200, [
          { x: "/a", y: 1 },
          { x: "/b", y: 2 },
        ]),
      ]).client.metrics({
        websiteId: WEBSITE,
        range: "7d",
        timezone: "UTC",
        type: "path",
        now: NOW,
      }),
    /umami_provider_response_invalid/,
  );
});
test("errors and audit output never contain credentials or bearer token", async () => {
  const audit: unknown[] = [];
  const client = createUmamiClient(CONFIG, {
    fetch: async () => {
      throw Error("private-password bearer-token");
    },
    audit: (event) => {
      audit.push(event);
    },
  });
  await assert.rejects(
    () => client.getWebsite(WEBSITE),
    (error: unknown) => !String(error).includes("private-password"),
  );
  assert.doesNotMatch(JSON.stringify(audit), /private-password|bearer-token/);
});
test("provider concurrency never exceeds four calls", async () => {
  let active = 0,
    maximum = 0;
  const fetch: UmamiFetch = async (request) => {
    if (request.url.endsWith("/api/auth/login")) return login();
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active--;
    return response(200, site());
  };
  const client = createUmamiClient(CONFIG, { fetch });
  await Promise.all(
    Array.from({ length: 12 }, () => client.getWebsite(WEBSITE)),
  );
  assert.equal(maximum, 4);
});
test("all requests are no-store JSON and secret-free inputs reject before fetch", async () => {
  const f = fixture([login(), response(200, site())]);
  await f.client.getWebsite(WEBSITE);
  for (const request of f.requests) {
    assert.equal(request.cache, "no-store");
    assert.equal(request.headers.get("accept"), "application/json");
  }
  await assert.rejects(
    () =>
      f.client.createWebsite({
        websiteId: WEBSITE,
        name: " bad",
        domain: "store.example.test",
      }),
    /umami_provider_input_invalid/,
  );
});
function fixtureWith(config: UmamiPrivateApiConfig, values: Response[]) {
  const requests: Request[] = [];
  return {
    client: createUmamiClient(config, {
      fetch: async (request) => {
        requests.push(request);
        const value = values.shift();
        if (!value) throw Error("missing");
        return value;
      },
    }),
    requests,
  };
}
