import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as React from "react";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

import type { InventoryCount, InventoryLocation, InventoryMutationResult, InventoryTransfer, PurchaseOrder } from "@celebix/saas-contracts";
import { createInventoryApi, InventoryApiError } from "./inventory-ui/client.ts";
import { prepareInventoryOperationSubmission, submitInventoryOperationForm } from "./inventory-ui/form-intent.ts";

const ROOT = new URL("../", import.meta.url);
const ORDER = "11111111-1111-4111-8111-111111111111";
const COUNT = "22222222-2222-4222-8222-222222222222";
const TRANSFER = "33333333-3333-4333-8333-333333333333";
const LOCATION = "44444444-4444-4444-8444-444444444444";
const DESTINATION = "55555555-5555-4555-8555-555555555555";
const LINE = "66666666-6666-4666-8666-666666666666";
const VARIANT = "77777777-7777-4777-8777-777777777777";
const SECOND_LINE = "88888888-8888-4888-8888-888888888888";
const SECOND_VARIANT = "99999999-9999-4999-8999-999999999999";
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
const location = (overrides: Partial<InventoryLocation> = {}): InventoryLocation => Object.freeze({
  id: LOCATION, name: "Ana depo", isDefault: true, status: "active", version: 1,
  archiveEligibility: Object.freeze({ canArchive: false, reason: "default" }),
  createdAt: NOW, updatedAt: NOW, ...overrides,
});

test("location controller owns one mutation and reloads exact durable locations", async () => {
  const module = await controllers();
  assert.equal(typeof module.createInventoryLocationConsoleController, "function");
  const pending = deferred<InventoryMutationResult>();
  let saves = 0, loads = 0;
  const subject = (module.createInventoryLocationConsoleController as Function)({
    canRead: true, canManage: true,
    api: {
      async listLocations() { loads += 1; return loads === 1 ? [location()] : [location(), location({ id: DESTINATION, name: "Şube depo", isDefault: false, archiveEligibility: { canArchive: true, reason: null } })]; },
      saveLocation() { saves += 1; return pending.promise; },
      async archiveLocation() { throw new Error("unexpected"); },
    },
  });
  await subject.load();
  const first = subject.save({ name: "Şube depo" });
  const second = subject.save({ name: "Ignored" });
  assert.equal(saves, 1);
  assert.equal(subject.getSnapshot().pending, true);
  pending.resolve(mutation(DESTINATION, "active", 1));
  await Promise.all([first, second]);
  assert.equal(loads, 2);
  assert.equal(subject.getSnapshot().items.length, 2);
  assert.equal(subject.getSnapshot().phase, "committed");
});

test("location controller locks ambiguous mutation until full reload and aborts on dispose", async () => {
  const module = await controllers();
  const phases: string[] = [];
  let signal: AbortSignal | undefined;
  const subject = (module.createInventoryLocationConsoleController as Function)({
    canRead: true, canManage: true,
    api: {
      async listLocations() { return [location()]; },
      async saveLocation(_value: unknown, requestSignal: AbortSignal) { signal = requestSignal; throw new InventoryApiError("unavailable", 503); },
      async archiveLocation() { throw new Error("unexpected"); },
    },
    onChange(snapshot: { phase: string }) { phases.push(snapshot.phase); },
  });
  await subject.load();
  await subject.save({ name: "Şube depo" });
  assert.equal(subject.getSnapshot().phase, "verification_unavailable");
  assert.equal(subject.getSnapshot().locked, true);
  await subject.save({ name: "No retry" });
  assert.equal(phases.filter((phase) => phase === "submitting").length, 1);
  subject.dispose();
  assert.equal(signal?.aborted, false);

  const pending = deferred<InventoryMutationResult>();
  const pendingSubject = (module.createInventoryLocationConsoleController as Function)({
    canRead: true, canManage: true,
    api: {
      async listLocations() { return [location()]; },
      saveLocation(_value: unknown, requestSignal: AbortSignal) { signal = requestSignal; return pending.promise; },
      async archiveLocation() { throw new Error("unexpected"); },
    },
  });
  await pendingSubject.load();
  const work = pendingSubject.save({ name: "Pending" });
  pendingSubject.dispose();
  assert.equal(signal?.aborted, true);
  pending.resolve(mutation(DESTINATION, "active", 1));
  await work;
});

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
  const calls: Array<unknown> = [];
  const canonical = purchase({ status: "partially_received", version: 4, lines: Object.freeze([Object.freeze({ ...purchase().lines[0]!, receivedQuantity: 5 })]) });
  const subject = (module.createPurchasingConsoleController as Function)({
    initial: purchase(), canManage: true,
    api: {
      async receivePurchaseOrder(id: string, input: unknown, signal: AbortSignal) { calls.push({ id, input, signal }); return mutation(ORDER, "partially_received", 4); },
      async getPurchaseOrder(id: string) { assert.equal(id, ORDER); return canonical; },
    },
  });

  await subject.receive([{ lineId: LINE, quantity: 2 }]);

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

test("purchase save owns one mutation, preserves draft version and rejects cross-action posts", async () => {
  const module = await controllers();
  const pending = deferred<InventoryMutationResult>();
  const saves: unknown[] = [];
  let orders = 0;
  const canonical = purchase({ status: "draft", version: 4 });
  const subject = (module.createPurchasingConsoleController as Function)({
    initial: purchase({ status: "draft" }), canManage: true,
    api: {
      savePurchaseOrder(value: unknown) { saves.push(value); return pending.promise; },
      async transitionPurchaseOrder() { orders += 1; return mutation(ORDER, "ordered", 4); },
      async getPurchaseOrder() { return canonical; },
    },
  });
  const intent = {
    orderId: ORDER, expectedVersion: 3, locationId: LOCATION, supplierName: "Kalıcı Tedarikçi",
    lines: [{ lineId: LINE, variantId: VARIANT, orderedQuantity: 4, unitCostCents: 900 }],
  };
  const first = subject.save(intent);
  const duplicate = subject.save(intent);
  const crossed = subject.order();
  assert.equal(saves.length, 1);
  assert.equal(orders, 0);
  pending.resolve(mutation(ORDER, "draft", 4));
  await Promise.all([first, duplicate, crossed]);
  assert.deepEqual(saves, [intent]);
  assert.equal(subject.getSnapshot().record, canonical);
});

test("empty-store form submission creates canonical purchase and can continue its real lifecycle", async () => {
  const module = await controllers();
  const intent = prepareInventoryOperationSubmission({
    mode: "purchase", supplierName: "İlk Tedarikçi", locationId: LOCATION,
    sourceLocationId: "", destinationLocationId: "",
    lines: [{ lineId: "", variantId: VARIANT, quantity: "2", unitCostCents: "150" }],
  }, { locationIds: new Set([LOCATION]), variantIds: new Set([VARIANT]) }, () => LINE);
  assert.equal(intent.ok, true);
  if (!intent.ok) return;
  const draftRecord = purchase({ status: "draft", version: 1, supplierName: "İlk Tedarikçi", lines: Object.freeze([
    Object.freeze({ ...purchase().lines[0]!, orderedQuantity: 2, receivedQuantity: 0, unitCostCents: 150, lineCostCents: 300 }),
  ]), totalCostCents: 300 });
  const orderedRecord = purchase({ ...draftRecord, status: "ordered", version: 2 });
  const saves: unknown[] = [], transitions: unknown[] = [];
  let reads = 0;
  const subject = (module.createPurchasingConsoleController as Function)({
    canManage: true,
    api: {
      async savePurchaseOrder(value: unknown) { saves.push(value); return mutation(ORDER, "draft", 1); },
      async transitionPurchaseOrder(id: string, value: unknown) { transitions.push({ id, value }); return mutation(ORDER, "ordered", 2); },
      async getPurchaseOrder() { reads += 1; return reads === 1 ? draftRecord : orderedRecord; },
    },
  });
  assert.equal(subject.getSnapshot().record, undefined);
  await subject.save(intent.value);
  assert.deepEqual(saves, [{
    locationId: LOCATION, supplierName: "İlk Tedarikçi",
    lines: [{ lineId: LINE, variantId: VARIANT, orderedQuantity: 2, unitCostCents: 150 }],
  }]);
  assert.equal(subject.getSnapshot().record, draftRecord);
  await subject.order();
  assert.deepEqual(transitions, [{ id: ORDER, value: { expectedVersion: 1, transition: "order" } }]);
  assert.equal(subject.getSnapshot().record, orderedRecord);
});

test("purchase receipt accepts exact positive partial quantities and never auto-receives remaining lines", async () => {
  const module = await controllers();
  const calls: Array<unknown> = [];
  const canonical = purchase({ status: "partially_received", version: 4, lines: Object.freeze([Object.freeze({ ...purchase().lines[0]!, receivedQuantity: 4 })]) });
  const subject = (module.createPurchasingConsoleController as Function)({
    initial: purchase(), canManage: true,
    api: {
      async receivePurchaseOrder(_id: string, input: unknown) { calls.push(input); return mutation(ORDER, "partially_received", 4); },
      async getPurchaseOrder() { return canonical; },
    },
  });
  await subject.receive([{ lineId: LINE, quantity: 1 }]);
  assert.deepEqual(calls, [{ expectedVersion: 3, locationId: LOCATION, lines: [{ lineId: LINE, quantity: 1 }] }]);

  let invalidCalled = false;
  const invalid = (module.createPurchasingConsoleController as Function)({
    initial: purchase(), canManage: true,
    api: {
      async receivePurchaseOrder() { invalidCalled = true; return mutation(ORDER, "received", 4); },
      async getPurchaseOrder() { return canonical; },
    },
  });
  await invalid.receive([{ lineId: LINE, quantity: 0 }]);
  await invalid.receive([{ lineId: LINE, quantity: 3 }]);
  assert.equal(invalidCalled, false);
});

test("definitive create rejection is retryable while denied and ambiguous creates stay locked", async () => {
  const module = await controllers();
  const intent = {
    locationId: LOCATION, supplierName: "Kalıcı Tedarikçi",
    lines: [{ lineId: LINE, variantId: VARIANT, orderedQuantity: 4, unitCostCents: 900 }],
  };
  let attempts = 0;
  const canonical = purchase({ status: "draft", version: 1 });
  const retryable = (module.createPurchasingConsoleController as Function)({
    canManage: true,
    api: {
      async savePurchaseOrder() {
        attempts += 1;
        if (attempts === 1) throw new InventoryApiError("invalid_input", 400);
        return mutation(ORDER, "draft", 1);
      },
      async getPurchaseOrder() { return canonical; },
    },
  });
  await retryable.save(intent);
  assert.deepEqual({ phase: retryable.getSnapshot().phase, locked: retryable.getSnapshot().locked }, { phase: "mutation_rejected", locked: false });
  await retryable.save(intent);
  assert.equal(attempts, 2);
  assert.equal(retryable.getSnapshot().record, canonical);

  for (const [error, expected] of [
    [new InventoryApiError("forbidden", 403), "denied"],
    [new InventoryApiError("unavailable", 503), "verification_unavailable"],
  ] as const) {
    let calls = 0;
    const subject = (module.createPurchasingConsoleController as Function)({
      canManage: true,
      api: {
        async savePurchaseOrder() { calls += 1; throw error; },
        async getPurchaseOrder() { throw new Error("unexpected"); },
      },
    });
    await subject.save(intent);
    assert.equal(subject.getSnapshot().phase, expected);
    assert.equal(subject.getSnapshot().locked, true);
    await subject.save(intent);
    assert.equal(calls, 1);
  }
});

test("two-line receipt refreshes canonical partial state before a later exact completion", async () => {
  const module = await controllers();
  const originalLines = Object.freeze([
    Object.freeze({ ...purchase().lines[0]!, orderedQuantity: 5, receivedQuantity: 0 }),
    Object.freeze({ ...purchase().lines[0]!, id: SECOND_LINE, variantId: SECOND_VARIANT, orderedQuantity: 4, receivedQuantity: 2, lineCostCents: 5000 }),
  ]);
  const partial = purchase({
    status: "partially_received", version: 4,
    lines: Object.freeze([
      Object.freeze({ ...originalLines[0]!, receivedQuantity: 5 }),
      originalLines[1]!,
    ]),
  });
  const complete = purchase({
    status: "received", version: 5,
    lines: Object.freeze([
      partial.lines[0]!,
      Object.freeze({ ...partial.lines[1]!, receivedQuantity: 4 }),
    ]),
  });
  const calls: unknown[] = [];
  let canonicalReads = 0;
  const subject = (module.createPurchasingConsoleController as Function)({
    initial: purchase({ status: "ordered", lines: originalLines }), canManage: true,
    api: {
      async receivePurchaseOrder(_id: string, input: unknown) {
        calls.push(input);
        return calls.length === 1 ? mutation(ORDER, "partially_received", 4) : mutation(ORDER, "received", 5);
      },
      async getPurchaseOrder() { canonicalReads += 1; return canonicalReads === 1 ? partial : complete; },
    },
  });

  await subject.receive([{ lineId: LINE, quantity: 5 }]);
  assert.equal(subject.getSnapshot().record, partial);
  await subject.receive([{ lineId: SECOND_LINE, quantity: 2 }]);

  assert.deepEqual(calls, [
    { expectedVersion: 3, locationId: LOCATION, lines: [{ lineId: LINE, quantity: 5 }] },
    { expectedVersion: 4, locationId: LOCATION, lines: [{ lineId: SECOND_LINE, quantity: 2 }] },
  ]);
  assert.equal(subject.getSnapshot().record, complete);
  assert.equal(subject.getSnapshot().phase, "committed");
});

test("count and transfer save preserve durable IDs, versions and exact line inputs", async () => {
  const module = await controllers();
  const countCalls: unknown[] = [], transferCalls: unknown[] = [];
  const countSubject = (module.createInventoryCountConsoleController as Function)({
    initial: count({ status: "draft" }), canManage: true,
    api: {
      async saveCount(value: unknown) { countCalls.push(value); return mutation(COUNT, "draft", 5); },
      async getCount() { return count({ status: "draft", version: 5 }); },
    },
  });
  const countIntent = { countId: COUNT, expectedVersion: 4, locationId: LOCATION, lines: [{ lineId: LINE, variantId: VARIANT, countedQuantity: 0 }] };
  await countSubject.save(countIntent);
  const transferSubject = (module.createInventoryTransferConsoleController as Function)({
    initial: transfer({ status: "draft" }), canManage: true,
    api: {
      async saveTransfer(value: unknown) { transferCalls.push(value); return mutation(TRANSFER, "draft", 3); },
      async getTransfer() { return transfer({ status: "draft", version: 3 }); },
    },
  });
  const transferIntent = { transferId: TRANSFER, expectedVersion: 2, sourceLocationId: LOCATION, destinationLocationId: DESTINATION, lines: [{ lineId: LINE, variantId: VARIANT, quantity: 2 }] };
  await transferSubject.save(transferIntent);
  assert.deepEqual(countCalls, [countIntent]);
  assert.deepEqual(transferCalls, [transferIntent]);
});

test("shared form boundary owns empty-store count create start and commit without duplicate mutations", async () => {
  const module = await controllers();
  const created = count({ status: "draft", version: 1, lines: Object.freeze([
    Object.freeze({ id: LINE, variantId: VARIANT, expectedQuantity: 0, countedQuantity: 0 }),
  ]), });
  const counting = count({ ...created, status: "counting", version: 2, lines: Object.freeze([
    Object.freeze({ id: LINE, variantId: VARIANT, expectedQuantity: 10 }),
  ]) });
  const counted = count({ ...counting, version: 3, lines: Object.freeze([
    Object.freeze({ id: LINE, variantId: VARIANT, expectedQuantity: 10, countedQuantity: 12 }),
  ]) });
  const committed = count({ ...counted, status: "committed", version: 4 });
  const savePending = deferred<InventoryMutationResult>();
  const countSavePending = deferred<InventoryMutationResult>();
  const startPending = deferred<InventoryMutationResult>();
  const commitPending = deferred<InventoryMutationResult>();
  const saves: unknown[] = [], starts: unknown[] = [], commits: unknown[] = [];
  let reads = 0;
  const subject = (module.createInventoryCountConsoleController as Function)({
    canManage: true,
    api: {
      saveCount(value: unknown, signal: AbortSignal) { saves.push({ value, signal }); return saves.length === 1 ? savePending.promise : countSavePending.promise; },
      startCount(id: string, version: number, signal: AbortSignal) { starts.push({ id, version, signal }); return startPending.promise; },
      commitCount(id: string, version: number, signal: AbortSignal) { commits.push({ id, version, signal }); return commitPending.promise; },
      async getCount() { reads += 1; return reads === 1 ? created : reads === 2 ? counting : reads === 3 ? counted : committed; },
    },
  });
  let generated = 0;
  let createWork: Promise<void> | undefined;
  const submit = () => submitInventoryOperationForm({
    mode: "count", supplierName: "", locationId: LOCATION, sourceLocationId: "", destinationLocationId: "",
    lines: [{ lineId: "", variantId: VARIANT, quantity: "0", unitCostCents: "0" }],
  }, { locationIds: new Set([LOCATION]), variantIds: new Set([VARIANT]) }, (value) => {
    createWork = subject.save(value);
  }, () => { generated += 1; return LINE; });

  assert.equal(submit().ok, true);
  assert.equal(submit().ok, true);
  assert.equal(saves.length, 1);
  assert.equal(generated, 2);
  assert.deepEqual((saves[0] as { value: unknown }).value, {
    locationId: LOCATION, lines: [{ lineId: LINE, variantId: VARIANT, countedQuantity: 0 }],
  });
  assert.equal((saves[0] as { signal: AbortSignal }).signal instanceof AbortSignal, true);
  savePending.resolve(mutation(COUNT, "draft", 1));
  await createWork;
  assert.equal(subject.getSnapshot().record, created);

  const firstStart = subject.start(), duplicateStart = subject.start();
  assert.equal(starts.length, 1);
  startPending.resolve(mutation(COUNT, "counting", 2));
  await Promise.all([firstStart, duplicateStart]);
  assert.deepEqual({ id: (starts[0] as { id: string }).id, version: (starts[0] as { version: number }).version }, { id: COUNT, version: 1 });
  assert.equal(subject.getSnapshot().record, counting);

  let countSaveWork: Promise<void> | undefined;
  const countSave = submitInventoryOperationForm({
    mode: "count", record: counting, supplierName: "", locationId: LOCATION, sourceLocationId: "", destinationLocationId: "",
    lines: [{ lineId: LINE, variantId: VARIANT, quantity: "12", unitCostCents: "0" }],
  }, { locationIds: new Set([LOCATION]), variantIds: new Set([VARIANT]) }, (value) => {
    countSaveWork = subject.save(value);
  });
  assert.equal(countSave.ok, true);
  assert.deepEqual((saves[1] as { value: unknown }).value, {
    countId: COUNT, expectedVersion: 2, locationId: LOCATION,
    lines: [{ lineId: LINE, variantId: VARIANT, countedQuantity: 12 }],
  });
  countSavePending.resolve(mutation(COUNT, "counting", 3));
  await countSaveWork;
  assert.equal(subject.getSnapshot().record, counted);

  const firstCommit = subject.commit(), duplicateCommit = subject.commit();
  assert.equal(commits.length, 1);
  commitPending.resolve(mutation(COUNT, "committed", 4));
  await Promise.all([firstCommit, duplicateCommit]);
  assert.deepEqual({ id: (commits[0] as { id: string }).id, version: (commits[0] as { version: number }).version }, { id: COUNT, version: 3 });
  assert.equal(subject.getSnapshot().record, committed);
});

test("shared form boundary owns empty-store transfer create dispatch and receive without duplicate mutations", async () => {
  const module = await controllers();
  const created = transfer({ status: "draft", version: 1 });
  const inTransit = transfer({ ...created, status: "in_transit", version: 2 });
  const received = transfer({ ...inTransit, status: "received", version: 3 });
  const savePending = deferred<InventoryMutationResult>();
  const dispatchPending = deferred<InventoryMutationResult>();
  const receivePending = deferred<InventoryMutationResult>();
  const saves: unknown[] = [], dispatches: unknown[] = [], receipts: unknown[] = [];
  let reads = 0;
  const subject = (module.createInventoryTransferConsoleController as Function)({
    canManage: true,
    api: {
      saveTransfer(value: unknown, signal: AbortSignal) { saves.push({ value, signal }); return savePending.promise; },
      dispatchTransfer(id: string, version: number, signal: AbortSignal) { dispatches.push({ id, version, signal }); return dispatchPending.promise; },
      receiveTransfer(id: string, version: number, signal: AbortSignal) { receipts.push({ id, version, signal }); return receivePending.promise; },
      async getTransfer() { reads += 1; return reads === 1 ? created : reads === 2 ? inTransit : received; },
    },
  });
  let generated = 0;
  let createWork: Promise<void> | undefined;
  const submit = () => submitInventoryOperationForm({
    mode: "transfer", supplierName: "", locationId: "", sourceLocationId: LOCATION, destinationLocationId: DESTINATION,
    lines: [{ lineId: "", variantId: VARIANT, quantity: "2", unitCostCents: "0" }],
  }, { locationIds: new Set([LOCATION, DESTINATION]), variantIds: new Set([VARIANT]) }, (value) => {
    createWork = subject.save(value);
  }, () => { generated += 1; return LINE; });

  assert.equal(submit().ok, true);
  assert.equal(submit().ok, true);
  assert.equal(saves.length, 1);
  assert.equal(generated, 2);
  assert.deepEqual((saves[0] as { value: unknown }).value, {
    sourceLocationId: LOCATION, destinationLocationId: DESTINATION,
    lines: [{ lineId: LINE, variantId: VARIANT, quantity: 2 }],
  });
  assert.equal((saves[0] as { signal: AbortSignal }).signal instanceof AbortSignal, true);
  savePending.resolve(mutation(TRANSFER, "draft", 1));
  await createWork;
  assert.equal(subject.getSnapshot().record, created);

  const firstDispatch = subject.dispatch(), duplicateDispatch = subject.dispatch();
  assert.equal(dispatches.length, 1);
  dispatchPending.resolve(mutation(TRANSFER, "in_transit", 2));
  await Promise.all([firstDispatch, duplicateDispatch]);
  assert.deepEqual({ id: (dispatches[0] as { id: string }).id, version: (dispatches[0] as { version: number }).version }, { id: TRANSFER, version: 1 });
  assert.equal(subject.getSnapshot().record, inTransit);

  const firstReceive = subject.receive(), duplicateReceive = subject.receive();
  assert.equal(receipts.length, 1);
  receivePending.resolve(mutation(TRANSFER, "received", 3));
  await Promise.all([firstReceive, duplicateReceive]);
  assert.deepEqual({ id: (receipts[0] as { id: string }).id, version: (receipts[0] as { version: number }).version }, { id: TRANSFER, version: 2 });
  assert.equal(subject.getSnapshot().record, received);
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

  const first = subject.receive([{ lineId: LINE, quantity: 2 }]);
  const second = subject.receive([{ lineId: LINE, quantity: 2 }]);
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
      async commitCount() { throw new InventoryApiError("conflict", 409); },
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
  await lifecycle.getCurrent()?.receive([{ lineId: LINE, quantity: 2 }]);

  assert.deepEqual([gets, receives], [3, 1]);
  assert.equal(lifecycle.getCurrent()?.getSnapshot().phase, "committed");
  secondCleanup();
});

test("ambiguous transport, unavailable and abort results stay locked after old, changed and terminal canonical GETs", async () => {
  const module = await controllers();
  const scenarios = [
    { name: "transport/old", canonical: purchase(), fail: () => { throw new Error("ambiguous transport"); } },
    { name: "unavailable/changed", canonical: purchase({ version: 4 }), fail: () => Response.json({ code: "unavailable" }, { status: 503 }) },
    { name: "abort/terminal", canonical: purchase({ status: "received", version: 4 }), fail: () => { throw new DOMException("aborted", "AbortError"); } },
  ] as const;
  for (const scenario of scenarios) {
    const canonical = deferred<Response>();
    const posts: Array<Record<string, unknown>> = [];
    let gets = 0;
    const api = createInventoryApi((async (_input, init) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return scenario.fail();
      }
      gets += 1;
      return canonical.promise;
    }) as typeof fetch, () => "88888888-8888-4888-8888-888888888888");
    const subject = (module.createPurchasingConsoleController as Function)({ initial: purchase(), canManage: true, api });

    const first = subject.receive([{ lineId: LINE, quantity: 2 }]);
    const duplicate = subject.receive([{ lineId: LINE, quantity: 2 }]);
    await tick();
    assert.deepEqual([posts.length, gets], [1, 1], scenario.name);
    assert.equal(posts[0]?.operationId, "88888888-8888-4888-8888-888888888888", scenario.name);
    canonical.resolve(Response.json(scenario.canonical));
    await Promise.all([first, duplicate]);
    assert.equal(subject.getSnapshot().phase, "verification_unavailable", scenario.name);
    assert.equal(subject.getSnapshot().locked, true, scenario.name);
    assert.doesNotMatch(subject.getSnapshot().message, /İşlem uygulanmadı|tekrar deneyebilirsiniz/i, scenario.name);
    await subject.receive([{ lineId: LINE, quantity: 2 }]);
    assert.deepEqual([posts.length, gets], [1, 1], scenario.name);
  }
});

test("an old canonical GET cannot become rejected copy before a delayed commit and only a fresh page lifecycle loads truth", async () => {
  const module = await controllers();
  let serverRecord = purchase();
  let posts = 0;
  let controllersCreated = 0;
  const api = createInventoryApi((async (_input, init) => {
    if (init?.method === "POST") { posts += 1; throw new Error("response lost after commit started"); }
    return Response.json(serverRecord);
  }) as typeof fetch, () => "88888888-8888-4888-8888-888888888888");
  const lifecycle = (module.createInventoryConsoleLifecycle as Function)(() => {
    controllersCreated += 1;
    return (module.createPurchasingConsoleController as Function)({
      ...(controllersCreated === 1 ? { initial: purchase() } : { resourceId: ORDER }),
      canManage: true,
      api,
    });
  });

  const cleanup = lifecycle.setup();
  await lifecycle.getCurrent()?.receive([{ lineId: LINE, quantity: 2 }]);
  const locked = lifecycle.getCurrent();
  assert.equal(locked?.getSnapshot().phase, "verification_unavailable");
  assert.equal(locked?.getSnapshot().locked, true);
  serverRecord = purchase({ status: "received", version: 4 });
  await locked?.receive([{ lineId: LINE, quantity: 2 }]);
  assert.equal(posts, 1);
  assert.equal(locked?.getSnapshot().record.status, "ordered");

  cleanup();
  const finalCleanup = lifecycle.setup();
  await tick();
  assert.equal(controllersCreated, 2);
  assert.notEqual(lifecycle.getCurrent(), locked);
  assert.equal(lifecycle.getCurrent()?.getSnapshot().phase, "loaded");
  assert.equal(lifecycle.getCurrent()?.getSnapshot().record.status, "received");
  finalCleanup();
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

  await subject.receive([{ lineId: LINE, quantity: 2 }]);
  assert.deepEqual([posts, gets], [1, 1]);
  assert.equal(subject.getSnapshot().phase, "verification_unavailable");
  assert.equal(subject.getSnapshot().locked, true);
  await subject.receive([{ lineId: LINE, quantity: 2 }]);
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
    if (specifier === "@/lib/inventory-ui/form-choices") return {};
    if (specifier === "@/lib/inventory-ui/form-intent") return {};
    if (specifier === "./InventoryListState") return {
      InventoryListState: ({ children }: { children?: ReactNode }) => createElement("section", null, children),
      useInventoryCollection: () => ({ phase: "loaded", items: [], error: "", retry() {} }),
    };
    if (specifier === "./InventoryLocationConsole") return { InventoryLocationConsole: () => null };
    if (specifier === "./InventoryOperationForm") return { InventoryOperationForm: () => null, PurchaseReceiptForm: () => null };
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

test("count completion stays disabled until every counted quantity is durably saved", async () => {
  const Presentation = await compilePresentation("components/inventory/InventoryCountConsole.tsx", "InventoryCountPresentation");
  const missing = count({
    lines: Object.freeze([Object.freeze({ id: LINE, variantId: VARIANT, expectedQuantity: 10 })]),
  });
  const incomplete = renderToStaticMarkup(createElement(Presentation, {
    state: { phase: "loaded", record: missing, pending: false, locked: false, message: "" },
    canManage: true, onStart() {}, onCommit() {}, onCancel() {},
  }));
  const complete = renderToStaticMarkup(createElement(Presentation, {
    state: { phase: "loaded", record: count(), pending: false, locked: false, message: "" },
    canManage: true, onStart() {}, onCommit() {}, onCancel() {},
  }));
  assert.match(incomplete, /<button[^>]+disabled=""[^>]*>Sayımı tamamla<\/button>/);
  assert.match(complete, /<button(?![^>]+disabled="")[^>]*>Sayımı tamamla<\/button>/);
});

test("location presentation is truthful about default and non-archivable reasons with 48px actions", async () => {
  const Presentation = await compilePresentation("components/inventory/InventoryLocationConsole.tsx", "InventoryLocationPresentation");
  const html = renderToStaticMarkup(createElement(Presentation, {
    state: { phase: "loaded", items: [
      location(),
      location({ id: DESTINATION, name: "Şube", isDefault: false, status: "active", archiveEligibility: { canArchive: false, reason: "positive_on_hand" } }),
      location({ id: TRANSFER, name: "Arşiv", isDefault: false, status: "archived", archiveEligibility: { canArchive: false, reason: "archived" } }),
    ], pending: false, locked: false, message: "" },
    canManage: true, name: "", onName() {}, onCreate() {}, onEdit() {}, onArchive() {},
  }));
  assert.match(html, /Varsayılan konum arşivlenemez/);
  assert.match(html, /Pozitif stok bakiyesi bulunduğu için arşivlenemez/);
  assert.match(html, /Arşivlenmiş konum değiştirilemez/);
  assert.match(html, /Sürüm 1/);
  assert.match(html, /disabled=""/);
  const css = await readFile(new URL("components/inventory/inventory-console.module.css", ROOT), "utf8");
  assert.match(css, /\.locationActions[\s\S]*min-height:\s*48px/);
});

test("verification unavailable stays an alert with visible locked controls", async () => {
  const Presentation = await compilePresentation("components/inventory/PurchasingConsole.tsx", "PurchasingDetailPresentation");
  const html = renderToStaticMarkup(createElement(Presentation, {
    state: { phase: "verification_unavailable", record: purchase(), pending: false, locked: true, message: "Kalıcı sonuç doğrulanamadı." },
    canManage: true, onOrder() {}, onReceive() {}, onCancel() {},
  }));
  assert.match(html, /role="alert"/);
  assert.match(html, /Kalıcı sonuç doğrulanamadı/);
  assert.match(html, /<button[^>]+disabled=""[^>]*>İptal et<\/button>/);
});

test("operation feedback visibly distinguishes retryable rejection, denied authority and ambiguous lock", async () => {
  const Feedback = await compilePresentation("components/inventory/InventoryOperationForm.tsx", "InventoryOperationFeedback");
  for (const [phase, message] of [
    ["mutation_rejected", "İşlem uygulanmadı; yeniden deneyebilirsiniz."],
    ["denied", "Bu işlem için yetkiniz yok."],
    ["verification_unavailable", "Kalıcı sonuç doğrulanamadı."],
  ] as const) {
    const html = renderToStaticMarkup(createElement(Feedback, { phase, message }));
    assert.match(html, /role="alert"/);
    assert.match(html, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
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

function classSubtree(html: string, className: string) {
  const start = html.indexOf(`<div class="${className}">`);
  assert.notEqual(start, -1, `missing ${className} subtree`);
  const tags = /<div\b[^>]*>|<\/div>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    depth += match[0] === "</div>" ? -1 : 1;
    if (depth === 0) return html.slice(start, tags.lastIndex);
  }
  assert.fail(`unclosed ${className} subtree`);
}

test("each rendered mobileCards subtree independently contains its labels, status, full identities and exact hit-target link", async () => {
  const cases = [
    ["components/inventory/PurchasingConsole.tsx", "PurchasingListPresentation", purchase(), "Sipariş verildi", `/products/purchasing/${ORDER}`, ["Tedarikçi", "Konum", "Sipariş", "Teslim", "Toplam", "Güncellendi", "Sürüm"], [LOCATION]],
    ["components/inventory/InventoryCountConsole.tsx", "InventoryCountListPresentation", count(), "Sayılıyor", `/products/inventory-counts/${COUNT}`, ["Konum", "Kalem", "Fark", "Güncellendi", "Sürüm"], [LOCATION]],
    ["components/inventory/InventoryTransferConsole.tsx", "InventoryTransferListPresentation", transfer(), "Yolda", `/products/transfers/${TRANSFER}`, ["Kaynak", "Hedef", "Kalem", "Miktar", "Güncellendi", "Sürüm"], [LOCATION, DESTINATION]],
  ] as const;
  for (const [path, exportName, record, status, href, labels, identities] of cases) {
    const Presentation = await compilePresentation(path, exportName);
    const html = renderToStaticMarkup(createElement(Presentation, { state: "loaded", items: [record], error: "", onRetry() {} }));
    const mobile = classSubtree(html, "mobileCards");
    for (const label of labels) assert.match(mobile, new RegExp(`(?:<dt>|>)${label}(?:<|</dt>)`), `${path}: ${label}`);
    assert.match(mobile, new RegExp(status), path);
    for (const identity of identities) assert.match(mobile, new RegExp(identity), `${path}: ${identity}`);
    assert.match(mobile, new RegExp(`<a class="mobileRecordLink" href="${href}">`), path);
  }
  const css = await readFile(new URL("components/inventory/inventory-console.module.css", ROOT), "utf8");
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

function resolveComponents(node: ReactNode): ReactNode {
  if (!React.isValidElement<Record<string, unknown>>(node)) return node;
  if (typeof node.type === "function") return resolveComponents((node.type as Function)(node.props));
  return React.cloneElement(
    node,
    node.props,
    React.Children.map(node.props.children as ReactNode, resolveComponents),
  );
}

test("inventory detail route wrappers render loading, denied, not-found, unavailable and loaded truth states", async () => {
  const cases = [
    {
      path: "components/inventory/PurchasingConsole.tsx",
      exportName: "PurchasingConsole",
      factoryName: "createPurchasingConsoleController",
      id: ORDER,
      record: purchase(),
      loadedText: "Kalıcı Tedarikçi",
      loadingText: "Satın alma kaydı yükleniyor",
      deniedText: "Bu satın alma kaydını görüntüleme yetkiniz yok",
    },
    {
      path: "components/inventory/InventoryCountConsole.tsx",
      exportName: "InventoryCountConsole",
      factoryName: "createInventoryCountConsoleController",
      id: COUNT,
      record: count(),
      loadedText: "Sayım 22222222",
      loadingText: "Stok sayımı yükleniyor",
      deniedText: "Bu stok sayımını görüntüleme yetkiniz yok",
    },
    {
      path: "components/inventory/InventoryTransferConsole.tsx",
      exportName: "InventoryTransferConsole",
      factoryName: "createInventoryTransferConsoleController",
      id: TRANSFER,
      record: transfer(),
      loadedText: "TR-33333333",
      loadingText: "Stok transferi yükleniyor",
      deniedText: "Bu stok transferini görüntüleme yetkiniz yok",
    },
  ] as const;
  const truthStates = [
    { key: "loading", snapshot: undefined, canRead: true, expected: undefined },
    { key: "denied", snapshot: undefined, canRead: false, expected: undefined },
    { key: "not-found", snapshot: { phase: "error", pending: false, locked: false, message: "Envanter kaydı bulunamadı." }, canRead: true, expected: "Envanter kaydı bulunamadı" },
    { key: "unavailable", snapshot: { phase: "error", pending: false, locked: false, message: "Envanter kaydı yüklenemedi. Tekrar deneyin." }, canRead: true, expected: "Envanter kaydı yüklenemedi" },
    { key: "loaded", snapshot: { phase: "loaded", pending: false, locked: false, message: "" }, canRead: true, expected: undefined },
  ] as const;

  for (const route of cases) {
    for (const truth of truthStates) {
      const hooks = createHookRuntime();
      const styles = new Proxy({}, { get: (_target, key) => key === "__esModule" ? true : key === "default" ? styles : String(key) });
      const shell = {
        PanelEmptyState: () => null,
        PanelPageHeader: ({ title }: { title: string }) => createElement("header", null, title),
        PanelPageShell: ({ children }: { children?: ReactNode }) => createElement("section", null, children),
        PanelStatusBadge: ({ children }: { children?: ReactNode }) => createElement("span", null, children),
      };
      const controllerModule = {
        createInventoryConsoleLifecycle(factory: () => Readonly<{ load(): Promise<void>; dispose(): void }>) {
          let current: ReturnType<typeof factory> | undefined;
          return {
            setup() { current = factory(); void current.load(); return () => current?.dispose(); },
            getCurrent() { return current; },
          };
        },
        [route.factoryName](options: Readonly<{ onChange?(snapshot: Record<string, unknown>): void }>) {
          return {
            async load() {
              if (truth.snapshot) options.onChange?.({
                ...truth.snapshot,
                ...(truth.key === "loaded" ? { record: route.record } : {}),
              });
            },
            dispose() {},
          };
        },
      };
      const listModule = {
        InventoryListState: ({ children }: { children?: ReactNode }) => createElement("section", null, children),
        useInventoryCollection: () => ({ phase: "loaded", items: [], error: "", retry() {} }),
      };
      const module = await compileWith(hooks.runtime, route.path, (specifier) => {
        if (specifier === "next/link") return ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => createElement("a", props, children);
        if (specifier === "@/components/panel/PanelPageShell") return shell;
        if (specifier === "@/lib/inventory-ui/client") return { inventoryApi: {} };
        if (specifier === "@/lib/inventory-ui/console-controller") return controllerModule;
        if (specifier === "./InventoryListState") return listModule;
        if (specifier === "./InventoryLocationConsole") return { InventoryLocationConsole: () => null };
        if (specifier === "./InventoryOperationForm") return { InventoryOperationForm: () => null, PurchaseReceiptForm: () => null };
        if (specifier.endsWith("inventory-console.module.css")) return styles;
        throw new Error(`unexpected_truth_state_import:${specifier}`);
      });
      const Console = module[route.exportName] as (props: Record<string, unknown>) => ReactNode;
      const resolved = await hooks.flush(() => resolveComponents(Console({
        resourceId: route.id,
        canRead: truth.canRead,
        canManage: true,
      })));
      const html = renderToStaticMarkup(resolved);
      const expected = truth.expected
        ?? (truth.key === "loading" ? route.loadingText : truth.key === "denied" ? route.deniedText : route.loadedText);
      assert.match(html, new RegExp(expected), `${route.exportName}:${truth.key}`);
      if (truth.key === "not-found" || truth.key === "unavailable") assert.match(html, /role="alert"/);
      if (truth.key === "denied" || truth.key === "loading") assert.match(html, /role="status"/);
    }
  }
});

test("inventory location rename dialog is labeled, validated, pending-aware and exposes accessible focus behavior", async () => {
  const Dialog = await compilePresentation("components/inventory/InventoryLocationConsole.tsx", "InventoryLocationRenameDialog");
  const selected = location({
    id: DESTINATION,
    name: "Şube",
    isDefault: false,
    archiveEligibility: { canArchive: true, reason: null },
  });
  const html = renderToStaticMarkup(createElement(Dialog, {
    location: selected,
    name: "",
    pending: true,
    error: "Konum adı zorunludur.",
    onName() {},
    onCancel() {},
    onSubmit() {},
  }));
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby="inventory-location-rename-title"/);
  assert.match(html, /<label[^>]+for="inventory-location-rename-name"/);
  assert.match(html, /id="inventory-location-rename-name"/);
  assert.match(html, /aria-describedby="inventory-location-rename-feedback"/);
  assert.match(html, /Konum adı zorunludur/);
  assert.match(html, /role="alert"/);
  assert.match(html, /disabled=""/);
  const sourceText = await readFile(new URL("components/inventory/InventoryLocationConsole.tsx", ROOT), "utf8");
  assert.doesNotMatch(sourceText, /window\.prompt/);
  assert.match(sourceText, /event\.key !== "Tab"/);
  assert.match(sourceText, /event\.key === "Escape"/);
  assert.match(sourceText, /\.focus\(\)/);
  const css = await readFile(new URL("components/inventory/inventory-console.module.css", ROOT), "utf8");
  assert.match(css, /\.locationRenameActions[\s\S]*min-height:\s*48px/);
});

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
    if (specifier === "./InventoryOperationForm") return { InventoryOperationForm: () => null, PurchaseReceiptForm: () => null };
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
