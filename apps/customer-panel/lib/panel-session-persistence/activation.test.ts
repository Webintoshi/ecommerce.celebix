import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPanelSessionPersistenceApproval,
  createPanelSessionPersistenceApproval,
} from "./activation.ts";

test("creates only frozen, sealed disposable-test or approved-staging approvals", () => {
  for (const environment of ["disposable_test", "approved_staging"] as const) {
    const approval = createPanelSessionPersistenceApproval(environment);
    assert.equal(Object.isFrozen(approval), true);
    assert.equal(Object.isSealed(approval), true);
    assert.deepEqual(approval, {
      purpose: "phase2b2a_panel_session_persistence",
      environment,
      publicActivation: "disabled",
      cookies: "forbidden",
      routes: "forbidden",
      callbackIssuance: "forbidden",
      providerNetworking: "forbidden",
    });
    assert.doesNotThrow(() => assertPanelSessionPersistenceApproval(approval));
  }
});

test("production and arbitrary environment values cannot create approval", () => {
  for (const value of ["production", "staging", "development", "", process.env.NODE_ENV]) {
    assert.throws(() => createPanelSessionPersistenceApproval(value as never), /panel_session_approval_invalid/);
  }
});

test("serialized, spread, structured-cloned, and plain matching objects lose authority", () => {
  const approval = createPanelSessionPersistenceApproval("disposable_test");
  for (const candidate of [
    JSON.parse(JSON.stringify(approval)),
    { ...approval },
    structuredClone(approval),
    {
      purpose: "phase2b2a_panel_session_persistence",
      environment: "disposable_test",
      publicActivation: "disabled",
      cookies: "forbidden",
      routes: "forbidden",
      callbackIssuance: "forbidden",
      providerNetworking: "forbidden",
    },
  ]) {
    assert.throws(() => assertPanelSessionPersistenceApproval(candidate), /panel_session_approval_invalid/);
  }
});

test("browser-like input and environment variables cannot manufacture approval", () => {
  const browser = new URLSearchParams({
    purpose: "phase2b2a_panel_session_persistence",
    environment: "approved_staging",
  });
  const before = process.env.PANEL_SESSION_PERSISTENCE;
  process.env.PANEL_SESSION_PERSISTENCE = "approved_staging";
  try {
    assert.throws(() => assertPanelSessionPersistenceApproval(browser), /panel_session_approval_invalid/);
    assert.throws(() => assertPanelSessionPersistenceApproval(process.env), /panel_session_approval_invalid/);
  } finally {
    if (before === undefined) delete process.env.PANEL_SESSION_PERSISTENCE;
    else process.env.PANEL_SESSION_PERSISTENCE = before;
  }
});
