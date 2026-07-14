import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

import {
  PANEL_BROWSER_BINDING_INTERNAL_PATH,
  PANEL_BROWSER_BOOTSTRAP_REQUEST_SIGNATURE_DOMAIN,
  PANEL_BROWSER_BOOTSTRAP_RESPONSE_SIGNATURE_DOMAIN,
} from "../../../../packages/platform-config/src/saas.ts";
import {
  createOwnerPanelBrowserBindingInternalGateway,
  createPanelBrowserBindingInternalGatewayApproval,
} from "./internal-gateway.ts";
import type { PanelBrowserBindingResult } from "./postgres-repository.ts";

const NOW = new Date("2026-07-14T12:00:00.000Z");
const ORIGIN = "https://owner-internal.example.test";
const ENDPOINT = `${ORIGIN}${PANEL_BROWSER_BINDING_INTERNAL_PATH}`;
const SECRET = Buffer.alloc(32, 0x44);
const BS = `bs1.bootstrap.${Buffer.alloc(32, 0x11).toString("base64url")}`;
const PB = `pb1.${Buffer.alloc(32, 0x22).toString("base64url")}`;
const PROVIDER = "https://identity.example.test/authorize?state=state_0123456789abcdefghijklmnop&redirect_uri=https%3A%2F%2Fpanel.celebix.site%2Fauth%2Fcallback&response_type=code&response_mode=query";

function signedRequest(overrides: { body?: string; signatureBody?: string; timestamp?: string } = {}) {
  const body = overrides.body ?? JSON.stringify({
    schemaVersion: 1,
    bootstrapCredential: BS,
    providerAuthorizationUrl: PROVIDER,
    browserBindingCredential: PB,
  });
  const signatureBody = overrides.signatureBody ?? body;
  const timestamp = overrides.timestamp ?? String(NOW.getTime());
  const digest = createHash("sha256").update(signatureBody).digest("hex");
  const signature = createHmac("sha256", SECRET)
    .update(`${PANEL_BROWSER_BOOTSTRAP_REQUEST_SIGNATURE_DOMAIN}\n${timestamp}\n${digest}`)
    .digest("base64url");
  return new Request(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-celebix-browser-bootstrap-key-id": "bootstrap-hmac",
      "x-celebix-browser-bootstrap-timestamp": timestamp,
      "x-celebix-browser-bootstrap-signature": signature,
    },
    body,
  });
}

function fixture(kind: PanelBrowserBindingResult["kind"] = "browser_binding_created") {
  const binds: unknown[] = [];
  const gateway = createOwnerPanelBrowserBindingInternalGateway({
    activationApproval: createPanelBrowserBindingInternalGatewayApproval("disposable_test"),
    ownerInternalOrigin: ORIGIN,
    keys: new Map([["bootstrap-hmac", SECRET]]),
    clock: () => new Date(NOW),
    maximumBodyBytes: 16_384,
    repository: {
      async bindBrowserCredential(input) {
        binds.push(structuredClone(input));
        return kind === "browser_binding_created" || kind === "browser_binding_replayed"
          ? { kind, providerAuthorizationUrl: PROVIDER, expiresAt: new Date(NOW.getTime() + 600_000).toISOString() }
          : { kind };
      },
    },
    audit() {},
  });
  return { gateway, binds };
}

function verifyResponse(response: Response, requestBody: string) {
  const rawPromise = response.clone().text();
  return rawPromise.then((raw) => {
    const requestDigest = createHash("sha256").update(requestBody).digest("hex");
    const responseDigest = createHash("sha256").update(raw).digest("hex");
    const preimage = [
      PANEL_BROWSER_BOOTSTRAP_RESPONSE_SIGNATURE_DOMAIN,
      String(NOW.getTime()), requestDigest, String(response.status), responseDigest,
    ].join("\n");
    assert.equal(
      response.headers.get("x-celebix-browser-bootstrap-response-signature"),
      createHmac("sha256", SECRET).update(preimage).digest("base64url"),
    );
    return raw;
  });
}

test("authenticates exact raw bytes before binding and signs the exact canonical success", async () => {
  const current = fixture();
  const request = signedRequest();
  const requestBody = await request.clone().text();
  const response = await current.gateway(request);
  assert.equal(response.status, 200);
  const raw = await verifyResponse(response, requestBody);
  assert.equal(raw, JSON.stringify({
    schemaVersion: 1,
    kind: "browser_binding_ready",
    providerAuthorizationUrl: PROVIDER,
    browserBindingExpiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
  }));
  assert.deepEqual(current.binds, [{
    bootstrapCredential: BS,
    providerAuthorizationUrl: PROVIDER,
    browserBindingCredential: PB,
    now: NOW,
    expiresAt: new Date(NOW.getTime() + 900_000),
  }]);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
});

test("wrong HMAC, non-canonical body, and stale timestamp fail before repository access", async () => {
  for (const request of [
    signedRequest({ body: JSON.stringify({ schemaVersion: 1, bootstrapCredential: BS, providerAuthorizationUrl: PROVIDER, browserBindingCredential: PB }), signatureBody: "different" }),
    signedRequest({ body: JSON.stringify({ browserBindingCredential: PB, providerAuthorizationUrl: PROVIDER, bootstrapCredential: BS, schemaVersion: 1 }) }),
    signedRequest({ timestamp: String(NOW.getTime() - 60_001) }),
  ]) {
    const current = fixture();
    const response = await current.gateway(request);
    assert.ok([400, 401].includes(response.status));
    assert.equal(current.binds.length, 0);
  }
});

test("write uncertainty and URL mismatch are signed fail-closed responses without cookie or redirect", async () => {
  for (const [kind, status] of [["commit_unknown", 503], ["operation_mismatch", 409]] as const) {
    const current = fixture(kind);
    const request = signedRequest();
    const requestBody = await request.clone().text();
    const response = await current.gateway(request);
    assert.equal(response.status, status);
    await verifyResponse(response, requestBody);
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(response.headers.has("location"), false);
  }
});
