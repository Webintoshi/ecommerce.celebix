import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

import type { InventoryCount, InventoryMutationResult, InventoryTransfer, PurchaseOrder } from "@celebix/saas-contracts";
import { createInventoryApi } from "./inventory-ui/client.ts";

const ROOT = new URL("../", import.meta.url);
const ORDER = "11111111-1111-4111-8111-111111111111";
const COUNT = "22222222-2222-4222-8222-222222222222";
const TRANSFER = "33333333-3333-4333-8333-333333333333";
const LOCATION = "44444444-4444-4444-8444-444444444444";
const DESTINATION = "55555555-5555-4555-8555-555555555555";
const LINE = "66666666-6666-4666-8666-666666666666";
const VARIANT = "77777777-7777-4777-8777-777777777777";
const NOW = "2026-07-23T10:00:00.000Z";

const purchase = (overrides: Partial<PurchaseOrder> = {}): PurchaseOrder => Object.freeze({
  id: ORDER, locationId: LOCATION, supplierName: "Kalıcı Tedarikçi", status: "ordered",
  lines: Object.freeze([Object.freeze({ id: LINE, variantId: VARIANT, orderedQuantity: 5, receivedQuantity: 3, unitCostCents: 1250, lineCostCents: 6250 })]),
  totalCostCents: 6250, version: 3, createdAt: NOW, updatedAt: NOW, ...overrides,
});
const count = (overrides: Partial<InventoryCount> = {}): InventoryCount => Object.freeze({
  id: COUNT, locationId: LOCATION, status: "counting",
  lines: Object.freeze([Object.freeze({ id: LINE, variantId: VARIANT, expectedQuantity: 7, countedQuantity: 5 })]),
  version: 4, createdAt: NOW, updatedAt: NOW, ...overrides,
});
const transfer = (overrides: Partial<InventoryTransfer> = {}): InventoryTransfer => Object.freeze({
  id: TRANSFER, sourceLocationId: LOCATION, destinationLocationId: DESTINATION, status: "in_transit",
  lines: Object.freeze([Object.freeze({ id: LINE, variantId: VARIANT, quantity: 2 })]),
  version: 2, createdAt: NOW, updatedAt: NOW, ...overrides,
});
const mutation = (id: string, status: string, version: number, replayed = false): InventoryMutationResult =>
  Object.freeze({ id, status, version, updatedAt: NOW, replayed });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

async function controllers() {
  return import("./inventory-ui/console-controller.ts").catch(() => ({} as Record<string, unknown>));
}

test("purchase receipt preserves persisted version, location and line identifiers", async () => {
  const module = await controllers();
  assert.equal(typeof module.createPurchasingConsoleController, "function");
  const calls: unknown[] = [];
  const canonical = purchase({ status: "partially_received", version: 4, lines: Object.freeze([Object.freeze({ ...purchase().lines[0]!, receivedQuantity: 5 })]) });
  const subject = (module.createPurchasingConsoleController as Function)({
    initial: purchase(), canManage: true,
    api: {
      async receivePurchaseOrder(id: string, input: unknown, signal: AbortSignal) { calls.push({ id, input, signal }); return mutation(ORDER, "partially_received", 4); },
      async getPurchaseOrder(id: string) { assert.equal(id, ORDER); return canonical; },
    },
  });

  await subject.receive();

  assert.deepEqual((calls[0] as { id: string; input: unknown }).id, ORDER);
  assert.deepEqual((calls[0] as { input: unknown }).input, {
    expectedVersion: 3,
    locationId: LOCATION,
    lines: [{ lineId: LINE, quantity: 2 }],
  });
  assert.equal((calls[0] as { signal: AbortSignal }).signal instanceof AbortSignal, true);
  assert.equal(subject.getSnapshot().phase, "committed");
  assert.equal(subject.getSnapshot().record, canonical);
});

test("a synchronous double receipt owns one mutation and one canonical reload", async () => {
  const module = await controllers();
  assert.equal(typeof module.createPurchasingConsoleController, "function");
  const pending = deferred<InventoryMutationResult>();
  let receives = 0;
  let reloads = 0;
  const subject = (module.createPurchasingConsoleController as Function)({
    initial: purchase(), canManage: true,
    api: {
      receivePurchaseOrder() { receives += 1; return pending.promise; },
      async getPurchaseOrder() { reloads += 1; return purchase({ status: "received", version: 4 }); },
    },
  });

  const first = subject.receive();
  const second = subject.receive();
  assert.equal(receives, 1);
  assert.equal(subject.getSnapshot().pending, true);
  pending.resolve(mutation(ORDER, "received", 4));
  await Promise.all([first, second]);
  assert.deepEqual([receives, reloads], [1, 1]);
});

test("stale conflict reloads canonical state while retaining visible conflict truth", async () => {
  const module = await controllers();
  assert.equal(typeof module.createInventoryCountConsoleController, "function");
  const canonical = count({ version: 5 });
  const subject = (module.createInventoryCountConsoleController as Function)({
    initial: count(), canManage: true,
    api: {
      async commitCount() { throw Object.assign(new Error("conflict"), { code: "conflict" }); },
      async getCount(id: string) { assert.equal(id, COUNT); return canonical; },
    },
  });

  await subject.commit();

  assert.equal(subject.getSnapshot().phase, "conflict");
  assert.equal(subject.getSnapshot().record, canonical);
  assert.match(subject.getSnapshot().message, /başka bir işlem/i);
});

test("dispose aborts pending work and suppresses unmounted updates", async () => {
  const module = await controllers();
  assert.equal(typeof module.createInventoryTransferConsoleController, "function");
  const pending = deferred<InventoryMutationResult>();
  let signal: AbortSignal | undefined;
  const phases: string[] = [];
  const subject = (module.createInventoryTransferConsoleController as Function)({
    initial: transfer(), canManage: true,
    api: {
      receiveTransfer(_id: string, _version: number, requestSignal: AbortSignal) { signal = requestSignal; return pending.promise; },
      async getTransfer() { return transfer({ status: "received", version: 3 }); },
    },
    onChange(snapshot: { phase: string }) { phases.push(snapshot.phase); },
  });
  const work = subject.receive();
  subject.dispose();
  const countAtDispose = phases.length;
  assert.equal(signal?.aborted, true);
  pending.resolve(mutation(TRANSFER, "received", 3));
  await work;
  assert.equal(phases.length, countAtDispose);
});

test("analyst controllers never invoke mutations", async () => {
  const module = await controllers();
  assert.equal(typeof module.createInventoryCountConsoleController, "function");
  let calls = 0;
  const subject = (module.createInventoryCountConsoleController as Function)({
    initial: count(), canManage: false,
    api: { async commitCount() { calls += 1; return mutation(COUNT, "committed", 5); }, async getCount() { return count(); } },
  });
  await subject.commit();
  assert.equal(calls, 0);
  assert.equal(subject.getSnapshot().phase, "loaded");
});

test("terminal records ignore stale action calls without inventing a replay", async () => {
  const module = await controllers();
  assert.equal(typeof module.createPurchasingConsoleController, "function");
  let reloads = 0;
  const subject = (module.createPurchasingConsoleController as Function)({
    initial: purchase({ status: "received" }), canManage: true,
    api: {
      async receivePurchaseOrder() { throw new Error("unexpected mutation"); },
      async getPurchaseOrder() { reloads += 1; return purchase({ status: "received" }); },
    },
  });
  await subject.receive();
  assert.equal(reloads, 0);
  assert.equal(subject.getSnapshot().phase, "loaded");
});

test("count replay and transfer commit are distinguished after canonical reload", async () => {
  const module = await controllers();
  assert.equal(typeof module.createInventoryCountConsoleController, "function");
  assert.equal(typeof module.createInventoryTransferConsoleController, "function");
  const countSubject = (module.createInventoryCountConsoleController as Function)({
    initial: count(), canManage: true,
    api: { async commitCount(id: string, version: number) { assert.deepEqual([id, version], [COUNT, 4]); return mutation(COUNT, "committed", 5, true); }, async getCount() { return count({ status: "committed", version: 5 }); } },
  });
  const transferSubject = (module.createInventoryTransferConsoleController as Function)({
    initial: transfer(), canManage: true,
    api: { async receiveTransfer(id: string, version: number) { assert.deepEqual([id, version], [TRANSFER, 2]); return mutation(TRANSFER, "received", 3); }, async getTransfer() { return transfer({ status: "received", version: 3 }); } },
  });
  await countSubject.commit();
  await transferSubject.receive();
  assert.equal(countSubject.getSnapshot().phase, "replayed");
  assert.equal(transferSubject.getSnapshot().phase, "committed");
});

test("Strict Mode setup cleanup setup creates a fresh controller and aborts the old load", async () => {
  const module = await controllers();
  assert.equal(typeof module.createInventoryConsoleLifecycle, "function");
  const firstLoad = deferred<PurchaseOrder>();
  const signals: AbortSignal[] = [];
  let gets = 0;
  let receives = 0;
  const lifecycle = (module.createInventoryConsoleLifecycle as Function)(() => (module.createPurchasingConsoleController as Function)({
    resourceId: ORDER,
    canManage: true,
    api: {
      getPurchaseOrder(_id: string, signal: AbortSignal) {
        gets += 1;
        signals.push(signal);
        if (gets === 1) return firstLoad.promise;
        if (gets === 2) return Promise.resolve(purchase());
        return Promise.resolve(purchase({ status: "received", version: 4 }));
      },
      async receivePurchaseOrder() { receives += 1; return mutation(ORDER, "received", 4); },
    },
  }));

  const firstCleanup = lifecycle.setup();
  await tick();
  firstCleanup();
  assert.equal(signals[0]?.aborted, true);
  const secondCleanup = lifecycle.setup();
  firstLoad.resolve(purchase());
  await tick();
  await tick();
  await lifecycle.getCurrent()?.receive();

  assert.deepEqual([gets, receives], [3, 1]);
  assert.equal(lifecycle.getCurrent()?.getSnapshot().phase, "committed");
  secondCleanup();
});

test("ambiguous mutation waits for canonical unchanged proof before a new operation UUID", async () => {
  const module = await controllers();
  const canonical = deferred<Response>();
  const posts: Array<Record<string, unknown>> = [];
  let gets = 0;
  const operationIds = ["88888888-8888-4888-8888-888888888888", "99999999-9999-4999-8999-999999999999"];
  const api = createInventoryApi((async (input, init) => {
    if (init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      if (posts.length === 1) throw new Error("ambiguous transport");
      return Response.json({ kind: "purchase_order", ...mutation(ORDER, "received", 4) });
    }
    gets += 1;
    if (gets === 1) return canonical.promise;
    return Response.json(purchase({ status: "received", version: 4 }));
  }) as typeof fetch, () => operationIds.shift()!);
  const subject = (module.createPurchasingConsoleController as Function)({ initial: purchase(), canManage: true, api });

  const first = subject.receive();
  await tick();
  assert.deepEqual([posts.length, gets], [1, 1]);
  const duplicate = subject.receive();
  assert.equal(posts.length, 1);
  canonical.resolve(Response.json(purchase()));
  await Promise.all([first, duplicate]);
  assert.equal(subject.getSnapshot().phase, "mutation_rejected");
  assert.equal(subject.getSnapshot().locked, false);

  await subject.receive();
  assert.equal(posts.length, 2);
  assert.notEqual(posts[0]?.operationId, posts[1]?.operationId);
  assert.equal(subject.getSnapshot().phase, "committed");
});

test("ambiguous mutation with a changed canonical version never submits again", async () => {
  const module = await controllers();
  let posts = 0;
  let gets = 0;
  const api = createInventoryApi((async (_input, init) => {
    if (init?.method === "POST") { posts += 1; throw new Error("ambiguous transport"); }
    gets += 1;
    return Response.json(purchase({ version: 4 }));
  }) as typeof fetch, () => "88888888-8888-4888-8888-888888888888");
  const subject = (module.createPurchasingConsoleController as Function)({ initial: purchase(), canManage: true, api });

  await subject.receive();
  assert.deepEqual([posts, gets], [1, 1]);
  assert.equal(subject.getSnapshot().phase, "conflict");
  assert.equal(subject.getSnapshot().locked, true);
  await subject.receive();
  assert.equal(posts, 1);
});

test("failed canonical verification locks ambiguous mutation until a page reload", async () => {
  const module = await controllers();
  let posts = 0;
  let gets = 0;
  const api = createInventoryApi((async (_input, init) => {
    if (init?.method === "POST") { posts += 1; throw new Error("ambiguous transport"); }
    gets += 1;
    throw new Error("canonical unavailable");
  }) as typeof fetch, () => "88888888-8888-4888-8888-888888888888");
  const subject = (module.createPurchasingConsoleController as Function)({ initial: purchase(), canManage: true, api });

  await subject.receive();
  assert.deepEqual([posts, gets], [1, 1]);
  assert.equal(subject.getSnapshot().phase, "verification_unavailable");
  assert.equal(subject.getSnapshot().locked, true);
  await subject.receive();
  assert.deepEqual([posts, gets], [1, 1]);
});

async function compilePresentation(path: string, exportName: string) {
  const output = ts.transpileModule(await readFile(new URL(path, ROOT), "utf8"), {
    compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const styles = new Proxy({}, { get: (_target, key) => key === "__esModule" ? true : key === "default" ? styles : String(key) });
  const shell = {
    PanelPageShell: ({ children }: { children?: ReactNode }) => createElement("section", null, children),
    PanelPageHeader: ({ title }: { title: string }) => createElement("header", null, createElement("h1", null, title)),
    PanelStatusBadge: ({ children }: { children?: ReactNode }) => createElement("span", null, children),
    PanelEmptyState: ({ title, description }: { title: string; description: string }) => createElement("section", null, title, description),
  };
  const Link = ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => createElement("a", props, children);
  const module: { exports: Record<string, unknown> } = { exports: {} };
  Function("require", "module", "exports", output)((specifier: string) => {
    if (specifier === "react/jsx-runtime") return jsxRuntime;
    if (specifier === "react") return React;
    if (specifier === "next/link") return Link;
    if (specifier === "@/components/panel/PanelPageShell") return shell;
    if (specifier === "@/lib/inventory-ui/client") return { inventoryApi: {} };
    if (specifier === "@/lib/inventory-ui/console-controller") return {};
    if (specifier === "./InventoryListState") return {
      InventoryListState: ({ children }: { children?: ReactNode }) => createElement("section", null, children),
      useInventoryCollection: () => ({ phase: "loaded", items: [], error: "", retry() {} }),
    };
    if (specifier.endsWith("inventory-console.module.css")) return styles;
    throw new Error(`unexpected_inventory_import:${specifier}`);
  }, module, module.exports);
  assert.equal(typeof module.exports[exportName], "function");
  return module.exports[exportName] as ComponentType<Record<string, unknown>>;
}

test("analyst detail presentations show records and no mutation controls", async () => {
  const Presentation = await compilePresentation("components/inventory/InventoryCountConsole.tsx", "InventoryCountPresentation");
  const html = renderToStaticMarkup(createElement(Presentation, {
    state: { phase: "loaded", record: count(), pending: false, message: "" }, canManage: false,
    onStart() {}, onCommit() {}, onCancel() {},
  }));
  assert.match(html, /Kalemler/);
  assert.match(html, /Sürüm 4/);
  assert.doesNotMatch(html, /Sayımı tamamla|Sayımı başlat|İptal et/);
});

test("verification unavailable stays an alert with visible locked controls", async () => {
  const Presentation = await compilePresentation("components/inventory/PurchasingConsole.tsx", "PurchasingDetailPresentation");
  const html = renderToStaticMarkup(createElement(Presentation, {
    state: { phase: "verification_unavailable", record: purchase(), pending: false, locked: true, message: "Kalıcı sonuç doğrulanamadı." },
    canManage: true, onOrder() {}, onReceive() {}, onCancel() {},
  }));
  assert.match(html, /role="alert"/);
  assert.match(html, /Kalıcı sonuç doğrulanamadı/);
  assert.match(html, /<button[^>]+disabled=""[^>]*>Teslim al<\/button>/);
});

test("list presentations expose fixed columns and labeled mobile facts", async () => {
  const cases = [
    ["components/inventory/PurchasingConsole.tsx", "PurchasingListPresentation", "Sipariş verildi", ["Numara", "Tedarikçi", "Durum", "Sipariş", "Teslim", "Toplam", "Güncellendi"]],
    ["components/inventory/InventoryCountConsole.tsx", "InventoryCountListPresentation", "Sayılıyor", ["Ad", "Konum", "Durum", "Kalem", "Fark", "Güncellendi"]],
    ["components/inventory/InventoryTransferConsole.tsx", "InventoryTransferListPresentation", "Yolda", ["Numara", "Kaynak", "Hedef", "Durum", "Kalem", "Miktar", "Güncellendi"]],
  ] as const;
  for (const [path, exportName, status, labels] of cases) {
    const Presentation = await compilePresentation(path, exportName);
    const record = path.includes("Purchasing") ? purchase() : path.includes("Count") ? count() : transfer();
    const html = renderToStaticMarkup(createElement(Presentation, { state: "loaded", items: [record], error: "", onRetry() {} }));
    for (const label of labels) assert.match(html, new RegExp(label));
    assert.match(html, new RegExp(status));
    assert.match(html, /class="mobileCards"/);
    assert.match(html, /Sürüm/);
    assert.match(html, /href="\/products\/(?:purchasing|inventory-counts|transfers)\/[0-9a-f-]+"/);
    assert.match(html, /Kalıcı Tedarikçi|44444444-4444-4444-8444-444444444444/);
    if (path.includes("Transfer")) assert.match(html, /55555555-5555-4555-8555-555555555555/);
  }
});

test("rendered mobile record links use the exact 48px hit-target selector", async () => {
  const Presentation = await compilePresentation("components/inventory/PurchasingConsole.tsx", "PurchasingListPresentation");
  const html = renderToStaticMarkup(createElement(Presentation, { state: "loaded", items: [purchase()], error: "", onRetry() {} }));
  const css = await readFile(new URL("components/inventory/inventory-console.module.css", ROOT), "utf8");
  assert.match(html, /<a class="mobileRecordLink"[^>]+href="\/products\/purchasing\//);
  const rule = css.match(/\.mobileRecordLink\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(rule, /display:\s*inline-flex/);
  assert.match(rule, /min-height:\s*48px/);
  assert.match(rule, /min-width:\s*48px/);
});

function createHookRuntime() {
  const slots: unknown[] = [];
  let cursor = 0;
  let dirty = true;
  let latest: ReactNode;
  const same = (left: readonly unknown[] | undefined, right: readonly unknown[]) => left !== undefined && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const runtime = {
    ...React,
    useState<T>(initial: T | (() => T)) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      return [slots[index] as T, (next: T | ((current: T) => T)) => { slots[index] = typeof next === "function" ? (next as (current: T) => T)(slots[index] as T) : next; dirty = true; }] as const;
    },
    useRef<T>(initial: T) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index] as { current: T }; },
    useCallback<T extends (...args: never[]) => unknown>(callback: T, deps: readonly unknown[]) { const index = cursor++; const prior = slots[index] as { deps: readonly unknown[]; value: T } | undefined; if (!prior || !same(prior.deps, deps)) slots[index] = { deps: [...deps], value: callback }; return (slots[index] as { value: T }).value; },
    useEffect(effect: () => void | (() => void), deps: readonly unknown[]) { const index = cursor++; const prior = slots[index] as { deps: readonly unknown[]; cleanup?: () => void } | undefined; if (prior && same(prior.deps, deps)) return; prior?.cleanup?.(); const cleanup = effect(); slots[index] = { deps: [...deps], ...(typeof cleanup === "function" ? { cleanup } : {}) }; },
  } as unknown as typeof React;
  return { runtime, async flush(component: () => ReactNode) { for (let pass = 0; pass < 20; pass += 1) { if (dirty || latest === undefined) { dirty = false; cursor = 0; latest = component(); } await tick(); if (!dirty) return latest; } throw new Error("inventory_hook_flush_exhausted"); } };
}

async function compileWith(runtime: typeof React, path: string, imports: (specifier: string) => unknown) {
  const output = ts.transpileModule(await readFile(new URL(path, ROOT), "utf8"), { compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module: { exports: Record<string, unknown> } = { exports: {} };
  Function("require", "module", "exports", output)((specifier: string) => specifier === "react" ? runtime : specifier === "react/jsx-runtime" ? jsxRuntime : imports(specifier), module, module.exports);
  return module.exports;
}

function executeComponents(node: ReactNode): ReactNode {
  if (!React.isValidElement<Record<string, unknown>>(node)) return node;
  if (typeof node.type === "function") return executeComponents((node.type as Function)(node.props));
  React.Children.forEach(node.props.children as ReactNode, executeComponents);
  return node;
}

test("detail mode calls only the exact resource loader and never the collection loader", async () => {
  const hooks = createHookRuntime();
  const styles = new Proxy({}, { get: (_target, key) => key === "__esModule" ? true : key === "default" ? styles : String(key) });
  const shell = { PanelEmptyState: () => null, PanelPageHeader: () => null, PanelPageShell: ({ children }: { children?: ReactNode }) => createElement("section", null, children), PanelStatusBadge: ({ children }: { children?: ReactNode }) => createElement("span", null, children) };
  const listModule = await compileWith(hooks.runtime, "components/inventory/InventoryListState.tsx", (specifier) => {
    if (specifier === "@/components/panel/PanelPageShell") return shell;
    if (specifier.endsWith("inventory-console.module.css")) return styles;
    throw new Error(`unexpected_list_import:${specifier}`);
  });
  const controllerModule = await controllers();
  const calls: string[] = [];
  const api = {
    async listPurchaseOrders() { calls.push("list"); return []; },
    async getPurchaseOrder(id: string) { calls.push(`get:${id}`); return purchase(); },
    async receivePurchaseOrder() { return mutation(ORDER, "received", 4); },
    async transitionPurchaseOrder() { return mutation(ORDER, "ordered", 4); },
  };
  const consoleModule = await compileWith(hooks.runtime, "components/inventory/PurchasingConsole.tsx", (specifier) => {
    if (specifier === "next/link") return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => createElement("a", props, children);
    if (specifier === "@/components/panel/PanelPageShell") return shell;
    if (specifier === "@/lib/inventory-ui/client") return { inventoryApi: api };
    if (specifier === "@/lib/inventory-ui/console-controller") return controllerModule;
    if (specifier === "./InventoryListState") return listModule;
    if (specifier.endsWith("inventory-console.module.css")) return styles;
    throw new Error(`unexpected_console_import:${specifier}`);
  });
  const Console = consoleModule.PurchasingConsole as (props: Record<string, unknown>) => ReactNode;

  await hooks.flush(() => executeComponents(Console({ resourceId: ORDER, canRead: true, canManage: true })));
  assert.deepEqual(calls, [`get:${ORDER}`]);
});

test("executed pages derive exact read and manage props without passing tenant authority", async () => {
  const cases = [
    ["app/products/purchasing/page.tsx", "PurchasingConsole", "purchasing.read", "purchasing.manage", undefined, undefined],
    ["app/products/purchasing/[purchaseOrderId]/page.tsx", "PurchasingConsole", "purchasing.read", "purchasing.manage", "purchaseOrderId", ORDER],
    ["app/products/inventory-counts/page.tsx", "InventoryCountConsole", "inventory.read", "inventory.manage", undefined, undefined],
    ["app/products/inventory-counts/[countId]/page.tsx", "InventoryCountConsole", "inventory.read", "inventory.manage", "countId", COUNT],
    ["app/products/transfers/page.tsx", "InventoryTransferConsole", "inventory.read", "inventory.manage", undefined, undefined],
    ["app/products/transfers/[transferId]/page.tsx", "InventoryTransferConsole", "inventory.read", "inventory.manage", "transferId", TRANSFER],
  ] as const;
  for (const [path, componentName, read, manage, parameter, value] of cases) {
    const actions: string[] = [];
    const Console = (props: Record<string, unknown>) => createElement("output", props);
    const page = await compileWith(React, path, (specifier) => {
      if (specifier === "@celebix/saas-contracts") return { isMerchantActionAllowed(_role: string, action: string) { actions.push(action); return action === read; } };
      if (specifier === `@/components/inventory/${componentName}`) return { [componentName]: Console };
      if (specifier === "@/lib/server-access") return { async resolveServerPanelAccess() { return { tenantContext: { membership: { role: "analyst" } } }; } };
      throw new Error(`unexpected_page_import:${specifier}`);
    });
    const Page = page.default as (props?: Record<string, unknown>) => Promise<React.ReactElement<Record<string, unknown>>>;
    const rendered = await Page(parameter ? { params: Promise.resolve({ [parameter]: value }) } : undefined);
    assert.deepEqual(actions, [read, manage]);
    assert.equal(rendered.type, Console);
    assert.deepEqual(rendered.props, {
      ...(parameter ? { resourceId: value } : {}),
      canRead: true,
      canManage: false,
    });
    assert.equal("tenantContext" in rendered.props, false);
  }
});
