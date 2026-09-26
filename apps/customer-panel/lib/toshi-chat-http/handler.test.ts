import assert from "node:assert/strict";
import test from "node:test";
import { createToshiChatHttpHandlers } from "./handler.ts";
const ID = "72000000-0000-4000-8000-000000000001", NOW = new Date("2026-09-26T12:00:00.000Z");
const ORIGIN = "https://panel.saas-staging.celebix.site", STORE_ORIGIN = "https://fixture.admin.saas-staging.celebix.site";
const COOKIE = `v1.panel.current.${Buffer.alloc(32, 1).toString("base64url")}`;
const summary = { id: ID, title: "Yardım", provider: "deepseek", model: "deepseek-flash", version: 1, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };
const conversation = { ...summary, messages: [{ id: ID, role: "assistant", text: "Merhaba", createdAt: NOW.toISOString(), sources: [] }] };
function fixture(role = "store_owner", error?: unknown) {
  const calls: any[] = [];
  const handlers = createToshiChatHttpHandlers({
    async resolveRuntime() { return { access: { readiness: { mode: "approved_staging" }, panelOrigin: ORIGIN, async resolveCredential() { return { kind: "authenticated", tenantContext: { store: { id: ID, slug: "fixture", status: "active" }, membership: { role, status: "active" } } }; } },
      service: { async list(input: unknown) { calls.push(input); return { conversations: [summary], defaultProvider: { provider: "deepseek", model: "deepseek-flash" } }; }, async get(input: unknown) { calls.push(input); return conversation; }, async send(input: unknown) { calls.push(input); if (error) throw error; return conversation; } },
    } as any; }, now: () => NOW, requestId: () => ID,
  }); return { handlers, calls };
}
function req(value: unknown = { conversationId: null, expectedVersion: null, text: "Merhaba" }, headers: HeadersInit = {}, path = "/api/toshi/messages", method = "POST") {
  return new Request(`http://customer-panel:3400${path}`, { method, headers: { cookie: `__Host-celebix_panel=${COOKIE}`, origin: STORE_ORIGIN, "content-type": "application/json", "idempotency-key": ID, ...Object.fromEntries(new Headers(headers)) }, ...(method === "POST" ? { body: JSON.stringify(value) } : {}) });
}
test("authenticated tenant origin can chat using read authority and only code/public data is returned", async () => {
  const f = fixture("analyst"), response = await f.handlers.send(req());
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { conversation }); assert.equal(f.calls[0].tenantContext.store.id, ID);
});
test("cross origin, authority headers, missing cookie and cashier fail before generating", async () => {
  for (const [headers, status] of [[{ origin: "https://evil.test" }, 403], [{ "x-store-id": ID }, 400], [{ authorization: "Bearer forged" }, 400], [{ cookie: "" }, 401]] as const) {
    const f = fixture(); assert.equal((await f.handlers.send(req(undefined, headers))).status, status); assert.equal(f.calls.length, 0);
  }
  const cashier = fixture("cashier"); assert.equal((await cashier.handlers.send(req())).status, 403); assert.equal(cashier.calls.length, 0);
});
test("client cannot provide system history tenant tools secret or oversized input", async () => {
  for (const value of [ { conversationId: null, expectedVersion: null, text: "hi", storeId: ID }, { conversationId: null, expectedVersion: null, text: "hi", history: [] }, { conversationId: ID, expectedVersion: null, text: "hi" }, { conversationId: null, expectedVersion: 0, text: "hi" }, { conversationId: null, expectedVersion: null, text: "a".repeat(4001) }, { conversationId: null, expectedVersion: null, text: "bad\u0000" } ]) {
    const f = fixture(); assert.equal((await f.handlers.send(req(value))).status, 400); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); assert.equal((await f.handlers.send(req(undefined, { "idempotency-key": "not-uuid" }))).status, 400);
});
test("public error is bounded and does not expose raw provider/database failure", async () => {
  const f = fixture("store_owner", Object.assign(Error("SECRET_RESPONSE"), { code: "quota_exceeded" }));
  const response = await f.handlers.send(req()); assert.equal(response.status, 429); assert.deepEqual(await response.json(), { code: "quota_exceeded" });
  const unknown = fixture("store_owner", Error("DATABASE_PASSWORD")); assert.deepEqual(await (await unknown.handlers.send(req())).json(), { code: "unavailable" });
});
test("history endpoints reject query authority and unscoped conversation ids", async () => {
  const f = fixture(); assert.equal((await f.handlers.list(req(undefined, {}, "/api/toshi/conversations?storeId=other", "GET"))).status, 400);
  assert.equal((await f.handlers.get(req(undefined, {}, "/api/toshi/conversations/nope", "GET"), { params: Promise.resolve({ conversationId: "nope" }) })).status, 400);
  assert.equal((await f.handlers.list(req(undefined, {}, "/api/toshi/conversations", "GET"))).status, 200);
});
