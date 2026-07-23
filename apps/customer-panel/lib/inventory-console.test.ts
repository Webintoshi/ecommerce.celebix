import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

import type { InventoryCount, InventoryMutationResult, InventoryTransfer, PurchaseOrder } from "@celebix/saas-contracts";

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

test("list presentations expose fixed columns and labeled mobile facts", async () => {
  const cases = [
    ["components/inventory/PurchasingConsole.tsx", "PurchasingListPresentation", ["Numara", "Tedarikçi", "Durum", "Sipariş", "Teslim", "Toplam", "Güncellendi"]],
    ["components/inventory/InventoryCountConsole.tsx", "InventoryCountListPresentation", ["Ad", "Konum", "Durum", "Kalem", "Fark", "Güncellendi"]],
    ["components/inventory/InventoryTransferConsole.tsx", "InventoryTransferListPresentation", ["Numara", "Kaynak", "Hedef", "Durum", "Kalem", "Miktar", "Güncellendi"]],
  ] as const;
  for (const [path, exportName, labels] of cases) {
    const Presentation = await compilePresentation(path, exportName);
    const record = path.includes("Purchasing") ? purchase() : path.includes("Count") ? count() : transfer();
    const html = renderToStaticMarkup(createElement(Presentation, { state: "loaded", items: [record], error: "", onRetry() {} }));
    for (const label of labels) assert.match(html, new RegExp(label));
    assert.match(html, /mobileCards/);
  }
});

test("inventory CSS keeps controls large and mobile status/conflicts visible", async () => {
  const css = await readFile(new URL("components/inventory/inventory-console.module.css", ROOT), "utf8");
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /min-width:\s*48px/);
  assert.match(css, /@media\s*\(max-width:/);
  assert.doesNotMatch(css, /conflict[^}]*display:\s*none/is);
});
