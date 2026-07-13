import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const base = "9ecdee03c3a87e07671001a30d79c4e9ca844735";
const read = (file) => readFileSync(path.join(root, file), "utf8");
const sourceFiles = [
  "apps/owner/lib/self-serve-http/runtime.ts",
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

test("production registration and customer authentication flags remain false", () => {
  assert.match(read("apps/owner/lib/self-serve-registration-orchestrator.ts"), /SELF_SERVE_SAAS_REGISTRATION_ENABLED = false/);
  assert.match(read("apps/customer-panel/lib/config.ts"), /CUSTOMER_PANEL_AUTH_ENABLED = false/);
  assert.doesNotMatch(source, /SELF_SERVE_SAAS_REGISTRATION_ENABLED\s*=\s*true|CUSTOMER_PANEL_AUTH_ENABLED\s*=\s*true/);
});

test("the default route composes only the disabled runtime without body parsing or persistence authority", () => {
  assert.match(route, /createDisabledSelfServeRuntime/);
  assert.match(route, /createSelfServeRegistrationStartHandler/);
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

test("the Phase 2B1B2A diff is confined to approved Owner and test paths", () => {
  const files = changed();
  for (const file of files) {
    assert.equal(
      file === "apps/owner/app/api/self-serve/register/route.ts" ||
      file === "apps/owner/app/api/self-serve/register/route.test.ts" ||
      file === "apps/owner/lib/self-serve-registration-orchestrator.ts" ||
      file === "apps/owner/lib/self-serve-oidc.ts" ||
      file.startsWith("apps/owner/lib/self-serve-http/") ||
      file.startsWith("tests/saas-phase2/registration-session/") ||
      file.startsWith("tests/saas-phase2/http-wiring/"),
      true,
      file,
    );
  }
  assert.equal(files.some((file) => /^(?:apps\/customer-panel|apps\/admin|apps\/admin-shared|Hemenaku|deploy|\.github\/workflows|apps\/(?:storefront|web|site))\//.test(file)), false, files.join("\n"));
});

test("production, staging, provider, and infrastructure connection strings are absent", () => {
  const allChangedSource = changed()
    .filter((file) => file.startsWith("apps/owner/") && /\.(?:ts|tsx)$/.test(file) && !file.endsWith(".test.ts"))
    .map(read)
    .join("\n");
  assert.doesNotMatch(allChangedSource, /DATABASE_URL|POSTGRES_URL|SUPABASE_URL|SELF_SERVE_SAAS_REGISTRATION_ENABLED\s*=\s*true|CUSTOMER_PANEL_AUTH_ENABLED\s*=\s*true/);
  assert.doesNotMatch(source, /client[_-]?secret|provider[_-]?secret|token[_-]?endpoint|jwks[_-]?(?:url|uri)/i);
});
