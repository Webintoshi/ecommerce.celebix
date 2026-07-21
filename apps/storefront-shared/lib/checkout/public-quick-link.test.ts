import assert from "node:assert/strict";
import test from "node:test";

import type { PublicQuickOrderRepository, PublicStorefrontRepository } from "@celebix/saas-data";
import { processPublicQuickOrderTokenRequest, resolvePublicQuickOrder } from "./public-quick-link.ts";
import { createCheckoutRuntime } from "./runtime.ts";

const token = Buffer.alloc(32, 0x42).toString("base64url");
const oldCredential = `q1.${Buffer.alloc(32, 0x43).toString("base64url")}`;
const newCredentialBytes = Buffer.alloc(32, 0x44);
const now = new Date("2026-07-22T09:00:00.000Z");
const quote = Object.freeze({ schemaVersion: 1 as const, status: "active" as const, merchantName: "Atlas Store", currency: "TRY" as const, subtotalCents: 1000, shippingCents: 0, discountCents: 0, totalCents: 1000, expiresAt: "2026-07-23T09:00:00.000000Z", items: Object.freeze([Object.freeze({ productName: "Mug", unitPriceCents: 1000, quantity: 1, lineTotalCents: 1000 })]) });

function repositories(selected = "shop.example.test", primary = "shop.example.test") {
  const calls = { storefront: [] as string[], claim: [] as unknown[], resolve: [] as unknown[] };
  const storefrontRepository = {
    async getPublicStorefront(input: { hostname: string }) { calls.storefront.push(input.hostname); return { schemaVersion: 1, id: "00000000-0000-4000-8000-000000000001", name: "Atlas Store", slug: "atlas", hostname: selected, primaryHostname: primary, canonicalUrl: `https://${selected}/`, currency: "TRY", locale: "tr", themeKey: "starter" }; },
    async listPublicProducts() { return { items: [] }; }, async getPublicProductBySlug() { throw new Error("unused"); }, async listPublicProductMedia() { return []; },
  } satisfies PublicStorefrontRepository;
  const quickOrderRepository = {
    async claimRedemption(input: unknown) { calls.claim.push(input); return quote; },
    async resolveRedemption(input: unknown) { calls.resolve.push(input); return quote; },
    async getStatus() { return { kind: "ready" as const, quote }; }, async revokeRedemption() {},
  } satisfies PublicQuickOrderRepository;
  return { calls, runtime: createCheckoutRuntime({ storefrontRepository, quickOrderRepository }) };
}

test("canonical host claims exact host plus token digest and returns one scrub redirect with replacement cookie", async () => {
  const fixture = repositories();
  const result = await processPublicQuickOrderTokenRequest({ request: new Request(`http://storefront.internal:3450/odeme/hizli/${token}`, { headers: { cookie: `__Host-celebix_quick=${oldCredential}`, host: "evil.internal", forwarded: "host=evil.example", "x-forwarded-host": "evil.example" } }), trustedHostname: "shop.example.test", now, runtime: fixture.runtime, randomBytes: () => newCredentialBytes, randomUUID: () => "00000000-0000-4000-8000-000000000002" });
  assert.equal(result.kind, "claimed");
  assert.equal(result.status, 303);
  assert.equal(result.location, "/odeme/hizli");
  assert.match(result.setCookie ?? "", /^__Host-celebix_quick=q1\./);
  assert.doesNotMatch(`${result.location}${JSON.stringify(result)}`, new RegExp(token));
  assert.equal(fixture.calls.claim.length, 1);
  assert.deepEqual(Object.keys(fixture.calls.claim[0] as object).sort(), ["expiresAt", "hostname", "now", "redemptionDigest", "redemptionId", "tokenDigest"]);
});

test("active alias redirects to persisted primary hostname without claim or cookie", async () => {
  const fixture = repositories("alias.example.test", "shop.example.test");
  const result = await processPublicQuickOrderTokenRequest({ request: new Request(`https://alias.example.test/odeme/hizli/${token}`), trustedHostname: "alias.example.test", now, runtime: fixture.runtime });
  assert.deepEqual(result, { kind: "canonical_redirect", status: 308, location: `https://shop.example.test/odeme/hizli/${token}` });
  assert.equal(fixture.calls.claim.length, 0);
});

test("wrong paths, query, methods, credentials, private headers, malformed cookies, and forged forwarding fail before mutation", async () => {
  const fixture = repositories();
  const credentialUrl = new Request(`https://shop.example.test/odeme/hizli/${token}`);
  Object.defineProperty(credentialUrl, "url", { value: `https://user:pass@shop.example.test/odeme/hizli/${token}` });
  const requests = [
    new Request(`https://shop.example.test/odeme/hizli/${token}?x=1`),
    new Request(`https://shop.example.test/odeme/hizli/${token}/child`),
    credentialUrl,
    new Request(`https://shop.example.test/odeme/hizli/${token}`, { method: "POST" }),
    new Request(`https://shop.example.test/odeme/hizli/${token}`, { headers: { authorization: "Bearer x" } }),
    new Request(`https://shop.example.test/odeme/hizli/${token}`, { headers: { cookie: "broken", "x-forwarded-host": "evil.example" } }),
  ];
  for (const request of requests) assert.equal((await processPublicQuickOrderTokenRequest({ request, trustedHostname: "shop.example.test", now, runtime: fixture.runtime })).kind, "denied");
  assert.equal(fixture.calls.claim.length, 0);
});

test("token-free resolution requires exact host plus current cookie digest and exposes only the public quote", async () => {
  const fixture = repositories();
  const result = await resolvePublicQuickOrder({ trustedHostname: "shop.example.test", cookieHeader: `__Host-celebix_quick=${oldCredential}`, now, runtime: fixture.runtime });
  assert.deepEqual(result, { kind: "active", quote });
  assert.equal(fixture.calls.resolve.length, 1);
  assert.deepEqual(Object.keys(quote).sort(), ["currency", "discountCents", "expiresAt", "items", "merchantName", "schemaVersion", "shippingCents", "status", "subtotalCents", "totalCents"]);
  assert.deepEqual(await resolvePublicQuickOrder({ trustedHostname: "shop.example.test", cookieHeader: null, now, runtime: fixture.runtime }), { kind: "denied" });
});
