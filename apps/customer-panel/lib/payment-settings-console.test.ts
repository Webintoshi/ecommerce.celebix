import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import type { MerchantPaymentMethod } from "@celebix/saas-contracts";

import { PaymentMethodApiError } from "./payment-method-ui/client.ts";
import { PAYMENT_PROVIDER_CATALOG } from "./payment-providers/catalog.ts";
import { buildPaymentSettingsViewModel } from "./payment-settings-ui/model.ts";
import * as consoleState from "./payment-settings-ui/console-state.ts";
import {
  buildPaymentMethodOrderCommands,
  hasPaymentMethodOrderChanged,
  loadPaymentSettingsSources,
  movePaymentMethodOrder,
} from "./payment-settings-ui/console-state.ts";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");
const NOW = "2026-07-27T12:00:00.000Z";
const IYZICO_PROFILE_ID = "40000000-0000-4000-8000-000000000090";

function executableIyzicoCard(environment: "test" | "live" = "test") {
  const evidenceDigest = `sha256:${"a".repeat(64)}`;
  const entry = PAYMENT_PROVIDER_CATALOG.find(({ providerCode }) => providerCode === "iyzico_iframe")!;
  return buildPaymentSettingsViewModel([
    Object.freeze({
      ...entry,
      readiness: environment === "test" ? "sandbox_ready" as const : "production_ready" as const,
      environments: Object.freeze([environment]),
      executionAuthority: Object.freeze({ environment, adapterVersion: 1, evidenceDigest }),
    }),
  ], [Object.freeze({
    providerCode: "iyzico_iframe",
    capability: "payment_processing" as const,
    label: "iyzico · Checkout Form",
    publicFields: Object.freeze([]),
    credentialFields: Object.freeze([
      Object.freeze({ key: "apiKey", label: "API Key", secret: true as const }),
      Object.freeze({ key: "secretKey", label: "Secret Key", secret: true as const }),
    ]),
    adapterVersion: 1,
    environments: Object.freeze([environment]),
    executionAuthority: Object.freeze({ environment, adapterVersion: 1, evidenceDigest }),
  })], [], [], "", Object.freeze({
    category: "all" as const,
    interactionMode: "all" as const,
    readiness: "all" as const,
    environment: "all" as const,
  })).catalog.cards[0]!;
}

function executableDualEnvironmentIyzicoCard(environment: "test" | "live" = "test") {
  const evidenceDigest = `sha256:${"b".repeat(64)}`;
  const entry = PAYMENT_PROVIDER_CATALOG.find(({ providerCode }) => providerCode === "iyzico_iframe")!;
  return buildPaymentSettingsViewModel([
    Object.freeze({
      ...entry,
      readiness: environment === "test" ? "sandbox_ready" as const : "production_ready" as const,
      environments: Object.freeze(["test", "live"] as const),
      executionAuthority: Object.freeze({ environment, adapterVersion: 1, evidenceDigest }),
    }),
  ], [Object.freeze({
    providerCode: "iyzico_iframe",
    capability: "payment_processing" as const,
    label: "iyzico · Checkout Form",
    publicFields: Object.freeze([]),
    credentialFields: Object.freeze([
      Object.freeze({ key: "apiKey", label: "API Key", secret: true as const }),
      Object.freeze({ key: "secretKey", label: "Secret Key", secret: true as const }),
    ]),
    adapterVersion: 1,
    environments: Object.freeze(["test", "live"] as const),
    executionAuthority: Object.freeze({ environment, adapterVersion: 1, evidenceDigest }),
  })], [], [], "", Object.freeze({
    category: "all" as const,
    interactionMode: "all" as const,
    readiness: "all" as const,
    environment: "all" as const,
  })).catalog.cards[0]!;
}

function iyzicoProfile(environment: "test" | "live" = "test") {
  return Object.freeze({
    id: IYZICO_PROFILE_ID,
    providerCode: "iyzico_iframe",
    capability: "payment_processing" as const,
    publicConfig: Object.freeze({ environment }),
    maskedAccountReference: `iyzico ${environment} hesabı`,
    status: "active" as const,
    credentialVersion: 1,
    version: 3,
    lastValidatedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function iyzicoMethod(
  state: MerchantPaymentMethod["state"],
  environment: "test" | "live" = "test",
  version = 4,
): MerchantPaymentMethod {
  return Object.freeze({
    id: IYZICO_PROFILE_ID,
    kind: "provider" as const,
    profileId: IYZICO_PROFILE_ID,
    providerCode: "iyzico_iframe",
    label: "iyzico · Checkout Form",
    state,
    emergencyReason: state === "emergency_disabled" ? "Risk kontrolü" : null,
    position: 0,
    config: Object.freeze({ environment }),
    version,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function method(id: string, position: number): MerchantPaymentMethod {
  return Object.freeze({
    id,
    kind: "cash_on_delivery",
    profileId: null,
    providerCode: null,
    label: `Yöntem ${position + 1}`,
    state: "active",
    emergencyReason: null,
    position,
    config: Object.freeze({}),
    version: position + 1,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

test("payment console contains the ikas-like Celebix payment structure without foreign rails", async () => {
  const [consoleSource, catalogSource, drawerSource, orderSource] = await Promise.all([
    source("components/settings/payment/PaymentSettingsConsole.tsx"),
    source("components/settings/payment/PaymentProviderCatalogDialog.tsx"),
    source("components/settings/payment/PaymentProviderConnectionDrawer.tsx"),
    source("components/settings/payment/PaymentMethodOrderDialog.tsx"),
  ]);
  const combined = [consoleSource, catalogSource, drawerSource, orderSource].join("\n");
  for (const copy of [
    "Ödeme Ayarları", "Ödeme kullanılabilirliği", "Önizleme ve Sıralama",
    "Ödeme Yöntemi Ekle", "Ödeme Yöntemleri", "Acil Durum", "Durum",
  ]) assert.match(combined, new RegExp(copy));
  assert.match(consoleSource, /PanelTopbarBridge/);
  assert.doesNotMatch(combined, /MerchantModuleConsole|ikas|Hızlı Öde|floating-order|right-action/i);
  assert.match(catalogSource, /from "next\/image"/);
  assert.match(catalogSource, /card\.logoPath/);
  assert.match(consoleSource, /Promise\.allSettled|loadPaymentSettingsSources/);
  assert.match(consoleSource, /activateProviderPaymentMethod/);
  assert.match(consoleSource, /selectPaymentProviderConnectionProfile/);
  assert.match(consoleSource, /busyProviderCode/);
  assert.match(consoleSource, /Bağlı — aktivasyon bekliyor/);
});

test("payment console keeps catalog, profile and method states independent", async () => {
  const calls: string[] = [];
  let releaseCatalog: ((value: readonly string[]) => void) | undefined;
  const catalog = new Promise<readonly string[]>((resolve) => { releaseCatalog = resolve; });
  const pending = loadPaymentSettingsSources({
    catalog: () => { calls.push("catalog"); return catalog; },
    definitions: async () => { calls.push("definitions"); return ["definition"] as const; },
    profiles: async () => { calls.push("profiles"); throw new Error("private provider detail"); },
    methods: async () => { calls.push("methods"); return [] as const; },
  });
  await Promise.resolve();
  assert.deepEqual(calls, ["catalog", "definitions", "profiles", "methods"]);
  releaseCatalog?.(["catalog"]);
  const state = await pending;
  assert.equal(state.catalog.phase, "ready");
  assert.equal(state.definitions.phase, "ready");
  assert.equal(state.profiles.phase, "error");
  assert.equal(state.methods.phase, "ready");
  assert.doesNotMatch(JSON.stringify(state), /private provider detail/);
  assert.equal(Object.isFrozen(state), true);
});

test("payment console skips dormant provider execution when the catalog has no executable adapter", async () => {
  let providerCalls = 0;
  const state = await loadPaymentSettingsSources({
    catalog: async (): Promise<readonly string[]> => ["planned-provider"],
    definitions: async () => { providerCalls += 1; return ["definition"] as const; },
    profiles: async () => { providerCalls += 1; return ["profile"] as const; },
    methods: async () => [] as const,
    shouldLoadProviderExecution: (catalog) => catalog.includes("executable-provider"),
  });

  assert.equal(providerCalls, 0);
  assert.deepEqual(state.definitions, { phase: "ready", value: [] });
  assert.deepEqual(state.profiles, { phase: "ready", value: [] });
});

test("payment order helpers require an exact changed method set", () => {
  const methods = [
    method("40000000-0000-4000-8000-000000000001", 0),
    method("40000000-0000-4000-8000-000000000002", 1),
    method("40000000-0000-4000-8000-000000000003", 2),
  ];
  const original = methods.map(({ id }) => id);
  const moved = movePaymentMethodOrder(original, original[1]!, "up");
  assert.deepEqual(moved, [original[1], original[0], original[2]]);
  assert.equal(Object.isFrozen(moved), true);
  assert.equal(hasPaymentMethodOrderChanged(original, original), false);
  assert.equal(hasPaymentMethodOrderChanged(original, moved), true);
  assert.deepEqual(buildPaymentMethodOrderCommands(methods, moved), [
    { id: original[1], expectedVersion: 2, position: 0 },
    { id: original[0], expectedVersion: 1, position: 1 },
    { id: original[2], expectedVersion: 3, position: 2 },
  ]);
  assert.throws(() => buildPaymentMethodOrderCommands(methods, moved.slice(1)), /payment_method_order_invalid/);
  assert.throws(() => buildPaymentMethodOrderCommands(methods, [...moved, moved[0]!]), /payment_method_order_invalid/);
});

test("provider activation creates one deterministic tenant method and activates its returned version", async () => {
  const activate = Reflect.get(consoleState, "activateProviderPaymentMethod");
  assert.equal(typeof activate, "function");
  const saved: unknown[] = [];
  const states: unknown[] = [];
  const api = Object.freeze({
    async list() { return Object.freeze([]); },
    async save(input: unknown) {
      saved.push(input);
      return Object.freeze({
        id: IYZICO_PROFILE_ID,
        state: "disabled" as const,
        position: 0,
        version: 1,
        updatedAt: NOW,
        replayed: false,
      });
    },
    async setState(methodId: string, input: unknown) {
      states.push(Object.freeze({ methodId, input }));
      return Object.freeze({
        id: IYZICO_PROFILE_ID,
        state: "active" as const,
        position: 0,
        version: 2,
        updatedAt: NOW,
        replayed: false,
      });
    },
  });

  const result = await activate({
    card: executableIyzicoCard("test"),
    profile: iyzicoProfile("test"),
    methods: Object.freeze([]),
    api,
  });

  assert.deepEqual(saved, [Object.freeze({
    methodId: IYZICO_PROFILE_ID,
    expectedVersion: 0,
    kind: "provider",
    profileId: IYZICO_PROFILE_ID,
    providerCode: "iyzico_iframe",
    label: "iyzico · Checkout Form",
    config: Object.freeze({ environment: "test" }),
  })]);
  assert.deepEqual(states, [Object.freeze({
    methodId: IYZICO_PROFILE_ID,
    input: Object.freeze({ expectedVersion: 1, state: "active", emergencyReason: null }),
  })]);
  assert.deepEqual(result, Object.freeze({ kind: "active", methodId: IYZICO_PROFILE_ID, created: true }));
  assert.equal(Object.isFrozen(result), true);
});

test("provider activation accepts an exact authority selected from a dual-environment descriptor", async () => {
  const saved: unknown[] = [];
  const api = Object.freeze({
    async list() { return Object.freeze([]); },
    async save(input: unknown) {
      saved.push(input);
      return Object.freeze({ id: IYZICO_PROFILE_ID, state: "active" as const, position: 0, version: 1, updatedAt: NOW, replayed: false });
    },
    async setState() { throw new Error("already active"); },
  });
  const result = await consoleState.activateProviderPaymentMethod({
    card: executableDualEnvironmentIyzicoCard("test"),
    profile: iyzicoProfile("test"),
    methods: Object.freeze([]),
    api,
  });
  assert.equal(saved.length, 1);
  assert.deepEqual(result, Object.freeze({ kind: "active", methodId: IYZICO_PROFILE_ID, created: true }));
});

test("provider activation reuses exact methods without overriding an emergency stop", async () => {
  for (const fixture of [
    { state: "active" as const, expectedKind: "active" as const, expectedStateCalls: 0 },
    { state: "disabled" as const, expectedKind: "active" as const, expectedStateCalls: 1 },
    { state: "emergency_disabled" as const, expectedKind: "emergency_disabled" as const, expectedStateCalls: 0 },
  ]) {
    const existing = iyzicoMethod(fixture.state);
    let saveCalls = 0;
    const states: unknown[] = [];
    const result = await consoleState.activateProviderPaymentMethod({
      card: executableIyzicoCard("test"),
      profile: iyzicoProfile("test"),
      methods: Object.freeze([existing]),
      api: Object.freeze({
        async list() { return Object.freeze([existing]); },
        async save() { saveCalls += 1; throw new Error("save must not run"); },
        async setState(methodId: string, input: unknown) {
          states.push(Object.freeze({ methodId, input }));
          return Object.freeze({
            id: existing.id,
            state: "active" as const,
            position: 0,
            version: existing.version + 1,
            updatedAt: NOW,
            replayed: false,
          });
        },
      }),
    });
    assert.equal(saveCalls, 0);
    assert.equal(states.length, fixture.expectedStateCalls);
    if (fixture.state === "disabled") assert.deepEqual(states[0], Object.freeze({
      methodId: existing.id,
      input: Object.freeze({ expectedVersion: existing.version, state: "active", emergencyReason: null }),
    }));
    assert.deepEqual(result, Object.freeze({
      kind: fixture.expectedKind,
      methodId: existing.id,
      created: false,
    }));
  }
});

test("provider activation fails closed without exact execution authority or environment", async () => {
  let mutations = 0;
  const api = Object.freeze({
    async list() { mutations += 1; return Object.freeze([]); },
    async save() { mutations += 1; throw new Error("save must not run"); },
    async setState() { mutations += 1; throw new Error("state must not run"); },
  });
  const verificationCard = buildPaymentSettingsViewModel(
    PAYMENT_PROVIDER_CATALOG,
    [],
    [],
    [],
    "iyzico",
    Object.freeze({ category: "all", interactionMode: "all", readiness: "all", environment: "all" }),
  ).catalog.cards.find(({ providerCode }) => providerCode === "iyzico_iframe")!;

  for (const fixture of [
    { card: verificationCard, profile: iyzicoProfile("test") },
    { card: executableIyzicoCard("test"), profile: iyzicoProfile("live") },
  ]) assert.deepEqual(await consoleState.activateProviderPaymentMethod({
    ...fixture,
    methods: Object.freeze([]),
    api,
  }), Object.freeze({ kind: "awaiting_authority", methodId: null, created: false }));
  assert.equal(mutations, 0);
});

test("provider activation reconciles duplicate create and uncertain activation without replaying writes", async () => {
  const existing = iyzicoMethod("disabled", "test", 7);
  const stateCalls: unknown[] = [];
  const created = await consoleState.activateProviderPaymentMethod({
    card: executableIyzicoCard("test"),
    profile: iyzicoProfile("test"),
    methods: Object.freeze([]),
    api: Object.freeze({
      async list() { return Object.freeze([existing]); },
      async save() { throw new PaymentMethodApiError("version_conflict", 409); },
      async setState(methodId: string, input: unknown) {
        stateCalls.push(Object.freeze({ methodId, input }));
        return Object.freeze({ id: methodId, state: "active" as const, position: 0, version: 8, updatedAt: NOW, replayed: false });
      },
    }),
  });
  assert.deepEqual(stateCalls, [Object.freeze({
    methodId: existing.id,
    input: Object.freeze({ expectedVersion: 7, state: "active", emergencyReason: null }),
  })]);
  assert.deepEqual(created, Object.freeze({ kind: "active", methodId: existing.id, created: false }));

  let lists = 0;
  const uncertain = await consoleState.activateProviderPaymentMethod({
    card: executableIyzicoCard("test"),
    profile: iyzicoProfile("test"),
    methods: Object.freeze([existing]),
    api: Object.freeze({
      async list() { lists += 1; return Object.freeze([iyzicoMethod("active", "test", 8)]); },
      async save() { throw new Error("save must not run"); },
      async setState() { throw new PaymentMethodApiError("unavailable", 503); },
    }),
  });
  assert.equal(lists, 1);
  assert.deepEqual(uncertain, Object.freeze({ kind: "active", methodId: existing.id, created: false }));
});

test("payment dialogs provide focus safety, masked connection state and dormant secrets", async () => {
  const [consoleSource, catalogSource, drawerSource, orderSource, css] = await Promise.all([
    source("components/settings/payment/PaymentSettingsConsole.tsx"),
    source("components/settings/payment/PaymentProviderCatalogDialog.tsx"),
    source("components/settings/payment/PaymentProviderConnectionDrawer.tsx"),
    source("components/settings/payment/PaymentMethodOrderDialog.tsx"),
    source("components/settings/payment/payment-settings.module.css"),
  ]);
  assert.match(catalogSource, /role="dialog"/);
  assert.match(catalogSource, /aria-modal="true"/);
  assert.match(catalogSource, /searchRef\.current\?\.focus/);
  assert.match(catalogSource, /openerRef\.current\?\.focus/);
  assert.match(catalogSource, /event\.key [!=]== "Tab"/);
  assert.match(catalogSource, /event\.key === "Escape"/);
  assert.match(catalogSource, /disabled=\{!card\.configurable/);
  assert.match(catalogSource, /card\.lifecycleLabel/);
  assert.match(drawerSource, /credentialFields/);
  assert.match(drawerSource, /aria-label="Sağlayıcı ortamı"/);
  assert.match(drawerSource, /props\.environments/);
  assert.match(drawerSource, /selectedEnvironment/);
  assert.match(drawerSource, /selectPaymentProviderConnectionProfile\(/);
  assert.match(drawerSource, /type="password"/);
  assert.match(drawerSource, /autoComplete="off"/);
  assert.match(drawerSource, /form\.reset\(\)/);
  assert.match(drawerSource, /Doğrulama bekliyor/);
  assert.match(drawerSource, /maskedAccountReference/);
  assert.match(drawerSource, /callbackUrl/);
  assert.match(drawerSource, /storefrontHostname/);
  assert.match(drawerSource, /const canSubmit = connection !== null && \(selectedProfile === null \|\| connection\.canRotate\)/);
  assert.match(drawerSource, /busy \|\| !props\.canManage \|\| !canSubmit/);
  assert.doesNotMatch(drawerSource, /window[.]location[.]origin/);
  assert.doesNotMatch(drawerSource, /defaultValue=\{[^}]*credential|merchantKey\s*:|merchantSalt\s*:/);
  assert.match(consoleSource, /readiness === "verification"/);
  assert.match(consoleSource, /selectedCard\?\.configurableDescriptor/);
  assert.match(consoleSource, /emergencyReason/);
  assert.match(consoleSource, /window\.confirm/);
  assert.match(orderSource, /draggable/);
  assert.match(orderSource, /Yukarı/);
  assert.match(orderSource, /Aşağı/);
  assert.match(orderSource, /hasPaymentMethodOrderChanged/);
  assert.match(orderSource, /version_conflict/);
  assert.match(css, /@media \(max-width: 1024px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /position:\s*fixed;[^}]*right:\s*0/m);
});

test("read-only payment console never exposes mutation actions", async () => {
  const combined = (await Promise.all([
    source("components/settings/payment/PaymentSettingsConsole.tsx"),
    source("components/settings/payment/PaymentProviderCatalogDialog.tsx"),
    source("components/settings/payment/PaymentMethodOrderDialog.tsx"),
  ])).join("\n");
  assert.match(combined, /canManage/);
  assert.match(combined, /disabled=\{[^}]*!canManage/);
  assert.match(combined, /Salt okunur/);
});
