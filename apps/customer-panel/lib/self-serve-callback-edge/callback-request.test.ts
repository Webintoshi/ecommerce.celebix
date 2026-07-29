import assert from "node:assert/strict";
import test from "node:test";

import {
  CallbackRequestValidationError,
  validateBrowserBoundPanelCompletionRequest,
  validateCustomerPanelCallbackRequest,
  validateCustomerPanelCallbackUrl,
} from "./callback-request.ts";

const CALLBACK = "https://panel.celebix.site/auth/callback";
const STATE = "state_0123456789abcdefghijklmnop";
const ISSUER = "https://identity.example.test/oidc";
const BINDING = `pb1.${Buffer.alloc(32, 0x22).toString("base64url")}`;

test("classifies exact success and provider-error callbacks into frozen authority-free projections", () => {
  const successUrl = `${CALLBACK}?state=${STATE}&code=provider-code&iss=${encodeURIComponent(ISSUER)}`;
  const success = validateCustomerPanelCallbackRequest(new Request(successUrl), CALLBACK, 2_048);
  assert.deepEqual(success, {
    kind: "success",
    callbackUrl: successUrl,
    state: STATE,
    code: "provider-code",
    responseIssuer: ISSUER,
  });
  assert.equal(Object.isFrozen(success), true);

  const errorUrl = `${CALLBACK}?state=${STATE}&error=access_denied&error_description=private&error_uri=https%3A%2F%2Fidentity.example.test%2Ferror&iss=${encodeURIComponent(ISSUER)}`;
  const providerError = validateCustomerPanelCallbackUrl(errorUrl, CALLBACK, 2_048);
  assert.deepEqual(providerError, {
    kind: "provider_error",
    callbackUrl: errorUrl,
    state: STATE,
    error: "access_denied",
    responseIssuer: ISSUER,
  });
  assert.equal(Object.isFrozen(providerError), true);
  assert.deepEqual(Object.keys(providerError), ["kind", "callbackUrl", "state", "error", "responseIssuer"]);

  const compatibleUrl = `${CALLBACK}?state=${STATE}&code=provider-code`;
  assert.deepEqual(validateCustomerPanelCallbackUrl(compatibleUrl, CALLBACK, 2_048), {
    kind: "success",
    callbackUrl: compatibleUrl,
    state: STATE,
    code: "provider-code",
  });
});

test("reconstructs proxy callback requests with the exact public authority and raw query", () => {
  const rawQuery = `code=provider%2Dcode&state=${STATE}&iss=https%3A%2F%2Fidentity.example.test%2Foidc`;
  const internalUrl = `http://customer-panel:3400/auth/callback?${rawQuery}`;
  const request = new Request(internalUrl, {
    headers: {
      forwarded: "host=attacker.example;proto=https",
      host: "attacker.example",
      origin: "https://attacker.example",
      referer: "https://attacker.example/private",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "https",
    },
  });

  const result = validateCustomerPanelCallbackRequest(request, CALLBACK, 2_048);

  assert.deepEqual(result, {
    kind: "success",
    callbackUrl: `${CALLBACK}?${rawQuery}`,
    state: STATE,
    code: "provider-code",
    responseIssuer: ISSUER,
  });
  assert.equal(result.callbackUrl.slice(result.callbackUrl.indexOf("?") + 1), rawQuery);
  assert.doesNotMatch(result.callbackUrl, /customer-panel|3400|attacker/);
});

test("uses the same proxy-safe reconstruction for browser-bound completion", () => {
  const rawQuery = `state=${STATE}&code=provider%2Bcode&iss=${encodeURIComponent(ISSUER)}`;
  const internalUrl = `https://customer-panel.internal:3400/auth/callback?${rawQuery}`;
  const result = validateBrowserBoundPanelCompletionRequest(new Request(internalUrl, {
    headers: {
      cookie: `__Host-celebix_panel_pre_auth=${BINDING}`,
      host: "attacker.example",
      "x-forwarded-host": "attacker.example",
    },
  }), CALLBACK, 2_048);

  assert.equal(result.callbackUrl, `${CALLBACK}?${rawQuery}`);
  assert.equal(result.kind, "success");
  if (result.kind !== "success") assert.fail("expected success callback projection");
  assert.equal(result.code, "provider+code");
  assert.equal(result.browserBindingCredential, BINDING);
});

test("keeps callback URL string validation strict while accepting public request URLs", () => {
  const callbackUrl = `${CALLBACK}?state=${STATE}&code=provider-code`;
  assert.equal(
    validateCustomerPanelCallbackRequest(new Request(callbackUrl), CALLBACK, 2_048).callbackUrl,
    callbackUrl,
  );
  assert.throws(
    () => validateCustomerPanelCallbackUrl(
      `http://customer-panel:3400/auth/callback?state=${STATE}&code=provider-code`,
      CALLBACK,
      2_048,
    ),
    CallbackRequestValidationError,
  );
});

test("rejects duplicate, empty, malformed, non-HTTPS, non-canonical, and expanded response issuers", () => {
  for (const query of [
    `state=${STATE}&code=code&iss=`,
    `state=${STATE}&code=code&iss=${encodeURIComponent(ISSUER)}&iss=${encodeURIComponent(ISSUER)}`,
    `state=${STATE}&code=code&iss=${encodeURIComponent("http://identity.example.test/oidc")}`,
    `state=${STATE}&code=code&iss=${encodeURIComponent("https://user:pass@identity.example.test/oidc")}`,
    `state=${STATE}&code=code&iss=${encodeURIComponent("https://identity.example.test/oidc?private=1")}`,
    `state=${STATE}&code=code&iss=${encodeURIComponent("https://identity.example.test/oidc#private")}`,
    `state=${STATE}&code=code&iss=${encodeURIComponent(` ${ISSUER}`)}`,
    `state=${STATE}&code=code&iss=${encodeURIComponent("HTTPS://identity.example.test/oidc")}`,
    `state=${STATE}&error=access_denied&iss=${encodeURIComponent("javascript:alert(1)")}`,
  ]) {
    assert.throws(
      () => validateCustomerPanelCallbackUrl(`${CALLBACK}?${query}`, CALLBACK, 2_048),
      CallbackRequestValidationError,
      query,
    );
  }
});

test("rejects method, authority, delivery, syntax, duplicates, conflicts, unknown fields, and private headers", () => {
  const cases: Array<{ request: Request; status?: number }> = [
    { request: new Request(`${CALLBACK}?state=${STATE}&code=code`, { method: "POST", body: "secret" }), status: 405 },
    { request: new Request(`https://panel.celebix.site/auth/callback/extra?state=${STATE}&code=code`) },
    { request: new Request(`https://panel.celebix.site/auth/callback/child?state=${STATE}&code=code`) },
    { request: new Request(`https://panel.celebix.site/auth/callback`) },
    { request: { method: "GET", url: `https://user:pass@panel.celebix.site/auth/callback?state=${STATE}&code=code`, headers: new Headers(), body: null } as Request },
    { request: new Request(`${CALLBACK}?state=${STATE}&code=code#fragment`) },
    { request: new Request(`${CALLBACK}?state=${STATE}&state=other&code=code`) },
    { request: new Request(`${CALLBACK}?state=${STATE}&code=code&code=other`) },
    { request: new Request(`${CALLBACK}?state=${STATE}&code=code&error=access_denied`) },
    { request: new Request(`${CALLBACK}?state=${STATE}&code=code&returnTo=%2Fstores`) },
    { request: new Request(`${CALLBACK}?state=${STATE}&code=%`) },
    { request: new Request(`${CALLBACK}?state=${STATE}&code=%C3%28`) },
    { request: new Request(`${CALLBACK}?state=${STATE}&code=%00`) },
    { request: new Request(`${CALLBACK}?state=${STATE}&code=code`, { headers: { "x-celebix-callback-signature": "browser" } }) },
    { request: new Request(`${CALLBACK}?state=${STATE}&code=code`, { headers: { "x-celebix-session-response-signature": "browser" } }) },
    { request: new Request(`${CALLBACK}?state=${STATE}&code=code`, { headers: { "x-celebix-internal-token": "browser" } }) },
    { request: new Request(`${CALLBACK}?state=${STATE}&code=code`, { headers: { authorization: "browser" } }) },
    { request: { method: "GET", url: `${CALLBACK}?state=${STATE}&code=code`, headers: new Headers(), body: {} } as Request },
  ];
  for (const { request, status = 400 } of cases) {
    assert.throws(
      () => validateCustomerPanelCallbackRequest(request, CALLBACK, 2_048),
      (error: unknown) => error instanceof CallbackRequestValidationError && error.status === status,
      request.url,
    );
  }
});

test("enforces raw query bounds without reading a browser body", () => {
  let bodyReads = 0;
  const request = {
    method: "GET",
    url: `${CALLBACK}?state=${STATE}&code=${"x".repeat(200)}`,
    headers: new Headers(),
    body: null,
    text: async () => { bodyReads += 1; return "secret"; },
  } as Request;
  assert.throws(
    () => validateCustomerPanelCallbackRequest(request, CALLBACK, 64),
    (error: unknown) => error instanceof CallbackRequestValidationError && error.status === 413,
  );
  assert.equal(bodyReads, 0);
});

test("browser-bound completion accepts exactly one canonical pre-auth cookie and preserves response issuer", () => {
  const callbackUrl = `${CALLBACK}?state=${STATE}&code=provider-code&iss=${encodeURIComponent(ISSUER)}`;
  const result = validateBrowserBoundPanelCompletionRequest(new Request(callbackUrl, {
    headers: { cookie: `__Host-celebix_panel_pre_auth=${BINDING}` },
  }), CALLBACK, 2_048);
  assert.deepEqual(result, {
    kind: "success",
    callbackUrl,
    state: STATE,
    code: "provider-code",
    responseIssuer: ISSUER,
    browserBindingCredential: BINDING,
  });
  assert.equal(Object.isFrozen(result), true);
});

test("browser-bound completion rejects missing, duplicate, additional, persistent, and malformed cookies", () => {
  const callbackUrl = `${CALLBACK}?state=${STATE}&code=provider-code`;
  for (const cookie of [
    undefined,
    "",
    `__Host-celebix_panel_pre_auth=${BINDING}; other=1`,
    `__Host-celebix_panel=${BINDING}`,
    `__Host-celebix_panel_pre_auth=${BINDING}; __Host-celebix_panel_pre_auth=${BINDING}`,
    `__Host-celebix_panel_pre_auth=${BINDING}%3D`,
  ]) {
    const headers = cookie === undefined ? undefined : { cookie };
    assert.throws(
      () => validateBrowserBoundPanelCompletionRequest(new Request(callbackUrl, { headers }), CALLBACK, 2_048),
      CallbackRequestValidationError,
    );
  }
  assert.throws(
    () => validateCustomerPanelCallbackRequest(new Request(callbackUrl, {
      headers: { cookie: `__Host-celebix_panel_pre_auth=${BINDING}` },
    }), CALLBACK, 2_048),
    CallbackRequestValidationError,
  );
});
