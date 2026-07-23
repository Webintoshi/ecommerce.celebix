import assert from "node:assert/strict";
import test from "node:test";

import { InventoryApiError, createInventoryApi } from "./client.ts";

const LOCATION = "20000000-0000-4000-8000-000000000001";
const DESTINATION = "20000000-0000-4000-8000-000000000002";
const VARIANT = "30000000-0000-4000-8000-000000000001";
const ORDER = "40000000-0000-4000-8000-000000000001";
const COUNT = "50000000-0000-4000-8000-000000000001";
const TRANSFER = "60000000-0000-4000-8000-000000000001";
const LINE = "70000000-0000-4000-8000-000000000001";
const OPERATION = "80000000-0000-4000-8000-000000000001";
const NOW = "2026-07-23T11:00:00.000Z";
const location = () => ({ id: LOCATION, name: "Ana Depo", isDefault: true, status: "active", version: 1, createdAt: NOW, updatedAt: NOW });
const balance = () => ({ locationId: LOCATION, variantId: VARIANT, quantity: 7, version: 1, updatedAt: NOW });
const purchase = () => ({ id: ORDER, locationId: LOCATION, supplierName: "Tedarikçi", status: "draft", lines: [{ id: LINE, variantId: VARIANT, orderedQuantity: 2, receivedQuantity: 0, unitCostCents: 100, lineCostCents: 200 }], totalCostCents: 200, version: 1, createdAt: NOW, updatedAt: NOW });
const count = () => ({ id: COUNT, locationId: LOCATION, status: "draft", lines: [{ id: LINE, variantId: VARIANT, expectedQuantity: 7 }], version: 1, createdAt: NOW, updatedAt: NOW });
const transfer = () => ({ id: TRANSFER, sourceLocationId: LOCATION, destinationLocationId: DESTINATION, status: "draft", lines: [{ id: LINE, variantId: VARIANT, quantity: 2 }], version: 1, createdAt: NOW, updatedAt: NOW });
const mutation = () => ({ id: ORDER, status: "draft", version: 1, updatedAt: NOW, replayed: false });

test("inventory client uses exact same-origin no-store requests and puts operation UUIDs only in mutation JSON", async () => {
  const calls: Array<readonly [RequestInfo | URL, RequestInit | undefined]> = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push([input, init]);
    const path = String(input);
    if (init?.method === "POST") return Response.json(mutation());
    if (path === "/api/inventory/locations") return Response.json({ items: [location()] });
    if (path.startsWith("/api/inventory/balances")) return Response.json({ items: [balance()] });
    if (path === "/api/inventory/purchase-orders") return Response.json({ items: [purchase()] });
    if (path === `/api/inventory/purchase-orders/${ORDER}`) return Response.json(purchase());
    if (path === "/api/inventory/counts") return Response.json({ items: [count()] });
    if (path === `/api/inventory/counts/${COUNT}`) return Response.json(count());
    if (path === "/api/inventory/transfers") return Response.json({ items: [transfer()] });
    if (path === `/api/inventory/transfers/${TRANSFER}`) return Response.json(transfer());
    throw new Error("unexpected path");
  };
  const api = createInventoryApi(fetcher, () => OPERATION);
  await api.listLocations();
  await api.listBalances(LOCATION);
  await api.listPurchaseOrders();
  await api.getPurchaseOrder(ORDER);
  await api.savePurchaseOrder({ locationId: LOCATION, supplierName: "Tedarikçi", lines: [{ lineId: LINE, variantId: VARIANT, orderedQuantity: 2, unitCostCents: 100 }] });
  await api.transitionPurchaseOrder(ORDER, { expectedVersion: 1, transition: "order" });
  await api.receivePurchaseOrder(ORDER, { expectedVersion: 1, locationId: LOCATION, lines: [{ lineId: LINE, quantity: 2 }] });
  await api.listCounts();
  await api.getCount(COUNT);
  await api.saveCount({ locationId: LOCATION, lines: [{ lineId: LINE, variantId: VARIANT, countedQuantity: 7 }] });
  await api.startCount(COUNT, 1);
  await api.commitCount(COUNT, 1);
  await api.cancelCount(COUNT, 1);
  await api.listTransfers();
  await api.getTransfer(TRANSFER);
  await api.saveTransfer({ sourceLocationId: LOCATION, destinationLocationId: DESTINATION, lines: [{ lineId: LINE, variantId: VARIANT, quantity: 2 }] });
  await api.dispatchTransfer(TRANSFER, 1);
  await api.receiveTransfer(TRANSFER, 1);
  await api.cancelTransfer(TRANSFER, 1);
  assert.equal(calls.length, 19);
  assert.deepEqual(calls.map((call) => String(call[0])), [
    "/api/inventory/locations", `/api/inventory/balances?locationId=${LOCATION}`,
    "/api/inventory/purchase-orders", `/api/inventory/purchase-orders/${ORDER}`,
    "/api/inventory/purchase-orders", `/api/inventory/purchase-orders/${ORDER}/transition`,
    `/api/inventory/purchase-orders/${ORDER}/receive`, "/api/inventory/counts",
    `/api/inventory/counts/${COUNT}`, "/api/inventory/counts", `/api/inventory/counts/${COUNT}/start`,
    `/api/inventory/counts/${COUNT}/commit`, `/api/inventory/counts/${COUNT}/cancel`,
    "/api/inventory/transfers", `/api/inventory/transfers/${TRANSFER}`, "/api/inventory/transfers",
    `/api/inventory/transfers/${TRANSFER}/dispatch`, `/api/inventory/transfers/${TRANSFER}/receive`,
    `/api/inventory/transfers/${TRANSFER}/cancel`,
  ]);
  for (const [, init] of calls) {
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.cache, "no-store");
    const headers = new Headers(init?.headers);
    for (const forbidden of ["origin", "cookie", "authorization", "x-store-id", "x-celebix-store"]) assert.equal(headers.has(forbidden), false);
    if (init?.method === "POST") {
      assert.equal(headers.get("content-type"), "application/json");
      assert.equal((JSON.parse(String(init.body)) as Record<string, unknown>).operationId, OPERATION);
    }
  }
});

test("inventory client validates IDs and UUID generation before fetch", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls += 1; return Response.json({}); };
  const api = createInventoryApi(fetcher, () => "invalid");
  assert.throws(() => api.getCount("invalid"), /inventory_client_invalid/);
  assert.throws(() => api.startCount(COUNT, 1), /inventory_client_invalid/);
  assert.equal(calls, 0);
});

test("inventory client bounds and fatally decodes exact JSON responses", async () => {
  for (const response of [
    new Response("{}", { status: 200, headers: { "content-type": "text/plain" } }),
    new Response(new Uint8Array([0xc3, 0x28]), { status: 200, headers: { "content-type": "application/json" } }),
    new Response("{}".padEnd(1_048_577, " "), { status: 200, headers: { "content-type": "application/json" } }),
    new Response("{}", { status: 200, headers: { "content-type": "application/json", "content-length": "1" } }),
    Response.json({ items: [{ ...location(), storeId: "private" }] }),
  ]) {
    const api = createInventoryApi(async () => response, () => OPERATION);
    await assert.rejects(
      () => api.listLocations(),
      (error: unknown) => error instanceof InventoryApiError && error.code === "unavailable",
    );
  }
});

test("inventory client accepts only stable error envelopes", async () => {
  const conflict = createInventoryApi(async () => Response.json({ code: "conflict" }, { status: 409 }), () => OPERATION);
  await assert.rejects(
    () => conflict.startCount(COUNT, 1),
    (error: unknown) => error instanceof InventoryApiError && error.code === "conflict" && error.status === 409,
  );
  const hostile = createInventoryApi(async () => Response.json({ code: "SELECT private", storeId: "private" }, { status: 500 }), () => OPERATION);
  await assert.rejects(
    () => hostile.listLocations(),
    (error: unknown) => error instanceof InventoryApiError && error.code === "unavailable" && !error.message.includes("private"),
  );
});
