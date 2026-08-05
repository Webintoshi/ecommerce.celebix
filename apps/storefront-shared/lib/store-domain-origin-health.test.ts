import assert from "node:assert/strict";
import test from "node:test";

import { StoreDomainRepositoryError } from "@celebix/saas-data";

import { createStoreDomainOriginHealthRoute } from "./store-domain-origin-health.ts";

const HOST = "www.example.com";
const STORE = "33333333-3333-4333-8333-333333333333";
const NOW = new Date("2026-08-05T12:00:00.000Z");

function request(path = "/api/health") {
  return new Request(`http://storefront-shared:3450${path}`);
}

test("origin health returns only the exact database-bound hostname marker", async () => {
  const route = createStoreDomainOriginHealthRoute({
    selectAuthority: () => ({ kind: "trusted", hostname: HOST }),
    resolveRepository: async () => ({ get: async () => ({ schemaVersion: 1, status: "ok", storeId: STORE, hostname: HOST }) }),
    now: () => NOW,
  });

  const response = await route(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { schemaVersion: 1, status: "ok", storeId: STORE, hostname: HOST });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("origin health fails closed before repository access for untrusted and near-match requests", async () => {
  let calls = 0;
  const dependencies = {
    selectAuthority: () => ({ kind: "invalid_proxy_authority" } as const),
    resolveRepository: async () => ({ get: async () => { calls += 1; throw new Error("unused"); } }),
    now: () => NOW,
  };
  const route = createStoreDomainOriginHealthRoute(dependencies);
  assert.equal((await route(request())).status, 404);
  assert.equal((await route(request("/api/health?debug=1"))).status, 404);
  assert.equal(calls, 0);
});

test("origin health distinguishes unknown host from repository outage without exposing errors", async () => {
  const response = async (code: "not_found" | "unavailable") => createStoreDomainOriginHealthRoute({
    selectAuthority: () => ({ kind: "trusted", hostname: HOST }),
    resolveRepository: async () => ({ get: async () => { throw new StoreDomainRepositoryError(code); } }),
    now: () => NOW,
  })(request());

  const missing = await response("not_found");
  const unavailable = await response("unavailable");
  assert.equal(missing.status, 404);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await missing.json(), { code: "storefront_not_found" });
  assert.deepEqual(await unavailable.json(), { code: "storefront_unavailable" });
});

test("proxy never canonicalizes the exact origin-health probe", async () => {
  const { createStorefrontProxy } = await import("../proxy.ts");
  const { NextRequest } = await import("next/server.js");
  let canonicalCalls = 0;
  const handler = createStorefrontProxy({
    selectAuthority: () => ({ kind: "trusted", hostname: HOST }),
    resolveMediaOrigin: () => "https://media.example.com",
    authorizePaytrIframe: async () => false,
    resolveCanonicalHostname: async () => { canonicalCalls += 1; return "primary.example.com"; },
    now: () => NOW,
  });

  const health = await handler(new NextRequest("https://internal.example/api/health"));
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("location"), null);
  assert.equal(canonicalCalls, 0);

  const page = await handler(new NextRequest("https://internal.example/products?sort=new"));
  assert.equal(page.status, 308);
  assert.equal(page.headers.get("location"), "https://primary.example.com/products?sort=new");
  assert.equal(canonicalCalls, 1);
});
