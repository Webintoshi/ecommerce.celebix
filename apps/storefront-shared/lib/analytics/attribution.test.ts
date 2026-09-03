import assert from "node:assert/strict";
import test from "node:test";

import { parseCommerceAttribution, readCommerceAttribution } from "./attribution.ts";

function browser(href: string, referrer = "", userAgent = "Mozilla/5.0 Mobile Safari/605.1") {
  let stored: string | null = null;
  return {
    location: new URL(href),
    document: { referrer },
    navigator: { userAgent },
    sessionStorage: { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } },
  };
}

test("captures bounded first and last touch without full referrer or query authority", () => {
  const value = browser("https://shop.example.test/products/ring?utm_source=atlas-qa&utm_medium=test&utm_campaign=cart-recovery", "https://search.example/private?q=email@example.test");
  const first = readCommerceAttribution(value);
  assert.deepEqual(first, { firstTouch: { source: "atlas-qa", medium: "test", campaign: "cart-recovery" }, lastTouch: { source: "atlas-qa", medium: "test", campaign: "cart-recovery" }, referrerHost: "search.example", landingPathGroup: "/products/ring", deviceGroup: "mobile" });
  value.location = new URL("https://shop.example.test/cart?utm_source=second&utm_medium=email&utm_campaign=return");
  const second = readCommerceAttribution(value);
  assert.equal(second.firstTouch.source, "atlas-qa");
  assert.equal(second.lastTouch.source, "second");
  assert.doesNotMatch(JSON.stringify(second), /private|email@example|https:/);
});

test("high-risk UTM values are reduced to explicit direct or unknown buckets", () => {
  for (const unsafe of ["person@example.test", "+905551112233", "https://evil.test/x", "4111111111111111"]) {
    const value = readCommerceAttribution(browser(`https://shop.example.test/?utm_source=${encodeURIComponent(unsafe)}`));
    assert.equal(value.firstTouch.source, "direct");
    assert.equal(value.firstTouch.medium, "none");
  }
});

test("parser rejects unknown keys, unsafe hostnames, paths, devices, and oversized input", () => {
  const valid = readCommerceAttribution(browser("https://shop.example.test/category/rings"));
  assert.deepEqual(parseCommerceAttribution(valid), valid);
  for (const invalid of [{ ...valid, storeId: "private" }, { ...valid, referrerHost: "evil.test/path" }, { ...valid, landingPathGroup: "/ok?q=private" }, { ...valid, deviceGroup: "fingerprint" }, { ...valid, firstTouch: { source: "x".repeat(129), medium: "none" } }]) assert.throws(() => parseCommerceAttribution(invalid), /commerce_attribution_invalid/);
});
