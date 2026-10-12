import assert from "node:assert/strict";
import test from "node:test";
import { createOrderApiClient } from "./client.ts";

test("order client sends sale channel and platform as server query filters and retains V2 negotiation", async () => {
  const calls: [string, RequestInit | undefined][] = [];
  const api = createOrderApiClient({ ordersVersion: 2, fetch: async (path, init) => { calls.push([String(path), init]); return Response.json({ items: [] }); } });
  await api.listOrders({ pageSize: 25, salesChannel: "social", socialPlatform: "instagram", sort: "oldest", search: "Ada" } as never);
  const [url, init] = calls[0]!;
  assert.equal(url, "/api/orders?pageSize=25&search=Ada&sort=oldest&salesChannel=social&socialPlatform=instagram");
  assert.equal(new Headers(init?.headers).get("X-Celebix-Orders-Version"), "2");
  assert.equal(init?.credentials, "same-origin");
  assert.equal(init?.cache, "no-store");
  await api.listOrders();
  assert.equal(calls[1]?.[0], "/api/orders?pageSize=20&sort=newest");
});

test("order client refuses invalid or unscoped platforms before any request", async () => {
  let calls = 0;
  const api = createOrderApiClient({ fetch: async () => { calls++; return Response.json({ items: [] }); } });
  for (const input of [{ socialPlatform: "instagram" }, { salesChannel: "manual", socialPlatform: "instagram" }, { salesChannel: "social", socialPlatform: "unknown" }, { salesChannel: "all" }]) {
    await assert.rejects(api.listOrders(input as never), { name: "TypeError", message: "order_client_invalid" });
  }
  assert.equal(calls, 0);
});
