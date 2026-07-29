import assert from "node:assert/strict";
import test from "node:test";

type InputModule = typeof import("./request-input.ts");

const inputs = await import("./request-input.ts").catch(
  () => ({} as Partial<InputModule>),
);

const STORE_ID = "10000000-0000-4000-8000-000000000001";
const CREDENTIAL = `v1.panel.active.${Buffer.alloc(32, 0x55).toString("base64url")}`;

function jsonRequest(body: string, headers: HeadersInit = {}) {
  return new Request("https://internal/api/session/active-store", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

test("parses only the exact bounded active-store JSON contract", async () => {
  assert.equal(typeof inputs.parseActiveStoreSelectionRequest, "function");
  assert.deepEqual(
    await inputs.parseActiveStoreSelectionRequest?.(jsonRequest(`{"storeId":"${STORE_ID}"}`)),
    { kind: "valid", storeId: STORE_ID },
  );
  for (const request of [
    jsonRequest(`{"storeId":"${STORE_ID}","operationId":"10000000-0000-4000-8000-000000000002"}`),
    jsonRequest(`{"storeId":"${STORE_ID}","storeId":"${STORE_ID}"}`),
    jsonRequest(`{"storeId":" ${STORE_ID}"}`),
    jsonRequest(`{"storeId":1}`),
    jsonRequest("[]"),
    jsonRequest(`{"credential":"${CREDENTIAL}"}`),
    jsonRequest("{malformed"),
    jsonRequest(`{"storeId":"${STORE_ID}"}`, { "content-type": "application/json; charset=utf-8" }),
    jsonRequest(`{"storeId":"${STORE_ID}"}`, { "content-type": "text/json" }),
    jsonRequest(`{"storeId":"${STORE_ID}","padding":"${"x".repeat(300)}"}`),
  ]) assert.deepEqual(await inputs.parseActiveStoreSelectionRequest?.(request), { kind: "invalid" });
});

test("parses only the canonical empty JSON logout body", async () => {
  assert.equal(typeof inputs.parsePanelSessionLogoutRequest, "function");
  assert.deepEqual(await inputs.parsePanelSessionLogoutRequest?.(jsonRequest("{}")), { kind: "valid" });
  for (const request of [
    jsonRequest(`{"scope":"family"}`),
    jsonRequest(`{"credential":"${CREDENTIAL}"}`),
    jsonRequest(""),
    new Request("https://internal/api/session/logout", { method: "POST" }),
  ]) assert.deepEqual(await inputs.parsePanelSessionLogoutRequest?.(request), { kind: "invalid" });
});

test("reads only one exact canonical persistent panel cookie", () => {
  assert.equal(typeof inputs.readPersistentPanelSessionCookie, "function");
  const read = (cookie: string | null) => inputs.readPersistentPanelSessionCookie?.(
    new Request("https://internal/api/session/active-store", {
      headers: cookie === null ? {} : { cookie },
    }),
  );
  assert.deepEqual(read(`__Host-celebix_panel=${CREDENTIAL}`), { kind: "present", credential: CREDENTIAL });
  assert.deepEqual(read(`other=1; __Host-celebix_panel=${CREDENTIAL}`), { kind: "present", credential: CREDENTIAL });
  assert.deepEqual(read(null), { kind: "missing" });
  assert.deepEqual(read("sb-owner-auth-token=owner-only"), { kind: "missing" });
  for (const cookie of [
    `__Host-celebix_panel=${CREDENTIAL}; __Host-celebix_panel=${CREDENTIAL}`,
    `__Host-celebix_panel=${CREDENTIAL.slice(0, -1)} ${CREDENTIAL.slice(-1)}`,
    "__Host-celebix_panel=v1.bad",
    `__Host-celebix_panel=\"${CREDENTIAL}\"`,
  ]) assert.deepEqual(read(cookie), { kind: "invalid" });
});
