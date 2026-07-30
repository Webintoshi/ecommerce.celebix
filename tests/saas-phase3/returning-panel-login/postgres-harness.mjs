import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { REQUIRED_APPLY_ORDER, REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const TOKEN = randomBytes(5).toString("hex");
const DB = `returning_login_${TOKEN}`;
const ROLLBACK_DB = `${DB}_rollback`;
const RESTORE_DB = `${DB}_restore`;
const UP = "202607300068_returning_panel_login_sessions.up.sql";
const DOWN = "202607300068_returning_panel_login_sessions.down.sql";
const VERIFY = "202607300068_returning_panel_login_sessions_assertions.sql";
const MANIFEST = JSON.parse(readFileSync(path.join(SQL, "phase3-returning-panel-login-manifest.json"), "utf8"));
const BASE_MANIFESTS = [
  "phase2a1-manifest.json",
  "phase2b1-manifest.json",
  "phase2b1b1-manifest.json",
  "phase2b2a-manifest.json",
  "phase2b2b1-manifest.json",
  "phase2b2b2a1-manifest.json",
].map((file) => JSON.parse(readFileSync(path.join(SQL, file), "utf8")));
const TOTAL = 14;
let completed = 0;

const ID = Object.freeze({
  plan: "00000000-0000-4000-8000-000000000001",
  principal: "10000000-0000-4000-8000-000000000001",
  store: "20000000-0000-4000-8000-000000000001",
  membership: "30000000-0000-4000-8000-000000000001",
  subscription: "40000000-0000-4000-8000-000000000001",
  session: "50000000-0000-4000-8000-000000000001",
  family: "60000000-0000-4000-8000-000000000001",
  operation: "70000000-0000-4000-8000-000000000001",
});
const ISSUER = "https://identity.example.test/oidc";
const SUBJECT = "returning-merchant-1";
const KEY = "panel.active.v1";
const DIGEST = createHash("sha256").update("returning-session-credential").digest("hex");

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {}
  }
  return null;
}
function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: "utf8",
    input: options.input,
    env: { ...process.env, PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}
function commandAsync(program, args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: ROOT,
      env: { ...process.env, PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input);
  });
}
function start() {
  assertSafeEnvironment();
  const names = [...new Set([...REQUIRED_NATIVE_TOOLS, "pg_dump", "pg_restore"] )];
  const executables = Object.fromEntries(names.map((name) => [name, executable(name)]));
  if (Object.values(executables).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const root = mkdtempSync("/tmp/celebix-returning-login-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 20_000 + Math.floor(Math.random() * 15_000);
  mkdirSync(socket, { mode: 0o700 });
  command(executables.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(executables.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { executables, root, data, socket, port, pid: Number.parseInt(readFileSync(path.join(data, "postmaster.pid"), "utf8"), 10), started: true };
}
function stop(box) {
  if (!box) return;
  if (box.started) command(box.executables.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], { allowFailure: true });
  rmSync(box.root, { recursive: true, force: true });
}
function args(box, database = DB) {
  return ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database];
}
function psql(box, source, database = DB, allowFailure = false) {
  return command(box.executables.psql, args(box, database), { input: source, allowFailure });
}
async function psqlAsync(box, source, database = DB) {
  const result = await commandAsync(box.executables.psql, args(box, database), source);
  if (result.status !== 0) throw new Error(`psql failed\n${result.stderr}`);
  return result.stdout.trim();
}
function apply(box, file, database = DB, asMigrator = true) {
  const source = readFileSync(path.join(SQL, file), "utf8");
  psql(box, asMigrator ? `SET SESSION AUTHORIZATION celebix_saas_migrator;\n${source}\nRESET SESSION AUTHORIZATION;` : source, database);
}
function sha256(file) { return createHash("sha256").update(readFileSync(path.join(SQL, file))).digest("hex"); }
function applyBase(box, database = DB, includeRoles = true) {
  for (const manifest of BASE_MANIFESTS) {
    assert.equal(manifest.postgresqlMajor, 16);
    for (const artifact of manifest.artifacts) assert.equal(sha256(artifact.file), artifact.sha256, artifact.file);
  }
  if (includeRoles) apply(box, REQUIRED_APPLY_ORDER[0], database, false);
  for (const file of REQUIRED_APPLY_ORDER.slice(1)) apply(box, file, database);
  if (includeRoles) apply(box, "202607110007_identity_roles.up.sql", database, false);
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
async function scenario(name, run) {
  await run();
  completed += 1;
  process.stdout.write(`PASS ${completed}/${TOTAL} ${name}\n`);
}
function issueSql(now, overrides = {}) {
  const values = {
    issuer: ISSUER, subject: SUBJECT, session: ID.session, family: ID.family, operation: ID.operation,
    key: KEY, digest: DIGEST, now, expires: new Date(Date.parse(now) + 8 * 60 * 60_000).toISOString(),
    ...overrides,
  };
  return `BEGIN;SET LOCAL ROLE celebix_saas_identity;
    SELECT outcome||'|'||COALESCE(authority::text,'') FROM saas.issue_returning_panel_session(
      '${values.issuer}','${values.subject}','${values.session}','${values.family}','${values.operation}',
      '${values.key}','${values.digest}','${values.now}','${values.expires}');COMMIT;`;
}
function seed(box, now, database = DB) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
      VALUES('${ID.store}','Returning Store','returning-store','active','tr','TRY','starter','${now}','${now}');
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
      VALUES('${ID.principal}','${ISSUER}','${SUBJECT}','returning@example.test',true,'${now}','${now}');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
      VALUES('${ID.membership}','${ID.principal}','${ID.store}','store_owner','active','${now}','${now}');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
      VALUES('${ID.subscription}','${ID.store}','${ID.plan}','free_starter',1,'active','2026-01-01T00:00:00.000Z','${now}','${now}');
    COMMIT;`, database);
}
function absent(pid) { return !Number.isSafeInteger(pid) || spawnSync("kill", ["-0", String(pid)]).status !== 0; }

async function main() {
  let box;
  let cleanupRoot;
  let cleanupPid;
  try {
    box = start();
    cleanupRoot = box.root;
    cleanupPid = box.pid;
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    applyBase(box);
    psql(box, `CREATE DATABASE ${ROLLBACK_DB} TEMPLATE ${DB};`, "postgres");
    apply(box, UP);
    apply(box, VERIFY);
    const now = new Date().toISOString();
    seed(box, now);

    await scenario("manifest checksums are exact", () => {
      assert.equal(MANIFEST.postgresqlMajor, 16);
      assert.deepEqual(MANIFEST.artifacts.map(({ direction }) => direction), ["up", "down", "verify"]);
      for (const artifact of MANIFEST.artifacts) assert.equal(sha256(artifact.file), artifact.sha256, artifact.file);
    });
    await scenario("PostgreSQL 16 applies migration and catalog assertions", () => {
      assert.match(psql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
      assert.notEqual(psql(box, "SELECT to_regprocedure('saas.issue_returning_panel_session(text,text,uuid,uuid,uuid,text,text,timestamp with time zone,timestamp with time zone)');").stdout.trim(), "");
    });
    await scenario("only identity authority can execute returning-login functions", () => {
      const acl = psql(box, `SELECT
        has_function_privilege('celebix_saas_identity','saas.issue_returning_panel_session(text,text,uuid,uuid,uuid,text,text,timestamp with time zone,timestamp with time zone)','EXECUTE')||'|'||
        has_function_privilege('celebix_saas_app','saas.issue_returning_panel_session(text,text,uuid,uuid,uuid,text,text,timestamp with time zone,timestamp with time zone)','EXECUTE')||'|'||
        EXISTS(SELECT 1 FROM pg_proc procedure CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl,acldefault('f',procedure.proowner))) acl
          WHERE procedure.oid='saas.recover_returning_panel_session(text,text,uuid,text,text)'::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE');`).stdout.trim();
      assert.equal(acl, "true|false|false");
    });
    const issued = psql(box, issueSql(now)).stdout.trim();
    await scenario("exact verified identity and store-owner authority issue one session", () => {
      assert.match(issued, /^issued\|/);
      assert.match(issued, new RegExp(ID.principal));
      assert.match(issued, new RegExp(ID.store));
      assert.equal(psql(box, `SELECT count(*) FROM saas.panel_sessions WHERE operation_id='${ID.operation}';`).stdout.trim(), "1");
    });
    await scenario("exact operation replay is immutable", () => {
      assert.match(psql(box, issueSql(now)).stdout.trim(), /^operation_replayed\|/);
      assert.match(psql(box, issueSql(now, { digest: "b".repeat(64) })).stdout.trim(), /^operation_mismatch\|/);
      assert.equal(psql(box, `SELECT count(*) FROM saas.panel_sessions WHERE operation_id='${ID.operation}';`).stdout.trim(), "1");
    });
    await scenario("read-only recovery requires exact verified identity and operation proof", () => {
      const recovered = psql(box, `BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_identity;
        SELECT outcome||'|'||COALESCE(authority::text,'') FROM saas.recover_returning_panel_session(
          '${ISSUER}','${SUBJECT}','${ID.operation}','${KEY}','${DIGEST}');COMMIT;`).stdout.trim();
      assert.match(recovered, /^operation_replayed\|/);
      const denied = psql(box, `BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_identity;
        SELECT outcome FROM saas.recover_returning_panel_session('${ISSUER}','wrong-subject','${ID.operation}','${KEY}','${DIGEST}');COMMIT;`).stdout.trim();
      assert.equal(denied, "unavailable");
    });
    await scenario("wrong identity and inactive owner membership fail without durable mutation", () => {
      const wrong = psql(box, issueSql(new Date().toISOString(), { subject: "wrong-subject", operation: "70000000-0000-4000-8000-000000000002", session: "50000000-0000-4000-8000-000000000002", family: "60000000-0000-4000-8000-000000000002" })).stdout.trim();
      assert.equal(wrong, "membership_denied|");
      psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.memberships SET status='revoked',updated_at=clock_timestamp() WHERE id='${ID.membership}';COMMIT;`);
      const inactive = psql(box, issueSql(new Date().toISOString(), { operation: "70000000-0000-4000-8000-000000000003", session: "50000000-0000-4000-8000-000000000003", family: "60000000-0000-4000-8000-000000000003" })).stdout.trim();
      assert.equal(inactive, "membership_denied|");
      psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.memberships SET status='active',updated_at=clock_timestamp() WHERE id='${ID.membership}';COMMIT;`);
    });
    await scenario("inactive store and subscription fail without a session", () => {
      for (const [table, id, status] of [["stores", ID.store, "suspended"], ["subscriptions", ID.subscription, "inactive"]]) {
        psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.${table} SET status='${status}',updated_at=clock_timestamp() WHERE id='${id}';COMMIT;`);
        const ordinal = table === "stores" ? "4" : "5";
        const denied = psql(box, issueSql(new Date().toISOString(), { operation: `70000000-0000-4000-8000-00000000000${ordinal}`, session: `50000000-0000-4000-8000-00000000000${ordinal}`, family: `60000000-0000-4000-8000-00000000000${ordinal}` })).stdout.trim();
        assert.equal(denied, "membership_denied|");
        psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.${table} SET status='active',updated_at=clock_timestamp() WHERE id='${id}';COMMIT;`);
      }
    });
    await scenario("concurrent identical issuance commits exactly one durable session", async () => {
      const concurrentNow = new Date().toISOString();
      const sql = issueSql(concurrentNow, { operation: "70000000-0000-4000-8000-000000000006", session: "50000000-0000-4000-8000-000000000006", family: "60000000-0000-4000-8000-000000000006", digest: createHash("sha256").update("concurrent").digest("hex") });
      const results = await Promise.all([psqlAsync(box, sql), psqlAsync(box, sql)]);
      assert.deepEqual(results.map((value) => value.split("|")[0]).sort(), ["issued", "operation_replayed"]);
      assert.equal(psql(box, "SELECT count(*) FROM saas.panel_sessions WHERE operation_id='70000000-0000-4000-8000-000000000006';").stdout.trim(), "1");
    });
    await scenario("identity role cannot read or mutate panel-session rows directly", () => {
      const select = psql(box, "BEGIN;SET LOCAL ROLE celebix_saas_identity;SELECT count(*) FROM saas.panel_sessions;ROLLBACK;", DB, true);
      assert.notEqual(select.status, 0);
      const update = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_identity;UPDATE saas.panel_sessions SET expires_at=clock_timestamp() WHERE operation_id='${ID.operation}';ROLLBACK;`, DB, true);
      assert.notEqual(update.status, 0);
    });
    await scenario("rollback removes only returning-login functions and reapply restores them", () => {
      apply(box, UP, ROLLBACK_DB);
      apply(box, VERIFY, ROLLBACK_DB);
      apply(box, DOWN, ROLLBACK_DB);
      assert.equal(psql(box, "SELECT to_regprocedure('saas.issue_returning_panel_session(text,text,uuid,uuid,uuid,text,text,timestamp with time zone,timestamp with time zone)') IS NULL;", ROLLBACK_DB).stdout.trim(), "t");
      apply(box, UP, ROLLBACK_DB);
      apply(box, VERIFY, ROLLBACK_DB);
    });
    const dump = path.join(box.root, "returning-login.dump");
    command(box.executables.pg_dump, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-d", DB, "-Fc", "-f", dump]);
    psql(box, `CREATE DATABASE ${RESTORE_DB};`, "postgres");
    command(box.executables.pg_restore, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-d", RESTORE_DB, "--exit-on-error", dump]);
    await scenario("backup and restore retain functions, ACLs, and durable session", () => {
      apply(box, VERIFY, RESTORE_DB);
      assert.equal(psql(box, `SELECT count(*) FROM saas.panel_sessions WHERE operation_id='${ID.operation}';`, RESTORE_DB).stdout.trim(), "1");
    });
    await scenario("no external connection or production identifier is present", () => {
      for (const artifact of MANIFEST.artifacts) {
        const source = readFileSync(path.join(SQL, artifact.file), "utf8");
        assert.doesNotMatch(source, /(?:postgres(?:ql)?:\/\/|celebix\.site|guzidekuyumcu|r2\.dev|amazonaws\.com)/i);
      }
    });
    await scenario("disposable databases are isolated from external network authority", () => {
      assert.equal(psql(box, "SELECT inet_server_addr() IS NULL;").stdout.trim(), "t");
      assert.equal(psql(box, "SELECT current_database();").stdout.trim(), DB);
    });
    assert.equal(completed, TOTAL);
    process.stdout.write(`PASS ${completed}/${TOTAL} RETURNING_PANEL_LOGIN_POSTGRESQL16_COMPLETE\n`);
  } finally {
    stop(box);
    assert.equal(absent(cleanupPid), true);
    assert.equal(cleanupRoot ? existsSync(cleanupRoot) : false, false);
  }
}

await main();
