import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(): Promise<string> {
  return readFile(new URL("./StorefrontAnalyticsTracker.tsx", import.meta.url), "utf8");
}

test("tracker renders the exact manual Umami script attributes", async () => {
  const value = await source();
  assert.match(value, /data-website-id=\{props[.]websiteId\}/);
  assert.match(value, /data-auto-track="false"/);
  assert.match(value, /data-exclude-search="true"/);
  assert.match(value, /data-exclude-hash="true"/);
  assert.match(value, /data-do-not-track="true"/);
});

test("nonce and exact collector authority propagate", async () => {
  const value = await source();
  assert.match(value, /nonce=\{props[.]nonce\}/);
  assert.match(value, /data-host-url=\{props[.]collectorOrigin\}/);
  assert.match(value, /data-domains=\{props[.]hostname\}/);
});

test("component uses an explicit ready callback rather than automatic pageviews", async () => {
  const value = await source();
  assert.match(value, /onReady/);
  assert.match(value, /trackPageview/);
  assert.doesNotMatch(value, /data-auto-track=["']true/);
  const client = await readFile(new URL("../lib/analytics/tracker-client.ts", import.meta.url), "utf8");
  assert.doesNotMatch(client, /document[.]cookie|localStorage|sessionStorage|location[.]search|location[.]hash|TenantContext|storeId|principalId|membershipId/);
});

test("exact-host analytics extends only the approved CSP destinations", async () => {
  const [{ createStorefrontProxy }, { NextRequest }] = await Promise.all([import("../proxy.ts"), import("next/server.js")]);
  const calls: string[] = [];
  const handler = createStorefrontProxy({
    selectAuthority: (headers) => ({ kind: "trusted", hostname: headers.get("x-storefront-host") ?? "unknown.example.test" }),
    resolveMediaOrigin: () => "https://media.example.test",
    authorizePaytrIframe: async () => false,
    now: () => new Date("2026-07-26T12:00:00.000Z"),
    resolveAnalytics: async ({ hostname }) => {
      calls.push(hostname);
      return hostname === "shop.example.test"
        ? { scriptOrigin: "https://analytics.example.test", collectorOrigin: "https://analytics.example.test" }
        : null;
    },
  });
  const active = await handler(new NextRequest("https://internal.example.test/products", { headers: { "x-storefront-host": "shop.example.test" } }));
  const activeCsp = active.headers.get("content-security-policy") ?? "";
  assert.match(activeCsp, /script-src 'nonce-[^']+' 'strict-dynamic' https:\/\/analytics[.]example[.]test/);
  assert.match(activeCsp, /connect-src 'self' https:\/\/analytics[.]example[.]test/);
  assert.match(activeCsp, /style-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(activeCsp, /script-src[^;]*(?:\*|unsafe-inline| https:;)/);

  const inactive = await handler(new NextRequest("https://internal.example.test/products", { headers: { "x-storefront-host": "alias.example.test" } }));
  const inactiveCsp = inactive.headers.get("content-security-policy") ?? "";
  assert.match(inactiveCsp, /connect-src 'self'/);
  assert.doesNotMatch(inactiveCsp, /analytics[.]example[.]test/);
  assert.deepEqual(calls, ["shop.example.test", "alias.example.test"]);
});
