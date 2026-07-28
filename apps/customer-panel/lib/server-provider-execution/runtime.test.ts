import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import type {
  MerchantProviderCredentialKeyring,
  MerchantProviderProfileRepository,
  MerchantProviderVerificationProfileRepository,
} from "@celebix/saas-data";
import type { ProviderTransport } from "@celebix/payment-adapters";
import { createPaymentAdapterRegistry } from "@celebix/payment-adapters";

import {
  createDefaultCustomerPanelPaymentProviderRegistry,
  createDefaultHostedPaymentAdapterRegistry,
} from "../payment-provider-adapters/default.ts";

import {
  registerServerProviderExecutionRuntime,
  resolveServerProviderExecutionRuntime,
} from "./runtime.ts";
import { createCustomerPanelProviderRegistry } from "./registry.ts";

function access(mode: "approved_staging" | "disabled" = "approved_staging") {
  return { readiness: { mode }, panelOrigin: mode === "approved_staging" ? "https://panel.example.test" : null } as never;
}

const reject = async () => { throw new Error("unexpected"); };
const profiles: MerchantProviderProfileRepository & MerchantProviderVerificationProfileRepository = Object.freeze({
  list: reject,
  save: reject,
  saveVerification: reject,
  disable: reject,
  revoke: reject,
});
function keyring(): MerchantProviderCredentialKeyring {
  return Object.freeze({
    activeKeyId: "staging-key-01",
    keys: Object.freeze([Object.freeze({ keyId: "staging-key-01", key: new Uint8Array(32).fill(7) })]),
  });
}

function adapters() {
  const transport: ProviderTransport = Object.freeze({
    request: Object.freeze(async () => { throw new Error("unused"); }),
  });
  const hosted = createDefaultHostedPaymentAdapterRegistry(transport);
  return { hosted, registry: createDefaultCustomerPanelPaymentProviderRegistry(hosted) };
}

test("approved runtime retains the exact executable adapter authority", () => {
  const approved = access();
  const selected = adapters();
  registerServerProviderExecutionRuntime(
    approved,
    profiles,
    keyring(),
    selected.registry,
    selected.hosted,
  );
  const runtime = resolveServerProviderExecutionRuntime(approved);
  assert.ok(runtime);
  assert.strictEqual(runtime.adapters, selected.hosted);
  assert.equal(runtime.adapters.adapter("paytr_iframe")?.packet.adapterVersion, 1);
  assert.equal(runtime.registry.get("paytr_iframe", "payment_processing")?.credentialFields.length, 2);
});

test("registers one frozen approved-staging provider runtime", () => {
  const approved = access();
  const registry = createCustomerPanelProviderRegistry([]);
  registerServerProviderExecutionRuntime(approved, profiles, keyring(), registry, createPaymentAdapterRegistry([], []));
  const runtime = resolveServerProviderExecutionRuntime(approved);
  assert.ok(runtime);
  assert.equal(runtime.access, approved);
  assert.equal(runtime.registry, registry);
  assert.deepEqual(Object.keys(runtime.profiles), ["list", "save", "saveVerification", "disable", "revoke"]);
  assert.equal(Object.isFrozen(runtime), true);
  assert.equal(resolveServerProviderExecutionRuntime(access("disabled")), null);
});

test("runtime rejects missing repository methods and mutable keyrings", () => {
  assert.throws(() => registerServerProviderExecutionRuntime(access(), { list: reject } as never, keyring(), createCustomerPanelProviderRegistry([]), createPaymentAdapterRegistry([], [])), /server_provider_execution_runtime_invalid/);
  const mutableKeyring = { activeKeyId: "staging-key-01", keys: [{ keyId: "staging-key-01", key: new Uint8Array(32) }] } as MerchantProviderCredentialKeyring;
  assert.throws(() => registerServerProviderExecutionRuntime(access(), profiles, mutableKeyring, createCustomerPanelProviderRegistry([]), createPaymentAdapterRegistry([], [])), /server_provider_execution_runtime_invalid/);
});

test("production panel sealing uses the dedicated shared provider keyring instead of quick-order keys", () => {
  const source = readFileSync(new URL("../server-panel-access/postgres-runtime.ts", import.meta.url), "utf8");
  assert.match(source, /parseMerchantProviderCredentialKeyring\(process\.env\)/);
  const registration = /registerServerProviderExecutionRuntime\(([\s\S]*?)\n\s*\);/.exec(source)?.[1] ?? "";
  assert.match(registration, /providerCredentialKeyring,/);
  assert.doesNotMatch(registration, /quickLinksConfig\.keyring,/);
});

test("runtime rejects duplicate access registration and disabled access", () => {
  const approved = access();
  registerServerProviderExecutionRuntime(approved, profiles, keyring(), createCustomerPanelProviderRegistry([]), createPaymentAdapterRegistry([], []));
  assert.throws(() => registerServerProviderExecutionRuntime(approved, profiles, keyring(), createCustomerPanelProviderRegistry([]), createPaymentAdapterRegistry([], [])), /server_provider_execution_runtime_invalid/);
  assert.throws(() => registerServerProviderExecutionRuntime(access("disabled"), profiles, keyring(), createCustomerPanelProviderRegistry([]), createPaymentAdapterRegistry([], [])), /server_provider_execution_runtime_invalid/);
});

test("runtime rejects an executable adapter without its matching payment descriptor", () => {
  const selected = adapters();
  const wrongRegistry = createCustomerPanelProviderRegistry([Object.freeze({
    providerCode: "fixture_provider",
    capability: "marketplace_sync" as const,
    label: "Fixture",
    publicFields: Object.freeze([]),
    credentialFields: Object.freeze([]),
    parsePublicConfig: Object.freeze(() => Object.freeze({})),
    parseCredential: Object.freeze(() => new Uint8Array([1])),
    maskAccountReference: Object.freeze(() => "fixture"),
  })]);
  assert.throws(() => registerServerProviderExecutionRuntime(
    access(),
    profiles,
    keyring(),
    wrongRegistry,
    selected.hosted,
  ), /server_provider_execution_runtime_invalid/);
});
