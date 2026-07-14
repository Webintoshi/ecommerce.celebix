import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPanelSessionHandoffApproval,
  createPanelSessionHandoffApproval,
} from "./activation.ts";

test("Owner handoff approval is sealed, disabled, and limited to disposable or approved staging", () => {
  for (const environment of ["disposable_test", "approved_staging"] as const) {
    const approval = createPanelSessionHandoffApproval(environment);
    assert.deepEqual(approval, {
      purpose: "phase2b2b1_panel_session_handoff",
      environment,
      routes: "forbidden",
      cookies: "forbidden",
      callbackMount: "forbidden",
      publicResponse: "forbidden",
      providerNetworking: "forbidden",
    });
    assert.equal(Object.isFrozen(approval), true);
    assert.doesNotThrow(() => assertPanelSessionHandoffApproval(approval));
  }
  assert.throws(() => createPanelSessionHandoffApproval("production" as never));
});

test("copied, serialized, spread, cloned, and plain Owner approvals lose authority", () => {
  const approval = createPanelSessionHandoffApproval("disposable_test");
  for (const candidate of [
    { ...approval },
    JSON.parse(JSON.stringify(approval)),
    structuredClone(approval),
    Object.freeze({ ...approval }),
  ]) assert.throws(() => assertPanelSessionHandoffApproval(candidate));
});
