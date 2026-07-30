import assert from "node:assert/strict";
import test from "node:test";

import { createApprovedStagingServerPanelAccessRuntime, createDisabledServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import { registerServerAdminHostAuthRuntime, resolveServerAdminHostAuthRuntime } from "./runtime.ts";

function access() {
  return createApprovedStagingServerPanelAccessRuntime({
    async resolveSession() { return { kind: "unauthenticated" as const }; },
    async rotateSession() { return { kind: "unauthenticated" as const }; },
    async recoverOperation() { return { kind: "operation_mismatch" as const }; },
    async revokePrincipalSessions() { return { kind: "unauthenticated" as const }; },
  }, "https://panel.saas-staging.celebix.site");
}

test("registers frozen public-brand and handoff facades only for approved access", async () => {
  const approved = access();
  const calls: string[] = [];
  registerServerAdminHostAuthRuntime(approved, {
    adminDomains: {
      async resolvePublicBrand() { calls.push("brand"); return { kind: "admin_host_unknown" as const }; },
    },
    handoffs: {
      async issueHandoff() { calls.push("issue"); return { kind: "unavailable" as const }; },
      async recoverIssuedHandoff() { calls.push("recover_issue"); return { kind: "unavailable" as const }; },
      async redeemHandoff() { calls.push("redeem"); return { kind: "unavailable" as const }; },
      async recoverRedemption() { calls.push("recover_redeem"); return { kind: "unavailable" as const }; },
    },
  });
  const runtime = resolveServerAdminHostAuthRuntime(approved);
  assert.ok(runtime);
  assert.equal(Object.isFrozen(runtime), true);
  assert.equal(Object.isFrozen(runtime.adminDomains), true);
  assert.equal(Object.isFrozen(runtime.handoffs), true);
  await runtime.adminDomains.resolvePublicBrand({ hostname: "x", now: new Date() });
  await runtime.handoffs.issueHandoff({} as never);
  await runtime.handoffs.recoverIssuedHandoff({} as never);
  await runtime.handoffs.redeemHandoff({} as never);
  await runtime.handoffs.recoverRedemption({} as never);
  assert.deepEqual(calls, ["brand", "issue", "recover_issue", "redeem", "recover_redeem"]);
  for (const forbidden of ["pool", "keys", "database", "connectionString"]) assert.equal(forbidden in runtime, false);
});

test("disabled, missing, and duplicate registrations fail closed", () => {
  const disabled = createDisabledServerPanelAccessRuntime();
  assert.equal(resolveServerAdminHostAuthRuntime(disabled), null);
  assert.throws(() => registerServerAdminHostAuthRuntime(disabled, {} as never), /server_admin_host_auth_runtime_invalid/);
  const approved = access();
  const repositories = {
    adminDomains: { async resolvePublicBrand() { return { kind: "unavailable" as const }; } },
    handoffs: {
      async issueHandoff() { return { kind: "unavailable" as const }; },
      async recoverIssuedHandoff() { return { kind: "unavailable" as const }; },
      async redeemHandoff() { return { kind: "unavailable" as const }; },
      async recoverRedemption() { return { kind: "unavailable" as const }; },
    },
  };
  registerServerAdminHostAuthRuntime(approved, repositories);
  assert.throws(() => registerServerAdminHostAuthRuntime(approved, repositories), /server_admin_host_auth_runtime_invalid/);
});
