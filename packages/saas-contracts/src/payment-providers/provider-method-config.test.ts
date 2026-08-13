import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultProviderPaymentMethodConfig,
  parseProviderPaymentMethodConfig,
} from "./provider-method-config.ts";
import * as payments from "./index.ts";
import * as root from "../index.ts";

const valid = () => ({
  environment: "test" as const,
  locale: "tr" as const,
  threeDSecure: "provider_managed" as const,
  installmentMode: "all" as const,
  maxInstallment: 0 as const,
});

function assertInvalid(action: () => unknown): void {
  assert.throws(action, (error: unknown) => error instanceof TypeError
    && error.message === "provider_payment_method_config_invalid");
}

test("provider preferences expose immutable PayTR and iyzico defaults from both entrypoints", () => {
  for (const providerCode of ["paytr_iframe", "iyzico_iframe"] as const) {
    const selected = defaultProviderPaymentMethodConfig(providerCode, "test");
    assert.deepEqual(selected, valid());
    assert.equal(Object.isFrozen(selected), true);
    assert.deepEqual(defaultProviderPaymentMethodConfig(providerCode, "live"), {
      ...valid(), environment: "live",
    });
  }
  assert.equal(payments.parseProviderPaymentMethodConfig, parseProviderPaymentMethodConfig);
  assert.equal(root.parseProviderPaymentMethodConfig, parseProviderPaymentMethodConfig);
});

test("strict parsing returns a copied frozen provider preference object", () => {
  const source: {
    environment: "test";
    locale: "tr" | "en";
    threeDSecure: "provider_managed";
    installmentMode: "all";
    maxInstallment: 0;
  } = { ...valid(), locale: "en" };
  const selected = parseProviderPaymentMethodConfig("iyzico_iframe", source);
  assert.deepEqual(selected, source);
  assert.notEqual(selected, source);
  assert.equal(Object.isFrozen(selected), true);
  source.locale = "tr";
  assert.equal(selected.locale, "en");
});

test("provider-specific locale authority rejects unsupported PayTR English", () => {
  assertInvalid(() => parseProviderPaymentMethodConfig("paytr_iframe", {
    ...valid(),
    locale: "en",
  }));
  assert.deepEqual(parseProviderPaymentMethodConfig("iyzico_iframe", {
    ...valid(),
    locale: "en",
  }), {
    ...valid(),
    locale: "en",
  });
});

test("supported installment modes require canonical matching max installment values", () => {
  for (const providerCode of ["paytr_iframe", "iyzico_iframe"] as const) {
    assert.deepEqual(parseProviderPaymentMethodConfig(providerCode, valid()), valid());
    assert.deepEqual(parseProviderPaymentMethodConfig(providerCode, {
      ...valid(), installmentMode: "single_payment", maxInstallment: 0,
    }), { ...valid(), installmentMode: "single_payment", maxInstallment: 0 });
    for (const maxInstallment of [2, 3, 6, 9, 12] as const) {
      assert.deepEqual(parseProviderPaymentMethodConfig(providerCode, {
        ...valid(), installmentMode: "limited", maxInstallment,
      }), { ...valid(), installmentMode: "limited", maxInstallment });
    }
  }
});

test("unknown providers, fields, enum values and incoherent installments fail closed", () => {
  for (const hostile of [
    { ...valid(), environment: "sandbox" },
    { ...valid(), locale: "auto" },
    { ...valid(), threeDSecure: "disabled" },
    { ...valid(), installmentMode: "limited", maxInstallment: 1 },
    { ...valid(), installmentMode: "limited", maxInstallment: 4 },
    { ...valid(), installmentMode: "all", maxInstallment: 3 },
    { ...valid(), installmentMode: "single_payment", maxInstallment: 12 },
    { ...valid(), extra: true },
    Object.assign(Object.create(null), valid()),
    Object.freeze(Object.defineProperty({ ...valid() }, "locale", {
      enumerable: true,
      get: () => "tr",
    })),
  ]) {
    assertInvalid(() => parseProviderPaymentMethodConfig("paytr_iframe", hostile));
  }
  for (const providerCode of ["stripe", "paytr", "", "PAYTR_IFRAME", null]) {
    assertInvalid(() => parseProviderPaymentMethodConfig(providerCode as never, valid()));
    assertInvalid(() => defaultProviderPaymentMethodConfig(providerCode as never, "test"));
  }
});

test("preferences do not accept arrays, proxies, symbols or inherited data", () => {
  assertInvalid(() => parseProviderPaymentMethodConfig("iyzico_iframe", []));
  assertInvalid(() => parseProviderPaymentMethodConfig("iyzico_iframe", null));
  assertInvalid(() => parseProviderPaymentMethodConfig("iyzico_iframe", new Proxy(valid(), {
    ownKeys() { throw new Error("hostile"); },
  })));
  const symbol = { ...valid(), [Symbol("secret")]: "value" };
  assertInvalid(() => parseProviderPaymentMethodConfig("iyzico_iframe", symbol));
  const inherited = Object.create({ hidden: true });
  Object.assign(inherited, valid());
  assertInvalid(() => parseProviderPaymentMethodConfig("iyzico_iframe", inherited));
});
