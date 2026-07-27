import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { PaymentMethodRepository } from "@celebix/saas-data";

import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";
import {
  registerServerPaymentMethodRepository,
  resolveServerPaymentMethodsRuntime,
} from "./runtime.ts";

function access(mode: "approved_staging" | "disabled" = "approved_staging") {
  return {
    readiness: { mode },
    panelOrigin: mode === "approved_staging" ? "https://panel.staging.example" : null,
  } as ServerPanelAccessRuntime;
}

function repository(): PaymentMethodRepository {
  return {
    async list() { return Object.freeze([]); },
    async save() { throw new Error("unused"); },
    async setState() { throw new Error("unused"); },
    async reorder() { throw new Error("unused"); },
    async recoverOperation() { throw new Error("unused"); },
  };
}

test("approved runtime exposes only a frozen repository facade and truthful catalog", () => {
  const approved = access();
  registerServerPaymentMethodRepository(approved, repository());
  const runtime = resolveServerPaymentMethodsRuntime(approved);
  assert.ok(runtime);
  assert.equal(Object.isFrozen(runtime), true);
  assert.deepEqual(Object.keys(runtime.methods), ["list", "save", "setState", "reorder", "recoverOperation"]);
  assert.equal("pool" in runtime.methods, false);
  assert.equal(runtime.catalog.length, 58);
  assert.deepEqual(runtime.catalog.filter((entry) => entry.readiness === "verification").map((entry) => entry.providerCode), ["paytr_iframe"]);
  assert.equal(resolveServerPaymentMethodsRuntime(access("disabled")), null);
});

test("disabled malformed and duplicate registration fail closed", () => {
  assert.throws(() => registerServerPaymentMethodRepository(access("disabled"), repository()), /server_payment_methods_runtime_invalid/);
  assert.throws(() => registerServerPaymentMethodRepository(access(), { list() {} } as never), /server_payment_methods_runtime_invalid/);
  const approved = access();
  registerServerPaymentMethodRepository(approved, repository());
  assert.throws(() => registerServerPaymentMethodRepository(approved, repository()), /server_payment_methods_runtime_invalid/);
});

test("approved staging startup preflights constructs and registers payment method authority", () => {
  const source = readFileSync(new URL("../server-panel-access/postgres-runtime.ts", import.meta.url), "utf8");
  assert.match(source, /PostgresPaymentMethodRepository/);
  assert.match(source, /to_regclass\('saas\.payment_methods'\)/);
  assert.match(source, /to_regprocedure\('saas\.payment_method_list/);
  assert.match(source, /to_regprocedure\('saas\.payment_method_recover_operation/);
  assert.match(source, /saas\.paytr_iframe_activation_preflight\(\)/);
  assert.match(source, /new PostgresPaymentMethodRepository\(\{[\s\S]*?pool,[\s\S]*?role: "celebix_saas_app"/);
  assert.match(source, /registerServerPaymentMethodRepository\(access, paymentMethodRepository\)/);
  assert.ok(source.indexOf("await preflight") < source.indexOf("new PostgresPaymentMethodRepository"));
});
