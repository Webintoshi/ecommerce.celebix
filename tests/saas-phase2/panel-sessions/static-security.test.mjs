import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const sqlDirectory = path.join(root, "apps", "owner", "scripts", "sql", "saas");
const upName = "202607140015_panel_sessions.up.sql";
const downName = "202607140015_panel_sessions.down.sql";
const manifestName = "phase2b2a-manifest.json";
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const sql = (name) => readFileSync(path.join(sqlDirectory, name), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("exactly one append-only migration 015 pair and its checksum manifest exist", () => {
  const files = readdirSync(sqlDirectory).filter((name) => /015/.test(name)).sort();
  assert.deepEqual(files, [downName, upName]);
  const manifest = JSON.parse(sql(manifestName));
  assert.equal(manifest.bundleId, "phase2b2a-202607140015");
  assert.equal(manifest.postgresqlMajor, 16);
  assert.equal(manifest.productionDistributionCompatibility, "OPEN_INFRASTRUCTURE_GATE");
  assert.deepEqual(manifest.artifacts.map((artifact) => artifact.file), [upName, downName]);
  for (const artifact of manifest.artifacts) {
    assert.equal(artifact.sha256, sha256(sql(artifact.file)));
  }
});

test("panel_sessions has exact authority fields, UUID relationships, and no identity secrets", () => {
  const migration = sql(upName);
  for (const field of [
    "session_id", "family_id", "operation_id", "operation_kind", "token_key_id", "token_digest",
    "principal_id", "active_store_id", "previous_session_id", "replaced_by_session_id", "version",
    "issued_at", "rotated_at", "expires_at", "revoked_at", "revocation_reason", "created_at", "updated_at",
  ]) assert.match(migration, new RegExp(`\\b${field}\\b`));
  assert.match(migration, /CREATE TABLE saas\.panel_sessions\s*\(/);
  assert.match(migration, /PRIMARY KEY \(session_id\)/);
  assert.match(migration, /UNIQUE \(operation_id\)/);
  assert.match(migration, /UNIQUE \(token_key_id, token_digest\)/);
  assert.match(migration, /FOREIGN KEY \(principal_id\) REFERENCES saas\.principals\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /FOREIGN KEY \(active_store_id\) REFERENCES saas\.stores\(id\) ON DELETE RESTRICT/);
  assert.match(migration, /FOREIGN KEY \(previous_session_id\) REFERENCES saas\.panel_sessions\(session_id\) ON DELETE RESTRICT/);
  assert.match(migration, /FOREIGN KEY \(replaced_by_session_id\) REFERENCES saas\.panel_sessions\(session_id\) ON DELETE RESTRICT/);
  assert.match(migration, /CREATE UNIQUE INDEX panel_sessions_previous_unique_idx/);
  for (const forbidden of ["email", "oidc_state", "authorization_code", "access_token", "refresh_token", "id_token", "raw_credential", "audit_payload"]) {
    assert.equal(new RegExp(`\\b${forbidden}\\b`, "i").test(migration.replace(/^--.*$/gm, "")), false, forbidden);
  }
});

test("timestamp, lifetime, revocation, version, and replacement invariants are database enforced", () => {
  const migration = sql(upName);
  assert.match(migration, /issued_at <= rotated_at AND rotated_at < expires_at/);
  assert.match(migration, /expires_at <= issued_at \+ interval '8 hours'/);
  assert.match(migration, /revoked_at IS NULL AND revocation_reason IS NULL/);
  assert.match(migration, /revoked_at >= issued_at/);
  assert.match(migration, /session_id <> previous_session_id/);
  assert.match(migration, /session_id <> replaced_by_session_id/);
  assert.match(migration, /NEW\.version <> OLD\.version \+ 1/);
  assert.match(migration, /OLD\.revoked_at IS NOT NULL/);
  assert.match(migration, /OLD\.replaced_by_session_id IS NOT NULL/);
  assert.match(migration, /PHASE2B2A_IMMUTABLE_SESSION_AUTHORITY/);
  assert.match(migration, /PHASE2B2A_INVALID_SESSION_TRANSITION/);
  assert.match(migration, /panel_sessions_family_root_unique_idx/);
  assert.match(migration, /operation_kind = 'issue' AND previous_session_id IS NULL/);
  assert.match(migration, /operation_kind = 'rotate' AND previous_session_id IS NOT NULL/);
  assert.match(migration, /TG_OP = 'INSERT'/);
});

test("operation and family serialization use distinct transaction-scoped advisory locks", () => {
  const migration = sql(upName);
  assert.doesNotMatch(migration, /pg_advisory_lock|pg_advisory_unlock/);
  const issue = migration.slice(migration.indexOf("CREATE FUNCTION saas.issue_panel_session("), migration.indexOf("CREATE FUNCTION saas.resolve_panel_session("));
  const rotate = migration.slice(migration.indexOf("CREATE FUNCTION saas.rotate_panel_session("), migration.indexOf("CREATE FUNCTION saas.revoke_panel_session("));
  const family = migration.slice(migration.indexOf("CREATE FUNCTION saas.revoke_panel_session_family("), migration.indexOf("CREATE FUNCTION saas.expire_due_panel_sessions("));
  const operationLock = /pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\(p_operation_id::text,\s*(-?\d+)\)\s*\)/;
  const issueSeed = issue.match(operationLock)?.[1];
  const rotateSeed = rotate.match(operationLock)?.[1];
  assert.ok(issueSeed);
  assert.equal(rotateSeed, issueSeed);
  assert.ok(issue.indexOf("pg_advisory_xact_lock") < issue.indexOf("WHERE session.operation_id = p_operation_id"));
  assert.ok(rotate.indexOf("pg_advisory_xact_lock") < rotate.indexOf("WHERE session.operation_id = p_operation_id"));
  const familySeed = family.match(/hashtextextended\(current_session\.family_id::text,\s*(-?\d+)\)/)?.[1];
  assert.ok(familySeed);
  assert.notEqual(familySeed, issueSeed);
  assert.match(rotate, new RegExp(`hashtextextended\\(current_session\\.family_id::text,\\s*${familySeed}\\)`));
});

test("destructive revocation is independent of current tenant authorization", () => {
  const migration = sql(upName);
  const single = migration.slice(migration.indexOf("CREATE FUNCTION saas.revoke_panel_session("), migration.indexOf("CREATE FUNCTION saas.revoke_panel_session_family("));
  const family = migration.slice(migration.indexOf("CREATE FUNCTION saas.revoke_panel_session_family("), migration.indexOf("CREATE FUNCTION saas.expire_due_panel_sessions("));
  for (const definition of [single, family]) {
    assert.doesNotMatch(definition, /saas\.memberships|saas\.stores|saas\.subscriptions|saas\.plans/);
  }
  assert.match(family, /WHERE session\.family_id = current_session\.family_id AND session\.revoked_at IS NULL/);
});

test("rotation recovery is bound to the exact requested or inherited store", () => {
  const migration = sql(upName);
  const recovery = migration.slice(migration.indexOf("CREATE FUNCTION saas.recover_panel_session_operation("), migration.indexOf("CREATE FUNCTION saas.guard_panel_session_mutation("));
  assert.match(recovery, /p_requested_store_id uuid/);
  assert.match(recovery, /recovered\.active_store_id IS DISTINCT FROM COALESCE\(p_requested_store_id, previous\.active_store_id\)/);
  assert.match(migration, /recover_panel_session_operation\(uuid,text,text,text,uuid,uuid,text,text,uuid\)/);
  assert.match(sql(downName), /DROP FUNCTION saas\.recover_panel_session_operation\(uuid,text,text,text,uuid,uuid,text,text,uuid\)/);
});

test("runtime authority projections are recursively frozen before escape", () => {
  const repository = read("apps/customer-panel/lib/panel-session-persistence/postgres-panel-session-repository.ts");
  assert.match(repository, /deepFreezeProjection/);
  assert.match(repository, /Object\.freeze/);
  assert.match(repository, /features:\s*deepFreezeProjection/);
  assert.match(repository, /limits:\s*deepFreezeProjection/);
});

test("all seven narrow functions are fixed SECURITY DEFINER owner functions", () => {
  const migration = sql(upName);
  const functions = [
    "issue_panel_session", "resolve_panel_session", "rotate_panel_session", "revoke_panel_session",
    "revoke_panel_session_family", "expire_due_panel_sessions", "recover_panel_session_operation",
  ];
  for (const name of functions) {
    assert.match(migration, new RegExp(`CREATE FUNCTION saas\\.${name}\\(`));
    const block = migration.slice(migration.indexOf(`CREATE FUNCTION saas.${name}(`));
    const next = block.indexOf("CREATE FUNCTION", 20);
    const definition = next < 0 ? block : block.slice(0, next);
    assert.match(definition, /SECURITY DEFINER/);
    assert.match(definition, /SET search_path = pg_catalog, saas/);
    assert.equal(/\bEXECUTE\b|\bformat\s*\(/i.test(definition.replace(/SECURITY DEFINER/g, "")), false);
  }
  assert.match(migration, /ALTER FUNCTION saas\.issue_panel_session\([^;]+ OWNER TO celebix_saas_owner/);
});

test("PUBLIC is revoked and identity workload receives only fixed function execution", () => {
  const migration = sql(upName);
  assert.match(migration, /REVOKE ALL ON saas\.panel_sessions FROM PUBLIC/);
  assert.match(migration, /REVOKE ALL ON saas\.panel_sessions FROM celebix_saas_identity/);
  assert.doesNotMatch(migration, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)[^;]*ON\s+saas\.panel_sessions\s+TO\s+celebix_saas_identity/i);
  for (const name of [
    "issue_panel_session", "resolve_panel_session", "rotate_panel_session", "revoke_panel_session",
    "revoke_panel_session_family", "expire_due_panel_sessions", "recover_panel_session_operation",
  ]) {
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION saas\\.${name}\\([^;]+ FROM PUBLIC`));
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION saas\\.${name}\\([^;]+ TO celebix_saas_identity`));
  }
});

test("required lookup, family, store, expiry, and replacement indexes exist", () => {
  const migration = sql(upName);
  for (const index of [
    "panel_sessions_token_lookup_idx", "panel_sessions_principal_idx", "panel_sessions_family_active_idx",
    "panel_sessions_active_store_idx", "panel_sessions_expiry_idx", "panel_sessions_replacement_idx",
  ]) assert.match(migration, new RegExp(`CREATE (?:UNIQUE )?INDEX ${index}`));
  assert.match(migration, /FOR UPDATE SKIP LOCKED/);
  assert.match(migration, /ORDER BY session\.expires_at, session\.session_id/);
});

test("new source cannot activate routes, cookies, callbacks, provider networking, env, or generic SQL", () => {
  const sourceFiles = [
    "apps/customer-panel/lib/panel-session-persistence/activation.ts",
    "apps/customer-panel/lib/panel-session-persistence/credential-codec.ts",
    "apps/customer-panel/lib/panel-session-persistence/postgres-panel-session-repository.ts",
  ];
  const source = sourceFiles.map(read).join("\n");
  for (const forbidden of [
    /process\.env/, /from ["']pg["']/, /cookies\s*\(/, /Set-Cookie/i, /buildPanelSessionSetCookie/,
    /self-serve-callback-edge/, /internal-callback/, /provider.*fetch/i, /database[_A-Z]?url/i,
  ]) assert.doesNotMatch(source, forbidden);
  const repository = read(sourceFiles[2]);
  assert.doesNotMatch(repository, /export\s+(?:interface|type|class|const|function)\s+.*(?:Pool|Client|Query)/);
  for (const route of [
    "apps/customer-panel/app/auth/callback/route.ts",
    "apps/customer-panel/app/auth/login/route.ts",
    "apps/customer-panel/app/auth/logout/route.ts",
    "apps/customer-panel/app/api/session/active-store/route.ts",
  ]) assert.doesNotMatch(read(route), /panel-session-persistence|panel-session-auth/);
});

test("the stacked diff remains inside the Phase 2B2A allowlist and frozen surfaces are untouched", () => {
  const diffPaths = execFileSync("git", ["diff", "--name-only", "30850e2e8c54202f919c6bcaca880f7132187a45"], { cwd: root, encoding: "utf8" })
    .trim().split("\n").filter(Boolean);
  const statusPaths = execFileSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8" })
    .split("\n").filter(Boolean).map((line) => line.slice(3));
  const changed = [...new Set([...diffPaths, ...statusPaths])].sort();
  for (const file of changed) {
    assert.equal(
      file.startsWith("apps/customer-panel/lib/panel-session-persistence/")
      || file.startsWith("apps/customer-panel/lib/panel-session-auth/")
      || file.startsWith("apps/customer-panel/lib/saas-persistence/")
      || file.startsWith("apps/owner/scripts/sql/saas/")
      || file.startsWith("tests/saas-phase2/panel-sessions/")
      || file.startsWith("tests/saas-phase2/registration-session/"),
      true,
      file,
    );
  }
  for (const forbidden of [
    "package.json", "package-lock.json", "packages/saas-contracts/", "packages/saas-data/", "packages/saas-tenant-core/",
    "apps/admin/", "apps/admin-shared/", "apps/storefront", "deploy/", ".github/workflows/",
    "apps/customer-panel/lib/self-serve-callback-edge/", "apps/customer-panel/lib/self-serve-internal-callback-transport/",
    "apps/owner/lib/self-serve-http/", "apps/customer-panel/app/",
  ]) assert.equal(changed.some((file) => file === forbidden || file.startsWith(forbidden)), false, forbidden);
});

test("the correction diff is confined to the Atlas-approved seven files", () => {
  const changed = execFileSync("git", ["diff", "--name-only", "81c66dd695dc8f64e2b54ed3615d174682c220da"], { cwd: root, encoding: "utf8" })
    .trim().split("\n").filter(Boolean);
  const allowed = new Set([
    "apps/customer-panel/lib/panel-session-persistence/postgres-panel-session-repository.ts",
    "apps/customer-panel/lib/panel-session-persistence/postgres-panel-session-repository.test.ts",
    "apps/owner/scripts/sql/saas/202607140015_panel_sessions.up.sql",
    "apps/owner/scripts/sql/saas/202607140015_panel_sessions.down.sql",
    "apps/owner/scripts/sql/saas/phase2b2a-manifest.json",
    "tests/saas-phase2/panel-sessions/postgres-harness.mjs",
    "tests/saas-phase2/panel-sessions/static-security.test.mjs",
  ]);
  assert.equal(changed.every((file) => allowed.has(file)), true, changed.join("\n"));
  assert.equal(readdirSync(sqlDirectory).some((name) => /016.*panel/i.test(name)), false);
});
