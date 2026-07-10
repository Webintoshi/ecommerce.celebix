import assert from "node:assert/strict";
import test from "node:test";

type ApiSecurityModule = typeof import("./api-security");
const security = await import(new URL("./api-security.ts", import.meta.url).href).catch(
  () => ({} as Partial<ApiSecurityModule>),
);

test("exports a deny-by-default panel API handler", () => {
  assert.equal(typeof security.createDenyByDefaultPanelApiHandler, "function");
});

test("unauthenticated API requests return 401", async () => {
  if (!security.createDenyByDefaultPanelApiHandler) return;
  const handler = security.createDenyByDefaultPanelApiHandler({ resolveSession: async () => null });
  const response = await handler(new Request("https://panel.celebix.site/api/private"));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { code: "unauthenticated" });
});

test("unknown API routes remain forbidden even with a valid session", async () => {
  if (!security.createDenyByDefaultPanelApiHandler) return;
  const handler = security.createDenyByDefaultPanelApiHandler({
    resolveSession: async () => ({ id: "session_opaque" }),
  });
  const response = await handler(new Request("https://panel.celebix.site/api/unknown"));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { code: "panel_api_denied" });
});

test("order and analytics-like paths are not exposed by the catch-all API", async () => {
  if (!security.createDenyByDefaultPanelApiHandler) return;
  const handler = security.createDenyByDefaultPanelApiHandler({
    resolveSession: async () => ({ id: "session_opaque" }),
  });

  for (const path of ["orders", "analytics", "admin/orders", "admin/analytics"]) {
    const response = await handler(new Request(`https://panel.celebix.site/api/${path}`));
    assert.equal(response.status, 403);
  }
});

test("error output never includes session or provider material", async () => {
  if (!security.createDenyByDefaultPanelApiHandler) return;
  const handler = security.createDenyByDefaultPanelApiHandler({
    resolveSession: async () => ({ id: "opaque-session-id", accessToken: "provider-token" }),
  });
  const response = await handler(new Request("https://panel.celebix.site/api/private"));
  const body = JSON.stringify(await response.json());
  assert.equal(body.includes("opaque-session-id"), false);
  assert.equal(body.includes("provider-token"), false);
});
