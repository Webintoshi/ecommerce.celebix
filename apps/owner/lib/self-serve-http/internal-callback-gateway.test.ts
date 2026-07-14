import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

import {
  copyAuthenticatedOwnerInternalCallbackRawBody,
  createOwnerInternalCallbackRawRequestAuthenticator,
  createOwnerInternalCallbackRequestAuthenticator,
  createOwnerInternalCallbackGatewayApproval,
  createOwnerInternalSelfServeCallbackGateway,
  signWithAuthenticatedInternalCallbackRequest,
} from "./internal-callback-gateway.ts";
import { createVerifiedEdgeTrustBoundary } from "./verified-edge-trust.ts";

const ORIGIN = "https://owner-internal.example.test";
const ENDPOINT = `${ORIGIN}/api/internal/self-serve/oidc-callback`;
const CALLBACK = "https://panel.celebix.site/auth/callback?state=state_0123456789abcdefghijklmnop&code=code";
const NOW = new Date("2026-07-13T12:00:00.000Z");
const SECRET = new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 1));

function canonical(callbackUrl = CALLBACK) {
  return JSON.stringify({ schemaVersion: 1, callbackUrl });
}

function signature(body: Uint8Array, timestamp = String(NOW.getTime()), secret = SECRET) {
  const digest = createHash("sha256").update(body).digest("hex");
  return createHmac("sha256", secret).update(`celebix-callback-v1\n${timestamp}\n${digest}`).digest("base64url");
}

function request(options: {
  body?: string | Uint8Array;
  timestamp?: string | null;
  keyId?: string | null;
  signature?: string | null;
  url?: string;
  method?: string;
  contentType?: string | null;
  contentLength?: string;
} = {}) {
  const body = typeof options.body === "string"
    ? new TextEncoder().encode(options.body)
    : options.body ?? new TextEncoder().encode(canonical());
  const timestamp = options.timestamp ?? String(NOW.getTime());
  const headers = new Headers();
  if (options.contentType !== null) headers.set("content-type", options.contentType ?? "application/json; charset=utf-8");
  if (options.keyId !== null) headers.set("x-celebix-callback-key-id", options.keyId ?? "active");
  if (options.timestamp !== null) headers.set("x-celebix-callback-timestamp", timestamp);
  if (options.signature !== null) headers.set("x-celebix-callback-signature", options.signature ?? signature(body, timestamp));
  if (options.contentLength !== undefined) headers.set("content-length", options.contentLength);
  return new Request(options.url ?? ENDPOINT, {
    method: options.method ?? "POST",
    headers,
    body: options.method === "GET" ? undefined : Uint8Array.from(body).buffer,
  });
}

function safeSuccess() {
  return Response.json({
    state: "tenant_created_session_pending",
    storeSlug: "ornek-magaza",
    storefrontUrl: "https://ornek-magaza.celebix.site",
    panelUrl: "https://panel.celebix.site",
    provisioningStatus: "ready",
    session: "pending",
  }, { status: 200, headers: { "set-cookie": "secret", location: "/private" } });
}

function fixture(options: { handler?: (request: Request, context: unknown) => Promise<Response>; audit?: (event: unknown) => void | Promise<void> } = {}) {
  const calls: Array<{ request: Request; context: unknown }> = [];
  const boundary = createVerifiedEdgeTrustBoundary();
  const handler = options.handler ?? (async (callbackRequest, context) => {
    calls.push({ request: callbackRequest, context });
    assert.equal(await boundary.requestGate.verify({ kind: "callback_completion", request: callbackRequest, edgeTrustContext: context }), "allowed");
    return safeSuccess();
  });
  const gateway = createOwnerInternalSelfServeCallbackGateway({
    activationApproval: createOwnerInternalCallbackGatewayApproval("disposable_test"),
    ownerInternalOrigin: ORIGIN,
    keys: new Map([["active", SECRET]]),
    clock: () => new Date(NOW),
    maximumBodyBytes: 8_192,
    maximumResponseBytes: 4_096,
    edgeTrustBoundary: boundary,
    callbackHandler: handler,
    audit: options.audit ?? (() => undefined),
  });
  return { gateway, calls, boundary };
}

test("shared authenticator returns one sealed request authority and signs only through its authenticated key", async () => {
  const authenticator = createOwnerInternalCallbackRequestAuthenticator({
    ownerInternalOrigin: ORIGIN,
    keys: new Map([["active", SECRET]]),
    clock: () => new Date(NOW),
    maximumBodyBytes: 8_192,
  });
  const authenticated = await authenticator.authenticate(request());
  const body = new TextEncoder().encode(canonical());
  assert.deepEqual(
    {
      callbackUrl: authenticated.callbackUrl,
      keyId: authenticated.keyId,
      timestamp: authenticated.timestamp,
      requestBodyDigest: authenticated.requestBodyDigest,
    },
    {
      callbackUrl: CALLBACK,
      keyId: "active",
      timestamp: String(NOW.getTime()),
      requestBodyDigest: createHash("sha256").update(body).digest("hex"),
    },
  );
  assert.equal(Object.isFrozen(authenticated), true);
  assert.equal(Object.isSealed(authenticated), true);
  const preimage = "celebix-session-handoff-response-v1\nprivate-domain-separated-fields";
  assert.equal(
    signWithAuthenticatedInternalCallbackRequest(authenticated, preimage),
    createHmac("sha256", SECRET).update(preimage).digest("base64url"),
  );
  for (const fake of [{ ...authenticated }, JSON.parse(JSON.stringify(authenticated)), {}]) {
    assert.throws(
      () => signWithAuthenticatedInternalCallbackRequest(fake as never, preimage),
      /owner_internal_callback_authenticated_request_invalid/,
    );
  }
});

test("raw authenticator verifies exact HMAC bytes before schema parsing while legacy schema-v1 remains strict", async () => {
  const rawAuthenticator = createOwnerInternalCallbackRawRequestAuthenticator({
    ownerInternalOrigin: ORIGIN,
    keys: new Map([["active", SECRET]]),
    clock: () => new Date(NOW),
    maximumBodyBytes: 8_192,
  });
  const schema2 = JSON.stringify({
    schemaVersion: 2,
    callbackUrl: CALLBACK,
    browserBindingCredential: `pb1.${Buffer.alloc(32, 0x22).toString("base64url")}`,
  });
  const authenticated = await rawAuthenticator.authenticate(request({ body: schema2 }));
  assert.equal(new TextDecoder().decode(copyAuthenticatedOwnerInternalCallbackRawBody(authenticated)), schema2);
  const copied = copyAuthenticatedOwnerInternalCallbackRawBody(authenticated);
  copied.fill(0);
  assert.equal(new TextDecoder().decode(copyAuthenticatedOwnerInternalCallbackRawBody(authenticated)), schema2);
  const legacy = createOwnerInternalCallbackRequestAuthenticator({
    ownerInternalOrigin: ORIGIN,
    keys: new Map([["active", SECRET]]),
    clock: () => new Date(NOW),
    maximumBodyBytes: 8_192,
  });
  await assert.rejects(
    () => legacy.authenticate(request({ body: schema2 })),
    (error: unknown) => error instanceof Error && "stage" in error && error.stage === "envelope_validation",
  );
});

test("sealed Owner approval accepts disposable or staging only and loses authority when copied", () => {
  const approval = createOwnerInternalCallbackGatewayApproval("disposable_test");
  assert.equal(Object.isFrozen(approval), true);
  assert.equal(Object.isSealed(approval), true);
  const base = {
    ownerInternalOrigin: ORIGIN,
    keys: new Map([["active", SECRET]]),
    clock: () => new Date(NOW),
    maximumBodyBytes: 8_192,
    maximumResponseBytes: 4_096,
    edgeTrustBoundary: createVerifiedEdgeTrustBoundary(),
    callbackHandler: async () => safeSuccess(),
    audit: () => undefined,
  };
  for (const activationApproval of [JSON.parse(JSON.stringify(approval)), { ...approval }, {
    purpose: "phase2b1b2b_owner_internal_callback_gateway",
    environment: "disposable_test",
    publicActivation: "disabled_default_route",
    transport: "authenticated_injected_only",
    sessions: "forbidden",
    providerNetworking: "forbidden",
  }]) {
    assert.throws(() => createOwnerInternalSelfServeCallbackGateway({ ...base, activationApproval } as never), /owner_internal_callback_gateway_invalid/);
  }
  assert.throws(() => createOwnerInternalCallbackGatewayApproval("production" as never), /owner_internal_callback_gateway_invalid/);
});

test("gateway validates immutable key material, exact origin, and limits at composition", async () => {
  const approval = createOwnerInternalCallbackGatewayApproval("disposable_test");
  const base = {
    activationApproval: approval,
    ownerInternalOrigin: ORIGIN,
    keys: new Map<string, Uint8Array>([["active", SECRET]]),
    clock: () => new Date(NOW),
    maximumBodyBytes: 8_192,
    maximumResponseBytes: 4_096,
    edgeTrustBoundary: createVerifiedEdgeTrustBoundary(),
    callbackHandler: async () => safeSuccess(),
    audit: () => undefined,
  };
  for (const ownerInternalOrigin of ["http://owner-internal.example.test", `${ORIGIN}/path`, `${ORIGIN}?x=1`, `${ORIGIN}#x`, "https://user:pass@owner-internal.example.test", "https://*.example.test"]) {
    assert.throws(() => createOwnerInternalSelfServeCallbackGateway({ ...base, ownerInternalOrigin }), /owner_internal_callback_gateway_invalid/);
  }
  for (const [key, secret] of [["", SECRET], ["space key", SECRET], ["x".repeat(65), SECRET], ["active", new Uint8Array(31)], ["active", new Uint8Array(65)]] as const) {
    assert.throws(() => createOwnerInternalSelfServeCallbackGateway({ ...base, keys: new Map([[key, secret]]) }), /owner_internal_callback_gateway_invalid/);
  }
  const mutable = new Uint8Array(SECRET);
  const copied = createOwnerInternalSelfServeCallbackGateway({ ...base, keys: new Map([["active", mutable]]) });
  mutable.fill(255);
  assert.equal((await copied(request())).status, 200);
});

test("valid HMAC creates private context, reconstructs one exact headerless GET, and safely projects response", async () => {
  const value = fixture();
  const response = await value.gateway(request());
  assert.equal(response.status, 200);
  assert.equal(value.calls.length, 1);
  assert.equal(value.calls[0].request.method, "GET");
  assert.equal(value.calls[0].request.url, CALLBACK);
  assert.deepEqual([...value.calls[0].request.headers], []);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
  assert.equal(await value.boundary.requestGate.verify({ kind: "callback_completion", request: value.calls[0].request, edgeTrustContext: value.calls[0].context }), "unauthorized");
});

test("method, exact authority, content type, headers, timestamp, and declared bounds fail before body or business", async () => {
  const cases = [
    request({ method: "GET" }),
    request({ url: "https://attacker.example.test/api/internal/self-serve/oidc-callback" }),
    request({ url: `${ORIGIN}/api/internal/self-serve/oidc-callback/extra` }),
    request({ url: "https://owner-internal.example.test:444/api/internal/self-serve/oidc-callback" }),
    request({ contentType: "application/json" }),
    request({ keyId: null }),
    request({ keyId: "space key" }),
    request({ timestamp: null }),
    request({ timestamp: "123.4" }),
    request({ timestamp: String(NOW.getTime() - 60_001) }),
    request({ timestamp: String(NOW.getTime() + 5_001) }),
    request({ signature: null }),
    request({ signature: "not-base64url" }),
    request({ contentLength: "99999" }),
  ];
  for (const input of cases) {
    const value = fixture();
    const response = await value.gateway(input);
    assert.ok([400, 401, 405, 413].includes(response.status), `${input.method} ${input.url}`);
    assert.equal(value.calls.length, 0);
  }
});

test("unknown key, wrong signature, tampered body, and oversized raw body execute no callback", async () => {
  const body = canonical();
  const cases = [
    request({ keyId: "unknown" }),
    request({ signature: signature(new TextEncoder().encode(body), undefined, new Uint8Array(SECRET).fill(9)) }),
    request({
      body: body.replace("code=code", "code=tampered"),
      signature: signature(new TextEncoder().encode(body)),
    }),
    request({ body: "x".repeat(9_000) }),
  ];
  for (const input of cases) {
    const value = fixture();
    const response = await value.gateway(input);
    assert.ok([401, 413].includes(response.status));
    assert.equal(value.calls.length, 0);
  }
});

test("authenticated raw bytes must be strict UTF-8 and exact canonical JSON with an exact callback URL", async () => {
  const invalidUtf8 = new Uint8Array([0xff, 0xfe, 0xfd]);
  const invalidBodies: Array<string | Uint8Array> = [
    invalidUtf8,
    "not-json",
    `{"schemaVersion":1,"schemaVersion":1,"callbackUrl":"${CALLBACK}"}`,
    `{"callbackUrl":"${CALLBACK}","schemaVersion":1}`,
    ` {"schemaVersion":1,"callbackUrl":"${CALLBACK}"}`,
    `{"schemaVersion":2,"callbackUrl":"${CALLBACK}"}`,
    `{"schemaVersion":1,"callbackUrl":"${CALLBACK}","extra":true}`,
    `{"schemaVersion":1,"callbackUrl":"https://attacker.example/auth/callback?state=state_0123456789abcdefghijklmnop&code=code"}`,
    `{"schemaVersion":1,"callbackUrl":"https://panel.celebix.site:444/auth/callback?state=state_0123456789abcdefghijklmnop&code=code"}`,
    `{"schemaVersion":1,"callbackUrl":"https://panel.celebix.site/auth/callback/extra?state=state_0123456789abcdefghijklmnop&code=code"}`,
  ];
  for (const body of invalidBodies) {
    const value = fixture();
    const response = await value.gateway(request({ body }));
    assert.equal(response.status, 400);
    assert.equal(value.calls.length, 0);
  }
});

test("malformed, expanded, or oversized callback responses are redacted and audits never block", async () => {
  for (const response of [
    new Response("not-json", { status: 200 }),
    Response.json({ state: "tenant_created_session_pending", storeSlug: "ornek-magaza", storefrontUrl: "https://ornek-magaza.celebix.site", panelUrl: "https://panel.celebix.site", provisioningStatus: "ready", session: "pending", operationId: "secret" }),
    Response.json({
      code: "self_serve_callback_untrusted",
      state: "rejected",
      retryable: false,
      message: "owner@example.com state=secret authorization_code=secret",
    }, { status: 401, headers: { "set-cookie": "private=session", location: "https://owner-internal.example/private" } }),
    new Response("x".repeat(5_000), { status: 503 }),
  ]) {
    const value = fixture({ handler: async () => response });
    const projected = await value.gateway(request());
    assert.equal(projected.status, 503);
    assert.deepEqual(await projected.json(), { code: "self_serve_internal_callback_unavailable" });
  }
  for (const audit of [
    () => { throw new Error("audit state code email secret"); },
    async () => { throw new Error("audit state code email secret"); },
    () => new Promise<never>(() => undefined),
  ]) {
    const value = fixture({ audit });
    assert.equal((await value.gateway(request())).status, 200);
  }
});

test("safe request-gate classifications preserve exact status without forwarding headers", async () => {
  const value = fixture({ handler: async () => Response.json({
    code: "self_serve_callback_rate_limited",
    state: "rejected",
    retryable: true,
    message: "Kimlik doğrulama dönüşü şu anda sınırlandırıldı.",
  }, { status: 429, headers: { "set-cookie": "secret", location: "/private" } }) });
  const response = await value.gateway(request());
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, "self_serve_callback_rate_limited");
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
});
