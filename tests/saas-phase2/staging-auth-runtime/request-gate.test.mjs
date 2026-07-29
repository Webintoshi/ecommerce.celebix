import assert from "node:assert/strict";
import test from "node:test";

import { createApprovedStagingSaaSAuthAuthorityProfile } from "../../../packages/platform-config/src/saas.ts";
import { createApprovedStagingSelfServeRequestGate } from "../../../apps/owner/lib/self-serve-auth-authority/request-gate.ts";

const authority = createApprovedStagingSaaSAuthAuthorityProfile({
  ownerOrigin: "https://owner-auth.staging.example.test",
  panelOrigin: "https://panel-auth.staging.example.test",
  platformDomainSuffix: "shops.staging.example.test",
});

test("staging registration gate requires exact server-owned origin and applies a process-local ceiling", async () => {
  const gate = createApprovedStagingSelfServeRequestGate({ authority, clock: () => new Date(1_800_000_000_000), maximumRegistrationsPerMinute: 2 });
  const request = () => new Request(`${authority.ownerOrigin}/api/self-serve/register`, {
    method: "POST",
    headers: {
      origin: authority.ownerOrigin,
      "x-forwarded-for": "never-identity",
      "user-agent": "never-identity",
    },
  });
  assert.equal(await gate.verify({ kind: "registration_start", request: request() }), "allowed");
  assert.equal(await gate.verify({ kind: "registration_start", request: request() }), "allowed");
  assert.equal(await gate.verify({ kind: "registration_start", request: request() }), "rate_limited");
  assert.equal(await gate.verify({
    kind: "registration_start",
    request: new Request(`${authority.ownerOrigin}/api/self-serve/register`, { method: "POST", headers: { origin: "https://attacker.example" } }),
  }), "forbidden");
});

test("callback gate requires an injected trust context and delegates cryptographic validity to the sealed edge boundary", async () => {
  const gate = createApprovedStagingSelfServeRequestGate({ authority, clock: () => new Date() });
  const request = new Request(`${authority.panelCallbackUrl}?state=${"s".repeat(32)}&code=once`);
  assert.equal(await gate.verify({ kind: "callback_completion", request, edgeTrustContext: Object.freeze({}) }), "allowed");
  assert.equal(await gate.verify({ kind: "callback_completion", request, edgeTrustContext: null }), "unauthorized");
});
