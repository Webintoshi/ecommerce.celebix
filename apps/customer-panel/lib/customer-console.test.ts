import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

const ROOT = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");
const CUSTOMER_A = "81000000-0000-4000-8000-000000000001";
const CUSTOMER_B = "81000000-0000-4000-8000-000000000002";
const NOW = "2026-07-22T15:00:00.000Z";
const ORDER_ID = "71000000-0000-4000-8000-000000000001";

function customer(id: string, version: number, firstName: string) {
  return Object.freeze({
    id, status: "active", displayName: `${firstName} Lovelace`, firstName, lastName: "Lovelace",
    email: `${firstName.toLowerCase()}@example.com`, phone: undefined, orderCount: 0, totalSpentCents: 0,
    currency: "TRY", tags: [], segments: [], addresses: [], consents: [], version, createdAt: NOW, updatedAt: NOW,
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
      const set = (next: T | ((current: T) => T)) => { slots[index] = typeof next === "function" ? (next as (current: T) => T)(slots[index] as T) : next; dirty = true; };
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
      for (let pass = 0; pass < 20; pass += 1) {
        if (dirty || latest === undefined) { dirty = false; cursor = 0; latest = component(); }
        await new Promise<void>((resolve) => setImmediate(resolve));
        if (!dirty) return latest;
      }
      throw new Error("customer_console_hook_flush_exhausted");
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

async function compileCustomerEditor(overrides: Readonly<{ react: typeof React; customerApi: Record<string, unknown>; push: (path: string) => void }>) {
  const output = ts.transpileModule(await source("components/customers/CustomerEditConsole.tsx"), {
    compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const styles = new Proxy({}, { get: (_target, property) => property === "__esModule" ? true : property === "default" ? styles : String(property) });
  class CompiledCustomerApiError extends Error { constructor(readonly code: string) { super(code); } }
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return overrides.react;
    if (specifier === "next/link") return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => createElement("a", props, children);
    if (specifier === "next/navigation") return { useRouter: () => ({ push: overrides.push }) };
    if (specifier === "@/components/panel/PanelPageShell") return {
      PanelPageShell: ({ children }: { children?: ReactNode }) => createElement("section", null, children),
      PanelPageHeader: ({ title, description }: { title: string; description: string }) => createElement("header", null, createElement("h1", null, title), createElement("p", null, description)),
    };
    if (specifier === "@/lib/customer-ui/client") return { CustomerApiError: CompiledCustomerApiError, customerApi: Object.freeze(overrides.customerApi) };
    if (specifier === "./customer-console.module.css") return styles;
    if (specifier === "@celebix/saas-contracts") return {};
    throw new Error(`unexpected_customer_editor_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  return { Editor: compiled.exports.CustomerEditConsole as (props: { customerId: string }) => ReactNode, CustomerApiError: CompiledCustomerApiError };
}

async function compileCustomerDetailPresentation() {
  const output = ts.transpileModule(await source("components/customers/CustomerDetailConsole.tsx"), {
    compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const styles = new Proxy({}, { get: (_target, property) => property === "__esModule" ? true : property === "default" ? styles : String(property) });
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return React;
    if (specifier === "next/link") return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => createElement("a", props, children);
    if (specifier === "@/components/panel/PanelPageShell") return {
      PanelPageShell: ({ children }: { children?: ReactNode }) => createElement("section", null, children),
      PanelStatusBadge: ({ children }: { children?: ReactNode }) => createElement("span", null, children),
    };
    if (specifier === "@/lib/customer-ui/client") return { CustomerApiError: class extends Error {}, customerApi: {} };
    if (specifier === "./customer-console.module.css") return styles;
    if (specifier === "@celebix/saas-contracts") return {};
    throw new Error(`unexpected_customer_detail_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  return compiled.exports.CustomerDetailPresentation as (props: Record<string, unknown>) => ReactNode;
}

function firstElement(node: ReactNode, type: string) {
  let result: React.ReactElement<Record<string, unknown>> | undefined;
  visitElements(node, (element) => { if (element.type === type && result === undefined) result = element; });
  assert.ok(result, `expected_${type}_element`);
  return result;
}

test("customer pages stay behind durable server panel access and role capabilities", async () => {
  const layout = await source("app/customers/layout.tsx");
  const detail = await source("app/customers/[customerId]/page.tsx");
  const segments = await source("app/customers/segments/page.tsx");
  const tags = await source("app/customers/tags/page.tsx");
  assert.match(layout, /requireServerPanelAccess\(\)/);
  assert.match(layout, /tenantContext/);
  assert.match(detail, /customers[.]manage/);
  assert.match(detail, /customers[.]archive/);
  assert.match(segments, /customers[.]manage/);
  assert.match(tags, /customers[.]manage/);
});

test("customer browser UI uses only same-origin DTO APIs and no browser authority", async () => {
  const files = [
    "lib/customer-ui/client.ts",
    "components/customers/CustomerListConsole.tsx",
    "components/customers/CustomerFormConsole.tsx",
    "components/customers/CustomerDetailConsole.tsx",
    "components/customers/CustomerTaxonomyConsole.tsx",
  ];
  const combined = (await Promise.all(files.map(source))).join("\n");
  assert.match(combined, /credentials:\s*["']same-origin["']/);
  assert.match(combined, /crypto[.]randomUUID/);
  assert.doesNotMatch(
    combined,
    /document[.]cookie|localStorage|sessionStorage|x-forwarded|\btenantId\b|\bstoreId\b|membershipId|planId/i,
  );
  assert.doesNotMatch(
    combined,
    /postgres|repository|database|supabase|\/api\/admin/i,
  );
});

test("customer console exposes truthful loaded empty error export and responsive states", async () => {
  const list = await source("components/customers/CustomerListConsole.tsx");
  const detail = await source("components/customers/CustomerDetailConsole.tsx");
  const taxonomy = await source(
    "components/customers/CustomerTaxonomyConsole.tsx",
  );
  const styles = await source(
    "components/customers/customer-console.module.css",
  );
  assert.match(list, /Henüz müşteri yok/);
  assert.match(list, /Müşteriler yükleniyor/);
  assert.match(list, /CSV Dışa Aktar/);
  assert.match(detail, /Dahili notlar/);
  assert.match(detail, /Müşteriyi Arşivle/);
  assert.match(detail, /customerApi[.]workspace\(customerId/);
  assert.match(detail, /Sipariş geçmişi/);
  assert.doesNotMatch(detail, /customerApi[.]update\(customerId/);
  assert.match(taxonomy, /müşteri/);
  assert.match(styles, /@media\s*\(max-width:\s*1024px\)/);
  assert.match(styles, /min-height:\s*48px/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /position:\s*sticky/);
  assert.match(styles, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(18rem,\s*22rem\)/);
});

test("customer detail presentation exposes linked orders navigation and truthful operations", async () => {
  const Presentation = await compileCustomerDetailPresentation();
  const detail = {
    ...customer(CUSTOMER_A, 7, "Ada"),
    orderCount: 61,
    totalSpentCents: 3250260,
    notes: [],
    addresses: [{ id: "82000000-0000-4000-8000-000000000001", label: "Ev", recipientName: "Ada Lovelace", line1: "Test Sokak 1", city: "İstanbul", country: "TR", isDefault: true, version: 1 }],
    consents: [{ channel: "email", status: "granted", recordedAt: NOW }],
  };
  const markup = renderToStaticMarkup(createElement(Presentation, {
    data: detail,
    workspace: {
      neighbors: { next: { id: CUSTOMER_B, displayName: "Grace Lovelace" } },
      orders: [{ id: ORDER_ID, orderNumber: "CX-1042", status: "delivered", paymentStatus: "completed", totalCents: 3250260, currency: "TRY", createdAt: NOW }],
    },
    tags: [], segments: [], canManage: true, canArchive: true, busy: false, notice: "", error: "",
    onAddNote() {}, onAssign() {}, onArchive() {},
  }));
  assert.match(markup, /aria-label="Müşteri özeti ve işlemleri"/);
  assert.match(markup, new RegExp(`/orders/${ORDER_ID}`));
  assert.match(markup, new RegExp(`/customers/${CUSTOMER_B}`));
  assert.match(markup, /Son 50 sipariş/);
  assert.match(markup, /İzin tarihi/);
  assert.match(markup, /Müşteriyi Arşivle/);
  assert.doesNotMatch(markup, /storeId|tenantId|customer_email/);
});

test("customer edit route sends the loaded version and leaves stale conflicts visible", async () => {
  const editor = await source("components/customers/CustomerEditConsole.tsx");
  const detail = await source("components/customers/CustomerDetailConsole.tsx");
  const page = await source("app/customers/[customerId]/edit/page.tsx");
  assert.match(editor, /export function CustomerEditConsole/);
  assert.match(editor, /customerApi[.]get\(customerId\)/);
  assert.match(editor, /customerApi[.]update\(customerId/);
  assert.match(editor, /expectedVersion:\s*customer[.]version/);
  assert.match(editor, /version_conflict/);
  assert.match(editor, /sizden önce güncellendi/i);
  assert.match(editor, /router[.]push\(`\/customers\/\$\{result[.]id\}`\)/);
  assert.match(editor, /Adres defteri/);
  assert.match(editor, /Adres ekle/);
  assert.match(editor, /setAddresses/);
  assert.match(detail, /href=\{`\/customers\/\$\{encodeURIComponent\(data[.]id\)\}\/edit`\}/);
  assert.match(page, /requireServerPanelAccess\(\)/);
  assert.match(page, /customers[.]manage/);
  assert.match(page, /<CustomerEditConsole customerId=\{customerId\} \/>/);
  assert.doesNotMatch(editor, /tenantId|storeId|principalId|membershipId|planId|document[.]cookie|localStorage|sessionStorage/i);
});

test("customer editor clears a prior route snapshot and submits only the current loaded version", async () => {
  const hookRuntime = createHookRuntime();
  const updates: unknown[] = [];
  const pushes: string[] = [];
  let resolveCustomerB: ((value: ReturnType<typeof customer>) => void) | undefined;
  const { Editor, CustomerApiError } = await compileCustomerEditor({
    react: hookRuntime.runtime,
    push: (path) => { pushes.push(path); },
    customerApi: {
      async get(id: string) {
        if (id === CUSTOMER_A) return customer(CUSTOMER_A, 7, "Ada");
        return new Promise<ReturnType<typeof customer>>((resolve) => { resolveCustomerB = resolve; });
      },
      async update(_id: string, input: unknown) {
        updates.push(input);
        throw new CustomerApiError("version_conflict");
      },
    },
  });
  let selectedCustomerId = CUSTOMER_A;
  const Console = () => Editor({ customerId: selectedCustomerId });
  let view = await hookRuntime.flush(Console);
  assert.equal(firstElement(view, "form").props.children !== undefined, true);

  selectedCustomerId = CUSTOMER_B;
  view = await hookRuntime.flush(Console, true);
  let staleFormFound = false;
  visitElements(view, (element) => { if (element.type === "form") staleFormFound = true; });
  assert.equal(staleFormFound, false, "a prior customer snapshot must not remain editable during a route change");
  assert.equal(updates.length, 0);

  resolveCustomerB?.(customer(CUSTOMER_B, 11, "Grace"));
  view = await hookRuntime.flush(Console);
  const form = firstElement(view, "form");
  const originalFormData = globalThis.FormData;
  class TestFormData {
    constructor(private readonly values: Record<string, string>) {}
    get(name: string) { return this.values[name] ?? null; }
  }
  Object.defineProperty(globalThis, "FormData", { configurable: true, value: TestFormData });
  try {
    await (form.props.onSubmit as (event: { preventDefault(): void; currentTarget: Record<string, string> }) => Promise<void>)({
      preventDefault() {},
      currentTarget: { firstName: "Grace", lastName: "Lovelace", email: "grace@example.com", phone: "", emailConsent: "on" },
    });
  } finally {
    Object.defineProperty(globalThis, "FormData", { configurable: true, value: originalFormData });
  }
  assert.equal((updates[0] as { expectedVersion: number }).expectedVersion, 11);
  assert.deepEqual(pushes, []);
  view = await hookRuntime.flush(Console);
  let alertText = "";
  visitElements(view, (element) => {
    if (element.props.role === "alert") alertText += String(element.props.children);
  });
  assert.match(alertText, /sizden önce güncellendi/i);
});

test("customer editor ignores a late prior-route read after the next customer has loaded", async () => {
  const hookRuntime = createHookRuntime();
  let resolveCustomerA: ((value: ReturnType<typeof customer>) => void) | undefined;
  const { Editor } = await compileCustomerEditor({
    react: hookRuntime.runtime,
    push() {},
    customerApi: {
      async get(id: string) {
        if (id === CUSTOMER_A) return new Promise<ReturnType<typeof customer>>((resolve) => { resolveCustomerA = resolve; });
        return customer(CUSTOMER_B, 11, "Grace");
      },
      async update() { throw new Error("unexpected_update"); },
    },
  });
  let selectedCustomerId = CUSTOMER_A;
  const Console = () => Editor({ customerId: selectedCustomerId });
  await hookRuntime.flush(Console);

  selectedCustomerId = CUSTOMER_B;
  let view = await hookRuntime.flush(Console, true);
  assert.equal(firstElement(view, "form").props.children !== undefined, true);
  resolveCustomerA?.(customer(CUSTOMER_A, 7, "Ada"));
  view = await hookRuntime.flush(Console);
  let firstName = "";
  visitElements(view, (element) => {
    if (element.type === "input" && element.props.name === "firstName") firstName = String(element.props.defaultValue);
  });
  assert.equal(firstName, "Grace");
});

test("customer route files expose only the reviewed methods", async () => {
  const routes = [
    ["app/api/customers/summary/route.ts", { GET: "handleCustomerSummary" }],
    [
      "app/api/customers/route.ts",
      { GET: "handleCustomerList", POST: "handleCustomerCreate" },
    ],
    [
      "app/api/customers/[customerId]/route.ts",
      { GET: "handleCustomerGet", POST: "handleCustomerUpdate" },
    ],
    [
      "app/api/customers/[customerId]/archive/route.ts",
      { POST: "handleCustomerArchive" },
    ],
    [
      "app/api/customers/[customerId]/workspace/route.ts",
      { GET: "handleCustomerWorkspace" },
    ],
    [
      "app/api/customers/[customerId]/notes/route.ts",
      { POST: "handleCustomerNote" },
    ],
    [
      "app/api/customers/[customerId]/tags/route.ts",
      { POST: "handleCustomerSetTags" },
    ],
    [
      "app/api/customers/[customerId]/segments/route.ts",
      { POST: "handleCustomerSetSegments" },
    ],
    [
      "app/api/customers/tags/route.ts",
      { GET: "handleCustomerTags", POST: "handleCustomerTagSave" },
    ],
    [
      "app/api/customers/segments/route.ts",
      { GET: "handleCustomerSegments", POST: "handleCustomerSegmentSave" },
    ],
    ["app/api/customers/export/route.ts", { GET: "handleCustomerExport" }],
  ] as const;
  for (const [path, allowed] of routes) {
    const text = await source(path);
    for (const [method, handler] of Object.entries(allowed))
      assert.match(
        text,
        new RegExp(`export const ${method}\\s*=\\s*${handler}`),
      );
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"].filter(
      (candidate) => !Object.hasOwn(allowed, candidate),
    )) {
      assert.doesNotMatch(text, new RegExp(`export const ${method} =`));
    }
  }
});
