import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

import { createCustomerPanelCallbackEdgeApproval } from "../self-serve-callback-edge/edge.ts";
import {
  canonicalInternalCallbackEnvelope,
  createAuthenticatedOwnerCallbackTransport,
  internalCallbackSignaturePreimage,
  sha256Hex,
} from "./transport.ts";

const CALLBACK = "https://panel.celebix.site/auth/callback?state=state_0123456789abcdefghijklmnop&code=code";
const OWNER_ORIGIN = "https://owner-internal.example.test";
const ENDPOINT = `${OWNER_ORIGIN}/api/internal/self-serve/oidc-callback`;
const NOW = new Date("2026-07-13T12:00:00.000Z");
const SECRET = new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 1));

function withUrl(response: Response, url = ENDPOINT) {
  Object.defineProperty(response, "url", { configurable: true, value: url });
  return response;
}

function safeResponse() {
  return withUrl(Response.json({
    state: "tenant_created_session_pending",
    storeSlug: "ornek-magaza",
    storefrontUrl: "https://ornek-magaza.celebix.site",
    panelUrl: "https://panel.celebix.site/stores/ornek-magaza",
    provisioningStatus: "ready",
    session: "pending",
  }, { headers: { "set-cookie": "secret", location: "/private" } }));
}

test("canonical envelope, raw hash, signature preimage, and base64url signature are exact", async () => {
  const body = canonicalInternalCallbackEnvelope(CALLBACK);
  assert.equal(body, `{"schemaVersion":1,"callbackUrl":"${CALLBACK}"}`);
  const bytes = new TextEncoder().encode(body);
  const digest = await sha256Hex(bytes);
  assert.equal(digest, createHash("sha256").update(bytes).digest("hex"));
  const timestamp = String(NOW.getTime());
  const preimage = internalCallbackSignaturePreimage(timestamp, digest);
  assert.equal(preimage, `celebix-callback-v1\n${timestamp}\n${digest}`);

  const captured: { request: Request | null } = { request: null };
  const transport = createAuthenticatedOwnerCallbackTransport({
    activationApproval: createCustomerPanelCallbackEdgeApproval("disposable_test"),
    ownerInternalOrigin: OWNER_ORIGIN,
    activeKeyId: "key.rotation-1",
    activeSecret: SECRET,
    fetch: async (request) => { captured.request = request; return safeResponse(); },
    clock: () => new Date(NOW),
    deadlineMs: 500,
    maximumResponseBytes: 4_096,
    audit: () => undefined,
  });
  await transport.forward(CALLBACK);
  assert.ok(captured.request);
  const signature = captured.request.headers.get("x-celebix-callback-signature");
  const expected = createHmac("sha256", SECRET).update(preimage).digest("base64url");
  assert.equal(signature, expected);
  assert.match(String(signature), /^[A-Za-z0-9_-]{43}$/);
});

test("transport copies a 32-64 byte secret and validates key ID and exact Owner origin", async () => {
  const approval = createCustomerPanelCallbackEdgeApproval("disposable_test");
  const base = {
    activationApproval: approval,
    ownerInternalOrigin: OWNER_ORIGIN,
    activeKeyId: "key-1",
    activeSecret: SECRET,
    fetch: async () => safeResponse(),
    clock: () => new Date(NOW),
    deadlineMs: 500,
    maximumResponseBytes: 4_096,
    audit: () => undefined,
  };
  for (const activeSecret of [new Uint8Array(31), new Uint8Array(65)]) {
    assert.throws(() => createAuthenticatedOwnerCallbackTransport({ ...base, activeSecret }), /owner_callback_transport_invalid/);
  }
  for (const activeKeyId of ["", "space key", "x".repeat(65)]) {
    assert.throws(() => createAuthenticatedOwnerCallbackTransport({ ...base, activeKeyId }), /owner_callback_transport_invalid/);
  }
  for (const ownerInternalOrigin of [
    "http://owner-internal.example.test",
    `${OWNER_ORIGIN}/path`,
    `${OWNER_ORIGIN}?query=1`,
    `${OWNER_ORIGIN}#fragment`,
    "https://user:pass@owner-internal.example.test",
    "https://*.example.test",
  ]) {
    assert.throws(() => createAuthenticatedOwnerCallbackTransport({ ...base, ownerInternalOrigin }), /owner_callback_transport_invalid/);
  }

  const mutable = new Uint8Array(SECRET);
  let signature = "";
  const transport = createAuthenticatedOwnerCallbackTransport({
    ...base,
    activeSecret: mutable,
    fetch: async (request) => { signature = request.headers.get("x-celebix-callback-signature") ?? ""; return safeResponse(); },
  });
  mutable.fill(255);
  await transport.forward(CALLBACK);
  const body = canonicalInternalCallbackEnvelope(CALLBACK);
  const digest = createHash("sha256").update(body).digest("hex");
  const expected = createHmac("sha256", SECRET)
    .update(internalCallbackSignaturePreimage(String(NOW.getTime()), digest))
    .digest("base64url");
  assert.equal(signature, expected);
  assert.doesNotMatch(JSON.stringify(transport), /key-1|1,2,3|secret/i);
});

test("transport sends one exact POST with only canonical headers, manual redirect, deadline, and no public authority", async () => {
  let calls = 0;
  const captured: { request: Request | null } = { request: null };
  const transport = createAuthenticatedOwnerCallbackTransport({
    activationApproval: createCustomerPanelCallbackEdgeApproval("disposable_test"),
    ownerInternalOrigin: OWNER_ORIGIN,
    activeKeyId: "active",
    activeSecret: SECRET,
    fetch: async (request) => { calls += 1; captured.request = request; return safeResponse(); },
    clock: () => new Date(NOW),
    deadlineMs: 500,
    maximumResponseBytes: 4_096,
    audit: () => undefined,
  });
  const response = await transport.forward(CALLBACK);
  assert.equal(calls, 1);
  assert.ok(captured.request);
  const sent = captured.request;
  assert.equal(sent.method, "POST");
  assert.equal(sent.url, ENDPOINT);
  assert.equal(sent.redirect, "manual");
  assert.equal(sent.credentials, "omit");
  assert.deepEqual([...sent.headers.keys()].sort(), [
    "content-type",
    "x-celebix-callback-key-id",
    "x-celebix-callback-signature",
    "x-celebix-callback-timestamp",
  ]);
  assert.equal(sent.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(await sent.clone().text(), canonicalInternalCallbackEnvelope(CALLBACK));
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
});

test("timeout, connection failure, redirects, URL mismatch, malformed and oversized responses fail once", async () => {
  const approval = createCustomerPanelCallbackEdgeApproval("disposable_test");
  const cases: Array<() => Promise<Response>> = [
    async () => new Promise<Response>(() => undefined),
    async () => { throw new Error("network endpoint secret"); },
    async () => withUrl(new Response(null, { status: 302, headers: { location: "https://attacker.example" } })),
    async () => withUrl(Response.json({ code: "safe" }), "https://attacker.example/internal"),
    async () => withUrl(new Response("not-json", { status: 200 })),
    async () => withUrl(Response.json({
      code: "self_serve_callback_untrusted",
      state: "rejected",
      retryable: false,
      message: "owner@example.com state=secret authorization_code=secret",
    }, { status: 401, headers: { "set-cookie": "private=session", location: "https://owner-internal.example/private" } })),
    async () => withUrl(new Response("x".repeat(5_000), { status: 503 })),
  ];
  for (const fetch of cases) {
    let calls = 0;
    const transport = createAuthenticatedOwnerCallbackTransport({
      activationApproval: approval,
      ownerInternalOrigin: OWNER_ORIGIN,
      activeKeyId: "active",
      activeSecret: SECRET,
      fetch: async (request) => { calls += 1; return fetch(); },
      clock: () => new Date(NOW),
      deadlineMs: 10,
      maximumResponseBytes: 1_024,
      audit: () => undefined,
    });
    await assert.rejects(() => transport.forward(CALLBACK), /owner_callback_transport_unavailable/);
    assert.equal(calls, 1);
  }
});

test("transport refuses to sign an alternate or malformed public callback URL", async () => {
  let calls = 0;
  const transport = createAuthenticatedOwnerCallbackTransport({
    activationApproval: createCustomerPanelCallbackEdgeApproval("disposable_test"),
    ownerInternalOrigin: OWNER_ORIGIN,
    activeKeyId: "active",
    activeSecret: SECRET,
    fetch: async () => { calls += 1; return safeResponse(); },
    clock: () => new Date(NOW),
    deadlineMs: 500,
    maximumResponseBytes: 4_096,
    audit: () => undefined,
  });
  for (const callbackUrl of [
    "https://attacker.example/auth/callback?state=state_0123456789abcdefghijklmnop&code=code",
    "https://panel.celebix.site/auth/callback/extra?state=state_0123456789abcdefghijklmnop&code=code",
    "https://panel.celebix.site/auth/callback?state=state_0123456789abcdefghijklmnop&code=code&extra=1",
    "https://panel.celebix.site/auth/callback?state=short&code=code",
  ]) {
    await assert.rejects(() => transport.forward(callbackUrl), /owner_callback_transport_invalid/);
  }
  assert.equal(calls, 0);
});
