import assert from "node:assert/strict";
import test from "node:test";

import { createPanelReturningLoginHandler } from "./handler.ts";

const PANEL = "https://panel.saas-staging.celebix.site";
const PROVIDER = "https://identity.example.test/oidc/auth?client_id=panel&state=login_state_1234567890123456&nonce=nonce&code_challenge=challenge&code_challenge_method=S256&redirect_uri=https%3A%2F%2Fpanel.saas-staging.celebix.site%2Fauth%2Fcallback&response_type=code&response_mode=query";
const PB1 = `pb1.${Buffer.alloc(32, 7).toString("base64url")}`;
const DESTINATION = "guzide-kuyumcu-4.admin.saas-staging.celebix.site";

function handler(result: unknown = Object.freeze({
  kind: "panel_login_ready" as const,
  providerAuthorizationUrl: PROVIDER,
  browserBindingExpiresAt: "2026-07-30T12:10:00.000Z",
})) {
  let calls = 0;
  const value = createPanelReturningLoginHandler({
    publicLoginAuthority: `${PANEL}/auth/login`,
    credentialGenerator: Object.freeze({ generate: () => PB1 }),
    transport: Object.freeze({ async start(input: { browserBindingCredential: string; destinationHostname: string }) {
      calls += 1;
      assert.deepEqual(input, { browserBindingCredential: PB1, destinationHostname: DESTINATION });
      return result as never;
    } }),
    clock: () => new Date("2026-07-30T12:00:00.000Z"),
  });
  return { value, calls: () => calls };
}

test("approved staging login creates a first-party browser binding and redirects only to the verified provider URL", async () => {
  const fixture = handler();
  const response = await fixture.value(new Request(`${PANEL}/auth/login?destination=${DESTINATION}`));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), PROVIDER);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.deepEqual(response.headers.getSetCookie(), [
    `__Host-celebix_panel_pre_auth=${PB1}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
  ]);
  assert.equal(fixture.calls(), 1);
});

test("proxy-safe login accepts only GET and the exact public path without trusting forwarded headers", async () => {
  for (const url of [
    `http://customer-panel:3400/auth/login?destination=${DESTINATION}`,
    `https://customer-panel.internal/auth/login?destination=${DESTINATION}`,
  ]) {
    const fixture = handler();
    const response = await fixture.value(new Request(url, {
      headers: { host: "attacker.example", forwarded: "host=attacker.example", "x-forwarded-host": "attacker.example" },
    }));
    assert.equal(response.status, 303);
    assert.equal(fixture.calls(), 1);
  }

  for (const request of [
    new Request("http://customer-panel:3400/auth/login/child"),
    new Request("http://customer-panel:3400/auth/login?next=evil"),
    new Request("http://customer-panel:3400/auth/login#fragment"),
    new Request("http://customer-panel:3400/auth/login", { method: "POST" }),
  ]) {
    const fixture = handler();
    const response = await fixture.value(request);
    assert.equal(response.status, request.method === "POST" ? 405 : 400);
    assert.equal(response.headers.has("location"), false);
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(fixture.calls(), 0);
  }
});

test("login start failure is fail-closed and never emits a cookie or redirect", async () => {
  const fixture = handler(Object.freeze({ kind: "panel_login_unavailable", retryable: false }));
  const response = await fixture.value(new Request(`${PANEL}/auth/login?destination=${DESTINATION}`));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "panel_login_unavailable", retryable: false });
  assert.equal(response.headers.has("location"), false);
  assert.equal(response.headers.has("set-cookie"), false);
});
