import assert from "node:assert/strict";
import test from "node:test";

import { StorefrontIdentityRepositoryError } from "@celebix/saas-data";

import type { StorefrontIdentityRuntime } from "./runtime.ts";
import { createAccountAuthStartRoute, createAccountAuthVerifyRoute, createAccountLogoutRoute } from "./route.ts";

const HOST = "identity-a.saas-staging.celebix.site";
const ORIGIN = `https://${HOST}`;
const MAGIC_TICKET = `ch1.seal_01.${"A".repeat(16)}.${"B".repeat(24)}.${"C".repeat(22)}.tk1.${"D".repeat(43)}`;
const authority = () => ({ kind: "trusted" as const, hostname: HOST });
function request(path: string, body: unknown, headers: Record<string, string> = {}) { return new Request(`${ORIGIN}${path}`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers }, body: JSON.stringify(body) }); }
function runtime(overrides: Partial<StorefrontIdentityRuntime> = {}): StorefrontIdentityRuntime {
  return {
    start: async () => ({ result: { outcome: "accepted", retryAfterSeconds: 60 }, setCookie: "__Host-celebix_account_challenge=ch1.test" }),
    verify: async () => ({ result: { outcome: "authenticated", profileRequired: false }, setCookies: ["__Host-celebix_account=a1.test", "__Host-celebix_account_csrf=csrf"] }),
    completeProfile: async () => { throw new Error("unused"); }, session: async () => ({ outcome: "unauthenticated" }),
    logout: async () => ({ setCookies: ["__Host-celebix_account=; Max-Age=0", "__Host-celebix_account_csrf=; Max-Age=0"] }),
    logoutAll: async () => ({ revoked: 0, setCookies: [] }), updateProfile: async () => { throw new Error("unused"); }, saveAddress: async () => { throw new Error("unused"); }, deleteAddress: async () => { throw new Error("unused"); }, favorite: async () => { throw new Error("unused"); }, orders: async () => [], order: async () => { throw new Error("unused"); }, devices: async () => [], revokeDevice: async () => { throw new Error("unused"); }, ...overrides,
  };
}
const deps = (selected: StorefrontIdentityRuntime) => ({ selectAuthority: authority, resolveRuntime: async () => selected, resolveBrand: async () => ({ storeName: "Güzide", logoUrl: null, primaryColor: "#FF5A00" }), requestAuthority: () => "client-bucket" });

test("auth start validates exact origin and emits only enumeration-safe output", async () => {
  let startInput: Parameters<StorefrontIdentityRuntime["start"]>[0] | undefined;
  const response = await createAccountAuthStartRoute(deps(runtime({ start: async (input) => { startInput = input; return { result: { outcome: "accepted", retryAfterSeconds: 60 }, setCookie: "__Host-celebix_account_challenge=ch1.test" }; } })))(request("/api/account/auth/start", { email: "ada@example.test", returnTo: "/account/orders" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { outcome: "accepted", retryAfterSeconds: 60, message: "Giriş bağlantısı gönderildi. Gelen kutunuzu kontrol edin.", returnTo: "/account/orders" });
  assert.equal(startInput?.returnTo, "/account/orders");
  assert.match(response.headers.get("set-cookie") ?? "", /^__Host-celebix_account_challenge=/u);
  const hostile = await createAccountAuthStartRoute(deps(runtime()))(request("/api/account/auth/start", { email: "ada@example.test", storeId: "hostile" }));
  assert.equal(hostile.status, 400);
});

test("verify accepts exactly one ticket or fallback code and appends every cookie", async () => {
  let verifyInput: Parameters<StorefrontIdentityRuntime["verify"]>[0] | undefined;
  const selected = runtime({ verify: async () => { throw new StorefrontIdentityRepositoryError("challenge_invalid"); } });
  const failed = await createAccountAuthVerifyRoute(deps(selected))(request("/api/account/auth/verify", { code: "000000", returnTo: "/account" }, { cookie: "__Host-celebix_account_challenge=ch1.test" }));
  assert.equal(failed.status, 401);
  assert.deepEqual(await failed.json(), { code: "challenge_invalid", message: "Bağlantı veya kod geçersiz ya da süresi dolmuş." });
  const success = await createAccountAuthVerifyRoute(deps(runtime({ verify: async (input) => { verifyInput = input; return { result: { outcome: "authenticated", profileRequired: false }, setCookies: ["__Host-celebix_account=a1.test", "__Host-celebix_account_csrf=csrf"] }; } })))(request("/api/account/auth/verify", { ticket: MAGIC_TICKET, returnTo: "/checkout" }));
  assert.equal(success.status, 200);
  assert.equal(success.headers.getSetCookie().length, 2);
  assert.deepEqual(await success.json(), { outcome: "authenticated", profileRequired: false, destination: "/checkout" });
  assert.equal("ticket" in verifyInput!, true);
  assert.equal("ticket" in verifyInput! ? verifyInput.ticket : null, MAGIC_TICKET);

  const route = createAccountAuthVerifyRoute(deps(runtime()));
  assert.equal((await route(request("/api/account/auth/verify", { returnTo: "/account" }))).status, 400);
  assert.equal((await route(request("/api/account/auth/verify", { ticket: MAGIC_TICKET, code: "042319", returnTo: "/account" }))).status, 400);
});

test("logout requires session-bound csrf and always clears identity cookies", async () => {
  const route = createAccountLogoutRoute(deps(runtime()));
  assert.equal((await route(request("/api/account/logout", {}, { cookie: "__Host-celebix_account_csrf=csrf" }))).status, 403);
  const response = await route(request("/api/account/logout", {}, { cookie: "__Host-celebix_account_csrf=csrf", "x-celebix-account-csrf": "csrf" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.getSetCookie().length, 2);
});
