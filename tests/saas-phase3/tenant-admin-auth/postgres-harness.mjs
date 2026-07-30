import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { REQUIRED_APPLY_ORDER, REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = `tenant_admin_${randomBytes(5).toString("hex")}`;
const ROLLBACK_DB = `${DB}_rollback`;
const UP = "202607300069_tenant_admin_domains_and_principal_logout.up.sql";
const DOWN = "202607300069_tenant_admin_domains_and_principal_logout.down.sql";
const VERIFY = "202607300069_tenant_admin_domains_and_principal_logout_assertions.sql";

const ID = Object.freeze({
  principal: "10000000-0000-4000-8000-000000000001",
  storeA: "20000000-0000-4000-8000-000000000001",
  storeB: "20000000-0000-4000-8000-000000000002",
  membershipA: "30000000-0000-4000-8000-000000000001",
  membershipB: "30000000-0000-4000-8000-000000000002",
  domainA: "40000000-0000-4000-8000-000000000001",
  domainB: "40000000-0000-4000-8000-000000000002",
  aliasA: "40000000-0000-4000-8000-000000000003",
  sessionA: "50000000-0000-4000-8000-000000000001",
  sessionB: "50000000-0000-4000-8000-000000000002",
  sessionC: "50000000-0000-4000-8000-000000000003",
  familyA: "60000000-0000-4000-8000-000000000001",
  familyB: "60000000-0000-4000-8000-000000000002",
  familyC: "60000000-0000-4000-8000-000000000003",
  operationA: "70000000-0000-4000-8000-000000000001",
  operationB: "70000000-0000-4000-8000-000000000002",
  operationC: "70000000-0000-4000-8000-000000000003",
  handoff: "80000000-0000-4000-8000-000000000001",
  handoffOperation: "90000000-0000-4000-8000-000000000001",
});

const key = "panel.active.v1";
const handoffKey = "panel.handoff.v1";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const sessionDigestA = digest("session-a");
const sessionDigestB = digest("session-b");
const sessionDigestC = digest("session-c");
const handoffDigest = digest("cross-host-handoff");

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {}
  }
  return null;
}

function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: "utf8",
    input,
    env: { ...process.env, PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}

function start() {
  assertSafeEnvironment();
  const tools = Object.fromEntries([...new Set(REQUIRED_NATIVE_TOOLS)].map((name) => [name, executable(name)]));
  if (Object.values(tools).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const root = mkdtempSync("/tmp/celebix-tenant-admin-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 20_000 + Math.floor(Math.random() * 15_000);
  mkdirSync(socket, { mode: 0o700 });
  command(tools.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(tools.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { tools, root, data, socket, port, started: true };
}

function stop(box) {
  if (!box) return;
  if (box.started) command(box.tools.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], "", true);
  rmSync(box.root, { recursive: true, force: true });
}

function psql(box, sql, database = DB, allowFailure = false) {
  return command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], sql, allowFailure);
}

function apply(box, file, database = DB, asMigrator = true) {
  const source = readFileSync(path.join(SQL, file), "utf8");
  psql(box, asMigrator ? `SET SESSION AUTHORIZATION celebix_saas_migrator;\n${source}\nRESET SESSION AUTHORIZATION;` : source, database);
}

function applyBase(box, database = DB) {
  apply(box, REQUIRED_APPLY_ORDER[0], database, false);
  for (const file of REQUIRED_APPLY_ORDER.slice(1)) apply(box, file, database);
  apply(box, "202607110007_identity_roles.up.sql", database, false);
  for (const file of [
    "202607110008_identity_persistence.up.sql",
    "202607110009_identity_grants.sql",
    "202607110010_identity_catalog_assertions.sql",
    "202607120012_verified_identity_snapshot.up.sql",
    "202607120013_verified_identity_grants.sql",
    "202607120014_verified_identity_catalog_assertions.sql",
    "202607140015_panel_sessions.up.sql",
    "202607140016_panel_session_handoffs.up.sql",
    "202607140017_panel_browser_bindings.up.sql",
  ]) apply(box, file, database);
}

function issueSession(box, now, session, family, operation, store, tokenDigest) {
  const expires = new Date(Date.parse(now) + 8 * 60 * 60_000).toISOString();
  return psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_identity;
    SELECT outcome FROM saas.issue_panel_session(
      '${session}','${family}','${operation}','${key}','${tokenDigest}',
      '${ID.principal}','${store}','${now}','${expires}');COMMIT;`).stdout.trim();
}

function main() {
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    applyBase(box);
    psql(box, `CREATE DATABASE ${ROLLBACK_DB} TEMPLATE ${DB};`, "postgres");
    apply(box, UP);
    apply(box, VERIFY);
    assert.match(psql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
    process.stdout.write("PASS PostgreSQL 16 applies and verifies tenant admin authority\n");

    const now = new Date().toISOString();
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
        VALUES('${ID.principal}','https://identity.example.test/oidc','merchant','merchant@example.test',true,'${now}','${now}');
      INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
        ('${ID.storeA}','Guzide Kuyumcu','guzide-kuyumcu-4','active','tr','TRY','starter','${now}','${now}'),
        ('${ID.storeB}','Hemenaku','hemenaku','active','tr','TRY','starter','${now}','${now}');
      INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
        ('${ID.membershipA}','${ID.principal}','${ID.storeA}','store_owner','active','${now}','${now}'),
        ('${ID.membershipB}','${ID.principal}','${ID.storeB}','admin','active','${now}','${now}');
      COMMIT;`);
    for (const [domain, store, hostname] of [
      [ID.domainA, ID.storeA, "guzide-kuyumcu-4.admin.saas-staging.celebix.site"],
      [ID.domainB, ID.storeB, "hemenaku.admin.saas-staging.celebix.site"],
    ]) {
      const outcome = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_bootstrap;
        SELECT outcome FROM saas.provision_canonical_admin_domain('${domain}','${store}','${hostname}','${now}');COMMIT;`).stdout.trim();
      assert.equal(outcome, "provisioned");
    }
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.admin_domains(id,store_id,hostname,kind,status,canonical,verified_at,version,created_at,updated_at)
      VALUES('${ID.aliasA}','${ID.storeA}','admin.guzide.example.test','custom_alias','active',false,'${now}',1,'${now}','${now}');COMMIT;`);
    const canonicalBrand = psql(box, `BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_host_resolver;
      SELECT outcome||'|'||(authority->>'storeSlug')||'|'||(authority->>'canonicalAdminOrigin')
      FROM saas.resolve_public_admin_brand('guzide-kuyumcu-4.admin.saas-staging.celebix.site','${now}');COMMIT;`).stdout.trim();
    const aliasBrand = psql(box, `BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_host_resolver;
      SELECT outcome||'|'||(authority->>'storeSlug')||'|'||(authority->>'canonicalAdminOrigin')
      FROM saas.resolve_public_admin_brand('admin.guzide.example.test','${now}');COMMIT;`).stdout.trim();
    assert.equal(canonicalBrand, "resolved|guzide-kuyumcu-4|https://guzide-kuyumcu-4.admin.saas-staging.celebix.site");
    assert.equal(aliasBrand, canonicalBrand);
    assert.equal(psql(box, `BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_host_resolver;
      SELECT outcome FROM saas.resolve_public_admin_brand('unknown.admin.saas-staging.celebix.site','${now}');COMMIT;`).stdout.trim(), "admin_host_unknown");
    process.stdout.write("PASS exact canonical and alias host resolution is store isolated\n");

    assert.equal(issueSession(box, now, ID.sessionA, ID.familyA, ID.operationA, ID.storeA, sessionDigestA), "issued");
    assert.equal(issueSession(box, now, ID.sessionB, ID.familyB, ID.operationB, ID.storeB, sessionDigestB), "issued");
    const handoffExpires = new Date(Date.parse(now) + 2 * 60_000).toISOString();
    const sessionExpires = new Date(Date.parse(now) + 8 * 60 * 60_000).toISOString();
    const issued = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_identity;
      SELECT outcome FROM saas.issue_cross_host_panel_handoff(
        '${key}','${sessionDigestA}','${ID.handoff}','${ID.handoffOperation}','${handoffKey}','${handoffDigest}',
        '${ID.storeB}','hemenaku.admin.saas-staging.celebix.site','${ID.operationC}','${ID.sessionC}','${ID.familyC}',
        '${key}','${sessionDigestC}','${now}','${handoffExpires}','${sessionExpires}');COMMIT;`).stdout.trim();
    assert.equal(issued, "handoff_issued");
    assert.equal(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_identity;
      SELECT outcome FROM saas.redeem_cross_host_panel_handoff('${handoffKey}','${handoffDigest}','guzide-kuyumcu-4.admin.saas-staging.celebix.site','${now}');COMMIT;`).stdout.trim(), "unauthenticated");
    assert.equal(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_identity;
      SELECT outcome FROM saas.redeem_cross_host_panel_handoff('${handoffKey}','${handoffDigest}','hemenaku.admin.saas-staging.celebix.site','${now}');COMMIT;`).stdout.trim(), "redeemed");
    assert.equal(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_identity;
      SELECT outcome FROM saas.redeem_cross_host_panel_handoff('${handoffKey}','${handoffDigest}','hemenaku.admin.saas-staging.celebix.site','${now}');COMMIT;`).stdout.trim(), "handoff_replayed");
    process.stdout.write("PASS cross-host handoff is hostname-bound and single-use\n");

    const logout = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_identity;
      SELECT outcome||'|'||(authority->>'revokedCount') FROM saas.revoke_principal_panel_sessions(
        '${key}','${sessionDigestA}','logout','${now}');COMMIT;`).stdout.trim();
    assert.equal(logout, "principal_revoked|3");
    assert.equal(psql(box, `SELECT count(*) FROM saas.panel_sessions WHERE principal_id='${ID.principal}' AND revoked_at IS NULL;`).stdout.trim(), "0");
    process.stdout.write("PASS principal logout revokes every active session family\n");

    apply(box, UP, ROLLBACK_DB);
    apply(box, VERIFY, ROLLBACK_DB);
    apply(box, DOWN, ROLLBACK_DB);
    assert.equal(psql(box, "SELECT to_regclass('saas.admin_domains') IS NULL AND to_regclass('saas.cross_host_panel_handoffs') IS NULL;", ROLLBACK_DB).stdout.trim(), "t");
    apply(box, UP, ROLLBACK_DB);
    apply(box, VERIFY, ROLLBACK_DB);
    process.stdout.write("PASS rollback removes only phase objects and reapply verifies\n");
  } finally {
    stop(box);
  }
}

main();
