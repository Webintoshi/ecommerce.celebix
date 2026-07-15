import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const base = "0501606272fa41dfabd23058bad50cbaece0c2cd";
const correctionBase = base;
const read = (file) => readFileSync(path.join(root, file), "utf8");
const sourceFiles = [
  "apps/owner/lib/self-serve-http/runtime.ts",
  "apps/owner/lib/self-serve-http/registration-request.ts",
  "apps/owner/lib/self-serve-http/registration-start.ts",
  "apps/owner/lib/self-serve-http/oidc-callback-completion.ts",
];
const source = sourceFiles.map(read).join("\n");
const route = read("apps/owner/app/api/self-serve/register/route.ts");
const changed = () => {
  const tracked = execFileSync("git", ["diff", "--name-only", base, "--"], { cwd: root, encoding: "utf8" });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" });
  return [...new Set(`${tracked}\n${untracked}`.trim().split("\n").filter(Boolean))].sort();
};
const correctionChanged = () => execFileSync(
  "git",
  ["diff", "--name-only", correctionBase, "--"],
  { cwd: root, encoding: "utf8" },
).trim().split("\n").filter(Boolean).sort();

test("production registration and customer authentication flags remain false", () => {
  assert.match(read("apps/owner/lib/self-serve-registration-orchestrator.ts"), /SELF_SERVE_SAAS_REGISTRATION_ENABLED = false/);
  assert.match(read("apps/customer-panel/lib/config.ts"), /CUSTOMER_PANEL_AUTH_ENABLED = false/);
  assert.doesNotMatch(source, /SELF_SERVE_SAAS_REGISTRATION_ENABLED\s*=\s*true|CUSTOMER_PANEL_AUTH_ENABLED\s*=\s*true/);
});

test("the default route resolves only the immutable disabled route set without body parsing or persistence authority", () => {
  assert.match(route, /getDefaultOwnerSelfServeAuthRouteSet/);
  assert.match(read("apps/owner/lib/self-serve-auth-route-mount/route-set.ts"), /const defaultRouteSet = createDisabledOwnerSelfServeAuthRouteSet\(\);/);
  assert.doesNotMatch(route, /createPersistentSelfServeRuntime|createSelfServeHttpActivationApproval|process\.env|DATABASE_URL|POSTGRES_URL|\bPool\b|from\s+["']pg["']/);
  assert.doesNotMatch(route, /request\.(?:text|json|formData|arrayBuffer|blob)\s*\(/);
});

test("the visible registration page and legacy Owner callback remain non-operational", () => {
  assert.match(read("apps/owner/app/kayit/page.tsx"), /SELF_SERVE_SAAS_REGISTRATION_ENABLED/);
  assert.match(read("apps/owner/components/self-serve/SelfServeDirectRegistrationForm.tsx"), /disabled=\{!enabled\}/);
  assert.match(read("apps/owner/app/api/self-serve/auth/callback/route.ts"), /panel_callback_required/);
  assert.doesNotMatch(route, /auth\/callback|createSelfServeOidcCallbackCompletionHandler/);
});

test("handler composition has no environment activation, direct pg, pool, generic fetch, or memory fallback", () => {
  assert.doesNotMatch(source, /process\.env|DATABASE_URL|POSTGRES_URL|from\s+["']pg["']|require\s*\(\s*["']pg["']|new\s+Pool\s*\(|globalThis\.fetch|\bfetch\s*\(/);
  assert.doesNotMatch(source, /fallback.{0,40}(?:memory|in-memory)|(?:memory|in-memory).{0,40}fallback/is);
  assert.doesNotMatch(source, /export\s+(?:async\s+)?function\s+query|public\s+query\s*\(/);
});

test("registration authority is exact server-owned HTTPS origin and never request or proxy derived", () => {
  const runtime = read("apps/owner/lib/self-serve-http/runtime.ts");
  const registration = read("apps/owner/lib/self-serve-http/registration-request.ts");
  assert.match(runtime, /registrationOrigin:\s*string/);
  assert.match(runtime, /APPROVED_OWNER_REGISTRATION_ORIGIN\s*=\s*"https:\/\/ecommerce\.celebix\.co"/);
  assert.match(runtime, /normalizeExactHttpsOrigin\(options\.registrationOrigin\)/);
  assert.match(registration, /raw\s*!==\s*registrationOrigin/);
  assert.match(registration, /target\.origin\s*===\s*registrationOrigin/);
  assert.doesNotMatch(registration, /headers\.get\(["'](?:host|x-forwarded-host|forwarded)["']\)/i);
  assert.doesNotMatch(runtime, /process\.env[^\n]*registration/i);
  assert.doesNotMatch(registration, /origin\.origin\s*===\s*target\.origin/);
});

test("callback replay performs durable recovery inspection before any provider or tenant resume", () => {
  const callback = read("apps/owner/lib/self-serve-http/oidc-callback-completion.ts");
  const runtime = read("apps/owner/lib/self-serve-http/runtime.ts");
  const persistence = read("apps/owner/lib/saas-persistence/postgres-registration-attempt-store.ts");
  assert.match(callback, /oidc_state_replayed[\s\S]*runtime\.recoverConsumedCallback\(callback\.state\)/);
  assert.match(runtime, /consumedCallbackRecovery\.classifyConsumedCallback/);
  assert.match(runtime, /classification\.kind === "identity_verified" \|\| classification\.kind === "tenant_created"/);
  assert.match(persistence, /stateDigester\.digest\(rawState\)/);
  assert.match(persistence, /SELECT status AS oidc_status FROM saas\.oidc_transactions WHERE state_digest = \$1/);
  assert.match(persistence, /WHERE workflow\.state_digest = \$1/);
  const recoveryMethod = persistence.slice(
    persistence.indexOf("async classifyConsumedCallback"),
    persistence.indexOf("async load(", persistence.indexOf("async classifyConsumedCallback")),
  );
  assert.doesNotMatch(recoveryMethod, /\b(?:INSERT|UPDATE|DELETE)\b/);
  assert.doesNotMatch(callback, /oidc_state_replayed[^\n]*return\s+oidcError/);
});

test("post-consume and provider failures have explicit non-retryable restart semantics", () => {
  const callback = read("apps/owner/lib/self-serve-http/oidc-callback-completion.ts");
  const runtime = read("apps/owner/lib/self-serve-http/runtime.ts");
  const oidc = read("apps/owner/lib/self-serve-oidc.ts");
  assert.match(oidc, /oidc_provider_unavailable/);
  assert.match(oidc, /throw new OidcFlowError\("oidc_provider_unavailable"/);
  assert.match(callback, /self_serve_callback_restart_required/);
  assert.match(callback, /restartRegistration:\s*true/);
  assert.doesNotMatch(callback, /state:\s*"failed",\s*retryable:\s*true/);
  assert.doesNotMatch(callback, /completion_state_unknown"[^\n]*retryable:\s*true/);
  assert.doesNotMatch(runtime, /completion_state_unknown",\s*retryable:\s*true/);
  assert.doesNotMatch(oidc, /catch \(error\)[\s\S]{0,180}oidc_provider_rejected", "OIDC provider (?:rejected|is unavailable)/);
});

test("authorization URL requires exact code flow and exact query response mode", () => {
  const oidc = read("apps/owner/lib/self-serve-oidc.ts");
  assert.match(oidc, /hasExactly\(url, "response_type", "code"\)/);
  assert.match(oidc, /hasExactly\(url, "response_mode", "query"\)/);
  assert.doesNotMatch(oidc, /responseTypes\[0\][^\n]*includes\("code"\)/);
});

test("sealed activation authority has no production value and default route cannot mint it", () => {
  assert.match(source, /phase2b1b2a_self_serve_http_wiring/);
  assert.match(source, /disposable_test/);
  assert.match(source, /approved_staging/);
  assert.match(source, /disabled_public_activation/);
  assert.match(source, /sessions:\s*"forbidden"/);
  assert.doesNotMatch(source, /environment:\s*"production"|["']production["']\s*\|/);
  assert.doesNotMatch(route, /createSelfServeHttpActivationApproval/);
});

test("new HTTP wiring cannot create sessions, cookies, authenticated redirects, or session transitions", () => {
  assert.doesNotMatch(source, /cookies\s*\(|Set-Cookie|session_created|accessToken|refreshToken|sessionToken|NextResponse\.redirect|authenticated/i);
  assert.doesNotMatch(route, /cookies\s*\(|Set-Cookie|session_created|redirect\s*\(/i);
});

test("callback factory remains application-only and uses narrow provider and trust ports", () => {
  const callback = read("apps/owner/lib/self-serve-http/oidc-callback-completion.ts");
  const runtime = read("apps/owner/lib/self-serve-http/runtime.ts");
  assert.match(callback, /edgeTrustContext/);
  assert.match(callback, /runtime\.verifyRequest/);
  assert.match(runtime, /oidcProvider/);
  assert.match(runtime, /completeOidcCallback/);
  assert.doesNotMatch(callback, /client_secret|token_endpoint|jwks|discovery|Logto|OAuth|globalThis\.fetch|\bfetch\s*\(/i);
});

test("accepted SQL, manifests, packages, lockfiles, and frozen contracts are byte-unchanged", () => {
  const files = changed();
  assert.equal(files.some((file) => file.endsWith(".sql") || file.includes("scripts/sql/saas/") || file.endsWith("manifest.json")), false, files.join("\n"));
  assert.equal(files.some((file) => file === "package.json" || file === "package-lock.json" || file.endsWith("/package.json") || file.includes("packages/saas-contracts/")), false, files.join("\n"));
});

test("the route-mount correction changes no SQL, manifest, package, lockfile, or infrastructure path", () => {
  const files = [...new Set([...correctionChanged(), ...changed()])].sort();
  assert.equal(files.some((file) => file.endsWith(".sql") || file.endsWith("manifest.json")), false, files.join("\n"));
  assert.equal(files.some((file) => /(?:^|\/)package(?:-lock)?\.json$/.test(file)), false, files.join("\n"));
  assert.equal(files.some((file) => /^(?:apps\/admin|apps\/admin-shared|deploy|\.github\/workflows|packages)\//.test(file)), false, files.join("\n"));
});

test("the Phase 2B2B2C1 diff is confined to approved route-mount and test paths", () => {
  const files = changed();
  for (const file of files) {
    assert.equal(
      file === "apps/owner/app/api/self-serve/register/route.ts" ||
      /^apps\/owner\/app\/api\/internal\/self-serve\/(?:browser-binding|oidc-callback)\/route\.ts$/.test(file) ||
      /^apps\/customer-panel\/app\/auth\/(?:bootstrap|callback)\/route\.ts$/.test(file) ||
      file.startsWith("apps/owner/lib/self-serve-auth-route-mount/") ||
      file.startsWith("apps/owner/lib/self-serve-auth-route-runtime/") ||
      file.startsWith("apps/customer-panel/lib/panel-auth-route-mount/") ||
      file.startsWith("apps/customer-panel/lib/panel-auth-route-runtime/") ||
      file.startsWith("tests/saas-phase2/auth-route-mount/") ||
      file.startsWith("tests/saas-phase2/http-wiring/") ||
      file === "tests/saas-phase2/panel-auth-composition/static-security.test.mjs" ||
      file === "tests/saas-phase2/panel-auth-composition/postgres-harness.mjs",
      true,
      file,
    );
  }
  assert.equal(files.some((file) => /^(?:apps\/admin|apps\/admin-shared|Hemenaku|deploy|\.github\/workflows|apps\/(?:storefront|web|site))\//.test(file)), false, files.join("\n"));
});

test("production, staging, provider, and infrastructure connection strings are absent", () => {
  const allChangedSource = changed()
    .filter((file) => file.startsWith("apps/owner/") && /\.(?:ts|tsx)$/.test(file) && !file.endsWith(".test.ts"))
    .map(read)
    .join("\n");
  assert.doesNotMatch(allChangedSource, /DATABASE_URL|POSTGRES_URL|SUPABASE_URL|SELF_SERVE_SAAS_REGISTRATION_ENABLED\s*=\s*true|CUSTOMER_PANEL_AUTH_ENABLED\s*=\s*true/);
  assert.doesNotMatch(source, /client[_-]?secret|provider[_-]?secret|token[_-]?endpoint|jwks[_-]?(?:url|uri)/i);
});
