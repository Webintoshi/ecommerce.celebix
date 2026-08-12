import assert from "node:assert/strict";
import test from "node:test";

import type { MerchantPaymentMethod } from "@celebix/saas-contracts";

import {
  buildProviderCheckoutPreferenceCommand,
  buildProviderCheckoutPreferenceSummary,
  buildProviderCheckoutPreferenceView,
} from "./provider-preferences.ts";

const NOW = "2026-08-12T12:00:00.000Z";

function method(overrides: Partial<MerchantPaymentMethod> = {}): MerchantPaymentMethod {
  return Object.freeze({
    id: "40000000-0000-4000-8000-000000000091",
    kind: "provider" as const,
    profileId: "40000000-0000-4000-8000-000000000092",
    providerCode: "paytr_iframe",
    label: "PayTR · iFrame",
    state: "active" as const,
    emergencyReason: null,
    position: 0,
    config: Object.freeze({
      environment: "test",
      locale: "tr",
      threeDSecure: "provider_managed",
      installmentMode: "all",
      maxInstallment: 0,
    }),
    version: 7,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

test("provider checkout preference view exposes only executable persisted authority", () => {
  const view = buildProviderCheckoutPreferenceView(method());
  assert.deepEqual(view, {
    methodId: "40000000-0000-4000-8000-000000000091",
    providerCode: "paytr_iframe",
    providerLabel: "PayTR",
    environment: "test",
    environmentLabel: "Test ortamı",
    locale: "tr",
    threeDSecureLabel: "Sağlayıcı yönetir",
    installmentMode: "all",
    maxInstallment: 0,
  });
  assert.equal(Object.isFrozen(view), true);
});

test("provider checkout preference command preserves immutable method authority", () => {
  const selected = method();
  const command = buildProviderCheckoutPreferenceCommand(selected, {
    locale: "en",
    installmentMode: "limited",
    maxInstallment: 6,
  });
  assert.deepEqual(command, {
    methodId: selected.id,
    expectedVersion: selected.version,
    kind: "provider",
    profileId: selected.profileId,
    providerCode: selected.providerCode,
    label: selected.label,
    config: {
      environment: "test",
      locale: "en",
      threeDSecure: "provider_managed",
      installmentMode: "limited",
      maxInstallment: 6,
    },
  });
  assert.equal(Object.isFrozen(command), true);
  assert.equal(Object.isFrozen(command.config), true);
});

test("provider checkout preference summary is honest about provider-owned language and bounded installments", () => {
  assert.deepEqual(buildProviderCheckoutPreferenceSummary(method({
    config: Object.freeze({
      environment: "live",
      locale: "en",
      threeDSecure: "provider_managed",
      installmentMode: "limited",
      maxInstallment: 9,
    }),
  })), {
    label: "Dil sağlayıcıda · En fazla 9 taksit · 3D sağlayıcıda",
    environmentLabel: "Canlı ortam",
  });
  assert.deepEqual(buildProviderCheckoutPreferenceSummary(method({
    providerCode: "iyzico_iframe",
    label: "iyzico · Checkout Form",
    config: Object.freeze({
      environment: "test",
      locale: "en",
      threeDSecure: "provider_managed",
      installmentMode: "single_payment",
      maxInstallment: 0,
    }),
  })), {
    label: "English · Tek çekim · 3D sağlayıcıda",
    environmentLabel: "Test ortamı",
  });
});

test("single and unrestricted installments canonicalize maximum installment to zero", () => {
  for (const installmentMode of ["all", "single_payment"] as const) {
    const command = buildProviderCheckoutPreferenceCommand(method(), {
      locale: "tr",
      installmentMode,
      maxInstallment: 12,
    });
    assert.equal(command.config.maxInstallment, 0);
    assert.equal(command.config.installmentMode, installmentMode);
  }
});

test("non-provider, unknown-provider and corrupt persisted preferences fail closed", () => {
  assert.throws(() => buildProviderCheckoutPreferenceView(method({
    kind: "bank_transfer",
    profileId: null,
    providerCode: null,
  })), /provider_checkout_preferences_invalid/);
  assert.throws(() => buildProviderCheckoutPreferenceView(method({
    providerCode: "unknown_iframe",
  })), /provider_checkout_preferences_invalid/);
  assert.throws(() => buildProviderCheckoutPreferenceView(method({
    config: Object.freeze({ environment: "test" }),
  })), /provider_checkout_preferences_invalid/);
  assert.throws(() => buildProviderCheckoutPreferenceCommand(method(), {
    locale: "tr",
    installmentMode: "limited",
    maxInstallment: 0,
  }), /provider_checkout_preferences_invalid/);
});
