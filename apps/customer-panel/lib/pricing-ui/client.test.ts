import assert from "node:assert/strict";
import test from "node:test";
import type { PriceList } from "@celebix/saas-contracts";
import { createPricingApi, PricingApiError } from "./client.ts";

const ID = "20000000-0000-4000-8000-000000000001";
const VARIANT = "30000000-0000-4000-8000-000000000001";
const OP = "50000000-0000-4000-8000-000000000001";
const NOW = "2026-07-23T12:00:00.000Z";
const list = (status: "draft" | "active" | "archived" = "draft", version = 1): PriceList => ({ id: ID, name: "VIP", status, items: [{ variantId: VARIANT, priceCents: 1000 }], rules: [{ channel: "storefront", startsAt: NOW, priority: 1 }], version, createdAt: NOW, updatedAt: NOW, ...(status === "active" ? { activatedAt: NOW } : {}), ...(status === "archived" ? { archivedAt: NOW } : {}) });

test("pricing client exposes only five finite same-origin operations with one generated operation ID per mutation", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const api = createPricingApi(async (input, init) => { const path = String(input); calls.push([path, init]); if (init?.method !== "POST") return Response.json(path.endsWith(ID) ? list() : { items: [list()] }); if (path.endsWith("activate")) return Response.json(list("active", 2)); if (path.endsWith("archive")) return Response.json(list("archived", 2)); return Response.json(list()); }, () => OP);
  await api.list(); await api.get(ID); await api.save({ name: "VIP", items: list().items, rules: list().rules }); await api.activate(ID, 1); await api.archive(ID, 1);
  assert.deepEqual(calls.map(([path]) => path), ["/api/pricing/price-lists", `/api/pricing/price-lists/${ID}`, "/api/pricing/price-lists", `/api/pricing/price-lists/${ID}/activate`, `/api/pricing/price-lists/${ID}/archive`]);
  for (const [, init] of calls) { assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store"); if (init?.method === "POST") { const body = JSON.parse(String(init.body)); assert.equal(body.operationId, OP); for (const forbidden of ["storeId", "currency", "customerId"]) assert.equal(forbidden in body, false); } }
});

test("pricing client rejects hostile inputs and malformed responses before authority can be confused", async () => {
  let calls = 0; const api = createPricingApi(async () => { calls += 1; return Response.json({ ...list(), storeId: "private" }); }, () => OP);
  assert.throws(() => api.get("invalid"), /pricing_client_invalid/);
  assert.throws(() => api.save({ name: "VIP", items: list().items, rules: list().rules, currency: "TRY" } as never), /pricing_client_invalid/);
  await assert.rejects(() => api.get(ID), (error: unknown) => error instanceof PricingApiError && error.code === "unavailable");
  assert.equal(calls, 1);
});

test("pricing client bounds exact JSON and maps only stable errors", async () => {
  for (const response of [new Response("{}", { headers: { "content-type": "text/plain" } }), new Response(new Uint8Array([0xc3, 0x28]), { headers: { "content-type": "application/json" } }), Response.json({ code: "private", detail: "sql" }, { status: 500 })]) {
    await assert.rejects(() => createPricingApi(async () => response, () => OP).list(), (error: unknown) => error instanceof PricingApiError && error.code === "unavailable");
  }
  await assert.rejects(() => createPricingApi(async () => Response.json({ code: "conflict" }, { status: 409 }), () => OP).activate(ID, 1), (error: unknown) => error instanceof PricingApiError && error.code === "conflict" && error.status === 409);
});
