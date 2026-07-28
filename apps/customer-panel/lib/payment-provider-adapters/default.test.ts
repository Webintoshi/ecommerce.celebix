import assert from "node:assert/strict";
import test from "node:test";

import type { ProviderTransport } from "@celebix/payment-adapters";

import {
  createDefaultCustomerPanelPaymentProviderRegistry,
  createDefaultHostedPaymentAdapterRegistry,
  resolveCustomerPanelPaymentActivationMode,
} from "./default.ts";

function transport(): ProviderTransport {
  return Object.freeze({
    request: Object.freeze(async () => {
      throw new Error("provider_transport_must_not_run_during_registry_assembly");
    }),
  });
}

test("default hosted composition exposes exact PayTR and configurable Iyzico descriptors", () => {
  const hosted = createDefaultHostedPaymentAdapterRegistry(transport());
  const registry = createDefaultCustomerPanelPaymentProviderRegistry(hosted);

  assert.equal(hosted.size, 2);
  assert.equal(hosted.packet("paytr_iframe")?.adapterVersion, 1);
  assert.equal(hosted.packet("iyzico_iframe")?.adapterVersion, 1);
  assert.equal(registry.size, 2);
  assert.deepEqual(registry.codes("payment_processing"), ["iyzico_iframe", "paytr_iframe"]);
  const entry = registry.get("paytr_iframe", "payment_processing");
  assert.ok(entry);
  assert.equal(entry.adapterVersion, 1);
  assert.deepEqual(entry.environments, ["test"]);
  assert.equal(entry.executionAuthority, null);
  assert.deepEqual(entry.publicFields, [
    { key: "merchantId", label: "Mağaza numarası" },
  ]);
  assert.deepEqual(entry.credentialFields, [
    { key: "merchantKey", label: "Mağaza parolası", secret: true },
    { key: "merchantSalt", label: "Mağaza gizli anahtarı", secret: true },
  ]);
  assert.equal(entry.profileSaveMode, "execution_authority");
  const iyzico = registry.get("iyzico_iframe", "payment_processing");
  assert.ok(iyzico);
  assert.equal(iyzico.label, "iyzico · Checkout Form");
  assert.equal(iyzico.adapterVersion, 1);
  assert.deepEqual(iyzico.environments, ["test", "live"]);
  assert.equal(iyzico.executionAuthority, null);
  assert.equal(iyzico.profileSaveMode, "verification");
  assert.deepEqual(iyzico.publicFields, []);
  assert.deepEqual(iyzico.credentialFields, [
    { key: "apiKey", label: "API Key", secret: true },
    { key: "secretKey", label: "Secret Key", secret: true },
  ]);
  assert.equal(registry.get("paytr", "payment_processing"), null);
  assert.equal(registry.get("paytr_iframe", "marketplace_sync"), null);
});

test("Iyzico admin entry keeps environment public and seals exact credentials without a secret-derived label", () => {
  const registry = createDefaultCustomerPanelPaymentProviderRegistry(
    createDefaultHostedPaymentAdapterRegistry(transport()),
  );
  const entry = registry.get("iyzico_iframe", "payment_processing");
  assert.ok(entry);
  for (const environment of ["test", "live"] as const) {
    const publicConfig = entry.parsePublicConfig({ environment });
    assert.deepEqual(publicConfig, { environment });
    assert.equal(entry.maskAccountReference(publicConfig), `iyzico ${environment} hesabı`);
    const credential = entry.parseCredential({
      apiKey: "api-key-never-return",
      secretKey: "secret-key-never-return",
    }, publicConfig);
    const text = new TextDecoder().decode(credential);
    assert.deepEqual(JSON.parse(text), {
      apiKey: "api-key-never-return",
      secretKey: "secret-key-never-return",
    });
    assert.doesNotMatch(entry.maskAccountReference(publicConfig), /return|\.\.\.|…|key/i);
    credential.fill(0);
  }
  assert.throws(
    () => entry.parsePublicConfig({ environment: "test", apiKey: "must-not-be-public" }),
    /customer_panel_payment_adapter_invalid/,
  );
  assert.throws(
    () => entry.parseCredential({ apiKey: "only-one-field" }, { environment: "test" }),
    /customer_panel_payment_adapter_invalid/,
  );
});

test("PayTR admin entry accepts only test public config and seals only secret fields", () => {
  const registry = createDefaultCustomerPanelPaymentProviderRegistry(
    createDefaultHostedPaymentAdapterRegistry(transport()),
  );
  const entry = registry.get("paytr_iframe", "payment_processing");
  assert.ok(entry);
  const publicConfig = entry.parsePublicConfig({ environment: "test", merchantId: "merchant-1234" });
  assert.deepEqual(publicConfig, { environment: "test", merchantId: "merchant-1234" });
  assert.equal(entry.maskAccountReference(publicConfig), "paytr…1234");

  const credential = entry.parseCredential({
    merchantKey: "key-never-return",
    merchantSalt: "salt-never-return",
  }, publicConfig);
  const text = new TextDecoder().decode(credential);
  assert.deepEqual(JSON.parse(text), {
    merchantKey: "key-never-return",
    merchantSalt: "salt-never-return",
  });
  assert.doesNotMatch(text, /merchant-1234/);
  credential.fill(0);

  assert.throws(
    () => entry.parsePublicConfig({ environment: "live", merchantId: "merchant-1234" }),
    /customer_panel_payment_adapter_invalid/,
  );
  assert.throws(
    () => entry.parseCredential({ merchantKey: "key-never-return" }, publicConfig),
    /customer_panel_payment_adapter_invalid/,
  );
});

test("default assembly never discovers providers or credentials from environment", () => {
  const original = process.env.PAYTR_MERCHANT_KEY;
  process.env.PAYTR_MERCHANT_KEY = "environment-secret-must-be-ignored";
  try {
    const registry = createDefaultCustomerPanelPaymentProviderRegistry(
      createDefaultHostedPaymentAdapterRegistry(transport()),
    );
    assert.equal(registry.size, 2);
    assert.doesNotMatch(JSON.stringify(registry.get("paytr_iframe", "payment_processing")), /environment-secret/);
  } finally {
    if (original === undefined) delete process.env.PAYTR_MERCHANT_KEY;
    else process.env.PAYTR_MERCHANT_KEY = original;
  }
});

test("panel activation mode cannot make verification or null authority connectable", () => {
  assert.equal(resolveCustomerPanelPaymentActivationMode({}), "disabled");
  assert.equal(
    resolveCustomerPanelPaymentActivationMode({
      CELEBIX_PAYTR_IFRAME_PANEL_MODE: "approved_test_sandbox",
    }),
    "approved_test_sandbox",
  );
  for (const value of ["enabled", "approved_test_validation", " approved_test_sandbox", "approved_test_sandbox "]) {
    assert.equal(
      resolveCustomerPanelPaymentActivationMode({
        CELEBIX_PAYTR_IFRAME_PANEL_MODE: value,
      }),
      "disabled",
    );
  }

  const hosted = createDefaultHostedPaymentAdapterRegistry(transport());
  const registry = createDefaultCustomerPanelPaymentProviderRegistry(
    hosted,
    null,
    "approved_test_sandbox",
  );
  assert.equal(registry.get("paytr_iframe", "payment_processing")?.executionAuthority, null);
  assert.equal(registry.get("iyzico_iframe", "payment_processing")?.executionAuthority, null);
});
