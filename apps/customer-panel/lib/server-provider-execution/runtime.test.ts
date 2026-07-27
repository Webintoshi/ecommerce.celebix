import assert from "node:assert/strict";
import test from "node:test";

import type {
  MerchantProviderCredentialKeyring,
  MerchantProviderProfileRepository,
} from "@celebix/saas-data";

import {
  registerServerProviderExecutionRuntime,
  resolveServerProviderExecutionRuntime,
} from "./runtime.ts";
import { createCustomerPanelProviderRegistry } from "./registry.ts";

function access(mode: "approved_staging" | "disabled" = "approved_staging") {
  return { readiness: { mode }, panelOrigin: mode === "approved_staging" ? "https://panel.example.test" : null } as never;
}

const reject = async () => { throw new Error("unexpected"); };
const profiles: MerchantProviderProfileRepository = Object.freeze({ list: reject, save: reject, disable: reject, revoke: reject });
function keyring(): MerchantProviderCredentialKeyring {
  return Object.freeze({
    activeKeyId: "staging-key-01",
    keys: Object.freeze([Object.freeze({ keyId: "staging-key-01", key: new Uint8Array(32).fill(7) })]),
  });
}

test("registers one frozen approved-staging provider runtime", () => {
  const approved = access();
  const registry = createCustomerPanelProviderRegistry([]);
  registerServerProviderExecutionRuntime(approved, profiles, keyring(), registry);
  const runtime = resolveServerProviderExecutionRuntime(approved);
  assert.ok(runtime);
  assert.equal(runtime.access, approved);
  assert.equal(runtime.registry, registry);
  assert.deepEqual(Object.keys(runtime.profiles), ["list", "save", "disable", "revoke"]);
  assert.equal(Object.isFrozen(runtime), true);
  assert.equal(resolveServerProviderExecutionRuntime(access("disabled")), null);
});

test("runtime rejects missing repository methods and mutable keyrings", () => {
  assert.throws(() => registerServerProviderExecutionRuntime(access(), { list: reject } as never, keyring(), createCustomerPanelProviderRegistry([])), /server_provider_execution_runtime_invalid/);
  const mutableKeyring = { activeKeyId: "staging-key-01", keys: [{ keyId: "staging-key-01", key: new Uint8Array(32) }] } as MerchantProviderCredentialKeyring;
  assert.throws(() => registerServerProviderExecutionRuntime(access(), profiles, mutableKeyring, createCustomerPanelProviderRegistry([])), /server_provider_execution_runtime_invalid/);
});

test("runtime rejects duplicate access registration and disabled access", () => {
  const approved = access();
  registerServerProviderExecutionRuntime(approved, profiles, keyring(), createCustomerPanelProviderRegistry([]));
  assert.throws(() => registerServerProviderExecutionRuntime(approved, profiles, keyring(), createCustomerPanelProviderRegistry([])), /server_provider_execution_runtime_invalid/);
  assert.throws(() => registerServerProviderExecutionRuntime(access("disabled"), profiles, keyring(), createCustomerPanelProviderRegistry([])), /server_provider_execution_runtime_invalid/);
});
