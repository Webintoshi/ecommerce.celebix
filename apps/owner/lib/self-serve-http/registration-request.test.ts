import assert from "node:assert/strict";
import test from "node:test";

import type {
  OidcAuthorizationRequest,
  OidcAuthorizationTransaction,
} from "../self-serve-oidc.ts";
import {
  createPersistentSelfServeRuntime,
  createSelfServeHttpActivationApproval,
} from "./runtime.ts";
import { processSelfServeRegistrationRequest } from "./registration-request.ts";

const NOW = new Date("2026-07-15T12:00:00.000Z");
const REGISTER_URL = "https://ecommerce.celebix.co/api/self-serve/register";

function fixture() {
  let gateCalls = 0;
  const oidc = new Map<string, OidcAuthorizationTransaction>();
  const runtime = createPersistentSelfServeRuntime({
    activationApproval: createSelfServeHttpActivationApproval("disposable_test"),
    registrationAttemptStore: {
      async save() {},
      async consume(): Promise<never> { throw new Error("unused"); },
    },
    oidcTransactionStore: {
      async save(transaction) { oidc.set(transaction.state, transaction); },
      async consume(): Promise<never> { throw new Error("unused"); },
      async discard(state) { oidc.delete(state); },
    },
    registrationCompletion: {
      async recordVerifiedIdentity() { return { kind: "identity_recorded", status: "identity_verified", version: 2 }; },
      async resumeTenantCreation() { return { kind: "in_progress" }; },
      async reconcileUnknownCommit() { return { kind: "pending" }; },
    },
    consumedCallbackRecovery: {
      async classifyConsumedCallback() { return { kind: "missing" } as const; },
    },
    oidcProvider: {
      buildAuthorizationUrl(input: OidcAuthorizationRequest) {
        const url = new URL("https://identity.example.test/authorize");
        url.searchParams.set("response_type", "code");
        url.searchParams.set("response_mode", "query");
        url.searchParams.set("state", input.state);
        url.searchParams.set("nonce", input.nonce);
        url.searchParams.set("code_challenge", input.codeChallenge);
        url.searchParams.set("code_challenge_method", input.codeChallengeMethod);
        url.searchParams.set("redirect_uri", input.redirectUri);
        return url;
      },
      async verifyCallback(): Promise<never> { throw new Error("unused"); },
    },
    requestGate: {
      async verify({ request }) {
        gateCalls += 1;
        assert.equal(request.bodyUsed, false);
        return "allowed";
      },
    },
    clock: () => new Date(NOW),
    audit: () => undefined,
    bodyPolicy: { maximumBytes: 4_096, maximumCallbackQueryBytes: 2_048 },
    registrationOrigin: "https://ecommerce.celebix.co",
    callbackAuthority: "https://panel.celebix.site/auth/callback",
    panelOrigin: "https://panel.celebix.site",
    platformDomainSuffix: "celebix.site",
    providerAuthority: {
      issuer: "https://identity.example.test/oidc",
      audience: "customer-panel",
      authorizationOrigin: "https://identity.example.test",
    },
  });
  return { runtime, gateCalls: () => gateCalls };
}

function request(body: string, contentType = "application/json") {
  return new Request(REGISTER_URL, {
    method: "POST",
    headers: {
      origin: "https://ecommerce.celebix.co",
      "content-type": contentType,
    },
    body,
  });
}

test("shared processor consumes one exact JSON request after one request-gate decision", async () => {
  const { runtime, gateCalls } = fixture();
  const browserRequest = request(JSON.stringify({
    storeName: "  Çiçek   Pazarı ",
    storeSlug: "cicek-pazari",
    marketingConsent: false,
    privacyConsent: true,
  }));

  const result = await processSelfServeRegistrationRequest(runtime, browserRequest);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.registration, {
    storeName: "Çiçek Pazarı",
    storeSlug: "cicek-pazari",
    marketingConsent: false,
    privacyConsent: true,
  });
  assert.equal(result.runtime, runtime);
  assert.equal(gateCalls(), 1);
  assert.equal(browserRequest.bodyUsed, true);
});

test("shared processor accepts the exact legacy form without a parser fork", async () => {
  const { runtime, gateCalls } = fixture();
  const browserRequest = request(
    "storeName=%C3%87i%C3%A7ek+Pazar%C4%B1&storeSlug=cicek-pazari&marketingConsent=false&privacyConsent=true",
    "application/x-www-form-urlencoded",
  );
  const result = await processSelfServeRegistrationRequest(runtime, browserRequest);
  assert.equal(result.ok, true);
  assert.equal(gateCalls(), 1);
  assert.equal(browserRequest.bodyUsed, true);
});

test("shared processor retains controlled duplicate, unknown, origin, and privacy failures", async () => {
  const cases = [
    request('{"storeName":"One","storeName":"Two","storeSlug":"valid-slug","privacyConsent":true}'),
    request('{"storeName":"One","storeSlug":"valid-slug","privacyConsent":true,"password":"secret"}'),
    request('{"storeName":"One","storeSlug":"valid-slug","privacyConsent":false}'),
    new Request(REGISTER_URL, {
      method: "POST",
      headers: { origin: "https://attacker.example", "content-type": "application/json" },
      body: '{}',
    }),
  ];
  const expected = [
    "self_serve_registration_duplicate_field",
    "self_serve_registration_unknown_field",
    "self_serve_registration_rejected",
    "self_serve_origin_required",
  ];
  for (const [index, browserRequest] of cases.entries()) {
    const { runtime } = fixture();
    const result = await processSelfServeRegistrationRequest(runtime, browserRequest);
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.equal((await result.response.clone().json() as { code: string }).code, expected[index]);
  }
});
