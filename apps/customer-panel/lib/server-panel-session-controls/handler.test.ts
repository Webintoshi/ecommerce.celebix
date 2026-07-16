import assert from "node:assert/strict";
import test from "node:test";

type HandlerModule = typeof import("./handler.ts");
type Runtime = import("../server-panel-access/runtime.ts").ServerPanelAccessRuntime;

const handlers = await import("./handler.ts").catch(
  () => ({} as Partial<HandlerModule>),
);

const PANEL_ORIGIN = "https://panel.saas-staging.celebix.site";
const ACTIVE_STORE_PATH = "/api/session/active-store";
const LOGOUT_PATH = "/api/session/logout";
const STORE_ID = "10000000-0000-4000-8000-000000000001";
const OPERATION_ID = "20000000-0000-4000-8000-000000000002";
const CURRENT = `v1.panel.current.${Buffer.alloc(32, 0x31).toString("base64url")}`;
const NEXT = `v1.panel.next.${Buffer.alloc(32, 0x32).toString("base64url")}`;
const REPLACEMENT = `__Host-celebix_panel=${NEXT}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600`;
const DELETION = "__Host-celebix_panel=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
const NOW = new Date("2026-07-16T10:00:00.000Z");

function runtime(overrides: Partial<Runtime> = {}): Runtime {
  return Object.freeze({
    readiness: Object.freeze({ mode: "approved_staging" as const }),
    panelOrigin: PANEL_ORIGIN,
    async resolveCredential() { return Object.freeze({ kind: "unauthenticated" as const }); },
    async rotateCredential() { return Object.freeze({ kind: "unavailable" as const }); },
    async revokeCredential() { return Object.freeze({ kind: "unavailable" as const }); },
    ...overrides,
  });
}

function activeStoreRequest(options: {
  url?: string;
  method?: string;
  origin?: string | null;
  body?: string;
  cookie?: string | null;
  headers?: HeadersInit;
} = {}) {
  const headers = new Headers({ "content-type": "application/json", ...(options.headers ?? {}) });
  if (options.origin !== null) headers.set("origin", options.origin ?? PANEL_ORIGIN);
  if (options.cookie !== null) headers.set("cookie", options.cookie ?? `__Host-celebix_panel=${CURRENT}`);
  return new Request(options.url ?? `http://customer-panel:3400${ACTIVE_STORE_PATH}`, {
    method: options.method ?? "POST",
    headers,
    body: options.method === "GET" ? undefined : options.body ?? `{"storeId":"${STORE_ID}"}`,
  });
}

function logoutRequest(options: Parameters<typeof activeStoreRequest>[0] = {}) {
  return activeStoreRequest({
    url: `http://customer-panel:3400${LOGOUT_PATH}`,
    body: "{}",
    ...options,
  });
}

test("active-store uses one server operation ID and returns only safe rotation output", async () => {
  assert.equal(typeof handlers.createPanelActiveStoreHandler, "function");
  const calls: unknown[] = [];
  const handler = handlers.createPanelActiveStoreHandler?.({
    async resolveRuntime() {
      return runtime({
        async rotateCredential(input) { calls.push(input); return { kind: "rotated", activeStoreId: STORE_ID, replacementCookie: REPLACEMENT }; },
      });
    },
    operationId() { return OPERATION_ID; },
    now() { return new Date(NOW); },
  });
  const response = await handler?.(activeStoreRequest());
  assert.equal(response?.status, 200);
  assert.equal(response?.headers.get("set-cookie"), REPLACEMENT);
  const body = await response?.text();
  assert.deepEqual(JSON.parse(body ?? "null"), { ok: true, activeStoreId: STORE_ID });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    currentCredential: CURRENT,
    operationId: OPERATION_ID,
    requestedStoreId: STORE_ID,
    now: NOW,
  });
  assert.equal((body ?? "").includes(NEXT), false);
});

test("active-store maps durable failures without issuing a valid successor cookie", async () => {
  for (const [kind, status] of [
    ["unauthenticated", 401], ["membership_denied", 403], ["operation_mismatch", 409],
    ["durable_authority_invalid", 409], ["unavailable", 503],
  ] as const) {
    const handler = handlers.createPanelActiveStoreHandler?.({
      async resolveRuntime() { return runtime({ async rotateCredential() { return { kind }; } }); },
      operationId() { return OPERATION_ID; },
      now() { return new Date(NOW); },
    });
    const response = await handler?.(activeStoreRequest());
    assert.equal(response?.status, status, kind);
    const setCookie = response?.headers.get("set-cookie");
    if (kind === "unauthenticated") assert.equal(setCookie, DELETION);
    else assert.equal(setCookie, null);
    assert.equal(setCookie?.includes(NEXT) ?? false, false);
    assert.equal(response?.headers.get("location"), null);
  }
});

test("active-store denies malformed authority, body, cookie, and browser-supplied operation authority before rotation", async () => {
  const cases = [
    [activeStoreRequest({ method: "GET" }), 405],
    [activeStoreRequest({ origin: null }), 403],
    [activeStoreRequest({ origin: "https://wrong.example.test", headers: { forwarded: `host=panel.saas-staging.celebix.site;proto=https` } }), 403],
    [activeStoreRequest({ url: `http://internal${ACTIVE_STORE_PATH}?forged=1` }), 400],
    [activeStoreRequest({ body: `{"storeId":"${STORE_ID}","operationId":"${OPERATION_ID}"}` }), 400],
    [activeStoreRequest({ cookie: null }), 401],
    [activeStoreRequest({ cookie: "__Host-celebix_panel=v1.bad" }), 401],
    [activeStoreRequest({ headers: { authorization: "Bearer browser-supplied" } }), 400],
  ] as const;
  for (const [request, status] of cases) {
    let rotations = 0;
    const handler = handlers.createPanelActiveStoreHandler?.({
      async resolveRuntime() { return runtime({ async rotateCredential() { rotations += 1; return { kind: "unavailable" }; } }); },
      operationId() { throw new Error("operation id must not be generated"); },
      now() { return new Date(NOW); },
    });
    const response = await handler?.(request);
    assert.equal(response?.status, status);
    assert.equal(rotations, 0);
  }
});

test("disabled and unavailable activation never mutates durable authority", async () => {
  for (const mode of ["disabled", "unavailable"] as const) {
    const handler = handlers.createPanelActiveStoreHandler?.({
      async resolveRuntime() { return runtime({ readiness: Object.freeze({ mode }), panelOrigin: null }); },
      operationId() { throw new Error("must not generate"); },
      now() { return new Date(NOW); },
    });
    const response = await handler?.(activeStoreRequest());
    assert.equal(response?.status, 503);
    assert.equal(response?.headers.get("set-cookie"), null);
  }
});

test("logout revokes the current session before emitting exact deletion cookie", async () => {
  assert.equal(typeof handlers.createPanelSessionLogoutHandler, "function");
  const events: string[] = [];
  const handler = handlers.createPanelSessionLogoutHandler?.({
    async resolveRuntime() {
      return runtime({
        async revokeCredential(input) {
          events.push(`revoke:${input.reason}`);
          assert.equal(input.credential, CURRENT);
          return { kind: "revoked" };
        },
      });
    },
    now() { return new Date(NOW); },
  });
  const response = await handler?.(logoutRequest());
  events.push(`cookie:${response?.headers.get("set-cookie") === DELETION}`);
  assert.deepEqual(events, ["revoke:logout", "cookie:true"]);
  assert.equal(response?.status, 204);
  assert.equal(await response?.text(), "");
});

test("logout is idempotent for missing or durably unauthenticated sessions", async () => {
  let revocations = 0;
  const handler = handlers.createPanelSessionLogoutHandler?.({
    async resolveRuntime() {
      return runtime({ async revokeCredential() { revocations += 1; return { kind: "unauthenticated" }; } });
    },
    now() { return new Date(NOW); },
  });
  const missing = await handler?.(logoutRequest({ cookie: null }));
  assert.equal(missing?.status, 204);
  assert.equal(missing?.headers.get("set-cookie"), DELETION);
  assert.equal(revocations, 0);
  const repeated = await handler?.(logoutRequest());
  assert.equal(repeated?.status, 204);
  assert.equal(repeated?.headers.get("set-cookie"), DELETION);
  assert.equal(revocations, 1);
});

test("logout clears conclusively malformed cookies but does not claim database failure as success", async () => {
  for (const [cookie, kind, status, deletion] of [
    ["__Host-celebix_panel=v1.bad", "revoked", 401, true],
    [`__Host-celebix_panel=${CURRENT}`, "unavailable", 503, false],
    [`__Host-celebix_panel=${CURRENT}`, "durable_authority_invalid", 409, false],
  ] as const) {
    let revocations = 0;
    const handler = handlers.createPanelSessionLogoutHandler?.({
      async resolveRuntime() { return runtime({ async revokeCredential() { revocations += 1; return { kind }; } }); },
      now() { return new Date(NOW); },
    });
    const response = await handler?.(logoutRequest({ cookie }));
    assert.equal(response?.status, status);
    assert.equal(response?.headers.get("set-cookie"), deletion ? DELETION : null);
    assert.equal(revocations, cookie.endsWith("v1.bad") ? 0 : 1);
  }
});
