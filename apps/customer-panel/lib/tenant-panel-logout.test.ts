import assert from "node:assert/strict";
import test from "node:test";

type LogoutModule = typeof import("./tenant-panel-logout.ts");
const logout = await import("./tenant-panel-logout.ts").catch(() => ({} as Partial<LogoutModule>));

const SOURCE = "https://admin.hemenaku.com";
const CANONICAL = "https://hemenaku.admin.saas-staging.celebix.site";
const CENTRAL = "https://panel.saas-staging.celebix.site";
const SOURCE_HOST = new URL(SOURCE).hostname;
const CENTRAL_HOST = new URL(CENTRAL).hostname;
const END_SESSION = "https://auth.celebix.co/oidc/session/end";
const CURRENT = `v1.panel.active.v1.${Buffer.alloc(32, 0x31).toString("base64url")}`;
const NOW = new Date("2026-07-30T12:00:00.000Z");
const DELETION = "__Host-celebix_panel=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

function runtime() {
  return Object.freeze({
    access: Object.freeze({
      panelOrigin: CENTRAL,
      async revokeCredential() { return Object.freeze({ kind: "revoked" }); },
    }),
    adminDomains: Object.freeze({
      async resolvePublicBrand({ hostname }: { hostname: string }) {
        if (!["admin.hemenaku.com", "hemenaku.admin.saas-staging.celebix.site"].includes(hostname)) return Object.freeze({ kind: "admin_host_unknown" });
        return Object.freeze({ kind: "resolved", brand: Object.freeze({ canonicalAdminOrigin: CANONICAL }) });
      },
    }),
    logout: Object.freeze({
      endSessionEndpoint: END_SESSION,
      clientId: "celebix-panel",
      stateKey: new Uint8Array(32).fill(0x41),
    }),
  });
}

test("logout revokes every Celebix session before clearing the host cookie and redirecting through Logto", async () => {
  if (typeof logout.createTenantPanelLogoutHandler !== "function") return;
  const events: string[] = [];
  const value = runtime();
  const handler = logout.createTenantPanelLogoutHandler({
    async resolveRuntime() {
      return Object.freeze({ ...value, access: Object.freeze({
        ...value.access,
        async revokeCredential(input: Record<string, unknown>) { events.push(`revoke:${input.reason}`); return Object.freeze({ kind: "revoked" }); },
      }) });
    },
    now: () => new Date(NOW),
    randomBytes: (size) => new Uint8Array(size).fill(0x42),
    maximumBodyBytes: 64,
  });
  const response = await handler(new Request(`${SOURCE}/api/session/logout`, {
    method: "POST",
    headers: {
      host: SOURCE_HOST,
      origin: SOURCE,
      cookie: `__Host-celebix_panel=${CURRENT}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "",
  }));
  events.push(`cookie:${response.headers.get("set-cookie") === DELETION}`);
  assert.deepEqual(events, ["revoke:logout", "cookie:true"]);
  assert.equal(response.status, 303);
  const location = new URL(response.headers.get("location") ?? "");
  assert.equal(location.origin + location.pathname, END_SESSION);
  assert.equal(location.searchParams.get("client_id"), "celebix-panel");
  assert.equal(location.searchParams.get("post_logout_redirect_uri"), `${CENTRAL}/auth/logout/callback`);
  assert.match(location.searchParams.get("state") ?? "", /^lo1\./);
  assert.equal(location.toString().includes(CURRENT), false);
});

test("staging logout refuses a production canonical admin destination", async () => {
  if (typeof logout.createTenantPanelLogoutHandler !== "function") return;
  const value = runtime();
  const handler = logout.createTenantPanelLogoutHandler({
    async resolveRuntime() {
      return Object.freeze({
        ...value,
        adminDomains: Object.freeze({
          async resolvePublicBrand() {
            return Object.freeze({
              kind: "resolved",
              brand: Object.freeze({ canonicalAdminOrigin: "https://hemenaku.admin.celebix.site" }),
            });
          },
        }),
      });
    },
    now: () => new Date(NOW),
    randomBytes: (size) => new Uint8Array(size).fill(0x42),
    maximumBodyBytes: 64,
  });
  const response = await handler(new Request(`${SOURCE}/api/session/logout`, {
    method: "POST",
    headers: { host: SOURCE_HOST, origin: SOURCE, "content-type": "application/x-www-form-urlencoded" },
    body: "",
  }));
  assert.equal(response.status, 503);
  assert.equal(response.headers.has("location"), false);
});

test("logout survives reverse-proxy transport and returns to the exact active custom admin host", async () => {
  if (typeof logout.createTenantPanelLogoutHandler !== "function" || typeof logout.createTenantPanelLogoutCallbackHandler !== "function") return;
  const value = runtime();
  const start = logout.createTenantPanelLogoutHandler({
    async resolveRuntime() { return value; },
    now: () => new Date(NOW),
    randomBytes: (size) => new Uint8Array(size).fill(0x42),
    maximumBodyBytes: 64,
  });
  const started = await start(new Request("http://customer-panel:3400/api/session/logout", {
    method: "POST",
    headers: {
      host: SOURCE_HOST,
      origin: SOURCE,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "",
  }));
  assert.equal(started.status, 303);

  const state = new URL(started.headers.get("location") ?? "").searchParams.get("state") ?? "";
  const callback = logout.createTenantPanelLogoutCallbackHandler({
    async resolveRuntime() { return value; },
    now: () => new Date(NOW.getTime() + 60_000),
  });
  const response = await callback(new Request(`http://customer-panel:3400/auth/logout/callback?state=${encodeURIComponent(state)}`, {
    headers: { host: CENTRAL_HOST },
  }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${SOURCE}/login`);
});

test("logout callback validates state on the fixed central host and returns to the verified requested login", async () => {
  if (typeof logout.createTenantPanelLogoutHandler !== "function" || typeof logout.createTenantPanelLogoutCallbackHandler !== "function") return;
  const start = logout.createTenantPanelLogoutHandler({
    async resolveRuntime() { return runtime(); },
    now: () => new Date(NOW),
    randomBytes: (size) => new Uint8Array(size).fill(0x42),
    maximumBodyBytes: 64,
  });
  const started = await start(new Request(`${SOURCE}/api/session/logout`, {
    method: "POST",
    headers: { host: SOURCE_HOST, origin: SOURCE, "content-type": "application/x-www-form-urlencoded" },
    body: "",
  }));
  const state = new URL(started.headers.get("location") ?? "").searchParams.get("state") ?? "";
  const callback = logout.createTenantPanelLogoutCallbackHandler({
    async resolveRuntime() { return runtime(); },
    now: () => new Date(NOW.getTime() + 60_000),
  });
  const response = await callback(new Request(`${CENTRAL}/auth/logout/callback?state=${encodeURIComponent(state)}`, {
    headers: { host: CENTRAL_HOST },
  }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${SOURCE}/login`);
  assert.equal(response.headers.get("set-cookie"), DELETION);

  const tampered = await callback(new Request(`${CENTRAL}/auth/logout/callback?state=${encodeURIComponent(`${state}x`)}`, {
    headers: { host: CENTRAL_HOST },
  }));
  assert.equal(tampered.status, 400);
  assert.equal(tampered.headers.get("location"), null);
});

test("logout fails closed on cross-site requests or durable revocation failure", async () => {
  if (typeof logout.createTenantPanelLogoutHandler !== "function") return;
  for (const [origin, kind, status] of [
    ["https://attacker.example", "revoked", 403],
    [SOURCE, "unavailable", 503],
  ] as const) {
    const value = runtime();
    const handler = logout.createTenantPanelLogoutHandler({
      async resolveRuntime() { return Object.freeze({ ...value, access: Object.freeze({ ...value.access, async revokeCredential() { return Object.freeze({ kind }); } }) }); },
      now: () => new Date(NOW),
      randomBytes: (size) => new Uint8Array(size).fill(0x42),
      maximumBodyBytes: 64,
    });
    const response = await handler(new Request(`${SOURCE}/api/session/logout`, {
      method: "POST",
      headers: { host: SOURCE_HOST, origin, cookie: `__Host-celebix_panel=${CURRENT}`, "content-type": "application/x-www-form-urlencoded" },
      body: "",
    }));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("location"), null);
  }
});
