import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../../..");
const BASE = "e585e27d7f3d0f9b40cf258529c416b8911d54fb";
const OWNER_ROUTES = [
  "apps/owner/app/api/self-serve/register/route.ts",
  "apps/owner/app/api/internal/self-serve/browser-binding/route.ts",
  "apps/owner/app/api/internal/self-serve/oidc-callback/route.ts",
];
const CUSTOMER_ROUTES = [
  "apps/customer-panel/app/auth/bootstrap/route.ts",
  "apps/customer-panel/app/auth/callback/route.ts",
];
const ROUTE_FILES = [...OWNER_ROUTES, ...CUSTOMER_ROUTES];
const ROUTE_MOUNT_FILES = [
  "apps/owner/lib/self-serve-auth-route-mount/activation.ts",
  "apps/owner/lib/self-serve-auth-route-mount/route-set.ts",
  "apps/customer-panel/lib/panel-auth-route-mount/activation.ts",
  "apps/customer-panel/lib/panel-auth-route-mount/route-set.ts",
];

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function read(file) {
  return readFileSync(resolve(ROOT, file), "utf8");
}

function changedFiles() {
  return [...new Set([
    ...git("diff", "--name-only", BASE).split("\n").filter(Boolean),
    ...git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean),
  ])].sort();
}

test("Phase 2B2B2C2 diff is confined to the exact Atlas allowlist", () => {
  const allowed = [
    /^apps\/owner\/lib\/self-serve-auth-route-(?:mount|runtime)\//,
    /^apps\/customer-panel\/lib\/panel-auth-route-(?:mount|runtime)\//,
    /^apps\/owner\/lib\/(?:self-serve-auth-authority|self-serve-logto-provider)\//,
    /^apps\/customer-panel\/lib\/panel-auth-authority\/(?:config|bootstrap-request-authority)\.ts$/,
    /^apps\/owner\/lib\/self-serve-auth-composition\/composition\.ts$/,
    /^apps\/owner\/lib\/self-serve-http\/registration-request\.ts$/,
    /^apps\/customer-panel\/lib\/panel-auth-composition\/composition\.ts$/,
    /^apps\/owner\/lib\/self-serve-browser-bound-registration\/(?:handler|auto-post-html)\.ts$/,
    /^apps\/owner\/lib\/panel-browser-binding\/(?:start-executor|internal-gateway)\.ts$/,
    /^apps\/owner\/lib\/self-serve-http\/(?:runtime|internal-callback-gateway)(?:\.test)?\.ts$/,
    /^apps\/owner\/lib\/panel-browser-binding\/internal-gateway\.test\.ts$/,
    /^apps\/owner\/lib\/self-serve-http\/internal-callback-gateway\.test\.ts$/,
    /^apps\/owner\/lib\/self-serve-oidc\.ts$/,
    /^apps\/owner\/lib\/saas-persistence\/postgres-oidc-transaction-store\.ts$/,
    /^apps\/customer-panel\/lib\/panel-browser-binding-bootstrap\/(?:handler(?:\.test)?|transport)\.ts$/,
    /^apps\/customer-panel\/lib\/panel-session-completion\/(?:completion|transport)\.ts$/,
    /^apps\/customer-panel\/lib\/self-serve-callback-edge\/callback-request(?:\.test)?\.ts$/,
    /^apps\/owner\/lib\/panel-session-handoff\/(?:initial-callback-(?:executor|grant)|internal-callback-handler)(?:\.test)?\.ts$/,
    /^packages\/platform-config\/src\/saas\.ts$/,
    /^packages\/platform-config\/src\/http-security\.ts$/,
    /^apps\/owner\/middleware\.ts$/,
    /^apps\/(?:owner|customer-panel)\/package\.json$/,
    /^package-lock\.json$/,
    /^apps\/owner\/app\/api\/self-serve\/register\/route\.ts$/,
    /^apps\/owner\/app\/api\/internal\/self-serve\/(?:browser-binding|oidc-callback)\/route\.ts$/,
    /^apps\/customer-panel\/app\/auth\/(?:bootstrap|callback)\/route\.ts$/,
    /^tests\/saas-phase2\/auth-route-mount\//,
    /^tests\/saas-phase2\/http-wiring\//,
    /^tests\/saas-phase2\/panel-auth-composition\/static-security\.test\.mjs$/,
    /^tests\/saas-phase2\/panel-auth-composition\/postgres-harness\.mjs$/,
    /^tests\/saas-phase2\/panel-auth-composition\/in-process\.test\.mjs$/,
    /^tests\/saas-phase2\/panel-session-completion\/postgres-harness\.mjs$/,
    /^tests\/saas-phase2\/panel-session-completion\/static-security\.test\.mjs$/,
    /^tests\/saas-phase2\/staging-auth-(?:runtime|e2e)\//,
    /^apps\/customer-panel\/lib\/panel-auth-composition\/composition\.test\.ts$/,
  ];
  const unexpected = changedFiles().filter((file) => !allowed.some((pattern) => pattern.test(file)));
  assert.deepEqual(unexpected, []);
});

test("route files are thin default-resolver delegators without authority loading", () => {
  for (const file of ROUTE_FILES) {
    const source = read(file);
    assert.equal((source.match(/^import\s/gm) ?? []).length, 1, file);
    assert.match(source, /getDefault(?:OwnerSelfServe|CustomerPanel)AuthRouteSet/);
    assert.match(source, /const routeSet = getDefault(?:OwnerSelfServe|CustomerPanel)AuthRouteSet\(\);/);
    assert.equal((source.match(/export async function GET/g) ?? []).length, 1, file);
    assert.equal((source.match(/export async function POST/g) ?? []).length, 1, file);
    assert.doesNotMatch(source, /process\.env|auth-composition|DATABASE_URL|POSTGRES_URL|\bPool\b|from\s+["']pg["']|credential-codec|provider|keyring|clientSecret|HMAC|encryption|authorizationUrl|globalThis\.fetch|readiness/i, file);
    assert.doesNotMatch(source, /request\.(?:clone|text|json|formData|arrayBuffer|blob)\s*\(|headers\.get|cookies?\s*\(/i, file);
  }
});

test("default resolvers are immutable lazy singletons with exact staging-only activation", () => {
  const owner = read("apps/owner/lib/self-serve-auth-route-mount/route-set.ts");
  const customer = read("apps/customer-panel/lib/panel-auth-route-mount/route-set.ts");
  assert.match(owner, /self-serve-auth-route-runtime\/default\.ts/);
  assert.match(customer, /panel-auth-route-runtime\/default\.ts/);
  assert.match(owner, /return defaultRouteSet;/);
  assert.match(customer, /return defaultRouteSet;/);
  for (const source of ROUTE_MOUNT_FILES.map(read)) {
    assert.doesNotMatch(source, /process\.env|globalThis\.fetch|DATABASE_URL|POSTGRES_URL|new\s+Pool|node:http|node:https/);
    assert.doesNotMatch(source, /environment:\s*"production"|environment:\s*"disposable_test"|createProduction|EnabledProduction|replaceRouteSet|setRouteSet|registerRouteSet/i);
  }
  assert.equal((owner.match(/const defaultRouteSet/g) ?? []).length, 1);
  assert.equal((customer.match(/const defaultRouteSet/g) ?? []).length, 1);
});

test("route-mount approvals and route sets use private WeakSet authority and exact staging-only state", () => {
  const ownerActivation = read(ROUTE_MOUNT_FILES[0]);
  const ownerRouteSet = read(ROUTE_MOUNT_FILES[1]);
  const customerActivation = read(ROUTE_MOUNT_FILES[2]);
  const customerRouteSet = read(ROUTE_MOUNT_FILES[3]);
  for (const source of [ownerActivation, customerActivation]) {
    assert.match(source, /new WeakSet<object>\(\)/);
    assert.match(source, /environment: "approved_staging"/);
    assert.match(source, /routeMount: "injected_only"/);
    assert.match(source, /defaultMode: "disabled"/);
    assert.match(source, /productionActivation: "forbidden"/);
    assert.match(source, /secretLoading: "forbidden"/);
    assert.match(source, /providerNetworking: "forbidden"/);
    assert.match(source, /deployment: "forbidden"/);
    assert.doesNotMatch(source, /"production"\s*\||"disposable_test"\s*\|/);
  }
  for (const source of [ownerRouteSet, customerRouteSet]) {
    assert.match(source, /new WeakSet<object>\(\)/);
    assert.match(source, /Object\.freeze\(routeSet\)/);
    assert.match(source, /approved_staging_injected/);
    assert.match(source, /staging_runtime_provider_and_e2e/);
    assert.doesNotMatch(source, /production_enabled|fallback_to_staging|mutable registry/i);
  }
});

test("no readiness endpoint, unauthorized middleware mutation, environment activation, or production flag exists", () => {
  const changed = changedFiles();
  assert.equal(changed.some((file) => /\/readiness\/route\.ts$/.test(file)), false);
  assert.equal(changed.some((file) =>
    /(?:^|\/)middleware\.(?:ts|js)$/.test(file) && file !== "apps/owner/middleware.ts"
  ), false);
  assert.match(read("apps/owner/lib/self-serve-registration-orchestrator.ts"), /SELF_SERVE_SAAS_REGISTRATION_ENABLED = false/);
  assert.match(read("apps/customer-panel/lib/config.ts"), /CUSTOMER_PANEL_AUTH_ENABLED = false/);
});

test("authority changes are confined to the Atlas-approved parameterization files", () => {
  const protectedPaths = [
    "apps/customer-panel/lib/panel-session-handoff",
    "apps/customer-panel/lib/panel-session-persistence",
    "apps/owner/lib/self-serve-registration-orchestrator.ts",
    "apps/owner/lib/self-serve-registration-completion.ts",
  ];
  assert.equal(git("diff", "--name-only", BASE, "--", ...protectedPaths), "");
});

test("SQL, manifests, contracts, non-Owner middleware, deploy, and workflows remain byte-unchanged", () => {
  const protectedPaths = [
    "apps/owner/scripts/sql/saas",
    "packages/saas-contracts",
    "packages/saas-data",
    "packages/saas-tenant-core",
    "package.json",
    "apps/customer-panel/middleware.ts",
    "apps/admin/middleware.ts",
    "apps/storefront-base/middleware.ts",
    "apps/storefront-deri-kordon/middleware.ts",
    "apps/storefront-test1/middleware.ts",
    "deploy",
    ".github/workflows",
  ];
  assert.equal(git("diff", "--name-only", BASE, "--", ...protectedPaths), "");
  assert.equal(changedFiles().some((file) => file.endsWith("manifest.json") || file.endsWith(".sql")), false);
});
