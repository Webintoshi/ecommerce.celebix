import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

import {
  PANEL_BROWSER_BINDING_INTERNAL_PATH,
  PANEL_BROWSER_BOOTSTRAP_RESPONSE_SIGNATURE_DOMAIN,
} from "../../../../packages/platform-config/src/saas.ts";
import { createPanelBrowserBindingBootstrapApproval } from "./activation.ts";
import { createAuthenticatedPanelBrowserBindingTransport } from "./transport.ts";

const NOW = new Date("2026-07-14T12:00:00.000Z");
const ORIGIN = "https://owner-internal.example.test";
const ENDPOINT = `${ORIGIN}${PANEL_BROWSER_BINDING_INTERNAL_PATH}`;
const SECRET = Buffer.alloc(32, 0x44);
const BS = `bs1.bootstrap.${Buffer.alloc(32, 0x11).toString("base64url")}`;
const PB = `pb1.${Buffer.alloc(32, 0x22).toString("base64url")}`;
const PROVIDER = "https://identity.example.test/authorize?state=state_0123456789abcdefghijklmnop&redirect_uri=https%3A%2F%2Fpanel.celebix.site%2Fauth%2Fcallback&response_type=code&response_mode=query";
const EXPIRES = new Date(NOW.getTime() + 600_000).toISOString();
const DESTINATION = "guzide-kuyumcu-4.admin.saas-staging.celebix.site";

function withUrl(response: Response, url = ENDPOINT, redirected = false) {
  Object.defineProperty(response, "url", { configurable: true, value: url });
  Object.defineProperty(response, "redirected", { configurable: true, value: redirected });
  return response;
}

async function signedResponse(request: Request, options: {
  body?: string; signedBody?: string; status?: number; signedStatus?: number;
  signature?: string | null; url?: string; redirected?: boolean; extraHeaders?: Record<string, string>;
} = {}) {
  const body = options.body ?? JSON.stringify({
    schemaVersion: 1, kind: "browser_binding_ready",
    providerAuthorizationUrl: PROVIDER, browserBindingExpiresAt: EXPIRES,
  });
  const signedBody = options.signedBody ?? body;
  const status = options.status ?? 200;
  const requestBody = await request.clone().arrayBuffer();
  const requestDigest = createHash("sha256").update(new Uint8Array(requestBody)).digest("hex");
  const responseDigest = createHash("sha256").update(signedBody).digest("hex");
  const timestamp = request.headers.get("x-celebix-browser-bootstrap-timestamp") ?? "";
  const preimage = [
    PANEL_BROWSER_BOOTSTRAP_RESPONSE_SIGNATURE_DOMAIN, timestamp, requestDigest,
    String(options.signedStatus ?? status), responseDigest,
  ].join("\n");
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "x-celebix-browser-bootstrap-response-key-id": "active",
    "x-celebix-browser-bootstrap-response-timestamp": timestamp,
    ...options.extraHeaders,
  });
  if (options.signature !== null) headers.set(
    "x-celebix-browser-bootstrap-response-signature",
    options.signature ?? createHmac("sha256", SECRET).update(preimage).digest("base64url"),
  );
  return withUrl(new Response(body, { status, headers }), options.url, options.redirected);
}

function transport(fetch: (request: Request) => Promise<Response>) {
  return createAuthenticatedPanelBrowserBindingTransport({
    activationApproval: createPanelBrowserBindingBootstrapApproval("disposable_test"),
    ownerInternalOrigin: ORIGIN,
    activeKeyId: "active",
    activeSecret: SECRET,
    fetch,
    clock: () => new Date(NOW),
    deadlineMs: 500,
    maximumResponseBytes: 4_096,
    audit() {},
  });
}

test("sends one exact canonical authenticated binding request and verifies success before parsing", async () => {
  let calls = 0;
  let captured: Request | undefined;
  const result = await transport(async (request) => {
    calls += 1; captured = request; return signedResponse(request);
  }).bind({ bootstrapCredential: BS, providerAuthorizationUrl: PROVIDER, browserBindingCredential: PB });
  assert.deepEqual(result, {
    schemaVersion: 1, kind: "browser_binding_ready",
    providerAuthorizationUrl: PROVIDER, browserBindingExpiresAt: EXPIRES,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(calls, 1);
  assert.ok(captured);
  assert.equal(captured.url, ENDPOINT);
  assert.equal(await captured.clone().text(), JSON.stringify({
    schemaVersion: 1, bootstrapCredential: BS,
    providerAuthorizationUrl: PROVIDER, browserBindingCredential: PB,
  }));
});

test("wrong signature, body/status binding, URL, redirect, cookie, Location, and noncanonical JSON fail once", async () => {
  const cases = [
    (request: Request) => signedResponse(request, { signature: "A".repeat(43) }),
    (request: Request) => signedResponse(request, { body: JSON.stringify({ schemaVersion: 1, kind: "browser_binding_ready", providerAuthorizationUrl: `${PROVIDER}&tampered=1`, browserBindingExpiresAt: EXPIRES }) }),
    (request: Request) => signedResponse(request, { status: 409, signedStatus: 200 }),
    (request: Request) => signedResponse(request, { url: "https://attacker.example/internal" }),
    (request: Request) => signedResponse(request, { redirected: true }),
    (request: Request) => signedResponse(request, { extraHeaders: { "set-cookie": "private=1" } }),
    (request: Request) => signedResponse(request, { extraHeaders: { location: "https://attacker.example" } }),
    (request: Request) => signedResponse(request, { body: ` ${JSON.stringify({ schemaVersion: 1, kind: "browser_binding_ready", providerAuthorizationUrl: PROVIDER, browserBindingExpiresAt: EXPIRES })}` }),
  ];
  for (const fetch of cases) {
    let calls = 0;
    await assert.rejects(
      () => transport(async (request) => { calls += 1; return fetch(request); }).bind({
        bootstrapCredential: BS, providerAuthorizationUrl: PROVIDER, browserBindingCredential: PB,
      }),
      /panel_browser_binding_transport_unavailable/,
    );
    assert.equal(calls, 1);
  }
});

test("accepts only the signed fixed rejection matrix without retry", async () => {
  for (const [code, status] of [
    ["browser_binding_request_invalid", 400], ["browser_binding_unauthenticated", 401],
    ["browser_binding_expired", 409], ["browser_binding_conflict", 409],
    ["browser_binding_authority_invalid", 409], ["browser_binding_unavailable", 503],
  ] as const) {
    const body = JSON.stringify({ schemaVersion: 1, kind: "browser_binding_rejected", code, retryable: false });
    assert.deepEqual(await transport((request) => signedResponse(request, { body, status })).bind({
      bootstrapCredential: BS, providerAuthorizationUrl: PROVIDER, browserBindingCredential: PB,
    }), { schemaVersion: 1, kind: "browser_binding_rejected", code, retryable: false });
  }
});

test("starts returning login with a destination-bound schema v3 request and authenticates the exact provider projection", async () => {
  let captured: Request | undefined;
  const result = await transport(async (request) => {
    captured = request;
    return signedResponse(request, {
      body: JSON.stringify({
        schemaVersion: 2,
        kind: "panel_login_ready",
        providerAuthorizationUrl: PROVIDER,
        browserBindingExpiresAt: EXPIRES,
      }),
    });
  }).start({ browserBindingCredential: PB, destinationHostname: DESTINATION });
  assert.deepEqual(result, {
    kind: "panel_login_ready",
    providerAuthorizationUrl: PROVIDER,
    browserBindingExpiresAt: EXPIRES,
  });
  assert.ok(captured);
  assert.equal(await captured.clone().text(), JSON.stringify({
    schemaVersion: 3,
    browserBindingCredential: PB,
    destinationHostname: DESTINATION,
  }));
});
