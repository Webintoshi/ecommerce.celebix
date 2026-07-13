import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const base = "840a4c4b5793223fefdad980cbfcf2b967a4df0d";
const read = (file) => readFileSync(path.join(root, file), "utf8");
const customerRoute = read("apps/customer-panel/app/auth/callback/route.ts");
const ownerRoute = read("apps/owner/app/api/internal/self-serve/oidc-callback/route.ts");
const edge = read("apps/customer-panel/lib/self-serve-callback-edge/edge.ts");
const transport = read("apps/customer-panel/lib/self-serve-internal-callback-transport/transport.ts");
const gateway = read("apps/owner/lib/self-serve-http/internal-callback-gateway.ts");
const trust = read("apps/owner/lib/self-serve-http/verified-edge-trust.ts");
const responseSources = [
  read("apps/customer-panel/lib/self-serve-callback-edge/safe-response.ts"),
  read("apps/owner/lib/self-serve-http/internal-callback-response.ts"),
].join("\n");

function changed() {
  const tracked = execFileSync("git", ["diff", "--name-only", base, "--"], { cwd: root, encoding: "utf8" });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" });
  return [...new Set(`${tracked}\n${untracked}`.trim().split("\n").filter(Boolean))].sort();
}

test("both production routes remain disabled and cannot construct activation or dependencies", () => {
  assert.match(customerRoute, /createDisabledCustomerPanelSelfServeCallbackEdge/);
  assert.match(ownerRoute, /createDisabledOwnerInternalSelfServeCallbackGateway/);
  assert.doesNotMatch(customerRoute, /createCustomerPanelCallbackEdgeApproval|createCustomerPanelSelfServeCallbackEdge|process\.env|\bfetch\b|HMAC|secret/i);
  assert.doesNotMatch(ownerRoute, /createOwnerInternalCallbackGatewayApproval|createOwnerInternalSelfServeCallbackGateway|process\.env|\bfetch\b|\bPool\b|secret|keys/i);
  assert.doesNotMatch(customerRoute, /export\s+(?:async\s+)?function\s+POST|export\s+const\s+POST/);
});

test("application edges do not import each other or legacy panel session completion", () => {
  const customerNew = `${edge}\n${transport}\n${customerRoute}`;
  const ownerNew = `${gateway}\n${trust}\n${ownerRoute}`;
  assert.doesNotMatch(customerNew, /apps\/owner|\.\.\/.*owner\/|registration-completion|(?:^|["'/])session\.ts|completePanelRegistration|recoverPanelRegistration|createPanelOidcCallbackHandler|createPanelSession|buildPanelSessionSetCookie|cookies\s*\(/m);
  assert.doesNotMatch(ownerNew, /apps\/customer-panel|\.\.\/.*customer-panel\//);
  assert.doesNotMatch(`${customerNew}\n${ownerNew}`, /globalThis\.fetch|Set-Cookie|session_created|status:\s*303|NextResponse\.redirect/);
});

test("sealed approvals are staging/test-only and default routes cannot mint them", () => {
  assert.match(edge, /phase2b1b2b_customer_panel_callback_edge/);
  assert.match(gateway, /phase2b1b2b_owner_internal_callback_gateway/);
  assert.match(edge, /disposable_test.*approved_staging/s);
  assert.match(gateway, /disposable_test.*approved_staging/s);
  assert.doesNotMatch(`${edge}\n${gateway}\n${trust}\n${transport}`, /["']production["']/);
  assert.doesNotMatch(`${customerRoute}\n${ownerRoute}`, /Approval\(/);
});

test("protocol constants, canonical body, raw-body HMAC, timestamp bounds, and constant-time compare are exact", () => {
  const constants = read("packages/platform-config/src/saas.ts");
  assert.match(constants, /SELF_SERVE_INTERNAL_CALLBACK_PATH\s*=\s*"\/api\/internal\/self-serve\/oidc-callback"/);
  assert.match(constants, /SELF_SERVE_INTERNAL_CALLBACK_SCHEMA_VERSION\s*=\s*1/);
  assert.match(transport, /JSON\.stringify\(\{[\s\S]*schemaVersion: SELF_SERVE_INTERNAL_CALLBACK_SCHEMA_VERSION,[\s\S]*callbackUrl: exactPublicCallbackUrl\(callbackUrl\),[\s\S]*\}\)/);
  assert.match(transport, /createHash\("sha256"\).*bytes/s);
  assert.match(transport, /celebix-callback-v1\\n\$\{timestamp\}\\n\$\{digest\}/);
  assert.match(gateway, /MAXIMUM_TIMESTAMP_AGE_MS\s*=\s*60_000/);
  assert.match(gateway, /MAXIMUM_FUTURE_SKEW_MS\s*=\s*5_000/);
  assert.match(gateway, /timingSafeEqual\(signatureBytes, expected\)/);
});

test("gateway authenticates exact raw bytes before JSON parsing or business invocation", () => {
  const handler = gateway.slice(gateway.indexOf("return async function ownerInternalSelfServeCallbackGateway"));
  const rawRead = handler.indexOf("boundedRequestBytes(request");
  const digest = handler.indexOf("createHash(\"sha256\")");
  const key = handler.indexOf("keys.get(keyId)");
  const compare = handler.indexOf("timingSafeEqual(signatureBytes, expected)");
  const parse = handler.indexOf("parseCanonicalEnvelope(rawBytes)");
  const invoke = handler.indexOf("boundary.invokeWithVerifiedContext");
  assert.equal([rawRead, digest, key, compare, parse, invoke].every((index) => index >= 0), true);
  assert.equal(rawRead < digest && digest < key && key < compare && compare < parse && parse < invoke, true);
  assert.match(gateway, /raw !== canonical/);
});

test("private trust is closure-owned, non-enumerable, active-only, and cross-boundary safe", () => {
  assert.match(trust, /Symbol\("phase2b1b2b_verified_edge_trust"\)/);
  assert.match(trust, /const active = new WeakSet/);
  assert.match(trust, /active\.add\(context\)/);
  assert.match(trust, /active\.delete\(context\)/);
  assert.match(trust, /enumerable:\s*false/);
  assert.match(trust, /Object\.freeze\(context\)/);
});

test("authorization output requires exact response_type code and response_mode query", () => {
  const oidc = read("apps/owner/lib/self-serve-oidc.ts");
  assert.match(oidc, /hasExactly\(url, "response_type", "code"\)/);
  assert.match(oidc, /hasExactly\(url, "response_mode", "query"\)/);
  assert.match(oidc, /url\.searchParams\.has\("code_verifier"\)/);
  assert.doesNotMatch(oidc, /response_mode[\s\S]{0,80}includes\("fragment"\)/);
});

test("safe response projectors are independently bounded and exact", () => {
  assert.match(responseSources, /maximumBytes/);
  assert.match(responseSources, /Object\.keys\(value\)\.sort\(\)/);
  assert.doesNotMatch(responseSources, /operationId|attemptId|accessToken|refreshToken|idToken/);
  assert.doesNotMatch(responseSources, /return\s+response\s*;/);
  assert.doesNotMatch(responseSources, /headers\.set\(["'](?:set-cookie|location)["']/i);
});

test("Atlas-approved fixture exceptions are each exactly one response_mode query line", () => {
  for (const [file, expected] of [
    ["apps/owner/lib/self-serve-http/registration-start.test.ts", '+    url.searchParams.set("response_mode", "query");'],
    ["tests/saas-phase1/phase1-flow.test.ts", '+      url.searchParams.set("response_mode", "query");'],
  ]) {
    const output = execFileSync("git", ["diff", "-U0", base, "--", file], { cwd: root, encoding: "utf8" });
    const additions = output.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"));
    assert.deepEqual(additions, [expected], file);
  }
});

test("the current diff is confined to the approved Phase 2B1B2B scope", () => {
  for (const file of changed()) {
    assert.equal(
      file === "apps/customer-panel/app/auth/callback/route.ts" ||
      file === "apps/customer-panel/app/auth/callback/route.test.ts" ||
      file.startsWith("apps/customer-panel/lib/self-serve-callback-edge/") ||
      file.startsWith("apps/customer-panel/lib/self-serve-internal-callback-transport/") ||
      file.startsWith("apps/owner/app/api/internal/self-serve/oidc-callback/") ||
      /^apps\/owner\/lib\/self-serve-http\/(?:internal-callback-|verified-edge-)/.test(file) ||
      file === "apps/owner/lib/self-serve-oidc.ts" ||
      file === "apps/owner/lib/self-serve-oidc.test.ts" ||
      file === "apps/owner/lib/self-serve-http/registration-start.test.ts" ||
      file === "tests/saas-phase1/phase1-flow.test.ts" ||
      file === "packages/platform-config/src/saas.ts" ||
      file.startsWith("tests/saas-phase2/http-wiring/") ||
      file === "tests/saas-phase2/registration-session/postgres-harness.mjs",
      true,
      file,
    );
  }
});

test("SQL, manifests, packages, lockfile, flags, legacy sessions, admin, storefront, deploy, and workflows are unchanged", () => {
  const files = changed();
  assert.equal(files.some((file) => file.endsWith(".sql") || file.endsWith("manifest.json")), false, files.join("\n"));
  assert.equal(files.some((file) => /(?:^|\/)package(?:-lock)?\.json$/.test(file)), false, files.join("\n"));
  assert.equal(files.some((file) => /^(?:apps\/admin|apps\/admin-shared|apps\/(?:storefront|web|site)|deploy|\.github\/workflows)\//.test(file)), false, files.join("\n"));
  assert.equal(files.includes("apps/customer-panel/lib/registration-completion.ts"), false);
  assert.equal(files.includes("apps/customer-panel/lib/session.ts"), false);
  assert.match(read("apps/customer-panel/lib/config.ts"), /CUSTOMER_PANEL_AUTH_ENABLED\s*=\s*false/);
  assert.match(read("apps/owner/lib/self-serve-registration-orchestrator.ts"), /SELF_SERVE_SAAS_REGISTRATION_ENABLED\s*=\s*false/);
});
