import assert from "node:assert/strict";
import test from "node:test";

import type { AnalyticsRepository } from "@celebix/saas-data";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import { registerServerAnalyticsRepository, resolveServerAnalyticsRuntime } from "./runtime.ts";

function access(mode: "approved_staging" | "disabled" = "approved_staging"): ServerPanelAccessRuntime {
  return { readiness: { mode }, panelOrigin: mode === "approved_staging" ? "https://panel.saas-staging.celebix.site" : null, async resolveCredential() { return { kind: "unauthenticated" }; }, async rotateCredential() { return { kind: "unavailable" }; }, async revokeCredential() { return { kind: "unavailable" }; } };
}
function repository(): AnalyticsRepository { return { async dashboard() { throw new Error("unused"); } }; }

test("approved staging resolves a frozen analytics facade without its pool", () => {
  const authorized = access();
  registerServerAnalyticsRepository(authorized, repository());
  const runtime = resolveServerAnalyticsRuntime(authorized);
  assert.ok(runtime);
  assert.equal(Object.isFrozen(runtime.analytics), true);
  assert.equal("pool" in runtime.analytics, false);
});

test("disabled, malformed, and duplicate analytics registration fail closed", () => {
  assert.equal(resolveServerAnalyticsRuntime(access("disabled")), null);
  assert.throws(() => registerServerAnalyticsRepository(access("disabled"), repository()));
  const authorized = access();
  assert.throws(() => registerServerAnalyticsRepository(authorized, {} as AnalyticsRepository));
  registerServerAnalyticsRepository(authorized, repository());
  assert.throws(() => registerServerAnalyticsRepository(authorized, repository()));
});
