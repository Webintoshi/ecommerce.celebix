import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as contracts from "@celebix/saas-contracts";
import {
  CustomerRepositoryError,
  type CustomerRepository,
  type SaveCustomerInput,
} from "@celebix/saas-data";
import * as React from "react";
import { createElement, type ReactNode } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

import { createCustomerHttpHandlers } from "../customer-http/handler.ts";
import { createCustomerApi, CustomerApiError } from "./client.ts";

const ORIGIN = "https://panel.test";
const NOW = "2026-07-22T15:00:00.000Z";
const CUSTOMER_ID = "81000000-0000-4000-8000-000000000001";
const ADDRESS_ID = "82000000-0000-4000-8000-000000000001";
const NOTE_ID = "83000000-0000-4000-8000-000000000001";
const TAG_ID = "84000000-0000-4000-8000-000000000001";
const SEGMENT_ID = "85000000-0000-4000-8000-000000000001";
const OPERATION_ID = "86000000-0000-4000-8000-000000000001";
const REQUEST_ID = "87000000-0000-4000-8000-000000000001";
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 1).toString("base64url")}`;

type Role = contracts.TenantContext["membership"]["role"];
type Failure = "none" | "customer_conflict" | "membership_denied" | "unavailable" | "version_conflict";

function tenant(role: Role): contracts.TenantContext {
  return {
    schemaVersion: 1,
    requestId: REQUEST_ID,
    principal: { id: "10000000-0000-4000-8000-000000000001", issuer: "https://id.test/oidc", subject: "customer-route" },
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

const tag = (): contracts.CustomerTag => ({ id: TAG_ID, name: "VIP", color: "#7c3aed", customerCount: 1, version: 1 });
const segment = (): contracts.CustomerSegment => ({ id: SEGMENT_ID, name: "Sadık müşteriler", kind: "manual", customerCount: 1, version: 1 });

function customer(version = 7, status: contracts.CustomerStatus = "active"): contracts.CustomerDetail {
  return {
    id: CUSTOMER_ID,
    status,
    displayName: "Ada Lovelace",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    phone: "+905551112233",
    orderCount: 2,
    totalSpentCents: 12500,
    currency: "TRY",
    tags: [],
    version,
    createdAt: NOW,
    updatedAt: NOW,
    addresses: [{
      id: ADDRESS_ID,
      label: "Ev",
      recipientName: "Ada Lovelace",
      line1: "Test Sokak 1",
      city: "İstanbul",
      country: "TR",
      isDefault: true,
      version: 1,
    }],
    consents: [{ channel: "email", status: "granted", recordedAt: NOW }],
    notes: [],
    segments: [],
  };
}

function listItem(detail: contracts.CustomerDetail): contracts.CustomerListItem {
  return {
    id: detail.id,
    status: detail.status,
    displayName: detail.displayName,
    firstName: detail.firstName,
    lastName: detail.lastName,
    ...(detail.email ? { email: detail.email } : {}),
    ...(detail.phone ? { phone: detail.phone } : {}),
    orderCount: detail.orderCount,
    totalSpentCents: detail.totalSpentCents,
    currency: detail.currency,
    tags: detail.tags,
    version: detail.version,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  };
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
      throw new Error("customer_route_behavior_hook_flush_exhausted");
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

function findElement(node: ReactNode, predicate: (element: React.ReactElement<Record<string, unknown>>) => boolean) {
  let result: React.ReactElement<Record<string, unknown>> | undefined;
  visitElements(node, (element) => {
    if (result === undefined && predicate(element)) result = element;
  });
  assert.ok(result, "expected_customer_route_element");
  return result;
}

function panelComponents() {
  return {
    PanelEmptyState: ({ title, description }: { title: string; description: string }) => createElement("section", { title, description }),
    PanelPageHeader: ({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) => createElement("header", { title, description }, actions),
    PanelPageShell: ({ children }: { children?: ReactNode }) => createElement("section", null, children),
    PanelStatusBadge: ({ children }: { children?: ReactNode }) => createElement("span", null, children),
  };
}

async function compileComponent(
  relativePath: string,
  exportName: string,
  react: typeof React,
  api: ReturnType<typeof createCustomerApi>,
  push: (path: string) => void,
) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const styles = new Proxy({}, { get: (_target, property) => property === "__esModule" ? true : property === "default" ? styles : String(property) });
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return react;
    if (specifier === "next/link") return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => createElement("a", props, children);
    if (specifier === "next/navigation") return { useRouter: () => ({ push }) };
    if (specifier === "lucide-react") return new Proxy({}, { get: () => (props: Record<string, unknown>) => createElement("svg", props) });
    if (specifier === "@/components/panel/PanelPageShell") return panelComponents();
    if (specifier === "@/lib/customer-ui/client") return { CustomerApiError, customerApi: api };
    if (specifier.endsWith(".module.css")) return styles;
    throw new Error(`unexpected_customer_route_component_import:${relativePath}:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  return compiled.exports[exportName] as (props: Record<string, unknown>) => ReactNode;
}

async function compilePage(
  route: string,
  componentModule: string,
  componentExport: string,
  Component: (props: Record<string, unknown>) => ReactNode,
  role: Role,
) {
  const source = await readFile(new URL(`../../app${route}/page.tsx`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "@celebix/saas-contracts") return contracts;
    if (specifier === componentModule) return { [componentExport]: Component };
    if (specifier === "@/components/customers/CustomerWorkspace") return { CustomerWorkspace: ({ children }: { children?: ReactNode }) => createElement("section", null, children) };
    if (specifier === "@/lib/server-access") return { requireServerPanelAccess: async () => ({ tenantContext: tenant(role) }) };
    throw new Error(`unexpected_customer_route_page_import:${route}:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  return compiled.exports.default as (props?: Record<string, unknown>) => ReactNode | Promise<ReactNode>;
}

function request(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("cookie", `__Host-celebix_panel=${CREDENTIAL}`);
  if (init?.method === "POST") headers.set("origin", ORIGIN);
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
}

test("customer route matrix invokes actual list detail edit and new pages through real clients and handlers", async () => {
  let stored = customer();
  let failure: Failure = "none";
  let replayed = false;
  let role: Role = "store_owner";
  const paths: string[] = [];
  const repositoryCalls: string[] = [];
  const saveInputs: SaveCustomerInput[] = [];
  const mutation = (next: contracts.CustomerDetail, wasReplayed = false): contracts.CustomerMutationResult => ({
    id: next.id,
    version: next.version,
    status: next.status,
    updatedAt: next.updatedAt,
    replayed: wasReplayed,
  });
  const failMutation = () => {
    if (failure !== "none" && failure !== "unavailable") throw new CustomerRepositoryError(failure);
  };
  const repository: CustomerRepository = {
    async getSummary() {
      repositoryCalls.push("summary");
      return { active: stored.status === "active" ? 1 : 0, archived: stored.status === "archived" ? 1 : 0, consentedEmail: 1, totalSpentCents: stored.totalSpentCents, currency: "TRY", asOf: NOW };
    },
    async list() {
      repositoryCalls.push("list");
      return { items: [listItem(stored)] };
    },
    async get(input) {
      repositoryCalls.push(`get:${input.customerId}`);
      assert.equal(input.customerId, CUSTOMER_ID);
      return stored;
    },
    async getWorkspace() {
      repositoryCalls.push("workspace");
      return { neighbors: {}, orders: [] };
    },
    async save(input) {
      repositoryCalls.push(input.customerId ? "update" : "create");
      saveInputs.push(input);
      failMutation();
      stored = {
        ...stored,
        id: input.customerId ?? CUSTOMER_ID,
        status: "active",
        displayName: `${input.firstName} ${input.lastName}`,
        firstName: input.firstName,
        lastName: input.lastName,
        ...(input.email ? { email: input.email } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        addresses: input.addresses.map((address, index) => ({ ...address, id: address.id ?? ADDRESS_ID, version: stored.addresses[index]?.version ?? 1 })),
        consents: input.consents.map((consent) => ({ ...consent, recordedAt: NOW })),
        version: (input.expectedVersion ?? 0) + 1,
        updatedAt: NOW,
      };
      return mutation(stored, replayed);
    },
    async archive(input) {
      repositoryCalls.push("archive");
      failMutation();
      assert.equal(input.customerId, CUSTOMER_ID);
      assert.equal(input.expectedVersion, stored.version);
      stored = { ...stored, status: "archived", version: stored.version + 1, updatedAt: NOW };
      return mutation(stored);
    },
    async addNote(input) {
      repositoryCalls.push("note");
      failMutation();
      stored = { ...stored, notes: [...stored.notes, { id: NOTE_ID, text: input.text, createdAt: NOW }], version: stored.version + 1, updatedAt: NOW };
      return mutation(stored);
    },
    async listTags() { repositoryCalls.push("tags"); return [tag()]; },
    async upsertTag() { throw new Error("unexpected_route_upsert_tag"); },
    async setTags(input) {
      repositoryCalls.push("set-tags");
      failMutation();
      stored = { ...stored, tags: input.ids.includes(TAG_ID) ? [{ id: TAG_ID, name: "VIP", color: "#7c3aed" }] : [], version: stored.version + 1, updatedAt: NOW };
      return mutation(stored);
    },
    async listSegments() { repositoryCalls.push("segments"); return [segment()]; },
    async upsertSegment() { throw new Error("unexpected_route_upsert_segment"); },
    async setSegments(input) {
      repositoryCalls.push("set-segments");
      failMutation();
      stored = { ...stored, segments: input.ids.includes(SEGMENT_ID) ? [{ id: SEGMENT_ID, name: "Sadık müşteriler", kind: "manual" }] : [], version: stored.version + 1, updatedAt: NOW };
      return mutation(stored);
    },
    async export() {
      repositoryCalls.push("export");
      return { items: [listItem(stored)], exportedAt: NOW };
    },
  };
  const handlers = createCustomerHttpHandlers({
    async resolveRuntime() {
      if (failure === "unavailable") return null;
      return {
        customers: repository,
        access: {
          readiness: { mode: "approved_staging" },
          panelOrigin: ORIGIN,
          async resolveCredential() { return { kind: "authenticated", session: {}, tenantContext: tenant(role) }; },
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
    if (path === "/api/customers/summary") return handlers.summary(request(path, init));
    if (path === "/api/customers/export") return handlers.export(request(path, init));
    if (path === "/api/customers/tags") return handlers.tags(request(path, init));
    if (path === "/api/customers/segments") return handlers.segments(request(path, init));
    if (path.startsWith("/api/customers?")) return handlers.list(request(path, init));
    if (path === "/api/customers") return handlers.create(request(path, init));
    let match = /^\/api\/customers\/([^/]+)\/archive$/u.exec(path);
    if (match) return handlers.archive(request(path, init), match[1]!);
    match = /^\/api\/customers\/([^/]+)\/notes$/u.exec(path);
    if (match) return handlers.addNote(request(path, init), match[1]!);
    match = /^\/api\/customers\/([^/]+)\/tags$/u.exec(path);
    if (match) return handlers.setTags(request(path, init), match[1]!);
    match = /^\/api\/customers\/([^/]+)\/segments$/u.exec(path);
    if (match) return handlers.setSegments(request(path, init), match[1]!);
    match = /^\/api\/customers\/([^/]+)\/workspace$/u.exec(path);
    if (match) return handlers.workspace(request(path, init), match[1]!);
    match = /^\/api\/customers\/([^/]+)$/u.exec(path);
    if (match) return init?.method === "POST" ? handlers.update(request(path, init), match[1]!) : handlers.get(request(path, init), match[1]!);
    throw new Error(`unexpected_customer_route_path:${path}`);
  }) as typeof fetch;
  const api = createCustomerApi(fetcher, () => OPERATION_ID);
  const pushes: string[] = [];

  const originalFormData = globalThis.FormData;
  const originalDocument = globalThis.document;
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;
  const downloads: string[] = [];
  class TestFormData {
    constructor(private readonly target: { values: Readonly<Record<string, string>> }) {}
    get(name: string) { return this.target.values[name] ?? null; }
  }
  Object.defineProperty(globalThis, "FormData", { configurable: true, value: TestFormData });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement() {
        return {
          href: "",
          download: "",
          click() { downloads.push(this.download); },
        };
      },
    },
  });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:customer-export" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => {} });
  try {
    failure = "none";
    role = "store_owner";
    replayed = false;
    stored = customer();
    paths.length = 0;
    repositoryCalls.length = 0;
    const listHooks = createHookRuntime();
    const ListConsole = await compileComponent("../../components/customers/CustomerListConsole.tsx", "CustomerListConsole", listHooks.runtime, api, (path) => pushes.push(path));
    const ListPage = await compilePage("/customers", "@/components/customers/CustomerListConsole", "CustomerListConsole", ListConsole, role);
    const listTree = await ListPage();
    const listElement = findElement(listTree, (element) => element.type === ListConsole);
    assert.equal(listElement.props.canManage, true, "owner-list-server-manage-authority");
    const renderList = () => ListConsole(listElement.props);
    let listView = await listHooks.flush(renderList);
    assert.match(textOf(listView), /Ada Lovelace/u);
    assert.ok(paths.includes("/api/customers/summary"));
    assert.ok(paths.some((path) => path.startsWith("/api/customers?pageSize=25")));
    const hrefs: string[] = [];
    visitElements(listView, (element) => { if (typeof element.props.href === "string") hrefs.push(element.props.href); });
    assert.ok(hrefs.includes("/customers/new"), "list-create-destination");
    assert.ok(hrefs.includes(`/customers/${CUSTOMER_ID}`), "list-exact-detail-destination");
    const exportButton = findElement(listView, (element) => element.type === "button" && textOf(element).includes("CSV Dışa Aktar"));
    (exportButton.props.onClick as () => void)();
    for (let pass = 0; pass < 3; pass += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    listView = await listHooks.flush(renderList);
    assert.ok(paths.includes("/api/customers/export"));
    assert.deepEqual(downloads, ["musteriler-2026-07-22.csv"]);

    role = "analyst";
    paths.length = 0;
    const analystListHooks = createHookRuntime();
    const AnalystListConsole = await compileComponent("../../components/customers/CustomerListConsole.tsx", "CustomerListConsole", analystListHooks.runtime, api, (path) => pushes.push(path));
    const AnalystListPage = await compilePage("/customers", "@/components/customers/CustomerListConsole", "CustomerListConsole", AnalystListConsole, role);
    const analystListTree = await AnalystListPage();
    const analystListElement = findElement(analystListTree, (element) => element.type === AnalystListConsole);
    assert.equal(analystListElement.props.canManage, false, "analyst-list-server-manage-authority");
    const analystListView = await analystListHooks.flush(() => AnalystListConsole(analystListElement.props));
    const analystHrefs: string[] = [];
    visitElements(analystListView, (element) => { if (typeof element.props.href === "string") analystHrefs.push(element.props.href); });
    assert.equal(analystHrefs.includes("/customers/new"), false, "analyst-list-hides-create-destination");

    paths.length = 0;
    const analystNewHooks = createHookRuntime();
    const AnalystFormConsole = await compileComponent("../../components/customers/CustomerFormConsole.tsx", "CustomerFormConsole", analystNewHooks.runtime, api, (path) => pushes.push(path));
    const AnalystNewPage = await compilePage("/customers/new", "@/components/customers/CustomerFormConsole", "CustomerFormConsole", AnalystFormConsole, role);
    const analystNewTree = await AnalystNewPage();
    let analystFormMounted = false;
    visitElements(analystNewTree, (element) => { if (element.type === AnalystFormConsole) analystFormMounted = true; });
    assert.equal(analystFormMounted, false, "analyst-new-page-must-not-mount-mutation-component");
    assert.match(textOf(analystNewTree), /yetkiniz yok/u, "analyst-new-page-visible-denial");
    assert.equal(paths.length, 0, "analyst-new-page-makes-no-customer-api-call");

    for (const mode of ["success", "customer_conflict", "unavailable", "replayed"] as const) {
      failure = mode === "success" || mode === "replayed" ? "none" : mode;
      replayed = mode === "replayed";
      role = "store_owner";
      stored = customer();
      paths.length = 0;
      repositoryCalls.length = 0;
      saveInputs.length = 0;
      pushes.length = 0;
      const hooks = createHookRuntime();
      const FormConsole = await compileComponent("../../components/customers/CustomerFormConsole.tsx", "CustomerFormConsole", hooks.runtime, api, (path) => pushes.push(path));
      const NewPage = await compilePage("/customers/new", "@/components/customers/CustomerFormConsole", "CustomerFormConsole", FormConsole, role);
      const pageTree = await NewPage();
      const pageElement = findElement(pageTree, (element) => element.type === FormConsole);
      const render = () => FormConsole(pageElement.props);
      let view = await hooks.flush(render);
      const form = findElement(view, (element) => element.type === "form");
      await (form.props.onSubmit as (event: { preventDefault(): void; currentTarget: { values: Readonly<Record<string, string>> } }) => Promise<void>)({
        preventDefault() {},
        currentTarget: { values: { firstName: "Grace", lastName: "Hopper", email: "GRACE@EXAMPLE.COM", phone: "+905559998877", line1: "Kod Sokak 1", city: "İstanbul", postalCode: "34000", country: "tr", emailConsent: "on" } },
      });
      view = await hooks.flush(render);
      assert.ok(paths.includes("/api/customers"), `${mode}:create-handler`);
      if (mode === "success" || mode === "replayed") {
        assert.equal(saveInputs.length, 1, `${mode}:create-repository`);
        assert.equal(saveInputs[0]?.customerId, undefined, `${mode}:create-not-update`);
        assert.equal(saveInputs[0]?.email, "grace@example.com", `${mode}:canonical-email`);
        assert.equal(saveInputs[0]?.addresses[0]?.country, "TR", `${mode}:canonical-country`);
        assert.equal(stored.displayName, "Grace Hopper", `${mode}:durable-create`);
        assert.deepEqual(pushes, [`/customers/${CUSTOMER_ID}`], `${mode}:create-redirect`);
      } else {
        assert.deepEqual(pushes, [], `${mode}:no-redirect`);
        const expected = mode === "customer_conflict"
          ? /başka bir kayıtla çakışıyor/u
          : /şu anda kullanılamıyor/u;
        assert.match(textOf(view), expected, `${mode}:visible-create-error`);
      }
    }

    for (const mode of ["success", "version_conflict"] as const) {
      failure = mode === "success" ? "none" : "version_conflict";
      replayed = false;
      role = "store_owner";
      stored = customer();
      paths.length = 0;
      repositoryCalls.length = 0;
      saveInputs.length = 0;
      pushes.length = 0;
      const hooks = createHookRuntime();
      const EditConsole = await compileComponent("../../components/customers/CustomerEditConsole.tsx", "CustomerEditConsole", hooks.runtime, api, (path) => pushes.push(path));
      const EditPage = await compilePage("/customers/[customerId]/edit", "@/components/customers/CustomerEditConsole", "CustomerEditConsole", EditConsole, role);
      const pageTree = await EditPage({ params: Promise.resolve({ customerId: CUSTOMER_ID }) });
      const pageElement = findElement(pageTree, (element) => element.type === EditConsole);
      assert.equal(pageElement.props.customerId, CUSTOMER_ID);
      const render = () => EditConsole(pageElement.props);
      let view = await hooks.flush(render);
      assert.ok(paths.includes(`/api/customers/${CUSTOMER_ID}`), `${mode}:exact-edit-read-handler`);
      assert.ok(repositoryCalls.includes(`get:${CUSTOMER_ID}`), `${mode}:exact-edit-read-repository`);
      const form = findElement(view, (element) => element.type === "form");
      await (form.props.onSubmit as (event: { preventDefault(): void; currentTarget: { values: Readonly<Record<string, string>> } }) => Promise<void>)({
        preventDefault() {},
        currentTarget: { values: { firstName: "Ada", lastName: "Byron", email: "ada@example.com", phone: "+905551112233", emailConsent: "on" } },
      });
      view = await hooks.flush(render);
      assert.equal(saveInputs[0]?.customerId, CUSTOMER_ID, `${mode}:versioned-update-repository`);
      assert.equal(saveInputs[0]?.expectedVersion, 7, `${mode}:exact-update-version`);
      if (mode === "success") {
        assert.deepEqual(pushes, [`/customers/${CUSTOMER_ID}`]);
      } else {
        assert.match(textOf(view), /sizden önce güncellendi/u);
        assert.deepEqual(pushes, []);
      }
    }

    failure = "none";
    replayed = false;
    role = "store_owner";
    stored = customer();
    paths.length = 0;
    repositoryCalls.length = 0;
    saveInputs.length = 0;
    const detailHooks = createHookRuntime();
    const DetailConsole = await compileComponent("../../components/customers/CustomerDetailConsole.tsx", "CustomerDetailConsole", detailHooks.runtime, api, (path) => pushes.push(path));
    const DetailPage = await compilePage("/customers/[customerId]", "@/components/customers/CustomerDetailConsole", "CustomerDetailConsole", DetailConsole, role);
    const detailTree = await DetailPage({ params: Promise.resolve({ customerId: CUSTOMER_ID }) });
    const detailElement = findElement(detailTree, (element) => element.type === DetailConsole);
    assert.deepEqual(
      { customerId: detailElement.props.customerId, canManage: detailElement.props.canManage, canArchive: detailElement.props.canArchive },
      { customerId: CUSTOMER_ID, canManage: true, canArchive: true },
    );
    const renderDetail = () => {
      const view = DetailConsole(detailElement.props);
      if (React.isValidElement<Record<string, unknown>>(view) && typeof view.type === "function" && view.type.name === "CustomerDetailPresentation") {
        return (view.type as (props: Record<string, unknown>) => ReactNode)(view.props);
      }
      return view;
    };
    let detailView = await detailHooks.flush(renderDetail);
    assert.ok(repositoryCalls.includes(`get:${CUSTOMER_ID}`), "detail-exact-read");
    assert.ok(repositoryCalls.includes("workspace"), "detail-workspace-read");
    assert.match(textOf(detailView), /Müşteri bilgilerini düzenle/u);
    findElement(detailView, (element) => element.props.href === `/customers/${CUSTOMER_ID}/edit`);
    assert.equal(repositoryCalls.includes("update"), false, "detail-does-not-own-profile-update");

    const noteForm = findElement(detailView, (element) => element.type === "form" && textOf(element).includes("Yeni dahili not"));
    await (noteForm.props.onSubmit as (event: { preventDefault(): void; currentTarget: { values: Readonly<Record<string, string>>; reset(): void } }) => Promise<void>)({
      preventDefault() {},
      currentTarget: { values: { text: "Kalıcı müşteri notu" }, reset() {} },
    });
    detailView = await detailHooks.flush(renderDetail);
    assert.ok(repositoryCalls.includes("note"), "detail-note");
    assert.equal(stored.notes[0]?.text, "Kalıcı müşteri notu");

    let taxonomyInputs: React.ReactElement<Record<string, unknown>>[] = [];
    visitElements(detailView, (element) => {
      if (element.type === "input" && typeof element.props.checked === "boolean" && element.props.name === undefined) taxonomyInputs.push(element);
    });
    assert.equal(taxonomyInputs.length, 2);
    (taxonomyInputs[0]!.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    for (let pass = 0; pass < 3; pass += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    detailView = await detailHooks.flush(renderDetail);
    assert.ok(repositoryCalls.includes("set-tags"), "detail-set-tags");

    taxonomyInputs = [];
    visitElements(detailView, (element) => {
      if (element.type === "input" && typeof element.props.checked === "boolean" && element.props.name === undefined) taxonomyInputs.push(element);
    });
    (taxonomyInputs[1]!.props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
    for (let pass = 0; pass < 3; pass += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    detailView = await detailHooks.flush(renderDetail);
    assert.ok(repositoryCalls.includes("set-segments"), "detail-set-segments");

    const archiveButton = findElement(detailView, (element) => element.type === "button" && textOf(element).includes("Arşivlemeyi onayla"));
    (archiveButton.props.onClick as () => void)();
    for (let pass = 0; pass < 3; pass += 1) await new Promise<void>((resolve) => setImmediate(resolve));
    detailView = await detailHooks.flush(renderDetail);
    assert.ok(repositoryCalls.includes("archive"), "detail-archive");
    assert.equal(stored.status, "archived");
    assert.match(textOf(detailView), /Müşteri arşivlendi/u);
  } finally {
    Object.defineProperty(globalThis, "FormData", { configurable: true, value: originalFormData });
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectUrl });
  }
});
