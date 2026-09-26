import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import * as jsxRuntime from "react/jsx-runtime";
import { Window } from "happy-dom";
import ts from "typescript";
import type { OrderDetail } from "@celebix/saas-contracts";

const ID = "93000000-0000-4000-8000-000000000001";
const SECOND = "93000000-0000-4000-8000-000000000002";
const caps = { fulfill: true, manage: true, payment: true, shipping: true, note: true, delete: true };
const base: OrderDetail = { id: ID, orderNumber: "WEB-000001", source: "storefront", customerName: "Örnek müşteri", customerEmail: "test@example.test", currency: "TRY", totalCents: 10000, subtotalCents: 10000, shippingCents: 0, discountCents: 0, status: "confirmed", paymentStatus: "completed", itemCount: 0, version: 1, createdAt: "2026-09-26T12:00:00Z", updatedAt: "2026-09-26T12:00:00Z", items: [], events: [], notes: [], shippingAddress: { recipientName: "Örnek müşteri", line1: "Örnek adres", city: "İstanbul", country: "TR" }, tracking: { carrier: "Örnek kargo", trackingNumber: "TEST-1", shippedAt: "2026-09-26T12:00:37.123Z" } };
class ApiError extends Error { constructor(readonly code: string) { super(code); } }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
type View = Record<string, any>;
async function mounted(overrides: Record<string, (...args: any[]) => any>, verify: (context: { props: () => View; render: (id?: string) => Promise<void>; browser: Window; container: HTMLElement; submit: (callback: string, data: Record<string, string>) => Promise<void> }) => Promise<void>, initial = base, presentation = false) {
  const browser = new Window({ url: "https://panel.example.test/orders/test" });
  // happy-dom has no top-layer modal implementation; exercise the React event/focus lifecycle.
  browser.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  browser.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const globals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Event: browser.Event, FormData: browser.FormData, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let latest: View = {};
  const api = { getOrder: async (id: string) => ({ ...initial, id }), getOrderNeighbors: async () => ({}), getOrderNotifications: async () => [], transitionStatus: async () => undefined, updateShipping: async () => undefined, restoreOrder: async () => undefined, ...overrides };
  const compiled = { exports: {} as Record<string, any> };
  const compile = async (file: string, runtime: unknown) => {
    const source = await readFile(new URL(`../components/orders/${file}`, import.meta.url), "utf8");
    const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const module = file === "OrderDetailConsole.tsx" ? compiled : { exports: {} as Record<string, any> };
    Function("require", "module", "exports", output)((name: string) => {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return runtime;
      if (name === "next/link") return { __esModule: true, default: ({ children, ...props }: any) => createElement("a", props, children) };
      if (name === "lucide-react") return new Proxy({}, { get: () => () => createElement("svg", { "aria-hidden": true }) });
      if (name === "@/components/panel/PanelPageShell") return { PanelPageShell: ({ children }: any) => createElement("main", null, children), PanelStatusBadge: ({ children }: any) => createElement("span", null, children) };
      if (name === "@/components/shipping/OrderShipmentConsole") return { OrderShipmentConsole: () => null };
      if (name === "@/lib/order-ui/client") return { orderApi: api, OrderApiError: ApiError };
      if (name === "./OrderActionDialog") return dialog;
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
      throw new Error(`unexpected_import:${name}`);
    }, module, module.exports);
    return module.exports;
  };
  const dialog = await compile("OrderActionDialog.tsx", jsxRuntime);
  const intercept = (factory: typeof jsxRuntime.jsx) => (type: any, props: any, key: any) => {
    if (!presentation && type === compiled.exports.OrderDetailPresentation) { latest = props; return factory("main", { "data-state": props.state }, key); }
    return factory(type, props, key);
  };
  await compile("OrderDetailConsole.tsx", { ...jsxRuntime, jsx: intercept(jsxRuntime.jsx), jsxs: intercept(jsxRuntime.jsxs) });
  const nativeContainer = browser.document.createElement("div"); browser.document.body.append(nativeContainer);
  const container = nativeContainer as unknown as HTMLElement;
  const root = createRoot(container);
  const render = async (id = ID) => { await act(async () => root.render(createElement(compiled.exports.OrderDetailConsole, { orderId: id, capabilities: caps }))); };
  const submit = async (callback: string, data: Record<string, string>) => {
    const form = browser.document.createElement("form");
    for (const [name, value] of Object.entries(data)) { const input = browser.document.createElement("input"); input.name = name; input.value = value; form.append(input); }
    await act(async () => { latest[callback]({ preventDefault() {}, currentTarget: form }); });
  };
  try { await render(); await verify({ props: () => latest, render, browser, container, submit }); }
  finally { await act(async () => root.unmount()); for (const [key, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); await browser.happyDOM.close(); }
}

test("old mutation completion cannot cancel the next order's pending read", async () => {
  const mutation = deferred<void>(); const nextOrder = deferred<OrderDetail>(); let reads = 0;
  await mounted({ getOrder: async (id: string) => { reads++; return id === ID ? base : nextOrder.promise; }, transitionStatus: async () => mutation.promise }, async ({ props, render }) => {
    await act(async () => props().onStatusChange("preparing"));
    await render(SECOND); assert.equal(props().state, "loading"); assert.equal(props().detail, undefined);
    await act(async () => mutation.resolve());
    await act(async () => nextOrder.resolve({ ...base, id: SECOND, orderNumber: "WEB-000002" }));
    assert.equal(props().state, "loaded"); assert.equal(props().detail.id, SECOND); assert.equal(reads, 2);
  });
});

test("returning to the same order cannot reuse an earlier visit's mutation completion", async () => {
  const first = deferred<void>(); const second = deferred<void>(); let mutations = 0;
  await mounted({ transitionStatus: async () => ++mutations === 1 ? first.promise : second.promise }, async ({ props, render }) => {
    await act(async () => props().onStatusChange("preparing"));
    await render(SECOND); await render(ID);
    await act(async () => props().onStatusChange("preparing"));
    assert.equal(props().busy, "status");
    await act(async () => first.resolve());
    assert.equal(props().busy, "status"); assert.equal(props().successId, 0);
    await act(async () => second.resolve());
    assert.equal(props().busy, ""); assert.equal(props().successId, 1);
  });
});

test("restore retry survives a newly mounted form and retires its proof after success", async () => {
  const proofs: string[] = []; let count = 0;
  await mounted({ restoreOrder: async (_id: string, input: any) => { proofs.push(input.operationId); if (++count < 3) throw new Error("ambiguous response"); } }, async ({ props, submit }) => {
    const values = { reason: "Operasyon kontrol edildi", evidenceReference: "test-evidence" };
    await submit("onRestoreSubmit", values); await submit("onRestoreSubmit", values);
    assert.equal(proofs[0], proofs[1]); assert.ok(props().error);
    await submit("onRestoreSubmit", values); assert.equal(proofs[2], proofs[0]); assert.equal(props().successId, 1);
    await submit("onRestoreSubmit", values); assert.notEqual(proofs[3], proofs[0]);
  }, { ...base, archive: { archived: true, changedAt: "2026-09-26T13:00:00Z" } });
});

test("shipping serializes local date to ISO and preserves an unchanged timestamp's precision", async () => {
  const updates: any[] = [];
  await mounted({ updateShipping: async (_id: string, input: any) => { updates.push(input); } }, async ({ submit }) => {
    const shippedAt = base.tracking!.shippedAt!; const parsed = new Date(shippedAt);
    const initialLocal = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const fields = { recipientName: "Örnek müşteri", line1: "Yeni adres", city: "İstanbul", country: "TR", carrier: "Örnek kargo", trackingNumber: "TEST-1" };
    await submit("onShippingSubmit", { ...fields, shippedAt: initialLocal });
    assert.equal(updates[0].tracking.shippedAt, shippedAt);
    await submit("onShippingSubmit", { ...fields, shippedAt: "2026-09-27T15:45" });
    assert.equal(updates[1].tracking.shippedAt, new Date("2026-09-27T15:45").toISOString());
    await submit("onShippingSubmit", { ...fields, carrier: "", shippedAt: "2026-09-27T15:45" }); assert.equal(updates.length, 2);
  });
});

test("failed note retains its input, Escape returns focus to visible overflow summary", async () => {
  await mounted({ addNote: async () => { throw new Error("failed"); } }, async ({ container, browser }) => {
    const summary = container.querySelector<HTMLDetailsElement>("details.moreMenu")!;
    summary.open = true; const button = Array.from(summary.querySelectorAll("button")).find(entry => entry.textContent === "Sipariş durumu")!;
    await act(async () => button.click());
    const modal = container.querySelector<HTMLDialogElement>("dialog[open]")!; assert.ok(modal); assert.equal(summary.open, false);
    await act(async () => modal.dispatchEvent(new browser.Event("cancel", { bubbles: false, cancelable: true }) as unknown as Event));
    assert.equal(browser.document.activeElement, summary.querySelector("summary"));
    const note = container.querySelector<HTMLTextAreaElement>('textarea[name="body"]')!; note.value = "Korunacak not";
    await act(async () => note.closest("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event));
    assert.equal(note.value, "Korunacak not"); assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /tamamlanamadı/);
  }, base, true);
});
