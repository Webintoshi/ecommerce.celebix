import assert from "node:assert/strict";
import test from "node:test";

import {
  PAYTR_APPROVED_EXECUTION_AUTHORITIES,
  type ProviderTransport,
} from "@celebix/payment-adapters";

import {
  createDefaultCustomerPanelPaymentProviderRegistry,
  createDefaultHostedPaymentAdapterRegistry,
  resolveCustomerPanelPaymentActivationMode,
} from "./default.ts";
import * as customerPanelPaymentDefaults from "./default.ts";

const IYZICO_CANDIDATE = Object.freeze({
  buildMetadataSchemaVersion: 1,
  evidenceSchemaVersion: 1,
  providerCode: "iyzico_iframe",
  capability: "payment_processing",
  environment: "test",
  adapterVersion: 1,
  gitSha: "1".repeat(40),
  sourceDigest: `sha256:${"2".repeat(64)}`,
  candidateExecutionDigest: "sha256:7ecaafb855013a97aa62097126f9ab30b791c805e0b84104a74d67dd19e972cd",
} as const);
const IYZICO_AUTHORITY = Object.freeze({
  environment: "test",
  adapterVersion: 1,
  evidenceDigest: IYZICO_CANDIDATE.candidateExecutionDigest,
} as const);

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
  assert.deepEqual(entry.environments, ["test", "live"]);
  assert.equal(entry.executionAuthority, null);
  assert.deepEqual(entry.publicFields, [
    { key: "merchantId", label: "Mağaza numarası" },
  ]);
  assert.deepEqual(entry.credentialFields, [
    { key: "merchantKey", label: "Mağaza parolası", secret: true },
    { key: "merchantSalt", label: "Mağaza gizli anahtarı", secret: true },
  ]);
  assert.equal(entry.profileSaveMode, "verification");
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

test("PayTR admin entry accepts exact test and live public config and seals only secret fields", () => {
  const registry = createDefaultCustomerPanelPaymentProviderRegistry(
    createDefaultHostedPaymentAdapterRegistry(transport()),
  );
  const entry = registry.get("paytr_iframe", "payment_processing");
  assert.ok(entry);
  for (const environment of ["test", "live"] as const) {
    const publicConfig = entry.parsePublicConfig({ environment, merchantId: "merchant-1234" });
    assert.deepEqual(publicConfig, { environment, merchantId: "merchant-1234" });
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
  }

  assert.throws(
    () => entry.parseCredential(
      { merchantKey: "key-never-return" },
      { environment: "test", merchantId: "merchant-1234" },
    ),
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

test("panel activation mode promotes only the exact PayTR test source authority", () => {
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
  const disabled = createDefaultCustomerPanelPaymentProviderRegistry(
    hosted,
    undefined,
    "disabled",
  );
  assert.equal(disabled.get("paytr_iframe", "payment_processing")?.executionAuthority, null);
  assert.equal(disabled.get("paytr_iframe", "payment_processing")?.profileSaveMode, "verification");

  const explicitNull = createDefaultCustomerPanelPaymentProviderRegistry(
    hosted,
    null,
    "approved_test_sandbox",
  );
  assert.equal(explicitNull.get("paytr_iframe", "payment_processing")?.executionAuthority, null);

  assert.ok(PAYTR_APPROVED_EXECUTION_AUTHORITIES.test, "PayTR test execution authority must be generated");
  assert.equal(PAYTR_APPROVED_EXECUTION_AUTHORITIES.live, null);
  const registry = createDefaultCustomerPanelPaymentProviderRegistry(
    hosted,
    undefined,
    "approved_test_sandbox",
  );
  const paytr = registry.get("paytr_iframe", "payment_processing");
  assert.ok(paytr);
  assert.deepEqual(paytr.executionAuthority, PAYTR_APPROVED_EXECUTION_AUTHORITIES.test);
  assert.notStrictEqual(paytr.executionAuthority, PAYTR_APPROVED_EXECUTION_AUTHORITIES.test);
  assert.equal(Object.isFrozen(paytr.executionAuthority), true);
  assert.equal(paytr.profileSaveMode, "execution_authority");
  assert.deepEqual(paytr.environments, ["test"]);
  assert.throws(
    () => paytr.parsePublicConfig({ environment: "live", merchantId: "merchant-1234" }),
    /customer_panel_payment_adapter_invalid/,
  );
  assert.equal(registry.get("iyzico_iframe", "payment_processing")?.executionAuthority, null);
});

test("customer panel accepts only an exact self-consistent Iyzico build approval", () => {
  const candidate = customerPanelPaymentDefaults as typeof customerPanelPaymentDefaults & {
    resolveIyzicoCompiledExecutionAuthority?: (
      approved?: unknown,
      generated?: unknown,
    ) => Readonly<typeof IYZICO_AUTHORITY> | null;
  };
  assert.equal(typeof candidate.resolveIyzicoCompiledExecutionAuthority, "function");
  const resolve = candidate.resolveIyzicoCompiledExecutionAuthority!;
  assert.equal(resolve(), null);
  assert.equal(resolve(null, IYZICO_CANDIDATE), null);
  assert.equal(resolve(IYZICO_AUTHORITY, null), null);
  const selected = resolve(IYZICO_AUTHORITY, IYZICO_CANDIDATE);
  assert.deepEqual(selected, IYZICO_AUTHORITY);
  assert.notStrictEqual(selected, IYZICO_AUTHORITY);
  assert.equal(Object.isFrozen(selected), true);
  assert.equal(resolve(IYZICO_AUTHORITY, { ...IYZICO_CANDIDATE, providerCode: "paytr_iframe" }), null);
  assert.equal(resolve(IYZICO_AUTHORITY, { ...IYZICO_CANDIDATE, environment: "live" }), null);
  assert.equal(resolve(IYZICO_AUTHORITY, { ...IYZICO_CANDIDATE, adapterVersion: 2 }), null);
  assert.equal(resolve(IYZICO_AUTHORITY, { ...IYZICO_CANDIDATE, unexpected: true }), null);
  assert.equal(resolve(IYZICO_AUTHORITY, new Proxy({ ...IYZICO_CANDIDATE }, {})), null);
  assert.equal(resolve({ ...IYZICO_AUTHORITY, evidenceDigest: `sha256:${"4".repeat(64)}` }, IYZICO_CANDIDATE), null);
});

test("customer panel promotes only the exact future Iyzico binding to test execution authority", () => {
  const hosted = createDefaultHostedPaymentAdapterRegistry(transport());
  const registry = (createDefaultCustomerPanelPaymentProviderRegistry as unknown as (
    hostedRegistry: Parameters<typeof createDefaultCustomerPanelPaymentProviderRegistry>[0],
    paytrAuthority: null,
    paytrMode: "approved_test_sandbox",
    iyzicoApproval: unknown,
    iyzicoBuild: unknown,
  ) => ReturnType<typeof createDefaultCustomerPanelPaymentProviderRegistry>)(
    hosted,
    null,
    "approved_test_sandbox",
    IYZICO_AUTHORITY,
    IYZICO_CANDIDATE,
  );
  const iyzico = registry.get("iyzico_iframe", "payment_processing");
  assert.ok(iyzico);
  assert.deepEqual(iyzico.environments, ["test"]);
  assert.deepEqual(iyzico.executionAuthority, IYZICO_AUTHORITY);
  assert.notStrictEqual(iyzico.executionAuthority, IYZICO_AUTHORITY);
  assert.equal(Object.isFrozen(iyzico.executionAuthority), true);
  assert.equal(iyzico.profileSaveMode, "execution_authority");
  assert.throws(() => iyzico.parsePublicConfig({ environment: "live" }), /customer_panel_payment_adapter_invalid/);
  assert.equal(registry.get("paytr_iframe", "payment_processing")?.executionAuthority, null);
});
