import assert from "node:assert/strict";
import test from "node:test";

type PaymentProviderModule = typeof import("./index.ts");
type RootModule = typeof import("../index.ts");

const payments = await import("./index.ts").catch(() => ({} as Partial<PaymentProviderModule>));
const root = await import("../index.ts");

const METHOD_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-07-27T10:30:00.000Z";

function catalogFixture() {
  return {
    providerCode: "paytr_iframe",
    familyCode: "paytr",
    modeCode: "iframe",
    sourceSlug: "paytr-iframe",
    label: "PayTR",
    modeLabel: "iFrame",
    category: "payment_institution",
    interactionMode: "iframe",
    readiness: "planned",
    executionAuthority: null,
    support: {
      threeDSecure: "unknown",
      installments: "unknown",
      refund: "unknown",
      cancel: "unknown",
      capture: "unknown",
    },
    logoPath: "/payment-providers/paytr.svg",
    aliases: ["pay tr"],
    environments: ["test", "live"],
  };
}

function providerMethodFixture() {
  return {
    id: METHOD_ID,
    kind: "provider",
    profileId: PROFILE_ID,
    providerCode: "paytr_iframe",
    label: "Kredi veya banka kartı",
    state: "active",
    emergencyReason: null,
    position: 10,
    config: { checkoutDescription: "PayTR güvenli ödeme" },
    version: 3,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

test("payment provider contract module exports the finite public vocabulary", () => {
  assert.equal(typeof payments.parsePaymentProviderCatalogEntry, "function");
  assert.equal(typeof payments.parsePaymentProviderCatalog, "function");
  assert.equal(typeof payments.parseMerchantPaymentMethod, "function");
  assert.equal(typeof payments.parsePaymentMethodMutationResult, "function");
  assert.equal(typeof payments.parsePaymentMethodReorderResult, "function");
  assert.deepEqual(payments.PAYMENT_PROVIDER_READINESS, [
    "production_ready", "sandbox_ready", "verification", "planned", "maintenance",
  ]);
  assert.deepEqual(payments.PAYMENT_PROVIDER_INTERACTION_MODES, [
    "redirect", "iframe", "tokenized", "direct_pos", "wallet", "offline",
  ]);
  assert.deepEqual(payments.PAYMENT_METHOD_STATES, ["active", "disabled", "emergency_disabled"]);
  assert.deepEqual(payments.PAYMENT_METHOD_KINDS, ["provider", "cash_on_delivery", "bank_transfer"]);
});

test("catalog parser returns a deeply frozen exact safe entry", () => {
  const parsed = payments.parsePaymentProviderCatalogEntry!(catalogFixture());
  assert.equal(parsed.providerCode, "paytr_iframe");
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.support), true);
  assert.equal(Object.isFrozen(parsed.aliases), true);
  assert.equal(Object.isFrozen(parsed.environments), true);
  assert.equal(parsed.executionAuthority, null);
  assert.deepEqual(parsed.support, {
    threeDSecure: "unknown",
    installments: "unknown",
    refund: "unknown",
    cancel: "unknown",
    capture: "unknown",
  });
});

test("catalog parser rejects hidden authority ambiguity and executable dummy data", () => {
  const valid = catalogFixture();
  let invoked = false;
  const getter = { ...valid };
  Object.defineProperty(getter, "label", {
    enumerable: true,
    get() {
      invoked = true;
      return "PayTR";
    },
  });
  const sparseAliases = new Array(1);
  const namedAliases = ["pay tr"] as string[] & { hidden?: string };
  namedAliases.hidden = "x";
  const symbolRoot = { ...valid, [Symbol("hidden")]: "x" };
  for (const hostile of [
    { ...valid, storeId: METHOD_ID },
    { ...valid, providerCode: "dummy_payment" },
    { ...valid, sourceSlug: "dummy-payment" },
    { ...valid, providerCode: "Paytr" },
    { ...valid, familyCode: "pay-tr" },
    { ...valid, logoPath: "https://provider.test/logo.svg" },
    { ...valid, logoPath: "/payment-providers/../private.svg" },
    { ...valid, category: "crypto" },
    { ...valid, interactionMode: "post_form" },
    { ...valid, readiness: "ready" },
    { ...valid, readiness: "sandbox_ready" },
    { ...valid, readiness: "sandbox_ready", executionAuthority: { environment: "test", adapterVersion: 1, evidenceDigest: "sha256:test-only-fixture" } },
    { ...valid, readiness: "sandbox_ready", executionAuthority: { environment: "live", adapterVersion: 1, evidenceDigest: `sha256:${"a".repeat(64)}` } },
    { ...valid, readiness: "production_ready", executionAuthority: { environment: "test", adapterVersion: 1, evidenceDigest: `sha256:${"a".repeat(64)}` } },
    { ...valid, readiness: "planned", executionAuthority: { environment: "test", adapterVersion: 1, evidenceDigest: `sha256:${"a".repeat(64)}` } },
    { ...valid, aliases: ["pay tr", "pay tr"] },
    { ...valid, aliases: sparseAliases },
    { ...valid, aliases: namedAliases },
    { ...valid, environments: ["live", "live"] },
    { ...valid, support: { ...valid.support, cardToken: "unknown" } },
    { ...valid, support: { ...valid.support, refund: "maybe" } },
    getter,
    symbolRoot,
    Object.assign(Object.create(null), valid),
  ]) {
    assert.throws(
      () => payments.parsePaymentProviderCatalogEntry!(hostile),
      /payment_provider_contract_invalid/,
    );
  }
  assert.equal(invoked, false);
});

test("catalog parser accepts only exact real-digest environment readiness authority", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  const sandbox = payments.parsePaymentProviderCatalogEntry!({
    ...catalogFixture(), readiness: "sandbox_ready", executionAuthority: {
      environment: "test", adapterVersion: 1, evidenceDigest: digest,
    },
  });
  const production = payments.parsePaymentProviderCatalogEntry!({
    ...catalogFixture(), readiness: "production_ready", executionAuthority: {
      environment: "live", adapterVersion: 1, evidenceDigest: digest,
    },
  });
  assert.deepEqual(sandbox.executionAuthority, { environment: "test", adapterVersion: 1, evidenceDigest: digest });
  assert.deepEqual(production.executionAuthority, { environment: "live", adapterVersion: 1, evidenceDigest: digest });
  assert.equal(Object.isFrozen(sandbox.executionAuthority), true);
});

test("catalog collection is bounded dense copied and deeply frozen", () => {
  const source = [catalogFixture()];
  const parsed = payments.parsePaymentProviderCatalog!(source);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed[0]), true);
  source[0]!.label = "Changed";
  assert.equal(parsed[0]!.label, "PayTR");

  assert.throws(
    () => payments.parsePaymentProviderCatalog!(Array.from({ length: 101 }, catalogFixture)),
    /payment_provider_contract_invalid/,
  );
  assert.throws(
    () => payments.parsePaymentProviderCatalog!(new Array(1)),
    /payment_provider_contract_invalid/,
  );
});

test("payment method parser enforces provider and built-in identity shapes", () => {
  const provider = payments.parseMerchantPaymentMethod!(providerMethodFixture());
  const builtIn = payments.parseMerchantPaymentMethod!({
    ...providerMethodFixture(),
    kind: "cash_on_delivery",
    profileId: null,
    providerCode: null,
    label: "Kapıda ödeme",
    config: {},
  });
  assert.equal(provider.providerCode, "paytr_iframe");
  assert.equal(builtIn.profileId, null);
  assert.equal(Object.isFrozen(provider), true);
  assert.equal(Object.isFrozen(provider.config), true);

  for (const hostile of [
    { ...providerMethodFixture(), profileId: null },
    { ...providerMethodFixture(), providerCode: null },
    { ...providerMethodFixture(), kind: "cash_on_delivery" },
    { ...providerMethodFixture(), state: "emergency_disabled", emergencyReason: null },
    { ...providerMethodFixture(), state: "active", emergencyReason: "Şüpheli trafik" },
    { ...providerMethodFixture(), position: -1 },
    { ...providerMethodFixture(), position: 10_000 },
    { ...providerMethodFixture(), config: { apiKey: "private" } },
    { ...providerMethodFixture(), updatedAt: "2026-07-27T10:29:59.999Z" },
    { ...providerMethodFixture(), storeId: METHOD_ID },
  ]) {
    assert.throws(
      () => payments.parseMerchantPaymentMethod!(hostile),
      /payment_provider_contract_invalid/,
    );
  }
});

test("payment method mutation and reorder results stay exact and replay coherent", () => {
  const mutation = {
    id: METHOD_ID,
    state: "active",
    position: 10,
    version: 4,
    updatedAt: NOW,
    replayed: false,
  };
  const parsed = payments.parsePaymentMethodMutationResult!(mutation);
  const reordered = payments.parsePaymentMethodReorderResult!({
    items: [mutation, { ...mutation, id: PROFILE_ID, position: 20 }],
    replayed: false,
  });
  assert.equal(parsed.version, 4);
  assert.equal(Object.isFrozen(reordered), true);
  assert.equal(Object.isFrozen(reordered.items), true);
  assert.equal(Object.isFrozen(reordered.items[0]), true);

  for (const hostile of [
    { ...mutation, replayed: "false" },
    { ...mutation, version: 0 },
    { ...mutation, operationId: METHOD_ID },
  ]) {
    assert.throws(
      () => payments.parsePaymentMethodMutationResult!(hostile),
      /payment_provider_contract_invalid/,
    );
  }
  assert.throws(
    () => payments.parsePaymentMethodReorderResult!({
      items: [{ ...mutation, replayed: true }],
      replayed: false,
    }),
    /payment_provider_contract_invalid/,
  );
});

test("root contract exports expose the payment vocabulary and parsers", () => {
  const selected = root as Partial<RootModule> & Record<string, unknown>;
  for (const key of [
    "PAYMENT_PROVIDER_READINESS",
    "PAYMENT_PROVIDER_INTERACTION_MODES",
    "PAYMENT_METHOD_STATES",
    "PAYMENT_METHOD_KINDS",
    "parsePaymentProviderCatalogEntry",
    "parsePaymentProviderCatalog",
    "parseMerchantPaymentMethod",
    "parsePaymentMethodMutationResult",
    "parsePaymentMethodReorderResult",
  ]) assert.notEqual(selected[key], undefined, key);
});
