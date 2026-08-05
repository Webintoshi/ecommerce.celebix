import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sqlDirectory = path.join(root, "apps", "owner", "scripts", "sql", "saas");
const base = "ed09846d80644fb0118c51dba9ae8fed0bdc816e";
const correctionBase = "ed9738ab5fefa811a4b5ddaf98aff16cdedcc2d9";
const upName = "202607140016_panel_session_handoffs.up.sql";
const downName = "202607140016_panel_session_handoffs.down.sql";
const manifestName = "phase2b2b1-manifest.json";
const read = (file) => readFileSync(path.join(root, file), "utf8");
const sql = (file) => readFileSync(path.join(sqlDirectory, file), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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

test("exactly one append-only migration 016 pair and a checksum manifest exist", () => {
  const files = readdirSync(sqlDirectory).filter((name) => /016/.test(name)).sort();
  assert.deepEqual(files, [downName, upName]);
  assert.equal(readdirSync(sqlDirectory).some((name) => /017/.test(name)), false);
  const manifest = JSON.parse(sql(manifestName));
  assert.equal(manifest.bundleId, "phase2b2b1-202607140016");
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.productionDistributionCompatibility, "OPEN_INFRASTRUCTURE_GATE");
  assert.deepEqual(manifest.artifacts.map((artifact) => artifact.file), [upName, downName]);
  for (const artifact of manifest.artifacts) assert.equal(artifact.sha256, sha256(sql(artifact.file)));
});

test("handoff table contains only opaque durable authority with exact unique and lifetime constraints", () => {
  const migration = sql(upName);
  for (const field of [
    "handoff_id", "attempt_id", "state_digest", "token_key_id", "token_digest", "tenant_operation_id",
    "principal_id", "active_store_id", "session_operation_id", "session_id", "family_id",
    "session_token_key_id", "issued_at", "expires_at", "session_expires_at", "redeemed_at",
    "version", "created_at", "updated_at",
  ]) assert.match(migration, new RegExp(`\\b${field}\\b`));
  assert.match(migration, /CREATE TABLE saas\.panel_session_handoffs\s*\(/);
  assert.match(migration, /handoff_id uuid PRIMARY KEY|PRIMARY KEY \(handoff_id\)/);
  assert.match(migration, /UNIQUE \(attempt_id\)/);
  assert.match(migration, /UNIQUE \(state_digest\)/);
  assert.match(migration, /UNIQUE \(token_key_id, token_digest\)/);
  assert.match(migration, /UNIQUE \(session_operation_id\)/);
  assert.match(migration, /expires_at <= issued_at \+ interval '10 minutes'/);
  assert.match(migration, /session_expires_at <= issued_at \+ interval '8 hours'/);
  assert.match(migration, /redeemed_at IS NULL OR \(redeemed_at >= issued_at/);
  for (const forbidden of [
    "raw_state", "raw_handoff", "raw_credential", "session_credential", "email", "authorization_code",
    "nonce", "code_verifier", "access_token", "refresh_token", "id_token",
  ]) assert.doesNotMatch(migration.replace(/^--.*$/gm, ""), new RegExp(`\\b${forbidden}\\b`, "i"));
});

test("handoff creation is anchored to completed verified identity and the accepted committed tenant proof", () => {
  const migration = sql(upName);
  const create = migration.slice(migration.indexOf("CREATE FUNCTION saas.create_panel_session_handoff("), migration.indexOf("CREATE FUNCTION saas.recover_panel_session_handoff("));
  assert.match(create, /saas\.registration_workflows/);
  assert.match(create, /saas\.registration_verified_identities/);
  assert.match(create, /saas\.registration_tenant_completions/);
  assert.match(create, /saas\.registration_tenant_operation_proofs/);
  assert.match(create, /saas\.tenant_operations/);
  assert.match(create, /workflow\.state_digest = p_state_digest/);
  assert.match(create, /workflow\.status IN \('tenant_created', 'session_created'\)/);
  assert.match(create, /completion\.state = 'completed'/);
  assert.match(create, /completion\.tenant_operation_id = operation\.id/);
  assert.match(create, /operation\.id = proof\.operation_id/);
  assert.match(create, /operation\.status = 'committed'/);
  assert.match(create, /membership\.role = 'store_owner'/);
  assert.match(create, /membership\.status = 'active'/);
  assert.doesNotMatch(create, /p_principal_id|p_active_store_id|p_attempt_id|p_tenant_operation_id/);
  assert.match(create, /existing\.token_key_id <> p_token_key_id/);
  assert.match(create, /existing\.token_digest <> p_token_digest/);
  assert.match(create, /existing\.session_token_key_id <> p_session_token_key_id/);
  assert.match(create, /existing\.redeemed_at IS NOT NULL/);
});

test("Owner recovery requires exact candidate proof and rejects redeemed handoffs", () => {
  const migration = sql(upName);
  const recover = migration.slice(migration.indexOf("CREATE FUNCTION saas.recover_panel_session_handoff("), migration.indexOf("CREATE FUNCTION saas.redeem_panel_session_handoff("));
  assert.match(recover, /p_token_key_id text/);
  assert.match(recover, /p_token_digest text/);
  assert.match(recover, /p_session_token_key_id text/);
  assert.match(recover, /existing\.token_key_id <> p_token_key_id/);
  assert.match(recover, /existing\.token_digest <> p_token_digest/);
  assert.match(recover, /existing\.session_token_key_id <> p_session_token_key_id/);
  assert.match(recover, /existing\.redeemed_at IS NOT NULL/);
  assert.doesNotMatch(read("apps/owner/lib/panel-session-handoff/postgres-handoff-issuer.ts"), /recoverHandoff\(input:\s*\{\s*rawState:\s*string\s*\}\)/);
});

test("redemption atomically reuses issue_panel_session and replay verifies the exact persisted session", () => {
  const migration = sql(upName);
  const redeem = migration.slice(migration.indexOf("CREATE FUNCTION saas.redeem_panel_session_handoff("), migration.indexOf("CREATE FUNCTION saas.recover_panel_session_handoff_redemption("));
  assert.match(redeem, /FOR UPDATE/);
  assert.match(redeem, /saas\.issue_panel_session\(/);
  assert.match(redeem, /handoff\.session_operation_id/);
  assert.match(redeem, /handoff\.session_id/);
  assert.match(redeem, /handoff\.family_id/);
  assert.match(redeem, /handoff\.principal_id/);
  assert.match(redeem, /handoff\.active_store_id/);
  assert.match(redeem, /handoff\.session_expires_at/);
  assert.match(redeem, /UPDATE saas\.panel_session_handoffs/);
  assert.match(redeem, /redeemed_at = p_now/);
  assert.match(redeem, /session\.token_key_id <> p_session_token_key_id/);
  assert.match(redeem, /session\.token_digest <> p_session_token_digest/);
  assert.match(redeem, /session\.revoked_at IS NOT NULL/);
  assert.match(redeem, /session\.replaced_by_session_id IS NOT NULL/);
  assert.match(redeem, /session\.expires_at <= p_now/);
  assert.match(redeem, /membership\.role = 'store_owner'/);
  assert.match(redeem, /membership\.status = 'active'/);
  assert.match(redeem, /store\.status = 'active'/);
});

test("handoff credentials are random, grant-bound, and consumed-state recovery cannot reach issuer", () => {
  const codec = read("apps/owner/lib/panel-session-handoff/credential-codec.ts");
  const issuer = read("apps/owner/lib/panel-session-handoff/postgres-handoff-issuer.ts");
  const executor = read("apps/owner/lib/panel-session-handoff/initial-callback-executor.ts");
  assert.doesNotMatch(codec, /celebix-panel-handoff-v1|deriveCredential\s*\(|rawState|canonicalState/);
  assert.match(codec, /randomBytes\(TOKEN_BYTES\)/);
  assert.match(issuer, /initialCallbackGrant/);
  assert.match(issuer, /candidateCredential/);
  assert.match(issuer, /isActiveInitialVerifiedCallbackGrantForState/);
  assert.doesNotMatch(executor, /recoverConsumedCallback/);
});

test("callback grant authority is privately state-bound before issuer dependencies", () => {
  const grant = read("apps/owner/lib/panel-session-handoff/initial-callback-grant.ts");
  const issuer = read("apps/owner/lib/panel-session-handoff/postgres-handoff-issuer.ts");
  assert.match(grant, /activeStates:\s*WeakMap<object, string>/);
  assert.match(grant, /activeStates\.set\(grant, callbackSnapshot\.state\)/);
  assert.match(grant, /activeStates\.get\(grant\) === rawState/);
  assert.match(grant, /Object\.freeze\(\{ state, code \}\)/);
  assert.match(grant, /completeCallback\(callbackSnapshot\)/);
  assert.doesNotMatch(grant, /WeakSet/);
  assert.equal((issuer.match(/if \(!validGrant\(initialCallbackGrant, state\)\)/g) ?? []).length, 2);
  for (const marker of ["async issueHandoff", "async recoverHandoff"]) {
    const block = issuer.slice(issuer.indexOf(marker));
    assert.ok(block.indexOf("if (!validGrant(initialCallbackGrant, state))") < block.indexOf("stateDigest(state)"));
  }
});

test("executor accepts only the genuine issuer for its exact boundary and never re-reads callback state", () => {
  const issuer = read("apps/owner/lib/panel-session-handoff/postgres-handoff-issuer.ts");
  const executor = read("apps/owner/lib/panel-session-handoff/initial-callback-executor.ts");
  assert.match(issuer, /issuerAuthorities = new WeakMap<object, InitialVerifiedCallbackGrantBoundary>/);
  assert.match(issuer, /issuerAuthorities\.get\(issuer\) === boundary/);
  assert.match(issuer, /issuerAuthorities\.set\(issuer, dependencies\.initialCallbackGrantBoundary\)/);
  assert.match(executor, /isPostgresPanelSessionHandoffIssuerForBoundary\(input\.issuer, input\.boundary\)/);
  assert.match(executor, /const callbackSnapshot = snapshotCallback\(callback\)/);
  const execution = executor.slice(executor.indexOf("execute(callback"));
  assert.doesNotMatch(execution, /callback\.state|callback\.code/);
  assert.equal((execution.match(/rawState: callbackSnapshot\.state/g) ?? []).length, 2);
});

test("correction remains in the exact state-binding allowlist and frozen surfaces stay byte-unchanged", () => {
  const allowed = new Set([
    "apps/owner/lib/panel-session-handoff/initial-callback-grant.ts",
    "apps/owner/lib/panel-session-handoff/initial-callback-grant.test.ts",
    "apps/owner/lib/panel-session-handoff/initial-callback-executor.ts",
    "apps/owner/lib/panel-session-handoff/initial-callback-executor.test.ts",
    "apps/owner/lib/panel-session-handoff/postgres-handoff-issuer.ts",
    "apps/owner/lib/panel-session-handoff/postgres-handoff-issuer.test.ts",
    "tests/saas-phase2/panel-session-handoffs/postgres-harness.mjs",
    "tests/saas-phase2/panel-session-handoffs/static-security.test.mjs",
  ]);
  for (const file of correctionChanged()) assert.equal(allowed.has(file), true, file);
  for (const file of [
    `apps/owner/scripts/sql/saas/${upName}`,
    `apps/owner/scripts/sql/saas/${downName}`,
    `apps/owner/scripts/sql/saas/${manifestName}`,
    "apps/owner/lib/panel-session-handoff/credential-codec.ts",
    "apps/customer-panel/lib/panel-session-handoff/postgres-handoff-redeemer.ts",
    "apps/owner/lib/self-serve-http/runtime.ts",
    "apps/owner/lib/self-serve-http/oidc-callback-completion.ts",
    "package.json",
    "package-lock.json",
  ]) {
    const diff = execFileSync("git", ["diff", "--name-only", correctionBase, "--", file], { cwd: root, encoding: "utf8" }).trim();
    assert.equal(diff, "", file);
  }
});

test("real PostgreSQL harness contains A/B substitution and callback-mutation authority proofs", () => {
  const harness = read("tests/saas-phase2/panel-session-handoffs/postgres-harness.mjs");
  assert.match(harness, /registration A grant rejects completed registration B state/);
  assert.match(harness, /registration B receives zero handoff rows and random candidates/);
  assert.match(harness, /caller callback mutation cannot create a substituted-state handoff/);
  assert.match(harness, /isActiveInitialVerifiedCallbackGrantForState/);
  assert.doesNotMatch(harness, /\bcountedIssuer\b|\bisActiveInitialVerifiedCallbackGrant\b/);
});

test("handoff mutation permits only first redemption and makes every authority field immutable", () => {
  const migration = sql(upName);
  const guard = migration.slice(migration.indexOf("CREATE FUNCTION saas.guard_panel_session_handoff_mutation("), migration.indexOf("CREATE TRIGGER panel_session_handoffs_guard"));
  for (const field of [
    "handoff_id", "attempt_id", "state_digest", "token_key_id", "token_digest", "tenant_operation_id",
    "principal_id", "active_store_id", "session_operation_id", "session_id", "family_id",
    "session_token_key_id", "issued_at", "expires_at", "session_expires_at", "created_at",
  ]) assert.match(guard, new RegExp(`NEW\\.${field} IS DISTINCT FROM OLD\\.${field}`));
  assert.match(guard, /OLD\.redeemed_at IS NULL[\s\S]*AND NEW\.redeemed_at IS NOT NULL/);
  assert.match(guard, /NEW\.version = OLD\.version \+ 1/);
  assert.match(guard, /PHASE2B2B1_IMMUTABLE_HANDOFF_AUTHORITY/);
  assert.match(guard, /PHASE2B2B1_INVALID_HANDOFF_TRANSITION/);
});

test("all fixed functions are owner SECURITY DEFINER, fixed search_path, PUBLIC-revoked, and identity-only", () => {
  const migration = sql(upName);
  const functions = [
    "create_panel_session_handoff",
    "recover_panel_session_handoff",
    "redeem_panel_session_handoff",
    "recover_panel_session_handoff_redemption",
  ];
  for (const name of functions) {
    assert.match(migration, new RegExp(`CREATE FUNCTION saas\\.${name}\\(`));
    const block = migration.slice(migration.indexOf(`CREATE FUNCTION saas.${name}(`));
    const nextCreate = block.indexOf("CREATE FUNCTION", 20);
    const nextAlter = block.indexOf("ALTER FUNCTION", 20);
    const endings = [nextCreate, nextAlter].filter((index) => index >= 0);
    const definition = endings.length === 0 ? block : block.slice(0, Math.min(...endings));
    assert.match(definition, /SECURITY DEFINER/);
    assert.match(definition, /SET search_path = pg_catalog, saas/);
    assert.doesNotMatch(definition.replace(/SECURITY DEFINER/g, ""), /\bEXECUTE\b|\bformat\s*\(/i);
    assert.match(migration, new RegExp(`ALTER FUNCTION saas\\.${name}\\([^;]+ OWNER TO celebix_saas_owner`));
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION saas\\.${name}\\([^;]+ FROM PUBLIC`));
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION saas\\.${name}\\([^;]+ TO celebix_saas_identity`));
  }
  assert.match(migration, /REVOKE ALL ON saas\.panel_session_handoffs FROM PUBLIC/);
  assert.match(migration, /REVOKE ALL ON saas\.panel_session_handoffs FROM celebix_saas_identity/);
  assert.doesNotMatch(migration, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)[^;]*panel_session_handoffs[^;]*celebix_saas_identity/i);
});

test("new application source has no routes, cookies, redirects, provider networking, env, cross-app import, pg, or generic SQL", () => {
  const source = changed()
    .filter((file) => /apps\/(?:owner|customer-panel)\/lib\/panel-session-handoff\/.+\.ts$/.test(file) && !file.endsWith(".test.ts"))
    .map(read).join("\n");
  for (const forbidden of [
    /process\.env/, /from ["']pg["']/, /\bcookies\s*\(/, /Set-Cookie/i, /\bLocation\b/, /\b30[23]\b/,
    /NextResponse\.redirect|redirect\s*\(/, /self-serve-callback-edge|internal-callback-gateway/,
    /provider.*fetch|globalThis\.fetch/i, /database[_A-Z]?url/i, /export\s+.*(?:Pool|Client|Query)/,
  ]) assert.doesNotMatch(source, forbidden);
  assert.doesNotMatch(read("apps/owner/lib/panel-session-handoff/postgres-handoff-issuer.ts"), /apps\/customer-panel|\.\.\/\.\.\/\.\.\/customer-panel/);
  assert.doesNotMatch(read("apps/customer-panel/lib/panel-session-handoff/postgres-handoff-redeemer.ts"), /apps\/owner|\.\.\/\.\.\/\.\.\/owner/);
});

test("default routes remain unmounted and browser response code cannot expose either credential", () => {
  const routes = [
    "apps/customer-panel/app/auth/callback/route.ts",
    "apps/customer-panel/app/auth/login/route.ts",
    "apps/customer-panel/app/auth/logout/route.ts",
    "apps/customer-panel/app/api/session/active-store/route.ts",
    "apps/owner/app/api/internal/self-serve/oidc-callback/route.ts",
  ];
  for (const route of routes) assert.doesNotMatch(read(route), /panel-session-handoff/);
  const source = changed()
    .filter((file) => file.startsWith("apps/") && file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map(read).join("\n");
  assert.doesNotMatch(source, /Set-Cookie|cookies\s*\(|NextResponse\.redirect|status:\s*30[23]/i);
});

test("the diff remains in the B2B1 allowlist and migrations 001 through 015 and frozen surfaces are unchanged", () => {
  const files = changed();
  for (const file of files) {
    assert.equal(
      file.startsWith("apps/customer-panel/lib/panel-session-handoff/")
      || file === "apps/customer-panel/lib/panel-session-persistence/credential-codec.ts"
      || file === "apps/customer-panel/lib/panel-session-persistence/credential-codec.test.ts"
      || file.startsWith("apps/owner/lib/panel-session-handoff/")
      || file === `apps/owner/scripts/sql/saas/${upName}`
      || file === `apps/owner/scripts/sql/saas/${downName}`
      || file === `apps/owner/scripts/sql/saas/${manifestName}`
      || file.startsWith("tests/saas-phase2/panel-session-handoffs/")
      || file === "tests/saas-phase2/panel-sessions/postgres-harness.mjs"
      || file === "tests/saas-phase2/registration-session/postgres-harness.mjs",
      true,
      file,
    );
  }
  assert.equal(files.some((file) => /apps\/owner\/scripts\/sql\/saas\/.*(?:00[1-9]|01[0-5])_/.test(file)), false, files.join("\n"));
  for (const forbidden of [
    "package.json", "package-lock.json", "packages/", "apps/admin/", "apps/admin-shared/", "apps/storefront",
    "deploy/", ".github/workflows/", "apps/customer-panel/app/", "apps/owner/app/", "apps/owner/lib/self-serve-http/",
  ]) assert.equal(files.some((file) => file === forbidden || file.startsWith(forbidden)), false, forbidden);
});
