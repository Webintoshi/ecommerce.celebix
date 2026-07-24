import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as contracts from "@celebix/saas-contracts";
import {
  MerchantAdminRepositoryError,
  type MerchantAdminRepository,
} from "@celebix/saas-data";
import * as React from "react";
import { createElement, type ReactNode } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

import { createMerchantAdminHttpHandlers } from "../merchant-admin-http/handler.ts";
import { createMerchantAdminApi, MerchantAdminApiError } from "./client.ts";
import {
  MERCHANT_MODULE_DEFINITIONS,
  type MerchantModuleDefinition,
} from "./presentation.ts";
import * as presentation from "./presentation.ts";
import * as recordRoute from "./record-route.ts";

const ORIGIN = "https://panel.test";
const NOW = "2026-07-22T19:00:00.000Z";
const RECORD_ID = "71000000-0000-4000-8000-000000000001";
const JOB_ID = "73000000-0000-4000-8000-000000000001";
const REQUEST_ID = "78000000-0000-4000-8000-000000000001";
const OPERATION_ID = "72000000-0000-4000-8000-000000000001";
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 1).toString("base64url")}`;

type Role = contracts.TenantContext["membership"]["role"];
type Scenario = {
  kind: contracts.MerchantAdminRecordKind;
  records: "loaded" | "empty";
  failure: "none" | "unavailable" | "membership_denied";
  archive: "success" | "version_conflict" | "replayed";
  role: Role;
  recordStatus: "active" | "archived";
  recordVersion: number;
  jobs: contracts.MerchantAdminProviderJob[];
};

function tenant(role: Role): contracts.TenantContext {
  return {
    schemaVersion: 1,
    requestId: REQUEST_ID,
    principal: { id: "10000000-0000-4000-8000-000000000001", issuer: "https://id.test/oidc", subject: "route-behavior" },
    store: { id: "20000000-0000-4000-8000-000000000001", slug: "store", status: "active" },
    membership: { id: "30000000-0000-4000-8000-000000000001", role, status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: "40000000-0000-4000-8000-000000000001",
      planCode: "growth",
      version: 2,
      status: "active",
      features: ["catalog"],
      limits: { products: 100, staff: 5, storageBytes: 100 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  } as contracts.TenantContext;
}

function configuredValue(field: MerchantModuleDefinition["fields"][number]): contracts.MerchantAdminJson {
  if (field.type === "boolean") return true;
  if (field.type === "number") return 1;
  if (field.type === "enum") return field.allowedValues?.[0] ?? "configured";
  if (field.type === "enum-list" || field.type === "string-list") return [field.allowedValues?.[0] ?? "configured"];
  return "configured";
}

function configFor(definition: MerchantModuleDefinition) {
  return Object.freeze(Object.fromEntries(
    (definition.workflow?.requiredFields ?? []).map((key) => {
      const field = definition.fields.find((candidate) => candidate.key === key);
      assert.ok(field, `${definition.kind}:${key}`);
      return [key, configuredValue(field)] as const;
    }),
  ));
}

function recordFor(scenario: Scenario): contracts.MerchantAdminRecord {
  const definition = MERCHANT_MODULE_DEFINITIONS.find(({ kind }) => kind === scenario.kind);
  assert.ok(definition);
  return {
    id: RECORD_ID,
    kind: scenario.kind,
    name: `${scenario.kind} durable record`,
    config: configFor(definition),
    status: scenario.recordStatus,
    version: scenario.recordVersion,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function providerAction(kind: contracts.MerchantAdminProviderRecordKind) {
  if (kind === "marketplace_connection") return "synchronization" as const;
  if (kind === "invoice_integration") return "reconciliation" as const;
  if (kind === "indexing_request") return "indexing" as const;
  return "delivery" as const;
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
    useMemo<T>(factory: () => T, deps: readonly unknown[]) {
      const index = cursor++;
      const prior = slots[index] as { deps: readonly unknown[]; value: T } | undefined;
      if (prior === undefined || !sameDeps(prior.deps, deps)) slots[index] = { deps: [...deps], value: factory() };
      return (slots[index] as { value: T }).value;
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
    async flush(component: () => ReactNode, force = false) {
      if (force) dirty = true;
      for (let pass = 0; pass < 40; pass += 1) {
        if (dirty || latest === undefined) {
          dirty = false;
          cursor = 0;
          latest = component();
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
        if (!dirty) return latest;
      }
      throw new Error("merchant_route_behavior_hook_flush_exhausted");
    },
  };
}

function visitElements(node: ReactNode, visitor: (element: React.ReactElement<Record<string, unknown>>) => void) {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return;
    visitor(child);
    visitElements(child.props.children as ReactNode, visitor);
  });
}

function textOf(node: ReactNode) {
  const values: string[] = [];
  React.Children.forEach(node, (child) => {
    if (typeof child === "string" || typeof child === "number") {
      values.push(String(child));
      return;
    }
    if (!React.isValidElement<Record<string, unknown>>(child)) return;
    for (const key of ["title", "description", "aria-label"]) {
      if (typeof child.props[key] === "string") values.push(child.props[key]);
    }
    values.push(textOf(child.props.children as ReactNode));
  });
  return values.join(" ");
}

function findElement(
  node: ReactNode,
  predicate: (element: React.ReactElement<Record<string, unknown>>) => boolean,
) {
  let result: React.ReactElement<Record<string, unknown>> | undefined;
  visitElements(node, (element) => {
    if (result === undefined && predicate(element)) result = element;
  });
  assert.ok(result, "expected_route_behavior_element");
  return result;
}

const consoleSource = readFile(
  new URL("../../components/merchant-admin/MerchantModuleConsole.tsx", import.meta.url),
  "utf8",
).then((source) => ts.transpileModule(source, {
  compilerOptions: {
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText);

const pageSources = new Map<string, Promise<string>>();
function compiledPageSource(route: string) {
  let pending = pageSources.get(route);
  if (!pending) {
    pending = readFile(new URL(`../../app${route}/page.tsx`, import.meta.url), "utf8").then((source) =>
      ts.transpileModule(source, {
        compilerOptions: {
          esModuleInterop: true,
          jsx: ts.JsxEmit.ReactJSX,
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    );
    pageSources.set(route, pending);
  }
  return pending;
}

function panelComponents() {
  const wrap = ({ children }: { children?: ReactNode }) => createElement("section", null, children);
  return {
    PanelActionButton: ({ children, href }: { children?: ReactNode; href: string }) => createElement("a", { href }, children),
    PanelDataTable: wrap,
    PanelEmptyState: ({ title, description, action }: { title: string; description: string; action?: ReactNode }) => createElement("section", { title, description }, action),
    PanelMetricCard: ({ label, value, detail }: { label: string; value: string; detail: string }) => createElement("article", { title: label, description: detail }, value),
    PanelPageHeader: ({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) => createElement("header", { title, description }, actions),
    PanelPageShell: wrap,
    PanelPanel: ({ children, title }: { children?: ReactNode; title: string }) => createElement("section", { title }, children),
    PanelStatusBadge: wrap,
    PanelToolbar: wrap,
  };
}

async function compileComponent(
  relativePath: string,
  exportName: string,
  react: typeof React,
  modules: Readonly<Record<string, unknown>>,
) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const styles = new Proxy({}, { get: (_target, property) => property === "__esModule" ? true : property === "default" ? styles : String(property) });
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return react;
    if (specifier === "next/link") return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => createElement("a", props, children);
    if (specifier.endsWith(".module.css")) return styles;
    if (Object.hasOwn(modules, specifier)) return modules[specifier];
    throw new Error(`unexpected_route_behavior_component_import:${relativePath}:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  return compiled.exports[exportName] as (props: Record<string, unknown>) => ReactNode;
}

async function compileConsole(react: typeof React, api: ReturnType<typeof createMerchantAdminApi>) {
  const output = await consoleSource;
  const styles = new Proxy({}, { get: (_target, property) => property === "__esModule" ? true : property === "default" ? styles : String(property) });
  const icons = new Proxy({}, { get: () => ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => createElement("svg", props, children) });
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return react;
    if (specifier === "@celebix/saas-contracts") return contracts;
    if (specifier === "lucide-react") return icons;
    if (specifier === "next/link") return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => createElement("a", props, children);
    if (specifier === "@/components/panel/PanelPageShell") return panelComponents();
    if (specifier === "@/lib/merchant-admin-ui/client") return { MerchantAdminApiError, merchantAdminApi: api };
    if (specifier === "@/lib/merchant-admin-ui/record-route") return recordRoute;
    if (specifier === "@/lib/merchant-admin-ui/presentation") return presentation;
    if (specifier === "./merchant-module-console.module.css") return styles;
    throw new Error(`unexpected_merchant_console_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  return compiled.exports.MerchantModuleConsole as (props: {
    kind: contracts.MerchantAdminRecordKind;
    canManage: boolean;
    createFirst?: boolean;
  }) => ReactNode;
}

async function compilePage(
  route: string,
  Console: (props: { kind: contracts.MerchantAdminRecordKind; canManage: boolean; createFirst?: boolean }) => ReactNode,
  role: Role,
) {
  const output = await compiledPageSource(route);
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "@celebix/saas-contracts") return contracts;
    if (specifier === "@/components/merchant-admin/MerchantModuleConsole") return { MerchantModuleConsole: Console };
    if (specifier === "@/lib/server-access") return { requireServerPanelAccess: async () => ({ tenantContext: tenant(role) }) };
    throw new Error(`unexpected_merchant_page_import:${route}:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  return compiled.exports.default as () => Promise<ReactNode>;
}

async function compileBoundPage(
  route: string,
  componentModule: string,
  componentExport: string,
  Component: (props: Record<string, unknown>) => ReactNode,
  role: Role,
) {
  const output = await compiledPageSource(route);
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "@celebix/saas-contracts") return contracts;
    if (specifier === componentModule) return { [componentExport]: Component };
    if (specifier === "@/lib/server-access") return { requireServerPanelAccess: async () => ({ tenantContext: tenant(role) }) };
    throw new Error(`unexpected_bound_page_import:${route}:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  return compiled.exports.default as () => Promise<ReactNode>;
}

function request(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("cookie", `__Host-celebix_panel=${CREDENTIAL}`);
  if (init?.method === "POST") headers.set("origin", ORIGIN);
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
}

test("merchant route matrix invokes every actual page, production console, client, and handler across truth and mutation states", async () => {
  let scenario: Scenario = {
    kind: "discount",
    records: "loaded",
    failure: "none",
    archive: "success",
    role: "store_owner",
    recordStatus: "active",
    recordVersion: 1,
    jobs: [],
  };
  const paths: string[] = [];
  const mutations: string[] = [];
  const repository: MerchantAdminRepository = {
    async list(input) {
      if (scenario.failure !== "none") throw new MerchantAdminRepositoryError(scenario.failure);
      return scenario.records === "empty" ? [] : [recordFor({ ...scenario, kind: input.kind })];
    },
    async get() { return recordFor(scenario); },
    async listEvents() { return []; },
    async listProviderJobs() { return scenario.jobs; },
    async save() { throw new Error("unexpected_save"); },
    async archive() {
      mutations.push(`archive:${scenario.kind}`);
      if (scenario.archive === "version_conflict") throw new MerchantAdminRepositoryError("version_conflict");
      scenario.recordStatus = "archived";
      scenario.recordVersion += 1;
      return {
        id: RECORD_ID,
        kind: scenario.kind,
        status: "archived",
        version: scenario.recordVersion,
        updatedAt: NOW,
        replayed: scenario.archive === "replayed",
      };
    },
    async prepareProviderJob(input) {
      mutations.push(`prepare:${input.kind}`);
      const next = {
        id: JOB_ID,
        recordId: RECORD_ID,
        recordKind: input.kind,
        action: providerAction(input.kind),
        status: "awaiting_provider_activation" as const,
        version: 1,
        requestedAt: NOW,
        updatedAt: NOW,
      };
      scenario.jobs = [next];
      const { requestedAt: _requestedAt, ...result } = next;
      return { ...result, replayed: false };
    },
    async cancelProviderJob(input) {
      mutations.push(`cancel:${input.kind}`);
      const current = scenario.jobs[0];
      assert.ok(current);
      const next = { ...current, status: "cancelled" as const, version: 2, updatedAt: NOW };
      scenario.jobs = [next];
      const { requestedAt: _requestedAt, ...result } = next;
      return { ...result, replayed: false };
    },
  };
  const handlers = createMerchantAdminHttpHandlers({
    async resolveRuntime() {
      if (scenario.failure === "unavailable") return null;
      return {
        merchantAdmin: repository,
        access: {
          readiness: { mode: "approved_staging" },
          panelOrigin: ORIGIN,
          async resolveCredential() {
            return { kind: "authenticated", session: {}, tenantContext: tenant(scenario.role) };
          },
          async rotateCredential() { return { kind: "unavailable" }; },
          async revokeCredential() { return { kind: "unavailable" }; },
        },
      } as never;
    },
    now: () => new Date(NOW),
    requestId: () => REQUEST_ID,
  });
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    paths.push(path);
    const method = init?.method ?? "GET";
    let match = /^\/api\/merchant-admin\/records\/([^/]+)\/([^/]+)\/archive$/u.exec(path);
    if (match) return handlers.archive(request(path, init), match[1]!, match[2]!);
    match = /^\/api\/merchant-admin\/records\/([^/]+)\/([^/]+)$/u.exec(path);
    if (match) return handlers.record(request(path, init), match[1]!, match[2]!);
    match = /^\/api\/merchant-admin\/records\/([^/]+)$/u.exec(path);
    if (match) return method === "POST" ? handlers.save(request(path, init), match[1]!) : handlers.records(request(path, init), match[1]!);
    match = /^\/api\/merchant-admin\/events\/([^/]+)$/u.exec(path);
    if (match) return handlers.events(request(path, init), match[1]!);
    match = /^\/api\/merchant-admin\/provider-jobs\/([^/]+)\/([^/]+)\/cancel$/u.exec(path);
    if (match) return handlers.cancelProviderJob(request(path, init), match[1]!, match[2]!);
    match = /^\/api\/merchant-admin\/provider-jobs\/([^/]+)$/u.exec(path);
    if (match) return method === "POST" ? handlers.prepareProviderJob(request(path, init), match[1]!) : handlers.providerJobs(request(path, init), match[1]!);
    throw new Error(`unexpected_merchant_route_path:${path}`);
  }) as typeof fetch;
  const api = createMerchantAdminApi(fetcher, () => OPERATION_ID);

  async function mount(definition: MerchantModuleDefinition, patch: Partial<Scenario>) {
    scenario = {
      kind: definition.kind,
      records: "loaded",
      failure: "none",
      archive: "success",
      role: "store_owner",
      recordStatus: "active",
      recordVersion: 1,
      jobs: [],
      ...patch,
    };
    paths.length = 0;
    const hooks = createHookRuntime();
    const Console = await compileConsole(hooks.runtime, api);
    const Page = await compilePage(definition.route, Console, scenario.role);
    const pageTree = await Page();
    const routeConsole = findElement(pageTree, (element) => element.type === Console);
    assert.equal(routeConsole.props.kind, definition.kind);
    assert.equal(routeConsole.props.canManage, scenario.role === "store_owner");
    const render = () => Console(routeConsole.props as { kind: contracts.MerchantAdminRecordKind; canManage: boolean; createFirst?: boolean });
    return { hooks, render, view: await hooks.flush(render) };
  }

  for (const definition of MERCHANT_MODULE_DEFINITIONS) {
    let mounted = await mount(definition, { records: "loaded" });
    assert.match(textOf(mounted.view), new RegExp(`${definition.kind} durable record`), `${definition.kind}:loaded`);
    assert.ok(paths.includes(`/api/merchant-admin/records/${definition.kind}`), `${definition.kind}:handler-list`);
    assert.ok(paths.includes(`/api/merchant-admin/events/${definition.kind}`), `${definition.kind}:handler-events`);

    mounted = await mount(definition, { records: "empty" });
    assert.match(textOf(mounted.view), new RegExp(`Henüz ${definition.singular} yok`, "u"), `${definition.kind}:empty`);

    mounted = await mount(definition, { failure: "unavailable" });
    assert.match(textOf(mounted.view), /şu anda kullanılamıyor/u, `${definition.kind}:unavailable`);

    mounted = await mount(definition, { failure: "membership_denied" });
    assert.match(textOf(mounted.view), /yetkiniz yok/u, `${definition.kind}:membership-denied`);

    mounted = await mount(definition, { role: "analyst" });
    assert.doesNotMatch(textOf(mounted.view), /Yeni kayıt|kaydını arşivle/u, `${definition.kind}:read-only`);

    mounted = await mount(definition, { archive: "version_conflict" });
    const conflictArchive = findElement(mounted.view, (element) =>
      typeof element.props["aria-label"] === "string" && String(element.props["aria-label"]).endsWith("kaydını arşivle"),
    );
    (conflictArchive.props.onClick as () => void)();
    await new Promise<void>((resolve) => setImmediate(resolve));
    mounted.view = await mounted.hooks.flush(mounted.render);
    assert.match(textOf(mounted.view), /sizden önce güncellendi/u, `${definition.kind}:conflict`);

    mounted = await mount(definition, { archive: "replayed" });
    const replayArchive = findElement(mounted.view, (element) =>
      typeof element.props["aria-label"] === "string" && String(element.props["aria-label"]).endsWith("kaydını arşivle"),
    );
    (replayArchive.props.onClick as () => void)();
    for (let pass = 0; pass < 4; pass += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    mounted.view = await mounted.hooks.flush(mounted.render);
    assert.match(textOf(mounted.view), /Kayıt arşivlendi/u, `${definition.kind}:replay`);
    assert.ok(mutations.includes(`archive:${definition.kind}`), `${definition.kind}:archive-handler`);
  }

  for (const definition of MERCHANT_MODULE_DEFINITIONS.filter(({ workflow }) => workflow !== undefined)) {
    const mounted = await mount(definition, {});
    let prepare: React.ReactElement<Record<string, unknown>> | undefined;
    const buttons: string[] = [];
    visitElements(mounted.view, (element) => {
      if (element.type !== "button") return;
      const text = textOf(element).replace(/\s+/gu, " ").trim();
      buttons.push(text);
      if (text.includes(`${definition.workflow?.actionLabel} oluştur`)) prepare = element;
    });
    assert.ok(prepare, `${definition.kind}: missing provider prepare button in ${JSON.stringify(buttons)}`);
    (prepare.props.onClick as () => void)();
    for (let pass = 0; pass < 4; pass += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    mounted.view = await mounted.hooks.flush(mounted.render);
    const cancel = findElement(mounted.view, (element) => element.type === "button" && textOf(element).replace(/\s+/gu, " ").includes("Hazırlığı iptal et"));
    (cancel.props.onClick as () => void)();
    for (let pass = 0; pass < 4; pass += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    await mounted.hooks.flush(mounted.render);
    assert.ok(mutations.includes(`prepare:${definition.kind}`), `${definition.kind}:prepare-handler`);
    assert.ok(mutations.includes(`cancel:${definition.kind}`), `${definition.kind}:cancel-handler`);
    assert.ok(paths.includes(`/api/merchant-admin/provider-jobs/${definition.kind}`));
    assert.ok(paths.includes(`/api/merchant-admin/provider-jobs/${definition.kind}/${JOB_ID}/cancel`));
  }

  scenario = { ...scenario, failure: "none", records: "loaded", role: "store_owner" };
  paths.length = 0;
  const marketingHooks = createHookRuntime();
  const MarketingOverview = await compileComponent(
    "../../components/merchant-admin/MerchantMarketingOverview.tsx",
    "MerchantMarketingOverview",
    marketingHooks.runtime,
    {
      "@/components/panel/PanelPageShell": panelComponents(),
      "@/lib/merchant-admin-ui/client": { MerchantAdminApiError, merchantAdminApi: api },
    },
  );
  const MarketingPage = await compileBoundPage(
    "/marketing",
    "@/components/merchant-admin/MerchantMarketingOverview",
    "MerchantMarketingOverview",
    MarketingOverview,
    "store_owner",
  );
  const marketingTree = await MarketingPage();
  const marketingElement = findElement(marketingTree, (element) => element.type === MarketingOverview);
  const marketingView = await marketingHooks.flush(() => MarketingOverview(marketingElement.props));
  for (const kind of ["email_campaign", "phone_campaign", "whatsapp_campaign"] as const) {
    assert.ok(paths.includes(`/api/merchant-admin/records/${kind}`), `/marketing:${kind}`);
  }
  assert.match(textOf(marketingView).replace(/\s+/gu, " "), /E-posta 1 Kalıcı kampanya kaydı Yönet/u);
});

test("static merchant hubs invoke actual pages and expose only canonical destination links", async () => {
  const FamilyOverview = await compileComponent(
    "../../components/merchant-admin/MerchantFamilyOverview.tsx",
    "MerchantFamilyOverview",
    React,
    {
      "@/components/panel/PanelPageShell": panelComponents(),
      "@/lib/merchant-admin-ui/presentation": presentation,
    },
  );
  const DesignHub = await compileComponent(
    "../../components/settings/DesignSettingsHub.tsx",
    "DesignSettingsHub",
    React,
    { "@/components/panel/PanelPageShell": panelComponents() },
  );
  const cases = [
    {
      route: "/settings",
      module: "@/components/merchant-admin/MerchantFamilyOverview",
      exportName: "MerchantFamilyOverview",
      Component: FamilyOverview,
      destinations: MERCHANT_MODULE_DEFINITIONS.filter(({ family }) => family === "settings").map(({ route }) => route),
    },
    {
      route: "/content",
      module: "@/components/merchant-admin/MerchantFamilyOverview",
      exportName: "MerchantFamilyOverview",
      Component: FamilyOverview,
      destinations: MERCHANT_MODULE_DEFINITIONS.filter(({ family }) => family === "content").map(({ route }) => route),
    },
    {
      route: "/settings/design",
      module: "@/components/settings/DesignSettingsHub",
      exportName: "DesignSettingsHub",
      Component: DesignHub,
      destinations: ["/settings/hero-banner", "/settings/promotion-banner", "/settings/marquee", "/products/collections"],
    },
  ] as const;
  for (const entry of cases) {
    const Page = await compileBoundPage(entry.route, entry.module, entry.exportName, entry.Component, "store_owner");
    const pageTree = await Page();
    const componentElement = findElement(pageTree, (element) => element.type === entry.Component);
    const view = entry.Component(componentElement.props);
    const destinations: string[] = [];
    visitElements(view, (element) => {
      if (typeof element.props.href === "string") destinations.push(element.props.href);
    });
    assert.deepEqual(destinations, entry.destinations, entry.route);
    assert.doesNotMatch(textOf(view), /Toplam kayıt|Kalıcı kayıt/u, entry.route);
  }
});
