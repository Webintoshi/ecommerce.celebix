import assert from "node:assert/strict";
import test from "node:test";

import type {
  MerchantPaymentMethod,
  MerchantProviderDescriptor,
  MerchantProviderProfile,
  PaymentProviderCatalogEntry,
} from "@celebix/saas-contracts";

import { PAYMENT_PROVIDER_CATALOG } from "../payment-providers/catalog.ts";
import { buildPaymentSettingsViewModel } from "./model.ts";

const NOW = "2026-07-27T12:00:00.000Z";
const PROFILE_ID = "40000000-0000-4000-8000-000000000001";

function method(
  id: string,
  state: MerchantPaymentMethod["state"],
  position: number,
  label = "Kredi Kartı",
): MerchantPaymentMethod {
  return {
    id,
    kind: "provider",
    profileId: PROFILE_ID,
    providerCode: "paytr_iframe",
    label,
    state,
    emergencyReason: state === "emergency_disabled" ? "Operasyon kontrolü" : null,
    position,
    config: { environment: "test" },
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function profile(status: MerchantProviderProfile["status"]): MerchantProviderProfile {
  return {
    id: PROFILE_ID,
    providerCode: "paytr_iframe",
    capability: "payment_processing",
    publicConfig: { environment: "test" },
    maskedAccountReference: "••••1234",
    status,
    credentialVersion: 1,
    version: 1,
    lastValidatedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const noFilters = Object.freeze({
  category: "all",
  interactionMode: "all",
  readiness: "all",
  environment: "all",
} as const);

test("payment settings model keeps all 58 entries visible and supports Turkish accent-tolerant search", () => {
  const all = buildPaymentSettingsViewModel(PAYMENT_PROVIDER_CATALOG, [], [], [], "", noFilters);
  assert.equal(all.catalog.totalCount, 58);
  assert.equal(all.catalog.visibleCount, 58);
  assert.equal(all.catalog.cards.length, 58);

  const searched = buildPaymentSettingsViewModel(PAYMENT_PROVIDER_CATALOG, [], [], [], "is bankasi", noFilters);
  assert(searched.catalog.cards.length > 0);
  assert(searched.catalog.cards.some((card) => /İş|Is/i.test(`${card.label} ${card.aliases.join(" ")}`)));

  const alias = PAYMENT_PROVIDER_CATALOG.find((entry) => entry.aliases.length > 0);
  assert(alias);
  const aliasSearch = buildPaymentSettingsViewModel(
    PAYMENT_PROVIDER_CATALOG, [], [], [], alias.aliases[0]!.toUpperCase(), noFilters,
  );
  assert(aliasSearch.catalog.cards.some((card) => card.providerCode === alias.providerCode));
});

test("payment settings model filters category, mode, readiness and environment together", () => {
  const matching = PAYMENT_PROVIDER_CATALOG.find((entry) => entry.environments.includes("live"));
  assert(matching);
  const filters = Object.freeze({
    category: matching.category,
    interactionMode: matching.interactionMode,
    readiness: matching.readiness,
    environment: "live",
  });
  const view = buildPaymentSettingsViewModel(PAYMENT_PROVIDER_CATALOG, [], [], [], "", filters);
  assert(view.catalog.cards.length > 0);
  assert(view.catalog.cards.every((card) =>
    card.category === filters.category
    && card.interactionMode === filters.interactionMode
    && card.readiness === filters.readiness
    && card.environments.includes(filters.environment),
  ));
  assert.equal(view.catalog.families.reduce((sum, family) => sum + family.modes.length, 0), view.catalog.cards.length);
});

test("only ready catalog entries with an exact payment descriptor become connectable", () => {
  const base = PAYMENT_PROVIDER_CATALOG[0]!;
  const ready: PaymentProviderCatalogEntry = { ...base, readiness: "sandbox_ready" };
  const planned: PaymentProviderCatalogEntry = { ...PAYMENT_PROVIDER_CATALOG[1]!, readiness: "planned" };
  const descriptor: MerchantProviderDescriptor = {
    providerCode: ready.providerCode,
    capability: "payment_processing",
    label: ready.label,
    publicFields: [{ key: "merchant_id", label: "Mağaza numarası" }],
    credentialFields: [{ key: "api_secret", label: "API parolası", secret: true }],
  };
  const wrongCapability: MerchantProviderDescriptor = {
    ...descriptor,
    providerCode: planned.providerCode,
    capability: "marketplace_sync",
  };
  const view = buildPaymentSettingsViewModel(
    [ready, planned], [descriptor, wrongCapability], [], [], "", noFilters,
  );
  const readyCard = view.catalog.cards.find((card) => card.providerCode === ready.providerCode);
  const plannedCard = view.catalog.cards.find((card) => card.providerCode === planned.providerCode);
  assert.equal(readyCard?.connectable, true);
  assert.equal(readyCard?.actionLabel, "Bağla");
  assert.equal(readyCard?.executableDescriptor?.credentialFields[0]?.key, "api_secret");
  assert.equal(plannedCard?.connectable, false);
  assert.equal(plannedCard?.actionLabel, "Hazırlanıyor");
  assert.equal(plannedCard?.executableDescriptor, null);
  assert.doesNotMatch(JSON.stringify(plannedCard), /api_secret|API parolası/);
});

test("method/profile statuses, real counts and active checkout preview are deterministic", () => {
  const methods = [
    method("40000000-0000-4000-8000-000000000004", "active", 3, "Sonra"),
    method("40000000-0000-4000-8000-000000000003", "active", 1, "Önce"),
    method("40000000-0000-4000-8000-000000000005", "disabled", 0, "Kapalı"),
    method("40000000-0000-4000-8000-000000000006", "emergency_disabled", 2, "Acil"),
  ];
  const view = buildPaymentSettingsViewModel(PAYMENT_PROVIDER_CATALOG, [], [profile("pending_validation")], methods, "", noFilters);
  assert.deepEqual(view.counts, {
    methods: 4,
    activeMethods: 2,
    emergencyMethods: 1,
    profiles: 1,
    pendingProfiles: 1,
  });
  assert.deepEqual(view.checkoutPreview.map(({ label }) => label), ["Önce", "Sonra"]);
  assert.equal(view.methods.find(({ state }) => state === "active")?.stateLabel, "Etkin");
  assert.equal(view.methods.find(({ state }) => state === "disabled")?.stateTone, "neutral");
  assert.equal(view.methods.find(({ state }) => state === "emergency_disabled")?.stateTone, "danger");
  assert.equal(view.methods[0]?.profileStatusLabel, "Doğrulama bekliyor");
  assert.equal(view.methods[0]?.profileStatusTone, "warning");
});

test("every payment settings model object and array is frozen", () => {
  const view = buildPaymentSettingsViewModel(
    PAYMENT_PROVIDER_CATALOG,
    [],
    [profile("active")],
    [method("40000000-0000-4000-8000-000000000009", "active", 0)],
    "",
    noFilters,
  );
  const visit = (value: unknown, seen = new Set<object>()): void => {
    if (typeof value !== "object" || value === null || seen.has(value)) return;
    seen.add(value);
    assert.equal(Object.isFrozen(value), true);
    for (const child of Object.values(value)) visit(child, seen);
  };
  visit(view);
});
