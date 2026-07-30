import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

import { createPanelSessionCompletionApproval } from "./activation.ts";
import {
  createAuthenticatedPanelSessionCompletionTransport,
  panelSessionHandoffResponseSignaturePreimage,
} from "./transport.ts";

const OWNER_ORIGIN = "https://owner-internal.example.test";
const ENDPOINT = `${OWNER_ORIGIN}/api/internal/self-serve/oidc-callback`;
const CALLBACK = "https://panel.celebix.site/auth/callback?state=state_0123456789abcdefghijklmnop&code=code";
const BINDING = `pb1.${Buffer.alloc(32, 0x22).toString("base64url")}`;
const NOW = new Date("2026-07-14T12:00:00.000Z");
const SECRET = new Uint8Array(32).fill(0x35);
const HANDOFF = `h1.handoff.active.${Buffer.alloc(32, 0x44).toString("base64url")}`;
const EXPIRES = new Date(NOW.getTime() + 600_000).toISOString();
const DESTINATION_STORE_ID = "40000000-0000-4000-8000-000000000001";
const DESTINATION_ORIGIN = "https://store-slug.admin.celebix.site";
const SUCCESS = `{"schemaVersion":1,"kind":"session_handoff_ready","handoffCredential":"${HANDOFF}","handoffExpiresAt":"${EXPIRES}","destinationStoreId":"${DESTINATION_STORE_ID}","destinationOrigin":"${DESTINATION_ORIGIN}","redirectPath":"/"}`;
const SESSION = `v1.panel.active.${Buffer.alloc(32, 0x55).toString("base64url")}`;
const SESSION_EXPIRES = new Date(NOW.getTime() + 28_800_000).toISOString();
const SESSION_READY = `{"schemaVersion":1,"kind":"session_ready","sessionCredential":"${SESSION}","sessionIssuedAt":"${NOW.toISOString()}","sessionExpiresAt":"${SESSION_EXPIRES}","destinationStoreId":"${DESTINATION_STORE_ID}","destinationOrigin":"${DESTINATION_ORIGIN}","redirectPath":"/"}`;

function withUrl(response: Response, url = ENDPOINT, redirected = false) {
  Object.defineProperty(response, "url", { configurable: true, value: url });
  Object.defineProperty(response, "redirected", { configurable: true, value: redirected });
  return response;
}

async function signedResponse(request: Request, options: {
  body?: string | Uint8Array;
  status?: number;
  signedBody?: string | Uint8Array;
  signedStatus?: number;
  keyId?: string;
  timestamp?: string;
  signature?: string | null;
  url?: string;
  redirected?: boolean;
  extraHeaders?: Record<string, string>;
} = {}) {
  const body = options.body ?? SUCCESS;
  const signedBody = options.signedBody ?? body;
  const status = options.status ?? 200;
  const signedStatus = options.signedStatus ?? status;
  const requestBody = await request.clone().arrayBuffer();
  const requestDigest = createHash("sha256").update(new Uint8Array(requestBody)).digest("hex");
  const responseDigest = createHash("sha256").update(signedBody).digest("hex");
  const requestTimestamp = request.headers.get("x-celebix-callback-timestamp") ?? "";
  const timestamp = options.timestamp ?? requestTimestamp;
  const preimage = panelSessionHandoffResponseSignaturePreimage({
    requestTimestamp,
    requestBodyDigest: requestDigest,
    status: signedStatus,
    responseBodyDigest: responseDigest,
  });
  const signature = options.signature === null
    ? null
    : options.signature ?? createHmac("sha256", SECRET).update(preimage).digest("base64url");
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-celebix-session-response-key-id": options.keyId ?? "active",
    "x-celebix-session-response-timestamp": timestamp,
    ...options.extraHeaders,
  });
  if (signature !== null) headers.set("x-celebix-session-response-signature", signature);
  const responseBody = body instanceof Uint8Array ? Uint8Array.from(body).buffer : body;
  return withUrl(new Response(responseBody, { status, headers }), options.url, options.redirected);
}

function fixture(fetch: (request: Request) => Promise<Response>, options: { deadlineMs?: number; maximumResponseBytes?: number; audit?: (event: unknown) => void | Promise<void> } = {}) {
  return createAuthenticatedPanelSessionCompletionTransport({
    activationApproval: createPanelSessionCompletionApproval("disposable_test"),
    ownerInternalOrigin: OWNER_ORIGIN,
    activeKeyId: "active",
    activeSecret: SECRET,
    fetch,
    clock: () => new Date(NOW),
    deadlineMs: options.deadlineMs ?? 500,
    maximumResponseBytes: options.maximumResponseBytes ?? 4_096,
    audit: options.audit ?? (() => undefined),
  });
}

test("verifies the exact signed success before returning one frozen internal projection", async () => {
  let calls = 0;
  let captured: Request | undefined;
  const transport = fixture(async (request) => { calls += 1; captured = request; return signedResponse(request); });
  const result = await transport.complete(CALLBACK, BINDING);
  assert.deepEqual(result, {
    schemaVersion: 1,
    kind: "session_handoff_ready",
    handoffCredential: HANDOFF,
    handoffExpiresAt: EXPIRES,
    destinationStoreId: DESTINATION_STORE_ID,
    destinationOrigin: DESTINATION_ORIGIN,
    redirectPath: "/",
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(calls, 1);
  assert.ok(captured);
  assert.equal(captured.method, "POST");
  assert.equal(captured.url, ENDPOINT);
  assert.equal(captured.redirect, "manual");
  assert.equal(captured.credentials, "omit");
  assert.deepEqual([...captured.headers.keys()].sort(), [
    "content-type", "x-celebix-callback-key-id", "x-celebix-callback-signature", "x-celebix-callback-timestamp",
  ]);
  assert.equal(await captured.clone().text(), JSON.stringify({
    schemaVersion: 2,
    callbackUrl: CALLBACK,
    browserBindingCredential: BINDING,
  }));
});

test("accepts the exact signed returning-login session projection", async () => {
  const result = await fixture((request) => signedResponse(request, { body: SESSION_READY })).complete(CALLBACK, BINDING);
  assert.deepEqual(result, {
    schemaVersion: 1,
    kind: "session_ready",
    sessionCredential: SESSION,
    sessionIssuedAt: NOW.toISOString(),
    sessionExpiresAt: SESSION_EXPIRES,
    destinationStoreId: DESTINATION_STORE_ID,
    destinationOrigin: DESTINATION_ORIGIN,
    redirectPath: "/",
  });
  assert.equal(Object.isFrozen(result), true);
});

test("accepts only the canonical signed fresh-login result matrix", async () => {
  for (const [code, status] of [
    ["provider_rejected", 400], ["callback_replayed", 409], ["callback_not_granted", 409],
    ["handoff_rejected", 409], ["callback_unavailable", 503], ["handoff_unavailable", 503],
  ] as const) {
    const body = `{"schemaVersion":1,"kind":"fresh_login_required","code":"${code}","retryable":false}`;
    const result = await fixture((request) => signedResponse(request, { body, status })).complete(CALLBACK, BINDING);
    assert.deepEqual(result, { schemaVersion: 1, kind: "fresh_login_required", code, retryable: false });
  }
});

test("signature preimage includes exact status, request timestamp/digest, and response body digest", () => {
  const value = panelSessionHandoffResponseSignaturePreimage({
    requestTimestamp: String(NOW.getTime()),
    requestBodyDigest: "a".repeat(64),
    status: 409,
    responseBodyDigest: "b".repeat(64),
  });
  assert.equal(value, `celebix-session-handoff-response-v1\n${NOW.getTime()}\n${"a".repeat(64)}\n409\n${"b".repeat(64)}`);
});

test("body, status, key, timestamp, request binding, signature, URL, redirect, size, UTF-8, and canonical JSON tampering fail once", async () => {
  const noncanonical = ` {"schemaVersion":1,"kind":"fresh_login_required","code":"callback_replayed","retryable":false}`;
  const expanded = `{"schemaVersion":1,"kind":"fresh_login_required","code":"callback_replayed","retryable":false,"state":"secret"}`;
  const cases: Array<(request: Request) => Promise<Response>> = [
    (request) => signedResponse(request, { body: SUCCESS.replace("handoff.active", "handoff.tampered"), signedBody: SUCCESS }),
    (request) => signedResponse(request, { status: 409, signedStatus: 200 }),
    (request) => signedResponse(request, { keyId: "other" }),
    (request) => signedResponse(request, { timestamp: String(NOW.getTime() + 1) }),
    (request) => signedResponse(request, { signature: createHmac("sha256", new Uint8Array(32).fill(9)).update("wrong").digest("base64url") }),
    (request) => signedResponse(request, { signature: "short" }),
    (request) => signedResponse(request, { signature: `${"a".repeat(43)}=` }),
    (request) => signedResponse(request, { signature: null }),
    (request) => signedResponse(request, { url: "https://attacker.example/internal" }),
    (request) => signedResponse(request, { redirected: true }),
    (request) => signedResponse(request, { body: "x".repeat(5_000), status: 503 }),
    (request) => signedResponse(request, { body: new Uint8Array([0xff, 0xfe]), status: 503 }),
    (request) => signedResponse(request, { body: noncanonical, status: 409 }),
    (request) => signedResponse(request, { body: expanded, status: 409 }),
    (request) => signedResponse(request, { extraHeaders: { "set-cookie": "private=session" } }),
    (request) => signedResponse(request, { extraHeaders: { location: "https://attacker.example" } }),
  ];
  for (const fetch of cases) {
    let calls = 0;
    const transport = fixture(async (request) => { calls += 1; return fetch(request); }, { maximumResponseBytes: 4_096 });
    await assert.rejects(() => transport.complete(CALLBACK, BINDING), /^Error: panel_session_completion_transport_unavailable$/);
    assert.equal(calls, 1);
  }
});

test("connection failure and deadline are never retried; audit failures never expose or alter authority", async () => {
  for (const fetch of [
    async () => { throw new Error(`private ${HANDOFF}`); },
    async () => new Promise<Response>(() => undefined),
    async (request: Request) => withUrl(new Response(new ReadableStream({
      start(controller) {
        setTimeout(() => {
          try {
            controller.enqueue(new TextEncoder().encode(SUCCESS));
            controller.close();
          } catch { /* Deadline cancellation owns the stream. */ }
        }, 250);
      },
    }), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-celebix-session-response-key-id": "active",
        "x-celebix-session-response-timestamp": request.headers.get("x-celebix-callback-timestamp") ?? "",
        "x-celebix-session-response-signature": "A".repeat(43),
      },
    })),
  ]) {
    let calls = 0;
    const startedAt = Date.now();
    await assert.rejects(
      () => fixture(async (request) => { calls += 1; return fetch(request); }, { deadlineMs: 10 }).complete(CALLBACK, BINDING),
      /^Error: panel_session_completion_transport_unavailable$/,
    );
    assert.ok(Date.now() - startedAt < 150);
    assert.equal(calls, 1);
  }
  for (const audit of [
    () => { throw new Error(`private ${HANDOFF}`); },
    async () => { throw new Error(`private ${HANDOFF}`); },
    () => new Promise<never>(() => undefined),
  ]) assert.equal((await fixture((request) => signedResponse(request), { audit }).complete(CALLBACK, BINDING)).kind, "session_handoff_ready");
});

test("schema-v2 completion refuses missing, malformed, whitespace, or percent-encoded binding authority before fetch", async () => {
  for (const binding of ["", "pb1.bad", `${BINDING} `, `%70b1.${BINDING.slice(4)}`]) {
    let calls = 0;
    await assert.rejects(
      () => fixture(async (request) => { calls += 1; return signedResponse(request); }).complete(CALLBACK, binding),
      /panel_session_completion_transport_unavailable/,
    );
    assert.equal(calls, 0);
  }
});
