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
    district: "Kadıköy",
    city: "İstanbul",
    postalCode: "34710",
    country: "TR",
  }),
  tracking: Object.freeze({ carrier: "Yurtiçi Kargo", trackingNumber: "YK123" }),
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

async function compilePresentation(
  path: "components/orders/OrderListConsole.tsx" | "components/orders/OrderDetailConsole.tsx",
  exportName: "OrderListPresentation" | "OrderDetailPresentation",
): Promise<ComponentType<Record<string, unknown>>> {
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
  const compiled: { exports: Record<string, unknown> } = { exports: {} };
  const requireModule = (specifier: string): unknown => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return React;
    if (specifier === "next/link") return Link;
    if (specifier === "lucide-react") return new Proxy({}, { get: () => Icon });
    if (specifier === "@/components/panel/PanelPageShell") return shell;
    if (specifier === "@/lib/order-ui/client") return {
      OrderApiError: class extends Error { code = "unavailable"; },
      orderApi: Object.freeze({}),
    };
    if (specifier === "@celebix/saas-contracts") return {
      ORDER_PAYMENT_STATUSES: ["pending", "processing", "completed", "failed", "refunded"],
      ORDER_STATUSES: ["pending", "confirmed", "preparing", "shipped", "delivered", "cancelled", "refunded"],
    };
    if (specifier === "./order-console.module.css") return styles;
    throw new Error(`unexpected_order_console_import:${specifier}`);
  };
  Function("require", "module", "exports", output)(requireModule, compiled, compiled.exports);
  assert.equal(typeof compiled.exports[exportName], "function");
  return compiled.exports[exportName] as ComponentType<Record<string, unknown>>;
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
    detail,
  ];
  const api = createOrderApiClient({ fetch: async (input, init) => { calls.push([input, init]); return json(bodies.shift()); } });
  const summary = await api.getDashboardSummary();
  const list = await api.listOrders({ pageSize: 20, status: "confirmed", search: "Ada Lovelace" });
  const loaded = await api.getOrder(ORDER_ID);
  assert.deepEqual(calls.map(([path]) => path), [
    "/api/orders/summary",
    "/api/orders?pageSize=20&status=confirmed&search=Ada+Lovelace",
    `/api/orders/${ORDER_ID}`,
  ]);
  assert.equal(calls.every(([, init]) => init?.credentials === "same-origin" && init.method === "GET"), true);
  assert.equal(Object.isFrozen(summary), true);
  assert.equal(Object.isFrozen(list), true);
  assert.equal(Object.isFrozen(list.items), true);
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
  assert.equal(results.every(Object.isFrozen), true);
});

test("order client fails closed on unsafe payloads and contains no browser authority channel", async () => {
  const { OrderApiError, createOrderApiClient } = await import("./order-ui/client.ts");
  const api = createOrderApiClient({ fetch: async () => json({ ...item, storeId: ORDER_ID }) });
  await assert.rejects(() => api.getOrder(ORDER_ID), (error: unknown) => error instanceof OrderApiError && error.code === "unavailable");
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
  const component = await source("components/orders/OrderListConsole.tsx");
  assert.match(component, /orderApi[.]listOrders/);
  assert.match(component, /cursor/);
});

test("order console switches table and mobile cards exactly at 1024/1025 with 48px targets", async () => {
  const css = await source("components/orders/order-console.module.css");
  const list = await source("components/orders/OrderListConsole.tsx");
  assert.match(list, /styles[.]desktopTable/);
  assert.match(list, /styles[.]mobileCards/);
  assert.match(css, /@media \(max-width: 1024px\)[\s\S]*?[.]desktopTable\s*\{\s*display:\s*none/);
  assert.match(css, /@media \(min-width: 1025px\)[\s\S]*?[.]mobileCards\s*\{\s*display:\s*none/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /min-width:\s*48px/);
});

test("order detail renders immutable items, events, and merchant notes", async () => {
  const Presentation = await compilePresentation("components/orders/OrderDetailConsole.tsx", "OrderDetailPresentation");
  const html = renderToStaticMarkup(createElement(Presentation, {
    detail,
    state: "loaded",
    error: "",
    notice: "",
    busy: "",
    capabilities: { fulfill: true, payment: true, shipping: true, note: true },
    onRetry() {}, onStatusChange() {}, onPaymentChange() {}, onShippingSubmit() {}, onNoteSubmit() {}, onNoteArchive() {},
  }));
  assert.match(html, /Keten Gömlek/);
  assert.match(html, /Kiremit \/ M/);
  assert.match(html, /Sipariş onaylandı/);
  assert.match(html, /Hediye paketiyle gönderin/);
});

test("order detail wires status and payment controls to safe client mutations", async () => {
  const component = await source("components/orders/OrderDetailConsole.tsx");
  assert.match(component, /orderApi[.]transitionStatus\(orderId/);
  assert.match(component, /orderApi[.]transitionPayment\(orderId/);
  assert.match(component, /expectedVersion:\s*detail[.]version/);
  assert.match(component, /Sipariş durumu/);
  assert.match(component, /Ödeme durumu/);
});

test("order detail wires shipping and note add/archive controls to safe mutations", async () => {
  const component = await source("components/orders/OrderDetailConsole.tsx");
  assert.match(component, /orderApi[.]updateShipping\(orderId/);
  assert.match(component, /orderApi[.]addNote\(orderId/);
  assert.match(component, /orderApi[.]archiveNote\(orderId/);
  assert.match(component, /Kargo bilgileri/);
  assert.match(component, /Dahili notlar/);
});

test("order detail reloads durable state after an optimistic version conflict", async () => {
  const component = await source("components/orders/OrderDetailConsole.tsx");
  assert.match(component, /failure instanceof OrderApiError/);
  assert.match(component, /failure[.]code === "version_conflict"/);
  assert.match(component, /await load\(true\)/);
  assert.match(component, /en güncel veriler yeniden yüklendi/i);
});

test("order detail hides every mutation control when server-projected capabilities deny it", async () => {
  const Presentation = await compilePresentation("components/orders/OrderDetailConsole.tsx", "OrderDetailPresentation");
  const html = renderToStaticMarkup(createElement(Presentation, {
    detail,
    state: "loaded",
    error: "",
    notice: "",
    busy: "",
    capabilities: { fulfill: false, payment: false, shipping: false, note: false },
    onRetry() {}, onStatusChange() {}, onPaymentChange() {}, onShippingSubmit() {}, onNoteSubmit() {}, onNoteArchive() {},
  }));
  assert.doesNotMatch(html, /Sipariş durumunu güncelle|Ödeme durumunu güncelle|Kargo bilgilerini kaydet|Not ekle|Notu arşivle/);
  assert.match(html, /Keten Gömlek/);
});

test("orders navigation has one genuine child with exact activation and safe route titles", async () => {
  const navigation = await import("./panel-ui/navigation.ts");
  assert.deepEqual(navigation.PANEL_ORDER_NAVIGATION.children?.map(({ label, href }) => [label, href]), [["Tüm Siparişler", "/orders"]]);
  assert.equal(navigation.isPanelNavigationPathActive("/orders", "/orders"), true);
  assert.equal(navigation.isPanelNavigationPathActive(`/orders/${ORDER_ID}`, "/orders"), true);
  for (const unsafe of ["/orders-evil", "/orders%2Fevil", "/orders?x=1", "/orders#x", "/orders//evil"]) {
    assert.equal(navigation.isPanelNavigationPathActive(unsafe, "/orders"), false);
  }
  assert.equal(navigation.getPanelRoutePresentation("/orders").title, "Siparişler");
  assert.equal(navigation.getPanelRoutePresentation(`/orders/${ORDER_ID}`).title, "Sipariş ayrıntısı");
  assert.doesNotMatch(JSON.stringify(navigation.PANEL_ORDER_NAVIGATION), /quick|hızlı|abandoned|terk/i);
});

test("dashboard and order pages expose only durable order facts without private authority or fake routes", async () => {
  const dashboard = await source("components/dashboard/PanelDashboardHomeView.tsx");
  const model = await source("lib/panel-ui/dashboard-model.ts");
  const listPage = await source("app/orders/page.tsx");
  const detailPage = await source("app/orders/[orderId]/page.tsx");
  const combined = [dashboard, model, listPage, detailPage].join("\n");
  assert.match(dashboard, /orderApi[.]getDashboardSummary\(\)/);
  assert.match(model, /totalOrders/);
  assert.match(model, /pendingOrders/);
  assert.match(model, /fulfilledOrders/);
  assert.match(model, /revenueCents/);
  assert.match(model, /unsupportedAuthority\("analytics"\)/);
  assert.match(model, /unsupportedAuthority\("customers"\)/);
  assert.match(model, /unsupportedAuthority\("carts"\)/);
  assert.match(listPage, /OrderListConsole/);
  assert.match(detailPage, /OrderDetailConsole/);
  assert.doesNotMatch(combined, /TenantContext[^\n]*(?:prop|client)|storeId|principalId|membershipId|\/api\/admin|quick-links|abandoned-carts/i);
});
