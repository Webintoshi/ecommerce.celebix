import assert from "node:assert/strict";
import test from "node:test";

import {
  createOwnerStagingCallbackAudit,
  createOwnerStagingOidcAudit,
} from "../../../apps/owner/lib/self-serve-auth-route-runtime/staging-callback-audit.ts";

test("staging callback audit emits only the approved stage and outcome projection", () => {
  const lines = [];
  const audit = createOwnerStagingCallbackAudit((line) => lines.push(line));

  audit({
    stage: "browser_claim",
    outcome: "rejected",
    state: "must-not-appear",
    code: "must-not-appear",
    credential: "must-not-appear",
  });

  assert.deepEqual(lines, [
    '{"schemaVersion":1,"event":"owner_staging_callback_audit","stage":"browser_claim","outcome":"rejected"}',
  ]);
});

test("staging callback audit remains observational when the sink fails", () => {
  const audit = createOwnerStagingCallbackAudit(() => {
    throw new Error("sink_failed");
  });

  assert.doesNotThrow(() => audit({ stage: "handoff", outcome: "unavailable" }));
});

test("staging OIDC audit emits only the approved verification stage and outcome", () => {
  const lines = [];
  const audit = createOwnerStagingOidcAudit((line) => lines.push(line));

  audit({
    stage: "id_token_identity",
    outcome: "rejected",
    code: "must-not-appear",
    token: "must-not-appear",
    email: "must-not-appear",
  });

  assert.deepEqual(lines, [
    '{"schemaVersion":1,"event":"owner_staging_oidc_audit","stage":"id_token_identity","outcome":"rejected"}',
  ]);
});
