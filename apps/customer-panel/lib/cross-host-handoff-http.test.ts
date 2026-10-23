import assert from "node:assert/strict";
import test from "node:test";

import { createCrossHostHandoffHttpHandler } from "./cross-host-handoff-http.ts";
import { createMerchantSignupCompletion } from "../../owner/lib/merchant-whatsapp/completion.ts";

const NOW = new Date("2026-07-30T10:00:00.000Z");
const HOSTNAME = "guzide-kuyumcu-4.admin.saas-staging.celebix.site";
const ORIGIN = `https://${HOSTNAME}`;
const CENTRAL = "https://panel.saas-staging.celebix.site";
const OWNER = "https://owner.saas-staging.celebix.site";
const HANDOFF = `v1.cross-host.active.${Buffer.alloc(32, 0x44).toString("base64url")}`;
const SESSION = `v1.panel.active.${Buffer.alloc(32, 0x55).toString("base64url")}`;
const STORE_ID = "40000000-0000-4000-8000-000000000001";

function session() {
  return Object.freeze({
    sessionId: "10000000-0000-4000-8000-000000000001",
    familyId: "10000000-0000-4000-8000-000000000002",
    principalId: "10000000-0000-4000-8000-000000000003",
    activeStoreId: STORE_ID,
    version: 1,
    issuedAt: NOW.toISOString(),
    rotatedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 28_800_000).toISOString(),
  });
}

function fixture(options: { redemption?: object; recovery?: object; brandKind?: string; brandOrigin?: string; panelOrigin?: string; ownerOrigin?: string; omitOwnerOrigin?: boolean } = {}) {
  let redeemCalls = 0;
  let recoveryCalls = 0;
  let redemptionInput: unknown;
  const handler = createCrossHostHandoffHttpHandler({
    async resolveRuntime() {
      return {
        access: { panelOrigin: options.panelOrigin ?? CENTRAL },
        ...(options.omitOwnerOrigin ? {} : { ownerOrigin: options.ownerOrigin ?? OWNER }),
        adminDomains: {
          async resolvePublicBrand() {
            return options.brandKind
              ? { kind: options.brandKind }
              : { kind: "resolved", brand: {
                  storeSlug: "guzide-kuyumcu-4",
                  displayName: "Güzide Kuyumcu",
                  logoUrl: null,
                  accentColor: "#ff6500",
                  canonicalAdminOrigin: options.brandOrigin ?? ORIGIN,
                } };
          },
        },
        handoffs: {
          async redeemHandoff(input: unknown) {
            redeemCalls += 1;
            redemptionInput = input;
            return options.redemption ?? Object.freeze({ kind: "redeemed", sessionCredential: SESSION, session: session() });
          },
          async recoverRedemption() {
            recoveryCalls += 1;
            return options.recovery ?? Object.freeze({ kind: "redeemed", sessionCredential: SESSION, session: session() });
          },
        },
      };
    },
    clock: () => new Date(NOW),
    maximumBodyBytes: 1_024,
  });
  return { handler, get redeemCalls() { return redeemCalls; }, get recoveryCalls() { return recoveryCalls; }, get redemptionInput() { return redemptionInput; } };
}

function request(overrides: { url?: string; host?: string; origin?: string | null; body?: string; contentType?: string; method?: string } = {}) {
  const body = overrides.body ?? new URLSearchParams({ handoff: HANDOFF }).toString();
  const headers = new Headers({
    host: overrides.host ?? HOSTNAME,
    "content-type": overrides.contentType ?? "application/x-www-form-urlencoded",
  });
  if (overrides.origin !== null) headers.set("origin", overrides.origin ?? CENTRAL);
  return new Request(overrides.url ?? `${ORIGIN}/auth/handoff`, {
    method: overrides.method ?? "POST",
    headers,
    body: overrides.method === "GET" ? undefined : body,
  });
}

test("redeems a destination-bound POST and installs only the host session cookie", async () => {
  const current = fixture();
  const response = await current.handler(request());
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${ORIGIN}/`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.deepEqual(response.headers.getSetCookie(), [
    `__Host-celebix_panel=${SESSION}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`,
  ]);
  assert.equal(await response.text(), "");
  assert.equal(current.redeemCalls, 1);
  assert.equal(current.recoveryCalls, 0);
  assert.doesNotMatch(response.headers.get("location") ?? "", /v1\./);
});

test("redeems signup handoffs posted by the exact configured owner on NET and SITE", async () => {
  for (const suffix of ["site", "net"]) {
    const hostname = `new-store.admin.saas-staging.celebix.${suffix}`;
    const origin = `https://${hostname}`;
    const ownerOrigin = `https://owner.saas-staging.celebix.${suffix}`;
    const current = fixture({
      panelOrigin: `https://panel.saas-staging.celebix.${suffix}`,
      ownerOrigin,
      brandOrigin: origin,
    });
    const response = await current.handler(request({ host: hostname, url: `${origin}/auth/handoff`, origin: ownerOrigin }));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), `${origin}/`);
    assert.equal(response.headers.getSetCookie().length, 1);
    assert.equal(current.redeemCalls, 1);
  }
});

test("an owner-looking or cross-environment source cannot redeem a signup handoff", async () => {
  for (const origin of [
    "https://owner.saas-staging.celebix.net",
    "https://owner.saas-staging.celebix.site.evil.example",
    "https://evil-owner.saas-staging.celebix.site",
    "http://owner.saas-staging.celebix.site",
    `${OWNER}/`,
    `${OWNER}:8443`,
  ]) {
    const current = fixture();
    const response = await current.handler(request({ origin }));
    assert.equal(response.status, 503);
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(current.redeemCalls, 0);
  }
});

test("a runtime without a configured owner cannot infer signup authority from the request Origin", async () => {
  const current = fixture({ omitOwnerOrigin: true });
  const response = await current.handler(request({ origin: OWNER }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(current.redeemCalls, 0);
});

test("the actual owner signup completion HTML redeems with its source Origin and preserves the original session expiry", async () => {
  const issuedAt = new Date(NOW.getTime() - 3_600_000).toISOString();
  const expiresAt = new Date(NOW.getTime() + 25_200_000).toISOString();
  const originalSession = Object.freeze({ ...session(), issuedAt, rotatedAt: issuedAt, expiresAt });
  let issuedCredential: string | undefined;
  const signup = createMerchantSignupCompletion({
    secret: new Uint8Array(32).fill(0x66),
    handoffKeyId: "signup.handoff",
    clock: () => new Date(NOW),
    randomBytes: size => new Uint8Array(size).fill(0x77),
    repository: {
      async recoverIssuedHandoff() { return { kind: "unauthenticated" }; },
      async issuePreparedHandoff(input) {
        assert.equal(input.currentCredential, SESSION);
        assert.equal(input.destinationHostname, HOSTNAME);
        issuedCredential = input.candidateCredential;
        return Object.freeze({ kind: "handoff_issued", credential: issuedCredential, destinationOrigin: ORIGIN,
          expiresAt: new Date(NOW.getTime() + 120_000).toISOString() });
      },
    },
  });
  const response = await signup({
    request: new Request(`${OWNER}/api/self-serve/register`),
    operationId: "20000000-0000-4000-8000-000000000001",
    completion: { purpose: "signup", sessionId: originalSession.sessionId, sessionCredential: SESSION,
      sessionIssuedAt: issuedAt, sessionExpiresAt: expiresAt, destinationStoreId: STORE_ID, destinationOrigin: ORIGIN },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const html = await response.text();
  const action = /<form[^>]+action="([^"]+)"/u.exec(html)?.[1];
  const handoff = /name="handoff" value="([^"]+)"/u.exec(html)?.[1];
  assert.equal(action, `${ORIGIN}/auth/handoff`);
  assert.equal(handoff, issuedCredential);
  assert.ok(action && handoff);
  const current = fixture({ redemption: Object.freeze({ kind: "redeemed", sessionCredential: SESSION, session: originalSession }) });
  const completed = await current.handler(request({ url: action, origin: OWNER, body: new URLSearchParams({ handoff }).toString() }));
  assert.equal(completed.status, 303);
  assert.equal(completed.headers.get("location"), `${ORIGIN}/`);
  assert.deepEqual(current.redemptionInput, { credential: issuedCredential, destinationHostname: HOSTNAME, now: NOW });
  assert.deepEqual(completed.headers.getSetCookie(), [
    `__Host-celebix_panel=${SESSION}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=25200`,
  ]);
});

test("accepts reverse-proxy internal transport while pinning the validated Host authority to the canonical HTTPS admin origin", async () => {
  const current = fixture();
  const response = await current.handler(request({ url: "http://customer-panel:3400/auth/handoff" }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${ORIGIN}/`);
  assert.equal(current.redeemCalls, 1);
});

test("redeems the same destination-bound handoff on an active custom admin hostname", async () => {
  const hostname = "admin.guzidekuyumcu.com.tr";
  const origin = `https://${hostname}`;
  const current = fixture({ brandOrigin: origin });
  const response = await current.handler(request({ host: hostname, url: `${origin}/auth/handoff` }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${origin}/`);
  assert.equal(current.redeemCalls, 1);
});

test("accepts a privacy client that omits Origin while retaining destination-bound handoff authority", async () => {
  const current = fixture();
  const response = await current.handler(request({ origin: null }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${ORIGIN}/`);
  assert.equal(current.redeemCalls, 1);
});

test("accepts an opaque privacy client Origin while retaining destination-bound handoff authority", async () => {
  const current = fixture();
  const response = await current.handler(request({ origin: "null" }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${ORIGIN}/`);
  assert.equal(current.redeemCalls, 1);
});

test("staging handoff refuses a production canonical admin host", async () => {
  const productionHostname = "guzide-kuyumcu-4.admin.celebix.site";
  const productionOrigin = `https://${productionHostname}`;
  const current = fixture({ brandOrigin: productionOrigin });
  const response = await current.handler(request({
    host: productionHostname,
    url: `${productionOrigin}/auth/handoff`,
  }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(current.redeemCalls, 0);
});

test("recovers an unknown redemption commit with the retained session authority", async () => {
  const recovery = Object.freeze({
    operationId: "20000000-0000-4000-8000-000000000001",
    sessionId: "20000000-0000-4000-8000-000000000002",
    familyId: "20000000-0000-4000-8000-000000000003",
    issuedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 28_800_000).toISOString(),
  });
  const current = fixture({
    redemption: Object.freeze({ kind: "commit_unknown", sessionCredential: SESSION, recovery }),
  });
  assert.equal((await current.handler(request())).status, 303);
  assert.equal(current.redeemCalls, 1);
  assert.equal(current.recoveryCalls, 1);
});

test("fails closed before redemption for foreign origins, hosts, queries, methods, media types, and bodies", async () => {
  const cases = [
    request({ origin: "https://evil.example" }),
    request({ host: "evil.example" }),
    request({ url: `${ORIGIN}/auth/handoff?handoff=${encodeURIComponent(HANDOFF)}` }),
    request({ method: "GET" }),
    request({ contentType: "application/json" }),
    request({ body: `handoff=${encodeURIComponent(HANDOFF)}&extra=1` }),
    request({ body: "handoff=v1.bad" }),
  ];
  for (const candidate of cases) {
    const current = fixture();
    const response = await current.handler(candidate);
    assert.notEqual(response.status, 303);
    assert.equal(response.headers.has("location"), false);
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(current.redeemCalls, 0);
  }
});

test("unknown brands and denied handoffs never install a cookie", async () => {
  for (const current of [
    fixture({ brandKind: "admin_host_unknown" }),
    fixture({ redemption: Object.freeze({ kind: "expired" }) }),
  ]) {
    const response = await current.handler(request());
    assert.notEqual(response.status, 303);
    assert.equal(response.headers.has("set-cookie"), false);
  }
});
