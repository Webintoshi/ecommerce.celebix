import assert from "node:assert/strict";
import test from "node:test";

type HandlerModule = typeof import("./handler.ts");
const handlers = await import("./handler.ts").catch(() => ({} as Partial<HandlerModule>));

const SOURCE_ORIGIN = "https://admin.hemenaku.com";
const CENTRAL_ORIGIN = "https://panel.saas-staging.celebix.site";
const DESTINATION_HOSTNAME = "guzide-kuyumcu-4.admin.saas-staging.celebix.site";
const DESTINATION_ORIGIN = `https://${DESTINATION_HOSTNAME}`;
const DESTINATION_STORE_ID = "20000000-0000-4000-8000-000000000002";
const OPERATION_ID = "70000000-0000-4000-8000-000000000001";
const CURRENT = `v1.panel.active.v1.${Buffer.alloc(32, 0x31).toString("base64url")}`;
const HANDOFF = `v1.panel.handoff.v1.${Buffer.alloc(32, 0x32).toString("base64url")}`;
const NOW = new Date("2026-07-30T12:00:00.000Z");

function request(overrides: Readonly<{ origin?: string; body?: string; cookie?: string | null; method?: string; url?: string; host?: string | null }> = {}) {
  const headers = new Headers({
    origin: overrides.origin ?? SOURCE_ORIGIN,
    "content-type": "application/x-www-form-urlencoded",
  });
  if (overrides.host !== null) headers.set("host", overrides.host ?? new URL(SOURCE_ORIGIN).hostname);
  if (overrides.cookie !== null) headers.set("cookie", overrides.cookie ?? `__Host-celebix_panel=${CURRENT}`);
  return new Request(overrides.url ?? `${SOURCE_ORIGIN}/api/session/switch`, {
    method: overrides.method ?? "POST",
    headers,
    body: overrides.method === "GET" ? undefined : overrides.body ?? new URLSearchParams({
      destinationStoreId: DESTINATION_STORE_ID,
    }).toString(),
  });
}

function runtime(issue: (input: Record<string, unknown>) => Promise<Record<string, unknown>>) {
  return Object.freeze({
    access: Object.freeze({ panelOrigin: CENTRAL_ORIGIN }),
    adminDomains: Object.freeze({
      async resolvePublicBrand() {
        return Object.freeze({ kind: "resolved", brand: Object.freeze({ canonicalAdminOrigin: "https://hemenaku.admin.saas-staging.celebix.site" }) });
      },
    }),
    handoffs: Object.freeze({
      issueHandoff: issue,
      async recoverIssuedHandoff() { return Object.freeze({ kind: "unavailable" }); },
    }),
    storeOptions: Object.freeze({
      async listForCredential() {
        return Object.freeze({
          kind: "resolved",
          activeStoreId: "20000000-0000-4000-8000-000000000001",
          stores: Object.freeze([
            Object.freeze({
              storeId: DESTINATION_STORE_ID,
              storeSlug: "guzide-kuyumcu-4",
              displayName: "Güzide Kuyumcu",
              canonicalAdminOrigin: DESTINATION_ORIGIN,
            }),
          ]),
        });
      },
    }),
  });
}

test("store switch issues a destination-bound handoff and returns only a top-level auto-POST bridge", async () => {
  const calls: Record<string, unknown>[] = [];
  assert.equal(typeof handlers.createPanelStoreSwitchHandoffHandler, "function");
  const handler = handlers.createPanelStoreSwitchHandoffHandler!({
    async resolveRuntime() {
      return runtime(async (input) => {
        calls.push(input);
        return Object.freeze({ kind: "handoff_issued", credential: HANDOFF, destinationOrigin: DESTINATION_ORIGIN, expiresAt: new Date(NOW.getTime() + 120_000).toISOString() });
      });
    },
    operationId: () => OPERATION_ID,
    randomBytes: (size) => new Uint8Array(size).fill(0x41),
    now: () => new Date(NOW),
    maximumBodyBytes: 512,
  });

  const response = await handler(request());
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("location"), null);
  assert.match(response.headers.get("content-security-policy") ?? "", new RegExp(`form-action ${DESTINATION_ORIGIN.replaceAll(".", "\\.")}`));
  assert.match(html, new RegExp(`action="${DESTINATION_ORIGIN.replaceAll(".", "\\.")}\/auth\/handoff"`));
  assert.match(html, new RegExp(`name="handoff" value="${HANDOFF.replaceAll(".", "\\.")}"`));
  assert.equal(html.includes(`?handoff=${HANDOFF}`), false);
  assert.deepEqual(calls, [{
    currentCredential: CURRENT,
    operationId: OPERATION_ID,
    destinationStoreId: DESTINATION_STORE_ID,
    destinationHostname: DESTINATION_HOSTNAME,
    now: NOW,
  }]);
});

test("store switch uses the verified public Host behind the internal proxy transport", async () => {
  for (const url of [
    "http://0.0.0.0:3400/api/session/switch",
    "http://customer-panel:3400/api/session/switch",
    "https://customer-panel:3400/api/session/switch",
  ]) {
    const sources: unknown[] = [];
    const issued: Record<string, unknown>[] = [];
    const value = runtime(async (input) => {
      issued.push(input);
      return Object.freeze({ kind: "handoff_issued", credential: HANDOFF, destinationOrigin: DESTINATION_ORIGIN });
    });
    const handler = handlers.createPanelStoreSwitchHandoffHandler!({
      async resolveRuntime() {
        return Object.freeze({
          ...value,
          adminDomains: Object.freeze({
            async resolvePublicBrand(input: unknown) {
              sources.push(input);
              return Object.freeze({ kind: "resolved" });
            },
          }),
        });
      },
      operationId: () => OPERATION_ID,
      randomBytes: (size) => new Uint8Array(size).fill(0x41),
      now: () => new Date(NOW),
      maximumBodyBytes: 512,
    });
    const response = await handler(request({ url }));
    assert.equal(response.status, 200, url);
    assert.deepEqual(sources, [{ hostname: new URL(SOURCE_ORIGIN).hostname, now: NOW }]);
    assert.equal(issued.length, 1);
    assert.equal(issued[0].destinationStoreId, DESTINATION_STORE_ID);
    assert.match(await response.text(), /name="handoff"/);
  }
});

test("proxy transport does not bypass Host, origin, route or session checks", async () => {
  const proxyUrl = "http://customer-panel:3400/api/session/switch";
  for (const [input, status] of [
    [request({ url: proxyUrl, host: null }), 400],
    [request({ url: proxyUrl, host: "admin.hemenaku.com:3400" }), 400],
    [request({ url: proxyUrl, host: "admin.hemenaku.com,attacker.example" }), 400],
    [request({ url: proxyUrl, host: "admin.hemenaku.com." }), 400],
    [request({ url: proxyUrl, origin: "https://attacker.example" }), 403],
    [request({ url: proxyUrl, origin: "http://admin.hemenaku.com" }), 403],
    [request({ url: `${proxyUrl}?destination=evil` }), 400],
    [request({ url: `${proxyUrl}#extra` }), 400],
    [request({ url: "http://customer-panel:3400/api/session/logout" }), 400],
    [request({ url: proxyUrl, cookie: null }), 401],
  ] as const) {
    let issued = 0;
    const handler = handlers.createPanelStoreSwitchHandoffHandler!({
      async resolveRuntime() {
        return runtime(async () => {
          issued += 1;
          return Object.freeze({ kind: "handoff_issued", credential: HANDOFF, destinationOrigin: DESTINATION_ORIGIN });
        });
      },
      operationId: () => OPERATION_ID,
      randomBytes: (size) => new Uint8Array(size).fill(0x41),
      now: () => new Date(NOW),
      maximumBodyBytes: 512,
    });
    const response = await handler(input);
    assert.equal(response.status, status);
    assert.equal(issued, 0);
    assert.equal(response.headers.get("location"), null);
    assert.equal((await response.text()).includes(HANDOFF), false);
  }
});

test("unknown commit recovers the exact candidate and alias source still lands on canonical destination", async () => {
  let recovery: Record<string, unknown> | null = null;
  const value = runtime(async () => Object.freeze({ kind: "commit_unknown", credential: HANDOFF }));
  const runtimeWithRecovery = Object.freeze({
    ...value,
    handoffs: Object.freeze({
      ...value.handoffs,
      async recoverIssuedHandoff(input: Record<string, unknown>) {
        recovery = input;
        return Object.freeze({ kind: "operation_replayed", credential: HANDOFF, destinationOrigin: DESTINATION_ORIGIN, expiresAt: new Date(NOW.getTime() + 120_000).toISOString() });
      },
    }),
  });
  const handler = handlers.createPanelStoreSwitchHandoffHandler!({
    async resolveRuntime() { return runtimeWithRecovery; },
    operationId: () => OPERATION_ID,
    randomBytes: (size) => new Uint8Array(size).fill(0x41),
    now: () => new Date(NOW),
    maximumBodyBytes: 512,
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(recovery, {
    operationId: OPERATION_ID,
    credential: HANDOFF,
    destinationHostname: DESTINATION_HOSTNAME,
    now: NOW,
  });
});

test("staging store switch refuses a production canonical admin destination", async () => {
  let issued = 0;
  const value = runtime(async () => {
    issued += 1;
    return Object.freeze({ kind: "handoff_issued", credential: HANDOFF, destinationOrigin: DESTINATION_ORIGIN });
  });
  const crossEnvironment = Object.freeze({
    ...value,
    storeOptions: Object.freeze({
      async listForCredential() {
        return Object.freeze({
          kind: "resolved",
          activeStoreId: "20000000-0000-4000-8000-000000000001",
          stores: Object.freeze([Object.freeze({
            storeId: DESTINATION_STORE_ID,
            storeSlug: "guzide-kuyumcu-4",
            displayName: "Güzide Kuyumcu",
            canonicalAdminOrigin: "https://guzide-kuyumcu-4.admin.celebix.site",
          })]),
        });
      },
    }),
  });
  const handler = handlers.createPanelStoreSwitchHandoffHandler!({
    async resolveRuntime() { return crossEnvironment; },
    operationId: () => OPERATION_ID,
    randomBytes: (size) => new Uint8Array(size).fill(0x41),
    now: () => new Date(NOW),
    maximumBodyBytes: 512,
  });
  const response = await handler(request());
  assert.equal(response.status, 409);
  assert.equal(issued, 0);
  assert.equal(response.headers.has("location"), false);
});

test("switch rejects cross-site, malformed, unauthenticated, and unauthorized destinations without a bridge", async () => {
  for (const [input, expected, result] of [
    [request({ origin: "https://attacker.example" }), 403, "handoff_issued"],
    [request({ body: `destinationStoreId=${DESTINATION_STORE_ID}&destinationHostname=evil.example` }), 400, "handoff_issued"],
    [request({ cookie: null }), 401, "handoff_issued"],
    [request(), 403, "membership_denied"],
    [request(), 503, "unavailable"],
  ] as const) {
    let issued = 0;
    const handler = handlers.createPanelStoreSwitchHandoffHandler!({
      async resolveRuntime() { return runtime(async () => { issued += 1; return Object.freeze({ kind: result }); }); },
      operationId: () => OPERATION_ID,
      randomBytes: (size) => new Uint8Array(size).fill(0x41),
      now: () => new Date(NOW),
      maximumBodyBytes: 512,
    });
    const response = await handler(input);
    assert.equal(response.status, expected);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("location"), null);
    assert.equal(issued, expected === 403 && result === "membership_denied" || expected === 503 ? 1 : 0);
  }
});
