import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../../..");
const BASE = "e585e27d7f3d0f9b40cf258529c416b8911d54fb";

function read(path) {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function changedFiles() {
  return [...new Set([
    ...git("diff", "--name-only", BASE).split("\n").filter(Boolean),
    ...git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean),
  ])].sort();
}

test("Phase 2B2B2C2 changes remain confined to the exact Atlas allowlist", () => {
  const allowed = [
    /^apps\/owner\/lib\/self-serve-browser-bound-registration\//,
    /^apps\/owner\/lib\/self-serve-auth-composition\//,
    /^apps\/owner\/lib\/self-serve-http\/registration-(?:request|start)(?:\.test)?\.ts$/,
    /^apps\/customer-panel\/lib\/panel-auth-composition\//,
    /^packages\/platform-config\/src\/saas(?:\.test)?\.ts$/,
    /^tests\/saas-phase2\/panel-auth-composition\//,
    /^tests\/saas-phase2\/http-wiring\//,
    /^tests\/saas-phase2\/panel-browser-binding\/static-security\.test\.mjs$/,
    /^tests\/saas-phase2\/panel-session-completion\/static-security\.test\.mjs$/,
    /^apps\/owner\/lib\/self-serve-auth-route-(?:mount|runtime)\//,
    /^apps\/customer-panel\/lib\/panel-auth-route-(?:mount|runtime)\//,
    /^apps\/owner\/app\/api\/self-serve\/register\/route\.ts$/,
    /^apps\/owner\/app\/api\/internal\/self-serve\/(?:browser-binding|oidc-callback)\/route\.ts$/,
    /^apps\/customer-panel\/app\/auth\/(?:bootstrap|callback)\/route\.ts$/,
    /^tests\/saas-phase2\/auth-route-mount\//,
    /^apps\/owner\/lib\/(?:self-serve-auth-authority|self-serve-logto-provider)\//,
    /^apps\/customer-panel\/lib\/panel-auth-authority\//,
    /^apps\/owner\/lib\/panel-browser-binding\/(?:start-executor|internal-gateway)\.ts$/,
    /^apps\/owner\/lib\/self-serve-http\/(?:runtime|internal-callback-gateway)\.ts$/,
    /^apps\/owner\/lib\/self-serve-oidc\.ts$/,
    /^apps\/owner\/lib\/saas-persistence\/postgres-oidc-transaction-store\.ts$/,
    /^apps\/customer-panel\/lib\/panel-browser-binding-bootstrap\/(?:handler|transport)\.ts$/,
    /^apps\/customer-panel\/lib\/panel-session-completion\/(?:completion|transport)\.ts$/,
    /^apps\/customer-panel\/lib\/self-serve-callback-edge\/callback-request\.ts$/,
    /^apps\/(?:owner|customer-panel)\/package\.json$/,
    /^package-lock\.json$/,
    /^tests\/saas-phase2\/staging-auth-(?:runtime|e2e)\//,
  ];
  const unexpected = changedFiles().filter((path) => !allowed.some((pattern) => pattern.test(path)));
  assert.deepEqual(unexpected, []);
});

test("mounted routes remain thin while immutable defaults lazily resolve only approved staging", () => {
  const routePaths = [
    "apps/owner/app/api/self-serve/register/route.ts",
    "apps/owner/app/api/internal/self-serve/browser-binding/route.ts",
    "apps/owner/app/api/internal/self-serve/oidc-callback/route.ts",
    "apps/customer-panel/app/auth/bootstrap/route.ts",
    "apps/customer-panel/app/auth/callback/route.ts",
  ];
  assert.equal(routePaths.every((path) => existsSync(resolve(ROOT, path))), true);
  for (const source of routePaths.map(read)) {
    assert.match(source, /getDefault(?:OwnerSelfServe|CustomerPanel)AuthRouteSet/);
    assert.equal(source.includes("auth-composition"), false);
    assert.equal(source.includes("CompositionApproval"), false);
  }
  assert.match(
    read("apps/owner/lib/self-serve-auth-route-mount/route-set.ts"),
    /self-serve-auth-route-runtime\/default\.ts/,
  );
  assert.match(
    read("apps/customer-panel/lib/panel-auth-route-mount/route-set.ts"),
    /panel-auth-route-runtime\/default\.ts/,
  );
  assert.match(read("apps/owner/lib/self-serve-registration-orchestrator.ts"), /SELF_SERVE_SAAS_REGISTRATION_ENABLED = false/);
  assert.match(read("apps/customer-panel/lib/config.ts"), /CUSTOMER_PANEL_AUTH_ENABLED = false/);
});

test("shared request parser and gate exist once and legacy handler delegates to them", () => {
  const request = read("apps/owner/lib/self-serve-http/registration-request.ts");
  const legacy = read("apps/owner/lib/self-serve-http/registration-start.ts");
  const bridge = read("apps/owner/lib/self-serve-browser-bound-registration/handler.ts");
  assert.equal((request.match(/function parseStrictJsonObject/g) ?? []).length, 1);
  assert.equal((request.match(/runtime\.verifyRequest/g) ?? []).length, 1);
  assert.equal(legacy.includes("parseStrictJsonObject"), false);
  assert.equal(bridge.includes("parseStrictJsonObject"), false);
  assert.match(legacy, /processSelfServeRegistrationRequest/);
  assert.match(bridge, /processSelfServeRegistrationRequest/);
});

test("bridge is fixed auto-POST HTML with strict CSP and no Owner redirect/cookie authority", () => {
  const html = read("apps/owner/lib/self-serve-browser-bound-registration/auto-post-html.ts");
  const handler = read("apps/owner/lib/self-serve-browser-bound-registration/handler.ts");
  assert.match(html, /method=\"post\"/);
  assert.match(html, /PANEL_BROWSER_BOOTSTRAP_URL/);
  assert.match(html, /name=\"bootstrapCredential\"/);
  assert.match(html, /name=\"providerAuthorizationUrl\"/);
  assert.equal((html.match(/type=\"hidden\"/g) ?? []).length, 2);
  assert.match(html, /script-src 'nonce-/);
  for (const forbidden of ["unsafe-inline", "unsafe-eval", "data:", "blob:"]) {
    assert.equal(html.includes(forbidden), false);
  }
  assert.equal(/headers:\s*\{[^}]*location:/s.test(handler), false);
  assert.equal(/headers:\s*\{[^}]*set-cookie:/s.test(handler), false);
  assert.equal(handler.includes("authorizationUrl"), false);
});

test("new compositions are injected-only, secret-free, unmounted, and contain no environment or provider network access", () => {
  const paths = changedFiles().filter((path) =>
    path.endsWith(".ts") && !path.endsWith(".test.ts") &&
    (path.includes("self-serve-auth-composition") || path.includes("panel-auth-composition")),
  );
  const source = paths.map(read).join("\n");
  assert.equal(source.includes("process.env"), false);
  assert.equal(source.includes("globalThis.fetch"), false);
  assert.equal(source.includes("node:http"), false);
  assert.equal(source.includes("node:https"), false);
  assert.equal(source.includes("redirect: \"follow\""), false);
  assert.equal(source.includes("production" + "Activation: \"allowed\""), false);
  assert.match(source, /disabled_unmounted/);
  assert.match(source, /route_mount_and_staging_e2e/);
});

test("migrations, contracts, unrelated authorities, and infrastructure are byte-unchanged", () => {
  const protectedPaths = [
    "apps/owner/scripts/sql/saas",
    "apps/owner/lib/self-serve-registration-orchestrator.ts",
    "apps/owner/lib/self-serve-http/oidc-callback-completion.ts",
    "apps/owner/lib/self-serve-registration-completion.ts",
    "apps/owner/lib/panel-browser-binding/postgres-repository.ts",
    "apps/owner/lib/panel-session-handoff",
    "apps/customer-panel/lib/panel-session-handoff",
    "packages/saas-contracts",
    "packages/saas-data",
    "packages/saas-tenant-core",
    "package.json",
    "deploy",
    ".github/workflows",
  ];
  assert.equal(git("diff", "--name-only", BASE, "--", ...protectedPaths), "");
  const changedAppRoutes = changedFiles()
    .filter((path) => path.startsWith("apps/owner/app/") || path.startsWith("apps/customer-panel/app/"))
    .sort();
  assert.deepEqual(changedAppRoutes, []);
});

test("the native PostgreSQL harness directly executes 40 genuine composition scenarios", () => {
  const harness = read("tests/saas-phase2/panel-auth-composition/postgres-harness.mjs");
  const names = [...harness.matchAll(/^  "(\d+)\. ([^"]+)",$/gm)];
  assert.equal(names.length, 40);
  assert.deepEqual(names.map((match) => Number(match[1])), Array.from({ length: 40 }, (_, index) => index + 1));
  assert.equal((harness.match(/await scenario\(/g) ?? []).length, 40);
  assert.match(harness, /import pg from "pg"/);
  assert.match(harness, /new Pool\(/);
  assert.match(harness, /createDisabledOwnerSelfServeAuthComposition/);
  assert.match(harness, /createDisabledCustomerPanelAuthComposition/);
  assert.match(harness, /PostgresRegistrationAttemptStore/);
  assert.match(harness, /PostgresOidcTransactionStore/);
  assert.match(harness, /createPostgresPanelBrowserBindingRepository/);
  assert.match(harness, /createPostgresPanelSessionHandoffRedeemer/);
  assert.match(harness, /createPostgresPanelSessionRepository/);
  assert.match(harness, /PostgresSaaSDataRepository/);
  assert.match(harness, /createPersistentRegistrationCompletionService/);
  assert.match(harness, /initdb/);
  assert.match(harness, /pg_ctl/);
  assert.match(harness, /native-postgresql/);
  for (const forbidden of [
    "unitPassed", "closedPassed", "completePipeline", "parseClosedHarness", "CLOSED_HARNESS",
    "panel-session-completion/postgres-harness.mjs",
  ]) assert.equal(harness.includes(forbidden), false);
  assert.equal(/browserBindingRepository\s*=\s*\{/.test(harness), false);
  assert.equal(/(?:registrationStore|oidcStore)\s*=\s*\{/.test(harness), false);
  assert.equal(harness.includes("production" + "ConnectionString"), false);
});
