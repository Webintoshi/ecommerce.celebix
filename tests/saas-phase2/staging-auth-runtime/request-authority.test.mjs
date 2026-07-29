import assert from "node:assert/strict";
import test from "node:test";

import { createApprovedStagingSaaSAuthAuthorityProfile } from "../../../packages/platform-config/src/saas.ts";
import { publicRegistrationRequestAuthority } from "../../../apps/owner/lib/self-serve-auth-authority/request-authority.ts";
import { createApprovedStagingSelfServeRequestGate } from "../../../apps/owner/lib/self-serve-auth-authority/request-gate.ts";
import { processSelfServeRegistrationRequest } from "../../../apps/owner/lib/self-serve-http/registration-request.ts";
import { createDisabledSelfServeRuntime } from "../../../apps/owner/lib/self-serve-http/runtime.ts";

const PRODUCTION_ORIGIN = "https://ecommerce.celebix.co";
const REGISTER_PATH = "/api/self-serve/register";

function requestLike(options = {}) {
  const method = options.method ?? "POST";
  const url = options.url ?? `${PRODUCTION_ORIGIN}${REGISTER_PATH}`;
  const origin = Object.hasOwn(options, "origin") ? options.origin : PRODUCTION_ORIGIN;
  return Object.freeze({
    method,
    url,
    headers: Object.freeze({
      get(name) {
        return name.toLowerCase() === "origin" ? origin : null;
      },
    }),
  });
}

test("public registration authority is immutable and accepts public or internal proxy URLs only with the exact public Origin and path", () => {
  assert.equal(Object.isFrozen(publicRegistrationRequestAuthority), true);
  assert.equal(publicRegistrationRequestAuthority.validate(
    requestLike(),
    PRODUCTION_ORIGIN,
  ), true);
  assert.equal(publicRegistrationRequestAuthority.validate(
    requestLike({ url: `http://owner-service.internal:3000${REGISTER_PATH}` }),
    PRODUCTION_ORIGIN,
  ), true);
});

test("public registration authority rejects every non-exact raw Origin representation", () => {
  const rejected = [
    undefined,
    null,
    "null",
    `${PRODUCTION_ORIGIN}, https://attacker.example`,
    "not-an-origin",
    ` ${PRODUCTION_ORIGIN}`,
    `${PRODUCTION_ORIGIN} `,
    "https://ecommerce.celebix.co:444",
    "https://attacker.example",
  ];
  for (const origin of rejected) {
    assert.equal(
      publicRegistrationRequestAuthority.validate(requestLike({ origin }), PRODUCTION_ORIGIN),
      false,
      `origin must be denied: ${String(origin)}`,
    );
  }
});

test("public registration authority validates only the exact POST pathname and rejects query strings and fragments", () => {
  const rejected = [
    requestLike({ method: "GET" }),
    requestLike({ url: "http://owner-service.internal:3000/api/self-serve/register/" }),
    requestLike({ url: "http://owner-service.internal:3000/api/self-serve/other" }),
    requestLike({ url: `http://owner-service.internal:3000${REGISTER_PATH}?next=attacker` }),
    requestLike({ url: `http://owner-service.internal:3000${REGISTER_PATH}#fragment` }),
    requestLike({ url: "not-a-url" }),
  ];
  for (const request of rejected) {
    assert.equal(publicRegistrationRequestAuthority.validate(request, PRODUCTION_ORIGIN), false);
  }
});

test("forged forwarding headers cannot rescue a wrong Origin or wrong path at the staging request gate", async () => {
  const authority = createApprovedStagingSaaSAuthAuthorityProfile({
    ownerOrigin: "https://owner-auth.staging.example.test",
    panelOrigin: "https://panel-auth.staging.example.test",
    platformDomainSuffix: "shops.staging.example.test",
  });
  const gate = createApprovedStagingSelfServeRequestGate({ authority, clock: () => new Date() });
  const forwarded = {
    host: new URL(authority.ownerOrigin).host,
    forwarded: `host=${new URL(authority.ownerOrigin).host};proto=https`,
    "x-forwarded-host": new URL(authority.ownerOrigin).host,
    "x-forwarded-proto": "https",
    "x-forwarded-uri": REGISTER_PATH,
  };

  const validProxyRequest = new Request(`http://owner-service.internal:3000${REGISTER_PATH}`, {
    method: "POST",
    headers: { ...forwarded, origin: authority.ownerOrigin },
  });
  assert.equal(await gate.verify({ kind: "registration_start", request: validProxyRequest }), "allowed");

  const wrongOrigin = new Request(`http://owner-service.internal:3000${REGISTER_PATH}`, {
    method: "POST",
    headers: { ...forwarded, origin: "https://attacker.example" },
  });
  assert.equal(await gate.verify({ kind: "registration_start", request: wrongOrigin }), "forbidden");

  const wrongPath = new Request("http://owner-service.internal:3000/api/self-serve/other", {
    method: "POST",
    headers: { ...forwarded, origin: authority.ownerOrigin },
  });
  assert.equal(await gate.verify({ kind: "registration_start", request: wrongPath }), "forbidden");
});

test("production registration processing accepts an internal proxy URL but remains disabled by default", async () => {
  const runtime = createDisabledSelfServeRuntime();
  const request = new Request(`http://owner-service.internal:3000${REGISTER_PATH}`, {
    method: "POST",
    headers: { origin: PRODUCTION_ORIGIN },
  });
  const result = await processSelfServeRegistrationRequest(runtime, request);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.response.status, 503);
  assert.equal((await result.response.json()).code, "self_serve_saas_registration_disabled");
});

test("registration path deviations are denied before disabled-mode handling", async () => {
  const runtime = createDisabledSelfServeRuntime();
  const request = new Request(`http://owner-service.internal:3000${REGISTER_PATH}?unexpected=true`, {
    method: "POST",
    headers: { origin: PRODUCTION_ORIGIN },
  });
  const result = await processSelfServeRegistrationRequest(runtime, request);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.response.status, 403);
  assert.equal((await result.response.json()).code, "self_serve_origin_required");
});

test("callback authority remains delegated to the existing injected edge trust context", async () => {
  const authority = createApprovedStagingSaaSAuthAuthorityProfile({
    ownerOrigin: "https://owner-auth.staging.example.test",
    panelOrigin: "https://panel-auth.staging.example.test",
    platformDomainSuffix: "shops.staging.example.test",
  });
  const gate = createApprovedStagingSelfServeRequestGate({ authority, clock: () => new Date() });
  const request = new Request(`${authority.panelCallbackUrl}?state=${"s".repeat(32)}&code=once`);
  assert.equal(await gate.verify({ kind: "callback_completion", request, edgeTrustContext: Object.freeze({}) }), "allowed");
  assert.equal(await gate.verify({ kind: "callback_completion", request, edgeTrustContext: null }), "unauthorized");
});
