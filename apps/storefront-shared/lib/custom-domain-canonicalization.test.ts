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
