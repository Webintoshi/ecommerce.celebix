import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const ROOT = resolve(import.meta.dirname, "../../..");
const BASE = "dc3c53464d137e8b597b93e5e3f75bb70bab35f4";

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

test("Phase 2B2B2B changes remain confined to the exact Atlas allowlist", () => {
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
  ];
  const unexpected = changedFiles().filter((path) => !allowed.some((pattern) => pattern.test(path)));
  assert.deepEqual(unexpected, []);
});

test("default Owner and customer-panel routes remain disabled and import no composition authority", () => {
  const ownerRegistration = read("apps/owner/app/api/self-serve/register/route.ts");
  const customerCallback = read("apps/customer-panel/app/auth/callback/route.ts");
  const ownerCallback = read("apps/owner/app/api/internal/self-serve/oidc-callback/route.ts");
  assert.match(ownerRegistration, /DisabledSelfServeRuntime|createDisabledSelfServeRuntime/);
  assert.match(customerCallback, /createDisabledCustomerPanelSelfServeCallbackEdge/);
  assert.match(ownerCallback, /createDisabledOwnerInternalSelfServeCallbackGateway/);
  assert.equal(existsSync(resolve(ROOT, "apps/customer-panel/app/auth/bootstrap/route.ts")), false);
  for (const source of [ownerRegistration, customerCallback, ownerCallback]) {
    assert.equal(source.includes("auth-composition"), false);
    assert.equal(source.includes("CompositionApproval"), false);
  }
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
  assert.match(source, /ready_unmounted/);
  assert.match(source, /disabled_unmounted/);
  assert.match(source, /route_mount_and_staging_e2e/);
});

test("migrations, manifests, frozen authorities, routes, packages, and infrastructure are byte-unchanged", () => {
  const protectedPaths = [
    "apps/owner/app",
    "apps/customer-panel/app",
    "apps/owner/scripts/sql/saas",
    "apps/owner/lib/self-serve-http/runtime.ts",
    "apps/owner/lib/self-serve-registration-orchestrator.ts",
    "apps/owner/lib/self-serve-oidc.ts",
    "apps/owner/lib/self-serve-http/oidc-callback-completion.ts",
    "apps/owner/lib/self-serve-registration-completion.ts",
    "apps/owner/lib/panel-browser-binding/start-executor.ts",
    "apps/owner/lib/panel-browser-binding/postgres-repository.ts",
    "apps/owner/lib/panel-session-handoff",
    "apps/customer-panel/lib/panel-session-completion",
    "apps/customer-panel/lib/panel-session-handoff",
    "package.json",
    "package-lock.json",
    "deploy",
    ".github/workflows",
  ];
  assert.equal(git("diff", "--name-only", BASE, "--", ...protectedPaths), "");
});

test("the native PostgreSQL harness declares exactly the 40 Atlas scenarios and no external backend", () => {
  const harness = read("tests/saas-phase2/panel-auth-composition/postgres-harness.mjs");
  const names = [...harness.matchAll(/^  "(\d+)\. ([^"]+)",$/gm)];
  assert.equal(names.length, 40);
  assert.deepEqual(names.map((match) => Number(match[1])), Array.from({ length: 40 }, (_, index) => index + 1));
  assert.match(harness, /panel-session-completion\/postgres-harness\.mjs/);
  assert.match(harness, /native-postgresql/);
  assert.equal(/\b(?:docker|podman)\b/i.test(harness), false);
  assert.equal(harness.includes("production" + "ConnectionString"), false);
});
