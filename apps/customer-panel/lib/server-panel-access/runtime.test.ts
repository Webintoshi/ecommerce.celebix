import assert from "node:assert/strict";
import test from "node:test";

import {
  createApprovedStagingServerPanelAccessRuntime,
  createDisabledServerPanelAccessRuntime,
  createUnavailableServerPanelAccessRuntime,
} from "./runtime.ts";

const NOW = new Date("2026-07-16T10:00:00.000Z");
const CREDENTIAL = `v1.session.v1.${"A".repeat(43)}`;

test("disabled and unavailable runtimes stay fail closed and frozen", async () => {
  const disabled = createDisabledServerPanelAccessRuntime();
  const unavailable = createUnavailableServerPanelAccessRuntime();
  assert.equal(disabled.readiness.mode, "disabled");
  assert.equal(unavailable.readiness.mode, "unavailable");
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
});

test("approved staging runtime delegates exactly one durable resolve without exposing authority internals", async () => {
  const calls: unknown[] = [];
  const runtime = createApprovedStagingServerPanelAccessRuntime({
    async resolveSession(input) {
      calls.push(input);
      return { kind: "unauthenticated" };
    },
  });
  assert.equal(runtime.readiness.mode, "approved_staging");
  assert.deepEqual(Object.keys(runtime).sort(), ["readiness", "resolveCredential"]);
  assert.deepEqual(await runtime.resolveCredential({
    credential: CREDENTIAL,
    requestId: "request-approved",
    now: NOW,
  }), { kind: "unauthenticated" });
  assert.equal(calls.length, 1);
  for (const forbidden of ["pool", "keys", "database", "repository", "authority", "tokenDigest"]) {
    assert.equal(forbidden in runtime, false);
  }
});
