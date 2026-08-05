import assert from "node:assert/strict";
import test from "node:test";

import type { StoreDomainService } from "@celebix/saas-domain-core";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import { registerServerStoreDomainService, resolveServerStoreDomainRuntime } from "./runtime.ts";

function access(mode: "approved_staging" | "disabled" = "approved_staging") {
  return { readiness: { mode }, panelOrigin: mode === "approved_staging" ? "https://panel.test" : null } as ServerPanelAccessRuntime;
}
function service(): StoreDomainService {
  return { async list() { return []; }, async create() { throw new Error("unused"); }, async requestRecheck() { throw new Error("unused"); }, async makePrimary() { throw new Error("unused"); }, async disable() { throw new Error("unused"); } };
}

test("approved runtime exposes only a frozen store-domain service facade", () => {
  const approved = access();
  registerServerStoreDomainService(approved, service());
  const runtime = resolveServerStoreDomainRuntime(approved);
  assert.ok(runtime);
  assert.deepEqual(Object.keys(runtime.domains), ["list", "create", "requestRecheck", "makePrimary", "disable"]);
  assert.equal(Object.isFrozen(runtime.domains), true);
  assert.equal(resolveServerStoreDomainRuntime(access("disabled")), null);
});

test("disabled malformed and duplicate registrations fail closed", () => {
  assert.throws(() => registerServerStoreDomainService(access("disabled"), service()), /server_store_domain_runtime_invalid/u);
  assert.throws(() => registerServerStoreDomainService(access(), { list() {} } as never), /server_store_domain_runtime_invalid/u);
  const approved = access(); registerServerStoreDomainService(approved, service());
  assert.throws(() => registerServerStoreDomainService(approved, service()), /server_store_domain_runtime_invalid/u);
});
