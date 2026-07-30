import assert from "node:assert/strict";
import test from "node:test";

import { createCrossHostHandoffHttpHandler } from "./cross-host-handoff-http.ts";

const NOW = new Date("2026-07-30T10:00:00.000Z");
const HOSTNAME = "guzide-kuyumcu-4.admin.saas-staging.celebix.site";
const ORIGIN = `https://${HOSTNAME}`;
const CENTRAL = "https://panel.saas-staging.celebix.site";
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

function fixture(options: { redemption?: object; recovery?: object; brandKind?: string } = {}) {
  let redeemCalls = 0;
  let recoveryCalls = 0;
  const handler = createCrossHostHandoffHttpHandler({
    async resolveRuntime() {
      return {
        access: { panelOrigin: CENTRAL },
        adminDomains: {
          async resolvePublicBrand() {
            return options.brandKind
              ? { kind: options.brandKind }
              : { kind: "resolved", brand: {
                  storeSlug: "guzide-kuyumcu-4",
                  displayName: "Güzide Kuyumcu",
                  logoUrl: null,
                  accentColor: "#ff6500",
                  canonicalAdminOrigin: ORIGIN,
                } };
          },
        },
        handoffs: {
          async redeemHandoff() {
            redeemCalls += 1;
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
  return { handler, get redeemCalls() { return redeemCalls; }, get recoveryCalls() { return recoveryCalls; } };
}

function request(overrides: { url?: string; origin?: string; body?: string; contentType?: string; method?: string } = {}) {
  const body = overrides.body ?? new URLSearchParams({ handoff: HANDOFF }).toString();
  return new Request(overrides.url ?? `${ORIGIN}/auth/handoff`, {
    method: overrides.method ?? "POST",
    headers: {
      origin: overrides.origin ?? CENTRAL,
      "content-type": overrides.contentType ?? "application/x-www-form-urlencoded",
    },
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

test("accepts reverse-proxy HTTP transport while pinning the browser redirect to the canonical HTTPS admin origin", async () => {
  const current = fixture();
  const response = await current.handler(request({ url: `http://${HOSTNAME}/auth/handoff` }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${ORIGIN}/`);
  assert.equal(current.redeemCalls, 1);
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
    request({ url: "https://evil.example/auth/handoff" }),
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
