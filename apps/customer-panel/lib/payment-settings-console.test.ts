import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import * as React from "react";
import { createElement, type ReactNode } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

import type {
  BuiltInPaymentMethodKind,
  MerchantPaymentMethod,
} from "@celebix/saas-contracts";

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

type DrawerNode = {
  type: string;
  props: Record<string, unknown>;
  children: readonly (DrawerNode | string)[];
  target: {
    focusCount: number;
    focus(): void;
    querySelectorAll(): readonly DrawerNode["target"][];
  };
};

function createDrawerHookRuntime() {
  const slots: unknown[] = [];
  const pendingEffects: Array<() => void> = [];
  let cursor = 0;
  let dirty = true;
  let latest: ReactNode;
  const sameDeps = (left: readonly unknown[] | undefined, right: readonly unknown[]) =>
    left !== undefined && left.length === right.length
      && left.every((value, index) => Object.is(value, right[index]));
  const runtime = {
    ...React,
    useState<T>(initial: T | (() => T)) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      const set = (next: T | ((current: T) => T)) => {
        slots[index] = typeof next === "function"
          ? (next as (current: T) => T)(slots[index] as T)
          : next;
        dirty = true;
      };
      return [slots[index] as T, set] as const;
    },
    useRef<T>(initial: T) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index] as { current: T };
    },
    useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
      const index = cursor++;
      const prior = slots[index] as {
        deps: readonly unknown[];
        cleanup?: () => void;
        generation: number;
      } | undefined;
      if (prior !== undefined && sameDeps(prior.deps, deps)) return;
      const generation = (prior?.generation ?? 0) + 1;
      slots[index] = { deps: [...deps], cleanup: prior?.cleanup, generation };
      pendingEffects.push(() => {
        const current = slots[index] as {
          deps: readonly unknown[];
          cleanup?: () => void;
          generation: number;
        } | undefined;
        if (current?.generation !== generation) return;
        current.cleanup?.();
        const cleanup = effect();
        slots[index] = {
          deps: [...deps],
          ...(typeof cleanup === "function" ? { cleanup } : {}),
          generation,
        };
      });
    },
  } as unknown as typeof React;
  return {
    runtime,
    flush(component: () => ReactNode, force = false) {
      if (force) dirty = true;
      if (dirty || latest === undefined) {
        dirty = false;
        cursor = 0;
        latest = component();
      }
      return latest;
    },
    runEffects() {
      for (const effect of pendingEffects.splice(0)) effect();
    },
  };
}

function mountDrawer(
  node: ReactNode,
  documentState: { activeElement: unknown },
): readonly (DrawerNode | string)[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap((child) => mountDrawer(child, documentState));
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  if (node.type === React.Fragment) return mountDrawer(node.props.children as ReactNode, documentState);
  if (typeof node.type === "function") {
    return mountDrawer(
      (node.type as (props: Record<string, unknown>) => ReactNode)(node.props),
      documentState,
    );
  }
  if (typeof node.type !== "string") return [];
  let children: readonly (DrawerNode | string)[] = [];
  const target = {
    focusCount: 0,
    focus() {
      if (node.props.disabled === true) return;
      this.focusCount += 1;
      documentState.activeElement = this;
    },
    querySelectorAll() {
      return drawerNodes(children)
        .filter((child) =>
          (child.type === "button" || child.type === "input" || child.type === "textarea")
          && child.props.disabled !== true)
        .map((child) => child.target);
    },
  };
  const ref = (node.props as { ref?: unknown }).ref;
  if (typeof ref === "function") ref(target);
  else if (ref && typeof ref === "object" && "current" in ref) {
    (ref as { current: unknown }).current = target;
  }
  children = mountDrawer(node.props.children as ReactNode, documentState);
  return [{ type: node.type, props: node.props, children, target }];
}

function drawerNodes(tree: readonly (DrawerNode | string)[]): DrawerNode[] {
  const nodes: DrawerNode[] = [];
  for (const child of tree) {
    if (typeof child === "string") continue;
    nodes.push(child, ...drawerNodes(child.children));
  }
  return nodes;
}

function drawerText(node: DrawerNode | string): string {
  return typeof node === "string" ? node : node.children.map(drawerText).join("");
}

async function compileBuiltInDrawer(input: Readonly<{
  kind: BuiltInPaymentMethodKind;
  method: MerchantPaymentMethod | null;
  canManage: boolean;
  busy: boolean;
  onSubmit(value: unknown): void | Promise<void>;
  onClose(): void;
}>) {
  const output = ts.transpileModule(
    await source("components/settings/payment/BuiltInPaymentMethodDrawer.tsx"),
    {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const hooks = createDrawerHookRuntime();
  const contracts = await import("@celebix/saas-contracts");
  const Icon = (props: Record<string, unknown>) => createElement("svg", props);
  const styles = new Proxy({}, {
    get: (_target, property) =>
      property === "__esModule" ? true : property === "default" ? styles : String(property),
  });
  const documentState = {
    activeElement: null as unknown,
    body: { style: { overflow: "visible" } },
  };
  const values: Record<string, string> = Object.create(null) as Record<string, string>;
  let uuidCalls = 0;
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return hooks.runtime;
    if (specifier === "lucide-react") return new Proxy({}, { get: () => Icon });
    if (specifier === "@celebix/saas-contracts") return contracts;
    if (specifier === "./payment-settings.module.css") return styles;
    throw new Error(`unexpected_built_in_drawer_import:${specifier}`);
  };
  class TestFormData {
    get(name: string) {
      return values[name] ?? null;
    }
  }
  const cryptoState = {
    randomUUID() {
      uuidCalls += 1;
      return `51000000-0000-4000-8000-${String(uuidCalls + 10).padStart(12, "0")}`;
    },
  };
  Function(
    "require",
    "module",
    "exports",
    "document",
    "crypto",
    "FormData",
    output,
  )(requireModule, compiled, compiled.exports, documentState, cryptoState, TestFormData);
  const Drawer = compiled.exports.BuiltInPaymentMethodDrawer as
    (props: typeof input) => ReactNode;
  assert.equal(typeof Drawer, "function");
  let properties = { ...input };
  let mounted: readonly (DrawerNode | string)[] = [];
  return {
    documentState,
    values,
    uuidCalls: () => uuidCalls,
    setBusy(busy: boolean) {
      properties = { ...properties, busy };
    },
    render(force = false) {
      const tree = hooks.flush(() => Drawer(properties), force);
      mounted = mountDrawer(tree, documentState);
      hooks.runEffects();
      return mounted;
    },
    nodes() {
      return drawerNodes(mounted);
    },
  };
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

test("built-in drawer owns submit synchronously, normalizes IBAN, and unlocks only after the console busy cycle", async () => {
  const submissions: unknown[] = [];
  let closes = 0;
  const drawer = await compileBuiltInDrawer({
    kind: "bank_transfer",
    method: null,
    canManage: true,
    busy: false,
    async onSubmit(value) { submissions.push(value); },
    onClose() { closes += 1; },
  });
  Object.assign(drawer.values, {
    label: "Banka havalesi",
    bankName: "Örnek Bankası",
    accountHolder: "Örnek Ticaret Ltd. Şti.",
    iban: "tr33 0006 1005 1978 6457 8413 26",
    instructions: "Açıklamaya sipariş numaranızı yazın.",
  });

  drawer.render();
  const label = drawer.nodes().find((node) => node.type === "input" && node.props.name === "label");
  assert.ok(label);
  assert.equal(label.target.focusCount, 1);
  const dialog = drawer.nodes().find((node) => node.type === "aside");
  assert.ok(dialog);
  assert.equal(dialog.props.role, "dialog");
  assert.equal(dialog.props["aria-modal"], "true");
  const form = drawer.nodes().find((node) => node.type === "form");
  assert.ok(form);
  const event = { preventDefault() {}, currentTarget: {} };
  (form.props.onSubmit as (event: unknown) => void)(event);
  (form.props.onSubmit as (event: unknown) => void)(event);
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(drawer.uuidCalls(), 1);
  assert.equal(submissions.length, 1);
  assert.deepEqual(submissions[0], {
    kind: "bank_transfer",
    method: null,
    methodId: "51000000-0000-4000-8000-000000000011",
    label: "Banka havalesi",
    config: Object.freeze({
      accountHolder: "Örnek Ticaret Ltd. Şti.",
      bankName: "Örnek Bankası",
      iban: "TR330006100519786457841326",
      instructions: "Açıklamaya sipariş numaranızı yazın.",
    }),
  });
  assert.equal(Object.isFrozen(
    (submissions[0] as { config: Readonly<Record<string, unknown>> }).config,
  ), true);

  (form.props.onSubmit as (event: unknown) => void)(event);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(submissions.length, 1, "completion alone must not release canonical reload ownership");

  drawer.setBusy(true);
  drawer.render(true);
  drawer.setBusy(false);
  drawer.render(true);
  const reloadedForm = drawer.nodes().find((node) => node.type === "form");
  assert.ok(reloadedForm);
  (reloadedForm.props.onSubmit as (event: unknown) => void)(event);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(submissions.length, 2);
  assert.equal(drawer.uuidCalls(), 2);

  drawer.setBusy(true);
  drawer.render(true);
  drawer.setBusy(false);
  drawer.render(true);
  let prevented = false;
  const reloadedDialog = drawer.nodes().find((node) => node.type === "aside");
  assert.ok(reloadedDialog);
  (reloadedDialog.props.onKeyDown as (event: unknown) => void)({
    key: "Escape",
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true);
  const close = drawer.nodes().find((node) =>
    node.type === "button" && node.props["aria-label"] === "Yerleşik yöntem penceresini kapat");
  assert.ok(close);
  (close.props.onClick as () => void)();
  assert.equal(closes, 2);
});

test("built-in drawer disables mutations and focuses an enabled close fallback for read-only access", async () => {
  let submissions = 0;
  let closes = 0;
  const drawer = await compileBuiltInDrawer({
    kind: "bank_transfer",
    method: null,
    canManage: false,
    busy: false,
    onSubmit() { submissions += 1; },
    onClose() { closes += 1; },
  });
  Object.assign(drawer.values, {
    label: "Banka havalesi",
    bankName: "Örnek Bankası",
    accountHolder: "Örnek Ticaret Ltd. Şti.",
    iban: "TR000006100519786457841326",
    instructions: "",
  });

  const tree = drawer.render();
  const controls = drawer.nodes().filter((node) =>
    node.type === "input" || node.type === "textarea");
  assert.equal(controls.length, 5);
  assert.equal(controls.every((control) => control.props.disabled === true), true);
  const submit = drawer.nodes().find((node) =>
    node.type === "button" && node.props.type === "submit");
  assert.ok(submit);
  assert.equal(submit.props.disabled, true);
  const label = drawer.nodes().find((node) => node.type === "input" && node.props.name === "label");
  assert.ok(label);
  assert.equal(label.target.focusCount, 0);
  assert.match(tree.map(drawerText).join(""), /Salt okunur erişim/);
  const form = drawer.nodes().find((node) => node.type === "form");
  assert.ok(form);
  (form.props.onSubmit as (event: unknown) => void)({
    preventDefault() {},
    currentTarget: {},
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(submissions, 0);

  const close = drawer.nodes().find((node) =>
    node.type === "button" && node.props["aria-label"] === "Yerleşik yöntem penceresini kapat");
  assert.ok(close);
  assert.equal(close.target.focusCount, 1);
  (close.props.onClick as () => void)();
  assert.equal(closes, 1);
});

test("built-in drawer associates and focuses each actual invalid config field", async () => {
  const fixtures: readonly Readonly<{
    kind: BuiltInPaymentMethodKind;
    field: "bankName" | "accountHolder" | "iban" | "instructions";
    invalidValue: string;
  }>[] = [
    { kind: "bank_transfer", field: "bankName", invalidValue: "A" },
    { kind: "bank_transfer", field: "accountHolder", invalidValue: "A" },
    { kind: "bank_transfer", field: "iban", invalidValue: "TR000006100519786457841326" },
    { kind: "bank_transfer", field: "instructions", invalidValue: "x".repeat(501) },
    { kind: "cash_on_delivery", field: "instructions", invalidValue: "x".repeat(501) },
  ];

  for (const fixture of fixtures) {
    let submissions = 0;
    const drawer = await compileBuiltInDrawer({
      kind: fixture.kind,
      method: null,
      canManage: true,
      busy: false,
      onSubmit() { submissions += 1; },
      onClose() {},
    });
    Object.assign(drawer.values, {
      label: fixture.kind === "bank_transfer" ? "Banka havalesi" : "Kapıda ödeme",
      bankName: "Örnek Bankası",
      accountHolder: "Örnek Ticaret Ltd. Şti.",
      iban: "TR330006100519786457841326",
      instructions: "Sipariş numaranızı yazın.",
      [fixture.field]: fixture.invalidValue,
    });
    drawer.render();
    const invalidControl = drawer.nodes().find((node) =>
      (node.type === "input" || node.type === "textarea") && node.props.name === fixture.field);
    assert.ok(invalidControl);
    const form = drawer.nodes().find((node) => node.type === "form");
    assert.ok(form);
    (form.props.onSubmit as (event: unknown) => void)({
      preventDefault() {},
      currentTarget: {},
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(invalidControl.target.focusCount, 1, `${fixture.kind}:${fixture.field}`);
    assert.equal(submissions, 0);
    assert.equal(drawer.uuidCalls(), 0);
    const rendered = drawer.render();
    const associatedControl = drawer.nodes().find((node) =>
      (node.type === "input" || node.type === "textarea") && node.props.name === fixture.field);
    const alert = drawer.nodes().find((node) => node.props.role === "alert");
    assert.ok(associatedControl);
    assert.ok(alert);
    assert.equal(associatedControl.props["aria-invalid"], true);
    assert.equal(associatedControl.props["aria-describedby"], alert.props.id);
    assert.match(rendered.map(drawerText).join(""), /geçerli|bayt/i);
  }
});

test("built-in drawer contains Tab focus and handles backdrop, busy close suppression, and emergency notice", async () => {
  let closes = 0;
  const drawer = await compileBuiltInDrawer({
    kind: "bank_transfer",
    method: null,
    canManage: true,
    busy: false,
    onSubmit() {},
    onClose() { closes += 1; },
  });
  drawer.render();
  const dialog = drawer.nodes().find((node) => node.type === "aside");
  assert.ok(dialog);
  const focusable = drawer.nodes().filter((node) =>
    (node.type === "button" || node.type === "input" || node.type === "textarea")
    && node.props.disabled !== true);
  const first = focusable[0];
  const last = focusable.at(-1);
  assert.ok(first);
  assert.ok(last);
  drawer.documentState.activeElement = first.target;
  let prevented = 0;
  (dialog.props.onKeyDown as (event: unknown) => void)({
    key: "Tab",
    shiftKey: true,
    preventDefault() { prevented += 1; },
  });
  assert.equal(last.target.focusCount, 1);
  drawer.documentState.activeElement = last.target;
  (dialog.props.onKeyDown as (event: unknown) => void)({
    key: "Tab",
    shiftKey: false,
    preventDefault() { prevented += 1; },
  });
  assert.equal(first.target.focusCount, 1);
  assert.equal(prevented, 2);

  const layer = drawer.nodes().find((node) => node.props.className === "drawerLayer");
  assert.ok(layer);
  const backdrop = {};
  (layer.props.onMouseDown as (event: unknown) => void)({ target: backdrop, currentTarget: backdrop });
  assert.equal(closes, 1);

  const busyDrawer = await compileBuiltInDrawer({
    kind: "cash_on_delivery",
    method: null,
    canManage: true,
    busy: true,
    onSubmit() {},
    onClose() { closes += 1; },
  });
  busyDrawer.render();
  const busyDialog = busyDrawer.nodes().find((node) => node.type === "aside");
  const busyLayer = busyDrawer.nodes().find((node) => node.props.className === "drawerLayer");
  const busyClose = busyDrawer.nodes().find((node) =>
    node.type === "button" && node.props["aria-label"] === "Yerleşik yöntem penceresini kapat");
  assert.ok(busyDialog);
  assert.ok(busyLayer);
  assert.ok(busyClose);
  assert.equal(busyDialog.target.focusCount, 1);
  (busyDialog.props.onKeyDown as (event: unknown) => void)({ key: "Escape", preventDefault() {} });
  (busyLayer.props.onMouseDown as (event: unknown) => void)({ target: backdrop, currentTarget: backdrop });
  (busyClose.props.onClick as () => void)();
  assert.equal(closes, 1);

  const emergency = Object.freeze({
    ...method("51000000-0000-4000-8000-000000000071", 0),
    state: "emergency_disabled" as const,
    emergencyReason: "Risk kontrolü",
  });
  const emergencyDrawer = await compileBuiltInDrawer({
    kind: "cash_on_delivery",
    method: emergency,
    canManage: true,
    busy: false,
    onSubmit() {},
    onClose() {},
  });
  const emergencyTree = emergencyDrawer.render();
  assert.match(emergencyTree.map(drawerText).join(""), /Acil durum kapatması.*korunur/);
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
