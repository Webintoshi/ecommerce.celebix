import assert from "node:assert/strict";
import test from "node:test";

import { StorefrontIdentityRepositoryError } from "@celebix/saas-data";

import type { StorefrontIdentityRuntime } from "./runtime.ts";
import { createAccountAuthStartRoute, createAccountAuthVerifyBrowserRoute, createAccountAuthVerifyRoute, createAccountLogoutRoute } from "./route.ts";

const HOST = "identity-a.saas-staging.celebix.site";
const ORIGIN = `https://${HOST}`;
const MAGIC_TICKET = `ch1.seal_01.${"A".repeat(16)}.${"B".repeat(24)}.${"C".repeat(22)}.tk1.${"D".repeat(43)}`;
const authority = () => ({ kind: "trusted" as const, hostname: HOST });
function request(path: string, body: unknown, headers: Record<string, string> = {}) { return new Request(`${ORIGIN}${path}`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers }, body: JSON.stringify(body) }); }
function formRequest(body: URLSearchParams, headers: Record<string, string> = {}, path = "/api/account/auth/verify-browser", requestOrigin = ORIGIN) { return new Request(`${requestOrigin}${path}`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin", ...headers }, body }); }
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

test("browser verify atomically sets every cookie and redirects with 303", async () => {
  let verifyInput: Parameters<StorefrontIdentityRuntime["verify"]>[0] | undefined;
  const route = createAccountAuthVerifyBrowserRoute(deps(runtime({ verify: async (input) => {
    verifyInput = input;
    return { result: { outcome: "authenticated", profileRequired: false }, setCookies: ["__Host-celebix_account=a1.test; Path=/; Secure; HttpOnly; SameSite=Lax", "__Host-celebix_account_csrf=csrf; Path=/; Secure; SameSite=Strict", "__Host-celebix_account_challenge=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax"] };
  } })));
  const response = await route(formRequest(new URLSearchParams({ ticket: MAGIC_TICKET, returnTo: "/checkout" })));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${ORIGIN}/checkout`);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.getSetCookie().length, 3);
  assert.equal("ticket" in verifyInput!, true);
  assert.equal("ticket" in verifyInput! ? verifyInput.ticket : null, MAGIC_TICKET);
});

test("browser verify accepts a challenge-bound code and sends profile-required accounts to profile", async () => {
  let verifyInput: Parameters<StorefrontIdentityRuntime["verify"]>[0] | undefined;
  const route = createAccountAuthVerifyBrowserRoute(deps(runtime({ verify: async (input) => {
    verifyInput = input;
    return { result: { outcome: "profile_required", profileRequired: true }, setCookies: ["__Host-celebix_account=registration.test"] };
  } })));
  const response = await route(formRequest(new URLSearchParams({ code: "042319", returnTo: "/account/orders" }), { cookie: "__Host-celebix_account_challenge=ch1.test" }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${ORIGIN}/account/profile`);
  assert.deepEqual(verifyInput, { hostname: HOST, deviceLabel: "Web tarayıcısı", userAgent: "Bilinmeyen tarayıcı", challengeCookie: "__Host-celebix_account_challenge=ch1.test", code: "042319" });
});

test("browser verify accepts the internal request URL only after the edge-selected public origin matches", async () => {
  const route = createAccountAuthVerifyBrowserRoute(deps(runtime()));
  const response = await route(formRequest(
    new URLSearchParams({ ticket: MAGIC_TICKET, returnTo: "/account" }),
    {},
    "/api/account/auth/verify-browser",
    "http://storefront.internal:3000",
  ));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${ORIGIN}/account`);
});

test("browser verify rejects cross-origin, malformed, ambiguous, and near-match submissions", async () => {
  const route = createAccountAuthVerifyBrowserRoute(deps(runtime()));
  const cases = [
    formRequest(new URLSearchParams({ ticket: MAGIC_TICKET }), { origin: "https://attacker.example" }),
    formRequest(new URLSearchParams({ ticket: MAGIC_TICKET }), { "content-type": "text/plain" }),
    formRequest(new URLSearchParams([["ticket", MAGIC_TICKET], ["ticket", MAGIC_TICKET]])),
    formRequest(new URLSearchParams({ ticket: MAGIC_TICKET, code: "042319" })),
    formRequest(new URLSearchParams({ ticket: MAGIC_TICKET }), {}, "/api/account/auth/verify-browser/"),
  ];
  for (const candidate of cases) {
    const response = await route(candidate);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("location"), null);
    assert.deepEqual(await response.json(), { code: "invalid_input", message: "Bilgileri kontrol edin." });
  }
});

test("logout requires session-bound csrf and always clears identity cookies", async () => {
  const route = createAccountLogoutRoute(deps(runtime()));
  assert.equal((await route(request("/api/account/logout", {}, { cookie: "__Host-celebix_account_csrf=csrf" }))).status, 403);
  const response = await route(request("/api/account/logout", {}, { cookie: "__Host-celebix_account_csrf=csrf", "x-celebix-account-csrf": "csrf" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.getSetCookie().length, 2);
});
