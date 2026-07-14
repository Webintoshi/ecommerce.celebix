import assert from "node:assert/strict";
import test from "node:test";

import {
  CallbackRequestValidationError,
  validateCustomerPanelCallbackRequest,
  validateCustomerPanelCallbackUrl,
} from "./callback-request.ts";

const CALLBACK = "https://panel.celebix.site/auth/callback";
const STATE = "state_0123456789abcdefghijklmnop";

test("classifies exact success and provider-error callbacks into frozen authority-free projections", () => {
  const successUrl = `${CALLBACK}?state=${STATE}&code=provider-code`;
  const success = validateCustomerPanelCallbackRequest(new Request(successUrl), CALLBACK, 2_048);
  assert.deepEqual(success, { kind: "success", callbackUrl: successUrl, state: STATE, code: "provider-code" });
  assert.equal(Object.isFrozen(success), true);

  const errorUrl = `${CALLBACK}?state=${STATE}&error=access_denied&error_description=private&error_uri=https%3A%2F%2Fidentity.example.test%2Ferror`;
  const providerError = validateCustomerPanelCallbackUrl(errorUrl, CALLBACK, 2_048);
  assert.deepEqual(providerError, { kind: "provider_error", callbackUrl: errorUrl, state: STATE, error: "access_denied" });
  assert.equal(Object.isFrozen(providerError), true);
  assert.deepEqual(Object.keys(providerError), ["kind", "callbackUrl", "state", "error"]);
});

test("rejects method, authority, delivery, syntax, duplicates, conflicts, unknown fields, and private headers", () => {
  const cases: Array<{ request: Request; status?: number }> = [
    { request: new Request(`${CALLBACK}?state=${STATE}&code=code`, { method: "POST", body: "secret" }), status: 405 },
    { request: new Request(`https://attacker.example/auth/callback?state=${STATE}&code=code`) },
    { request: new Request(`https://panel.celebix.site:444/auth/callback?state=${STATE}&code=code`) },
    { request: new Request(`https://panel.celebix.site/auth/callback/extra?state=${STATE}&code=code`) },
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
