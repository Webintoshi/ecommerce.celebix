import assert from "node:assert/strict";
import test from "node:test";

async function load(relativePath: string) {
  return import(new URL(relativePath, import.meta.url).href).catch(() => ({} as Record<string, unknown>));
}

test("exports the explicit public health route", async () => {
  const route = await load("../app/api/health/route.ts");
  assert.equal(typeof route.GET, "function");
});

test("health output is minimal and contains no configuration or secrets", async () => {
  const route = await load("../app/api/health/route.ts");
  if (typeof route.GET !== "function") return;
  const response = await route.GET();
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body, { status: "ok", service: "customer-panel" });
  for (const prohibited of ["token", "secret", "database", "issuer", "clientId", "environment"]) {
    assert.equal(JSON.stringify(body).toLowerCase().includes(prohibited.toLowerCase()), false);
  }
});

test("unknown route handler returns 401 without a production session store", async () => {
  const route = await load("../app/api/[...path]/route.ts");
  assert.equal(typeof route.GET, "function");
  if (typeof route.GET !== "function") return;
  const response = await route.GET(new Request("https://panel.celebix.site/api/orders"));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { code: "unauthenticated" });
});

test("active-store switch denies an unauthenticated request", async () => {
  const route = await load("../app/api/session/active-store/route.ts");
  assert.equal(typeof route.POST, "function");
  if (typeof route.POST !== "function") return;
  const response = await route.POST(
    new Request("https://panel.celebix.site/api/session/active-store", {
      method: "POST",
      body: JSON.stringify({ storeId: "browser-store" }),
    }),
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { code: "unauthenticated" });
});

test("auth callback fails closed without valid server-side state", async () => {
  const route = await load("../app/auth/callback/route.ts");
  assert.equal(typeof route.GET, "function");
  if (typeof route.GET !== "function") return;
  const response = await route.GET(new Request("https://panel.celebix.site/auth/callback?code=unsafe"));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: "invalid_callback_state" });
});

test("login remains disabled and logout clears only the opaque session cookie", async () => {
  const login = await load("../app/auth/login/route.ts");
  const logout = await load("../app/auth/logout/route.ts");
  assert.equal(typeof login.GET, "function");
  assert.equal(typeof logout.POST, "function");
  if (typeof login.GET !== "function" || typeof logout.POST !== "function") return;

  const loginResponse = await login.GET(new Request("https://panel.celebix.site/auth/login"));
  assert.equal(loginResponse.status, 303);
  assert.equal(loginResponse.headers.get("location"), "https://panel.celebix.site/login?auth=disabled");

  const logoutResponse = await logout.POST(new Request("https://panel.celebix.site/auth/logout", { method: "POST" }));
  assert.equal(logoutResponse.status, 303);
  assert.equal(logoutResponse.headers.get("location"), "https://panel.celebix.site/login");
  const cookie = logoutResponse.headers.get("set-cookie") ?? "";
  assert.match(cookie, /__Host-celebix_panel=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Path=\//i);
  assert.match(cookie, /Max-Age=0/i);
  assert.equal(cookie.toLowerCase().includes("token"), false);
});
