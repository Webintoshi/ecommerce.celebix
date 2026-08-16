import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as contracts from "@celebix/saas-contracts";
import {
  CustomerRepositoryError,
  type CustomerRepository,
} from "@celebix/saas-data";
import * as React from "react";
import { createElement, type ReactNode } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

import { createCustomerHttpHandlers } from "../customer-http/handler.ts";
import { createCustomerApi, CustomerApiError } from "./client.ts";

const ORIGIN = "https://panel.test";
const NOW = "2026-07-22T15:00:00.000Z";
const REQUEST_ID = "87000000-0000-4000-8000-000000000001";
const OPERATION_ID = "86000000-0000-4000-8000-000000000001";
const TAG_ID = "82000000-0000-4000-8000-000000000001";
const SEGMENT_ID = "83000000-0000-4000-8000-000000000001";
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 1).toString("base64url")}`;

type TaxonomyKind = "tags" | "segments";
type Role = contracts.TenantContext["membership"]["role"];
type Scenario = {
  kind: TaxonomyKind;
  records: "loaded" | "empty";
  failure: "none" | "unavailable" | "membership_denied" | "customer_conflict";
  role: Role;
  tags: contracts.CustomerTag[];
  segments: contracts.CustomerSegment[];
};

function tenant(role: Role): contracts.TenantContext {
  return {
    schemaVersion: 1,
    requestId: REQUEST_ID,
    principal: { id: "10000000-0000-4000-8000-000000000001", issuer: "https://id.test/oidc", subject: "taxonomy-route" },
    store: { id: "20000000-0000-4000-8000-000000000001", slug: "store", status: "active" },
    membership: { id: "30000000-0000-4000-8000-000000000001", role, status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: "40000000-0000-4000-8000-000000000001",
      planCode: "growth",
      version: 2,
      status: "active",
      features: ["customers"],
      limits: { products: 100, staff: 5, storageBytes: 100 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  } as contracts.TenantContext;
}

function tag(name = "VIP") {
  return { id: TAG_ID, name, color: "#7c3aed", customerCount: 3, version: 1 } as const;
}

function segment(name = "Tekrar alışveriş") {
  return { id: SEGMENT_ID, name, kind: "manual", customerCount: 4, version: 1 } as const;
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
      for (let pass = 0; pass < 30; pass += 1) {
        if (dirty || latest === undefined) {
          dirty = false;
          cursor = 0;
          latest = component();
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
        if (!dirty) return latest;
      }
      throw new Error("taxonomy_route_hook_flush_exhausted");
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
  assert.ok(result, "expected_taxonomy_route_element");
  return result;
}

const componentOutput = readFile(
  new URL("../../components/customers/CustomerTaxonomyConsole.tsx", import.meta.url),
  "utf8",
).then((source) => ts.transpileModule(source, {
  compilerOptions: {
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText);

async function compileConsole(react: typeof React, api: ReturnType<typeof createCustomerApi>) {
  const output = await componentOutput;
  const styles = new Proxy({}, { get: (_target, property) => property === "__esModule" ? true : property === "default" ? styles : String(property) });
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return react;
    if (specifier === "@/components/panel/PanelPageShell") return {
      PanelEmptyState: ({ title, description }: { title: string; description: string }) => createElement("section", { title, description }),
      PanelPageHeader: ({ title, description }: { title: string; description: string }) => createElement("header", { title, description }),
      PanelPageShell: ({ children }: { children?: ReactNode }) => createElement("section", null, children),
    };
    if (specifier === "@/lib/customer-ui/client") return { CustomerApiError, customerApi: api };
    if (specifier === "./customer-console.module.css") return styles;
    throw new Error(`unexpected_taxonomy_console_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  return compiled.exports.CustomerTaxonomyConsole as (props: { kind: TaxonomyKind; canManage: boolean }) => ReactNode;
}

async function compilePage(kind: TaxonomyKind, Console: (props: { kind: TaxonomyKind; canManage: boolean }) => ReactNode, role: Role) {
  const source = await readFile(new URL(`../../app/customers/${kind}/page.tsx`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "@celebix/saas-contracts") return contracts;
    if (specifier === "@/components/customers/CustomerTaxonomyConsole") return { CustomerTaxonomyConsole: Console };
    if (specifier === "@/components/customers/CustomerWorkspace") return { CustomerWorkspace: ({ children }: { children?: ReactNode }) => createElement("section", null, children) };
    if (specifier === "@/lib/server-access") return { requireServerPanelAccess: async () => ({ tenantContext: tenant(role) }) };
    throw new Error(`unexpected_taxonomy_page_import:${kind}:${specifier}`);
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

test("customer taxonomy routes invoke actual pages, production consoles, clients, and handlers across truth and mutation states", async () => {
  let scenario: Scenario = {
    kind: "tags",
    records: "loaded",
    failure: "none",
    role: "store_owner",
    tags: [tag()],
    segments: [segment()],
  };
  const paths: string[] = [];
  const seenOperations = new Set<string>();
  const replayedOperations: string[] = [];
  const unexpected = async () => { throw new Error("unexpected_customer_repository_call"); };
  const repository: CustomerRepository = {
    getSummary: unexpected,
    list: unexpected,
    get: unexpected,
    getWorkspace: unexpected,
    save: unexpected,
    archive: unexpected,
    addNote: unexpected,
    async listTags() {
      if (scenario.failure !== "none") throw new CustomerRepositoryError(scenario.failure);
      return scenario.records === "empty" ? [] : scenario.tags;
    },
    async upsertTag(input) {
      if (scenario.failure === "customer_conflict") throw new CustomerRepositoryError("customer_conflict");
      const key = `tags:${input.operationId}`;
      if (seenOperations.has(key)) replayedOperations.push(key);
      else {
        seenOperations.add(key);
        scenario.tags = [{ ...tag(input.name), color: input.color }];
      }
      return scenario.tags[0]!;
    },
    setTags: unexpected,
    async listSegments() {
      if (scenario.failure !== "none") throw new CustomerRepositoryError(scenario.failure);
      return scenario.records === "empty" ? [] : scenario.segments;
    },
    async upsertSegment(input) {
      if (scenario.failure === "customer_conflict") throw new CustomerRepositoryError("customer_conflict");
      const key = `segments:${input.operationId}`;
      if (seenOperations.has(key)) replayedOperations.push(key);
      else {
        seenOperations.add(key);
        scenario.segments = [{ ...segment(input.name), ...(input.description ? { description: input.description } : {}) }];
      }
      return scenario.segments[0]!;
    },
    setSegments: unexpected,
    export: unexpected,
  } as CustomerRepository;
  const handlers = createCustomerHttpHandlers({
    async resolveRuntime() {
      if (scenario.failure === "unavailable") return null;
      return {
        customers: repository,
        access: {
          readiness: { mode: "approved_staging" },
          panelOrigin: ORIGIN,
          async resolveCredential() { return { kind: "authenticated", session: {}, tenantContext: tenant(scenario.role) }; },
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
    if (path === "/api/customers/tags") return init?.method === "POST" ? handlers.saveTag(request(path, init)) : handlers.tags(request(path, init));
    if (path === "/api/customers/segments") return init?.method === "POST" ? handlers.saveSegment(request(path, init)) : handlers.segments(request(path, init));
    throw new Error(`unexpected_taxonomy_path:${path}`);
  }) as typeof fetch;
  const api = createCustomerApi(fetcher, () => OPERATION_ID);

  async function mount(kind: TaxonomyKind, patch: Partial<Scenario>) {
    scenario = {
      kind,
      records: "loaded",
      failure: "none",
      role: "store_owner",
      tags: [tag()],
      segments: [segment()],
      ...patch,
    };
    paths.length = 0;
    const hooks = createHookRuntime();
    const Console = await compileConsole(hooks.runtime, api);
    const Page = await compilePage(kind, Console, scenario.role);
    const pageTree = await Page();
    const routeConsole = findElement(pageTree, (element) => element.type === Console);
    assert.equal(routeConsole.props.kind, kind);
    assert.equal(routeConsole.props.canManage, scenario.role === "store_owner");
    const render = () => Console(routeConsole.props as { kind: TaxonomyKind; canManage: boolean });
    return { hooks, render, view: await hooks.flush(render) };
  }

  for (const kind of ["tags", "segments"] as const) {
    let mounted = await mount(kind, { records: "loaded" });
    assert.match(textOf(mounted.view), kind === "tags" ? /VIP/u : /Tekrar alışveriş/u, `${kind}:loaded`);
    assert.deepEqual(paths, [`/api/customers/${kind}`], `${kind}:handler-list`);

    mounted = await mount(kind, { records: "empty" });
    assert.match(textOf(mounted.view), kind === "tags" ? /Henüz etiketler yok/u : /Henüz segmentler yok/u, `${kind}:empty`);

    mounted = await mount(kind, { failure: "unavailable" });
    assert.match(textOf(mounted.view), /şu anda kullanılamıyor/u, `${kind}:unavailable`);

    mounted = await mount(kind, { failure: "membership_denied" });
    assert.match(textOf(mounted.view), /yetkiniz yok/u, `${kind}:membership-denied`);

    mounted = await mount(kind, { role: "analyst" });
    let formFound = false;
    visitElements(mounted.view, (element) => { if (element.type === "form") formFound = true; });
    assert.equal(formFound, false, `${kind}:read-only`);

    const originalFormData = globalThis.FormData;
    class TestFormData {
      get(name: string) {
        if (name === "name") return kind === "tags" ? "Sadık" : "Yeni segment";
        if (name === "secondary") return kind === "tags" ? "#2563eb" : "Kalıcı segment";
        return null;
      }
    }
    Object.defineProperty(globalThis, "FormData", { configurable: true, value: TestFormData });
    try {
      mounted = await mount(kind, { failure: "customer_conflict" });
      let form = findElement(mounted.view, (element) => element.type === "form");
      await (form.props.onSubmit as (event: { preventDefault(): void; currentTarget: { reset(): void } }) => Promise<void>)({
        preventDefault() {},
        currentTarget: { reset() {} },
      });
      mounted.view = await mounted.hooks.flush(mounted.render);
      assert.match(textOf(mounted.view), /başka bir kayıtla çakışıyor/u, `${kind}:conflict`);

      mounted = await mount(kind, { records: "empty" });
      form = findElement(mounted.view, (element) => element.type === "form");
      const submit = form.props.onSubmit as (event: { preventDefault(): void; currentTarget: { reset(): void } }) => Promise<void>;
      const event = { preventDefault() {}, currentTarget: { reset() {} } };
      await submit(event);
      mounted.view = await mounted.hooks.flush(mounted.render);
      form = findElement(mounted.view, (element) => element.type === "form");
      await (form.props.onSubmit as typeof submit)(event);
      mounted.view = await mounted.hooks.flush(mounted.render);
      assert.ok(replayedOperations.includes(`${kind}:${OPERATION_ID}`), `${kind}:replayed-handler`);
      assert.equal(kind === "tags" ? scenario.tags.length : scenario.segments.length, 1, `${kind}:replay-single-record`);
      assert.equal(paths.filter((path) => path === `/api/customers/${kind}`).length, 5, `${kind}:list-plus-two-posts-and-reloads`);
    } finally {
      Object.defineProperty(globalThis, "FormData", { configurable: true, value: originalFormData });
    }
  }
});
