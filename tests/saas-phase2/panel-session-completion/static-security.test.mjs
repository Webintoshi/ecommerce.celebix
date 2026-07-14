import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const base = "2746e76b56e0199d110692f54068cbc5f1d25ba7";

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function read(file) {
  return readFileSync(path.join(root, file), "utf8");
}

function changedFiles() {
  return [...new Set([
    ...git(["diff", "--name-only", base]).split("\n"),
    ...git(["ls-files", "--others", "--exclude-standard"]).split("\n"),
  ].filter(Boolean))];
}

function sourceFiles(directory) {
  const output = [];
  for (const entry of readdirSync(path.join(root, directory))) {
    const relative = path.join(directory, entry);
    const stats = statSync(path.join(root, relative));
    if (stats.isDirectory()) output.push(...sourceFiles(relative));
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) output.push(relative);
  }
  return output;
}

test("the Phase 2B2B2A diff is confined to the exact Atlas allowlist", () => {
  const changed = changedFiles();
  const exact = new Set([
    "apps/customer-panel/lib/self-serve-callback-edge/callback-request.ts",
    "apps/customer-panel/lib/self-serve-callback-edge/callback-request.test.ts",
    "apps/customer-panel/lib/self-serve-callback-edge/edge.ts",
    "apps/customer-panel/lib/self-serve-callback-edge/edge.test.ts",
    "apps/customer-panel/lib/self-serve-internal-callback-transport/transport.ts",
    "apps/customer-panel/lib/self-serve-internal-callback-transport/transport.test.ts",
    "apps/owner/lib/panel-session-handoff/internal-callback-handler.ts",
    "apps/owner/lib/panel-session-handoff/internal-callback-handler.test.ts",
    "apps/owner/lib/panel-session-handoff/internal-response.ts",
    "apps/owner/lib/panel-session-handoff/internal-response.test.ts",
    "apps/owner/lib/panel-session-handoff/internal-gateway.ts",
    "apps/owner/lib/panel-session-handoff/internal-gateway.test.ts",
    "apps/owner/lib/self-serve-http/internal-callback-gateway.ts",
    "apps/owner/lib/self-serve-http/internal-callback-gateway.test.ts",
    "packages/platform-config/src/saas.ts",
    "packages/platform-config/src/saas.test.ts",
  ]);
  for (const file of changed) {
    assert.equal(
      exact.has(file) || file.startsWith("apps/customer-panel/lib/panel-session-completion/") ||
      file.startsWith("apps/customer-panel/lib/panel-browser-binding/") ||
      file.startsWith("apps/customer-panel/lib/panel-browser-binding-bootstrap/") ||
      file.startsWith("apps/owner/lib/panel-browser-binding/") ||
      file === "apps/owner/scripts/sql/saas/202607140017_panel_browser_bindings.up.sql" ||
      file === "apps/owner/scripts/sql/saas/202607140017_panel_browser_bindings.down.sql" ||
      file === "apps/owner/scripts/sql/saas/phase2b2b2a1-manifest.json" ||
      file.startsWith("tests/saas-phase2/panel-browser-binding/") ||
      file.startsWith("tests/saas-phase2/panel-session-completion/") ||
      file.startsWith("tests/saas-phase2/panel-session-handoffs/") ||
      file.startsWith("tests/saas-phase2/http-wiring/") || file === "tests/saas-phase2/registration-session/postgres-harness.mjs",
      true,
      file,
    );
  }
});

test("migrations, manifests, frozen authorities, legacy completion, packages, and infrastructure are unchanged", () => {
  const changed = changedFiles();
  const forbidden = [
    /^apps\/owner\/scripts\/sql\/saas\/2026071400(?:0[1-9]|1[0-6])_/,
    /^apps\/owner\/scripts\/sql\/saas\/(?!phase2b2b2a1-manifest).*manifest\.json$/,
    /^packages\/(?!platform-config\/src\/saas(?:\.test)?\.ts$)/,
    /^package(?:-lock)?\.json$/,
    /^apps\/(?:admin|storefront|dedicated|hemenaku|derycraft)\//i,
    /^deploy\//, /^\.github\/workflows\//,
    /^apps\/customer-panel\/app\//, /^apps\/owner\/app\//,
    /^apps\/customer-panel\/lib\/session\.ts$/,
    /^apps\/customer-panel\/lib\/registration-completion\.ts$/,
    /^apps\/customer-panel\/lib\/panel-session-(?:handoff|persistence)\//,
    /^apps\/owner\/lib\/panel-session-handoff\/(?:activation|credential-codec|initial-callback-executor|initial-callback-grant|postgres-handoff-issuer)(?:\.test)?\.ts$/,
    /^apps\/owner\/lib\/self-serve-http\/(?:runtime|oidc-callback-completion)(?:\.test)?\.ts$/,
  ];
  for (const file of changed) assert.equal(forbidden.some((pattern) => pattern.test(file)), false, file);
});

test("default customer and Owner routes remain byte-identical and import no enabled factory", () => {
  for (const file of [
    "apps/customer-panel/app/auth/callback/route.ts",
    "apps/owner/app/api/internal/self-serve/oidc-callback/route.ts",
  ]) {
    assert.equal(read(file), execFileSync("git", ["show", `${base}:${file}`], { cwd: root, encoding: "utf8" }));
    assert.doesNotMatch(read(file), /panel-session-completion|panel-session-handoff\/internal-gateway|createPanelSessionCompletionApproval/);
  }
  assert.match(read("apps/customer-panel/app/auth/callback/route.ts"), /createDisabledCustomerPanelSelfServeCallbackEdge/);
  assert.match(read("apps/owner/app/api/internal/self-serve/oidc-callback/route.ts"), /createDisabledOwnerInternalSelfServeCallbackGateway/);
});

test("new application source contains no activation, env, provider networking, legacy helper, browser redirect authority, or generic SQL", () => {
  const files = [
    ...sourceFiles("apps/customer-panel/lib/panel-session-completion"),
    "apps/customer-panel/lib/self-serve-callback-edge/callback-request.ts",
    "apps/owner/lib/panel-session-handoff/internal-callback-handler.ts",
    "apps/owner/lib/panel-session-handoff/internal-response.ts",
    "apps/owner/lib/panel-session-handoff/internal-gateway.ts",
  ];
  const forbidden = /process\.env|CUSTOMER_PANEL_AUTH_ENABLED|SELF_SERVE_SAAS_REGISTRATION_ENABLED|completePanelRegistration|recoverPanelRegistration|recoverConsumedCallback|createPanelSession\(|InMemoryPanelSessionStore|buildPanelSessionSetCookie|returnTo|x-forwarded-host|x-forwarded-proto|SET LOCAL ROLE|saas\.[a-z_]+\(/;
  for (const file of files) assert.doesNotMatch(read(file), forbidden, file);
});

test("response verification occurs before UTF-8 decode and JSON projection, with no retry loop", () => {
  const source = read("apps/customer-panel/lib/panel-session-completion/transport.ts");
  const flow = source.slice(source.indexOf("async complete(callbackUrl"));
  const verified = flow.indexOf("timingSafeEqual(responseSignature, expected)");
  const decoded = flow.indexOf('new TextDecoder("utf-8", { fatal: true }).decode(rawBytes)');
  const parsed = flow.indexOf("parseCanonicalResult(raw, response.status)");
  assert.ok(verified >= 0 && decoded > verified && parsed > decoded);
  assert.doesNotMatch(flow, /for\s*\(|while\s*\(|retry/i);
  assert.match(source, /response\.url !== endpoint/);
  assert.match(source, /response\.redirected/);
  assert.match(source, /PANEL_SESSION_COMPLETION_RESPONSE_MAXIMUM_BYTES/);
});

test("request authentication verifies HMAC before canonical envelope parsing and callback processing", () => {
  const source = read("apps/owner/lib/self-serve-http/internal-callback-gateway.ts");
  const authenticate = source.slice(source.indexOf("export function createOwnerInternalCallbackRawRequestAuthenticator"), source.indexOf("export function copyAuthenticatedOwnerInternalCallbackRawBody"));
  assert.match(authenticate, /timingSafeEqual\(signatureBytes, expected\)/);
  const gateway = read("apps/owner/lib/panel-session-handoff/internal-gateway.ts");
  const authenticated = gateway.indexOf("authenticator.authenticate(request)");
  const parsed = gateway.indexOf("parseCanonicalPanelSessionCompletionEnvelope(", authenticated);
  const handled = gateway.indexOf("handler.handle(", parsed);
  assert.ok(authenticated >= 0 && parsed > authenticated && handled > parsed);
});

test("signed Owner response binds request timestamp, request digest, status, and raw response digest", () => {
  const owner = read("apps/owner/lib/panel-session-handoff/internal-response.ts");
  const customer = read("apps/customer-panel/lib/panel-session-completion/transport.ts");
  for (const source of [owner, customer]) {
    assert.match(source, /PANEL_SESSION_HANDOFF_RESPONSE_SIGNATURE_DOMAIN/);
    assert.match(source, /requestTimestamp/);
    assert.match(source, /requestBodyDigest/);
    assert.match(source, /String\(input\.status\)/);
    assert.match(source, /responseBodyDigest/);
  }
  assert.match(owner, /signWithAuthenticatedInternalCallbackRequest/);
  assert.match(customer, /timingSafeEqual/);
});

test("persistent cookie and browser response are fixed, secure, host-only, and credential-minimal", () => {
  const cookie = read("apps/customer-panel/lib/panel-session-completion/cookie.ts");
  const completion = read("apps/customer-panel/lib/panel-session-completion/completion.ts");
  assert.match(cookie, /__Host-celebix_panel=\$\{credential\}; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=/);
  assert.doesNotMatch(cookie, /Domain=|SameSite=None|local-http|encodeURIComponent/);
  assert.match(completion, /location: PANEL_HOME_URL/);
  assert.match(completion, /"referrer-policy": "no-referrer"/);
  assert.match(completion, /"x-content-type-options": "nosniff"/);
  assert.doesNotMatch(completion, /handoffCredential.*location|credential.*location/i);
});

test("the disposable PostgreSQL 16 harness declares exactly 58 scenarios and full cleanup evidence", () => {
  const harness = read("tests/saas-phase2/panel-session-completion/postgres-harness.mjs");
  assert.equal((harness.match(/await scenario\(/g) ?? []).length, 58);
  assert.match(harness, /assert\.equal\(scenarios, 58\)/);
  assert.match(harness, /SHOW server_version_num/);
  assert.match(harness, /sessionCompletionPipeline: "PASS"/);
  assert.match(harness, /signedOwnerResponse: "PASS"/);
  assert.match(harness, /secureHostCookie: "PASS"/);
  assert.match(harness, /backup and restore/);
  assert.match(harness, /complete cleanup/);
  assert.match(harness, /external network count zero/);
  assert.match(harness, /production connection count zero/);
});
