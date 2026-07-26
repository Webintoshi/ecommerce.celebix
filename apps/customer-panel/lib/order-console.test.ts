import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

import type { OrderDetail, OrderListItem } from "@celebix/saas-contracts";

const ROOT = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");
const ORDER_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";
const NOTE_ID = "44444444-4444-4444-8444-444444444444";
const OPERATION_ID = "55555555-5555-4555-8555-555555555555";
const NOW = "2026-07-21T09:30:00.000Z";

const item = Object.freeze({
  id: ORDER_ID,
  orderNumber: "HMK-1042",
  source: "storefront" as const,
  customerName: "Ada Lovelace",
  customerEmail: "ada@example.com",
  currency: "TRY",
  totalCents: 14_990,
  status: "confirmed" as const,
  paymentStatus: "completed" as const,
  itemCount: 1,
  createdAt: NOW,
  updatedAt: NOW,
  version: 4,
}) satisfies OrderListItem;

const detail = Object.freeze({
  ...item,
  customerPhone: "+905551112233",
  subtotalCents: 13_990,
  shippingCents: 1_000,
  discountCents: 0,
  shippingAddress: Object.freeze({
    recipientName: "Ada Lovelace",
    line1: "Örnek Sokak 1",
    line2: "Daire 4",
    district: "Kadıköy",
    city: "İstanbul",
    postalCode: "34710",
    country: "TR",
  }),
  tracking: Object.freeze({
    carrier: "Yurtiçi Kargo",
    trackingNumber: "YK123",
    trackingUrl: "https://track.example/YK123",
    shippedAt: NOW,
  }),
  items: Object.freeze([Object.freeze({
    id: ITEM_ID,
    position: 0,
    productName: "Keten Gömlek",
    variantName: "Kiremit / M",
    sku: "KG-M",
    unitPriceCents: 13_990,
    quantity: 1,
    discountCents: 0,
    lineTotalCents: 13_990,
  })]),
  events: Object.freeze([Object.freeze({
    id: EVENT_ID,
    type: "status_changed",
    message: "Sipariş onaylandı",
    createdAt: NOW,
  })]),
  notes: Object.freeze([Object.freeze({
    id: NOTE_ID,
    body: "Hediye paketiyle gönderin.",
    createdAt: NOW,
    updatedAt: NOW,
  })]),
}) satisfies OrderDetail;

function json(value: unknown, init: ResponseInit = {}) {
  return Response.json(value, { status: 200, ...init });
}

function visitElements(node: ReactNode, visitor: (element: React.ReactElement<Record<string, unknown>>) => void) {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return;
    visitor(child);
    visitElements(child.props.children as ReactNode, visitor);
  });
}

async function compileOrderModule(
  path: "components/orders/OrderListConsole.tsx" | "components/orders/OrderDetailConsole.tsx",
  overrides: Readonly<{ react?: typeof React; orderApi?: Record<string, unknown> }> = {},
) {
  const output = ts.transpileModule(await source(path), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const Link = ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) =>
    createElement("a", props, children);
  const Icon = (props: Record<string, unknown>) => createElement("svg", props);
  const shell = {
    PanelActionButton: ({ children, href }: { children?: ReactNode; href: string }) => createElement("a", { href }, children),
    PanelBadge: ({ children }: { children?: ReactNode }) => createElement("span", null, children),
    PanelDataTable: ({ children, label }: { children?: ReactNode; label: string }) => createElement("table", { "aria-label": label }, children),
    PanelEmptyState: ({ description, title }: { description: string; title: string }) => createElement("div", null, createElement("h2", null, title), createElement("p", null, description)),
    PanelLoadingState: ({ label }: { label: string }) => createElement("p", { role: "status" }, label),
    PanelPageHeader: ({ actions, description, title }: { actions?: ReactNode; description?: string; title: string }) => createElement("header", null, createElement("h1", null, title), description ? createElement("p", null, description) : null, actions),
    PanelPageShell: ({ children }: { children?: ReactNode }) => createElement("section", null, children),
    PanelPanel: ({ children, title }: { children?: ReactNode; title?: string }) => createElement("section", null, title ? createElement("h2", null, title) : null, children),
    PanelStatusBadge: ({ children }: { children?: ReactNode }) => createElement("span", null, children),
    PanelToolbar: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  };
  const styles = new Proxy({}, {
    get: (_target, property) => property === "__esModule" ? true : property === "default" ? styles : String(property),
  });
  class CompiledOrderApiError extends Error {
    constructor(readonly code: string) { super(code); }
  }
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return overrides.react ?? React;
    if (specifier === "next/link") return Link;
    if (specifier === "lucide-react") return new Proxy({}, { get: () => Icon });
    if (specifier === "@/components/panel/PanelPageShell") return shell;
    if (specifier === "@/lib/order-ui/client") return {
      OrderApiError: CompiledOrderApiError,
      orderApi: Object.freeze(overrides.orderApi ?? {}),
    };
    if (specifier === "@celebix/saas-contracts") return {
      ORDER_PAYMENT_STATUSES: ["pending", "processing", "completed", "failed", "refunded"],
      ORDER_STATUSES: ["pending", "confirmed", "preparing", "shipped", "delivered", "cancelled", "refunded"],
    };
    if (specifier === "./order-console.module.css") return styles;
    throw new Error(`unexpected_order_console_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  return { exports: compiled.exports, OrderApiError: CompiledOrderApiError };
}

async function compilePresentation(
  path: "components/orders/OrderListConsole.tsx" | "components/orders/OrderDetailConsole.tsx",
  exportName: "OrderListPresentation" | "OrderDetailPresentation",
): Promise<ComponentType<Record<string, unknown>>> {
  const compiled = await compileOrderModule(path);
  assert.equal(typeof compiled.exports[exportName], "function");
  return compiled.exports[exportName] as ComponentType<Record<string, unknown>>;
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
      for (let pass = 0; pass < 20; pass += 1) {
        if (dirty || latest === undefined) {
          dirty = false;
          cursor = 0;
          latest = component();
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
        if (!dirty) return latest;
      }
      throw new Error("order_console_hook_flush_exhausted");
    },
  };
}

async function compileDashboardPresentation(dashboardModel: Record<string, unknown>) {
  const output = ts.transpileModule(await source("components/dashboard/PanelDashboardHomeView.tsx"), {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const Wrapper = ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => createElement("div", props, children);
  const Chart = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  const shell = {
    PanelActionButton: ({ children, href }: { children?: ReactNode; href: string }) => createElement("a", { href }, children),
    PanelMetricCard: ({ label, value, detail }: { label: string; value: string; detail: string }) => createElement("article", null, label, value, detail),
    PanelPageHeader: ({ actions, description, title }: { actions?: ReactNode; description: string; title: string }) => createElement("header", null, createElement("h1", null, title), createElement("p", null, description), actions),
    PanelPageShell: Wrapper,
    PanelPanel: ({ children, title }: { children?: ReactNode; title: string }) => createElement("section", null, createElement("h2", null, title), children),
  };
  const styles = new Proxy({}, { get: (_target, property) => property === "__esModule" ? true : property === "default" ? styles : String(property) });
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return React;
    if (specifier === "recharts") return new Proxy({}, { get: () => Chart });
    if (specifier === "@/components/panel/PanelPageShell") return shell;
    if (specifier === "@/components/panel/PanelLayoutClient") return { usePanelChromeModel() { return {}; } };
    if (specifier === "@/lib/catalog-ui/client") return { catalogApi: Object.freeze({}) };
    if (specifier === "@/lib/order-ui/client") return { orderApi: Object.freeze({}) };
    if (specifier === "@/lib/abandoned-cart-ui/client") return { abandonedCartApi: Object.freeze({}) };
    if (specifier === "@/lib/customer-ui/client") return { customerApi: Object.freeze({}) };
    if (specifier === "@/lib/analytics-ui/client") return { createAnalyticsBrowserApi: () => Object.freeze({}) };
    if (specifier === "@/lib/panel-ui/dashboard-model") return dashboardModel;
    if (specifier === "./panel-dashboard.module.css") return styles;
    throw new Error(`unexpected_dashboard_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  assert.equal(typeof compiled.exports.PanelDashboardPresentation, "function");
  return compiled.exports.PanelDashboardPresentation as ComponentType<Record<string, unknown>>;
}

function renderProps(state: "loading" | "loaded" | "error", items: readonly OrderListItem[] = [item]) {
  return {
    state,
    items,
    error: state === "error" ? "Siparişler yüklenemedi." : "",
    search: "",
    status: "all",
    sort: "newest",
    nextCursor: undefined,
    loadingMore: false,
    onRetry() {},
    onSearchChange() {},
    onStatusChange() {},
    onSortChange() {},
    onLoadMore() {},
  };
}

test("order client performs strict frozen same-origin summary, list, and detail reads", async () => {
  const { createOrderApiClient } = await import("./order-ui/client.ts");
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  const bodies = [
    { totalOrders: 9, pendingOrders: 2, fulfilledOrders: 5, revenueCents: 48_500, currency: "TRY", asOf: NOW },
    { items: [item], nextCursor: "eyJ2IjoxfQ" },
    { items: [], nextCursor: undefined },
    { items: [] },
    detail,
  ];
  const api = createOrderApiClient({ fetch: async (input, init) => { calls.push([input, init]); return json(bodies.shift()); } });
  const summary = await api.getDashboardSummary();
  const list = await api.listOrders({ pageSize: 20, status: "confirmed", search: "Ada Lovelace", sort: "highest" });
  const next = await api.listOrders({ pageSize: 20, cursor: list.nextCursor, status: "confirmed", search: "Ada Lovelace", sort: "highest" });
  await api.listOrders();
  const loaded = await api.getOrder(ORDER_ID);
  assert.deepEqual(calls.map(([path]) => path), [
    "/api/orders/summary",
    "/api/orders?pageSize=20&status=confirmed&search=Ada+Lovelace&sort=highest",
    "/api/orders?pageSize=20&cursor=eyJ2IjoxfQ&status=confirmed&search=Ada+Lovelace&sort=highest",
    "/api/orders?pageSize=20&sort=newest",
    `/api/orders/${ORDER_ID}`,
  ]);
  assert.equal(calls.every(([, init]) => init?.credentials === "same-origin" && init.method === "GET"), true);
  assert.equal(Object.isFrozen(summary), true);
  assert.equal(Object.isFrozen(list), true);
  assert.equal(Object.isFrozen(list.items), true);
  assert.equal(next.items.length, 0);
  assert.equal("nextCursor" in next, false);
  assert.equal(Object.isFrozen(loaded.items[0]), true);
});

test("order client mutations use exact relative paths, JSON, idempotency, and safe frozen results", async () => {
  const { createOrderApiClient } = await import("./order-ui/client.ts");
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  const mutation = { id: ORDER_ID, status: "shipped", paymentStatus: "completed", version: 5, updatedAt: NOW, replayed: false };
  const api = createOrderApiClient({
    fetch: async (input, init) => { calls.push([input, init]); return json(mutation); },
    randomUUID: () => OPERATION_ID,
  });
  const results = await Promise.all([
    api.transitionStatus(ORDER_ID, { expectedVersion: 4, nextStatus: "shipped" }),
    api.transitionPayment(ORDER_ID, { expectedVersion: 4, nextPaymentStatus: "completed" }),
    api.updateShipping(ORDER_ID, { expectedVersion: 4, shippingAddress: detail.shippingAddress, tracking: detail.tracking }),
    api.addNote(ORDER_ID, "Hazırlandı."),
    api.archiveNote(ORDER_ID, NOTE_ID),
  ]);
  assert.deepEqual(calls.map(([path]) => path), [
    `/api/orders/${ORDER_ID}/status`,
    `/api/orders/${ORDER_ID}/payment`,
    `/api/orders/${ORDER_ID}/shipping`,
    `/api/orders/${ORDER_ID}/notes`,
    `/api/orders/${ORDER_ID}/notes/${NOTE_ID}/archive`,
  ]);
  assert.equal(calls.every(([, init]) => init?.credentials === "same-origin"), true);
  assert.equal(calls.every(([, init]) => new Headers(init?.headers).get("idempotency-key") === OPERATION_ID), true);
  assert.equal(calls.every(([, init]) => new Headers(init?.headers).get("content-type") === "application/json"), true);
  assert.deepEqual(JSON.parse(String(calls[2]?.[1]?.body)), {
    expectedVersion: 4,
    shippingAddress: {
      recipientName: "Ada Lovelace",
      line1: "Örnek Sokak 1",
      line2: "Daire 4",
      district: "Kadıköy",
      city: "İstanbul",
      postalCode: "34710",
      country: "TR",
    },
    tracking: {
      carrier: "Yurtiçi Kargo",
      trackingNumber: "YK123",
      trackingUrl: "https://track.example/YK123",
      shippedAt: NOW,
    },
  });
  assert.equal(results.every(Object.isFrozen), true);
});

test("order client fails closed on unsafe payloads and contains no browser authority channel", async () => {
  const { OrderApiError, createOrderApiClient } = await import("./order-ui/client.ts");
  const api = createOrderApiClient({ fetch: async () => json({ ...item, storeId: ORDER_ID }) });
  await assert.rejects(() => api.getOrder(ORDER_ID), (error: unknown) => error instanceof OrderApiError && error.code === "unavailable");
  let fetches = 0;
  const guarded = createOrderApiClient({
    fetch: async () => { fetches += 1; return json({}); },
    randomUUID: () => OPERATION_ID,
  });
  const unsafeAddress = { ...detail.shippingAddress, privateAuthority: ORDER_ID };
  const unsafeTracking = { ...detail.tracking, trackingUrl: "javascript:alert(1)" };
  const unsafeTimestamp = { ...detail.tracking, shippedAt: "2026-07-21" };
  const getterAddress = Object.defineProperty({ ...detail.shippingAddress }, "line1", {
    enumerable: true,
    get() { throw new Error("hostile getter escaped"); },
  });
  const proxyAddress = new Proxy({ ...detail.shippingAddress }, {
    ownKeys() { throw new Error("hostile proxy escaped"); },
  });
  const badInputs: unknown[] = [
    { expectedVersion: 4, shippingAddress: unsafeAddress, tracking: detail.tracking },
    { expectedVersion: 4, shippingAddress: detail.shippingAddress, tracking: unsafeTracking },
    { expectedVersion: 4, shippingAddress: detail.shippingAddress, tracking: unsafeTimestamp },
    { expectedVersion: 4, shippingAddress: getterAddress, tracking: detail.tracking },
    { expectedVersion: 4, shippingAddress: proxyAddress, tracking: detail.tracking },
    { expectedVersion: 4, shippingAddress: { ...detail.shippingAddress, city: "İs\u0000tanbul" }, tracking: detail.tracking },
  ];
  for (const input of badInputs) {
    await assert.rejects(async () => guarded.updateShipping(ORDER_ID, input as never), {
      name: "TypeError",
      message: "order_client_invalid",
    });
  }
  const listGetter = Object.defineProperty({}, "search", { enumerable: true, get() { throw new Error("list getter escaped"); } });
  await assert.rejects(async () => guarded.listOrders(listGetter), { name: "TypeError", message: "order_client_invalid" });
  await assert.rejects(async () => guarded.listOrders({ sort: "unknown" } as never), { name: "TypeError", message: "order_client_invalid" });
  await assert.rejects(async () => guarded.transitionStatus(ORDER_ID, { expectedVersion: 4, nextStatus: "confirmed", privateAuthority: ORDER_ID } as never), { name: "TypeError", message: "order_client_invalid" });
  const paymentGetter = Object.defineProperty({ expectedVersion: 4 }, "nextPaymentStatus", { enumerable: true, get() { throw new Error("payment getter escaped"); } });
  await assert.rejects(async () => guarded.transitionPayment(ORDER_ID, paymentGetter as never), { name: "TypeError", message: "order_client_invalid" });
  await assert.rejects(async () => guarded.getOrder(new Proxy({}, {}) as never), { name: "TypeError", message: "order_client_invalid" });
  await assert.rejects(async () => guarded.addNote(ORDER_ID, new Proxy({}, {}) as never), { name: "TypeError", message: "order_client_invalid" });
  await assert.rejects(async () => guarded.archiveNote(ORDER_ID, new Proxy({}, {}) as never), { name: "TypeError", message: "order_client_invalid" });
  assert.equal(fetches, 0);
  assert.throws(() => createOrderApiClient(new Proxy({}, { ownKeys() { throw new Error("options proxy escaped"); } })), {
    name: "TypeError", message: "order_client_invalid",
  });
  const uuidGuarded = createOrderApiClient({ fetch: async () => { fetches += 1; return json({}); }, randomUUID() { throw new Error("uuid escaped"); } });
  await assert.rejects(async () => uuidGuarded.addNote(ORDER_ID, "Not"), { name: "TypeError", message: "order_client_invalid" });
  assert.equal(fetches, 0);
  const responseProxy = new Proxy({}, { getPrototypeOf() { throw new Error("response proxy escaped"); } });
  const responseGuarded = createOrderApiClient({
    fetch: async () => ({
      headers: new Headers({ "content-type": "application/json" }),
      status: 200,
      ok: true,
      async json() { return responseProxy; },
    }) as Response,
  });
  await assert.rejects(() => responseGuarded.getOrder(ORDER_ID), (error: unknown) => error instanceof OrderApiError && error.code === "unavailable");
  const client = await source("lib/order-ui/client.ts");
  assert.doesNotMatch(client, /localStorage|sessionStorage|document[.]cookie|authorization|x-(?:store|tenant|principal|membership)|TenantContext|storeId|principalId|membershipId/i);
  assert.doesNotMatch(client, /https?:\/\/|\/api\/admin|supabase/i);
});

test("order list renders a controlled loading state without records", async () => {
  const Presentation = await compilePresentation("components/orders/OrderListConsole.tsx", "OrderListPresentation");
  const html = renderToStaticMarkup(createElement(Presentation, renderProps("loading")));
  assert.match(html, /role="status"/);
  assert.match(html, /Siparişler yükleniyor/);
  assert.doesNotMatch(html, /HMK-1042/);
});

test("order list renders a truthful empty state without fake rows", async () => {
  const Presentation = await compilePresentation("components/orders/OrderListConsole.tsx", "OrderListPresentation");
  const html = renderToStaticMarkup(createElement(Presentation, renderProps("loaded", [])));
  assert.match(html, /Henüz sipariş bulunmuyor/);
  assert.doesNotMatch(html, /HMK-|Ada Lovelace|14[.]990/);
});

test("order list renders a controlled retryable error state", async () => {
  const Presentation = await compilePresentation("components/orders/OrderListConsole.tsx", "OrderListPresentation");
  const html = renderToStaticMarkup(createElement(Presentation, renderProps("error", [])));
  assert.match(html, /role="alert"/);
  assert.match(html, /Siparişler yüklenemedi/);
  assert.match(html, />Tekrar dene</);
});

test("order list renders the dense desktop order table from real DTOs", async () => {
  const Presentation = await compilePresentation("components/orders/OrderListConsole.tsx", "OrderListPresentation");
  const html = renderToStaticMarkup(createElement(Presentation, renderProps("loaded")));
  assert.match(html, /aria-label="Sipariş listesi"/);
  assert.match(html, /HMK-1042/);
  assert.match(html, /Ada Lovelace/);
  assert.match(html, /Onaylandı/);
  assert.match(html, /Başarılı/);
  assert.match(html, new RegExp(`/orders/${ORDER_ID}`));
});

test("order list exposes search, status, sort, and cursor pagination controls", async () => {
  const Presentation = await compilePresentation("components/orders/OrderListConsole.tsx", "OrderListPresentation");
  const html = renderToStaticMarkup(createElement(Presentation, { ...renderProps("loaded"), nextCursor: "cursor_2" }));
  assert.match(html, /Sipariş ara/);
  assert.match(html, /Tüm durumlar/);
  assert.match(html, /En yeni/);
  assert.match(html, /Daha fazla sipariş yükle/);
  const { exports } = await compileOrderModule("components/orders/OrderListConsole.tsx");
  const requestOrderListPage = exports.requestOrderListPage as (
    api: { listOrders(input: unknown): Promise<unknown> },
    input: unknown,
  ) => Promise<{ items: readonly OrderListItem[]; nextCursor?: string }>;
  const mergeOrderListPage = exports.mergeOrderListPage as (
    current: readonly OrderListItem[],
    result: { items: readonly OrderListItem[] },
    append: boolean,
  ) => readonly OrderListItem[];
  const requests: unknown[] = [];
  const listApi = {
    async listOrders(input: unknown) { requests.push(input); return { items: [item], nextCursor: "cursor_2" }; },
  };
  const result = await requestOrderListPage(listApi, { cursor: "cursor_1", status: "confirmed", search: "Ada", sort: "highest" });
  assert.deepEqual(requests, [{ pageSize: 20, cursor: "cursor_1", status: "confirmed", search: "Ada", sort: "highest" }]);
  assert.equal(result.nextCursor, "cursor_2");
  const older = Object.freeze({ ...item, id: ITEM_ID, orderNumber: "HMK-1041", totalCents: 20_000, createdAt: "2026-07-20T09:30:00.000Z" });
  const merged = mergeOrderListPage([older], result, true);
  assert.deepEqual(merged.map(({ orderNumber }) => orderNumber), ["HMK-1041", "HMK-1042"]);
  assert.deepEqual(merged.map(({ orderNumber }) => orderNumber), ["HMK-1041", "HMK-1042"], "server page order is retained without a local re-sort");
  assert.equal("sortOrderListItems" in exports, false);
  const hookRuntime = createHookRuntime();
  const statefulCalls: unknown[] = [];
  const pages = [
    { items: [item], nextCursor: "cursor_1" },
    { items: [older], nextCursor: "cursor_2" },
    { items: [older, item] },
  ];
  const stateful = await compileOrderModule("components/orders/OrderListConsole.tsx", {
    react: hookRuntime.runtime,
    orderApi: {
      async listOrders(input: unknown) {
        statefulCalls.push(input);
        const page = pages.shift();
        assert.ok(page);
        return page;
      },
    },
  });
  const Console = stateful.exports.OrderListConsole as () => ReactNode;
  let consoleView = await hookRuntime.flush(Console) as React.ReactElement<Record<string, unknown>>;
  assert.deepEqual((consoleView.props.items as OrderListItem[]).map(({ orderNumber }) => orderNumber), ["HMK-1042"]);
  (consoleView.props.onLoadMore as () => void)();
  consoleView = await hookRuntime.flush(Console) as React.ReactElement<Record<string, unknown>>;
  assert.deepEqual((consoleView.props.items as OrderListItem[]).map(({ orderNumber }) => orderNumber), ["HMK-1042", "HMK-1041"]);
  (consoleView.props.onSortChange as (value: string) => void)("lowest");
  consoleView = await hookRuntime.flush(Console) as React.ReactElement<Record<string, unknown>>;
  assert.deepEqual(statefulCalls, [
    { pageSize: 20, sort: "newest" },
    { pageSize: 20, cursor: "cursor_1", sort: "newest" },
    { pageSize: 20, sort: "lowest" },
  ]);
  assert.deepEqual((consoleView.props.items as OrderListItem[]).map(({ orderNumber }) => orderNumber), ["HMK-1041", "HMK-1042"], "sort refetch replaces accumulated pages and retains server order");
  assert.equal(consoleView.props.sort, "lowest");
  assert.equal(Object.isFrozen(merged), true);
});

test("order console switches table and mobile cards exactly at 1024/1025 with 48px targets", async () => {
  const css = await source("components/orders/order-console.module.css");
  const list = await source("components/orders/OrderListConsole.tsx");
  const Presentation = await compilePresentation("components/orders/OrderListConsole.tsx", "OrderListPresentation");
  const html = renderToStaticMarkup(createElement(Presentation, renderProps("loaded")));
  assert.match(list, /styles[.]desktopTable/);
  assert.match(list, /styles[.]mobileCards/);
  assert.match(html, new RegExp(`<a class="orderLink" href="/orders/${ORDER_ID}">HMK-1042</a>`));
  assert.match(css, /@media \(max-width: 1024px\)[\s\S]*?[.]desktopTable\s*\{\s*display:\s*none/);
  assert.match(css, /@media \(min-width: 1025px\)[\s\S]*?[.]mobileCards\s*\{\s*display:\s*none/);
  assert.match(css, /[.]orderLink\s*\{[^}]*display:\s*inline-flex[^}]*min-width:\s*48px[^}]*min-height:\s*48px/s);
});

test("order detail renders immutable items, events, and merchant notes", async () => {
  const Presentation = await compilePresentation("components/orders/OrderDetailConsole.tsx", "OrderDetailPresentation");
  const html = renderToStaticMarkup(createElement(Presentation, {
    detail,
    state: "loaded",
    error: "",
    notice: "",
    busy: "",
    capabilities: { fulfill: true, manage: true, payment: true, shipping: true, note: true },
    onRetry() {}, onStatusChange() {}, onPaymentChange() {}, onShippingSubmit() {}, onNoteSubmit() {}, onNoteArchive() {},
  }));
  assert.match(html, /Keten Gömlek/);
  assert.match(html, /Kiremit \/ M/);
  assert.match(html, /Sipariş onaylandı/);
  assert.match(html, /Hediye paketiyle gönderin/);
  assert.match(html, /Adres devamı/);
  assert.match(html, /value="Daire 4"/);
  assert.match(html, /Takip bağlantısı/);
  assert.match(html, /value="https:\/\/track[.]example\/YK123"/);
  assert.match(html, /Kargoya veriliş zamanı/);
  assert.match(html, new RegExp(`value="${NOW.replaceAll(".", "[.]")}"`));
});

test("order detail offers only authorized SQL 023 status and payment transitions", async () => {
  const { exports } = await compileOrderModule("components/orders/OrderDetailConsole.tsx");
  const Presentation = exports.OrderDetailPresentation as ComponentType<Record<string, unknown>>;
  const statusOptions = exports.getAuthorizedOrderStatusOptions as (
    current: string,
    capabilities: { fulfill: boolean; manage: boolean },
  ) => readonly string[];
  const paymentOptions = exports.getAuthorizedOrderPaymentOptions as (current: string, allowed: boolean) => readonly string[];
  const selected: string[] = [];
  const common = {
    detail, state: "loaded", error: "", notice: "", busy: "",
    onRetry() {},
    onStatusChange(value: string) { selected.push(`status:${value}`); },
    onPaymentChange(value: string) { selected.push(`payment:${value}`); },
    onShippingSubmit() {}, onNoteSubmit() {}, onNoteArchive() {},
  };
  const values = (html: string, label: string) => {
    const select = html.match(new RegExp(`<select aria-label="${label}"[\\s\\S]*?<\\/select>`))?.[0] ?? "";
    return [...select.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]);
  };
  const orderCases = [
    ["pending", { fulfill: true, manage: false }, ["pending", "confirmed"]],
    ["pending", { fulfill: false, manage: true }, ["pending", "cancelled"]],
    ["confirmed", { fulfill: true, manage: true }, ["confirmed", "preparing", "cancelled"]],
    ["preparing", { fulfill: true, manage: true }, ["preparing", "shipped", "cancelled"]],
    ["shipped", { fulfill: true, manage: false }, ["shipped", "delivered"]],
    ["delivered", { fulfill: true, manage: false }, []],
    ["delivered", { fulfill: false, manage: true }, ["delivered", "refunded"]],
    ["cancelled", { fulfill: true, manage: true }, []],
    ["refunded", { fulfill: true, manage: true }, []],
  ] as const;
  for (const [status, capability, expected] of orderCases) {
    assert.deepEqual(statusOptions(status, capability), expected);
    const html = renderToStaticMarkup(createElement(Presentation, {
      ...common,
      detail: Object.freeze({ ...detail, status }),
      capabilities: { ...capability, payment: false, shipping: false, note: false },
    }));
    assert.deepEqual(values(html, "Sipariş durumunu güncelle"), expected);
    if (expected.length === 0) assert.doesNotMatch(html, /aria-label="Sipariş operasyonları"/);
  }
  const paymentCases = [
    ["pending", ["pending", "processing", "failed"]],
    ["processing", ["processing", "completed", "failed"]],
    ["failed", ["failed", "processing"]],
    ["completed", ["completed", "refunded"]],
    ["refunded", []],
  ] as const;
  for (const [paymentStatus, expected] of paymentCases) {
    assert.deepEqual(paymentOptions(paymentStatus, true), expected);
    const html = renderToStaticMarkup(createElement(Presentation, {
      ...common,
      detail: Object.freeze({ ...detail, paymentStatus }),
      capabilities: { fulfill: false, manage: false, payment: true, shipping: false, note: false },
    }));
    assert.deepEqual(values(html, "Ödeme durumunu güncelle"), expected);
    if (expected.length === 0) assert.doesNotMatch(html, /aria-label="Sipariş operasyonları"/);
  }
  assert.deepEqual(paymentOptions("pending", false), []);
  const editorHtml = renderToStaticMarkup(createElement(Presentation, {
    ...common,
    capabilities: { fulfill: true, manage: false, payment: true, shipping: true, note: true },
  }));
  const editorTree = (Presentation as (props: Record<string, unknown>) => ReactNode)({
    ...common,
    capabilities: { fulfill: true, manage: false, payment: true, shipping: true, note: true },
  });
  visitElements(editorTree, (element) => {
    const label = element.props["aria-label"];
    const onChange = element.props.onChange as ((event: { target: { value: string } }) => void) | undefined;
    if (label === "Sipariş durumunu güncelle") onChange?.({ target: { value: "preparing" } });
    if (label === "Ödeme durumunu güncelle") onChange?.({ target: { value: "refunded" } });
  });
  assert.deepEqual(selected, ["status:preparing", "payment:refunded"]);
  assert.deepEqual(values(editorHtml, "Sipariş durumunu güncelle"), ["confirmed", "preparing"]);
  assert.deepEqual(values(editorHtml, "Ödeme durumunu güncelle"), ["completed", "refunded"]);
  const executeOrderMutation = exports.executeOrderMutation as (
    operation: () => Promise<unknown>,
    reload: (conflict: boolean) => Promise<unknown>,
  ) => Promise<{ state: string }>;
  const calls: string[] = [];
  const outcome = await executeOrderMutation(
    async () => { calls.push("transition"); },
    async (conflict) => { calls.push(`reload:${conflict}`); },
  );
  assert.deepEqual(calls, ["transition", "reload:false"]);
  assert.equal(outcome.state, "success");
  const detailPage = await source("app/orders/[orderId]/page.tsx");
  assert.match(detailPage, /manage:\s*isMerchantActionAllowed\(role,\s*"orders[.]manage"\)/);
});

test("order detail wires shipping and note add/archive controls to safe mutations", async () => {
  const { exports } = await compileOrderModule("components/orders/OrderDetailConsole.tsx");
  const buildOrderShippingUpdate = exports.buildOrderShippingUpdate as (order: OrderDetail, data: FormData) => unknown;
  const data = new FormData();
  for (const [name, value] of Object.entries({
    recipientName: "Ada Lovelace", line1: "Örnek Sokak 1", line2: "Daire 4", district: "Kadıköy",
    city: "İstanbul", postalCode: "34710", country: "tr", carrier: "Yurtiçi Kargo", trackingNumber: "YK123",
    trackingUrl: "https://track.example/YK123", shippedAt: NOW,
  })) data.set(name, value);
  assert.deepEqual(buildOrderShippingUpdate(detail, data), {
    expectedVersion: 4,
    shippingAddress: {
      recipientName: "Ada Lovelace", line1: "Örnek Sokak 1", line2: "Daire 4", district: "Kadıköy",
      city: "İstanbul", postalCode: "34710", country: "TR",
    },
    tracking: {
      carrier: "Yurtiçi Kargo", trackingNumber: "YK123", trackingUrl: "https://track.example/YK123", shippedAt: NOW,
    },
  });
  const component = await source("components/orders/OrderDetailConsole.tsx");
  assert.match(component, /orderApi[.]updateShipping\(orderId/);
  assert.match(component, /orderApi[.]addNote\(orderId/);
  assert.match(component, /orderApi[.]archiveNote\(orderId/);
});

test("order detail reloads durable state after an optimistic version conflict", async () => {
  const { exports, OrderApiError } = await compileOrderModule("components/orders/OrderDetailConsole.tsx");
  const executeOrderMutation = exports.executeOrderMutation as (
    operation: () => Promise<unknown>,
    reload: (conflict: boolean) => Promise<unknown>,
  ) => Promise<{ state: string }>;
  const resetNoteFormAfterSuccess = exports.resetNoteFormAfterSuccess as (
    outcome: { state: string },
    form: { reset(): void },
  ) => void;
  const reloads: boolean[] = [];
  const conflict = await executeOrderMutation(
    async () => { throw new OrderApiError("version_conflict"); },
    async (value) => { reloads.push(value); },
  );
  assert.equal(conflict.state, "conflict");
  assert.deepEqual(reloads, [true]);
  let resets = 0;
  resetNoteFormAfterSuccess(conflict, { reset() { resets += 1; } });
  resetNoteFormAfterSuccess({ state: "error" }, { reset() { resets += 1; } });
  assert.equal(resets, 0);
  resetNoteFormAfterSuccess({ state: "success" }, { reset() { resets += 1; } });
  assert.equal(resets, 1);
});

test("order detail hides every mutation control when server-projected capabilities deny it", async () => {
  const Presentation = await compilePresentation("components/orders/OrderDetailConsole.tsx", "OrderDetailPresentation");
  const html = renderToStaticMarkup(createElement(Presentation, {
    detail,
    state: "loaded",
    error: "",
    notice: "",
    busy: "",
    capabilities: { fulfill: false, manage: false, payment: false, shipping: false, note: false },
    onRetry() {}, onStatusChange() {}, onPaymentChange() {}, onShippingSubmit() {}, onNoteSubmit() {}, onNoteArchive() {},
  }));
  assert.doesNotMatch(html, /Sipariş durumunu güncelle|Ödeme durumunu güncelle|Kargo bilgilerini kaydet|Not ekle|Notu arşivle/);
  assert.match(html, /Keten Gömlek/);
});

test("orders navigation exposes every genuine child with exact activation and safe route titles", async () => {
  const navigation = await import("./panel-ui/navigation.ts");
  const orders = navigation.PANEL_NAVIGATION.find(({ key }) => key === "orders");
  assert.deepEqual(orders?.children?.map(({ label, href }) => [label, href]), [
    ["Tüm Siparişler", "/orders"],
    ["Hızlı Siparişler", "/orders/quick-links"],
    ["Terk Edilen Sepetler", "/orders/abandoned-carts"],
  ]);
  assert.equal(navigation.isPanelNavigationPathActive("/orders", "/orders"), true);
  assert.equal(navigation.isPanelNavigationPathActive(`/orders/${ORDER_ID}`, "/orders"), true);
  for (const unsafe of ["/orders-evil", "/orders%2Fevil", "/orders?x=1", "/orders#x", "/orders//evil"]) {
    assert.equal(navigation.isPanelNavigationPathActive(unsafe, "/orders"), false);
  }
  assert.equal(navigation.getPanelRoutePresentation("/orders").title, "Siparişler");
  assert.equal(navigation.getPanelRoutePresentation("/orders/quick-links").title, "Hızlı Siparişler");
  assert.equal(navigation.getPanelRoutePresentation("/orders/abandoned-carts").title, "Terk Edilen Sepetler");
  assert.equal(navigation.getPanelRoutePresentation(`/orders/${ORDER_ID}`).title, "Sipariş ayrıntısı");
});

test("dashboard and order pages expose only durable order facts without private authority or fake routes", async () => {
  const dashboardModel = await import("./panel-ui/dashboard-model.ts");
  const { readyAuthority } = await import("./panel-ui/authority-slice.ts");
  const dashboard = await source("components/dashboard/PanelDashboardHomeView.tsx");
  const model = await source("lib/panel-ui/dashboard-model.ts");
  const listPage = await source("app/orders/page.tsx");
  const detailPage = await source("app/orders/[orderId]/page.tsx");
  const combined = [dashboard, model, listPage, detailPage].join("\n");
  const catalogSummary = Object.freeze({
    totalProducts: 4, activeProducts: 3, draftProducts: 1, productLimit: 10, activeVariants: 6,
    outOfStockVariants: 2, productsWithoutMedia: 1, activeMedia: 7,
  });
  const orderSummary = Object.freeze({
    totalOrders: 9, pendingOrders: 2, fulfilledOrders: 5, revenueCents: 48_500, currency: "TRY", asOf: NOW,
  });
  const requests: string[] = [];
  const [catalogResult, orderResult] = await dashboardModel.loadMerchantDashboardSummaries(
    { async getDashboardSummary() { requests.push("catalog"); return catalogSummary; } },
    { async getDashboardSummary() { requests.push("orders"); return orderSummary; } },
  );
  assert.deepEqual(requests.sort(), ["catalog", "orders"]);
  assert.equal(catalogResult.status, "fulfilled");
  assert.equal(orderResult.status, "fulfilled");
  const chrome = Object.freeze({
    storeSlug: "atlas-store", membershipLabel: "Mağaza sahibi", planCode: "free_starter", planVersion: 3,
    entitlementStatus: "active" as const, storefrontHostname: "atlas-store.celebix.site", locale: "tr-TR",
    analyticsAvailable: false,
  });
  const view = dashboardModel.createMerchantDashboardViewModel(
    chrome,
    readyAuthority(catalogSummary, NOW),
    readyAuthority(orderSummary, NOW),
  );
  const Presentation = await compileDashboardPresentation(dashboardModel);
  const html = renderToStaticMarkup(createElement(Presentation, { dashboard: view, onRefresh() {}, state: "loaded", ordersState: "loaded" }));
  assert.match(html, /Sipariş özeti/);
  assert.match(html, /Toplam sipariş/);
  assert.match(html, />9<\/strong>/);
  assert.match(html, /Doğrulanmış gelir/);
  assert.match(dashboard, /loadMerchantDashboardSummaries/);
  assert.match(model, /totalOrders/);
  assert.match(model, /pendingOrders/);
  assert.match(model, /fulfilledOrders/);
  assert.match(model, /revenueCents/);
  assert.match(model, /unsupportedAuthority\(\s*"analytics"/);
  assert.match(model, /unsupportedAuthority\(\s*"customers"/);
  assert.match(model, /unsupportedAuthority\(\s*"carts"/);
  assert.match(listPage, /OrderListConsole/);
  assert.match(detailPage, /OrderDetailConsole/);
  assert.doesNotMatch(combined, /TenantContext[^\n]*(?:prop|client)|storeId|principalId|membershipId|\/api\/admin/i);
});
