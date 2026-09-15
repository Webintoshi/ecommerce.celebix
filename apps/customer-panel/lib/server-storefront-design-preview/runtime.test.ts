import assert from "node:assert/strict";
import test from "node:test";

import { createApprovedStagingServerPanelAccessRuntime, createDisabledServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import { createServerStorefrontDesignPreviewRuntime } from "./runtime-core.ts";

function authority() {
  return { async resolveSession() { return { kind: "unauthenticated" as const }; }, async rotateSession() { return { kind: "unauthenticated" as const }; }, async recoverOperation() { return { kind: "operation_mismatch" as const }; }, async revokePrincipalSessions() { return { kind: "unauthenticated" as const }; } };
}

test("preview runtime exposes only access, workspace read, and projection load", () => {
  const access = createApprovedStagingServerPanelAccessRuntime(authority(), "https://panel.saas-staging.celebix.site");
  const selected = createServerStorefrontDesignPreviewRuntime({ access, design: { async getWorkspace() { throw new Error("unused"); }, private: true } as never, loader: { async load() { throw new Error("unused"); }, private: true } as never });
  assert.deepEqual(Object.keys(selected).sort(), ["access", "design", "loader"]);
  assert.deepEqual(Object.keys(selected.design), ["getWorkspace"]);
  assert.deepEqual(Object.keys(selected.loader), ["load"]);
  assert.equal("private" in selected.design, false);
  assert.equal("private" in selected.loader, false);
});

test("preview runtime rejects disabled access or mutable dependencies", () => {
  const design = { async getWorkspace() { throw new Error("unused"); } } as never;
  const loader = { async load() { throw new Error("unused"); } } as never;
  assert.throws(() => createServerStorefrontDesignPreviewRuntime({ access: createDisabledServerPanelAccessRuntime(), design, loader }), /runtime_invalid/);
  const access = createApprovedStagingServerPanelAccessRuntime(authority(), "https://panel.saas-staging.celebix.site");
  assert.throws(() => createServerStorefrontDesignPreviewRuntime({ access, design: {} as never, loader }), /runtime_invalid/);
});
