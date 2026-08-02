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
  save: "success" | "version_conflict" | "replayed";
  role: Role;
  recordName: string;
  recordStatus: "active" | "draft" | "archived";
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
    name: scenario.recordName,
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
    visitElements(child.props.actions as ReactNode, visitor);
    visitElements(child.props.action as ReactNode, visitor);
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
    values.push(textOf(child.props.actions as ReactNode));
    values.push(textOf(child.props.action as ReactNode));
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
    if (specifier === "@/components/merchant-admin/ProviderConnectionPanel") return { ProviderConnectionPanel: (props: Record<string, unknown>) => createElement("section", { ...props, "data-provider-connection-panel": true }) };
    if (specifier === "@/lib/merchant-admin-ui/client") return { MerchantAdminApiError, merchantAdminApi: api };
    if (specifier === "@/lib/provider-execution-ui/client") return { providerExecutionApi: { async profiles() { return Object.freeze([]); } } };
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
    if (specifier === "@/components/toshi-settings/ArtificialIntelligenceSettings") {
      return { ArtificialIntelligenceSettings: (props: Record<string, unknown>) => createElement("section", { ...props, "data-toshi-settings": true }) };
    }
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
  return compiled.exports.default as (props?: Record<string, unknown>) => Promise<ReactNode>;
}

test("AI settings page renders only provider connections and omits the legacy setup console", async () => {
  const LegacyConsole = (props: Record<string, unknown>) => createElement("section", {
    ...props,
    "data-legacy-ai-settings": true,
  });
  const Page = await compilePage(
    "/settings/artificial-intelligence",
    LegacyConsole as (props: { kind: contracts.MerchantAdminRecordKind; canManage: boolean }) => ReactNode,
    "store_owner",
  );
  const pageTree = await Page();
  let providerSettings: React.ReactElement<Record<string, unknown>> | undefined;
  let legacySettings: React.ReactElement<Record<string, unknown>> | undefined;
  visitElements(pageTree, (element) => {
    if (typeof element.type === "function" && element.type !== LegacyConsole) providerSettings = element;
    if (element.type === LegacyConsole) legacySettings = element;
  });

  assert.ok(providerSettings);
  assert.equal(providerSettings.props.canManage, true);
  assert.equal(legacySettings, undefined);
});

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
    save: "success",
    role: "store_owner",
    recordName: "discount durable record",
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
    async get(input) {
      assert.equal(input.kind, scenario.kind);
      assert.equal(input.recordId, RECORD_ID);
      mutations.push(`read:${scenario.kind}:${input.recordId}`);
      return recordFor(scenario);
    },
    async listEvents() { return []; },
    async listProviderJobs() { return scenario.jobs; },
    async save(input) {
      mutations.push(`save:${scenario.kind}:${input.recordId ? "update" : "create"}`);
      if (scenario.save === "version_conflict") throw new MerchantAdminRepositoryError("version_conflict");
      assert.equal(input.kind, scenario.kind);
      if (input.recordId) {
        assert.equal(input.recordId, RECORD_ID);
        assert.equal(input.expectedVersion, scenario.recordVersion);
      } else {
        assert.equal(input.expectedVersion, undefined);
      }
      scenario.records = "loaded";
      scenario.recordName = input.name;
      scenario.recordStatus = input.status;
      scenario.recordVersion = (input.expectedVersion ?? 0) + 1;
      return {
        id: RECORD_ID,
        kind: scenario.kind,
        status: scenario.recordStatus,
        version: scenario.recordVersion,
        updatedAt: NOW,
        replayed: scenario.save === "replayed",
      };
    },
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
        profileId: null,
        providerCode: null,
        credentialVersion: null,
        attempt: 0,
        safeProviderReference: null,
        outcomeCode: null,
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
    async queueProviderJob() { throw new Error("unexpected_provider_queue"); },
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
      save: "success",
      role: "store_owner",
      recordName: `${definition.kind} durable record`,
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

  const genericDefinitions = MERCHANT_MODULE_DEFINITIONS.filter(({ kind }) => kind !== "payment_setting" && kind !== "ai_setting");
  for (const definition of genericDefinitions) {
    let mounted = await mount(definition, { records: "loaded" });
    if (definition.cardinality === "singleton") {
      assert.match(textOf(mounted.view), /Kayıtlı ayarlar/u, `${definition.kind}:loaded-singleton`);
      assert.match(textOf(mounted.view), /Ayarları kaydet/u, `${definition.kind}:save-singleton`);
      assert.doesNotMatch(textOf(mounted.view), /Toplam kayıt/u, `${definition.kind}:no-collection-metrics`);
    } else {
      assert.match(textOf(mounted.view), new RegExp(`${definition.kind} durable record`), `${definition.kind}:loaded`);
    }
    assert.ok(paths.includes(`/api/merchant-admin/records/${definition.kind}`), `${definition.kind}:handler-list`);
    assert.ok(paths.includes(`/api/merchant-admin/events/${definition.kind}`), `${definition.kind}:handler-events`);
    const exact = await api.record(definition.kind, RECORD_ID);
    assert.equal(exact.id, RECORD_ID, `${definition.kind}:exact-record`);
    assert.ok(paths.includes(`/api/merchant-admin/records/${definition.kind}/${RECORD_ID}`), `${definition.kind}:handler-exact-record`);
    assert.ok(mutations.includes(`read:${definition.kind}:${RECORD_ID}`), `${definition.kind}:repository-exact-record`);

    mounted = await mount(definition, { records: "empty" });
    if (definition.cardinality === "singleton") {
      assert.match(textOf(mounted.view), /İlk yapılandırma/u, `${definition.kind}:empty-singleton`);
      assert.doesNotMatch(textOf(mounted.view), new RegExp(`Henüz ${definition.singular} yok`, "u"), `${definition.kind}:no-empty-list`);
    } else {
      assert.match(textOf(mounted.view), new RegExp(`Henüz ${definition.singular} yok`, "u"), `${definition.kind}:empty`);
    }

    mounted = await mount(definition, { failure: "unavailable" });
    assert.match(textOf(mounted.view), /şu anda kullanılamıyor/u, `${definition.kind}:unavailable`);

    mounted = await mount(definition, { failure: "membership_denied" });
    assert.match(textOf(mounted.view), /yetkiniz yok/u, `${definition.kind}:membership-denied`);

    mounted = await mount(definition, { role: "analyst" });
    assert.doesNotMatch(textOf(mounted.view), /Yeni kayıt|kaydını arşivle/u, `${definition.kind}:read-only`);

    if (definition.cardinality === "collection") {
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
  }

  async function submitInlineRecord(
    definition: MerchantModuleDefinition,
    action: "create" | "update",
    save: Scenario["save"],
  ) {
    const mounted = await mount(definition, { records: action === "create" ? "empty" : "loaded", save });
    const trigger = definition.cardinality === "collection" ? findElement(mounted.view, (element) => element.type === "button" && (
      action === "create"
        ? textOf(element).includes("Yeni kayıt") || (textOf(element).includes(definition.singular) && textOf(element).includes("oluştur"))
        : typeof element.props["aria-label"] === "string" && String(element.props["aria-label"]).endsWith("kaydını düzenle")
    )) : undefined;
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    const originalFormData = globalThis.FormData;
    class TestFormData {
      constructor(private readonly target: { values: Readonly<Record<string, string | readonly string[]>> }) {}
      get(name: string) {
        const value = this.target.values[name];
        return Array.isArray(value) ? value[0] ?? null : value ?? null;
      }
      getAll(name: string) {
        const value = this.target.values[name];
        return value === undefined ? [] : Array.isArray(value) ? [...value] : [value];
      }
    }
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { activeElement: null, body: { style: { overflow: "" } } },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { addEventListener() {}, removeEventListener() {} },
    });
    Object.defineProperty(globalThis, "FormData", { configurable: true, value: TestFormData });
    try {
      if (trigger) {
        (trigger.props.onClick as (event: { currentTarget: { focus(): void } }) => void)({ currentTarget: { focus() {} } });
        mounted.view = await mounted.hooks.flush(mounted.render);
      }
      const form = findElement(mounted.view, (element) => element.type === "form");
      const values: Record<string, string | readonly string[]> = {
        name: `${definition.kind} ${action} persisted`,
        status: "active",
      };
      for (const field of definition.fields) {
        values[field.key] = field.type === "boolean"
          ? "on"
          : field.type === "number"
            ? "5"
            : field.type === "datetime"
              ? "2026-07-22T15:00:00.000"
              : field.type === "enum-list"
                ? [field.allowedValues?.[0] ?? "configured"]
                : field.type === "enum"
                  ? field.allowedValues?.[0] ?? "configured"
                  : field.type === "string-list"
                    ? "configured"
                    : `${field.key} configured`;
      }
      await (form.props.onSubmit as (event: { preventDefault(): void; currentTarget: { values: Readonly<Record<string, string | readonly string[]>>; reset(): void } }) => Promise<void>)({
        preventDefault() {},
        currentTarget: { values, reset() {} },
      });
      mounted.view = await mounted.hooks.flush(mounted.render);
      assert.ok(mutations.includes(`save:${definition.kind}:${action}`), `${definition.kind}:${action}:${save}:handler`);
      assert.ok(paths.includes(`/api/merchant-admin/records/${definition.kind}`), `${definition.kind}:${action}:${save}:path`);
      if (save === "version_conflict") {
        assert.match(textOf(mounted.view), /sizden önce güncellendi/u, `${definition.kind}:${action}:conflict`);
      } else {
        assert.match(textOf(mounted.view), definition.cardinality === "singleton" ? /Ayarlar kalıcı olarak kaydedildi/u : /Kayıt kalıcı olarak kaydedildi/u, `${definition.kind}:${action}:${save}:saved`);
        assert.equal(scenario.recordName, `${definition.kind} ${action} persisted`);
      }
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
      Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
      Object.defineProperty(globalThis, "FormData", { configurable: true, value: originalFormData });
    }
  }

  const inlineDefinitions = MERCHANT_MODULE_DEFINITIONS.filter(({ kind }) => kind !== "ai_setting" && recordRoute.createRouteFor(kind) === undefined);
  for (const definition of inlineDefinitions) {
    await submitInlineRecord(definition, "create", "success");
    await submitInlineRecord(definition, "update", "success");
    await submitInlineRecord(definition, "update", "version_conflict");
    await submitInlineRecord(definition, "update", "replayed");
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
  const readOnlyMarketingHooks = createHookRuntime();
  const ReadOnlyMarketingOverview = await compileComponent(
    "../../components/merchant-admin/MerchantMarketingOverview.tsx",
    "MerchantMarketingOverview",
    readOnlyMarketingHooks.runtime,
    {
      "@/components/panel/PanelPageShell": panelComponents(),
      "@/lib/merchant-admin-ui/client": { MerchantAdminApiError, merchantAdminApi: api },
    },
  );
  const readOnlyMarketingView = await readOnlyMarketingHooks.flush(() => ReadOnlyMarketingOverview({ canManage: false }));
  const readOnlyDestinations: string[] = [];
  visitElements(readOnlyMarketingView, (element) => {
    if (typeof element.props.href === "string") readOnlyDestinations.push(element.props.href);
  });
  assert.deepEqual(readOnlyDestinations, ["/marketing/email", "/marketing/phone", "/marketing/whatsapp"]);
  assert.match(textOf(readOnlyMarketingView).replace(/\s+/gu, " "), /E-posta 1 Kalıcı kampanya kaydı Görüntüle/u);
});

test("merchant non-default route matrix invokes nine actual pages and exact create update handlers across success conflict and replay", async () => {
  type SaveMode = "success" | "version_conflict" | "replayed";
  type RouteCase = Readonly<{
    route: string;
    kind: contracts.MerchantAdminRecordKind;
    returnTo: string;
    mode: "create" | "edit";
    component: "console" | "editor";
  }>;
  const cases: readonly RouteCase[] = Object.freeze([
    { route: "/content/blog/new", kind: "blog_post", returnTo: "/content/blog", mode: "create", component: "editor" },
    { route: "/content/blog/[recordId]/edit", kind: "blog_post", returnTo: "/content/blog", mode: "edit", component: "editor" },
    { route: "/content/pages/new", kind: "page", returnTo: "/content/pages", mode: "create", component: "editor" },
    { route: "/content/pages/[recordId]/edit", kind: "page", returnTo: "/content/pages", mode: "edit", component: "editor" },
    { route: "/content/policies/[recordId]/edit", kind: "policy", returnTo: "/content/policies", mode: "edit", component: "editor" },
    { route: "/discounts/new", kind: "discount", returnTo: "/discounts", mode: "create", component: "console" },
    { route: "/discounts/[recordId]/edit", kind: "discount", returnTo: "/discounts", mode: "edit", component: "editor" },
  ]);
  let activeCase = cases[0]!;
  let saveMode: SaveMode = "success";
  let stored: contracts.MerchantAdminRecord | undefined;
  const reads: Array<Readonly<{ kind: contracts.MerchantAdminRecordKind; recordId: string }>> = [];
  const writes: Array<Readonly<{
    kind: contracts.MerchantAdminRecordKind;
    recordId?: string;
    expectedVersion?: number;
    operationId: string;
    replayed: boolean;
  }>> = [];
  const paths: string[] = [];
  const repository: MerchantAdminRepository = {
    async list(input) {
      assert.equal(input.kind, activeCase.kind);
      return stored ? [stored] : [];
    },
    async get(input) {
      reads.push({ kind: input.kind, recordId: input.recordId });
      assert.equal(input.kind, activeCase.kind);
      assert.equal(input.recordId, RECORD_ID);
      if (!stored) throw new MerchantAdminRepositoryError("record_not_found");
      return stored;
    },
    async listEvents() { return []; },
    async listProviderJobs() { return []; },
    async save(input) {
      if (saveMode === "version_conflict") throw new MerchantAdminRepositoryError("version_conflict");
      assert.equal(input.kind, activeCase.kind);
      assert.equal(input.recordId, activeCase.mode === "edit" ? RECORD_ID : undefined);
      assert.equal(input.expectedVersion, activeCase.mode === "edit" ? 7 : undefined);
      const next: contracts.MerchantAdminRecord = {
        id: input.recordId ?? RECORD_ID,
        kind: input.kind,
        name: input.name,
        config: input.config,
        status: input.status,
        version: (input.expectedVersion ?? 0) + 1,
        createdAt: stored?.createdAt ?? NOW,
        updatedAt: NOW,
      };
      stored = next;
      const replayed = saveMode === "replayed";
      writes.push({
        kind: input.kind,
        ...(input.recordId ? { recordId: input.recordId, expectedVersion: input.expectedVersion } : {}),
        operationId: input.operationId,
        replayed,
      });
      return {
        id: next.id,
        kind: next.kind,
        status: next.status,
        version: next.version,
        updatedAt: next.updatedAt,
        replayed,
      };
    },
    async archive() { throw new Error("unexpected_non_default_archive"); },
    async prepareProviderJob() { throw new Error("unexpected_non_default_prepare"); },
    async queueProviderJob() { throw new Error("unexpected_non_default_queue"); },
    async cancelProviderJob() { throw new Error("unexpected_non_default_cancel"); },
  };
  const handlers = createMerchantAdminHttpHandlers({
    async resolveRuntime() {
      return {
        merchantAdmin: repository,
        access: {
          readiness: { mode: "approved_staging" },
          panelOrigin: ORIGIN,
          async resolveCredential() { return { kind: "authenticated", session: {}, tenantContext: tenant("store_owner") }; },
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
    let match = /^\/api\/merchant-admin\/records\/([^/]+)\/([^/]+)$/u.exec(path);
    if (match) return handlers.record(request(path, init), match[1]!, match[2]!);
    match = /^\/api\/merchant-admin\/records\/([^/]+)$/u.exec(path);
    if (match) return init?.method === "POST"
      ? handlers.save(request(path, init), match[1]!)
      : handlers.records(request(path, init), match[1]!);
    match = /^\/api\/merchant-admin\/events\/([^/]+)$/u.exec(path);
    if (match) return handlers.events(request(path, init), match[1]!);
    throw new Error(`unexpected_non_default_route_path:${path}`);
  }) as typeof fetch;
  const api = createMerchantAdminApi(fetcher, () => OPERATION_ID);
  const pushes: string[] = [];
  let refreshes = 0;

  const originalFormData = globalThis.FormData;
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  class TestFormData {
    readonly values: Readonly<Record<string, string | readonly string[]>>;
    constructor(target: { values: Readonly<Record<string, string | readonly string[]>> }) {
      this.values = target.values;
    }
    get(name: string) {
      const value = this.values[name];
      return Array.isArray(value) ? value[0] ?? null : value ?? null;
    }
    getAll(name: string) {
      const value = this.values[name];
      return value === undefined ? [] : Array.isArray(value) ? [...value] : [value];
    }
  }
  Object.defineProperty(globalThis, "FormData", { configurable: true, value: TestFormData });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { activeElement: null, body: { style: { overflow: "" } } },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { addEventListener() {}, removeEventListener() {} },
  });
  try {
    for (const routeCase of cases) {
      for (const mode of ["success", "version_conflict", "replayed"] as const) {
        activeCase = routeCase;
        saveMode = mode;
        stored = routeCase.mode === "edit"
          ? { ...recordFor({ kind: routeCase.kind, records: "loaded", failure: "none", archive: "success", save: "success", role: "store_owner", recordName: `${routeCase.kind} durable record`, recordStatus: "active", recordVersion: 7, jobs: [] }), version: 7 }
          : undefined;
        reads.length = 0;
        writes.length = 0;
        paths.length = 0;
        pushes.length = 0;
        refreshes = 0;
        const hooks = createHookRuntime();
        let component: (props: Record<string, unknown>) => ReactNode;
        let routeElement: React.ReactElement<Record<string, unknown>>;
        if (routeCase.component === "console") {
          const Console = await compileConsole(hooks.runtime, api);
          const Page = await compilePage(routeCase.route, Console, "store_owner");
          const pageTree = await Page();
          routeElement = findElement(pageTree, (element) => element.type === Console);
          assert.deepEqual(
            { kind: routeElement.props.kind, canManage: routeElement.props.canManage, createFirst: routeElement.props.createFirst },
            { kind: routeCase.kind, canManage: true, createFirst: true },
            `${routeCase.route}:${mode}:page-binding`,
          );
          component = Console as (props: Record<string, unknown>) => ReactNode;
        } else {
          const Editor = await compileComponent(
            "../../components/merchant-admin/MerchantRecordEditor.tsx",
            "MerchantRecordEditor",
            hooks.runtime,
            {
              "@celebix/saas-contracts": contracts,
              "next/navigation": { useRouter: () => ({ push: (path: string) => { pushes.push(path); }, refresh: () => { refreshes += 1; } }) },
              "@/components/panel/PanelPageShell": panelComponents(),
              "@/lib/merchant-admin-ui/client": { MerchantAdminApiError, merchantAdminApi: api },
              "@/lib/merchant-admin-ui/presentation": presentation,
            },
          );
          const Page = await compileBoundPage(
            routeCase.route,
            "@/components/merchant-admin/MerchantRecordEditor",
            "MerchantRecordEditor",
            Editor,
            "store_owner",
          );
          const pageTree = await Page(routeCase.mode === "edit" ? { params: Promise.resolve({ recordId: RECORD_ID }) } : undefined);
          routeElement = findElement(pageTree, (element) => element.type === Editor);
          assert.deepEqual(
            {
              kind: routeElement.props.kind,
              recordId: routeElement.props.recordId,
              returnTo: routeElement.props.returnTo,
              canManage: routeElement.props.canManage,
            },
            {
              kind: routeCase.kind,
              recordId: routeCase.mode === "edit" ? RECORD_ID : undefined,
              returnTo: routeCase.returnTo,
              canManage: true,
            },
            `${routeCase.route}:${mode}:page-binding`,
          );
          component = Editor;
        }
        const render = () => component(routeElement.props);
        let view = await hooks.flush(render);
        const form = findElement(view, (element) => element.type === "form");
        const values: Record<string, string> = { name: `${routeCase.kind} persisted`, status: "active" };
        const definition = MERCHANT_MODULE_DEFINITIONS.find(({ kind }) => kind === routeCase.kind);
        assert.ok(definition);
        for (const field of definition.fields) {
          values[field.key] = field.type === "number" ? "5" : field.type === "boolean" ? "on" : `${field.key} configured`;
        }
        await (form.props.onSubmit as (event: { preventDefault(): void; currentTarget: { values: Readonly<Record<string, string>>; reset(): void } }) => Promise<void>)({
          preventDefault() {},
          currentTarget: { values, reset() {} },
        });
        view = await hooks.flush(render);
        assert.ok(paths.includes(`/api/merchant-admin/records/${routeCase.kind}`), `${routeCase.route}:${mode}:save-handler`);
        if (routeCase.mode === "edit") {
          assert.deepEqual(reads, [{ kind: routeCase.kind, recordId: RECORD_ID }], `${routeCase.route}:${mode}:exact-read`);
          assert.ok(paths.includes(`/api/merchant-admin/records/${routeCase.kind}/${RECORD_ID}`), `${routeCase.route}:${mode}:record-handler`);
        } else {
          assert.deepEqual(reads, [], `${routeCase.route}:${mode}:no-create-read`);
        }
        if (mode === "version_conflict") {
          assert.deepEqual(writes, [], `${routeCase.route}:${mode}:no-commit`);
          assert.match(textOf(view), /sizden önce güncellendi/u, `${routeCase.route}:${mode}:visible-conflict`);
          assert.deepEqual(pushes, [], `${routeCase.route}:${mode}:no-redirect`);
        } else {
          assert.equal(writes.length, 1, `${routeCase.route}:${mode}:one-commit`);
          assert.equal(writes[0]?.replayed, mode === "replayed", `${routeCase.route}:${mode}:replay-truth`);
          assert.equal(stored?.name, `${routeCase.kind} persisted`, `${routeCase.route}:${mode}:stateful-save`);
          if (routeCase.component === "editor") {
            assert.deepEqual(pushes, [routeCase.returnTo], `${routeCase.route}:${mode}:redirect`);
            assert.equal(refreshes, 1, `${routeCase.route}:${mode}:refresh`);
          } else {
            assert.match(textOf(view), /Kayıt kalıcı olarak kaydedildi/u, `${routeCase.route}:${mode}:visible-save`);
          }
        }
      }
    }
  } finally {
    Object.defineProperty(globalThis, "FormData", { configurable: true, value: originalFormData });
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
});

test("provider connection panel renders masked active and truthful disabled states without credential echo", async () => {
  const profile = {
    id: "74000000-0000-4000-8000-000000000001", providerCode: "fixture_provider", capability: "marketplace_sync" as const,
    publicConfig: { account_reference: "merchant-42" }, maskedAccountReference: "••••nt-42", status: "active" as const,
    credentialVersion: 2, version: 3, lastValidatedAt: NOW, createdAt: NOW, updatedAt: NOW,
  };
  const descriptor = {
    providerCode: "fixture_provider", capability: "marketplace_sync" as const, label: "Fixture Provider",
    publicFields: [{ key: "account_reference", label: "Hesap" }],
    credentialFields: [{ key: "api_secret", label: "API Secret", secret: true as const }],
  };
  async function render(definitions: readonly unknown[], profiles: readonly unknown[]) {
    const hooks = createHookRuntime();
    const Panel = await compileComponent(
      "../../components/merchant-admin/ProviderConnectionPanel.tsx",
      "ProviderConnectionPanel",
      hooks.runtime,
      {
        "@celebix/saas-contracts": contracts,
        "@/lib/provider-execution-ui/client": {
          ProviderExecutionApiError: class extends Error {},
          providerExecutionApi: {
            async definitions() { return definitions; }, async profiles() { return profiles; },
            async save() { throw new Error("unused"); }, async disable() { throw new Error("unused"); }, async revoke() { throw new Error("unused"); },
          },
        },
      },
    );
    return hooks.flush(() => Panel({ capability: "marketplace_sync", canManage: true }));
  }
  const active = await render([descriptor], [profile]);
  assert.match(textOf(active), /Fixture Provider/);
  assert.match(textOf(active), /••••nt-42/);
  assert.doesNotMatch(textOf(active), /api_secret|ciphertext|credentialDigest|storeId/);
  const disabled = await render([], []);
  assert.match(textOf(disabled), /Sağlayıcı adaptörü etkin değil/);
  assert.doesNotMatch(textOf(disabled), /bağlandı|senkronize edildi|başarılı/iu);
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
      title: "Ayarlar",
      module: "@/components/merchant-admin/MerchantFamilyOverview",
      exportName: "MerchantFamilyOverview",
      Component: FamilyOverview,
      destinations: MERCHANT_MODULE_DEFINITIONS
        .filter(({ family }) => family === "settings")
        .flatMap(({ route }) => route === "/settings/general" ? [route, "/settings/design"] : [route]),
    },
    {
      route: "/content",
      title: "İçerik",
      module: "@/components/merchant-admin/MerchantFamilyOverview",
      exportName: "MerchantFamilyOverview",
      Component: FamilyOverview,
      destinations: MERCHANT_MODULE_DEFINITIONS.filter(({ family }) => family === "content").map(({ route }) => route),
    },
    {
      route: "/settings/design",
      title: null,
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
    if (entry.title) {
      const heading = findElement(view, (element) => element.props.title === entry.title);
      assert.equal(heading.props.title, entry.title, `${entry.route}:visible-heading`);
      assert.equal(typeof heading.props.description, "string", `${entry.route}:visible-description`);
    }
    const destinations: string[] = [];
    visitElements(view, (element) => {
      if (typeof element.props.href === "string") destinations.push(element.props.href);
    });
    assert.deepEqual(destinations, entry.destinations, entry.route);
    assert.doesNotMatch(textOf(view), /Toplam kayıt|Kalıcı kayıt/u, entry.route);
  }
});
