import assert from "node:assert/strict";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const { Client } = pg;
const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "payment_method_single_active_provider";
const ROLLBACK_DB = "payment_method_single_active_provider_rollback";
const CONFLICT_DB = "payment_method_single_active_provider_conflict";
const UP = "202607280059_payment_method_single_active_provider.up.sql";
const DOWN = "202607280059_payment_method_single_active_provider.down.sql";
const ASSERTIONS = "202607280059_payment_method_single_active_provider_assertions.sql";
const FIXTURE = readFileSync(path.join(import.meta.dirname, "fixture.sql"), "utf8");
const prior = JSON.parse(readFileSync(path.join(SQL, "phase3q-quick-order-hosted-payment-bridge-manifest.json"), "utf8"));

const STORE = "10000000-0000-4000-8000-000000000059";
const OTHER_STORE = "10000000-0000-4000-8000-000000000060";
const PRINCIPAL = "20000000-0000-4000-8000-000000000059";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000059";
const OTHER_MEMBERSHIP = "30000000-0000-4000-8000-000000000060";
const PLAN = "00000000-0000-4000-8000-000000000001";
const IYZICO_METHOD = "50000000-0000-4000-8000-000000000059";
const PAYTR_METHOD = "50000000-0000-4000-8000-000000000060";
const OTHER_METHOD = "50000000-0000-4000-8000-000000000063";
const NOW = "2026-07-28T12:05:00.000Z";
const TOTAL = 9;
let completed = 0;

function bin(name) {
  const selected = path.join(PG, name);
  accessSync(selected, constants.X_OK);
  return selected;
}

function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    input,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  }
  return result;
}

function start() {
  const root = mkdtempSync("/tmp/celebix-payment-single-provider-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 28_000 + Math.floor(Math.random() * 1_000);
  mkdirSync(socket, { mode: 0o700 });
  command(bin("initdb"), ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(bin("pg_ctl"), ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { root, data, socket, port };
}

function stop(box) {
  if (!box) return;
  command(bin("pg_ctl"), ["-D", box.data, "-m", "fast", "stop"], "", true);
  rmSync(box.root, { recursive: true, force: true });
}

function sql(box, input, database = DB, allowFailure = false) {
  return command(bin("psql"), [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], input, allowFailure);
}

function apply(box, file, database = DB, allowFailure = false) {
  const target = path.join(SQL, file);
  return sql(box, existsSync(target) ? readFileSync(target, "utf8") : "", database, allowFailure);
}

function pass(label, callback) {
  callback();
  completed += 1;
  process.stdout.write(`PASS ${completed}/${TOTAL} ${label}\n`);
}

async function passAsync(label, callback) {
  await callback();
  completed += 1;
  process.stdout.write(`PASS ${completed}/${TOTAL} ${label}\n`);
}

function authority(store = STORE) {
  const membership = store === STORE ? MEMBERSHIP : OTHER_MEMBERSHIP;
  return `'${store}'::uuid,'${PRINCIPAL}'::uuid,'${membership}'::uuid,'${PLAN}'::uuid,` +
    `'free_starter',1,'${NOW}'::timestamptz`;
}

function stateCall({
  store = STORE,
  method,
  operation,
  fingerprint,
  expectedVersion,
  state,
}) {
  return `SELECT outcome FROM saas.payment_method_set_state(
    ${authority(store)},'${operation}'::uuid,'${fingerprint}','${method}'::uuid,
    ${expectedVersion},'${state}',NULL
  )`;
}

function appState(box, input, database = DB) {
  return sql(box, `SET ROLE celebix_saas_app; ${stateCall(input)};`, database).stdout.trim();
}

async function concurrentState(box, input, applicationName) {
  const client = new Client({
    host: box.socket,
    port: box.port,
    user: "postgres",
    database: DB,
    application_name: applicationName,
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE celebix_saas_app");
    const result = await client.query(stateCall(input));
    await client.query("COMMIT");
    return result.rows[0]?.outcome;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

function publicFunctionProjection(box, database) {
  return sql(box, `SELECT pg_catalog.jsonb_build_object(
    'body',pg_catalog.md5(procedure.prosrc),
    'owner',procedure.proowner::regrole::text,
    'securityDefiner',procedure.prosecdef,
    'config',procedure.proconfig,
    'appExecute',pg_catalog.has_function_privilege(
      'celebix_saas_app',procedure.oid,'EXECUTE'
    )
  )::text
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid='saas.payment_method_set_state(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)'::regprocedure;`, database).stdout.trim();
}

async function main() {
  let box;
  try {
    box = start();
    sql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const { file } of prior.migrationChain) apply(box, file);
    sql(box, FIXTURE);
    sql(box, `CREATE DATABASE ${ROLLBACK_DB} TEMPLATE ${DB};`, "postgres");
    sql(box, `CREATE DATABASE ${CONFLICT_DB} TEMPLATE ${DB};`, "postgres");
    const beforeRollback = publicFunctionProjection(box, ROLLBACK_DB);

    apply(box, UP);
    apply(box, ASSERTIONS);

    pass("059 installs an exact store-scoped provider-only unique boundary and private delegate", () => {
      assert.equal(sql(box, `SELECT pg_catalog.count(*) FROM pg_catalog.pg_index AS index
        JOIN pg_catalog.pg_class AS relation ON relation.oid=index.indexrelid
        JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
        WHERE namespace.nspname='saas'
          AND relation.relname='payment_methods_one_active_provider_per_store_idx'
          AND index.indisunique
          AND pg_catalog.pg_get_expr(index.indpred,index.indrelid)=
            '((kind = ''provider''::text) AND (state = ''active''::text))'
          AND pg_catalog.pg_get_indexdef(index.indexrelid) LIKE '%(store_id)%';`).stdout.trim(), "1");
      assert.equal(sql(box, `SELECT pg_catalog.has_function_privilege(
        'celebix_saas_app',
        'saas.payment_method_set_state_without_single_active_provider(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)'::regprocedure,
        'EXECUTE'
      );`).stdout.trim(), "f");
    });

    pass("preflight rejects transactional set-state body drift", () => {
      const hashes = sql(box, `SELECT procedure.proname||'='||pg_catalog.md5(procedure.prosrc)
        FROM pg_catalog.pg_proc AS procedure
        WHERE procedure.oid IN(
          'saas.payment_method_set_state(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)'::regprocedure,
          'saas.payment_method_set_state_without_single_active_provider(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)'::regprocedure
        ) ORDER BY procedure.proname;`).stdout.trim();
      const drift = sql(box, `BEGIN;
        SET LOCAL ROLE celebix_saas_owner;
        CREATE OR REPLACE FUNCTION saas.payment_method_set_state(
          p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
          p_plan_code text,p_plan_version bigint,p_now timestamptz,
          p_operation_id uuid,p_fingerprint text,p_method_id uuid,p_expected_version bigint,
          p_state text,p_emergency_reason text
        ) RETURNS TABLE(outcome text,result_payload jsonb)
        LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
        AS $drift$ BEGIN RETURN QUERY SELECT 'state_changed',NULL::jsonb; END $drift$;
        DO $check$ BEGIN
          IF saas.payment_method_single_active_provider_preflight() IS DISTINCT FROM false
          THEN RAISE EXCEPTION 'PREFLIGHT_ACCEPTED_SET_STATE_BODY_DRIFT'; END IF;
        END $check$;
        ROLLBACK;`, DB, true);
      assert.equal(drift.status, 0, `${drift.stderr}\n${hashes}`);
      assert.equal(sql(box, `SET ROLE celebix_saas_app;
        SELECT saas.payment_method_single_active_provider_preflight();`).stdout.trim(), "t");
    });

    pass("cash on delivery and bank transfer remain active beside a provider", () => {
      assert.equal(appState(box, {
        method: IYZICO_METHOD,
        operation: "70000000-0000-4000-8000-000000000059",
        fingerprint: "a".repeat(64),
        expectedVersion: 1,
        state: "active",
      }), "state_changed");
      assert.equal(sql(box, `SELECT pg_catalog.count(*) FROM saas.payment_methods
        WHERE store_id='${STORE}' AND state='active' AND kind<>'provider';`).stdout.trim(), "2");
      assert.equal(sql(box, `SELECT pg_catalog.count(*) FROM saas.payment_methods
        WHERE store_id='${STORE}' AND state='active' AND kind='provider';`).stdout.trim(), "1");
    });

    pass("a second provider returns a clean conflict and does not switch providers", () => {
      assert.equal(appState(box, {
        method: PAYTR_METHOD,
        operation: "70000000-0000-4000-8000-000000000060",
        fingerprint: "b".repeat(64),
        expectedVersion: 1,
        state: "active",
      }), "provider_already_active");
      assert.equal(sql(box, `SELECT state||'|'||version FROM saas.payment_methods
        WHERE id='${PAYTR_METHOD}';`).stdout.trim(), "disabled|1");
      assert.equal(sql(box, `SELECT pg_catalog.count(*) FROM saas.payment_method_operations
        WHERE operation_id='70000000-0000-4000-8000-000000000060';`).stdout.trim(), "0");
    });

    pass("successful activation replay remains idempotent", () => {
      assert.equal(appState(box, {
        method: IYZICO_METHOD,
        operation: "70000000-0000-4000-8000-000000000059",
        fingerprint: "a".repeat(64),
        expectedVersion: 1,
        state: "active",
      }), "operation_replayed");
      assert.equal(appState(box, {
        method: IYZICO_METHOD,
        operation: "70000000-0000-4000-8000-000000000059",
        fingerprint: "f".repeat(64),
        expectedVersion: 1,
        state: "active",
      }), "operation_mismatch");
    });

    pass("switching requires an explicit disable before the rejected activation can succeed", () => {
      assert.equal(appState(box, {
        method: IYZICO_METHOD,
        operation: "70000000-0000-4000-8000-000000000061",
        fingerprint: "c".repeat(64),
        expectedVersion: 2,
        state: "disabled",
      }), "state_changed");
      assert.equal(appState(box, {
        method: PAYTR_METHOD,
        operation: "70000000-0000-4000-8000-000000000060",
        fingerprint: "b".repeat(64),
        expectedVersion: 1,
        state: "active",
      }), "state_changed");
      assert.equal(appState(box, {
        method: PAYTR_METHOD,
        operation: "70000000-0000-4000-8000-000000000060",
        fingerprint: "b".repeat(64),
        expectedVersion: 1,
        state: "active",
      }), "operation_replayed");
      assert.equal(sql(box, `SELECT pg_catalog.count(*) FROM saas.payment_methods
        WHERE store_id='${STORE}' AND kind='provider' AND state='disabled';`).stdout.trim(), "1");
    });

    pass("the unique index rejects direct SQL bypass while stores remain isolated", () => {
      const bypass = sql(box, `SET ROLE celebix_saas_owner;
        UPDATE saas.payment_methods SET state='active',version=version+1
        WHERE id='${IYZICO_METHOD}';`, DB, true);
      assert.notEqual(bypass.status, 0);
      assert.match(bypass.stderr, /payment_methods_one_active_provider_per_store_idx/);
      assert.equal(appState(box, {
        store: OTHER_STORE,
        method: OTHER_METHOD,
        operation: "70000000-0000-4000-8000-000000000063",
        fingerprint: "d".repeat(64),
        expectedVersion: 1,
        state: "active",
      }), "state_changed");
      assert.equal(sql(box, `SELECT store_id||'|'||pg_catalog.count(*) FROM saas.payment_methods
        WHERE kind='provider' AND state='active' GROUP BY store_id ORDER BY store_id;`).stdout.trim(),
        `${STORE}|1\n${OTHER_STORE}|1`);
    });

    await passAsync("concurrent activations allow exactly one winner and return one clean conflict", async () => {
      sql(box, `SET ROLE celebix_saas_owner;
        UPDATE saas.payment_methods SET state='disabled',version=1,updated_at='${NOW}'
        WHERE store_id='${STORE}' AND kind='provider';
        DELETE FROM saas.payment_method_operations
        WHERE operation_id IN(
          '70000000-0000-4000-8000-000000000064',
          '70000000-0000-4000-8000-000000000065'
        );`);
      const outcomes = await Promise.all([
        concurrentState(box, {
          method: IYZICO_METHOD,
          operation: "70000000-0000-4000-8000-000000000064",
          fingerprint: "e".repeat(64),
          expectedVersion: 1,
          state: "active",
        }, "single-provider-race-iyzico"),
        concurrentState(box, {
          method: PAYTR_METHOD,
          operation: "70000000-0000-4000-8000-000000000065",
          fingerprint: "f".repeat(64),
          expectedVersion: 1,
          state: "active",
        }, "single-provider-race-paytr"),
      ]);
      assert.deepEqual(outcomes.sort(), ["provider_already_active", "state_changed"]);
      assert.equal(sql(box, `SELECT pg_catalog.count(*) FROM saas.payment_methods
        WHERE store_id='${STORE}' AND kind='provider' AND state='active';`).stdout.trim(), "1");
    });

    pass("migration rejects legacy duplicate active providers and rollback restores the exact delegate", () => {
      sql(box, `SET ROLE celebix_saas_owner;
        UPDATE saas.payment_methods SET state='active'
        WHERE store_id='${STORE}' AND kind='provider';`, CONFLICT_DB);
      const rejected = apply(box, UP, CONFLICT_DB, true);
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /PAYMENT_METHOD_MULTIPLE_ACTIVE_PROVIDERS_EXIST/);

      apply(box, UP, ROLLBACK_DB);
      apply(box, ASSERTIONS, ROLLBACK_DB);
      apply(box, DOWN, ROLLBACK_DB);
      assert.equal(publicFunctionProjection(box, ROLLBACK_DB), beforeRollback);
      assert.equal(sql(box, `SELECT pg_catalog.to_regclass(
        'saas.payment_methods_one_active_provider_per_store_idx'
      ) IS NULL;`, ROLLBACK_DB).stdout.trim(), "t");
      assert.equal(sql(box, `SELECT pg_catalog.to_regprocedure(
        'saas.payment_method_set_state_without_single_active_provider(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text)'
      ) IS NULL;`, ROLLBACK_DB).stdout.trim(), "t");
    });

    assert.equal(completed, TOTAL);
    process.stdout.write("payment method single-active-provider PostgreSQL harness passed\n");
  } finally {
    stop(box);
  }
}

await main();
