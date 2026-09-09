import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { FIXED_STOREFRONT_POLICIES } from "@celebix/saas-contracts";
import React, { createElement, type ReactNode } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import postcss from "postcss";
import ts from "typescript";

import { createStorePolicyApi, StorePolicyApiError } from "./store-policy-ui/client.ts";

const CUSTOMER_PANEL = new URL("../", import.meta.url);
const REPOSITORY = new URL("../../../", import.meta.url);
const NOW = "2026-09-09T12:00:00.000Z";

const panelSource = (path: string) => readFile(new URL(path, CUSTOMER_PANEL), "utf8");
const repositorySource = (path: string) => readFile(new URL(path, REPOSITORY), "utf8");

function declarations(css: string, selector: string) {
  const result: Record<string, string> = {};
  postcss.parse(css).walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls((declaration) => { result[declaration.prop] = declaration.value; });
  });
  return result;
}

function rootDeclarations(css: string, selector: string) {
  const result: Record<string, string> = {};
  postcss.parse(css).walkRules((rule) => {
    if (rule.parent?.type !== "root" || !rule.selectors.includes(selector)) return;
    rule.walkDecls((declaration) => { result[declaration.prop] = declaration.value; });
  });
  return result;
}

function policy(body: string, status: "draft" | "published", version: number) {
  const definition = FIXED_STOREFRONT_POLICIES[0];
  return Object.freeze({
    ...definition,
    ordinal: 1,
    body,
    status,
    version,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function createHookRuntime() {
  const slots: unknown[] = [];
  let cursor = 0;
  let dirty = true;
  let latest: ReactNode;
  const sameDeps = (left: readonly unknown[] | undefined, right: readonly unknown[]) =>
    left !== undefined && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const runtime = {
    ...React,
    useState<T>(initial: T | (() => T)) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      const set = (next: T | ((current: T) => T)) => {
        slots[index] = typeof next === "function" ? (next as (current: T) => T)(slots[index] as T) : next;
        dirty = true;
      };
      return [slots[index] as T, set] as const;
    },
    useRef<T>(initial: T) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index] as { current: T };
    },
    useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: readonly unknown[]) {
      const index = cursor++;
      const prior = slots[index] as { deps: readonly unknown[]; value: T } | undefined;
      if (prior === undefined || !sameDeps(prior.deps, deps)) slots[index] = { deps: [...deps], value: callback };
      return (slots[index] as { value: T }).value;
    },
    useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
      const index = cursor++;
      const prior = slots[index] as { deps: readonly unknown[]; cleanup?: () => void } | undefined;
      if (prior !== undefined && sameDeps(prior.deps, deps)) return;
      prior?.cleanup?.();
      const cleanup = effect();
      slots[index] = { deps: [...deps], ...(typeof cleanup === "function" ? { cleanup } : {}) };
    },
  } as unknown as typeof React;
  return {
    runtime,
    async flush(component: () => ReactNode) {
      for (let pass = 0; pass < 40; pass += 1) {
        if (dirty || latest === undefined) {
          dirty = false;
          cursor = 0;
          latest = component();
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
        if (!dirty) return latest;
      }
      throw new Error("policy_hook_flush_exhausted");
    },
  };
}

function visitElements(node: ReactNode, visitor: (element: React.ReactElement<Record<string, unknown>>) => void) {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return;
    visitor(child);
    visitElements(child.props.children as ReactNode, visitor);
    visitElements(child.props.actions as ReactNode, visitor);
  });
}

function findElement(
  node: ReactNode,
  predicate: (element: React.ReactElement<Record<string, unknown>>) => boolean,
) {
  let result: React.ReactElement<Record<string, unknown>> | undefined;
  visitElements(node, (element) => {
    if (result === undefined && predicate(element)) result = element;
  });
  assert.ok(result);
  return result;
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!React.isValidElement<Record<string, unknown>>(node)) return "";
  return React.Children.toArray(node.props.children as ReactNode).map(textOf).join("");
}

async function compilePolicyConsole(
  react: typeof React,
  scenario: Readonly<{ getFailures?: number; getGate?: Promise<void> }> = {},
) {
  const source = await readFile(
    new URL("components/content/PolicyConsole.tsx", CUSTOMER_PANEL),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const initial = policy("Sunucudaki ilk metin", "draft", 3);
  const refreshed = policy("Başka oturumdaki metin", "draft", 4);
  const saves: Array<Readonly<{ expectedVersion: number; body: string; status: string }>> = [];
  let getCalls = 0;
  const api = Object.freeze({
    async list() { return Object.freeze([initial]); },
    async get() {
      getCalls += 1;
      if (scenario.getGate) await scenario.getGate;
      if (getCalls <= (scenario.getFailures ?? 0)) throw new Error("controlled_policy_refresh_failure");
      return refreshed;
    },
    async save(_key: string, input: Readonly<{ expectedVersion: number; body: string; status: string }>) {
      saves.push(Object.freeze({ ...input }));
      throw new StorePolicyApiError("version_conflict", 409);
    },
  });
  const styles = new Proxy({}, {
    get: (_target, property) => property === "__esModule"
      ? true
      : property === "default" ? styles : String(property),
  });
  const Icon = (props: Record<string, unknown>) => createElement("svg", props);
  const Shell = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  const Header = ({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) => createElement("header", null, title, description, actions);
  const Empty = ({ title, description }: { title: string; description: string }) => createElement("div", null, title, description);
  const Preview = ({ source: value }: { source: string }) => createElement("div", { "data-policy-preview": true }, value);
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react") return react;
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "@celebix/saas-contracts") return { FIXED_STOREFRONT_POLICIES };
    if (specifier === "lucide-react") return new Proxy({}, { get: () => Icon });
    if (specifier === "@/components/catalog/ProductDescriptionField") return { ProductDescriptionPreview: Preview };
    if (specifier === "@/components/panel/PanelPageShell") return {
      PanelEmptyState: Empty,
      PanelPageHeader: Header,
      PanelPageShell: Shell,
      PanelStatusBadge: Shell,
    };
    if (specifier === "@/lib/store-policy-ui/client") return { StorePolicyApiError, storePolicyApi: api };
    if (specifier === "./policy-console.module.css") return styles;
    throw new Error(`unexpected_policy_console_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  return {
    Console: compiled.exports.PolicyConsole as (props: Readonly<{
      canManage: boolean;
      initialPolicyKey?: typeof FIXED_STOREFRONT_POLICIES[number]["key"];
    }>) => ReactNode,
    saves,
    getCalls: () => getCalls,
  };
}

async function settingsPolicyRoute(
  fallbackGET: (request: Request, context: unknown) => Promise<Response>,
  fallbackPATCH: (request: Request, context: unknown) => Promise<Response>,
) {
  const source = (await repositorySource(
    "tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/storefront-policies/[[...path]]/route.ts",
  )).replace(
    'import { GET as fallbackGET, PATCH as fallbackPATCH } from "../../[...slug]/route";',
    "const { fallbackGET, fallbackPATCH } = routeDependencies;",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiled = { exports: {} as Record<string, unknown> };
  Function("require", "module", "exports", "routeDependencies", output)(
    () => { throw new Error("unexpected_settings_fixture_require"); },
    compiled,
    compiled.exports,
    { fallbackGET, fallbackPATCH },
  );
  return compiled.exports as {
    GET(request: Request, context: { params: Promise<{ path?: string[] }> }): Promise<Response>;
    PATCH(request: Request, context: { params: Promise<{ path?: string[] }> }): Promise<Response>;
  };
}

test("policy conflict preserves the merchant draft and version authority across close and reopen", async () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { activeElement: null },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { addEventListener() {}, removeEventListener() {} },
  });
  try {
    const hooks = createHookRuntime();
    const { Console, saves } = await compilePolicyConsole(hooks.runtime);
    const render = () => Console({ canManage: true, initialPolicyKey: "privacy_security" });
    let view = await hooks.flush(render);
    const textarea = findElement(view, (element) => element.type === "textarea");
    const published = findElement(view, (element) => element.props.role === "radio" && textOf(element).includes("Yayında"));
    (textarea.props.onChange as (event: { target: { value: string } }) => void)({
      target: { value: "Merchant tarafından korunacak taslak" },
    });
    (published.props.onClick as () => void)();
    view = await hooks.flush(render);
    const save = findElement(view, (element) => element.type === "button" && textOf(element) === "Değişiklikleri kaydet");
    (save.props.onClick as () => void)();
    view = await hooks.flush(render);
    assert.deepEqual(saves, [{
      expectedVersion: 3,
      body: "Merchant tarafından korunacak taslak",
      status: "published",
    }]);
    const preservedTextarea = findElement(view, (element) => element.type === "textarea");
    const preservedPublished = findElement(view, (element) => element.props.role === "radio" && textOf(element).includes("Yayında"));
    assert.equal(preservedTextarea.props.value, "Merchant tarafından korunacak taslak");
    assert.equal(preservedPublished.props["aria-checked"], true);
    assert.match(textOf(view), /sizden önce güncellendi/u);
    const close = findElement(view, (element) => element.props["aria-label"] === "Politika düzenleyicisini kapat");
    (close.props.onClick as () => void)();
    view = await hooks.flush(render);
    const reopen = findElement(view, (element) => element.type === "button" && textOf(element).includes("Düzenle"));
    (reopen.props.onClick as () => void)();
    view = await hooks.flush(render);
    const reopenedTextarea = findElement(view, (element) => element.type === "textarea");
    const reopenedPublished = findElement(view, (element) => element.props.role === "radio" && textOf(element).includes("Yayında"));
    assert.equal(reopenedTextarea.props.value, "Merchant tarafından korunacak taslak");
    assert.equal(reopenedPublished.props["aria-checked"], true);
    const retry = findElement(view, (element) => element.type === "button" && textOf(element) === "Değişiklikleri kaydet");
    (retry.props.onClick as () => void)();
    await hooks.flush(render);
    assert.equal(saves[1]?.expectedVersion, 4);
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("failed conflict refresh blocks resave until an explicit read retry succeeds", async () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { activeElement: null },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { addEventListener() {}, removeEventListener() {} },
  });
  try {
    const hooks = createHookRuntime();
    const { Console, saves, getCalls } = await compilePolicyConsole(hooks.runtime, { getFailures: 1 });
    const render = () => Console({ canManage: true, initialPolicyKey: "privacy_security" });
    let view = await hooks.flush(render);
    const textarea = findElement(view, (element) => element.type === "textarea");
    const published = findElement(view, (element) => element.props.role === "radio" && textOf(element).includes("Yayında"));
    (textarea.props.onChange as (event: { target: { value: string } }) => void)({
      target: { value: "Yenileme hatasında korunacak taslak" },
    });
    (published.props.onClick as () => void)();
    view = await hooks.flush(render);
    const firstSave = findElement(view, (element) => element.type === "button" && textOf(element) === "Değişiklikleri kaydet");
    (firstSave.props.onClick as () => void)();
    view = await hooks.flush(render);

    assert.equal(getCalls(), 1);
    assert.match(textOf(view), /güncel sürüm alınamadı/u);
    const blockedSave = findElement(view, (element) => element.type === "button" && textOf(element) === "Değişiklikleri kaydet");
    assert.equal(blockedSave.props.disabled, true);
    const retryRead = findElement(view, (element) => element.type === "button" && textOf(element) === "Güncel sürümü al");
    (retryRead.props.onClick as () => void)();
    view = await hooks.flush(render);

    assert.equal(getCalls(), 2);
    const preservedTextarea = findElement(view, (element) => element.type === "textarea");
    const preservedPublished = findElement(view, (element) => element.props.role === "radio" && textOf(element).includes("Yayında"));
    assert.equal(preservedTextarea.props.value, "Yenileme hatasında korunacak taslak");
    assert.equal(preservedPublished.props["aria-checked"], true);
    const enabledSave = findElement(view, (element) => element.type === "button" && textOf(element) === "Değişiklikleri kaydet");
    assert.equal(enabledSave.props.disabled, false);
    (enabledSave.props.onClick as () => void)();
    await hooks.flush(render);
    assert.deepEqual(saves[1], {
      expectedVersion: 4,
      body: "Yenileme hatasında korunacak taslak",
      status: "published",
    });
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("pending conflict refresh keeps the editor open until the canonical read settles", async () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  let keydownListener: ((event: KeyboardEvent) => void) | undefined;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { activeElement: null },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener(type: string, listener: (event: KeyboardEvent) => void) {
        if (type === "keydown") keydownListener = listener;
      },
      removeEventListener(type: string, listener: (event: KeyboardEvent) => void) {
        if (type === "keydown" && keydownListener === listener) keydownListener = undefined;
      },
    },
  });
  let releaseRead = () => {};
  const getGate = new Promise<void>((resolve) => { releaseRead = resolve; });
  try {
    const hooks = createHookRuntime();
    const { Console } = await compilePolicyConsole(hooks.runtime, { getGate });
    const render = () => Console({ canManage: true, initialPolicyKey: "privacy_security" });
    let view = await hooks.flush(render);
    const save = findElement(view, (element) => element.type === "button" && textOf(element) === "Değişiklikleri kaydet");
    (save.props.onClick as () => void)();
    view = await hooks.flush(render);

    const close = findElement(view, (element) => element.props["aria-label"] === "Politika düzenleyicisini kapat");
    assert.equal(close.props.disabled, true);
    (close.props.onClick as () => void)();
    view = await hooks.flush(render);
    assert.equal(findElement(view, (element) => element.type === "textarea").props.value, "Sunucudaki ilk metin");

    const backdrop = findElement(view, (element) => element.props.role === "presentation");
    const backdropTarget = {};
    (backdrop.props.onMouseDown as (event: { target: object; currentTarget: object }) => void)({
      target: backdropTarget,
      currentTarget: backdropTarget,
    });
    view = await hooks.flush(render);
    assert.equal(findElement(view, (element) => element.type === "textarea").props.value, "Sunucudaki ilk metin");

    let escapePrevented = false;
    assert.ok(keydownListener);
    keydownListener({
      key: "Escape",
      preventDefault() { escapePrevented = true; },
    } as KeyboardEvent);
    view = await hooks.flush(render);
    assert.equal(escapePrevented, true);
    assert.equal(findElement(view, (element) => element.type === "textarea").props.value, "Sunucudaki ilk metin");
  } finally {
    releaseRead();
    await new Promise<void>((resolve) => setImmediate(resolve));
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("settings and remaining-route controls use the Mira palette without decorative provider colors", async () => {
  const [family, merchant, policyCss, domains, payment, shipping, ai, toshi, design] = await Promise.all([
    panelSource("components/merchant-admin/merchant-family-overview.module.css"),
    panelSource("components/merchant-admin/merchant-module-console.module.css"),
    panelSource("components/content/policy-console.module.css"),
    panelSource("components/settings/domains/store-domain-settings.module.css"),
    panelSource("components/settings/payment/payment-settings.module.css"),
    panelSource("components/shipping/shipping-settings.module.css"),
    panelSource("components/toshi-settings/artificial-intelligence-settings.module.css"),
    panelSource("components/toshi/toshi.module.css"),
    panelSource("components/settings/design-settings.module.css"),
  ]);

  assert.equal(declarations(family, ".settingsRow").background, "#FFFDFC");
  for (const [css, selector] of [
    [merchant, ".primary"],
    [policyCss, ".primary"],
    [domains, ".add button"],
    [payment, ".primaryButton"],
    [shipping, ".tokenControl button"],
    [ai, ".keyControl button"],
    [toshi, ".composer button"],
    [design, ".publishButton"],
  ] as const) {
    const action = declarations(css, selector);
    assert.equal(action.background, "#2B2B2B", selector);
    assert.equal(action.color, "#FFFDFC", selector);
    assert.ok(Number.parseFloat(action["min-height"] ?? "0") >= 44, selector);
  }
  assert.equal(declarations(domains, ".page").background, "#F8F7F5");
  assert.equal(declarations(payment, ".page").background, "#F8F7F5");
  assert.equal(declarations(ai, ".logo").background, "#F8F7F5");
  assert.doesNotMatch(ai, /#4776e6|#8e54e9|#ef5da8/i);
  assert.equal(declarations(merchant, ".form input:focus-visible").outline, "2px solid #2B2B2B");
  assert.equal(declarations(payment, ".catalogFilters input")["min-height"], "44px");
});

test("secondary settings controls expose 44px targets, visible focus, and warm editor chrome", async () => {
  const [domains, shipping, payment, ai, provider, design] = await Promise.all([
    panelSource("components/settings/domains/store-domain-settings.module.css"),
    panelSource("components/shipping/shipping-settings.module.css"),
    panelSource("components/settings/payment/payment-settings.module.css"),
    panelSource("components/toshi-settings/artificial-intelligence-settings.module.css"),
    panelSource("components/merchant-admin/provider-connection-panel.module.css"),
    panelSource("components/settings/design-settings.module.css"),
  ]);

  for (const [css, selector, properties] of [
    [domains, ".dnsRow button", ["width", "height"]],
    [shipping, ".actions .refresh", ["width"]],
    [payment, ".methodActions > .secondaryButton", ["min-width", "min-height"]],
    [payment, ".methodActionMenu > summary", ["width", "height"]],
    [payment, ".methodActionMenu button", ["min-width", "min-height"]],
    [payment, ".addFlowTabs button", ["min-width", "min-height"]],
    [ai, ".connectionControls select", ["height"]],
    [ai, ".secondaryAction", ["min-width", "min-height"]],
    [ai, ".removeAction", ["width", "height"]],
  ] as const) {
    const control = declarations(css, selector);
    for (const property of properties) {
      assert.ok(Number.parseFloat(control[property] ?? "0") >= 44, `${selector} ${property}`);
    }
  }
  assert.ok(Number.parseFloat(declarations(shipping, ".actions button")["min-height"] ?? "0") >= 44);
  assert.equal(declarations(payment, ".methodActionMenu button:focus-visible").outline, "2px solid #2B2B2B");
  assert.equal(declarations(ai, ".secondaryAction:focus-visible").outline, "2px solid #2B2B2B");

  assert.deepEqual(declarations(provider, ".message"), {
    padding: "12px 14px",
    "border-radius": "8px",
    border: "1px solid #E7E2DD",
    background: "#F8F7F5",
    color: "#2B2B2B",
  });
  assert.equal(rootDeclarations(design, ".homepageSectionInspector").border, "1px solid #E7E2DD");
  assert.equal(rootDeclarations(design, ".homepageSectionInspector").background, "#FFFDFC");
  assert.equal(declarations(design, ".homepageInspectorFields input:not([type=\"radio\"]):not([type=\"checkbox\"])").background, "#FFFDFC");
  assert.equal(rootDeclarations(design, ".settingsModal").border, "1px solid #E7E2DD");
  assert.equal(rootDeclarations(design, ".settingsModal").background, "#FFFDFC");
});

test("settings forms collapse at tablet width and analytics settings own isolated styles", async () => {
  const [merchant, payment, policyCss, analytics, analyticsWorkspace] = await Promise.all([
    panelSource("components/merchant-admin/merchant-module-console.module.css"),
    panelSource("components/settings/payment/payment-settings.module.css"),
    panelSource("components/content/policy-console.module.css"),
    panelSource("components/analytics/AnalyticsSettingsConsole.tsx"),
    panelSource("components/analytics/CommerceAnalyticsWorkspace.tsx"),
  ]);

  assert.match(merchant, /@media \(max-width: 1024px\)[\s\S]*\.form\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(payment, /@media \(max-width: 1024px\)[\s\S]*\.paymentSummary\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\)/s);
  assert.match(policyCss, /@media \(max-width: 1024px\)[\s\S]*\.editorColumns\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(analytics, /analytics-settings-console[.]module[.]css/);
  assert.doesNotMatch(analytics, /commerce-analytics-workspace[.]module[.]css/);
  assert.match(analyticsWorkspace, /commerce-analytics-workspace[.]module[.]css/);
});

test("Toshi uses the shared compact page header and keeps the assistant workspace unobstructed", async () => {
  const [component, css] = await Promise.all([
    panelSource("components/toshi/ToshiWorkspace.tsx"),
    panelSource("components/toshi/toshi.module.css"),
  ]);

  assert.match(component, /<PanelPageHeader[\s\S]*title="Toshi"/);
  assert.doesNotMatch(component, /<Image|workspaceHeader/);
  assert.equal(declarations(css, ".workspace").overflow, "visible");
  assert.equal(declarations(css, ".composer button").background, "#2B2B2B");
});

test("domain failure is not rendered as an empty domain collection or a duplicate page hero", async () => {
  const component = await panelSource("components/settings/domains/StoreDomainSettings.tsx");

  assert.match(component, /<PanelTopbarBridge title="Alan Adları" subtitle=/);
  assert.match(component, /loading \? [\s\S]*: !error \? <>/);
  assert.doesNotMatch(component, /className=\{styles[.]intro\}/);
});

test("isolated settings fixtures use actual consumers and keep the Next page export-safe", async () => {
  const [page, fixture] = await Promise.all([
    repositorySource("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/mira-settings/[view]/page.tsx"),
    repositorySource("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/mira-settings/SettingsFixtureScreen.tsx"),
  ]);

  assert.doesNotMatch(page, /export\s+(?:const|function|class)\s+/);
  for (const component of [
    "MerchantFamilyOverview",
    "MerchantModuleConsole",
    "MerchantRecordEditor",
    "PolicyConsole",
    "StoreDomainSettings",
    "PaymentSettingsConsole",
    "ShippingSettingsConsole",
    "ArtificialIntelligenceSettings",
    "ToshiWorkspace",
    "AnalyticsSettingsConsole",
  ]) assert.match(fixture, new RegExp(component));
  assert.match(fixture, /kind="lucky_wheel"/);
  assert.match(fixture, /design-unavailable/);
});

test("settings policy transport is pathname-gated, delegates fallbacks, and rejects persistence", async () => {
  const calls: string[] = [];
  const route = await settingsPolicyRoute(
    async (request) => {
      calls.push(`GET ${request.url}`);
      return Response.json({ source: "established-fixture" });
    },
    async (request) => {
      calls.push(`PATCH ${request.url}`);
      return Response.json({ source: "established-mutation" });
    },
  );
  const listContext = { params: Promise.resolve({ path: undefined }) };
  const policyContext = { params: Promise.resolve({ path: ["privacy_security"] }) };

  const unrelated = await route.GET(new Request("http://fixture.test/api/storefront-policies", {
    headers: { referer: "http://fixture.test/mira-order-adjacent/drafts" },
  }), listContext);
  assert.deepEqual(await unrelated.json(), { source: "established-fixture" });
  assert.equal(calls.length, 1);

  const scoped = await route.GET(new Request("http://fixture.test/api/storefront-policies", {
    headers: { referer: "http://fixture.test/mira-settings/policies" },
  }), listContext);
  const payload = await scoped.json() as { items: readonly unknown[] };
  assert.equal(payload.items.length, 7);
  assert.equal(calls.length, 1);

  const api = createStorePolicyApi(async (input, init) => {
    const path = new URL(String(input), "http://fixture.test").pathname.split("/").filter(Boolean).slice(2);
    return route.GET(new Request(new URL(String(input), "http://fixture.test"), {
      ...init,
      headers: { ...init?.headers, referer: "http://fixture.test/mira-settings/policy-edit" },
    }), { params: Promise.resolve({ path }) });
  });
  assert.equal((await api.list()).length, 7);

  const rejected = await route.PATCH(new Request("http://fixture.test/api/storefront-policies/privacy_security", {
    method: "PATCH",
    headers: { referer: "http://fixture.test/mira-settings/policy-edit" },
  }), policyContext);
  assert.equal(rejected.status, 409);
  assert.deepEqual(await rejected.json(), { code: "version_conflict" });
  assert.equal(calls.length, 1);
});
