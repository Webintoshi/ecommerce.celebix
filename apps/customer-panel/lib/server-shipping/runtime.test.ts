import assert from "node:assert/strict";
import test from "node:test";

import { registerServerShippingRuntime, resolveServerShippingRuntime } from "./runtime.ts";

test("shipping runtime is registered once for approved panel access", () => {
  const access = { readiness: { mode: "approved_staging" }, panelOrigin: "https://panel.test" } as never;
  const admin = Object.freeze({ current: async () => null, setup: async () => null, saveConnection: async () => { throw new Error("unused"); }, selectResources: async () => { throw new Error("unused"); }, revokeConnection: async () => { throw new Error("unused"); } });
  const workflow = Object.freeze({ claimValidation: async () => null, openClaimedCredential: async () => { throw new Error("unused"); }, completeValidation: async () => "completed" as const, failValidation: async () => "failed" as const });
  const unused = async () => { throw new Error("unused"); };
  const adapter = Object.freeze({
    providerCode: "basit_kargo", parseCredential() { return {}; }, verifyCredential: unused,
    listBrands: unused, listSenderAddresses: unused, listHandlers: unused, quotePackages: unused,
    createShipment: unused, getShipment: unused, cancelShipment: unused, createReturnShipment: unused,
    downloadLabel: unused,
  });
  registerServerShippingRuntime(access, admin as never, workflow as never, adapter as never, () => "90000000-0000-4000-8000-000000000001");
  const runtime = resolveServerShippingRuntime(access);
  assert.ok(runtime);
  assert.deepEqual(Object.keys(runtime.admin), ["current", "setup", "saveConnection", "selectResources", "revokeConnection"]);
  assert.deepEqual(Object.keys(runtime.workflow), ["claimValidation", "openClaimedCredential", "completeValidation", "failValidation"]);
  assert.strictEqual(runtime.adapter, adapter);
  assert.throws(() => registerServerShippingRuntime(access, admin as never, workflow as never, adapter as never, () => "90000000-0000-4000-8000-000000000001"), /server_shipping_runtime_invalid/u);
});
