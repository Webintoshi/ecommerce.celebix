import assert from "node:assert/strict";
import test from "node:test";

import {
  createCustomerPanelProviderRegistry,
  type MerchantProviderRegistryEntry,
} from "./registry.ts";

function entry(overrides: Partial<MerchantProviderRegistryEntry> = {}): MerchantProviderRegistryEntry {
  return Object.freeze({
    providerCode: "fixture_provider",
    capability: "marketplace_sync",
    label: "Fixture Provider",
    publicFields: Object.freeze([Object.freeze({ key: "account_reference", label: "Merchant account" })]),
    credentialFields: Object.freeze([Object.freeze({ key: "api_secret", label: "API secret", secret: true as const })]),
    parsePublicConfig(value: unknown) { return Object.freeze(value as Record<string, string>); },
    parseCredential(value: unknown) { return new TextEncoder().encode(JSON.stringify(value)); },
    maskAccountReference() { return "••••nt-42"; },
    ...overrides,
  });
}

test("default customer-panel provider registry is frozen and empty", () => {
  const registry = createCustomerPanelProviderRegistry([]);
  assert.equal(registry.size, 0);
  assert.equal(registry.get("fixture_provider", "marketplace_sync"), null);
  assert.equal(Object.isFrozen(registry), true);
});

test("registry returns a safe frozen descriptor entry", () => {
  const selected = entry();
  const registry = createCustomerPanelProviderRegistry([selected]);
  assert.equal(registry.size, 1);
  assert.equal(registry.get("fixture_provider", "marketplace_sync"), selected);
  assert.equal(registry.get("fixture_provider", "email_delivery"), null);
});

test("registry rejects duplicates and overlapping field keys", () => {
  assert.throws(() => createCustomerPanelProviderRegistry([entry(), entry()]), /customer_panel_provider_registry_invalid/);
  assert.throws(() => createCustomerPanelProviderRegistry([entry({
    credentialFields: Object.freeze([Object.freeze({ key: "account_reference", label: "Secret", secret: true })]),
  })]), /customer_panel_provider_registry_invalid/);
});

test("registry rejects mutable entries and non-secret credential fields", () => {
  assert.throws(() => createCustomerPanelProviderRegistry([{ ...entry() }]), /customer_panel_provider_registry_invalid/);
  assert.throws(() => createCustomerPanelProviderRegistry([entry({
    credentialFields: Object.freeze([Object.freeze({ key: "api_secret", label: "Secret", secret: false as never })]),
  })]), /customer_panel_provider_registry_invalid/);
});

test("registry rejects reused access objects and callable getters", () => {
  const shared = Object.freeze({ key: "account_reference", label: "Account" });
  assert.throws(() => createCustomerPanelProviderRegistry([entry({
    publicFields: Object.freeze([shared, shared]),
  })]), /customer_panel_provider_registry_invalid/);
  const hostile = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(hostile, "providerCode", { enumerable: true, get() { throw new Error("getter"); } });
  assert.throws(() => createCustomerPanelProviderRegistry([hostile as never]), /customer_panel_provider_registry_invalid/);
});
