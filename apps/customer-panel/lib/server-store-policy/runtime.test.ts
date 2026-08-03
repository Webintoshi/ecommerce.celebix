import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { StorePolicyAdminRepository } from "@celebix/saas-data";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import {
  registerServerStorePolicyRepository,
  resolveServerStorePolicyRuntime,
} from "./runtime.ts";

function access(mode: "approved_staging" | "disabled" = "approved_staging") {
  return {
    readiness: { mode },
    panelOrigin: mode === "approved_staging" ? "https://panel.staging.example" : null,
  } as ServerPanelAccessRuntime;
}

function repository(): StorePolicyAdminRepository {
  return {
    async list() { return Object.freeze([]); },
    async save() { throw new Error("unused"); },
  };
}

test("fixed policy runtime exposes only a frozen list and save facade", () => {
  const approved = access();
  registerServerStorePolicyRepository(approved, repository());
  const runtime = resolveServerStorePolicyRuntime(approved);
  assert.ok(runtime);
  assert.equal(Object.isFrozen(runtime), true);
  assert.deepEqual(Object.keys(runtime.policies), ["list", "save"]);
  assert.equal(resolveServerStorePolicyRuntime(access("disabled")), null);
});

test("fixed policy runtime rejects disabled malformed and duplicate registration", () => {
  assert.throws(() => registerServerStorePolicyRepository(access("disabled"), repository()), /server_store_policy_runtime_invalid/);
  assert.throws(() => registerServerStorePolicyRepository(access(), { list() {} } as never), /server_store_policy_runtime_invalid/);
  const approved = access();
  registerServerStorePolicyRepository(approved, repository());
  assert.throws(() => registerServerStorePolicyRepository(approved, repository()), /server_store_policy_runtime_invalid/);
});

test("approved staging startup preflights and registers migration 071 policy authority", () => {
  const source = readFileSync(new URL("../server-panel-access/postgres-runtime.ts", import.meta.url), "utf8");
  assert.match(source, /PostgresStorePolicyAdminRepository/);
  assert.match(source, /to_regclass\('saas[.]store_policy_pages'\)/);
  assert.match(source, /to_regprocedure\('saas[.]store_policy_list_admin/);
  assert.match(source, /to_regprocedure\('saas[.]store_policy_save/);
  assert.match(source, /to_regprocedure\('saas[.]store_policy_recover/);
  assert.match(source, /new PostgresStorePolicyAdminRepository\(\{/);
  assert.match(source, /registerServerStorePolicyRepository\(access, storePolicyRepository\)/);
});
