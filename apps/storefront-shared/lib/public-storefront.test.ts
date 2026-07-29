import assert from "node:assert/strict";
import test from "node:test";
import { PublicStorefrontRepositoryError, type PublicStorefrontRepository } from "@celebix/saas-data";

import { resolvePublicStorefrontRequest } from "./public-storefront.ts";

const STOREFRONT = Object.freeze({ schemaVersion: 1 as const, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Pilot Mağaza", slug: "pilot-store", hostname: "pilot-store.saas-staging.celebix.site", primaryHostname: "pilot-store.saas-staging.celebix.site", canonicalUrl: "https://pilot-store.saas-staging.celebix.site/", currency: "TRY" as const, locale: "tr" as const, themeKey: "hemenaku" });
function headers(values: Record<string, string>) { return { get(name: string) { return values[name.toLowerCase()] ?? null; } }; }
function repository(get: PublicStorefrontRepository["getPublicStorefront"]): PublicStorefrontRepository { return { getPublicStorefront: get, async listPublicProducts() { throw new Error(); }, async getPublicProductBySlug() { throw new Error(); }, async listPublicProductMedia() { throw new Error(); } }; }

test("invalid proxy authority fails before the persisted exact-host resolver", async () => {
  let calls = 0;
  const result = await resolvePublicStorefrontRequest({ headers: headers({ host: STOREFRONT.hostname, "x-forwarded-host": STOREFRONT.hostname }), source: {}, repository: repository(async () => { calls += 1; return STOREFRONT; }), now: new Date("2026-07-19T10:00:00.000Z") });
  assert.deepEqual(result, { kind: "unavailable" });
  assert.equal(calls, 0);
});

test("trusted proxy selects only the authenticated canonical hostname", async () => {
  const received: string[] = [];
  const source = { CELEBIX_DEPLOYMENT_TIER: "staging", CELEBIX_STOREFRONT_PROXY_MODE: "approved_staging", CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL: Buffer.alloc(32, 0x41).toString("base64url") };
  const result = await resolvePublicStorefrontRequest({
    headers: headers({ host: "attacker.internal", "x-forwarded-host": STOREFRONT.hostname, "x-forwarded-proto": "https", "x-celebix-storefront-proxy": `p1.${source.CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL}` }), source,
    repository: repository(async (input) => { received.push(input.hostname); return STOREFRONT; }), now: new Date("2026-07-19T10:00:00.000Z"),
  });
  assert.equal(result.kind, "active");
  assert.deepEqual(received, [STOREFRONT.hostname]);
});

test("unknown authenticated hostname becomes not found without a default tenant", async () => {
  const source = { CELEBIX_DEPLOYMENT_TIER: "staging", CELEBIX_STOREFRONT_PROXY_MODE: "approved_staging", CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL: Buffer.alloc(32, 0x41).toString("base64url") };
  const result = await resolvePublicStorefrontRequest({ headers: headers({ "x-forwarded-host": "unknown.saas-staging.celebix.site", "x-forwarded-proto": "https", "x-celebix-storefront-proxy": `p1.${source.CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL}` }), source, repository: repository(async () => { throw new PublicStorefrontRepositoryError("not_found"); }), now: new Date("2026-07-19T10:00:00.000Z") });
  assert.deepEqual(result, { kind: "not_found" });
});
