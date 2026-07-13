import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { projectSafeCallbackResponse } from "../../../apps/customer-panel/lib/self-serve-callback-edge/safe-response.ts";
import { projectOwnerInternalCallbackResponse } from "../../../apps/owner/lib/self-serve-http/internal-callback-response.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const base = "840a4c4b5793223fefdad980cbfcf2b967a4df0d";
const correctionBase = "cab850e5157e1e59565440cd8b0037b800d0f26f";
const read = (file) => readFileSync(path.join(root, file), "utf8");
const customerRoute = read("apps/customer-panel/app/auth/callback/route.ts");
const ownerRoute = read("apps/owner/app/api/internal/self-serve/oidc-callback/route.ts");
const edge = read("apps/customer-panel/lib/self-serve-callback-edge/edge.ts");
const transport = read("apps/customer-panel/lib/self-serve-internal-callback-transport/transport.ts");
const gateway = read("apps/owner/lib/self-serve-http/internal-callback-gateway.ts");
const trust = read("apps/owner/lib/self-serve-http/verified-edge-trust.ts");
const customerResponseSource = read("apps/customer-panel/lib/self-serve-callback-edge/safe-response.ts");
const ownerResponseSource = read("apps/owner/lib/self-serve-http/internal-callback-response.ts");
const responseSources = `${customerResponseSource}\n${ownerResponseSource}`;

const canonicalMessages = Object.freeze({
  self_serve_callback_method_not_allowed: "Kimlik doğrulama dönüşü yalnızca GET kabul eder.",
  self_serve_callback_untrusted: "Kimlik doğrulama dönüşü doğrulanamadı.",
  self_serve_callback_forbidden: "Kimlik doğrulama dönüşüne izin verilmedi.",
  self_serve_callback_rate_limited: "Kimlik doğrulama dönüşü şu anda sınırlandırıldı.",
  self_serve_callback_gate_unavailable: "Kimlik doğrulama güvenlik kontrolü şu anda kullanılamıyor.",
  self_serve_callback_invalid: "Kimlik doğrulama dönüşü geçerli değil.",
  self_serve_callback_query_too_large: "Kimlik doğrulama dönüşü izin verilen boyutu aşıyor.",
  self_serve_oidc_provider_rejected: "Kimlik sağlayıcı kayıt isteğini reddetti.",
  self_serve_oidc_provider_unavailable: "Kimlik sağlayıcı şu anda kullanılamıyor; kayıt yeniden başlatılmalı.",
  self_serve_callback_restart_required: "Kayıt işlemi güvenli şekilde yeniden başlatılmalı.",
  self_serve_callback_recovery_failed: "Kimlik doğrulama dönüşü güvenli şekilde kurtarılamadı.",
  self_serve_oidc_invalid_state: "Kimlik doğrulama durumu geçerli değil.",
  self_serve_oidc_state_expired: "Kimlik doğrulama durumunun süresi doldu.",
  self_serve_oidc_nonce_mismatch: "Kimlik doğrulama yanıtı doğrulanamadı.",
  self_serve_oidc_issuer_mismatch: "Kimlik doğrulama yanıtı doğrulanamadı.",
  self_serve_oidc_audience_mismatch: "Kimlik doğrulama yanıtı doğrulanamadı.",
  self_serve_oidc_invalid_callback: "Kimlik doğrulama dönüşü geçerli değil.",
  self_serve_callback_unavailable: "Kimlik doğrulama işlemi güvenli şekilde tamamlanamadı.",
  self_serve_completion_pending: "Mağaza hazırlama işlemi sürüyor.",
  self_serve_completion_reconciliation_required: "Mağaza sonucu doğrulama bekliyor.",
  self_serve_completion_state_unknown: "Mağaza hazırlama durumu şu anda doğrulanamıyor.",
  self_serve_completion_rejected: "Mağaza hazırlama işlemi tamamlanamadı.",
});

const sharedSuccessStates = [
  "tenant_created_session_pending",
  "tenant_recovered_session_pending",
  "tenant_already_created_session_pending",
];

const sharedErrors = [
  ["rejected", "self_serve_callback_method_not_allowed", [405], false],
  ["rejected", "self_serve_callback_untrusted", [401], false],
  ["rejected", "self_serve_callback_forbidden", [403], false],
  ["rejected", "self_serve_callback_rate_limited", [429], true],
  ["rejected", "self_serve_callback_gate_unavailable", [503], true],
  ["rejected", "self_serve_callback_invalid", [400], false],
  ["rejected", "self_serve_callback_query_too_large", [413], false],
  ["rejected", "self_serve_oidc_provider_rejected", [400], false],
  ["rejected", "self_serve_oidc_invalid_state", [400], false],
  ["rejected", "self_serve_oidc_state_expired", [410], false],
  ["rejected", "self_serve_oidc_nonce_mismatch", [400], false],
  ["rejected", "self_serve_oidc_issuer_mismatch", [400], false],
  ["rejected", "self_serve_oidc_audience_mismatch", [400], false],
  ["rejected", "self_serve_oidc_invalid_callback", [400], false],
  ["rejected", "self_serve_callback_unavailable", [503], true],
  ["failed", "self_serve_callback_unavailable", [503], false],
  ["in_progress", "self_serve_completion_pending", [202], true],
  ["restart_required", "self_serve_callback_restart_required", [409], false, true],
  ["restart_required", "self_serve_oidc_provider_unavailable", [503], false, true],
  ["recovery_failed", "self_serve_callback_recovery_failed", [409, 503], false],
  ["commit_unknown", "self_serve_completion_reconciliation_required", [409], false],
  ["reconciliation_required", "self_serve_completion_reconciliation_required", [409], false],
  ["recovery_absent", "self_serve_completion_reconciliation_required", [409], false],
  ["completion_state_unknown", "self_serve_completion_state_unknown", [503], false],
  ["completion_failed", "self_serve_completion_rejected", [409], false],
  ["completion_rejected", "self_serve_completion_rejected", [409], false],
  ["completion_rejected", "self_serve_callback_unavailable", [503], false],
];

function sharedSuccessBody(state) {
  return {
    state,
    storeSlug: "ornek-magaza",
    storefrontUrl: "https://ornek-magaza.celebix.site",
    panelUrl: "https://panel.celebix.site",
    provisioningStatus: "ready",
    session: "pending",
  };
}

function sharedErrorBody([state, code, _statuses, retryable, restartRegistration]) {
  return {
    code,
    state,
    retryable,
    ...(restartRegistration ? { restartRegistration: true } : {}),
    message: canonicalMessages[code],
  };
}

function upstreamResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "set-cookie": "private=session", location: "https://owner-internal.example/private" },
  });
}

function changed() {
  const tracked = execFileSync("git", ["diff", "--name-only", base, "--"], { cwd: root, encoding: "utf8" });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" });
  return [...new Set(`${tracked}\n${untracked}`.trim().split("\n").filter(Boolean))].sort();
}

function correctionChanged() {
  const tracked = execFileSync("git", ["diff", "--name-only", correctionBase, "--"], { cwd: root, encoding: "utf8" });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" });
  return [...new Set(`${tracked}\n${untracked}`.trim().split("\n").filter(Boolean))].sort();
}

function matrixSource(source) {
  const declaration = source.indexOf("const RESPONSE_MATRIX");
  const start = source.indexOf("Object.freeze([", declaration);
  const end = source.indexOf("\n]);", start);
  assert.ok(declaration >= 0 && start >= 0 && end > start);
  return source.slice(start, end + 4);
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

test("response projectors own immutable, semantically identical, exact response matrices", () => {
  const customerMatrix = matrixSource(customerResponseSource);
  const ownerMatrix = matrixSource(ownerResponseSource);
  assert.equal(customerMatrix, ownerMatrix);
  assert.equal([...customerMatrix.matchAll(/Object\.freeze\(\{ state:/g)].length, 30);
  assert.match(customerMatrix, /state: "rejected", code: "self_serve_callback_unavailable", statuses: Object\.freeze\(\[503\]\), retryable: true/);
  assert.match(customerMatrix, /state: "completion_rejected", code: "self_serve_callback_unavailable", statuses: Object\.freeze\(\[503\]\), retryable: false/);
  assert.doesNotMatch(customerMatrix, /self_serve_oidc_state_replayed/);
});

test("response validation cannot accept generic message, retryable, status, or parsed-body authority", () => {
  assert.match(responseSources, /body\.message !== semantic\.message/);
  assert.match(responseSources, /message: semantic\.message/);
  assert.doesNotMatch(responseSources, /safeText\(body\.message|typeof body\.retryable\s*!==?\s*["']boolean["']/);
  assert.doesNotMatch(responseSources, /response\.status\s*[<>]=?\s*(?:200|300|400|500|599)/);
  assert.doesNotMatch(responseSources, /return\s+body\s*;/);
  assert.doesNotMatch(responseSources, /message:\s*body\.message/);
});

test("the complete valid B1B2A corpus has exact Owner to customer projection parity", async () => {
  const corpus = [
    ...sharedSuccessStates.map((state) => ({ status: 200, body: sharedSuccessBody(state) })),
    ...sharedErrors.flatMap((fixture) => fixture[2].map((status) => ({ status, body: sharedErrorBody(fixture) }))),
  ];
  for (const fixture of corpus) {
    const owner = await projectOwnerInternalCallbackResponse(upstreamResponse(fixture.body, fixture.status), 4_096);
    const ownerForCustomer = owner.clone();
    const ownerBody = await owner.json();
    const customer = await projectSafeCallbackResponse(ownerForCustomer, 4_096);
    assert.equal(owner.status, fixture.status);
    assert.equal(customer.status, fixture.status);
    assert.deepEqual(await customer.json(), ownerBody);
    for (const response of [owner, customer]) {
      assert.equal(response.headers.has("set-cookie"), false);
      assert.equal(response.headers.has("location"), false);
    }
  }
});

test("the same invalid corpus is rejected by both projectors without exposing raw messages", async () => {
  const untrusted = sharedErrors.find((entry) => entry[1] === "self_serve_callback_untrusted");
  const pending = sharedErrors.find((entry) => entry[0] === "in_progress");
  const restart = sharedErrors.find((entry) => entry[1] === "self_serve_callback_restart_required");
  const reconciliation = sharedErrors.find((entry) => entry[0] === "commit_unknown");
  const invalid = [
    { status: 401, body: { ...sharedErrorBody(untrusted), message: "owner@example.com state=secret authorization_code=secret" } },
    { status: 503, body: sharedErrorBody(untrusted) },
    { status: 202, body: { ...sharedErrorBody(pending), retryable: false } },
    { status: 503, body: { ...sharedErrorBody(reconciliation), retryable: true } },
    { status: 409, body: (() => { const body = sharedErrorBody(restart); delete body.restartRegistration; return body; })() },
    { status: 202, body: { ...sharedErrorBody(pending), restartRegistration: true } },
    { status: 202, body: { ...sharedErrorBody(pending), state: "commit_unknown" } },
    { status: 202, body: { ...sharedErrorBody(pending), code: "self_serve_completion_rejected" } },
    { status: 202, body: { ...sharedErrorBody(pending), internal: "secret" } },
  ];
  for (const fixture of invalid) {
    for (const projector of [projectOwnerInternalCallbackResponse, projectSafeCallbackResponse]) {
      await assert.rejects(projector(upstreamResponse(fixture.body, fixture.status), 4_096));
    }
  }
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

test("the correction is confined to the Atlas-approved projection files", () => {
  const allowed = new Set([
    "apps/customer-panel/lib/self-serve-callback-edge/safe-response.ts",
    "apps/customer-panel/lib/self-serve-callback-edge/edge.test.ts",
    "apps/customer-panel/lib/self-serve-callback-edge/safe-response.test.ts",
    "apps/customer-panel/lib/self-serve-internal-callback-transport/transport.test.ts",
    "apps/owner/lib/self-serve-http/internal-callback-response.ts",
    "apps/owner/lib/self-serve-http/internal-callback-gateway.test.ts",
    "apps/owner/lib/self-serve-http/internal-callback-response.test.ts",
    "tests/saas-phase2/http-wiring/callback-edge-security.test.mjs",
    "tests/saas-phase2/http-wiring/static-security.test.mjs",
    "tests/saas-phase2/registration-session/postgres-harness.mjs",
  ]);
  for (const file of correctionChanged()) assert.equal(allowed.has(file), true, file);
});

test("the correction leaves fixtures, transport, trust, B1B2A runtime, routes, SQL, packages, and infrastructure byte-unchanged", () => {
  const protectedPaths = [
    "apps/owner/lib/self-serve-http/registration-start.test.ts",
    "tests/saas-phase1/phase1-flow.test.ts",
    "apps/owner/lib/self-serve-http/oidc-callback-completion.ts",
    "apps/owner/lib/self-serve-http/runtime.ts",
    "apps/customer-panel/lib/self-serve-callback-edge/edge.ts",
    "apps/customer-panel/lib/self-serve-internal-callback-transport/transport.ts",
    "apps/owner/lib/self-serve-http/internal-callback-gateway.ts",
    "apps/owner/lib/self-serve-http/verified-edge-trust.ts",
    "apps/customer-panel/app/auth/callback/route.ts",
    "apps/owner/app/api/internal/self-serve/oidc-callback/route.ts",
    "apps/owner/scripts/sql/saas",
    "packages/saas-contracts",
    "packages/saas-data",
    "packages/saas-tenant-core",
    "package.json",
    "package-lock.json",
    "deploy",
    ".github/workflows",
  ];
  const output = execFileSync("git", ["diff", "--name-only", correctionBase, "--", ...protectedPaths], { cwd: root, encoding: "utf8" });
  assert.equal(output.trim(), "");
});
