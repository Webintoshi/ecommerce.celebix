import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const TOKEN = randomBytes(5).toString("hex");
const DB = `pilot_plan_${TOKEN}`;
const ROLLBACK = `${DB}_rollback`;
const STORE_A = "51000000-0000-4000-8000-000000000001";
const STORE_B = "51000000-0000-4000-8000-000000000002";
const FREE_PLAN = "00000000-0000-4000-8000-000000000001";
const PILOT_PLAN = "00000000-0000-4000-8000-000000000002";
const FREE_SUB_A = "52000000-0000-4000-8000-000000000001";
const FREE_SUB_B = "52000000-0000-4000-8000-000000000002";
const PILOT_SUB_A = "53000000-0000-4000-8000-000000000001";
const PILOT_SUB_B_A = "53000000-0000-4000-8000-000000000002";
const PILOT_SUB_B_B = "53000000-0000-4000-8000-000000000003";
const NOW = "2026-07-29T04:00:00.000Z";
const UP = "202607290064_pilot_plan_authority.up.sql";
const DOWN = "202607290064_pilot_plan_authority.down.sql";
const ASSERTIONS = "202607290064_pilot_plan_authority_assertions.sql";
const PHASE2A1 = JSON.parse(readFileSync(path.join(SQL, "phase2a1-manifest.json"), "utf8"));
const TOTAL = 12;
let completed = 0;

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
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(input);
  });
}

function start() {
  assertSafeEnvironment();
  const names = [...new Set([...REQUIRED_NATIVE_TOOLS, "createdb", "dropdb"])]
  const executables = Object.fromEntries(names.map((name) => [name, executable(name)]));
  if (Object.values(executables).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const root = mkdtempSync("/tmp/celebix-pilot-plan-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 20_000 + Math.floor(Math.random() * 15_000);
  mkdirSync(socket, { mode: 0o700 });
  command(executables.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(executables.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { executables, root, data, socket, port, started: true };
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

function apply(box, file, database = DB) {
  psql(box, readFileSync(path.join(SQL, file), "utf8"), database);
}

function applyFoundation(box, database = DB, includeRoles = false) {
  for (const id of [
    ...(includeRoles ? ["202607110001_roles_up"] : []),
    "202607110002_foundation_up",
    "202607110003_free_starter_seed",
    "202607110003_plan_versions_freeze",
    "202607110004_grants",
  ]) {
    const artifact = PHASE2A1.artifacts.find((entry) => entry.id === id);
    assert.ok(artifact, id);
    apply(box, artifact.file, database);
  }
}

function seedStores(box, database = DB) {
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE_A}','Store A','store-a','active','tr','TRY','default','${NOW}','${NOW}'),
      ('${STORE_B}','Store B','store-b','active','tr','TRY','default','${NOW}','${NOW}');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES
      ('${FREE_SUB_A}','${STORE_A}','${FREE_PLAN}','free_starter',1,'active','2026-01-01',NULL,'${NOW}','${NOW}'),
      ('${FREE_SUB_B}','${STORE_B}','${FREE_PLAN}','free_starter',1,'active','2026-01-01',NULL,'${NOW}','${NOW}');
    COMMIT;`, database);
}

function expression({
  store = STORE_A,
  expectedSubscription = FREE_SUB_A,
  expectedCode = "free_starter",
  expectedVersion = 1,
  targetSubscription = PILOT_SUB_A,
  targetCode = "pilot",
  targetVersion = 1,
  now = NOW,
} = {}) {
  return `saas.assign_store_plan('${store}','${expectedSubscription}','${expectedCode}',${expectedVersion},'${targetSubscription}','${targetCode}',${targetVersion},'${now}')`;
}

function assign(box, options = {}, database = DB, role = "celebix_saas_bootstrap") {
  const raw = psql(box, `BEGIN; SET LOCAL ROLE ${role}; SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${expression(options)}; COMMIT;`, database).stdout.trim();
  return JSON.parse(raw);
}

async function assignAsync(box, options, database = DB) {
  return psqlAsync(box, `BEGIN; SET LOCAL ROLE celebix_saas_bootstrap; SELECT outcome FROM ${expression(options)}; COMMIT;`, database);
}

async function scenario(name, run) {
  await run();
  completed += 1;
  process.stdout.write(`PASS ${completed}/${TOTAL} ${name}\n`);
}

async function main() {
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    applyFoundation(box, DB, true);
    psql(box, `CREATE DATABASE ${ROLLBACK} TEMPLATE ${DB};`, "postgres");
    apply(box, UP);
    apply(box, ASSERTIONS);
    seedStores(box);

    await scenario("PostgreSQL 16 applies pilot v1 exactly", () => {
      assert.match(psql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
      assert.equal(psql(box, `SELECT plan_code||'|'||version||'|'||status FROM saas.plans WHERE id='${PILOT_PLAN}';`).stdout.trim(), "pilot|1|active");
      assert.equal(psql(box, `SELECT string_agg(limit_key||'='||effective_limit,',' ORDER BY limit_ordinal) FROM saas.plan_limits WHERE plan_id='${PILOT_PLAN}';`).stdout.trim(), "products=2000,staff=5,storageBytes=10000000000,monthlyOrders=10000,customDomains=1");
      assert.equal(psql(box, `SELECT count(*) FROM saas.plan_features WHERE plan_id='${PILOT_PLAN}' AND enabled;`).stdout.trim(), "13");
    });

    await scenario("free starter and immutable triggers remain exact", () => {
      assert.equal(psql(box, `SELECT effective_limit FROM saas.plan_limits WHERE plan_id='${FREE_PLAN}' AND limit_key='products';`).stdout.trim(), "100");
      assert.equal(psql(box, "SELECT count(*) FROM pg_trigger WHERE tgrelid IN('saas.plans'::regclass,'saas.plan_features'::regclass,'saas.plan_limits'::regclass) AND tgname IN('plan_versions_immutable','plan_features_immutable','plan_limits_immutable') AND tgenabled='O';").stdout.trim(), "3");
      apply(box, UP);
      assert.equal(psql(box, `SELECT count(*) FROM saas.plans WHERE id='${PILOT_PLAN}';`).stdout.trim(), "1");
    });

    await scenario("only bootstrap can execute plan assignment", () => {
      const denied = psql(box, `SET ROLE celebix_saas_app; SELECT outcome FROM ${expression()};`, DB, true);
      assert.notEqual(denied.status, 0);
      assert.match(denied.stderr, /permission denied/i);
      const acl = psql(box, "SELECT array_to_string(proacl,',') FROM pg_proc WHERE oid='saas.assign_store_plan(uuid,uuid,text,bigint,uuid,text,bigint,timestamp with time zone)'::regprocedure;").stdout.trim();
      assert.match(acl, /celebix_saas_bootstrap=X/);
      assert.doesNotMatch(acl, /celebix_saas_app=X|celebix_saas_identity=X|(^|,)=X\//);
    });

    await scenario("invalid codes versions and timestamps fail without writes", () => {
      for (const options of [
        { targetCode: "Pilot" },
        { targetVersion: 0 },
        { now: "2020-01-01T00:00:00.000Z" },
      ]) assert.equal(assign(box, options).outcome, "invalid_input");
      assert.equal(psql(box, `SELECT count(*) FROM saas.subscriptions WHERE store_id='${STORE_A}' AND status='active';`).stdout.trim(), "1");
    });

    await scenario("wrong store or current subscription fails closed", () => {
      assert.equal(assign(box, { store: STORE_B }).outcome, "subscription_not_found");
      assert.equal(assign(box, { expectedSubscription: FREE_SUB_B }).outcome, "subscription_not_found");
      assert.equal(assign(box, { expectedCode: "pilot" }).outcome, "subscription_not_found");
      assert.equal(psql(box, `SELECT plan_code FROM saas.subscriptions WHERE store_id='${STORE_A}' AND status='active';`).stdout.trim(), "free_starter");
    });

    await scenario("missing target plan fails closed", () => {
      assert.equal(assign(box, { targetCode: "missing" }).outcome, "plan_not_found");
      assert.equal(psql(box, `SELECT plan_code FROM saas.subscriptions WHERE store_id='${STORE_A}' AND status='active';`).stdout.trim(), "free_starter");
    });

    await scenario("assignment atomically replaces the active subscription", () => {
      const result = assign(box);
      assert.equal(result.outcome, "assigned");
      assert.deepEqual(Object.keys(result.result).sort(), ["planCode", "planId", "planVersion", "previousSubscriptionId", "storeId", "subscriptionId"].sort());
      assert.equal(result.result.planCode, "pilot");
      assert.equal(psql(box, `SELECT status='inactive' AND valid_until='${NOW}'::timestamptz FROM saas.subscriptions WHERE id='${FREE_SUB_A}';`).stdout.trim(), "t");
      assert.equal(psql(box, `SELECT plan_code||'|'||status FROM saas.subscriptions WHERE id='${PILOT_SUB_A}';`).stdout.trim(), "pilot|active");
      assert.equal(psql(box, `SELECT count(*) FROM saas.subscriptions WHERE store_id='${STORE_A}' AND status='active';`).stdout.trim(), "1");
    });

    await scenario("exact replay succeeds and target identity mismatch is denied", () => {
      assert.equal(assign(box).outcome, "operation_replayed");
      assert.equal(assign(box, { expectedSubscription: FREE_SUB_B }).outcome, "operation_mismatch");
      assert.equal(assign(box, { targetCode: "free_starter" }).outcome, "operation_mismatch");
      assert.equal(psql(box, `SELECT count(*) FROM saas.subscriptions WHERE store_id='${STORE_A}';`).stdout.trim(), "2");
    });

    await scenario("target subscription identity cannot cross tenants", () => {
      assert.equal(assign(box, { store: STORE_B, expectedSubscription: FREE_SUB_B }).outcome, "operation_mismatch");
      assert.equal(psql(box, `SELECT plan_code FROM saas.subscriptions WHERE store_id='${STORE_B}' AND status='active';`).stdout.trim(), "free_starter");
    });

    await scenario("concurrent assignments produce one winner and one closed loser", async () => {
      const outcomes = await Promise.all([
        assignAsync(box, { store: STORE_B, expectedSubscription: FREE_SUB_B, targetSubscription: PILOT_SUB_B_A }),
        assignAsync(box, { store: STORE_B, expectedSubscription: FREE_SUB_B, targetSubscription: PILOT_SUB_B_B }),
      ]);
      assert.deepEqual(outcomes.sort(), ["assigned", "subscription_not_found"]);
      assert.equal(psql(box, `SELECT count(*) FROM saas.subscriptions WHERE store_id='${STORE_B}' AND status='active' AND plan_code='pilot';`).stdout.trim(), "1");
      assert.equal(psql(box, `SELECT count(*) FROM saas.subscriptions WHERE store_id='${STORE_B}';`).stdout.trim(), "2");
    });

    await scenario("rollback removes only unreferenced pilot authority", () => {
      apply(box, UP, ROLLBACK);
      apply(box, DOWN, ROLLBACK);
      assert.equal(psql(box, `SELECT count(*) FROM saas.plans WHERE id='${PILOT_PLAN}';`, ROLLBACK).stdout.trim(), "0");
      assert.equal(psql(box, `SELECT effective_limit FROM saas.plan_limits WHERE plan_id='${FREE_PLAN}' AND limit_key='products';`, ROLLBACK).stdout.trim(), "100");
      assert.equal(psql(box, "SELECT to_regprocedure('saas.assign_store_plan(uuid,uuid,text,bigint,uuid,text,bigint,timestamp with time zone)') IS NULL;", ROLLBACK).stdout.trim(), "t");
    });

    await scenario("rollback reapply and assertions are deterministic", () => {
      apply(box, UP, ROLLBACK);
      apply(box, ASSERTIONS, ROLLBACK);
      apply(box, UP, ROLLBACK);
      assert.equal(psql(box, `SELECT count(*) FROM saas.plan_limits WHERE plan_id='${PILOT_PLAN}';`, ROLLBACK).stdout.trim(), "5");
    });

    assert.equal(completed, TOTAL);
    process.stdout.write(`PASS ${TOTAL}/${TOTAL} pilot plan authority\n`);
  } finally {
    if (box) {
      psql(box, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN('${DB}','${ROLLBACK}') AND pid<>pg_backend_pid();`, "postgres", true);
      psql(box, `DROP DATABASE IF EXISTS ${DB}; DROP DATABASE IF EXISTS ${ROLLBACK};`, "postgres", true);
    }
    stop(box);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
