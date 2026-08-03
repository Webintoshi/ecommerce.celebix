import assert from "node:assert/strict";
import test from "node:test";

import { PostgresPublicQuickOrderRepository, QuickOrderLinkRepositoryError, type PublicQuickOrderRepository, type PublicStorefrontRepository } from "@celebix/saas-data";
import {
  claimPublicQuickOrder,
  createPublicQuickOrderStatusRoute,
  createPublicQuickOrderTokenRoute,
  processPublicQuickOrderTokenRequest,
  resolvePublicQuickOrder,
} from "./public-quick-link.ts";
import { createCheckoutRuntime } from "./runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";

const token = Buffer.alloc(32, 0x42).toString("base64url");
const oldCredential = `q1.${Buffer.alloc(32, 0x43).toString("base64url")}`;
const newCredentialBytes = Buffer.alloc(32, 0x44);
const now = new Date("2026-07-22T09:00:00.000Z");
const quote = Object.freeze({ schemaVersion: 1 as const, status: "active" as const, merchantName: "Atlas Store", currency: "TRY" as const, subtotalCents: 1000, shippingCents: 0, discountCents: 0, totalCents: 1000, expiresAt: "2026-07-23T09:00:00.000000Z", items: Object.freeze([Object.freeze({ productName: "Mug", unitPriceCents: 1000, quantity: 1, lineTotalCents: 1000 })]) });

function repositories(selected = "shop.example.test", primary = "shop.example.test") {
  const calls = { storefront: [] as string[], claim: [] as unknown[], resolve: [] as unknown[], status: [] as unknown[] };
  const storefrontRepository = {
    async getPublicStorefront(input: { hostname: string }) { calls.storefront.push(input.hostname); return { schemaVersion: 1, id: "00000000-0000-4000-8000-000000000001", name: "Atlas Store", slug: "atlas", hostname: selected, primaryHostname: primary, canonicalUrl: `https://${selected}/`, currency: "TRY", locale: "tr", themeKey: "starter" }; },
    async listPublicProducts() { return { items: [] }; }, async getPublicProductBySlug() { throw new Error("unused"); }, async listPublicProductMedia() { return []; }, async getPublicStorefrontDesign() { throw new Error("unused"); },
  } satisfies PublicStorefrontRepository;
  const quickOrderRepository = {
    async claimRedemption(input: unknown) { calls.claim.push(input); return { quote, expiresAt: "2026-07-22T09:15:00.000000Z" }; },
    async resolveRedemption(input: unknown) { calls.resolve.push(input); return quote; },
    async getStatus(input: unknown) { calls.status.push(input); return { kind: "ready" as const, quote }; }, async revokeRedemption() {},
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

test("approved claimPublicQuickOrder interface returns persisted expiry authority", async () => {
  const fixture = repositories();
  const result = await claimPublicQuickOrder({ trustedHostname: "shop.example.test", token, now }, { runtime: fixture.runtime, randomBytes: () => newCredentialBytes, randomUUID: () => "00000000-0000-4000-8000-000000000002" });
  assert.equal(result.kind, "claimed");
  assert.match(result.kind === "claimed" ? result.setCookie : "", /Max-Age=900/);
});

test("repository uncertainty fails closed as unavailable without cookie redirect or retry", async () => {
  for (const [code, expectedStatus] of [
    ["commit_unknown", 503],
    ["unavailable", 503],
    ["invalid_input", 404],
    ["quick_link_not_found", 404],
  ] as const) {
    const fixture = repositories();
    const quickOrderRepository = {
      ...fixture.runtime.quickOrderRepository,
      async claimRedemption(input: Parameters<PublicQuickOrderRepository["claimRedemption"]>[0]) {
        fixture.calls.claim.push(input);
        throw new QuickOrderLinkRepositoryError(code);
      },
    } satisfies PublicQuickOrderRepository;
    const runtime = createCheckoutRuntime({ storefrontRepository: fixture.runtime.storefrontRepository, quickOrderRepository });
    const result = await claimPublicQuickOrder(
      { trustedHostname: "shop.example.test", token, now },
      { runtime, randomBytes: () => newCredentialBytes, randomUUID: () => "00000000-0000-4000-8000-000000000002" },
    );
    assert.deepEqual(result, expectedStatus === 503 ? { kind: "unavailable", status: 503 } : { kind: "denied", status: 404 });
    assert.equal(fixture.calls.claim.length, 1);

    const proxyToken = Buffer.alloc(32, 0x26).toString("base64url");
    const route = createPublicQuickOrderTokenRoute({
      selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers, {
        CELEBIX_DEPLOYMENT_TIER: "staging",
        CELEBIX_STOREFRONT_PROXY_MODE: "approved_staging",
        CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL: proxyToken,
      }),
      resolveRuntime: async () => runtime,
      now: () => now,
      randomBytes: () => newCredentialBytes,
      randomUUID: () => "00000000-0000-4000-8000-000000000002",
    });
    const response = await route(new Request(`http://storefront.internal:3450/odeme/hizli/${token}`, { headers: {
      "x-celebix-storefront-proxy": `p1.${proxyToken}`,
      "x-forwarded-host": "shop.example.test",
      "x-forwarded-proto": "https",
    } }), { params: Promise.resolve({ token }) });
    assert.equal(response.status, expectedStatus);
    assert.equal(response.headers.get("location"), null);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(fixture.calls.claim.length, 2);
  }
});

test("the real repository maps a missing token to a generic 404 without cookie redirect or retry", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const releases: Array<boolean | Error | undefined> = [];
  const client = {
    async query(text: string, values: unknown[] = []) {
      calls.push({ text, values });
      const rows = text.includes("saas.quick_links_claim_redemption")
        ? [{ outcome: "not_found", result_payload: null }]
        : [];
      return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
    },
    release(destroy?: boolean | Error) { releases.push(destroy); },
  };
  let connects = 0;
  const quickOrderRepository = new PostgresPublicQuickOrderRepository({
    pool: { async connect() { connects += 1; return client; } },
    role: "celebix_saas_workflow",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    audit: () => undefined,
  } as never);
  const fixture = repositories();
  const runtime = createCheckoutRuntime({ storefrontRepository: fixture.runtime.storefrontRepository, quickOrderRepository });
  const direct = await claimPublicQuickOrder(
    { trustedHostname: "shop.example.test", token, now },
    { runtime, randomBytes: () => newCredentialBytes, randomUUID: () => "00000000-0000-4000-8000-000000000002" },
  );
  assert.deepEqual(direct, { kind: "denied", status: 404 });
  assert.equal(calls.filter(({ text }) => text.includes("saas.quick_links_claim_redemption")).length, 1);
  assert.equal(calls.at(-1)?.text, "ROLLBACK");
  assert.deepEqual(releases, [undefined]);

  const proxyToken = Buffer.alloc(32, 0x27).toString("base64url");
  const route = createPublicQuickOrderTokenRoute({
    selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers, {
      CELEBIX_DEPLOYMENT_TIER: "staging",
      CELEBIX_STOREFRONT_PROXY_MODE: "approved_staging",
      CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL: proxyToken,
    }),
    resolveRuntime: async () => runtime,
    now: () => now,
    randomBytes: () => newCredentialBytes,
    randomUUID: () => "00000000-0000-4000-8000-000000000002",
  });
  const response = await route(new Request(`http://storefront.internal:3450/odeme/hizli/${token}`, { headers: {
    "x-celebix-storefront-proxy": `p1.${proxyToken}`,
    "x-forwarded-host": "shop.example.test",
    "x-forwarded-proto": "https",
  } }), { params: Promise.resolve({ token }) });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(connects, 2);
  assert.equal(calls.filter(({ text }) => text.includes("saas.quick_links_claim_redemption")).length, 2);
});

test("injectable route adapters invoke real Response behavior and deny before repositories", async () => {
  const proxyToken = Buffer.alloc(32, 0x24).toString("base64url");
  const proxyEnvironment = Object.freeze({
    CELEBIX_DEPLOYMENT_TIER: "staging",
    CELEBIX_STOREFRONT_PROXY_MODE: "approved_staging",
    CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL: proxyToken,
  });
  const signedAuthority = (headers: Headers) => selectTrustedStorefrontHostAuthority(headers, proxyEnvironment);
  const signedRequest = (url: string, hostname = "shop.example.test", authority = `p1.${proxyToken}`) => new Request(url, { headers: {
    "x-celebix-storefront-proxy": authority,
    "x-forwarded-host": hostname,
    "x-forwarded-proto": "https",
  } });
  const canonical = repositories();
  const tokenRoute = createPublicQuickOrderTokenRoute({
    selectAuthority: signedAuthority,
    resolveRuntime: async () => canonical.runtime,
    now: () => now,
    randomBytes: () => newCredentialBytes,
    randomUUID: () => "00000000-0000-4000-8000-000000000002",
  });
  const claimed = await tokenRoute(signedRequest(`http://storefront.internal:3450/odeme/hizli/${token}`), { params: Promise.resolve({ token }) });
  assert.equal(claimed.status, 303);
  assert.equal(claimed.headers.get("location"), "/odeme/hizli");
  assert.match(claimed.headers.get("set-cookie") ?? "", /^__Host-celebix_quick=q1\./);

  const alias = repositories("alias.example.test", "shop.example.test");
  const aliasRoute = createPublicQuickOrderTokenRoute({ selectAuthority: signedAuthority, resolveRuntime: async () => alias.runtime, now: () => now });
  const redirected = await aliasRoute(signedRequest(`https://alias.example.test/odeme/hizli/${token}`, "alias.example.test"), { params: Promise.resolve({ token }) });
  assert.equal(redirected.status, 308);
  assert.equal(redirected.headers.get("location"), `https://shop.example.test/odeme/hizli/${token}`);
  assert.equal(redirected.headers.get("set-cookie"), null);
  assert.equal(alias.calls.claim.length, 0);

  const deniedCases = [
    [tokenRoute, signedRequest(`https://shop.example.test/odeme/hizli/${token}`, "shop.example.test", `p1.${Buffer.alloc(32, 0x25).toString("base64url")}`)],
    [createPublicQuickOrderTokenRoute({ selectAuthority: signedAuthority, resolveRuntime: async () => null, now: () => now }), signedRequest(`https://shop.example.test/odeme/hizli/${token}`)],
  ] as const;
  for (const [deniedRoute, deniedRequest] of deniedCases) {
    const denied = await deniedRoute(deniedRequest, { params: Promise.resolve({ token: `${token}x` }) });
    assert.ok([404, 503].includes(denied.status));
    assert.equal(denied.headers.get("location"), null);
    assert.equal(denied.headers.get("set-cookie"), null);
  }
  const claimsBeforeMismatch = canonical.calls.claim.length;
  const mismatched = await tokenRoute(signedRequest(`https://shop.example.test/odeme/hizli/${token}`), { params: Promise.resolve({ token: `${token}x` }) });
  assert.equal(mismatched.status, 404);
  assert.equal(mismatched.headers.get("location"), null);
  assert.equal(mismatched.headers.get("set-cookie"), null);
  assert.equal(canonical.calls.claim.length, claimsBeforeMismatch);

  const statusRoute = createPublicQuickOrderStatusRoute({ selectAuthority: signedAuthority, resolveRuntime: async () => canonical.runtime, now: () => now });
  const statusRequest = signedRequest("http://storefront.internal:3450/api/quick-order/status");
  statusRequest.headers.set("cookie", `__Host-celebix_quick=${oldCredential}`);
  const status = await statusRoute(statusRequest);
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { kind: "ready", quote });
  const deniedStatus = await statusRoute(new Request("https://shop.example.test/api/quick-order/status?evil=1"));
  assert.equal(deniedStatus.status, 404);
  assert.equal(deniedStatus.headers.get("location"), null);
  assert.equal(deniedStatus.headers.get("set-cookie"), null);
  assert.equal(canonical.calls.status.length, 1);
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
