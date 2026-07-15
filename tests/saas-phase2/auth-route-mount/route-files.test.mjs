import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../../..");
const ROUTES = Object.freeze([
  Object.freeze({
    file: "apps/owner/app/api/self-serve/register/route.ts",
    resolver: "getDefaultOwnerSelfServeAuthRouteSet",
    handler: "publicRegistration",
  }),
  Object.freeze({
    file: "apps/owner/app/api/internal/self-serve/browser-binding/route.ts",
    resolver: "getDefaultOwnerSelfServeAuthRouteSet",
    handler: "internalBrowserBinding",
  }),
  Object.freeze({
    file: "apps/owner/app/api/internal/self-serve/oidc-callback/route.ts",
    resolver: "getDefaultOwnerSelfServeAuthRouteSet",
    handler: "internalCallback",
  }),
  Object.freeze({
    file: "apps/customer-panel/app/auth/bootstrap/route.ts",
    resolver: "getDefaultCustomerPanelAuthRouteSet",
    handler: "browserBootstrap",
  }),
  Object.freeze({
    file: "apps/customer-panel/app/auth/callback/route.ts",
    resolver: "getDefaultCustomerPanelAuthRouteSet",
    handler: "browserCallback",
  }),
]);

function read(file) {
  return readFileSync(resolve(ROOT, file), "utf8");
}

test("all five route files import only their default route-set resolver", () => {
  for (const route of ROUTES) {
    const path = resolve(ROOT, route.file);
    assert.equal(existsSync(path), true, `${route.file} must exist`);
    const source = read(route.file);
    assert.equal((source.match(/^import\s/gm) ?? []).length, 1, route.file);
    assert.match(source, new RegExp(`import \\{ ${route.resolver} \\} from `), route.file);
    assert.equal((source.match(new RegExp(`${route.resolver}\\(\\)`, "g")) ?? []).length, 1, route.file);
    assert.match(source, /const routeSet = getDefault(?:OwnerSelfServe|CustomerPanel)AuthRouteSet\(\);/);
    assert.match(source, new RegExp(`return routeSet\\.${route.handler}\\(request\\);`), route.file);
    assert.equal((source.match(/export async function GET\(request: Request\)/g) ?? []).length, 1, route.file);
    assert.equal((source.match(/export async function POST\(request: Request\)/g) ?? []).length, 1, route.file);
    assert.doesNotMatch(source, /process\.env|auth-composition|\bpg\b|\bPool\b|credential-codec|oidc-provider|DATABASE_URL|POSTGRES_URL|clientSecret|keyring|HMAC|encryption|authorizationUrl|globalThis\.fetch|request\.(?:clone|text|json|formData|arrayBuffer|blob)\s*\(/i);
    assert.doesNotMatch(source, /readiness|console\.|headers\.get|cookies?\s*\(/i);
  }
});

test("default route files expose the exact disabled method matrix", async () => {
  for (const route of ROUTES) {
    assert.equal(existsSync(resolve(ROOT, route.file)), true, `${route.file} must exist`);
  }
  const ownerRegistration = await import(resolve(ROOT, ROUTES[0].file));
  const ownerBinding = await import(resolve(ROOT, ROUTES[1].file));
  const ownerCallback = await import(resolve(ROOT, ROUTES[2].file));
  const customerBootstrap = await import(resolve(ROOT, ROUTES[3].file));
  const customerCallback = await import(resolve(ROOT, ROUTES[4].file));

  const cases = [
    [ownerRegistration.GET, new Request("https://ecommerce.celebix.co/api/self-serve/register"), 405, "self_serve_register_read_disabled"],
    [ownerRegistration.POST, new Request("https://ecommerce.celebix.co/api/self-serve/register", { method: "POST", headers: { origin: "https://ecommerce.celebix.co" } }), 503, "self_serve_saas_registration_disabled"],
    [ownerBinding.GET, new Request("https://owner.internal/api/internal/self-serve/browser-binding"), 405, "owner_browser_binding_method_not_allowed"],
    [ownerBinding.POST, new Request("https://owner.internal/api/internal/self-serve/browser-binding", { method: "POST" }), 503, "owner_browser_binding_disabled"],
    [ownerCallback.GET, new Request("https://owner.internal/api/internal/self-serve/oidc-callback"), 405, "self_serve_internal_callback_method_not_allowed"],
    [ownerCallback.POST, new Request("https://owner.internal/api/internal/self-serve/oidc-callback", { method: "POST" }), 503, "self_serve_internal_callback_disabled"],
    [customerBootstrap.GET, new Request("https://panel.celebix.site/auth/bootstrap"), 405, "panel_browser_bootstrap_method_not_allowed"],
    [customerBootstrap.POST, new Request("https://panel.celebix.site/auth/bootstrap", { method: "POST" }), 503, "panel_browser_bootstrap_disabled"],
    [customerCallback.GET, new Request("https://panel.celebix.site/auth/callback"), 503, "panel_auth_disabled"],
    [customerCallback.POST, new Request("https://panel.celebix.site/auth/callback", { method: "POST" }), 405, "panel_callback_method_not_allowed"],
  ];
  for (const [handler, request, status, code] of cases) {
    const response = await handler(request);
    assert.equal(response.status, status, code);
    assert.equal((await response.json()).code, code);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(response.headers.has("location"), false);
  }
});
