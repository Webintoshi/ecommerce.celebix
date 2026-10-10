import assert from "node:assert/strict";
import test from "node:test";
import { createLuckyWheelRoutes } from "./route.ts";
import { createLuckyWheelRuntime } from "./runtime.ts";
import { wheelAward, wheelCampaign, wheelCommand, WHEEL_CAMPAIGN_ID, WHEEL_OPERATION_ID } from "./test-utils.ts";

const HOST = "store.example", TOKEN = Buffer.alloc(32, 17).toString("base64url"), NOW = new Date("2026-10-10T12:00:00Z");
function fixture(closed = false) {
  const spins: unknown[] = [], results: unknown[] = [];
  const runtime = createLuckyWheelRuntime({ repository: { publicSettings: async () => ({ campaign: closed ? null : wheelCampaign() }), spin: async input => { spins.push(input); return wheelAward; }, result: async input => { results.push(input); return wheelAward; } }, randomBytes: size => new Uint8Array(size).fill(17), now: () => NOW });
  return { spins, results, runtime, routes: createLuckyWheelRoutes({ selectAuthority: () => ({ kind: "trusted", hostname: HOST }), resolveRuntime: async () => runtime, allowSpin: () => true }) };
}
function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://internal:3450${path}`, { method: body ? "POST" : "GET", headers: { ...(body ? { origin: `https://${HOST}`, "content-type": "application/json", "idempotency-key": WHEEL_OPERATION_ID } : {}), cookie: `__Host-celebix_wheel=${TOKEN}`, ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
test("settings provisions visitor independently of cart before spin and returns public campaign only", async () => {
  const h = fixture(); const response = await h.routes.settings(new Request("http://internal/api/lucky-wheel/settings"));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { campaign: wheelCampaign() });
  assert.match(response.headers.get("set-cookie") ?? "", /^__Host-celebix_wheel=/);
  assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly; Secure; SameSite=Lax/);
});
test("spin commits contact and consent with server digest then returns only its award", async () => {
  const h = fixture(), response = await h.routes.spin(request("/api/lucky-wheel/spin", wheelCommand));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), wheelAward);
  const input = h.spins[0] as Record<string, unknown>; assert.equal(input.hostname, HOST); assert.equal(input.marketingConsent, false); assert.match(String(input.visitorDigest), /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(input).includes(TOKEN), false); assert.equal(Object.hasOwn(input, "storeId"), false);
  assert.match(response.headers.get("set-cookie") ?? "", /__Host-celebix_wheel_operation=/);
});
test("origin authority source cookie and body limits fail before any award", async () => {
  for (const selected of [request("/api/lucky-wheel/spin", wheelCommand, { origin: "https://evil.example" }), request("/api/lucky-wheel/spin", { ...wheelCommand, source: "wheel" }), request("/api/lucky-wheel/spin", { ...wheelCommand, storeId: WHEEL_CAMPAIGN_ID }), request("/api/lucky-wheel/spin", wheelCommand, { "x-customer-id": WHEEL_CAMPAIGN_ID }), request("/api/lucky-wheel/spin", wheelCommand, { cookie: "" }), request("/api/lucky-wheel/spin", wheelCommand, { cookie: `__Host-celebix_wheel=${TOKEN}; __Host-celebix_wheel=${TOKEN}` }), request("/api/lucky-wheel/spin", wheelCommand, { "idempotency-key": WHEEL_CAMPAIGN_ID }), request("/api/lucky-wheel/spin", { ...wheelCommand, email: "a".repeat(3000) })]) { const h = fixture(); assert.ok([400, 403].includes((await h.routes.spin(selected)).status)); assert.equal(h.spins.length, 0); }
  const h = fixture(); assert.equal((await h.routes.spin(request("/api/lucky-wheel/spin", wheelCommand, { "transfer-encoding": "chunked" }))).status, 400);
});
test("result recovers only scoped visitor and operation; never by contact", async () => {
  const h = fixture(); assert.equal((await h.routes.result(request(`/api/lucky-wheel/result?campaignId=${WHEEL_CAMPAIGN_ID}&operationId=${WHEEL_OPERATION_ID}`))).status, 200);
  assert.equal((h.results[0] as Record<string, unknown>).operationId, WHEEL_OPERATION_ID);
  assert.equal((await h.routes.result(request(`/api/lucky-wheel/result?email=ada@example.test`))).status, 400);
  assert.equal(h.results.length, 1);
  assert.equal(await h.runtime.pendingCoupon(HOST, `__Host-celebix_wheel=${TOKEN}; __Host-celebix_wheel_operation=${WHEEL_CAMPAIGN_ID}.${WHEEL_OPERATION_ID}`), wheelAward.couponCode);
});
test("used revoked expired and out-of-time awards never retain a rejected coupon", async () => {
  for (const status of ["used", "revoked", "expired", "active"] as const) {
    const runtime = createLuckyWheelRuntime({ now: () => status === "active" ? new Date(wheelAward.expiresAt) : NOW, randomBytes: size => new Uint8Array(size), repository: { publicSettings: async () => ({ campaign: null }), spin: async () => wheelAward, result: async () => ({ ...wheelAward, couponStatus: status }) } });
    assert.equal(await runtime.pendingCoupon(HOST, `__Host-celebix_wheel=${TOKEN}; __Host-celebix_wheel_operation=${WHEEL_CAMPAIGN_ID}.${WHEEL_OPERATION_ID}`), null);
  }
});
test("disabled and untrusted storefronts cannot provision a visitor or award", async () => {
  const h = fixture(), routes = createLuckyWheelRoutes({ selectAuthority: () => ({ kind: "disabled" }), resolveRuntime: async () => h.runtime });
  const response = await routes.spin(request("/api/lucky-wheel/spin", wheelCommand)); assert.equal(response.status, 503); assert.equal(response.headers.get("set-cookie"), null); assert.deepEqual(h.spins, []);
  const runtime = createLuckyWheelRuntime({ now: () => NOW, randomBytes: () => { throw Error("must not mint cookie"); }, repository: { publicSettings: async () => ({ campaign: null }), spin: async () => wheelAward, result: async () => null } });
  assert.deepEqual(await runtime.publicSettings(HOST, null), { settings: { campaign: null }, setCookie: null });
});
test("malformed persisted output is unavailable and preserves uncertain operation semantics", async () => {
  const runtime = createLuckyWheelRuntime({ now: () => NOW, randomBytes: size => new Uint8Array(size), repository: { publicSettings: async () => ({ campaign: null }), spin: async () => ({ ...wheelAward, email: "private@example.test" }), result: async () => wheelAward } });
  const routes = createLuckyWheelRoutes({ selectAuthority: () => ({ kind: "trusted", hostname: HOST }), resolveRuntime: async () => runtime });
  const response = await routes.spin(request("/api/lucky-wheel/spin", wheelCommand));
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { code: "unavailable" });
});
test("queryless recovery reads only trusted operation cookie and visitor even when settings is unavailable", async () => {
  const h = fixture(true); assert.deepEqual(await (await h.routes.settings(request("/api/lucky-wheel/settings"))).json(), { campaign: null }); const response = await h.routes.result(request("/api/lucky-wheel/result", undefined, { cookie: `__Host-celebix_wheel=${TOKEN}; __Host-celebix_wheel_operation=${WHEEL_CAMPAIGN_ID}.${WHEEL_OPERATION_ID}` }));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), wheelAward); assert.equal(h.results.length, 1); assert.equal((h.results[0] as Record<string, unknown>).operationId, WHEEL_OPERATION_ID);
  const empty = fixture(); const absent = await empty.routes.result(request("/api/lucky-wheel/result")); assert.equal(absent.status, 200); assert.equal(await absent.json(), null); assert.deepEqual(empty.results, []);
});
