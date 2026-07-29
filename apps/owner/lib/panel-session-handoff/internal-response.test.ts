import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

import { createOwnerInternalCallbackRequestAuthenticator } from "../self-serve-http/internal-callback-gateway.ts";
import {
  canonicalOwnerPanelSessionHandoffResult,
  createFreshLoginRequiredResult,
  createSessionHandoffReadyResult,
  createSignedOwnerPanelSessionHandoffResponse,
  ownerPanelSessionHandoffResponseSignaturePreimage,
} from "./internal-response.ts";

const ORIGIN = "https://owner-internal.example.test";
const ENDPOINT = `${ORIGIN}/api/internal/self-serve/oidc-callback`;
const CALLBACK = "https://panel.celebix.site/auth/callback?state=state_0123456789abcdefghijklmnop&code=code";
const NOW = new Date("2026-07-14T12:00:00.000Z");
const SECRET = new Uint8Array(32).fill(0x35);
const HANDOFF = `h1.handoff.active.${Buffer.alloc(32, 0x44).toString("base64url")}`;
const EXPIRES = new Date(NOW.getTime() + 600_000).toISOString();

async function authority() {
  const body = JSON.stringify({ schemaVersion: 1, callbackUrl: CALLBACK });
  const timestamp = String(NOW.getTime());
  const digest = createHash("sha256").update(body).digest("hex");
  const request = new Request(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-celebix-callback-key-id": "active",
      "x-celebix-callback-timestamp": timestamp,
      "x-celebix-callback-signature": createHmac("sha256", SECRET)
        .update(`celebix-callback-v1\n${timestamp}\n${digest}`)
        .digest("base64url"),
    },
    body,
  });
  return createOwnerInternalCallbackRequestAuthenticator({
    ownerInternalOrigin: ORIGIN,
    keys: new Map([["active", SECRET]]),
    clock: () => new Date(NOW),
    maximumBodyBytes: 4_096,
  }).authenticate(request);
}

test("canonical success JSON and exact domain-separated response signature bind request, status, and raw body", async () => {
  const authenticated = await authority();
  const result = createSessionHandoffReadyResult(HANDOFF, EXPIRES);
  const raw = canonicalOwnerPanelSessionHandoffResult(result);
  assert.equal(raw, `{"schemaVersion":1,"kind":"session_handoff_ready","handoffCredential":"${HANDOFF}","handoffExpiresAt":"${EXPIRES}","redirectPath":"/"}`);
  const responseDigest = createHash("sha256").update(raw).digest("hex");
  const preimage = ownerPanelSessionHandoffResponseSignaturePreimage({
    requestTimestamp: authenticated.timestamp,
    requestBodyDigest: authenticated.requestBodyDigest,
    status: 200,
    responseBodyDigest: responseDigest,
  });
  assert.equal(preimage, `celebix-session-handoff-response-v1\n${authenticated.timestamp}\n${authenticated.requestBodyDigest}\n200\n${responseDigest}`);
  const response = createSignedOwnerPanelSessionHandoffResponse(result, authenticated);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), raw);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-celebix-session-response-key-id"), "active");
  assert.equal(response.headers.get("x-celebix-session-response-timestamp"), authenticated.timestamp);
  const signature = response.headers.get("x-celebix-session-response-signature") ?? "";
  assert.equal(signature, createHmac("sha256", SECRET).update(preimage).digest("base64url"));
  assert.match(signature, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(signature, "base64url").byteLength, 32);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
});

test("fresh-login results use only the exact canonical status/code matrix", async () => {
  const expected = [
    ["provider_rejected", 400],
    ["callback_replayed", 409],
    ["callback_not_granted", 409],
    ["handoff_rejected", 409],
    ["callback_unavailable", 503],
    ["handoff_unavailable", 503],
  ] as const;
  const authenticated = await authority();
  for (const [code, status] of expected) {
    const result = createFreshLoginRequiredResult(code);
    assert.equal(result.status, status);
    assert.equal(canonicalOwnerPanelSessionHandoffResult(result), `{"schemaVersion":1,"kind":"fresh_login_required","code":"${code}","retryable":false}`);
    assert.equal(createSignedOwnerPanelSessionHandoffResponse(result, authenticated).status, status);
  }
  assert.throws(() => createFreshLoginRequiredResult("private_error" as never), /owner_panel_session_handoff_response_invalid/);
});

test("response construction rejects malformed credentials, timestamps, digests, statuses, and unauthenticated copies", async () => {
  assert.throws(() => createSessionHandoffReadyResult("h1.bad", EXPIRES), /owner_panel_session_handoff_response_invalid/);
  assert.throws(() => createSessionHandoffReadyResult(HANDOFF, "2026-07-14"), /owner_panel_session_handoff_response_invalid/);
  assert.throws(() => ownerPanelSessionHandoffResponseSignaturePreimage({
    requestTimestamp: String(NOW.getTime()), requestBodyDigest: "A".repeat(64), status: 200, responseBodyDigest: "b".repeat(64),
  }), /owner_panel_session_handoff_response_invalid/);
  const authenticated = await authority();
  assert.throws(
    () => createSignedOwnerPanelSessionHandoffResponse(createSessionHandoffReadyResult(HANDOFF, EXPIRES), { ...authenticated } as never),
    /owner_internal_callback_authenticated_request_invalid/,
  );
});
