import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";

import { createStorefrontProxy } from "../proxy.ts";
import { createCanonicalStorefrontLocation } from "./custom-domain-canonicalization.ts";

test("canonical storefront location preserves a safe path and query for an active alias", () => {
  assert.equal(createCanonicalStorefrontLocation({
    requestedHostname: "shop.pilot.example",
    primaryHostname: "www.pilot.example",
    pathname: "/products/altin-yuzuk",
    search: "?sort=new&color=gold",
  }), "https://www.pilot.example/products/altin-yuzuk?sort=new&color=gold");
  assert.equal(createCanonicalStorefrontLocation({
    requestedHostname: "www.pilot.example",
    primaryHostname: "www.pilot.example",
    pathname: "/products",
    search: "",
  }), null);
});

test("canonical storefront location rejects ambiguous or attacker-controlled authorities", () => {
  for (const input of [
    { requestedHostname: "SHOP.pilot.example", primaryHostname: "www.pilot.example", pathname: "/", search: "" },
    { requestedHostname: "shop.pilot.example", primaryHostname: "evil.example:444", pathname: "/", search: "" },
    { requestedHostname: "shop.pilot.example", primaryHostname: "www.pilot.example", pathname: "//evil.example", search: "" },
    { requestedHostname: "shop.pilot.example", primaryHostname: "www.pilot.example", pathname: "/safe\\evil", search: "" },
    { requestedHostname: "shop.pilot.example", primaryHostname: "www.pilot.example", pathname: "/safe", search: "#fragment" },
  ]) assert.throws(() => createCanonicalStorefrontLocation(input), /storefront_canonicalization_invalid/u);
});

test("storefront proxy redirects active aliases before media and analytics work", async () => {
  let mediaCalls = 0;
  let analyticsCalls = 0;
  const handler = createStorefrontProxy({
    selectAuthority: () => ({ kind: "trusted", hostname: "shop.pilot.example" }),
    resolveCanonicalHostname: async () => "www.pilot.example",
    resolveMediaOrigin: () => { mediaCalls += 1; return "https://media.example"; },
    authorizePaytrIframe: async () => false,
    resolveAnalytics: async () => { analyticsCalls += 1; return null; },
    now: () => new Date("2026-08-05T10:00:00.000Z"),
  });

  const response = await handler(new NextRequest("https://internal.example/products/altin-yuzuk?sort=new"));

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://www.pilot.example/products/altin-yuzuk?sort=new");
  assert.equal(mediaCalls, 0);
  assert.equal(analyticsCalls, 0);
});

test("storefront proxy fails closed when canonical authority is malformed", async () => {
  const handler = createStorefrontProxy({
    selectAuthority: () => ({ kind: "trusted", hostname: "shop.pilot.example" }),
    resolveCanonicalHostname: async () => "evil.example:444",
    resolveMediaOrigin: () => "https://media.example",
    authorizePaytrIframe: async () => false,
    now: () => new Date("2026-08-05T10:00:00.000Z"),
  });

  const response = await handler(new NextRequest("https://internal.example/products"));
  assert.equal(response.status, 503);
});

test("storefront proxy returns HTTP 404 for an unknown authenticated root before page rendering", async () => {
  let presentationCalls = 0;
  const handler = createStorefrontProxy({
    selectAuthority: () => ({ kind: "trusted", hostname: "unknown.saas-staging.celebix.net" }),
    resolveCanonicalHostname: async ({ hostname }) => {
      assert.equal(hostname, "unknown.saas-staging.celebix.net");
      return null;
    },
    resolveMediaOrigin: () => { presentationCalls += 1; return "https://media.example"; },
    authorizePaytrIframe: async () => { presentationCalls += 1; return false; },
    resolveAnalytics: async () => { presentationCalls += 1; return null; },
    now: () => new Date("2026-09-27T10:00:00.000Z"),
  });

  for (const target of ["https://internal.example/", "https://internal.example/?source=onboarding"]) {
    const response = await handler(new NextRequest(target));

    assert.equal(response.status, 404);
    assert.equal(response.headers.get("x-middleware-next"), null);
    assert.equal(response.headers.get("location"), null);
    assert.match(response.headers.get("cache-control") ?? "", /(?:^|,\s*)no-store(?:,|$)/u);
    assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'none'/u);
  }
  assert.equal(presentationCalls, 0);
});

test("storefront proxy continues page rendering for an active primary hostname", async () => {
  const handler = createStorefrontProxy({
    selectAuthority: () => ({ kind: "trusted", hostname: "shop.saas-staging.celebix.net" }),
    resolveCanonicalHostname: async () => "shop.saas-staging.celebix.net",
    resolveMediaOrigin: () => "https://media.example",
    authorizePaytrIframe: async () => false,
    now: () => new Date("2026-09-27T10:00:00.000Z"),
  });

  const response = await handler(new NextRequest("https://internal.example/"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("location"), null);
});

test("storefront proxy keeps unavailable canonical authority as HTTP 503", async () => {
  const handler = createStorefrontProxy({
    selectAuthority: () => ({ kind: "trusted", hostname: "shop.saas-staging.celebix.net" }),
    resolveCanonicalHostname: async () => { throw new Error("repository unavailable"); },
    resolveMediaOrigin: () => "https://media.example",
    authorizePaytrIframe: async () => false,
    now: () => new Date("2026-09-27T10:00:00.000Z"),
  });

  const response = await handler(new NextRequest("https://internal.example/"));

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("x-middleware-next"), null);
});

test("exact PayTR callback keeps its authority adapter ahead of unknown storefront presentation", async () => {
  const handler = createStorefrontProxy({
    selectAuthority: () => ({ kind: "trusted", hostname: "unknown.saas-staging.celebix.net" }),
    resolveCanonicalHostname: async () => null,
    resolveMediaOrigin: () => { throw new Error("presentation unavailable"); },
    authorizePaytrIframe: async () => false,
    now: () => new Date("2026-09-27T10:00:00.000Z"),
  });

  const response = await handler(new NextRequest("https://internal.example/api/payments/paytr/callback", { method: "POST" }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("location"), null);
});
