import assert from "node:assert/strict";
import test from "node:test";

import {
  createApprovedStagingServerPanelAccessRuntime,
  createDisabledServerPanelAccessRuntime,
  createUnavailableServerPanelAccessRuntime,
} from "./runtime.ts";

const NOW = new Date("2026-07-16T10:00:00.000Z");
const CREDENTIAL = `v1.session.v1.${"A".repeat(43)}`;
const PANEL_ORIGIN = "https://staging-panel.celebix.site";
const STORE_ID = "33333333-3333-4333-8333-333333333333";
const OPERATION_ID = "44444444-4444-4444-8444-444444444444";

test("disabled and unavailable runtimes stay fail closed and frozen", async () => {
  const disabled = createDisabledServerPanelAccessRuntime();
  const unavailable = createUnavailableServerPanelAccessRuntime();
  assert.equal(disabled.readiness.mode, "disabled");
  assert.equal(unavailable.readiness.mode, "unavailable");
  assert.equal(disabled.panelOrigin, null);
  assert.equal(unavailable.panelOrigin, null);
  assert.equal(Object.isFrozen(disabled), true);
  assert.deepEqual(await disabled.resolveCredential({
    credential: CREDENTIAL,
    requestId: "request-disabled",
    now: NOW,
  }), { kind: "unauthenticated" });
  assert.deepEqual(await unavailable.resolveCredential({
    credential: null,
    requestId: "request-unavailable-missing",
    now: NOW,
  }), { kind: "unauthenticated" });
  assert.deepEqual(await unavailable.resolveCredential({
    credential: CREDENTIAL,
    requestId: "request-unavailable",
    now: NOW,
  }), { kind: "unavailable" });
  assert.deepEqual(await disabled.rotateCredential({
    currentCredential: CREDENTIAL,
    operationId: OPERATION_ID,
    requestedStoreId: STORE_ID,
    now: NOW,
  }), { kind: "unavailable" });
  assert.deepEqual(await unavailable.revokeCredential({
    credential: CREDENTIAL,
    reason: "logout",
    now: NOW,
  }), { kind: "unavailable" });
});

test("approved staging runtime delegates exactly one durable resolve without exposing authority internals", async () => {
  const calls: unknown[] = [];
  const runtime = createApprovedStagingServerPanelAccessRuntime({
    async resolveSession(input) {
      calls.push(input);
      return { kind: "unauthenticated" };
    },
    async rotateSession(input) { calls.push(input); return { kind: "unauthenticated" }; },
    async recoverOperation(input) { calls.push(input); return { kind: "operation_mismatch" }; },
    async revokePrincipalSessions(input) { calls.push(input); return { kind: "unauthenticated" }; },
  }, PANEL_ORIGIN);
  assert.equal(runtime.readiness.mode, "approved_staging");
  assert.equal(runtime.panelOrigin, PANEL_ORIGIN);
  assert.deepEqual(Object.keys(runtime).sort(), [
    "panelOrigin", "readiness", "resolveCredential", "revokeCredential", "rotateCredential",
  ]);
  assert.deepEqual(await runtime.resolveCredential({
    credential: CREDENTIAL,
    requestId: "request-approved",
    now: NOW,
  }), { kind: "unauthenticated" });
  assert.deepEqual(await runtime.rotateCredential({
    currentCredential: CREDENTIAL,
    operationId: OPERATION_ID,
    requestedStoreId: STORE_ID,
    now: NOW,
  }), { kind: "unauthenticated" });
  assert.deepEqual(await runtime.revokeCredential({
    credential: CREDENTIAL,
    reason: "logout",
    now: NOW,
  }), { kind: "unauthenticated" });
  assert.equal(calls.length, 3);
  for (const forbidden of ["pool", "keys", "database", "repository", "authority", "tokenDigest"]) {
    assert.equal(forbidden in runtime, false);
  }
});
