import assert from "node:assert/strict";
import test from "node:test";

import {
  createCustomerPanelCallbackEdgeApproval,
  createCustomerPanelSelfServeCallbackEdge,
  createDisabledCustomerPanelSelfServeCallbackEdge,
} from "./edge.ts";

const CALLBACK = "https://panel.celebix.site/auth/callback";
const STATE = "state_0123456789abcdefghijklmnop";

function safeSuccess() {
  return Response.json({
    state: "tenant_created_session_pending",
    storeSlug: "ornek-magaza",
    storefrontUrl: "https://ornek-magaza.celebix.site",
    panelUrl: "https://panel.celebix.site/stores/ornek-magaza",
    provisioningStatus: "ready",
    session: "pending",
  }, { status: 200, headers: { "cache-control": "no-store" } });
}

function createFixture(options: { maximumQueryBytes?: number; response?: Response; audit?: (event: unknown) => void | Promise<void> } = {}) {
  const calls: string[] = [];
  const approval = createCustomerPanelCallbackEdgeApproval("disposable_test");
  const edge = createCustomerPanelSelfServeCallbackEdge({
    activationApproval: approval,
    publicCallbackAuthority: CALLBACK,
    maximumQueryBytes: options.maximumQueryBytes ?? 2_048,
    maximumResponseBytes: 4_096,
    transport: {
      async forward(callbackUrl: string) {
        calls.push(callbackUrl);
        return options.response ?? safeSuccess();
      },
    },
    audit: options.audit ?? (() => undefined),
  });
  return { edge, calls, approval };
}

test("sealed customer-panel approval accepts only disposable or approved staging authority", () => {
  const approval = createCustomerPanelCallbackEdgeApproval("disposable_test");
  assert.equal(Object.isFrozen(approval), true);
  assert.equal(Object.isSealed(approval), true);
  assert.throws(() => createCustomerPanelSelfServeCallbackEdge({
    ...createFixture().edge,
  } as never), /customer_panel_callback_edge_invalid/);
  for (const fake of [
    JSON.parse(JSON.stringify(approval)),
    { ...approval },
    {
      purpose: "phase2b1b2b_customer_panel_callback_edge",
      environment: "disposable_test",
      publicActivation: "disabled_default_route",
      transport: "authenticated_injected_only",
      sessions: "forbidden",
      providerNetworking: "forbidden",
    },
  ]) {
    assert.throws(() => createCustomerPanelSelfServeCallbackEdge({
      activationApproval: fake as never,
      publicCallbackAuthority: CALLBACK,
      maximumQueryBytes: 2_048,
      maximumResponseBytes: 4_096,
      transport: { forward: async () => safeSuccess() },
      audit: () => undefined,
    }), /customer_panel_callback_edge_invalid/);
  }
  assert.throws(
    () => createCustomerPanelCallbackEdgeApproval("production" as never),
    /customer_panel_callback_edge_invalid/,
  );
});

test("disabled edge is controlled, no-store, GET-only, and never reads body or calls a transport", async () => {
  const disabled = createDisabledCustomerPanelSelfServeCallbackEdge();
  let bodyReads = 0;
  const request = {
    method: "GET",
    url: `${CALLBACK}?state=${STATE}&code=code`,
    headers: new Headers(),
    text: async () => { bodyReads += 1; return "secret"; },
  } as Request;
  const response = await disabled(request);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: "panel_auth_disabled" });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
  assert.equal(bodyReads, 0);
});

test("exact GET success and provider-error queries delegate once without reading or forwarding browser headers", async () => {
  for (const query of [
    `state=${STATE}&code=provider-code`,
    `state=${STATE}&error=access_denied&error_description=denied&error_uri=https%3A%2F%2Fidentity.example.test%2Ferror`,
  ]) {
    const fixture = createFixture();
    let bodyReads = 0;
    const request = {
      method: "GET",
      url: `${CALLBACK}?${query}`,
      headers: new Headers({
        host: "attacker.example",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "http",
        "user-agent": "browser-secret",
      }),
      text: async () => { bodyReads += 1; return "secret"; },
    } as Request;
    const response = await fixture.edge(request);
    assert.equal(response.status, 200);
    assert.equal(fixture.calls.length, 1);
    assert.equal(fixture.calls[0], request.url);
    assert.equal(bodyReads, 0);
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(response.headers.has("location"), false);
  }
});

test("public edge rejects method, authority, delivery, syntax, duplicates, unknown fields, and oversized queries before transport", async () => {
  const cases: Array<[string, string, string, Record<string, string>?]> = [
    ["POST", CALLBACK, `state=${STATE}&code=code`],
    ["GET", "https://attacker.example/auth/callback", `state=${STATE}&code=code`],
    ["GET", "https://sub.panel.celebix.site/auth/callback", `state=${STATE}&code=code`],
    ["GET", "https://panel.celebix.site.attacker.example/auth/callback", `state=${STATE}&code=code`],
    ["GET", "https://panel.celebix.site:444/auth/callback", `state=${STATE}&code=code`],
    ["GET", "https://panel.celebix.site/auth/callback/extra", `state=${STATE}&code=code`],
    ["GET", "https://user:pass@panel.celebix.site/auth/callback", `state=${STATE}&code=code`],
    ["GET", `${CALLBACK}#fragment`, `state=${STATE}&code=code`],
    ["GET", CALLBACK, "code=code"],
    ["GET", CALLBACK, "state=&code=code"],
    ["GET", CALLBACK, `state=${STATE}`],
    ["GET", CALLBACK, `state=${STATE}&code=`],
    ["GET", CALLBACK, `state=${STATE}&state=duplicate&code=code`],
    ["GET", CALLBACK, `state=${STATE}&code=code&code=duplicate`],
    ["GET", CALLBACK, `state=${STATE}&code=code&error=access_denied`],
    ["GET", CALLBACK, `state=${STATE}&code=code&returnTo=%2Fstores`],
    ["GET", CALLBACK, `state=${STATE}&code=%`],
    ["GET", CALLBACK, `state=${STATE}&code=%C3%28`],
    ["GET", CALLBACK, `state=${STATE}&code=code`, { "x-celebix-callback-signature": "browser" }],
    ["GET", CALLBACK, `state=${STATE}&code=code`, { "x-celebix-edge-trust": "browser" }],
    ["GET", CALLBACK, `state=${STATE}&code=code`, { "x-celebix-tenant-id": "browser" }],
  ];
  for (const [method, base, query, headers] of cases) {
    const fixture = createFixture({ maximumQueryBytes: 128 });
    const separator = base.includes("?") || base.includes("#") ? "" : "?";
    const url = `${base}${separator}${query}`;
    const request = base.includes("user:pass@")
      ? { method, url, headers: new Headers(headers) } as Request
      : new Request(url, { method, headers });
    const response = await fixture.edge(request);
    assert.ok([400, 405, 413].includes(response.status), `${method} ${base} ${query}`);
    assert.equal(fixture.calls.length, 0, `${method} ${base} ${query}`);
  }
  const oversized = createFixture({ maximumQueryBytes: 64 });
  const response = await oversized.edge(new Request(`${CALLBACK}?state=${STATE}&code=${"x".repeat(80)}`));
  assert.equal(response.status, 413);
  assert.equal(oversized.calls.length, 0);
});

test("edge independently rejects malformed, oversized, or expanded transport responses and projects safe results", async () => {
  for (const response of [
    new Response("not-json", { status: 200 }),
    Response.json({ state: "tenant_created_session_pending", storeSlug: "x", storefrontUrl: "https://x.celebix.site", panelUrl: "https://panel.celebix.site/stores/x", provisioningStatus: "ready", session: "pending", operationId: "secret" }),
    Response.json({ code: "self_serve_oidc_provider_unavailable", state: "failed", retryable: false, message: "safe" }, { status: 503 }),
    Response.json({
      code: "self_serve_callback_untrusted",
      state: "rejected",
      retryable: false,
      message: "owner@example.com state=secret authorization_code=secret",
    }, { status: 401, headers: { "set-cookie": "private=session", location: "https://owner-internal.example/private" } }),
    new Response("x".repeat(5_000), { status: 503 }),
  ]) {
    const fixture = createFixture({ response });
    const projected = await fixture.edge(new Request(`${CALLBACK}?state=${STATE}&code=code`));
    assert.equal(projected.status, 503);
    assert.deepEqual(await projected.json(), {
      code: "panel_callback_unavailable",
      state: "failed",
      retryable: true,
    });
    assert.equal(projected.headers.has("set-cookie"), false);
    assert.equal(projected.headers.has("location"), false);
  }

  const restart = Response.json({
    code: "self_serve_callback_restart_required",
    state: "restart_required",
    retryable: false,
    restartRegistration: true,
    message: "Kayıt işlemi güvenli şekilde yeniden başlatılmalı.",
  }, { status: 409, headers: { "set-cookie": "secret", location: "/private" } });
  const fixture = createFixture({ response: restart });
  const projected = await fixture.edge(new Request(`${CALLBACK}?state=${STATE}&code=code`));
  assert.equal(projected.status, 409);
  assert.equal((await projected.json()).state, "restart_required");
  assert.equal(projected.headers.has("set-cookie"), false);
  assert.equal(projected.headers.has("location"), false);

  const providerUnavailable = createFixture({ response: Response.json({
    code: "self_serve_oidc_provider_unavailable",
    state: "restart_required",
    retryable: false,
    restartRegistration: true,
    message: "Kimlik sağlayıcı şu anda kullanılamıyor; kayıt yeniden başlatılmalı.",
  }, { status: 503 }) });
  assert.equal((await (await providerUnavailable.edge(new Request(`${CALLBACK}?state=${STATE}&code=code`))).json()).state, "restart_required");
});

test("transport unknown is retryable without automatic retry and audit failures never block", async () => {
  for (const audit of [
    () => { throw new Error("audit state code email"); },
    async () => { throw new Error("audit signature secret"); },
    () => new Promise<never>(() => undefined),
  ]) {
    let calls = 0;
    const approval = createCustomerPanelCallbackEdgeApproval("disposable_test");
    const edge = createCustomerPanelSelfServeCallbackEdge({
      activationApproval: approval,
      publicCallbackAuthority: CALLBACK,
      maximumQueryBytes: 2_048,
      maximumResponseBytes: 4_096,
      transport: { forward: async () => { calls += 1; throw new Error("owner endpoint secret"); } },
      audit,
    });
    const response = await edge(new Request(`${CALLBACK}?state=${STATE}&code=code`));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      code: "panel_callback_transport_unknown",
      state: "transport_unknown",
      retryable: true,
    });
    assert.equal(calls, 1);
  }
});
