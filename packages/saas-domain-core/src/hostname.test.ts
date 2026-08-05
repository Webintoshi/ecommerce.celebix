import assert from "node:assert/strict";
import test from "node:test";

import { normalizeStorefrontHostname, type StorefrontHostnamePolicy } from "./hostname.ts";

const POLICY: StorefrontHostnamePolicy = Object.freeze({
  reservedSuffixes: Object.freeze(["celebix.site", "saas-staging.celebix.site"]),
  cnameTarget: "shops.celebix.site",
});

test("normalizes one Unicode storefront hostname to its exact registrable A-label", () => {
  assert.deepEqual(normalizeStorefrontHostname("WWW.Örnek.com.", POLICY), {
    hostname: "www.xn--rnek-4qa.com",
    registrableDomain: "xn--rnek-4qa.com",
    recordName: "www",
    apex: false,
  });
});

test("projects an apex hostname without inventing a DNS label", () => {
  assert.deepEqual(normalizeStorefrontHostname("example.com", POLICY), {
    hostname: "example.com",
    registrableDomain: "example.com",
    recordName: "@",
    apex: true,
  });
});

for (const raw of [
  "https://shop.example.com",
  "*.example.com",
  "127.0.0.1",
  "localhost",
  "shop.celebix.site",
  "example.invalid",
  " shop.example.com",
] as const) {
  test(`rejects unsafe storefront hostname input: ${raw}`, () => {
    assert.throws(
      () => normalizeStorefrontHostname(raw, POLICY),
      /storefront_hostname_invalid/u,
    );
  });
}

test("rejects an ambiguous or unsafe hostname policy", () => {
  for (const policy of [
    { ...POLICY, reservedSuffixes: [] },
    { ...POLICY, reservedSuffixes: ["Celebix.site"] },
    { ...POLICY, cnameTarget: "https://shops.celebix.site" },
  ]) {
    assert.throws(
      () => normalizeStorefrontHostname("shop.example.com", policy),
      /storefront_hostname_invalid/u,
    );
  }
});
