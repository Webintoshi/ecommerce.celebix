import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../../..");
const OWNER_MODULE = resolve(
  ROOT,
  "apps/owner/lib/self-serve-auth-route-mount/route-set.ts",
);
const CUSTOMER_MODULE = resolve(
  ROOT,
  "apps/customer-panel/lib/panel-auth-route-mount/route-set.ts",
);

const SECURITY_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});
const REGISTRATION_FALLBACK_CSP =
  "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'";

function assertSecureDisabledResponse(response) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    assert.equal(response.headers.get(name), value, name);
  }
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
}

function request(url, method, headers = undefined) {
  return new Request(url, { method, headers });
}

test("disabled Owner route set is exact, genuine, frozen, and always the default", async () => {
  assert.equal(existsSync(OWNER_MODULE), true, "Owner route-set module must exist");
  const {
    assertOwnerSelfServeAuthRouteSet,
    createDisabledOwnerSelfServeAuthRouteSet,
    getDefaultOwnerSelfServeAuthRouteSet,
  } = await import(OWNER_MODULE);

  const routeSet = createDisabledOwnerSelfServeAuthRouteSet();
  assert.deepEqual(Object.keys(routeSet), [
    "publicRegistration",
    "internalBrowserBinding",
    "internalCallback",
    "readiness",
  ]);
  assert.equal(Object.isFrozen(routeSet), true);
  assert.equal(Object.isSealed(routeSet), true);
  assert.deepEqual(routeSet.readiness, {
    schemaVersion: 1,
    phase: "2B2B2C1",
    mode: "disabled",
    productionActivation: "forbidden",
    requiredNextGate: "staging_runtime_provider_and_e2e",
    endpoints: {
      publicRegistration: {
        method: "POST",
        path: "/api/self-serve/register",
        state: "mounted_disabled",
      },
      internalBrowserBinding: {
        method: "POST",
        path: "/api/internal/self-serve/browser-binding",
        state: "mounted_disabled",
      },
      internalCallback: {
        method: "POST",
        path: "/api/internal/self-serve/oidc-callback",
        state: "mounted_disabled",
      },
    },
  });
  assert.equal(Object.isFrozen(routeSet.readiness), true);
  assert.doesNotThrow(() => assertOwnerSelfServeAuthRouteSet(routeSet));
  for (const copy of [{ ...routeSet }, structuredClone(routeSet.readiness)]) {
    assert.throws(() => assertOwnerSelfServeAuthRouteSet(copy), /owner_self_serve_auth_route_set_invalid/);
  }
  assert.equal(getDefaultOwnerSelfServeAuthRouteSet.length, 0);
  assert.equal(getDefaultOwnerSelfServeAuthRouteSet(), getDefaultOwnerSelfServeAuthRouteSet());
  assert.equal(getDefaultOwnerSelfServeAuthRouteSet().readiness.mode, "disabled");
});

test("disabled Owner route set preserves fail-closed HTTP behavior", async () => {
  assert.equal(existsSync(OWNER_MODULE), true, "Owner route-set module must exist");
  const { createDisabledOwnerSelfServeAuthRouteSet } = await import(OWNER_MODULE);
  const routeSet = createDisabledOwnerSelfServeAuthRouteSet();
  const cases = [
    [
      routeSet.publicRegistration,
      request("https://ecommerce.celebix.co/api/self-serve/register", "GET"),
      405,
      "self_serve_register_read_disabled",
    ],
    [
      routeSet.publicRegistration,
      request("https://ecommerce.celebix.co/api/self-serve/register", "POST", {
        origin: "https://ecommerce.celebix.co",
      }),
      503,
      "self_serve_saas_registration_disabled",
    ],
    [
      routeSet.internalBrowserBinding,
      request("https://owner.internal/api/internal/self-serve/browser-binding", "GET"),
      405,
      "owner_browser_binding_method_not_allowed",
    ],
    [
      routeSet.internalBrowserBinding,
      request("https://owner.internal/api/internal/self-serve/browser-binding", "POST"),
      503,
      "owner_browser_binding_disabled",
    ],
    [
      routeSet.internalCallback,
      request("https://owner.internal/api/internal/self-serve/oidc-callback", "GET"),
      405,
      "self_serve_internal_callback_method_not_allowed",
    ],
    [
      routeSet.internalCallback,
      request("https://owner.internal/api/internal/self-serve/oidc-callback", "POST"),
      503,
      "self_serve_internal_callback_disabled",
    ],
  ];
  for (const [handler, input, status, code] of cases) {
    const response = await handler(input);
    assert.equal(response.status, status, code);
    assert.equal((await response.json()).code, code);
    assertSecureDisabledResponse(response);
    if (handler === routeSet.publicRegistration) {
      assert.equal(response.headers.get("content-security-policy"), REGISTRATION_FALLBACK_CSP);
    } else {
      assert.equal(response.headers.has("content-security-policy"), false);
    }
  }
});

test("disabled customer route set is exact, genuine, frozen, and always the default", async () => {
  assert.equal(existsSync(CUSTOMER_MODULE), true, "customer route-set module must exist");
  const {
    assertCustomerPanelAuthRouteSet,
    createDisabledCustomerPanelAuthRouteSet,
    getDefaultCustomerPanelAuthRouteSet,
  } = await import(CUSTOMER_MODULE);

  const routeSet = createDisabledCustomerPanelAuthRouteSet();
  assert.deepEqual(Object.keys(routeSet), ["browserBootstrap", "browserCallback", "browserLogin", "readiness"]);
  assert.equal(Object.isFrozen(routeSet), true);
  assert.equal(Object.isSealed(routeSet), true);
  assert.deepEqual(routeSet.readiness, {
    schemaVersion: 1,
    phase: "2B2B2C1",
    mode: "disabled",
    productionActivation: "forbidden",
    requiredNextGate: "staging_runtime_provider_and_e2e",
    endpoints: {
      browserBootstrap: {
        method: "POST",
        path: "/auth/bootstrap",
        state: "mounted_disabled",
      },
      browserCallback: {
        method: "GET",
        path: "/auth/callback",
        state: "mounted_disabled",
      },
      browserLogin: {
        method: "GET",
        path: "/auth/login",
        state: "mounted_disabled",
      },
    },
  });
  assert.equal(Object.isFrozen(routeSet.readiness), true);
  assert.doesNotThrow(() => assertCustomerPanelAuthRouteSet(routeSet));
  for (const copy of [{ ...routeSet }, structuredClone(routeSet.readiness)]) {
    assert.throws(() => assertCustomerPanelAuthRouteSet(copy), /customer_panel_auth_route_set_invalid/);
  }
  assert.equal(getDefaultCustomerPanelAuthRouteSet.length, 0);
  assert.equal(getDefaultCustomerPanelAuthRouteSet(), getDefaultCustomerPanelAuthRouteSet());
  assert.equal(getDefaultCustomerPanelAuthRouteSet().readiness.mode, "disabled");
});

test("disabled customer route set preserves fail-closed HTTP behavior", async () => {
  assert.equal(existsSync(CUSTOMER_MODULE), true, "customer route-set module must exist");
  const { createDisabledCustomerPanelAuthRouteSet } = await import(CUSTOMER_MODULE);
  const routeSet = createDisabledCustomerPanelAuthRouteSet();
  const cases = [
    [
      routeSet.browserBootstrap,
      request("https://panel.celebix.site/auth/bootstrap", "GET"),
      405,
      "panel_browser_bootstrap_method_not_allowed",
    ],
    [
      routeSet.browserBootstrap,
      request("https://panel.celebix.site/auth/bootstrap", "POST"),
      503,
      "panel_browser_bootstrap_disabled",
    ],
    [
      routeSet.browserCallback,
      request("https://panel.celebix.site/auth/callback", "GET"),
      503,
      "panel_auth_disabled",
    ],
    [
      routeSet.browserCallback,
      request("https://panel.celebix.site/auth/callback", "POST"),
      405,
      "panel_callback_method_not_allowed",
    ],
    [
      routeSet.browserLogin,
      request("https://panel.celebix.site/auth/login", "GET"),
      503,
      "panel_login_disabled",
    ],
    [
      routeSet.browserLogin,
      request("https://panel.celebix.site/auth/login", "POST"),
      405,
      "panel_login_method_not_allowed",
    ],
  ];
  for (const [handler, input, status, code] of cases) {
    const response = await handler(input);
    assert.equal(response.status, status, code);
    assert.equal((await response.json()).code, code);
    assertSecureDisabledResponse(response);
  }
});
