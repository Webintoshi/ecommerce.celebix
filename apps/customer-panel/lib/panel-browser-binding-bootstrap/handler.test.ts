import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SAAS_AUTH_AUTHORITY_PROFILE,
  PANEL_BROWSER_BOOTSTRAP_URL,
} from "../../../../packages/platform-config/src/saas.ts";
import { createPanelBootstrapRequestAuthorityValidator } from "../panel-auth-authority/bootstrap-request-authority.ts";
import { createPanelBrowserBindingCredentialGenerator } from "../panel-browser-binding/credential-codec.ts";
import { createPanelBrowserBindingBootstrapApproval } from "./activation.ts";
import { createPanelBrowserBindingBootstrapHandler } from "./handler.ts";
import type { PanelBrowserBindingInternalResult } from "./transport.ts";

const NOW = new Date("2026-07-14T12:00:00.000Z");
const BS = `bs1.bootstrap.${Buffer.alloc(32, 0x11).toString("base64url")}`;
const PB = `pb1.${Buffer.alloc(32, 0x22).toString("base64url")}`;
const PROVIDER = "https://identity.example.test/authorize?state=state_0123456789abcdefghijklmnop&redirect_uri=https%3A%2F%2Fpanel.celebix.site%2Fauth%2Fcallback&response_type=code&response_mode=query";
const EXPIRES = new Date(NOW.getTime() + 600_000).toISOString();
const OWNER = DEFAULT_SAAS_AUTH_AUTHORITY_PROFILE.ownerOrigin;

function request(
  body = new URLSearchParams({ bootstrapCredential: BS, providerAuthorizationUrl: PROVIDER }).toString(),
  headers: Record<string, string> = {},
  url = PANEL_BROWSER_BOOTSTRAP_URL,
  origin: string | null = OWNER,
) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(origin === null ? {} : { origin }),
      ...headers,
    },
    body,
  });
}

function fixture(
  result: PanelBrowserBindingInternalResult | Error = {
    schemaVersion: 1, kind: "browser_binding_ready",
    providerAuthorizationUrl: PROVIDER, browserBindingExpiresAt: EXPIRES,
  },
  authority = { sourceOrigin: OWNER, publicBootstrapAuthority: PANEL_BROWSER_BOOTSTRAP_URL },
) {
  const calls: unknown[] = [];
  const handler = createPanelBrowserBindingBootstrapHandler({
    activationApproval: createPanelBrowserBindingBootstrapApproval("disposable_test"),
    sourceOrigin: authority.sourceOrigin,
    publicBootstrapAuthority: authority.publicBootstrapAuthority,
    maximumBodyBytes: 16_384,
    credentialGenerator: createPanelBrowserBindingCredentialGenerator(() => Buffer.alloc(32, 0x22)),
    transport: { async bind(input) { calls.push(structuredClone(input)); if (result instanceof Error) throw result; return result; } },
    clock: () => new Date(NOW),
    audit() {},
  });
  return { handler, calls };
}

test("bootstrap request authority is immutable and rejects non-canonical configured authorities", () => {
  const validator = createPanelBootstrapRequestAuthorityValidator({
    sourceOrigin: OWNER,
    publicBootstrapUrl: PANEL_BROWSER_BOOTSTRAP_URL,
  });
  assert.equal(Object.isFrozen(validator), true);
  assert.equal(Object.isSealed(validator), true);
  for (const sourceOrigin of [
    "http://ecommerce.celebix.co",
    "https://user@ecommerce.celebix.co",
    `${OWNER}/`,
    `${OWNER}?query=1`,
    `${OWNER}#fragment`,
    `${OWNER}:444`,
  ]) {
    assert.throws(
      () => createPanelBootstrapRequestAuthorityValidator({
        sourceOrigin,
        publicBootstrapUrl: PANEL_BROWSER_BOOTSTRAP_URL,
      }),
      /panel_bootstrap_request_authority_invalid/,
    );
  }
});

test("accepts the public URL and proxied HTTPS or HTTP URLs only with the exact Owner Origin", async () => {
  for (const url of [
    PANEL_BROWSER_BOOTSTRAP_URL,
    "https://customer-panel.internal:3400/auth/bootstrap",
    "http://127.0.0.1:3400/auth/bootstrap",
  ]) {
    const current = fixture();
    const response = await current.handler(request(undefined, {}, url));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), PROVIDER);
    assert.equal(current.calls.length, 1);
  }
});

test("denies missing, panel, malformed, whitespace-modified, comma-separated, and wrong-port Origins", async () => {
  for (const origin of [
    null,
    "null",
    new URL(PANEL_BROWSER_BOOTSTRAP_URL).origin,
    `${OWNER}, https://attacker.example`,
    "https:// ecommerce.celebix.co",
    `${OWNER}:444`,
    "not-an-origin",
  ]) {
    const current = fixture();
    const response = await current.handler(request(undefined, {}, PANEL_BROWSER_BOOTSTRAP_URL, origin));
    assert.equal(response.status, 400);
    assert.equal(current.calls.length, 0);
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(response.headers.has("location"), false);
  }
});

test("denies wrong protocol, path, query, and fragment without trusting forwarded authority headers", async () => {
  const forwarded = {
    host: new URL(PANEL_BROWSER_BOOTSTRAP_URL).host,
    forwarded: `host=${new URL(PANEL_BROWSER_BOOTSTRAP_URL).host};proto=https`,
    "x-forwarded-host": new URL(PANEL_BROWSER_BOOTSTRAP_URL).host,
    "x-forwarded-proto": "https",
  };
  for (const input of [
    request(undefined, forwarded, "ftp://customer-panel.internal/auth/bootstrap"),
    request(undefined, forwarded, "http://customer-panel.internal/auth/bootstrap/"),
    request(undefined, forwarded, "http://customer-panel.internal/auth/callback"),
    request(undefined, forwarded, "http://customer-panel.internal/auth/bootstrap?next=1"),
    request(undefined, forwarded, "http://customer-panel.internal/auth/bootstrap#fragment"),
    request(undefined, forwarded, "http://customer-panel.internal/auth/bootstrap", null),
    request(undefined, forwarded, "http://customer-panel.internal/auth/bootstrap", "https://attacker.example"),
  ]) {
    const current = fixture();
    const response = await current.handler(input);
    assert.equal(response.status, 400);
    assert.equal(current.calls.length, 0);
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(response.headers.has("location"), false);
  }
});

test("keeps production and staging bootstrap authority profiles isolated", async () => {
  const staging = {
    sourceOrigin: "https://owner-auth.staging.example.test",
    publicBootstrapAuthority: "https://panel-auth.staging.example.test/auth/bootstrap",
  };
  const production = fixture();
  const productionResponse = await production.handler(request());
  assert.equal(productionResponse.status, 303);

  const stagingCurrent = fixture(undefined, staging);
  const stagingResponse = await stagingCurrent.handler(request(
    undefined,
    {},
    staging.publicBootstrapAuthority,
    staging.sourceOrigin,
  ));
  assert.equal(stagingResponse.status, 303);

  const stagingWithProductionOrigin = fixture(undefined, staging);
  assert.equal((await stagingWithProductionOrigin.handler(request(
    undefined,
    {},
    staging.publicBootstrapAuthority,
    OWNER,
  ))).status, 400);

  const productionWithStagingOrigin = fixture();
  assert.equal((await productionWithStagingOrigin.handler(request(
    undefined,
    {},
    PANEL_BROWSER_BOOTSTRAP_URL,
    staging.sourceOrigin,
  ))).status, 400);
});

test("success sets only the pre-auth cookie and redirects 303 to the exact Owner-verified provider URL", async () => {
  const current = fixture();
  const response = await current.handler(request());
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), PROVIDER);
  assert.equal(response.headers.get("set-cookie"), `__Host-celebix_panel_pre_auth=${PB}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(await response.text(), "");
  assert.deepEqual(current.calls, [{ bootstrapCredential: BS, providerAuthorizationUrl: PROVIDER, browserBindingCredential: PB }]);
  assert.equal(response.headers.get("location")?.includes(PB), false);
});

test("method, fields, duplicates, size, encoding, cookies, and private headers fail before transport", async () => {
  const cases = [
    new Request(PANEL_BROWSER_BOOTSTRAP_URL),
    request(`bootstrapCredential=${encodeURIComponent(BS)}`),
    request(`bootstrapCredential=${encodeURIComponent(BS)}&bootstrapCredential=${encodeURIComponent(BS)}&providerAuthorizationUrl=${encodeURIComponent(PROVIDER)}`),
    request(`${new URLSearchParams({ bootstrapCredential: BS, providerAuthorizationUrl: PROVIDER })}&extra=1`),
    request(`bootstrapCredential=%&providerAuthorizationUrl=${encodeURIComponent(PROVIDER)}`),
    request("x".repeat(16_385)),
    request(undefined, { cookie: "other=1" }),
    request(undefined, { authorization: "private" }),
    request(undefined, { "x-celebix-callback-signature": "private" }),
  ];
  for (const input of cases) {
    const current = fixture();
    const response = await current.handler(input);
    assert.ok([400, 405, 413, 415].includes(response.status));
    assert.equal(current.calls.length, 0);
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(response.headers.has("location"), false);
  }
});

test("signature failure, provider URL mismatch, and write uncertainty emit controlled JSON without cookie or redirect", async () => {
  for (const result of [
    { schemaVersion: 1, kind: "browser_binding_ready", providerAuthorizationUrl: `${PROVIDER}&changed=1`, browserBindingExpiresAt: EXPIRES },
    { schemaVersion: 1, kind: "browser_binding_rejected", code: "browser_binding_unavailable", retryable: false },
    new Error("signature"),
  ] satisfies Array<PanelBrowserBindingInternalResult | Error>) {
    const current = fixture(result);
    const response = await current.handler(request());
    assert.ok([409, 503].includes(response.status));
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(response.headers.has("location"), false);
    assert.doesNotMatch(await response.text(), /pb1|bs1|identity\.example/);
  }
});
