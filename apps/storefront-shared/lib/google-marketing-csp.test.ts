import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import { createStorefrontProxy } from "../proxy.ts";
const projection = { gtmContainerId: "GTM-ABC123", ads: { tagId: "AW-123456", conversionLabel: "purchase_Label" }, verificationToken: null };
function handler(selected: unknown = projection, paytr = false) {
  return createStorefrontProxy({
    selectAuthority: () => ({ kind: "trusted", hostname: "shop.example.com" }),
    resolveMediaOrigin: () => "https://media.example.com", now: () => new Date("2026-10-08T12:00:00Z"),
    authorizePaytrIframe: async () => paytr,
    resolveAnalytics: async () => ({ scriptOrigin: "https://native.example.com", collectorOrigin: "https://collector.example.com" }),
    resolveGoogleMarketing: async ({ hostname }: { hostname: string }) => { assert.equal(hostname, "shop.example.com"); return selected; },
  });
}
test("active Google CSP adds bounded destinations alongside the managed tracker", async () => {
  const response = await handler()(new NextRequest("https://internal.example/products/example"));
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /script-src 'nonce-[^']+' 'self' https:\/\/native.example.com https:\/\/www.googletagmanager.com/u);
  assert.match(csp, /connect-src 'self' https:\/\/collector.example.com https:\/\/www.googletagmanager.com/u);
  assert.match(csp, /frame-src https:\/\/www.googletagmanager.com/u);
  assert.doesNotMatch(csp, /unsafe-eval|strict-dynamic|\*|http:/u);
});
test("inactive or invalid Google projection does not expand CSP", async () => {
  for (const selected of [null, { ...projection, gtmContainerId: "GTM-bad<script>" }, { gtmContainerId: null, ads: null, verificationToken: "verified" }]) {
    const response = await handler(selected)(new NextRequest("https://internal.example/products/example"));
    assert.doesNotMatch(response.headers.get("content-security-policy") ?? "", /googletagmanager|googleadservices|doubleclick/u);
  }
});
test("quick checkout form keeps same host form authority with native Google CSP", async () => {
  const response = await handler()(new NextRequest("https://internal.example/odeme/hizli"));
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /form-action https:\/\/shop.example.com/u);
  assert.match(csp, /www.googletagmanager.com/u);
});
test("authorized PayTR iframe stays isolated from Google tracking destinations", async () => {
  const response = await handler(projection, true)(new NextRequest("https://internal.example/odeme/hizli/odeme"));
  const csp = response.headers.get("content-security-policy") ?? "";
  assert.match(csp, /frame-src https:\/\/www.paytr.com/u);
  assert.doesNotMatch(csp, /googletagmanager|googleadservices|script-src/u);
});
