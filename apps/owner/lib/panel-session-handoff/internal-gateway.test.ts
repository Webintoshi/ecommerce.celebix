import assert from "node:assert/strict";
import test from "node:test";

import {
  assertOwnerPanelSessionHandoffGatewayApproval,
  createOwnerPanelSessionHandoffInternalGateway,
  createOwnerPanelSessionHandoffGatewayApproval,
  parseCanonicalPanelSessionCompletionEnvelope,
} from "./internal-gateway.ts";
import { createVerifiedEdgeTrustBoundary } from "../self-serve-http/verified-edge-trust.ts";

const ORIGIN = "https://owner-internal.example.test";
const SECRET = new Uint8Array(32).fill(0x35);
const CALLBACK = "https://panel.celebix.site/auth/callback?state=state_0123456789abcdefghijklmnop&code=verified-code";
const BINDING = `pb1.${Buffer.alloc(32, 0x36).toString("base64url")}`;

test("Owner handoff gateway approval is sealed, private, disabled, and never production", () => {
  const approval = createOwnerPanelSessionHandoffGatewayApproval("approved_staging");
  assert.deepEqual(approval, {
    purpose: "phase2b2b2a_owner_session_handoff_gateway",
    environment: "approved_staging",
    defaultRoute: "disabled",
    publicResponse: "forbidden",
    cookies: "forbidden",
    callbackReplay: "no_handoff",
    providerNetworking: "forbidden",
  });
  assert.equal(Object.isFrozen(approval), true);
  assert.equal(Object.isSealed(approval), true);
  assert.doesNotThrow(() => assertOwnerPanelSessionHandoffGatewayApproval(approval));
  for (const fake of [{ ...approval }, JSON.parse(JSON.stringify(approval)), structuredClone(approval), {}]) {
    assert.throws(() => assertOwnerPanelSessionHandoffGatewayApproval(fake), /owner_panel_session_handoff_gateway_approval_invalid/);
  }
  assert.throws(() => createOwnerPanelSessionHandoffGatewayApproval("production" as never), /owner_panel_session_handoff_gateway_approval_invalid/);
});

test("gateway rejects copied or plain handlers before accepting request authority", () => {
  const base = {
    activationApproval: createOwnerPanelSessionHandoffGatewayApproval("disposable_test"),
    ownerInternalOrigin: ORIGIN,
    keys: new Map([["active", SECRET]]),
    clock: () => new Date("2026-07-14T12:00:00.000Z"),
    maximumBodyBytes: 4_096,
    edgeTrustBoundary: createVerifiedEdgeTrustBoundary(),
    callbackHandler: Object.freeze({ handle: async () => ({}) }),
    audit: () => undefined,
  };
  assert.throws(
    () => createOwnerPanelSessionHandoffInternalGateway(base as never),
    /owner_panel_session_handoff_gateway_invalid/,
  );
});

test("schema-v2 envelope is byte-canonical and binds the exact callback to one pb1 credential", () => {
  const canonical = JSON.stringify({ schemaVersion: 2, callbackUrl: CALLBACK, browserBindingCredential: BINDING });
  assert.deepEqual(parseCanonicalPanelSessionCompletionEnvelope(new TextEncoder().encode(canonical)), {
    callbackUrl: CALLBACK,
    browserBindingCredential: BINDING,
  });
  for (const invalid of [
    JSON.stringify({ schemaVersion: 1, callbackUrl: CALLBACK }),
    JSON.stringify({ schemaVersion: 2, browserBindingCredential: BINDING, callbackUrl: CALLBACK }),
    JSON.stringify({ schemaVersion: 2, callbackUrl: CALLBACK, browserBindingCredential: BINDING, extra: true }),
    JSON.stringify({ schemaVersion: 2, callbackUrl: CALLBACK, browserBindingCredential: "pb1.bad" }),
    ` ${canonical}`,
  ]) assert.throws(
    () => parseCanonicalPanelSessionCompletionEnvelope(new TextEncoder().encode(invalid)),
    /owner_panel_session_handoff_gateway_invalid/,
  );
});
