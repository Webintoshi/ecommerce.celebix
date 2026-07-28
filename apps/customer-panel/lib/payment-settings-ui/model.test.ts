import assert from "node:assert/strict";
import test from "node:test";

import type {
  MerchantPaymentMethod,
  MerchantProviderDescriptor,
  MerchantProviderProfile,
  PaymentProviderCatalogEntry,
} from "@celebix/saas-contracts";

import { PAYMENT_PROVIDER_CATALOG } from "../payment-providers/catalog.ts";
import { createDefaultCustomerPanelPaymentProviderRegistry, createDefaultHostedPaymentAdapterRegistry } from "../payment-provider-adapters/default.ts";
import {
  buildPaymentProviderConnectionViewModel,
  buildPaymentSettingsViewModel,
  selectPaymentProviderConnectionProfile,
} from "./model.ts";

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

function promoteTestReadiness(
  catalog: readonly PaymentProviderCatalogEntry[],
  providerCode: "paytr_iframe",
  evidence: Readonly<{
    state: "sandbox_ready";
    adapterVersion: 1;
    evidenceDigest: "sha256:test-only-fixture";
  }>,
): readonly PaymentProviderCatalogEntry[] {
  assert.equal(providerCode, "paytr_iframe");
  assert.deepEqual(evidence, {
    state: "sandbox_ready",
    adapterVersion: 1,
    evidenceDigest: "sha256:test-only-fixture",
  });
  return Object.freeze(catalog.map((entry) => entry.providerCode === providerCode
    ? Object.freeze({ ...entry, readiness: evidence.state, executionAuthority: {
      environment: "test" as const,
      adapterVersion: evidence.adapterVersion,
      evidenceDigest: evidence.evidenceDigest,
    } })
    : entry));
}

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
  const evidenceDigest = `sha256:${"a".repeat(64)}`;
  const ready: PaymentProviderCatalogEntry = { ...base, readiness: "sandbox_ready", environments: ["test"], executionAuthority: { environment: "test", adapterVersion: 7, evidenceDigest } };
  const planned: PaymentProviderCatalogEntry = { ...PAYMENT_PROVIDER_CATALOG[1]!, readiness: "planned" };
  const descriptor: MerchantProviderDescriptor = {
    providerCode: ready.providerCode,
    capability: "payment_processing",
    label: ready.label,
    publicFields: [{ key: "merchant_id", label: "Mağaza numarası" }],
    credentialFields: [{ key: "api_secret", label: "API parolası", secret: true }],
    adapterVersion: 7,
    environments: ["test"],
    executionAuthority: { environment: "test", adapterVersion: 7, evidenceDigest },
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
  assert.equal(plannedCard?.lifecycleLabel, "Hazırlanıyor");
  assert.equal(plannedCard?.executableDescriptor, null);
  assert.doesNotMatch(JSON.stringify(plannedCard), /api_secret|API parolası/);

  for (const mismatch of [
    { ...descriptor, adapterVersion: 8 },
    { ...descriptor, environments: ["live" as const] },
    { ...descriptor, executionAuthority: null },
    { ...descriptor, executionAuthority: { environment: "test" as const, adapterVersion: 7, evidenceDigest: `sha256:${"b".repeat(64)}` } },
  ]) {
    const rejected = buildPaymentSettingsViewModel([ready], [mismatch], [], [], "", noFilters);
    assert.equal(rejected.catalog.cards[0]?.connectable, false);
  }
});

test("default PayTR cards stay truthful until matching sandbox evidence exists", () => {
  const hosted = createDefaultHostedPaymentAdapterRegistry(Object.freeze({
    request: Object.freeze(async () => { throw new Error("unexpected transport"); }),
  }));
  const registry = createDefaultCustomerPanelPaymentProviderRegistry(hosted);
  const descriptor = registry.get("paytr_iframe", "payment_processing");
  assert.ok(descriptor);
  const evidence = {
    state: "sandbox_ready" as const,
    adapterVersion: 1 as const,
    evidenceDigest: "sha256:test-only-fixture" as const,
  };
  const definitions = [{
    providerCode: descriptor.providerCode,
    capability: descriptor.capability,
    label: descriptor.label,
    publicFields: descriptor.publicFields,
    credentialFields: descriptor.credentialFields,
    adapterVersion: descriptor.adapterVersion,
    environments: descriptor.environments,
    executionAuthority: { environment: "test" as const, adapterVersion: 1, evidenceDigest: evidence.evidenceDigest },
  }];

  const view = buildPaymentSettingsViewModel(
    PAYMENT_PROVIDER_CATALOG, definitions, [], [], "", noFilters,
  );
  assert.equal(view.catalog.cards.find((card) => card.providerCode === "paytr_iframe")?.readiness, "verification");
  assert.equal(view.catalog.cards.find((card) => card.providerCode === "paytr_iframe")?.actionLabel, "Hazırlanıyor");
  assert.equal(view.catalog.cards.find((card) => card.providerCode === "paytr")?.actionLabel, "Hazırlanıyor");
  assert.equal(view.catalog.cards.filter((card) => card.connectable).length, 0);

  const promoted = promoteTestReadiness(PAYMENT_PROVIDER_CATALOG, "paytr_iframe", evidence);
  const sandboxReady = buildPaymentSettingsViewModel(promoted, definitions, [], [], "", noFilters);
  const card = sandboxReady.catalog.cards.find((candidate) => candidate.providerCode === "paytr_iframe");
  assert.equal(card?.actionLabel, "Bağla");
  assert.equal(card?.connectionEnvironment, "test");
  assert.equal(sandboxReady.catalog.cards.filter((candidate) => candidate.connectable).length, 1);
});

test("Iyzico is configurable without execution authority and exposes the exact lifecycle states", () => {
  const hosted = createDefaultHostedPaymentAdapterRegistry(Object.freeze({
    request: Object.freeze(async () => { throw new Error("unexpected transport"); }),
  }));
  const registry = createDefaultCustomerPanelPaymentProviderRegistry(hosted);
  const entry = registry.get("iyzico_iframe", "payment_processing");
  assert.ok(entry);
  const descriptor: MerchantProviderDescriptor = {
    providerCode: entry.providerCode,
    capability: entry.capability,
    label: entry.label,
    publicFields: entry.publicFields,
    credentialFields: entry.credentialFields,
    adapterVersion: entry.adapterVersion,
    environments: entry.environments,
    executionAuthority: null,
  };
  const iyzico = (status?: MerchantProviderProfile["status"], activeMethod = false) => {
    const selectedProfile = status ? Object.freeze({
      ...profile(status),
      providerCode: "iyzico_iframe",
      publicConfig: { environment: "test" },
      maskedAccountReference: "iyzico test hesabı",
      lastValidatedAt: status === "active" ? NOW : null,
    }) : undefined;
    const methods = activeMethod ? [Object.freeze({
      ...method("40000000-0000-4000-8000-000000000030", "active", 0),
      providerCode: "iyzico_iframe",
      profileId: selectedProfile?.id ?? PROFILE_ID,
    })] : [];
    return buildPaymentSettingsViewModel(
      PAYMENT_PROVIDER_CATALOG,
      [descriptor],
      selectedProfile ? [selectedProfile] : [],
      methods,
      "iyzico",
      noFilters,
    ).catalog.cards.find(({ providerCode }) => providerCode === "iyzico_iframe")!;
  };

  const newCard = iyzico();
  assert.equal(newCard.providerCode, "iyzico_iframe");
  assert.equal(newCard.configurable, true);
  assert.equal(newCard.executable, false);
  assert.equal(newCard.connectable, true);
  assert.equal(newCard.actionLabel, "Bilgileri gir");
  assert.equal(newCard.lifecycleLabel, "Henüz bağlanmadı");
  assert.equal(newCard.configurableDescriptor?.executionAuthority, null);
  assert.equal(newCard.executableDescriptor, null);
  assert.equal(iyzico("revoked").lifecycleLabel, "Henüz bağlanmadı");
  assert.equal(iyzico("pending_validation").lifecycleLabel, "Doğrulama bekliyor");
  assert.equal(iyzico("active").lifecycleLabel, "Doğrulandı — sandbox kanıtı bekleniyor");
  assert.equal(iyzico("active", true).lifecycleLabel, "Aktif");
});

test("connection profile selection ignores revoked rows and is deterministic for one environment", () => {
  const revoked = {
    ...profile("revoked"),
    id: "40000000-0000-4000-8000-000000000041",
    providerCode: "iyzico_iframe",
    publicConfig: { environment: "test" },
    updatedAt: "2026-07-27T13:00:00.000Z",
  };
  const active = {
    ...profile("active"),
    id: "40000000-0000-4000-8000-000000000042",
    providerCode: "iyzico_iframe",
    publicConfig: { environment: "test" },
    updatedAt: "2026-07-27T12:00:00.000Z",
  };
  const pending = {
    ...profile("pending_validation"),
    id: "40000000-0000-4000-8000-000000000043",
    providerCode: "iyzico_iframe",
    publicConfig: { environment: "test" },
    updatedAt: "2026-07-27T14:00:00.000Z",
  };

  const selected = selectPaymentProviderConnectionProfile(
    [revoked, pending, active], "iyzico_iframe", ["test"],
  );
  const reordered = selectPaymentProviderConnectionProfile(
    [active, revoked, pending], "iyzico_iframe", ["test"],
  );
  assert.equal(selected?.id, active.id);
  assert.equal(reordered?.id, active.id);
  assert.equal(selectPaymentProviderConnectionProfile(
    [revoked], "iyzico_iframe", ["test"],
  ), null);
});

test("a dual-environment configurable card opens its active profile environment", () => {
  const entry = PAYMENT_PROVIDER_CATALOG.find(({ providerCode }) =>
    providerCode === "iyzico_iframe")!;
  const descriptor: MerchantProviderDescriptor = {
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
    label: "iyzico · Checkout Form",
    publicFields: [],
    credentialFields: [
      { key: "apiKey", label: "API Key", secret: true },
      { key: "secretKey", label: "Secret Key", secret: true },
    ],
    adapterVersion: 1,
    environments: ["test", "live"],
    executionAuthority: null,
  };
  const profiles: MerchantProviderProfile[] = [
    {
      ...profile("pending_validation"),
      id: "40000000-0000-4000-8000-000000000044",
      providerCode: "iyzico_iframe",
      publicConfig: { environment: "test" },
    },
    {
      ...profile("active"),
      id: "40000000-0000-4000-8000-000000000045",
      providerCode: "iyzico_iframe",
      publicConfig: { environment: "live" },
      lastValidatedAt: NOW,
    },
  ];

  for (const selectedProfiles of [profiles, [...profiles].reverse()]) {
    const card = buildPaymentSettingsViewModel(
      [entry], [descriptor], selectedProfiles, [], "", noFilters,
    ).catalog.cards[0]!;
    assert.equal(card.connectionEnvironment, "live");
    assert.equal(card.lifecycleLabel, "Doğrulandı — sandbox kanıtı bekleniyor");
  }
});

test("an executable provider advances from verified profile to activation ready and active", () => {
  const evidence = {
    state: "sandbox_ready" as const,
    adapterVersion: 1 as const,
    evidenceDigest: "sha256:test-only-fixture" as const,
  };
  const catalog = promoteTestReadiness(PAYMENT_PROVIDER_CATALOG, "paytr_iframe", evidence);
  const descriptor: MerchantProviderDescriptor = {
    providerCode: "paytr_iframe",
    capability: "payment_processing",
    label: "PayTR iFrame",
    publicFields: [{ key: "merchantId", label: "Mağaza numarası" }],
    credentialFields: [{ key: "merchantKey", label: "Mağaza parolası", secret: true }],
    adapterVersion: 1,
    environments: ["test"],
    executionAuthority: { environment: "test", adapterVersion: 1, evidenceDigest: evidence.evidenceDigest },
  };
  const activeProfile = profile("active");
  const ready = buildPaymentSettingsViewModel(catalog, [descriptor], [activeProfile], [], "paytr", noFilters);
  assert.equal(ready.catalog.cards.find(({ providerCode }) => providerCode === "paytr_iframe")?.lifecycleLabel, "Aktivasyona hazır");
  const active = buildPaymentSettingsViewModel(
    catalog,
    [descriptor],
    [activeProfile],
    [method("40000000-0000-4000-8000-000000000031", "active", 0)],
    "paytr",
    noFilters,
  );
  assert.equal(active.catalog.cards.find(({ providerCode }) => providerCode === "paytr_iframe")?.lifecycleLabel, "Aktif");
});

test("Iyzico test and live profiles coexist and build independent connection views", () => {
  const descriptor: MerchantProviderDescriptor = {
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
    label: "iyzico · Checkout Form",
    publicFields: [],
    credentialFields: [
      { key: "apiKey", label: "API Key", secret: true },
      { key: "secretKey", label: "Secret Key", secret: true },
    ],
    adapterVersion: 1,
    environments: ["test", "live"],
    executionAuthority: null,
  };
  const profiles = (["test", "live"] as const).map((environment, index) => ({
    ...profile("active"),
    id: `40000000-0000-4000-8000-00000000004${index}`,
    providerCode: "iyzico_iframe",
    publicConfig: { environment },
    maskedAccountReference: `iyzico ${environment} hesabı`,
    lastValidatedAt: NOW,
  }));
  for (const environment of ["test", "live"] as const) {
    const view = buildPaymentProviderConnectionViewModel({
      descriptor,
      environment,
      profile: profiles.find((candidate) => candidate.publicConfig.environment === environment),
      storefrontHostname: "shop.example.test",
    });
    assert.equal(view.environment, environment);
    assert.equal(view.maskedAccountReference, `iyzico ${environment} hesabı`);
    assert.equal(view.statusLabel, "Doğrulandı — sandbox kanıtı bekleniyor");
  }
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

test("connection view shows exact test fields callback status and rotation without secret values", () => {
  const descriptor: MerchantProviderDescriptor = {
    providerCode: "paytr_iframe",
    capability: "payment_processing",
    label: "PayTR iFrame",
    publicFields: [{ key: "merchantId", label: "Mağaza numarası" }],
    credentialFields: [
      { key: "merchantKey", label: "Mağaza parolası", secret: true },
      { key: "merchantSalt", label: "Mağaza gizli anahtarı", secret: true },
    ],
  };
  const active = {
    ...profile("active"),
    publicConfig: { environment: "test", merchantId: "merchant-1234" },
    maskedAccountReference: "paytr…1234",
    credentialVersion: 3,
    lastValidatedAt: NOW,
  };
  const view = buildPaymentProviderConnectionViewModel({
    descriptor,
    environment: "test",
    profile: active,
    storefrontHostname: "shop.example.test",
  });
  assert.equal(view.environmentLabel, "Test ortamı");
  assert.equal(view.callbackUrl, "https://shop.example.test/api/payments/paytr_iframe/callback/{işleme-özel-bağlantı}");
  assert.equal(view.statusLabel, "Bağlı");
  assert.equal(view.maskedAccountReference, "paytr…1234");
  assert.equal(view.credentialVersionLabel, "Sürüm 3");
  assert.equal(view.submitLabel, "Bilgileri yenile");
  assert.deepEqual(view.publicFields, [
    { key: "merchantId", label: "Mağaza numarası", initialValue: "merchant-1234" },
  ]);
  assert.deepEqual(view.credentialFields, [
    { key: "merchantKey", label: "Mağaza parolası", secret: true, initialValue: "" },
    { key: "merchantSalt", label: "Mağaza gizli anahtarı", secret: true, initialValue: "" },
  ]);
  assert.doesNotMatch(JSON.stringify(view), /key-never-return|salt-never-return/);
});

test("connection view permits disabled reactivation but keeps revoked profiles terminal", () => {
  const descriptor: MerchantProviderDescriptor = {
    providerCode: "paytr_iframe",
    capability: "payment_processing",
    label: "PayTR iFrame",
    publicFields: [{ key: "merchantId", label: "Mağaza numarası" }],
    credentialFields: [{ key: "merchantKey", label: "Mağaza parolası", secret: true }],
  };
  for (const [status, canRotate] of [["disabled", true], ["revoked", false]] as const) {
    const view = buildPaymentProviderConnectionViewModel({
      descriptor,
      environment: "test",
      profile: { ...profile(status), publicConfig: { environment: "test", merchantId: "merchant-1234" } },
      storefrontHostname: "shop.example.test",
    });
    assert.equal(view.statusLabel, status === "disabled" ? "Devre dışı" : "Bağlantı iptal edildi");
    assert.equal(view.canRotate, canRotate);
    assert.equal(view.submitLabel, canRotate ? "Bilgileri yenile" : "Bağlantıyı kaydet");
  }
  assert.throws(() => buildPaymentProviderConnectionViewModel({
    descriptor,
    environment: "test",
    profile: { ...profile("active"), publicConfig: { environment: "live", merchantId: "merchant-1234" } },
    storefrontHostname: "shop.example.test",
  }), /payment_provider_connection_invalid/);
});

test("pending and rejected validation states never claim an active connection", () => {
  const descriptor: MerchantProviderDescriptor = {
    providerCode: "paytr_iframe",
    capability: "payment_processing",
    label: "PayTR iFrame",
    publicFields: [{ key: "merchantId", label: "Mağaza numarası" }],
    credentialFields: [{ key: "merchantKey", label: "Mağaza parolası", secret: true }],
  };
  const pending = buildPaymentProviderConnectionViewModel({
    descriptor,
    environment: "test",
    profile: { ...profile("pending_validation"), publicConfig: { environment: "test", merchantId: "merchant-1234" } },
    storefrontHostname: "shop.example.test",
  });
  assert.equal(pending.statusLabel, "Doğrulama bekliyor");
  assert.notEqual(pending.statusLabel, "Bağlı");
  const rejected = buildPaymentProviderConnectionViewModel({
    descriptor,
    environment: "test",
    profile: { ...profile("rotation_required"), publicConfig: { environment: "test", merchantId: "merchant-1234" } },
    storefrontHostname: "shop.example.test",
  });
  assert.equal(rejected.statusLabel, "Anahtar yenileme gerekli");
  assert.equal(rejected.submitLabel, "Bilgileri yenile");
});

test("connection callback accepts only one canonical durable storefront hostname", () => {
  const descriptor: MerchantProviderDescriptor = {
    providerCode: "paytr_iframe",
    capability: "payment_processing",
    label: "PayTR iFrame",
    publicFields: [],
    credentialFields: [],
  };
  for (const storefrontHostname of [
    "https://shop.example.test", "shop.example.test:443", "SHOP.example.test",
    "shop.example.test/", "localhost", "127.0.0.1", "shop..example.test",
  ]) assert.throws(() => buildPaymentProviderConnectionViewModel({
    descriptor,
    environment: "test",
    storefrontHostname,
  }), /payment_provider_connection_invalid/);
});
