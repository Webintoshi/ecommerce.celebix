import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const base = "2746e76b56e0199d110692f54068cbc5f1d25ba7";
const sqlRoot = "apps/owner/scripts/sql/saas";

function read(file) { return readFileSync(path.join(root, file), "utf8"); }
function git(args) { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }
function sha(file) { return createHash("sha256").update(read(file)).digest("hex"); }
function changedFiles() {
  return [...new Set([
    ...git(["diff", "--name-only", base]).split("\n"),
    ...git(["ls-files", "--others", "--exclude-standard"]).split("\n"),
  ].filter(Boolean))];
}

test("migration 017 is the only new migration and its manifest checksums exact bytes", () => {
  const migrationChanges = changedFiles().filter((file) => file.startsWith(`${sqlRoot}/`));
  assert.deepEqual(migrationChanges.sort(), [
    `${sqlRoot}/202607140017_panel_browser_bindings.down.sql`,
    `${sqlRoot}/202607140017_panel_browser_bindings.up.sql`,
    `${sqlRoot}/phase2b2b2a1-manifest.json`,
  ]);
  const manifest = JSON.parse(read(`${sqlRoot}/phase2b2b2a1-manifest.json`));
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.artifacts.length, 2);
  for (const artifact of manifest.artifacts) assert.equal(artifact.sha256, sha(`${sqlRoot}/${artifact.file}`));
});

test("panel_browser_bindings stores only immutable digest authority with exact 1-2-3 transitions", () => {
  const sql = read(`${sqlRoot}/202607140017_panel_browser_bindings.up.sql`);
  for (const field of [
    "binding_id uuid PRIMARY KEY", "attempt_id text NOT NULL", "state_digest character(64) NOT NULL",
    "oidc_state_digest character(64) NOT NULL",
    "bootstrap_token_key_id text NOT NULL", "bootstrap_token_digest character(64) NOT NULL",
    "authorization_url_digest character(64) NOT NULL", "browser_binding_key_id text",
    "browser_binding_digest character(64)", "issued_at timestamptz NOT NULL",
    "bootstrap_expires_at timestamptz NOT NULL", "bootstrap_redeemed_at timestamptz",
    "browser_binding_expires_at timestamptz", "callback_claimed_at timestamptz",
    "version bigint NOT NULL", "created_at timestamptz NOT NULL", "updated_at timestamptz NOT NULL",
  ]) assert.match(sql, new RegExp(field.replace(/[()]/g, "\\$&")), field);
  assert.match(sql, /UNIQUE \(attempt_id\)/);
  assert.match(sql, /UNIQUE \(state_digest\)/);
  assert.match(sql, /UNIQUE \(oidc_state_digest\)/);
  assert.match(sql, /UNIQUE \(bootstrap_token_key_id, bootstrap_token_digest\)/);
  assert.match(sql, /UNIQUE \(browser_binding_key_id, browser_binding_digest\)/);
  assert.match(sql, /FOREIGN KEY \(attempt_id\) REFERENCES saas\.registration_workflows/);
  assert.match(sql, /FOREIGN KEY \(oidc_state_digest\) REFERENCES saas\.oidc_transactions/);
  assert.match(sql, /interval '5 minutes'/);
  assert.match(sql, /interval '15 minutes'/);
  assert.match(sql, /version = 1[\s\S]*version = 2[\s\S]*version = 3/);
  assert.match(sql, /PHASE2B2B2A1_IMMUTABLE_BROWSER_BINDING_AUTHORITY/);
  assert.doesNotMatch(sql, /raw_state|bootstrap_credential|browser_binding_credential|provider_authorization_url|handoff_credential|session_credential|email|principal_id|store_id/);
});

test("four fixed owner functions are SECURITY DEFINER, fixed-search-path, PUBLIC-revoked, and execute-only", () => {
  const sql = read(`${sqlRoot}/202607140017_panel_browser_bindings.up.sql`);
  const functions = [
    "create_panel_browser_bootstrap", "bind_panel_browser_credential",
    "claim_panel_browser_callback", "cleanup_panel_browser_bindings",
  ];
  for (const name of functions) {
    const offset = sql.indexOf(`CREATE FUNCTION saas.${name}`);
    assert.ok(offset >= 0, name);
    const block = sql.slice(offset, sql.indexOf("$;", offset) + 2);
    assert.match(block, /SECURITY DEFINER/);
    assert.match(block, /SET search_path = pg_catalog, saas/);
    assert.match(sql, new RegExp(`ALTER FUNCTION saas\\.${name}\\([\\s\\S]*?OWNER TO celebix_saas_owner`));
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION saas\\.${name}\\([\\s\\S]*?FROM PUBLIC`));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION saas\\.${name}\\([\\s\\S]*?TO celebix_saas_identity`));
  }
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON saas\.panel_browser_bindings FROM celebix_saas_identity/);
  assert.doesNotMatch(sql, /GRANT (?:SELECT|INSERT|UPDATE|DELETE).*panel_browser_bindings/);
  assert.doesNotMatch(sql, /EXECUTE\s+format|dynamic SQL/i);
});

test("callback key rotation is matched under one row lock from bounded parallel arrays", () => {
  const sql = read(`${sqlRoot}/202607140017_panel_browser_bindings.up.sql`);
  const start = sql.indexOf("CREATE FUNCTION saas.claim_panel_browser_callback");
  const claim = sql.slice(start, sql.indexOf("$;", start) + 2);
  assert.match(claim, /p_browser_binding_key_ids text\[\]/);
  assert.match(claim, /p_browser_binding_digests text\[\]/);
  assert.match(claim, /cardinality\(p_browser_binding_key_ids\) BETWEEN 1 AND 16/);
  assert.match(claim, /cardinality\(p_browser_binding_key_ids\) <> cardinality\(p_browser_binding_digests\)/);
  assert.match(claim, /FOR UPDATE/);
  assert.match(claim, /array_position\(p_browser_binding_key_ids, existing\.browser_binding_key_id\)/);
  assert.match(claim, /callback_claimed_at = p_now[\s\S]*version = 3/);
});

test("migration 017 invokes PostgreSQL LEAST as special SQL syntax", () => {
  const sql = read(`${sqlRoot}/202607140017_panel_browser_bindings.up.sql`);
  assert.match(sql, /\bLEAST\s*\(/);
  assert.doesNotMatch(sql, /pg_catalog\.least\s*\(/i);
});

test("cleanup retains claimed replay evidence until browser-binding expiry", () => {
  const sql = read(`${sqlRoot}/202607140017_panel_browser_bindings.up.sql`);
  const start = sql.indexOf("CREATE FUNCTION saas.cleanup_panel_browser_bindings");
  const cleanup = sql.slice(start, sql.indexOf("$;", start) + 2);
  assert.match(cleanup, /binding\.version = 1 AND binding\.bootstrap_expires_at <= p_now/);
  assert.match(cleanup, /binding\.version = 2 AND binding\.browser_binding_expires_at <= p_now/);
  assert.match(cleanup, /binding\.version = 3 AND binding\.browser_binding_expires_at <= p_now/);
  assert.doesNotMatch(cleanup, /binding\.version = 3 AND binding\.callback_claimed_at <= p_now/);
  assert.match(cleanup, /LIMIT p_limit/);
});

test("runtime, B2B1, B2A, old migrations/manifests, routes, packages, and flags remain unchanged", () => {
  const changed = new Set(changedFiles());
  for (const file of changed) {
    assert.equal(/^apps\/owner\/scripts\/sql\/saas\/2026071400(?:0[1-9]|1[0-6])_/.test(file), false, file);
    assert.equal(/^apps\/owner\/scripts\/sql\/saas\/(?!phase2b2b2a1-manifest)/.test(file) && file.endsWith("manifest.json"), false, file);
    assert.equal(/^apps\/owner\/lib\/panel-session-handoff\/(?:activation|credential-codec|initial-callback-executor|initial-callback-grant|postgres-handoff-issuer)/.test(file), false, file);
    assert.equal(/^apps\/customer-panel\/lib\/panel-session-(?:handoff|persistence)\//.test(file), false, file);
    assert.equal(/^apps\/(?:owner|customer-panel)\/app\//.test(file), false, file);
    assert.equal(/^package(?:-lock)?\.json$/.test(file), false, file);
  }
  assert.equal(read("apps/owner/lib/self-serve-http/runtime.ts"), execFileSync("git", ["show", `${base}:apps/owner/lib/self-serve-http/runtime.ts`], { cwd: root, encoding: "utf8" }));
  assert.match(read("apps/owner/lib/self-serve-registration-orchestrator.ts"), /SELF_SERVE_SAAS_REGISTRATION_ENABLED = false/);
  for (const file of [
    "apps/customer-panel/app/auth/callback/route.ts",
    "apps/owner/app/api/internal/self-serve/oidc-callback/route.ts",
  ]) assert.equal(read(file), execFileSync("git", ["show", `${base}:${file}`], { cwd: root, encoding: "utf8" }));
});

test("the correction diff remains inside the exact Atlas browser-binding allowlist", () => {
  const exact = new Set([
    "apps/customer-panel/lib/self-serve-callback-edge/callback-request.ts",
    "apps/customer-panel/lib/self-serve-callback-edge/callback-request.test.ts",
    "apps/customer-panel/lib/self-serve-internal-callback-transport/transport.ts",
    "apps/customer-panel/lib/self-serve-internal-callback-transport/transport.test.ts",
    "apps/owner/lib/panel-session-handoff/internal-callback-handler.ts",
    "apps/owner/lib/panel-session-handoff/internal-callback-handler.test.ts",
    "apps/owner/lib/panel-session-handoff/internal-gateway.ts",
    "apps/owner/lib/panel-session-handoff/internal-gateway.test.ts",
    "apps/owner/lib/self-serve-http/internal-callback-gateway.ts",
    "apps/owner/lib/self-serve-http/internal-callback-gateway.test.ts",
    "packages/platform-config/src/saas.ts",
    "packages/platform-config/src/saas.test.ts",
    `${sqlRoot}/202607140017_panel_browser_bindings.up.sql`,
    `${sqlRoot}/202607140017_panel_browser_bindings.down.sql`,
    `${sqlRoot}/phase2b2b2a1-manifest.json`,
  ]);
  for (const file of changedFiles()) assert.equal(
    exact.has(file) ||
      file.startsWith("apps/customer-panel/lib/panel-browser-binding/") ||
      file.startsWith("apps/customer-panel/lib/panel-browser-binding-bootstrap/") ||
      file.startsWith("apps/customer-panel/lib/panel-session-completion/") ||
      file.startsWith("apps/owner/lib/panel-browser-binding/") ||
      file.startsWith("tests/saas-phase2/panel-browser-binding/") ||
      file.startsWith("tests/saas-phase2/panel-session-completion/") ||
      file.startsWith("tests/saas-phase2/http-wiring/"),
    true,
    file,
  );
});

test("schema-v2 request authentication and atomic browser claim precede provider and B2B1 execution", () => {
  const gateway = read("apps/owner/lib/panel-session-handoff/internal-gateway.ts");
  const authenticated = gateway.indexOf("authenticator.authenticate(request)");
  const parsed = gateway.indexOf("parseCanonicalPanelSessionCompletionEnvelope(", authenticated);
  const invoked = gateway.indexOf("handler.handle(", parsed);
  assert.ok(authenticated >= 0 && parsed > authenticated && invoked > parsed);
  assert.match(gateway, /PANEL_SESSION_COMPLETION_REQUEST_SCHEMA_VERSION/);
  assert.match(gateway, /browserBindingCredential/);

  const handler = read("apps/owner/lib/panel-session-handoff/internal-callback-handler.ts");
  const flow = handler.slice(handler.indexOf("async handle("));
  const callback = flow.indexOf("classifyReconstructedOwnerCallbackRequest(request)");
  const claim = flow.indexOf("claimed = await claimBrowserCallback");
  const providerError = flow.indexOf('callback.kind === "provider_error"');
  const executor = flow.indexOf("executor.execute(");
  assert.ok(callback >= 0 && claim > callback && providerError > claim && executor > claim);
  assert.doesNotMatch(flow.slice(claim, providerError), /retry|for\s*\(|while\s*\(/i);
});

test("pb1 key rotation is one bounded repository call and one row-locked SQL match", () => {
  const repository = read("apps/owner/lib/panel-browser-binding/postgres-repository.ts");
  const claim = repository.slice(repository.indexOf("async claimCallback"), repository.indexOf("async cleanupExpired"));
  assert.equal((claim.match(/claim_panel_browser_callback/g) ?? []).length, 1);
  assert.equal((claim.match(/transaction\(dependencies/g) ?? []).length, 1);
  assert.match(claim, /candidates\.length > 16/);
  assert.match(claim, /\$3::text\[\],\$4::text\[\]/);
  assert.doesNotMatch(claim, /for\s*\(|while\s*\(/);

  const sql = read(`${sqlRoot}/202607140017_panel_browser_bindings.up.sql`);
  const sqlClaim = sql.slice(sql.indexOf("CREATE FUNCTION saas.claim_panel_browser_callback"));
  assert.match(sqlClaim, /FOR UPDATE/);
  assert.match(sqlClaim, /array_position\(p_browser_binding_key_ids, existing\.browser_binding_key_id\)/);
});

test("provider authorization digest binds exact bytes and browser credentials stay out of URLs and public failures", () => {
  const repository = read("apps/owner/lib/panel-browser-binding/postgres-repository.ts");
  assert.match(repository, /createHash\("sha256"\)\.update\(value, "utf8"\)\.digest\("hex"\)/);
  assert.match(repository, /providerAuthorizationUrl = exactProviderUrl\(input\.providerAuthorizationUrl\)/);
  assert.doesNotMatch(repository.slice(repository.indexOf("function exactProviderUrl"), repository.indexOf("export function createPostgres")), /new URL|searchParams/);

  const bootstrap = read("apps/customer-panel/lib/panel-browser-binding-bootstrap/handler.ts");
  assert.match(bootstrap, /result\.providerAuthorizationUrl !== form\.providerAuthorizationUrl/);
  assert.match(bootstrap, /location: form\.providerAuthorizationUrl/);
  assert.doesNotMatch(bootstrap, /location: browserBindingCredential/);
  const completion = read("apps/customer-panel/lib/panel-session-completion/completion.ts");
  assert.match(completion, /PANEL_BROWSER_BINDING_DELETION_COOKIE/);
  assert.doesNotMatch(completion, /location: callback|location:.*browserBinding/i);
});

test("the legacy callback edge remains cookie-forbidden while the separate completion validator is exact", () => {
  const validator = read("apps/customer-panel/lib/self-serve-callback-edge/callback-request.ts");
  const legacy = validator.slice(validator.indexOf("export function validateCustomerPanelCallbackRequest"), validator.indexOf("export function validateBrowserBoundPanelCompletionRequest"));
  assert.match(legacy, /PRIVATE_HEADERS/);
  assert.match(legacy, /request\.headers\.has\(name\)/);
  const bound = validator.slice(validator.indexOf("export function validateBrowserBoundPanelCompletionRequest"));
  assert.match(bound, /name !== "cookie"/);
  assert.match(bound, /parsePanelBrowserBindingCookie\(request\.headers\.get\("cookie"\)\)/);
  const oldGateway = read("apps/owner/lib/self-serve-http/internal-callback-gateway.ts");
  assert.match(oldGateway, /SELF_SERVE_INTERNAL_CALLBACK_SCHEMA_VERSION/);
  assert.match(oldGateway, /Object\.keys\(object\)\.length !== 2/);
});
