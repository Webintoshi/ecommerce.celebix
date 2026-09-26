import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import type { OrderListItem } from "@celebix/saas-contracts";

const item: OrderListItem = { id: "93000000-0000-4000-8000-000000000001", orderNumber: "WEB-000001", source: "storefront", customerName: "Test müşteri", customerEmail: "test@example.test", currency: "TRY", totalCents: 10000, status: "confirmed", paymentStatus: "completed", itemCount: 1, createdAt: "2026-09-26T12:00:00Z", updatedAt: "2026-09-26T12:00:00Z", version: 1 };
const second: OrderListItem = { ...item, id: "93000000-0000-4000-8000-000000000002", orderNumber: "WEB-000002" };

function hooks() {
  const slots: unknown[] = []; let cursor = 0; let dirty = true; let latest: React.ReactElement<Record<string, unknown>>;
  const same = (left: readonly unknown[] | undefined, right: readonly unknown[]) => left !== undefined && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const runtime = { ...React,
    useState<T>(initial: T | (() => T)) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? (initial as () => T)() : initial; return [slots[index] as T, (next: T | ((previous: T) => T)) => { slots[index] = typeof next === "function" ? (next as (previous: T) => T)(slots[index] as T) : next; dirty = true; }] as const; },
    useRef<T>(initial: T) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useMemo<T>(factory: () => T, deps: readonly unknown[]) { const index = cursor++; const previous = slots[index] as { deps: readonly unknown[]; value: T } | undefined; if (!previous || !same(previous.deps, deps)) slots[index] = { deps: [...deps], value: factory() }; return (slots[index] as { value: T }).value; },
    useCallback<T>(callback: T, deps: readonly unknown[]) { const index = cursor++; const previous = slots[index] as { deps: readonly unknown[]; value: T } | undefined; if (!previous || !same(previous.deps, deps)) slots[index] = { deps: [...deps], value: callback }; return (slots[index] as { value: T }).value; },
    useEffect(effect: () => void | (() => void), deps: readonly unknown[]) { const index = cursor++; const previous = slots[index] as { deps: readonly unknown[]; cleanup?: () => void } | undefined; if (previous && same(previous.deps, deps)) return; previous?.cleanup?.(); const cleanup = effect(); slots[index] = { deps: [...deps], cleanup: typeof cleanup === "function" ? cleanup : undefined }; },
  };
  return { runtime, async flush(Component: () => React.ReactElement<Record<string, unknown>>) { for (let pass = 0; pass < 20; pass++) { if (dirty) { dirty = false; cursor = 0; latest = Component(); } await new Promise<void>(resolve => setImmediate(resolve)); if (!dirty) return latest; } throw new Error("hook_flush_exhausted"); } };
}

async function compile(api: { listOrders(input: unknown): Promise<unknown> }, runtime: unknown) {
  const source = await readFile(new URL("../components/orders/OrderListConsole.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} as Record<string, unknown> };
  Function("require", "module", "exports", output)((name: string) => {
    if (name === "react") return runtime;
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "next/link") return { __esModule: true, default: () => null };
    if (name === "lucide-react") return new Proxy({}, { get: () => () => null });
    if (name === "@/components/panel/PanelPageShell") return {};
    if (name === "./OrderActionDialog") return { OrderActionDialog: () => null };
    if (name === "./order-list.module.css") return { __esModule: true, default: new Proxy({}, { get: (_target, property) => String(property) }) };
    if (name === "@/lib/order-ui/client") return { orderApi: api, OrderApiError: class extends Error {} };
    throw new Error(`unexpected_import:${name}`);
  }, module, module.exports);
  return module.exports;
}

function defer<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test("failed load-more keeps rows and cursor available, retry appends without resetting the list", async () => {
  const runtime = hooks(); let call = 0; const requests: unknown[] = [];
  const exported = await compile({ async listOrders(input) { requests.push(input); call++; if (call === 1) return { items: [item], nextCursor: "page-2" }; if (call === 2) throw new Error("network_failure"); return { items: [second] }; } }, runtime.runtime);
  const Console = exported.OrderListConsole as () => React.ReactElement<Record<string, unknown>>;
  let view = await runtime.flush(Console);
  (view.props.onLoadMore as () => void)(); view = await runtime.flush(Console);
  assert.equal(view.props.state, "loaded"); assert.equal(view.props.nextCursor, "page-2"); assert.equal(view.props.loadingMore, false);
  assert.deepEqual(view.props.items, [item]); assert.ok(view.props.loadMoreError);
  (view.props.onLoadMore as () => void)(); view = await runtime.flush(Console);
  assert.deepEqual(view.props.items, [item, second]); assert.equal(view.props.loadMoreError, ""); assert.equal(view.props.nextCursor, undefined);
  assert.deepEqual(requests, [{ pageSize: 20, sort: "newest" }, { pageSize: 20, cursor: "page-2", sort: "newest" }, { pageSize: 20, cursor: "page-2", sort: "newest" }]);
});

test("duplicate load-more is guarded and an obsolete page cannot append after the server filter changes", async () => {
  const runtime = hooks(); const stale = defer<{ items: OrderListItem[]; nextCursor: string }>(); const requests: unknown[] = [];
  const exported = await compile({ async listOrders(input) { requests.push(input); if (requests.length === 1) return { items: [item], nextCursor: "page-2" }; if (requests.length === 2) return stale.promise; return { items: [{ ...second, status: "shipped" }] }; } }, runtime.runtime);
  const Console = exported.OrderListConsole as () => React.ReactElement<Record<string, unknown>>;
  let view = await runtime.flush(Console); const append = view.props.onLoadMore as () => void; append(); append(); view = await runtime.flush(Console);
  assert.equal(requests.length, 2); assert.equal(view.props.loadingMore, true);
  (view.props.onStatusChange as (value: string) => void)("shipped"); view = await runtime.flush(Console);
  stale.resolve({ items: [item], nextCursor: "page-3" }); view = await runtime.flush(Console);
  assert.equal(view.props.status, "shipped"); assert.equal(view.props.loadingMore, false); assert.equal(view.props.nextCursor, undefined);
  assert.deepEqual((view.props.items as OrderListItem[]).map(order => order.id), [second.id]);
  assert.deepEqual(requests[2], { pageSize: 20, status: "shipped", sort: "newest" });
});

test("in-store orders stay pickup records in loaded delivery filters and CSV", async () => {
  const exported = await compile({ async listOrders() { return { items: [] }; } }, React);
  const pickup = { ...item, source: "in_store", orderNumber: "POS-0000001", status: "delivered" } as const;
  const filter = exported.filterOrderListItems as (items: readonly OrderListItem[], filters: { dateRange: string; payment: string; fulfillment: string }) => OrderListItem[];
  assert.deepEqual(filter([pickup], { dateRange: "all", payment: "all", fulfillment: "not_applicable" }), [pickup]);
  assert.deepEqual(filter([pickup], { dateRange: "all", payment: "all", fulfillment: "delivered" }), []);
  const csv = exported.serializeOrderListCsv as (items: readonly OrderListItem[]) => string;
  assert.match(csv([pickup]), /Mağazadan teslim,Mağaza satışı/);
});

test("search stays submit-based and clearing a submitted query restores the server list", async () => {
  const runtime = hooks(); const requests: unknown[] = [];
  const exported = await compile({ async listOrders(input) { requests.push(input); return { items: [item] }; } }, runtime.runtime);
  const Console = exported.OrderListConsole as () => React.ReactElement<Record<string, unknown>>;
  let view = await runtime.flush(Console);
  (view.props.onSearchChange as (value: string) => void)("  Test müşteri  "); view = await runtime.flush(Console);
  assert.equal(requests.length, 1);
  (view.props.onSearchSubmit as () => void)(); view = await runtime.flush(Console);
  assert.deepEqual(requests[1], { pageSize: 20, search: "Test müşteri", sort: "newest" });
  (view.props.onClearSearch as () => void)(); view = await runtime.flush(Console);
  assert.equal(view.props.search, ""); assert.deepEqual(requests[2], { pageSize: 20, sort: "newest" });
});
