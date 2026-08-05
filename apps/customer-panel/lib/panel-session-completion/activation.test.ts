import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPanelSessionCompletionApproval,
  createPanelSessionCompletionApproval,
} from "./activation.ts";

test("customer completion approval is sealed, disabled, unforgeable, and never production", () => {
  const approval = createPanelSessionCompletionApproval("disposable_test");
  assert.deepEqual(approval, {
    purpose: "phase2b2b2a_panel_session_completion",
    environment: "disposable_test",
    defaultRoute: "disabled",
    cookiePolicy: "secure_host_only",
    redirectPolicy: "fixed_same_origin",
    callbackReplay: "fresh_login_required",
    providerNetworking: "forbidden",
  });
  assert.equal(Object.isFrozen(approval), true);
  assert.equal(Object.isSealed(approval), true);
  assert.doesNotThrow(() => assertPanelSessionCompletionApproval(approval));
  for (const fake of [
    { ...approval },
    JSON.parse(JSON.stringify(approval)),
    structuredClone(approval),
    { purpose: approval.purpose, environment: approval.environment },
  ]) assert.throws(() => assertPanelSessionCompletionApproval(fake), /panel_session_completion_approval_invalid/);
  assert.throws(() => createPanelSessionCompletionApproval("production" as never), /panel_session_completion_approval_invalid/);
});
