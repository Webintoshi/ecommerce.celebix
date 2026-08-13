import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";
import * as React from "react";
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

import type {
  BuiltInPaymentMethodKind,
  MerchantPaymentMethod,
  MerchantProviderDescriptor,
  MerchantProviderProfile,
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

function verificationIyzicoDescriptor(): MerchantProviderDescriptor {
  return Object.freeze({
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
    executionAuthority: null,
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
    config: Object.freeze({
      environment,
      locale: "tr",
      threeDSecure: "provider_managed",
      installmentMode: "all",
      maxInstallment: 0,
    }),
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
    isConnected: boolean;
    tagName: string;
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
    useCallback<T>(callback: T, deps: readonly unknown[]) {
      const index = cursor++;
      const prior = slots[index] as { deps: readonly unknown[]; value: T } | undefined;
      if (prior !== undefined && sameDeps(prior.deps, deps)) return prior.value;
      slots[index] = { deps: [...deps], value: callback };
      return callback;
    },
    useMemo<T>(factory: () => T, deps: readonly unknown[]) {
      const index = cursor++;
      const prior = slots[index] as { deps: readonly unknown[]; value: T } | undefined;
      if (prior !== undefined && sameDeps(prior.deps, deps)) return prior.value;
      const value = factory();
      slots[index] = { deps: [...deps], value };
      return value;
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
    isConnected: true,
    tagName: node.type.toUpperCase(),
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
  mutationAvailable?: boolean;
  submitError?: string | null;
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

async function compileRealDomBuiltInDrawer() {
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
  const contracts = await import("@celebix/saas-contracts");
  const Icon = (props: Record<string, unknown>) => createElement("svg", props);
  const styles = new Proxy({}, {
    get: (_target, property) =>
      property === "__esModule" ? true : property === "default" ? styles : String(property),
  });
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return React;
    if (specifier === "lucide-react") return new Proxy({}, { get: () => Icon });
    if (specifier === "@celebix/saas-contracts") return contracts;
    if (specifier === "./payment-settings.module.css") return styles;
    throw new Error(`unexpected_real_dom_built_in_drawer_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(
    requireModule,
    compiled,
    compiled.exports,
  );
  const Drawer = compiled.exports.BuiltInPaymentMethodDrawer;
  assert.equal(typeof Drawer, "function");
  return Drawer as (props: Readonly<Record<string, unknown>>) => ReactNode;
}

function installDomGlobals(window: Window): () => void {
  const replacements = {
    window,
    document: window.document,
    navigator: window.navigator,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    FormData: window.FormData,
    MutationObserver: window.MutationObserver,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    IS_REACT_ACT_ENVIRONMENT: true,
  } as const;
  const originals = new Map<PropertyKey, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries(replacements)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  return () => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  };
}

async function compilePaymentCatalogDialog(input: Readonly<Record<string, unknown>>) {
  const output = ts.transpileModule(
    await source("components/settings/payment/PaymentProviderCatalogDialog.tsx"),
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
  const Image = (props: Record<string, unknown>) => createElement("img", props);
  const Icon = (props: Record<string, unknown>) => createElement("svg", props);
  const styles = new Proxy({}, {
    get: (_target, property) =>
      property === "__esModule" ? true : property === "default" ? styles : String(property),
  });
  const documentState = {
    activeElement: null as unknown,
    body: { style: { overflow: "visible" } },
  };
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return hooks.runtime;
    if (specifier === "next/image") return { __esModule: true, default: Image };
    if (specifier === "lucide-react") return new Proxy({}, { get: () => Icon });
    if (specifier === "./payment-settings.module.css") return styles;
    throw new Error(`unexpected_payment_catalog_import:${specifier}`);
  };
  Function(
    "require",
    "module",
    "exports",
    "document",
    output,
  )(requireModule, compiled, compiled.exports, documentState);
  const Dialog = compiled.exports.PaymentProviderCatalogDialog as
    (props: Readonly<Record<string, unknown>>) => ReactNode;
  assert.equal(typeof Dialog, "function");
  let mounted: readonly (DrawerNode | string)[] = [];
  return {
    render() {
      mounted = mountDrawer(hooks.flush(() => Dialog(input)), documentState);
      hooks.runEffects();
      return mounted;
    },
    nodes() {
      return drawerNodes(mounted);
    },
  };
}

async function compilePaymentOrderDialog(input: Readonly<{
  methods: readonly MerchantPaymentMethod[];
  rows: ReturnType<typeof buildPaymentSettingsViewModel>["methods"];
  mutationAvailable: boolean;
  mutationBusy: boolean;
}>) {
  const output = ts.transpileModule(
    await source("components/settings/payment/PaymentMethodOrderDialog.tsx"),
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
  const paymentClient = await import("./payment-method-ui/client.ts");
  const state = await import("./payment-settings-ui/console-state.ts");
  const Icon = (props: Record<string, unknown>) => createElement("svg", props);
  const styles = new Proxy({}, {
    get: (_target, property) =>
      property === "__esModule" ? true : property === "default" ? styles : String(property),
  });
  const documentState = {
    activeElement: null as unknown,
    body: { style: { overflow: "visible" } },
  };
  const reorderCalls: unknown[] = [];
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return hooks.runtime;
    if (specifier === "lucide-react") return new Proxy({}, { get: () => Icon });
    if (specifier === "@/lib/payment-method-ui/client") {
      return {
        PaymentMethodApiError: paymentClient.PaymentMethodApiError,
        paymentMethodApi: Object.freeze({
          async reorder(command: unknown) { reorderCalls.push(command); },
        }),
      };
    }
    if (specifier === "@/lib/payment-settings-ui/console-state") return state;
    if (specifier === "./payment-settings.module.css") return styles;
    throw new Error(`unexpected_payment_order_import:${specifier}`);
  };
  Function("require", "module", "exports", "document", output)(
    requireModule,
    compiled,
    compiled.exports,
    documentState,
  );
  const Dialog = compiled.exports.PaymentMethodOrderDialog as
    (props: Readonly<Record<string, unknown>>) => ReactNode;
  assert.equal(typeof Dialog, "function");
  let authority = Object.freeze({
    mutationAvailable: input.mutationAvailable,
    mutationBusy: input.mutationBusy,
  });
  let mounted: readonly (DrawerNode | string)[] = [];
  return {
    reorderCalls,
    setAuthority(mutationAvailable: boolean, mutationBusy: boolean) {
      authority = Object.freeze({ mutationAvailable, mutationBusy });
    },
    render(force = false) {
      mounted = mountDrawer(hooks.flush(() => Dialog({
        methods: input.methods,
        rows: input.rows,
        canManage: true,
        openerRef: { current: null },
        ...authority,
        async onReload() {},
        onClose() {},
      }), force), documentState);
      hooks.runEffects();
      return mounted;
    },
    nodes() { return drawerNodes(mounted); },
  };
}

async function compilePaymentConsole(input: Readonly<{
  methods: readonly MerchantPaymentMethod[] | "error";
  reloadedMethods?: readonly MerchantPaymentMethod[] | "error";
  definitions?: readonly MerchantProviderDescriptor[];
  profiles?: readonly MerchantProviderProfile[];
  catalogError?: boolean;
  deferReload?: boolean;
  saveError?: "conflict" | "duplicate" | "ambiguous";
  savedVersion?: number;
}>) {
  const [consoleSource, catalogSource] = await Promise.all([
    source("components/settings/payment/PaymentSettingsConsole.tsx"),
    source("components/settings/payment/PaymentProviderCatalogDialog.tsx"),
  ]);
  const output = ts.transpileModule(
    consoleSource,
    {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const catalogOutput = ts.transpileModule(
    catalogSource,
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
  const paymentClient = await import("./payment-method-ui/client.ts");
  const state = await import("./payment-settings-ui/console-state.ts");
  const model = await import("./payment-settings-ui/model.ts");
  const providerPreferences = await import("./payment-settings-ui/provider-preferences.ts");
  const builtInController = await import("./built-in-payment-methods/controller.ts");
  const Image = (props: Record<string, unknown>) => createElement("img", props);
  const Icon = (props: Record<string, unknown>) => createElement("svg", props);
  const Host = (name: string) => (props: Record<string, unknown>) =>
    createElement(name, props, props.children as ReactNode);
  const styles = new Proxy({}, {
    get: (_target, property) =>
      property === "__esModule" ? true : property === "default" ? styles : String(property),
  });
  const documentState = {
    activeElement: null as unknown,
    body: { style: { overflow: "visible" } },
  };
  const windowState = {
    confirm() { return true; },
    prompt() { return "Operasyon kontrolü"; },
    history: { replaceState() {} },
  };
  const events: string[] = [];
  const mutations: unknown[] = [];
  const animationFrames: Array<() => void> = [];
  let listCalls = 0;
  let releaseReload: (() => void) | null = null;
  const reloadGate = new Promise<void>((resolve) => { releaseReload = resolve; });
  const api = Object.freeze({
    async catalog() {
      if (input.catalogError) throw new Error("provider_catalog_unavailable");
      return PAYMENT_PROVIDER_CATALOG;
    },
    async list() {
      listCalls += 1;
      events.push(listCalls === 1 ? "list:initial" : "list:reload");
      if (listCalls > 1 && input.deferReload !== false) await reloadGate;
      const result = listCalls === 1 ? input.methods : input.reloadedMethods ?? input.methods;
      if (result === "error") throw new Error("payment_methods_unavailable");
      return result;
    },
    async save(command: Readonly<{ methodId: string; expectedVersion: number }>) {
      events.push("save");
      mutations.push(Object.freeze({ operation: "save", command }));
      if (input.saveError) {
        throw new paymentClient.PaymentMethodApiError(
          input.saveError === "conflict"
            ? "version_conflict"
            : input.saveError === "duplicate" ? "method_already_exists" : "unavailable",
          input.saveError === "ambiguous" ? 503 : 409,
        );
      }
      const existing = input.methods === "error"
        ? undefined
        : input.methods.find(({ id }) => id === command.methodId);
      return Object.freeze({
        id: command.methodId,
        state: existing?.state ?? "disabled",
        position: existing?.position ?? (input.methods === "error" ? 0 : input.methods.length),
        version: input.savedVersion ?? command.expectedVersion + 1,
        updatedAt: NOW,
        replayed: false,
      });
    },
    async setState(methodId: string, command: Readonly<{ state: MerchantPaymentMethod["state"]; expectedVersion: number }>) {
      events.push("set-state");
      mutations.push(Object.freeze({ operation: "set-state", methodId, command }));
      return Object.freeze({
        id: methodId,
        state: command.state,
        position: input.methods === "error" ? 0 : input.methods.length,
        version: command.expectedVersion + 1,
        updatedAt: NOW,
        replayed: false,
      });
    },
    async reorder() { throw new Error("reorder_not_expected"); },
  });
  const catalogCompiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireCatalogModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return hooks.runtime;
    if (specifier === "next/image") return { __esModule: true, default: Image };
    if (specifier === "lucide-react") return new Proxy({}, { get: () => Icon });
    if (specifier === "./payment-settings.module.css") return styles;
    throw new Error(`unexpected_nested_payment_catalog_import:${specifier}`);
  };
  Function(
    "require",
    "module",
    "exports",
    "document",
    catalogOutput,
  )(requireCatalogModule, catalogCompiled, catalogCompiled.exports, documentState);
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  class TestIyzicoError extends Error {}
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return hooks.runtime;
    if (specifier === "next/image") return { __esModule: true, default: Image };
    if (specifier === "lucide-react") return new Proxy({}, { get: () => Icon });
    if (specifier === "@celebix/saas-contracts") return contracts;
    if (specifier === "@/components/panel/PanelTopbarChrome") {
      return { PanelTopbarBridge: Host("panel-topbar") };
    }
    if (specifier === "@/lib/payment-method-ui/client") {
      return { PaymentMethodApiError: paymentClient.PaymentMethodApiError, paymentMethodApi: api };
    }
    if (specifier === "@/lib/payment-settings-ui/console-state") return state;
    if (specifier === "@/lib/payment-settings-ui/model") return model;
    if (specifier === "@/lib/payment-settings-ui/provider-preferences") {
      return providerPreferences;
    }
    if (specifier === "@/lib/provider-execution-ui/client") {
      return {
        providerExecutionApi: Object.freeze({
          async definitions() { return input.definitions ?? Object.freeze([]); },
          async profiles() { return input.profiles ?? Object.freeze([]); },
        }),
      };
    }
    if (specifier === "@/lib/iyzico-activation-ui/client") {
      return {
        IyzicoActivationApiError: TestIyzicoError,
        iyzicoActivationApi: Object.freeze({
          async current() { throw new Error("iyzico_not_expected"); },
          async activate() { throw new Error("iyzico_not_expected"); },
          async begin() { throw new Error("iyzico_not_expected"); },
        }),
      };
    }
    if (specifier === "@/lib/built-in-payment-methods/controller") return builtInController;
    if (specifier === "./BuiltInPaymentMethodDrawer") {
      return { BuiltInPaymentMethodDrawer: Host("built-in-drawer") };
    }
    if (specifier === "./PaymentMethodOrderDialog") {
      return { PaymentMethodOrderDialog: Host("order-dialog") };
    }
    if (specifier === "./PaymentProviderCatalogDialog") {
      return catalogCompiled.exports;
    }
    if (specifier === "./PaymentProviderConnectionDrawer") {
      return { PaymentProviderConnectionDrawer: Host("connection-drawer") };
    }
    if (specifier === "./ProviderCheckoutSettingsDrawer") {
      return { ProviderCheckoutSettingsDrawer: Host("checkout-settings-drawer") };
    }
    if (specifier === "./payment-settings.module.css") return styles;
    throw new Error(`unexpected_payment_console_import:${specifier}`);
  };
  Function(
    "require",
    "module",
    "exports",
    "document",
    "window",
    "requestAnimationFrame",
    output,
  )(
    requireModule,
    compiled,
    compiled.exports,
    documentState,
    windowState,
    (callback: () => void) => { animationFrames.push(callback); },
  );
  const Console = compiled.exports.PaymentSettingsConsole as
    (props: Readonly<Record<string, unknown>>) => ReactNode;
  assert.equal(typeof Console, "function");
  let mounted: readonly (DrawerNode | string)[] = [];
  const render = (force = false) => {
    mounted = mountDrawer(hooks.flush(() => Console({
      canManage: true,
      storefrontHostname: "shop.example.test",
    }), force), documentState);
    hooks.runEffects();
    return mounted;
  };
  return {
    events,
    mutations,
    documentState,
    render,
    nodes() {
      return drawerNodes(mounted);
    },
    async settle() {
      await new Promise<void>((resolve) => setImmediate(resolve));
      return render();
    },
    releaseReload() {
      releaseReload?.();
    },
    flushAnimationFrames() {
      for (const callback of animationFrames.splice(0)) callback();
    },
  };
}

test("mounted payment catalog keeps two built-in methods before provider filters and outside provider failures", async () => {
  const selected: BuiltInPaymentMethodKind[] = [];
  const cards = buildPaymentSettingsViewModel(
    PAYMENT_PROVIDER_CATALOG,
    [],
    [],
    [method("40000000-0000-4000-8000-000000000015", 0)],
    "",
    Object.freeze({
      category: "all",
      interactionMode: "all",
      readiness: "all",
      environment: "all",
    }),
  ).catalog.cards;
  const dialog = await compilePaymentCatalogDialog({
    cards,
    builtInCards: Object.freeze([
      Object.freeze({
        kind: "cash_on_delivery",
        label: "Kapıda ödeme",
        description: "Müşteriler siparişlerini teslim alırken ödeme yapar.",
        configured: true,
        active: true,
        available: true,
        actionLabel: "Yapılandırıldı",
      }),
      Object.freeze({
        kind: "bank_transfer",
        label: "Banka havalesi",
        description: "Müşteriler banka hesabınıza havale veya EFT ile ödeme yapar.",
        configured: false,
        active: false,
        available: true,
        actionLabel: "Ekle",
      }),
    ]),
    totalCount: 58,
    query: "",
    filters: Object.freeze({
      category: "all",
      interactionMode: "all",
      readiness: "all",
      environment: "all",
    }),
    phase: "error",
    canManage: true,
    mutationAvailable: true,
    providerConfigurationAvailable: true,
    busy: false,
    openerRef: { current: null },
    onQuery() {},
    onFilters() {},
    onConnect() {},
    onBuiltInSelect(kind: BuiltInPaymentMethodKind) { selected.push(kind); },
    onClose() {},
  });
  const tree = dialog.render();
  const nodes = dialog.nodes();
  const builtInHeading = nodes.find((node) => node.type === "h3" && drawerText(node) === "Yerleşik yöntemler");
  const builtInSurface = nodes.find((node) => node.props.className === "catalogBuiltInBody");
  const builtInCards = nodes.filter((node) => node.type === "article" && node.props.className === "builtInCard");
  const filters = nodes.find((node) => node.props.className === "catalogFilters");
  const providerResults = nodes.find((node) => node.props.className === "catalogResults");
  assert.ok(builtInHeading);
  assert.ok(builtInSurface);
  assert.equal(builtInCards.length, 2);
  assert.ok(filters);
  assert.ok(providerResults);
  assert.ok(nodes.indexOf(builtInHeading) < nodes.indexOf(filters));
  assert.match(tree.map(drawerText).join(""), /58 entegrasyon|58 \/ 58 entegrasyon/);
  assert.match(tree.map(drawerText).join(""), /Yapılandırıldı/);

  const builtInButtons = nodes.filter((node) =>
    node.type === "button"
    && (drawerText(node) === "Yapılandırıldı" || drawerText(node) === "Ekle"));
  assert.equal(builtInButtons.length, 2);
  assert.equal(builtInButtons.every((button) => button.props.disabled !== true), true);
  for (const button of builtInButtons) (button.props.onClick as () => void)();
  assert.deepEqual(selected, ["cash_on_delivery", "bank_transfer"]);
});

test("mounted payment console opens built-in create and edit drawers and reloads before success", async () => {
  const cash = method("40000000-0000-4000-8000-000000000015", 0);
  const provider = iyzicoMethod("active");
  const reloadedCash = Object.freeze({ ...cash, label: "Teslimatta ödeme", version: cash.version + 1 });
  const console = await compilePaymentConsole({
    methods: Object.freeze([cash, provider]),
    reloadedMethods: Object.freeze([reloadedCash, provider]),
  });

  console.render();
  await console.settle();
  const rows = console.nodes().filter((node) => node.type === "tr" && drawerText(node).includes("Etkin"));
  const cashRow = rows.find((row) => drawerText(row).includes(cash.label));
  const providerRow = rows.find((row) => drawerText(row).includes(provider.label));
  assert.ok(cashRow);
  assert.ok(providerRow);
  assert.equal(drawerText(cashRow).includes("Düzenle"), true);
  assert.equal(drawerText(providerRow).includes("Düzenle"), false);
  const edit = drawerNodes(cashRow.children).find((node) =>
    node.type === "button" && drawerText(node) === "Düzenle");
  assert.ok(edit);
  console.documentState.activeElement = edit.target;
  (edit.props.onClick as (event: unknown) => void)({ currentTarget: edit.target });
  console.render();
  let drawer = console.nodes().find((node) => node.type === "built-in-drawer");
  assert.ok(drawer);
  assert.equal(drawer.props.method, cash);
  (drawer.props.onClose as () => void)();
  console.render();
  console.flushAnimationFrames();
  assert.equal(edit.target.focusCount, 1, "closing an edit drawer must restore its live row control");

  let add = console.nodes().find((node) =>
    node.type === "button" && drawerText(node) === "Ödeme Yöntemi Ekle");
  assert.ok(add);
  (add.props.onClick as () => void)();
  console.render();
  const catalog = console.nodes().find((node) =>
    node.props.role === "dialog" && node.props["aria-labelledby"] === "payment-catalog-title");
  assert.ok(catalog);
  const bankButton = drawerNodes(catalog.children).find((node) =>
    node.type === "button" && drawerText(node) === "Ekle");
  assert.ok(bankButton);
  console.documentState.activeElement = bankButton.target;
  (bankButton.props.onClick as () => void)();
  console.render();
  drawer = console.nodes().find((node) => node.type === "built-in-drawer");
  assert.ok(drawer);
  assert.equal(drawer.props.kind, "bank_transfer");
  assert.equal(drawer.props.method, null);
  (drawer.props.onClose as () => void)();
  console.render();
  console.flushAnimationFrames();
  assert.equal(bankButton.target.focusCount, 1, "catalog drawer cancel must restore its built-in button");

  const reloadedCashRow = console.nodes().find((node) =>
    node.type === "tr" && drawerText(node).includes(cash.label));
  assert.ok(reloadedCashRow);
  const reloadedEdit = drawerNodes(reloadedCashRow.children).find((node) =>
    node.type === "button" && drawerText(node) === "Düzenle");
  assert.ok(reloadedEdit);
  (reloadedEdit.props.onClick as (event: unknown) => void)({ currentTarget: reloadedEdit.target });
  console.render();
  drawer = console.nodes().find((node) => node.type === "built-in-drawer");
  assert.ok(drawer);
  assert.equal(drawer.props.method, cash);
  const pending = (drawer.props.onSubmit as (value: unknown) => Promise<void>)(Object.freeze({
    kind: "cash_on_delivery",
    method: cash,
    methodId: cash.id,
    label: "Teslimatta ödeme",
    config: Object.freeze({ instructions: "Teslimat sırasında ödeme yapın." }),
  }));
  console.render();
  drawer = console.nodes().find((node) => node.type === "built-in-drawer");
  assert.ok(drawer);
  assert.equal(drawer.props.busy, true);

  await new Promise<void>((resolve) => setImmediate(resolve));
  console.render();
  assert.deepEqual(console.events, ["list:initial", "save", "list:reload"]);
  assert.doesNotMatch(console.render().map(drawerText).join(""), /Yerleşik ödeme yöntemi güncellendi/);

  console.releaseReload();
  await pending;
  console.render();
  console.flushAnimationFrames();
  assert.match(console.render().map(drawerText).join(""), /Yerleşik ödeme yöntemi güncellendi/);
  assert.equal(console.nodes().some((node) => node.type === "built-in-drawer"), false);
  assert.equal(reloadedEdit.target.focusCount, 1, "successful edit must restore its initiating control");
});

test("mounted payment console saves provider checkout preferences and renders canonical summary", async () => {
  const provider = iyzicoMethod("active");
  const reloadedProvider = Object.freeze({
    ...provider,
    version: provider.version + 1,
    config: Object.freeze({
      environment: "test" as const,
      locale: "en" as const,
      threeDSecure: "provider_managed" as const,
      installmentMode: "limited" as const,
      maxInstallment: 6 as const,
    }),
  });
  const console = await compilePaymentConsole({
    methods: Object.freeze([provider]),
    reloadedMethods: Object.freeze([reloadedProvider]),
    deferReload: false,
  });

  console.render();
  await console.settle();
  let row = console.nodes().find((node) =>
    node.type === "tr" && drawerText(node).includes(provider.label));
  assert.ok(row);
  assert.match(drawerText(row), /Türkçe · Tüm uygun taksitler · 3D sağlayıcıda/);
  const open = drawerNodes(row.children).find((node) =>
    node.type === "button" && drawerText(node) === "Checkout ayarları");
  assert.ok(open);
  (open.props.onClick as (event: unknown) => void)({ currentTarget: open.target });
  console.render();
  const drawer = console.nodes().find((node) => node.type === "checkout-settings-drawer");
  assert.ok(drawer);
  assert.equal(drawer.props.method, provider);

  await (drawer.props.onSubmit as (value: unknown) => Promise<void>)(Object.freeze({
    locale: "en",
    installmentMode: "limited",
    maxInstallment: 6,
  }));
  console.render();
  assert.deepEqual(console.events, ["list:initial", "save", "list:reload"]);
  assert.deepEqual(console.mutations, [Object.freeze({
    operation: "save",
    command: Object.freeze({
      methodId: provider.id,
      expectedVersion: provider.version,
      kind: "provider",
      profileId: provider.profileId,
      providerCode: provider.providerCode,
      label: provider.label,
      config: Object.freeze({
        environment: "test",
        locale: "en",
        threeDSecure: "provider_managed",
        installmentMode: "limited",
        maxInstallment: 6,
      }),
    }),
  })]);
  assert.equal(console.nodes().some((node) => node.type === "checkout-settings-drawer"), false);
  assert.match(console.render().map(drawerText).join(""), /Checkout ayarları yeni ödeme işlemleri için kaydedildi/);
  row = console.nodes().find((node) =>
    node.type === "tr" && drawerText(node).includes(provider.label));
  assert.ok(row);
  assert.match(drawerText(row), /English · En fazla 6 taksit · 3D sağlayıcıda/);
});

test("mounted payment console keeps provider drawer open on version conflict and refreshes authority", async () => {
  const provider = iyzicoMethod("active");
  const reloadedProvider = Object.freeze({
    ...provider,
    version: provider.version + 1,
    config: Object.freeze({
      environment: "test" as const,
      locale: "tr" as const,
      threeDSecure: "provider_managed" as const,
      installmentMode: "single_payment" as const,
      maxInstallment: 0 as const,
    }),
  });
  const console = await compilePaymentConsole({
    methods: Object.freeze([provider]),
    reloadedMethods: Object.freeze([reloadedProvider]),
    deferReload: false,
    saveError: "conflict",
  });
  console.render();
  await console.settle();
  const open = console.nodes().find((node) =>
    node.type === "button" && drawerText(node) === "Checkout ayarları");
  assert.ok(open);
  (open.props.onClick as (event: unknown) => void)({ currentTarget: open.target });
  console.render();
  let drawer = console.nodes().find((node) => node.type === "checkout-settings-drawer");
  assert.ok(drawer);
  await (drawer.props.onSubmit as (value: unknown) => Promise<void>)(Object.freeze({
    locale: "en",
    installmentMode: "limited",
    maxInstallment: 9,
  }));
  console.render();
  drawer = console.nodes().find((node) => node.type === "checkout-settings-drawer");
  assert.ok(drawer);
  assert.equal(drawer.props.method, reloadedProvider);
  assert.match(String(drawer.props.submitError), /Ayarlar değiştirilmedi/);
  assert.deepEqual(console.events, ["list:initial", "save", "list:reload"]);
  assert.equal(console.mutations.length, 1, "a version conflict must never cause a blind retry");
});

test("mounted console separates provider failure from unknown payment-method authority", async () => {
  const providerFailure = await compilePaymentConsole({
    methods: Object.freeze([]),
    catalogError: true,
  });
  providerFailure.render();
  await providerFailure.settle();
  const providerAdd = providerFailure.nodes().find((node) =>
    node.type === "button" && drawerText(node) === "Ödeme Yöntemi Ekle");
  assert.ok(providerAdd);
  assert.notEqual(providerAdd.props.disabled, true);
  (providerAdd.props.onClick as () => void)();
  providerFailure.render();
  const providerBuiltIns = providerFailure.nodes().filter((node) =>
    node.type === "button" && drawerText(node) === "Ekle");
  assert.equal(providerBuiltIns.length, 2);
  assert.equal(providerBuiltIns.every((button) => button.props.disabled !== true), true);

  const methodFailure = await compilePaymentConsole({ methods: "error" });
  methodFailure.render();
  await methodFailure.settle();
  const methodAdd = methodFailure.nodes().find((node) =>
    node.type === "button" && drawerText(node) === "Ödeme Yöntemi Ekle");
  assert.ok(methodAdd);
  (methodAdd.props.onClick as () => void)();
  methodFailure.render();
  const unavailable = methodFailure.nodes().filter((node) =>
    node.type === "button" && drawerText(node) === "Kullanılamıyor");
  assert.equal(unavailable.length, 2);
  assert.equal(unavailable.every((button) => button.props.disabled === true), true);
  assert.equal(methodFailure.nodes().some((node) => node.type === "built-in-drawer"), false);
});

test("mounted console keeps provider profile configuration usable during a method-list outage", async () => {
  const console = await compilePaymentConsole({
    methods: "error",
    reloadedMethods: "error",
    deferReload: false,
    definitions: Object.freeze([verificationIyzicoDescriptor()]),
    profiles: Object.freeze([iyzicoProfile()]),
  });
  console.render();
  await console.settle();
  const add = console.nodes().find((node) =>
    node.type === "button" && drawerText(node) === "Ödeme Yöntemi Ekle");
  assert.ok(add);
  (add.props.onClick as () => void)();
  console.render();

  const providerCard = console.nodes().find((node) =>
    node.type === "article" && drawerText(node).includes("Checkout Form"));
  assert.ok(providerCard);
  const configure = drawerNodes(providerCard.children).find((node) =>
    node.type === "button" && drawerText(node) === "Bilgileri gir");
  assert.ok(configure, `expected provider configuration action in: ${drawerText(providerCard)}`);
  assert.notEqual(configure.props.disabled, true);
  (configure.props.onClick as () => void)();
  console.render();

  let drawer = console.nodes().find((node) => node.type === "connection-drawer");
  assert.ok(drawer, "provider configuration must not depend on payment-method state authority");
  await (drawer.props.onSaved as () => Promise<void>)();
  console.render();
  drawer = console.nodes().find((node) => node.type === "connection-drawer");
  assert.ok(drawer, "a profile save reload may fail its methods slice without blocking provider configuration");
  assert.deepEqual(console.events, ["list:initial", "list:reload"]);
});

test("mounted console disables both order launchers and guards reopening during canonical reload", async () => {
  const cash = method("40000000-0000-4000-8000-000000000071", 0);
  const console = await compilePaymentConsole({ methods: Object.freeze([cash]) });
  console.render();
  await console.settle();
  let orderButtons = console.nodes().filter((node) =>
    node.type === "button" && drawerText(node) === "Önizleme ve Sıralama");
  assert.equal(orderButtons.length, 2);
  assert.equal(orderButtons.every((button) => button.props.disabled !== true), true);
  (orderButtons[0]!.props.onClick as () => void)();
  console.render();
  let dialog = console.nodes().find((node) => node.type === "order-dialog");
  assert.ok(dialog);

  const emergency = console.nodes().find((node) =>
    node.type === "button" && drawerText(node) === "Acil kapat");
  assert.ok(emergency);
  (emergency.props.onClick as () => void)();
  await new Promise<void>((resolve) => setImmediate(resolve));
  console.render();
  assert.deepEqual(console.events, ["list:initial", "set-state", "list:reload"]);

  dialog = console.nodes().find((node) => node.type === "order-dialog");
  assert.ok(dialog);
  assert.equal(dialog.props.mutationAvailable, false);
  assert.equal(dialog.props.mutationBusy, true);
  (dialog.props.onClose as () => void)();
  console.render();
  orderButtons = console.nodes().filter((node) =>
    node.type === "button" && drawerText(node) === "Önizleme ve Sıralama");
  assert.equal(orderButtons.length, 2);
  assert.equal(orderButtons.every((button) => button.props.disabled === true), true);
  for (const button of orderButtons) (button.props.onClick as () => void)();
  console.render();
  assert.equal(console.nodes().some((node) => node.type === "order-dialog"), false);
});

test("mounted order dialog blocks stale reordering after method authority is withdrawn", async () => {
  const cash = method("40000000-0000-4000-8000-000000000081", 0);
  const bank = Object.freeze({
    ...method("40000000-0000-4000-8000-000000000082", 1),
    kind: "bank_transfer" as const,
    label: "Banka havalesi",
  });
  const methods = Object.freeze([cash, bank]);
  const rows = buildPaymentSettingsViewModel(
    [], [], [], methods, "",
    Object.freeze({
      category: "all" as const,
      interactionMode: "all" as const,
      readiness: "all" as const,
      environment: "all" as const,
    }),
  ).methods;
  const dialog = await compilePaymentOrderDialog({
    methods,
    rows,
    mutationAvailable: true,
    mutationBusy: false,
  });
  dialog.render();
  const moveDown = dialog.nodes().find((node) =>
    node.type === "button" && node.props["aria-label"] === `${cash.label} yöntemini aşağı taşı`);
  assert.ok(moveDown);
  (moveDown.props.onClick as () => void)();
  dialog.render();

  dialog.setAuthority(false, true);
  dialog.render(true);
  const save = dialog.nodes().find((node) =>
    node.type === "button" && drawerText(node) === "Kaydet");
  assert.ok(save);
  assert.equal(save.props.disabled, true);
  assert.equal(dialog.nodes().filter((node) =>
    node.type === "button" && /yukarı taşı|aşağı taşı/.test(String(node.props["aria-label"])))
    .every((button) => button.props.disabled === true), true);
  (save.props.onClick as () => void)();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(dialog.reorderCalls.length, 0);
});

test("mounted console removes duplicate built-in edit paths without crashing", async () => {
  const active = method("40000000-0000-4000-8000-000000000031", 0);
  const disabled = Object.freeze({
    ...method("40000000-0000-4000-8000-000000000032", 1),
    state: "disabled" as const,
  });
  const console = await compilePaymentConsole({ methods: Object.freeze([active, disabled]) });
  console.render();
  await console.settle();

  const cashRows = console.nodes().filter((node) =>
    node.type === "tr" && (drawerText(node).includes(active.label) || drawerText(node).includes(disabled.label)));
  assert.equal(cashRows.length, 2);
  assert.equal(cashRows.every((row) => !drawerText(row).includes("Düzenle")), true);
  const add = console.nodes().find((node) =>
    node.type === "button" && drawerText(node) === "Ödeme Yöntemi Ekle");
  assert.ok(add);
  (add.props.onClick as () => void)();
  console.render();
  const unavailable = console.nodes().find((node) =>
    node.type === "button" && drawerText(node) === "Kullanılamıyor");
  assert.ok(unavailable);
  assert.equal(unavailable.props.disabled, true);
});

test("mounted console retains edit identity and withholds success when canonical method reload fails", async () => {
  const cash = method("40000000-0000-4000-8000-000000000041", 0);
  const console = await compilePaymentConsole({
    methods: Object.freeze([cash]),
    reloadedMethods: "error",
    deferReload: false,
  });
  console.render();
  await console.settle();
  const row = console.nodes().find((node) => node.type === "tr" && drawerText(node).includes(cash.label));
  assert.ok(row);
  const edit = drawerNodes(row.children).find((node) =>
    node.type === "button" && drawerText(node) === "Düzenle");
  assert.ok(edit);
  (edit.props.onClick as (event: unknown) => void)({ currentTarget: edit.target });
  console.render();
  let drawer = console.nodes().find((node) => node.type === "built-in-drawer");
  assert.ok(drawer);
  await (drawer.props.onSubmit as (value: unknown) => Promise<void>)(Object.freeze({
    kind: "cash_on_delivery",
    method: cash,
    methodId: cash.id,
    label: "Teslimatta ödeme",
    config: Object.freeze({ instructions: "Teslimatta ödeyin." }),
  }));
  console.render();

  drawer = console.nodes().find((node) => node.type === "built-in-drawer");
  assert.ok(drawer, "reload failure must retain the editor and its input");
  assert.equal(drawer.props.method, cash);
  assert.equal(drawer.props.mutationAvailable, false);
  assert.match(String(drawer.props.submitError), /Güncel ödeme yöntemleri yüklenemedi.*yeniden yüklemeyi deneyin/);
  assert.doesNotMatch(console.render().map(drawerText).join(""), /Yerleşik ödeme yöntemi güncellendi/);
});

test("mounted console owns conflict and ambiguous recovery errors inside the open drawer", async () => {
  for (const fixture of [
    { saveError: "conflict" as const, message: /başka bir işlem tarafından değiştirildi.*yeniden yüklen/ },
    { saveError: "ambiguous" as const, message: /sonucu doğrulanamadı.*yeniden yüklen/ },
  ]) {
    const cash = method(
      fixture.saveError === "conflict"
        ? "40000000-0000-4000-8000-000000000051"
        : "40000000-0000-4000-8000-000000000052",
      0,
    );
    const console = await compilePaymentConsole({
      methods: Object.freeze([cash]),
      reloadedMethods: Object.freeze([cash]),
      deferReload: false,
      saveError: fixture.saveError,
    });
    console.render();
    await console.settle();
    const row = console.nodes().find((node) => node.type === "tr" && drawerText(node).includes(cash.label));
    assert.ok(row);
    const edit = drawerNodes(row.children).find((node) =>
      node.type === "button" && drawerText(node) === "Düzenle");
    assert.ok(edit);
    (edit.props.onClick as (event: unknown) => void)({ currentTarget: edit.target });
    console.render();
    let drawer = console.nodes().find((node) => node.type === "built-in-drawer");
    assert.ok(drawer);
    await (drawer.props.onSubmit as (value: unknown) => Promise<void>)(Object.freeze({
      kind: "cash_on_delivery",
      method: cash,
      methodId: cash.id,
      label: cash.label,
      config: Object.freeze({ instructions: "Teslimatta ödeyin." }),
    }));
    console.render();
    drawer = console.nodes().find((node) => node.type === "built-in-drawer");
    assert.ok(drawer);
    assert.equal(drawer.props.mutationAvailable, true);
    assert.match(String(drawer.props.submitError), fixture.message);
  }
});

test("mounted create duplicate recovery reopens the one canonical kind independent of its attempted UUID", async () => {
  const attemptedId = "40000000-0000-4000-8000-000000000053";
  const canonical = Object.freeze({
    ...method("40000000-0000-4000-8000-000000000054", 0),
    label: "Mağazadaki kapıda ödeme",
    config: Object.freeze({ instructions: "Güncel teslimat talimatı." }),
    version: 7,
  });
  const console = await compilePaymentConsole({
    methods: Object.freeze([]),
    reloadedMethods: Object.freeze([canonical]),
    deferReload: false,
    saveError: "duplicate",
  });
  console.render();
  await console.settle();

  const add = console.nodes().find((node) =>
    node.type === "button" && drawerText(node) === "Ödeme Yöntemi Ekle");
  assert.ok(add);
  (add.props.onClick as () => void)();
  console.render();
  const cashCard = console.nodes().find((node) =>
    node.type === "article" && drawerText(node).includes("Kapıda ödeme"));
  assert.ok(cashCard);
  const cashButton = drawerNodes(cashCard.children).find((node) =>
    node.type === "button" && drawerText(node) === "Ekle");
  assert.ok(cashButton);
  (cashButton.props.onClick as () => void)();
  console.render();

  let drawer = console.nodes().find((node) => node.type === "built-in-drawer");
  assert.ok(drawer);
  assert.equal(drawer.props.method, null);
  await (drawer.props.onSubmit as (value: unknown) => Promise<void>)(Object.freeze({
    kind: "cash_on_delivery",
    method: null,
    methodId: attemptedId,
    label: "Yeni kapıda ödeme",
    config: Object.freeze({ instructions: "Gönderilmemesi gereken eski talimat." }),
  }));
  console.render();

  drawer = console.nodes().find((node) => node.type === "built-in-drawer");
  assert.ok(drawer);
  assert.equal(drawer.props.method, canonical);
  assert.equal(drawer.props.mutationAvailable, true);
  assert.match(String(drawer.props.submitError), /zaten mevcut|başka bir işlem.*yeniden yüklendi/i);
  assert.deepEqual(console.mutations, [Object.freeze({
    operation: "save",
    command: Object.freeze({
      methodId: attemptedId,
      expectedVersion: 0,
      kind: "cash_on_delivery",
      profileId: null,
      providerCode: null,
      label: "Yeni kapıda ödeme",
      config: Object.freeze({ instructions: "Gönderilmemesi gereken eski talimat." }),
    }),
  })]);
});

test("mounted create activates the exact version returned by save before canonical success", async () => {
  const created = Object.freeze({
    ...method("40000000-0000-4000-8000-000000000061", 0),
    config: Object.freeze({ instructions: "Teslimatta ödeyin." }),
    version: 8,
  });
  const console = await compilePaymentConsole({
    methods: Object.freeze([]),
    reloadedMethods: Object.freeze([created]),
    deferReload: false,
    savedVersion: 7,
  });
  console.render();
  await console.settle();
  const add = console.nodes().find((node) =>
    node.type === "button" && drawerText(node) === "Ödeme Yöntemi Ekle");
  assert.ok(add);
  (add.props.onClick as () => void)();
  console.render();
  const cashCard = console.nodes().find((node) =>
    node.type === "article" && drawerText(node).includes("Kapıda ödeme"));
  assert.ok(cashCard);
  const cashButton = drawerNodes(cashCard.children).find((node) =>
    node.type === "button" && drawerText(node) === "Ekle");
  assert.ok(cashButton);
  console.documentState.activeElement = cashButton.target;
  (cashButton.props.onClick as () => void)();
  console.render();
  const drawer = console.nodes().find((node) => node.type === "built-in-drawer");
  assert.ok(drawer);
  await (drawer.props.onSubmit as (value: unknown) => Promise<void>)(Object.freeze({
    kind: "cash_on_delivery",
    method: null,
    methodId: created.id,
    label: created.label,
    config: created.config,
  }));
  console.render();
  console.flushAnimationFrames();

  assert.deepEqual(console.mutations[1], Object.freeze({
    operation: "set-state",
    methodId: created.id,
    command: Object.freeze({ expectedVersion: 7, state: "active", emergencyReason: null }),
  }));
  assert.match(console.render().map(drawerText).join(""), /kaydedildi ve etkinleştirildi/);
  assert.equal(console.nodes().some((node) => node.type === "built-in-drawer"), false);
  assert.equal(cashButton.target.focusCount, 1);
});

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
    config: Object.freeze({
      environment: "test",
      locale: "tr",
      threeDSecure: "provider_managed",
      installmentMode: "all",
      maxInstallment: 0,
    }),
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

test("built-in drawer keeps editable input visible while an unavailable submit error is announced", async () => {
  const existing = method("51000000-0000-4000-8000-000000000081", 0);
  const drawer = await compileBuiltInDrawer({
    kind: "cash_on_delivery",
    method: existing,
    canManage: true,
    busy: false,
    mutationAvailable: false,
    submitError: "Güncel ödeme yöntemleri yüklenemedi. Pencereyi kapatıp yeniden yüklemeyi deneyin.",
    onSubmit() {},
    onClose() {},
  });

  const tree = drawer.render();
  const alert = drawer.nodes().find((node) => node.props.role === "alert");
  const label = drawer.nodes().find((node) => node.type === "input" && node.props.name === "label");
  const submit = drawer.nodes().find((node) => node.type === "button" && node.props.type === "submit");
  assert.ok(alert);
  assert.ok(label);
  assert.ok(submit);
  assert.match(tree.map(drawerText).join(""), /Güncel ödeme yöntemleri yüklenemedi.*yeniden yüklemeyi deneyin/);
  assert.notEqual(label.props.disabled, true, "recovery error must preserve editable input");
  assert.equal(submit.props.disabled, true, "unknown canonical state must block replay");
});

test("real mounted drawer resets dirty values to the canonical method after its version changes", async () => {
  const window = new Window({ url: "https://panel.example.test/settings/payment" });
  const restoreGlobals = installDomGlobals(window);
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container as unknown as Parameters<typeof createRoot>[0]);
  const submissions: unknown[] = [];
  try {
    const Drawer = await compileRealDomBuiltInDrawer();
    const initial = Object.freeze({
      id: "51000000-0000-4000-8000-000000000082",
      kind: "cash_on_delivery" as const,
      profileId: null,
      providerCode: null,
      label: "İlk kanonik etiket",
      state: "active" as const,
      emergencyReason: null,
      position: 0,
      config: Object.freeze({ instructions: "İlk kanonik talimat." }),
      version: 4,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const properties = (methodValue: MerchantPaymentMethod) => Object.freeze({
      kind: "cash_on_delivery",
      method: methodValue,
      canManage: true,
      busy: false,
      mutationAvailable: true,
      submitError: "Çakışma sonrası güncel bilgiler yüklendi.",
      onSubmit(value: unknown) { submissions.push(value); },
      onClose() {},
    });

    await act(async () => {
      root.render(createElement(Drawer, properties(initial)));
    });
    const labelNode = container.querySelector('input[name="label"]');
    const instructionsNode = container.querySelector('textarea[name="instructions"]');
    assert.ok(labelNode);
    assert.ok(instructionsNode);
    const label = labelNode as unknown as {
      value: string;
      dispatchEvent(event: unknown): boolean;
    };
    const instructions = instructionsNode as unknown as {
      value: string;
      dispatchEvent(event: unknown): boolean;
    };
    assert.equal(label.value, initial.label);
    assert.equal(instructions.value, initial.config.instructions);

    await act(async () => {
      label.value = "Gönderilmemesi gereken eski etiket";
      label.dispatchEvent(new window.Event("input", { bubbles: true }));
      instructions.value = "Gönderilmemesi gereken eski talimat.";
      instructions.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    assert.equal(label.value, "Gönderilmemesi gereken eski etiket");
    assert.equal(instructions.value, "Gönderilmemesi gereken eski talimat.");

    const canonical = Object.freeze({
      ...initial,
      label: "Çakışma sonrası kanonik etiket",
      config: Object.freeze({ instructions: "Çakışma sonrası kanonik talimat." }),
      version: 5,
      updatedAt: "2026-07-28T09:01:00.000Z",
    });
    await act(async () => {
      root.render(createElement(Drawer, properties(canonical)));
    });

    assert.equal(label.value, canonical.label);
    assert.equal(instructions.value, canonical.config.instructions);
    const formNode = container.querySelector("form");
    assert.ok(formNode);
    const form = formNode as unknown as {
      dispatchEvent(event: unknown): boolean;
    };
    await act(async () => {
      form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    });
    assert.deepEqual(submissions, [Object.freeze({
      kind: "cash_on_delivery",
      method: canonical,
      methodId: canonical.id,
      label: canonical.label,
      config: Object.freeze({ instructions: canonical.config.instructions }),
    })]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    restoreGlobals();
    await window.close();
  }
});

test("built-in drawer associates control and surrogate label errors with the label field", async () => {
  for (const invalidLabel of [
    "Kapıda\u0007 ödeme",
    "Kapıda ödeme \ud800",
  ]) {
    let submissions = 0;
    const drawer = await compileBuiltInDrawer({
      kind: "cash_on_delivery",
      method: null,
      canManage: true,
      busy: false,
      onSubmit() { submissions += 1; },
      onClose() {},
    });
    Object.assign(drawer.values, {
      label: invalidLabel,
      instructions: "Teslimatta ödeme yapın.",
    });
    drawer.render();
    const label = drawer.nodes().find((node) =>
      node.type === "input" && node.props.name === "label");
    const form = drawer.nodes().find((node) => node.type === "form");
    assert.ok(label);
    assert.ok(form);
    const focusBeforeSubmit = label.target.focusCount;
    (form.props.onSubmit as (event: unknown) => void)({
      preventDefault() {},
      currentTarget: {},
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(submissions, 0);
    assert.equal(drawer.uuidCalls(), 0);
    assert.equal(label.target.focusCount, focusBeforeSubmit + 1);
    drawer.render();
    const associatedLabel = drawer.nodes().find((node) =>
      node.type === "input" && node.props.name === "label");
    const alert = drawer.nodes().find((node) => node.props.role === "alert");
    assert.ok(associatedLabel);
    assert.ok(alert);
    assert.equal(associatedLabel.props["aria-invalid"], true);
    assert.equal(associatedLabel.props["aria-describedby"], alert.props.id);
    assert.match(drawerText(alert), /etiketi.*bayt/i);
  }
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
  const [consoleSource, catalogSource, drawerSource, paytrSource, checkoutSource, orderSource, css] = await Promise.all([
    source("components/settings/payment/PaymentSettingsConsole.tsx"),
    source("components/settings/payment/PaymentProviderCatalogDialog.tsx"),
    source("components/settings/payment/PaymentProviderConnectionDrawer.tsx"),
    source("components/settings/payment/PaytrConnectionForm.tsx"),
    source("components/settings/payment/ProviderCheckoutSettingsDrawer.tsx"),
    source("components/settings/payment/PaymentMethodOrderDialog.tsx"),
    source("components/settings/payment/payment-settings.module.css"),
  ]);
  assert.match(catalogSource, /role="dialog"/);
  assert.match(catalogSource, /aria-modal="true"/);
  assert.match(catalogSource, /searchRef\.current\?\.focus/);
  assert.match(catalogSource, /openerRef\.current\?\.focus/);
  assert.match(catalogSource, /event\.key [!=]== "Tab"/);
  assert.match(catalogSource, /event\.key === "Escape"/);
  assert.match(catalogSource, /disabled=\{!card\.connectable/);
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
  assert.match(drawerSource, /selectedProfile\?\.status !== "pending_validation"/);
  assert.match(drawerSource, /busy \|\| !props\.canManage \|\| !canSubmit/);
  assert.match(drawerSource, /PAYTR_POLL_DELAYS_MS/);
  assert.match(drawerSource, /mountedRef\.current/);
  assert.match(paytrSource, /Test Modu/);
  assert.match(paytrSource, /name="merchantId"/);
  assert.match(paytrSource, /name=\{props\.name\}/);
  assert.match(paytrSource, /Bildirim URL’si/);
  assert.match(paytrSource, /navigator\.clipboard\.writeText/);
  assert.match(paytrSource, /PayTR Satıcı Panelini Aç/);
  assert.match(paytrSource, /type=\{visible \? "text" : "password"\}/);
  assert.doesNotMatch(paytrSource, /defaultValue=.*(?:merchantKey|merchantSalt)/);
  assert.doesNotMatch(drawerSource, /window[.]location[.]origin/);
  assert.doesNotMatch(drawerSource, /defaultValue=\{[^}]*credential|merchantKey\s*:|merchantSalt\s*:/);
  assert.match(checkoutSource, /role="dialog"/);
  assert.match(checkoutSource, /aria-modal="true"/);
  assert.match(checkoutSource, /event\.key === "Escape"/);
  assert.match(checkoutSource, /props\.openerRef\.current\?\.focus/);
  assert.match(checkoutSource, /Tüm uygun taksitler/);
  assert.match(checkoutSource, /Yalnız tek çekim/);
  assert.match(checkoutSource, /Üst sınır belirle/);
  assert.match(checkoutSource, /kart numarası, CVV veya ham sağlayıcı anahtarı saklamaz/);
  assert.match(checkoutSource, /editingDisabled/);
  assert.doesNotMatch(checkoutSource, /type="text"[^>]*name="card|cvv|apiKey|secretKey/);
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
