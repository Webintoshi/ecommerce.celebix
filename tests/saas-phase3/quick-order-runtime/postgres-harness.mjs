import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SQL = path.join(ROOT, "apps", "owner", "scripts", "sql", "saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const TOKEN = randomBytes(6).toString("hex");
const DATABASE = `quick_order_runtime_${TOKEN}`;
const HISTORICAL_DATABASE = `${DATABASE}_historical`;
const ROLLBACK_DATABASE = `${DATABASE}_rollback`;
const PARTIAL_DATABASE = `${DATABASE}_partial`;
const TOTAL = 18;
const completed = [];
const CATALOG_INVENTORY_SHA256 = "c0aeb1cc411fe6f9bac5d3501cf667f7365f4f3d4b7d7d4dd3ab311f52f1f154";

const PLAN = "00000000-0000-4000-8000-000000000001";
const STORE = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000001";
const PRODUCT = "40000000-0000-4000-8000-000000000001";
const VARIANT = "41000000-0000-4000-8000-000000000001";
const VARIANT_2 = "41000000-0000-4000-8000-000000000002";
const PROVIDER = "50000000-0000-4000-8000-000000000001";
const LINK = "60000000-0000-4000-8000-000000000001";
const REDEMPTION = "61000000-0000-4000-8000-000000000001";
const ATTEMPT = "62000000-0000-4000-8000-000000000001";
const RESERVATION = "63000000-0000-4000-8000-000000000001";
const ADDRESS = `'{"recipientName":"Ada Lovelace","phone":"+905551110000","line1":"Test 1","city":"Istanbul","country":"TR"}'::jsonb`;
const ENVELOPE = `'{"algorithm":"A256GCM","ciphertext":"cXVpY2stbGluay10b2tlbi1jaXBoZXJ0ZXh0","iv":"AQEBAQEBAQEBAQEB","keyId":"key-1","tag":"AgICAgICAgICAgICAgICAg","version":1}'::jsonb`;

const priorMigrations = [
  "202607110001_roles.up.sql", "202607110002_foundation.up.sql", "202607110003_free_starter.seed.sql",
  "202607110003_plan_versions.freeze.sql", "202607110004_grants.sql", "202607110005_catalog_assertions.sql",
  "202607110007_identity_roles.up.sql", "202607110008_identity_persistence.up.sql", "202607110009_identity_grants.sql",
  "202607110010_identity_catalog_assertions.sql", "202607120012_verified_identity_snapshot.up.sql",
  "202607120013_verified_identity_grants.sql", "202607120014_verified_identity_catalog_assertions.sql",
  "202607140015_panel_sessions.up.sql", "202607140016_panel_session_handoffs.up.sql",
  "202607140017_panel_browser_bindings.up.sql", "202607160018_product_catalog.up.sql",
  "202607160018_product_catalog_assertions.sql", "202607160019_product_catalog_api.up.sql",
  "202607160019_product_catalog_api_assertions.sql", "202607160020_pilot_storefront_media_domains.up.sql",
  "202607160020_pilot_storefront_media_domains_assertions.sql", "202607200021_catalog_dashboard_summary.up.sql",
  "202607200021_catalog_dashboard_summary_assertions.sql", "202607210022_order_management.up.sql",
  "202607210022_order_management_assertions.sql", "202607210023_order_management_api.up.sql",
  "202607210023_order_management_api_assertions.sql", "202607220024_quick_order_links.up.sql",
  "202607220024_quick_order_links_assertions.sql", "202607220025_quick_order_links_api.up.sql",
  "202607220025_quick_order_links_api_assertions.sql",
];

const runtimeTables = [
  "quick_order_redemption_sessions", "checkout_payment_attempts", "checkout_inventory_reservations",
  "checkout_callback_receipts", "checkout_reconciliation_jobs", "checkout_reconciliation_run",
  "checkout_reconciliation_receipts", "checkout_operations",
];

const catalogInventoryTables = [
  ...runtimeTables,
  "checkout_provider_configs",
  "orders",
  "quick_order_links",
].sort();

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* continue */ }
  }
  return null;
}

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT, encoding: "utf8", input: options.input,
    env: { PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}

function startPostgres(options = {}) {
  assertSafeEnvironment();
  const executables = Object.fromEntries(REQUIRED_NATIVE_TOOLS.map((name) => [name, executable(name)]));
  if (Object.values(executables).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const allocationToken = options.token ?? TOKEN;
  const backend = {
    executables,
    temporaryDirectory: null,
    socketDirectory: null,
    dataDirectory: null,
    port: 20_000 + Math.floor(Math.random() * 15_000),
    startAttempted: false,
    started: false,
  };
  try {
    backend.temporaryDirectory = mkdtempSync(path.join(tmpdir(), "celebix-quick-order-runtime-"));
    options.onAllocation?.("temporary-directory", backend.temporaryDirectory);
    if (options.failAfter === "temporary-directory") throw new Error("INJECTED_TEMPORARY_DIRECTORY_FAILURE");
    backend.dataDirectory = path.join(backend.temporaryDirectory, "data");
    backend.socketDirectory = path.join("/tmp", `c3b2r-${allocationToken}`);
    mkdirSync(backend.socketDirectory, { mode: 0o700 });
    options.onAllocation?.("socket-directory", backend.socketDirectory);
    if (options.failAfter === "socket-directory") throw new Error("INJECTED_SOCKET_DIRECTORY_FAILURE");
    command(executables.initdb, ["-D", backend.dataDirectory, "--auth=trust", "--username=postgres", "--no-locale"]);
    if (options.failAfter === "initdb") throw new Error("INJECTED_INITDB_FAILURE");
    backend.startAttempted = true;
    command(executables.pg_ctl, ["-D", backend.dataDirectory, "-o", `-k ${backend.socketDirectory} -p ${backend.port} -h ''`, "-l", path.join(backend.temporaryDirectory, "postgres.log"), "start"]);
    if (options.failAfter === "pg-ctl-started") throw new Error("INJECTED_PG_CTL_STARTED_FAILURE");
    backend.started = true;
    return backend;
  } catch (error) {
    stopPostgres(backend);
    throw error;
  }
}

function stopPostgres(backend) {
  if (!backend) return;
  if (backend.started || backend.startAttempted) command(backend.executables.pg_ctl, ["-D", backend.dataDirectory, "-m", "fast", "stop"], { allowFailure: true });
  if (backend.socketDirectory) rmSync(backend.socketDirectory, { recursive: true, force: true });
  if (backend.temporaryDirectory) rmSync(backend.temporaryDirectory, { recursive: true, force: true });
}

function psqlResult(backend, source, database = DATABASE, options = {}) {
  return command(backend.executables.psql, ["-h", backend.socketDirectory, "-p", String(backend.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input: source, allowFailure: options.allowFailure });
}
function psql(backend, source, database = DATABASE) { return psqlResult(backend, source, database).stdout.trim(); }
function denied(backend, source, database = DATABASE) {
  const result = psqlResult(backend, source, database, { allowFailure: true });
  assert.notEqual(result.status, 0, "statement unexpectedly succeeded");
  return result;
}
function apply(backend, file, database = DATABASE, allowFailure = false) {
  return psqlResult(backend, readFileSync(path.join(SQL, file), "utf8"), database, { allowFailure });
}
function createDatabase(backend, database, template) {
  psql(backend, `CREATE DATABASE ${database}${template ? ` TEMPLATE ${template}` : ""};`, "postgres");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function openPsqlSession(backend, database, applicationName) {
  const child = spawn(backend.executables.psql, ["-h", backend.socketDirectory, "-p", String(backend.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], {
    cwd: ROOT,
    env: { PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C", PGAPPNAME: applicationName },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let closedError = null;
  const waiters = new Map();
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    for (const [marker, waiter] of waiters) {
      const markerOffset = stdout.indexOf(marker, waiter.offset);
      if (markerOffset < 0) continue;
      waiters.delete(marker);
      waiter.resolve(stdout.slice(waiter.offset, markerOffset).trim());
    }
  });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", (error) => {
    closedError = error;
    for (const waiter of waiters.values()) waiter.reject(error);
    waiters.clear();
  });
  child.on("close", (code) => {
    if (code === 0) return;
    closedError = new Error(`interactive psql ${applicationName} failed\n${stderr}`);
    for (const waiter of waiters.values()) waiter.reject(closedError);
    waiters.clear();
  });
  let sequence = 0;
  return {
    applicationName,
    execute(source) {
      if (closedError) return Promise.reject(closedError);
      const marker = `__CELEBIX_${applicationName}_${sequence += 1}_${randomBytes(4).toString("hex")}__`;
      const offset = stdout.length;
      const promise = new Promise((resolve, reject) => { waiters.set(marker, { offset, resolve, reject }); });
      child.stdin.write(`${source}\n\\echo ${marker}\n`);
      return promise;
    },
    async close() {
      if (!child.killed && child.exitCode === null) child.stdin.end("\\q\n");
      await new Promise((resolve) => {
        if (child.exitCode !== null) resolve();
        else child.once("close", resolve);
      });
    },
  };
}

async function waitForBlockedSession(backend, database, applicationName) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const blocked = psql(backend, `SELECT EXISTS (
      SELECT 1 FROM pg_catalog.pg_stat_activity AS activity
      WHERE activity.datname=${sqlLiteral(database)} AND activity.application_name=${sqlLiteral(applicationName)}
        AND pg_catalog.cardinality(pg_catalog.pg_blocking_pids(activity.pid)) > 0
    );`, database);
    if (blocked === "t") return;
    await delay(10);
  }
  throw new Error(`session ${applicationName} never reached an explicit PostgreSQL lock barrier`);
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function catalogInventory(backend, database = DATABASE) {
  const tableLiterals = catalogInventoryTables.map(sqlLiteral).join(",");
  return psql(backend, `WITH inventory AS (
    SELECT 'column'::text AS kind, relation.relname AS table_name,
      pg_catalog.lpad(attribute.attnum::text,4,'0')||':'||attribute.attname AS object_name,
      pg_catalog.jsonb_build_object(
        'ordinal',attribute.attnum,
        'name',attribute.attname,
        'type',pg_catalog.format_type(attribute.atttypid,attribute.atttypmod),
        'notNull',attribute.attnotnull,
        'default',pg_catalog.pg_get_expr(default_value.adbin,default_value.adrelid,true)
      )::text AS definition
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid=relation.oid
      AND attribute.attnum>0 AND NOT attribute.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef AS default_value
      ON default_value.adrelid=relation.oid AND default_value.adnum=attribute.attnum
    WHERE namespace.nspname='saas' AND relation.relname=ANY(ARRAY[${tableLiterals}])
    UNION ALL
    SELECT 'constraint',relation.relname,constraint_row.conname,
      pg_catalog.jsonb_build_object(
        'name',constraint_row.conname,
        'type',constraint_row.contype,
        'definition',pg_catalog.pg_get_constraintdef(constraint_row.oid,true)
      )::text
    FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_class AS relation ON relation.oid=constraint_row.conrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='saas' AND relation.relname=ANY(ARRAY[${tableLiterals}])
    UNION ALL
    SELECT 'index',table_relation.relname,index_relation.relname,
      pg_catalog.jsonb_build_object(
        'name',index_relation.relname,
        'definition',pg_catalog.pg_get_indexdef(index_relation.oid,0,true)
      )::text
    FROM pg_catalog.pg_index AS index_row
    JOIN pg_catalog.pg_class AS table_relation ON table_relation.oid=index_row.indrelid
    JOIN pg_catalog.pg_class AS index_relation ON index_relation.oid=index_row.indexrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=table_relation.relnamespace
    WHERE namespace.nspname='saas' AND table_relation.relname=ANY(ARRAY[${tableLiterals}])
    UNION ALL
    SELECT 'trigger',relation.relname,trigger_row.tgname,
      pg_catalog.jsonb_build_object(
        'name',trigger_row.tgname,
        'definition',pg_catalog.pg_get_triggerdef(trigger_row.oid,true),
        'constraintOid',trigger_row.tgconstraint,
        'deferrable',trigger_row.tgdeferrable,
        'initiallyDeferred',trigger_row.tginitdeferred
      )::text
    FROM pg_catalog.pg_trigger AS trigger_row
    JOIN pg_catalog.pg_class AS relation ON relation.oid=trigger_row.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
    WHERE namespace.nspname='saas' AND relation.relname=ANY(ARRAY[${tableLiterals}])
      AND NOT trigger_row.tgisinternal
  )
  SELECT pg_catalog.string_agg(kind||E'\\t'||table_name||E'\\t'||object_name||E'\\t'||definition,E'\\n' ORDER BY kind,table_name,object_name)
  FROM inventory;`, database);
}

function cloneDatabase(backend, suffix) {
  const database = `${DATABASE}_${suffix}`;
  createDatabase(backend, database, DATABASE);
  return database;
}

async function scenario(name, run) {
  try { await run(); } catch (error) { process.stderr.write(`FAIL ${completed.length + 1}/${TOTAL} ${name}\n`); throw error; }
  completed.push(name); process.stdout.write(`PASS ${completed.length}/${TOTAL} ${name}\n`);
}

function seedBase(backend) {
  psql(backend, `SET ROLE celebix_saas_owner;
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
      ('${PRINCIPAL}','https://identity.example.test/oidc','runtime-owner','owner@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE}','Runtime Store','runtime-store','active','tr','TRY','default','2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
      ('${MEMBERSHIP}','${PRINCIPAL}','${STORE}','store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES
      ('31000000-0000-4000-8000-000000000001','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01');
    INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES
      ('${PRODUCT}','${STORE}','runtime-product','Runtime Product','active','TRY',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES
      ('${VARIANT}','${PRODUCT}','${STORE}','Tracked',10000,true,5,'active','{}',1,'2026-01-01','2026-01-01'),
      ('${VARIANT_2}','${PRODUCT}','${STORE}','Untracked',11000,false,0,'active','{}',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.checkout_provider_configs(id,store_id,provider_key,status,public_origin,configuration_key_id,sealed_configuration,version,created_at,updated_at) VALUES
      ('${PROVIDER}','${STORE}','paytr','active','https://www.paytr.com','key-1',${ENVELOPE},1,'2026-01-01','2026-01-01');
    INSERT INTO saas.quick_order_links(id,store_id,creating_membership_id,provider_config_id,status,token_digest,token_key_id,sealed_token,customer_name,customer_email,customer_phone,shipping_address,billing_address,internal_label,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,expires_at,version,created_at,updated_at)
      VALUES ('${LINK}','${STORE}','${MEMBERSHIP}','${PROVIDER}','active',repeat('a',64),'key-1',${ENVELOPE},'Ada Lovelace','ada@example.test','+905551110000',${ADDRESS},${ADDRESS},'runtime','TRY',10000,0,0,10000,'2026-07-22 10:00:00+00',1,'2026-07-21 10:00:00+00','2026-07-21 10:00:00+00');
    INSERT INTO saas.quick_order_link_items(id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,variant_name,unit_price_cents,quantity,line_total_cents,created_at)
      VALUES ('80000000-0000-4000-8000-000000000001','${STORE}','${LINK}','${PRODUCT}','${VARIANT}',0,'Runtime Product','Tracked',10000,1,10000,'2026-07-21');
  `);
}

function seedRuntime(backend) {
  psql(backend, `SET ROLE celebix_saas_owner;
    UPDATE saas.checkout_provider_configs SET configuration_digest=repeat('d',64),version=2,updated_at='2026-07-21' WHERE id='${PROVIDER}';
    INSERT INTO saas.quick_order_redemption_sessions(id,store_id,quick_order_link_id,cookie_digest,expires_at,version,created_at,updated_at)
      VALUES ('${REDEMPTION}','${STORE}','${LINK}',repeat('e',64),'2026-07-21 13:00:00+00',1,'2026-07-21 12:00:00+00','2026-07-21 12:00:00+00');
    INSERT INTO saas.checkout_payment_attempts(id,store_id,quick_order_link_id,redemption_session_id,provider_config_id,provider_config_version,configuration_digest,configuration_key_id,sealed_configuration,merchant_oid,expected_subtotal_cents,expected_shipping_cents,expected_discount_cents,expected_payment_amount,currency,status,hold_expires_at,version,created_at,updated_at)
      VALUES ('${ATTEMPT}','${STORE}','${LINK}','${REDEMPTION}','${PROVIDER}',2,repeat('d',64),'key-1',${ENVELOPE},'0123456789abcdef0123456789abcdef',10000,0,0,10000,'TRY','reserved','2026-07-21 12:05:00+00',1,'2026-07-21 12:00:00+00','2026-07-21 12:00:00+00');
    INSERT INTO saas.checkout_inventory_reservations(id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at)
      VALUES ('${RESERVATION}','${STORE}','${ATTEMPT}','${LINK}','${PRODUCT}','${VARIANT}',2,true,'held','2026-07-21 12:00:00+00',1,'2026-07-21 12:00:00+00');
    INSERT INTO saas.checkout_reconciliation_jobs(attempt_id,store_id,status,attempt_number,next_attempt_at,created_at,updated_at)
      VALUES ('${ATTEMPT}','${STORE}','pending',0,'2026-07-21 12:00:00+00','2026-07-21 12:00:00+00','2026-07-21 12:00:00+00');
  `);
}

function cancelSql(operationId, now = "2026-07-21 12:03:00+00", expectedVersion = 1) {
  return `SET ROLE celebix_saas_app; SELECT outcome FROM saas.quick_links_cancel(
    '${STORE}','${PRINCIPAL}','${MEMBERSHIP}','${PLAN}','free_starter',1,
    '${now}','${LINK}',${expectedVersion},'${operationId}',repeat('6',64)
  );`;
}

function makeAttemptProviderReady(backend, database) {
  psql(backend, `SET ROLE celebix_saas_owner;
    UPDATE saas.checkout_payment_attempts SET
      status='provider_ready',provider_ready_at='2026-07-21 12:01:00+00',
      provider_token_digest=repeat('1',64),provider_token_key_id='key-1',sealed_provider_token=${ENVELOPE},
      version=2,updated_at='2026-07-21 12:01:00+00'
    WHERE id='${ATTEMPT}';`, database);
}

function makeAttemptInitiationUnknown(backend, database) {
  psql(backend, `SET ROLE celebix_saas_owner;
    UPDATE saas.checkout_payment_attempts SET
      status='initiation_unknown',initiation_unknown_at='2026-07-21 12:01:00+00',
      version=2,updated_at='2026-07-21 12:01:00+00'
    WHERE id='${ATTEMPT}';`, database);
}

async function raceLiveAttemptAgainstCancel(backend, database, label, operationId, expectedStatus) {
  const locker = openPsqlSession(backend, database, `${label}_attempt`);
  const cancel = openPsqlSession(backend, database, `${label}_cancel`);
  try {
    await locker.execute(`BEGIN; SET ROLE celebix_saas_owner;
      SELECT id FROM saas.checkout_payment_attempts WHERE id='${ATTEMPT}' FOR UPDATE;`);
    const cancelResult = cancel.execute(`BEGIN; ${cancelSql(operationId)} COMMIT;`);
    await waitForBlockedSession(backend, database, cancel.applicationName);
    await locker.execute("COMMIT;");
    assert.equal((await cancelResult).split("\n").at(-1), "invalid_transition");
    assert.equal(psql(backend, `SELECT link.status||'|'||attempt.status||'|'||reservation.status||'|'||
      (SELECT count(*) FROM saas.orders WHERE quick_order_link_id='${LINK}')
      FROM saas.quick_order_links AS link
      JOIN saas.checkout_payment_attempts AS attempt ON attempt.quick_order_link_id=link.id
      JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id
      WHERE link.id='${LINK}' AND attempt.id='${ATTEMPT}' AND reservation.id='${RESERVATION}';`, database),
      `active|${expectedStatus}|held|0`);
  } finally {
    await Promise.all([locker.close(), cancel.close()]);
  }
}

const SUCCESS_ORDER = "70000000-0000-4000-8000-000000000010";

function settlementSql(orderId = SUCCESS_ORDER) {
  return `
    SELECT id FROM saas.quick_order_links WHERE id='${LINK}' FOR UPDATE;
    SELECT id FROM saas.product_variants WHERE store_id='${STORE}' AND product_id='${PRODUCT}' ORDER BY id FOR UPDATE;
    SELECT id FROM saas.checkout_inventory_reservations WHERE attempt_id='${ATTEMPT}' ORDER BY variant_id FOR UPDATE;
    INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,billing_address,quick_order_link_id,version,created_at,updated_at)
      VALUES ('${orderId}','${STORE}','RACE-SUCCESS','quick_link','Ada','ada@example.test','TRY',10000,0,0,10000,'confirmed','completed','{}','{}','${LINK}',1,'2026-07-21 12:02:00+00','2026-07-21 12:02:00+00');
    UPDATE saas.product_variants SET stock_quantity=stock_quantity-2,version=version+1,updated_at='2026-07-21 12:02:00+00'
      WHERE id='${VARIANT}' AND stock_tracking;
    UPDATE saas.checkout_inventory_reservations SET status='consumed',consumed_at='2026-07-21 12:02:00+00',version=version+1,updated_at='2026-07-21 12:02:00+00'
      WHERE attempt_id='${ATTEMPT}';
    UPDATE saas.checkout_payment_attempts SET status='succeeded',succeeded_at='2026-07-21 12:02:00+00',settled_order_id='${orderId}',version=version+1,updated_at='2026-07-21 12:02:00+00'
      WHERE id='${ATTEMPT}';
    UPDATE saas.quick_order_links SET status='paid',opened_at='2026-07-21 12:01:00+00',paid_at='2026-07-21 12:02:00+00',order_id='${orderId}',version=version+1,updated_at='2026-07-21 12:02:00+00'
      WHERE id='${LINK}';`;
}

function normalizedFunction(source, name) {
  const start = source.indexOf(`FUNCTION saas.${name}(`);
  const body = source.indexOf("AS $function$", start);
  const end = source.indexOf("$function$;", body) + "$function$;".length;
  assert.ok(start >= 0 && body >= 0 && end > body, `missing function ${name}`);
  return source.slice(start, end).replace(/\s+/g, " ").trim();
}

async function main() {
  let backend;
  try {
    backend = startPostgres();
    createDatabase(backend, DATABASE);
    for (const migration of priorMigrations) apply(backend, migration);
    seedBase(backend);
    createDatabase(backend, HISTORICAL_DATABASE, DATABASE);
    createDatabase(backend, ROLLBACK_DATABASE, DATABASE);
    createDatabase(backend, PARTIAL_DATABASE, DATABASE);

    await scenario("migration 026 artifacts apply on PostgreSQL 16 and assertions pass", async () => {
      apply(backend, "202607220026_quick_order_checkout_runtime.up.sql");
      apply(backend, "202607220026_quick_order_checkout_runtime_assertions.sql");
      assert.match(psql(backend, "SHOW server_version;"), /^16\./);
      assert.equal(psql(backend, `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relname=ANY(ARRAY[${runtimeTables.map((name) => `'${name}'`).join(",")}]);`), "8");
    });

    await scenario("historical unbound quick-link orders reject before any mutation", async () => {
      psql(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at) VALUES ('70000000-0000-4000-8000-000000000099','${STORE}','HIST-1','quick_link','Ada','ada@example.test','TRY',1,0,0,1,'pending','pending','{}',1,'2026-07-21','2026-07-21');`, HISTORICAL_DATABASE);
      const result = apply(backend, "202607220026_quick_order_checkout_runtime.up.sql", HISTORICAL_DATABASE, true);
      assert.notEqual(result.status, 0); assert.match(result.stderr, /HISTORICAL_QUICK_LINK_ORDER_UNBOUND/);
      assert.equal(psql(backend, "SELECT to_regclass('saas.checkout_payment_attempts') IS NULL;", HISTORICAL_DATABASE), "t");
    });

    await scenario("exact columns constraints indexes and manifest bytes are pinned", async () => {
      const manifest = JSON.parse(readFileSync(path.join(SQL, "phase3b2-quick-order-runtime-manifest.json"), "utf8"));
      assert.equal(manifest.artifacts.length, 3);
      for (const artifact of manifest.artifacts) assert.equal(createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex"), artifact.sha256);
      const inventory = catalogInventory(backend);
      const inventoryDigest = createHash("sha256").update(inventory).digest("hex");
      assert.equal(
        inventoryDigest,
        CATALOG_INVENTORY_SHA256,
        `exact PostgreSQL 16 catalog inventory drifted (${inventory.split("\n").length} rows, actual sha256 ${inventoryDigest})\n${inventory}`,
      );
      for (const table of catalogInventoryTables) assert.match(inventory, new RegExp(`(?:^|\\n)column\\t${table}\\t`));
      for (const criticalContract of [
        "checkout_payment_attempts_amount_check",
        "checkout_reconciliation_jobs_lease_check",
        "checkout_callback_receipts_received_at_check",
        "checkout_callback_receipts_currency_check",
        "checkout_reconciliation_receipts_currency_check",
        "checkout_provider_configs_store_provider_active_key",
        "orders_store_quick_order_link_key",
        "quick_order_links_live_attempt_commit",
      ]) assert.match(inventory, new RegExp(`\\t${criticalContract}\\t`));
    });

    await scenario("all runtime tables are owner-owned forced-RLS deny-by-default", async () => {
      assert.equal(psql(backend, `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='saas' AND c.relname=ANY(ARRAY[${runtimeTables.map((name) => `'${name}'`).join(",")}]) AND r.rolname='celebix_saas_owner' AND c.relrowsecurity AND c.relforcerowsecurity;`), "8");
      assert.equal(psql(backend, `SELECT count(*) FROM pg_policy WHERE polrelid=ANY(ARRAY[${runtimeTables.map((name) => `'saas.${name}'::regclass`).join(",")}]);`), "0");
    });

    await scenario("PUBLIC app host and workflow retain zero direct table DML", async () => {
      for (const table of runtimeTables) for (const role of ["celebix_saas_app", "celebix_saas_workflow", "celebix_saas_host_resolver"]) {
        assert.equal(psql(backend, `SELECT has_table_privilege('${role}','saas.${table}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');`), "f");
        denied(backend, `SET ROLE ${role}; SELECT * FROM saas.${table} LIMIT 1;`);
        denied(backend, `SET ROLE ${role}; INSERT INTO saas.${table} DEFAULT VALUES;`);
      }
    });

    await scenario("every runtime relationship carries composite store authority", async () => {
      const definitions = psql(backend, "SELECT string_agg(pg_get_constraintdef(oid),E'\\n') FROM pg_constraint WHERE connamespace='saas'::regnamespace AND conrelid=ANY(ARRAY['saas.quick_order_redemption_sessions'::regclass,'saas.checkout_payment_attempts'::regclass,'saas.checkout_inventory_reservations'::regclass,'saas.checkout_callback_receipts'::regclass,'saas.checkout_reconciliation_jobs'::regclass,'saas.checkout_reconciliation_receipts'::regclass,'saas.checkout_operations'::regclass]) AND contype='f';");
      assert.match(definitions, /FOREIGN KEY \(store_id, quick_order_link_id\)/); assert.match(definitions, /FOREIGN KEY \(store_id, attempt_id\)/); assert.doesNotMatch(definitions, /FOREIGN KEY \(attempt_id\)/);
      denied(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.quick_order_redemption_sessions(id,store_id,quick_order_link_id,cookie_digest,expires_at,version,created_at,updated_at) VALUES ('61000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000099','${LINK}',repeat('9',64),'2026-07-21 13:00:00+00',1,'2026-07-21 12:00:00+00','2026-07-21 12:00:00+00');`);
      assert.match(definitions, /FOREIGN KEY \(store_id, redemption_session_id, quick_order_link_id\)/);
      assert.match(definitions, /FOREIGN KEY \(store_id, attempt_id, quick_order_link_id\)/);
      assert.match(definitions, /FOREIGN KEY \(store_id, settled_order_id, quick_order_link_id\)/);
    });

    await scenario("canonical UUID digest envelope TRY timestamp and JS-safe version checks fail closed", async () => {
      const invalidRedemptions = [
        `('00000000-0000-0000-0000-000000000000','${STORE}','${LINK}',repeat('a',64),'2026-07-21 13:00:00+00',1,'2026-07-21 12:00:00+00','2026-07-21 12:00:00+00')`,
        `('61000000-0000-4000-8000-000000000091','${STORE}','${LINK}',repeat('A',64),'2026-07-21 13:00:00+00',1,'2026-07-21 12:00:00+00','2026-07-21 12:00:00+00')`,
        `('61000000-0000-4000-8000-000000000092','${STORE}','${LINK}',repeat('a',64),'infinity',1,'2026-07-21 12:00:00+00','2026-07-21 12:00:00+00')`,
        `('61000000-0000-4000-8000-000000000093','${STORE}','${LINK}',repeat('a',64),'2026-07-21 13:00:00+00',9007199254740992,'2026-07-21 12:00:00+00','2026-07-21 12:00:00+00')`,
      ];
      for (const values of invalidRedemptions) denied(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.quick_order_redemption_sessions(id,store_id,quick_order_link_id,cookie_digest,expires_at,version,created_at,updated_at) VALUES ${values};`);
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.checkout_provider_configs SET sealed_configuration='{}',version=2,updated_at='2026-07-21' WHERE id='${PROVIDER}';`);
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.quick_order_links SET currency='USD',version=2,updated_at='2026-07-21' WHERE id='${LINK}';`);
      assert.equal(psql(backend, "SELECT pg_get_constraintdef(oid) LIKE '%currency = ''TRY''%' FROM pg_constraint WHERE conname='checkout_payment_attempts_currency_check';"), "t");
    });

    await scenario("provider configuration digest and partial revoked replacement stay terminal", async () => {
      psql(backend, `BEGIN; SET ROLE celebix_saas_owner; UPDATE saas.checkout_provider_configs SET status='revoked',version=2,updated_at='2026-07-21' WHERE id='${PROVIDER}'; INSERT INTO saas.checkout_provider_configs(id,store_id,provider_key,status,public_origin,configuration_key_id,sealed_configuration,configuration_digest,version,created_at,updated_at) VALUES ('50000000-0000-4000-8000-000000000002','${STORE}','paytr','active','https://www.paytr.com','key-1',${ENVELOPE},repeat('d',64),1,'2026-07-21','2026-07-21'); ROLLBACK;`);
      denied(backend, `BEGIN; SET ROLE celebix_saas_owner; UPDATE saas.checkout_provider_configs SET status='revoked',version=2,updated_at='2026-07-21' WHERE id='${PROVIDER}'; UPDATE saas.checkout_provider_configs SET status='active' WHERE id='${PROVIDER}';`);
    });

    seedRuntime(backend);

    await scenario("redemption sessions retain only digests and cannot be reopened", async () => {
      assert.equal(psql(backend, `SELECT cookie_digest=repeat('e',64) AND consumed_at IS NULL AND revoked_at IS NULL FROM saas.quick_order_redemption_sessions WHERE id='${REDEMPTION}';`), "t");
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.quick_order_redemption_sessions SET cookie_digest=repeat('f',64),version=2,updated_at='2026-07-21 12:01:00+00' WHERE id='${REDEMPTION}';`);
      denied(backend, `BEGIN; SET ROLE celebix_saas_owner; UPDATE saas.quick_order_redemption_sessions SET consumed_at='2026-07-21 12:01:00+00',version=2,updated_at='2026-07-21 12:01:00+00' WHERE id='${REDEMPTION}'; UPDATE saas.quick_order_redemption_sessions SET consumed_at=NULL,version=3,updated_at='2026-07-21 12:02:00+00' WHERE id='${REDEMPTION}';`);
      denied(backend, `BEGIN; SET ROLE celebix_saas_owner; UPDATE saas.quick_order_redemption_sessions SET revoked_at='2026-07-21 12:01:00+00',version=2,updated_at='2026-07-21 12:01:00+00' WHERE id='${REDEMPTION}'; UPDATE saas.quick_order_redemption_sessions SET revoked_at=NULL,version=3,updated_at='2026-07-21 12:02:00+00' WHERE id='${REDEMPTION}';`);
      assert.equal(psql(backend, `SELECT consumed_at IS NULL AND revoked_at IS NULL AND version=1 FROM saas.quick_order_redemption_sessions WHERE id='${REDEMPTION}';`), "t");
    });

    await scenario("merchant_oid is canonical globally unique and collision leaves no mutation", async () => {
      denied(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.checkout_payment_attempts SELECT '62000000-0000-4000-8000-000000000002',store_id,quick_order_link_id,redemption_session_id,provider_config_id,provider_config_version,configuration_digest,configuration_key_id,sealed_configuration,merchant_oid,expected_subtotal_cents,expected_shipping_cents,expected_discount_cents,expected_payment_amount,currency,status,provider_token_digest,provider_token_key_id,sealed_provider_token,hold_expires_at,provider_ready_at,initiation_unknown_at,succeeded_at,failed_at,expired_at,settled_order_id,version,created_at,updated_at FROM saas.checkout_payment_attempts WHERE id='${ATTEMPT}';`);
      assert.equal(psql(backend, "SELECT count(*) FROM saas.checkout_payment_attempts;"), "1");
    });

    await scenario("attempt snapshots and terminal transitions are immutable", async () => {
      denied(backend, `BEGIN; SET ROLE celebix_saas_owner;
        INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,billing_address,quick_order_link_id,version,created_at,updated_at)
          VALUES ('70000000-0000-4000-8000-000000000098','${STORE}','NULL-TOKEN','quick_link','Ada','ada@example.test','TRY',10000,0,0,10000,'confirmed','completed','{}','{}','${LINK}',1,'2026-07-21 12:02:00+00','2026-07-21 12:02:00+00');
        INSERT INTO saas.checkout_payment_attempts(id,store_id,quick_order_link_id,redemption_session_id,provider_config_id,provider_config_version,configuration_digest,configuration_key_id,sealed_configuration,merchant_oid,expected_subtotal_cents,expected_shipping_cents,expected_discount_cents,expected_payment_amount,currency,status,provider_token_digest,provider_token_key_id,sealed_provider_token,hold_expires_at,provider_ready_at,succeeded_at,settled_order_id,version,created_at,updated_at)
          VALUES ('62000000-0000-4000-8000-000000000098','${STORE}','${LINK}','${REDEMPTION}','${PROVIDER}',2,repeat('d',64),'key-1',${ENVELOPE},'1123456789abcdef0123456789abcdef',10000,0,0,10000,'TRY','succeeded',NULL,NULL,NULL,'2026-07-21 12:05:00+00','2026-07-21 12:01:00+00','2026-07-21 12:02:00+00','70000000-0000-4000-8000-000000000098',1,'2026-07-21 12:00:00+00','2026-07-21 12:02:00+00');
        ROLLBACK;`);
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.checkout_payment_attempts SET expected_subtotal_cents=9999,version=2,updated_at='2026-07-21 12:01:00+00' WHERE id='${ATTEMPT}';`);
      psql(backend, `BEGIN; SET ROLE celebix_saas_owner; UPDATE saas.checkout_payment_attempts SET status='expired',expired_at='2026-07-21 12:06:00+00',version=2,updated_at='2026-07-21 12:06:00+00' WHERE id='${ATTEMPT}'; ROLLBACK;`);
      denied(backend, `BEGIN; SET ROLE celebix_saas_owner; UPDATE saas.checkout_payment_attempts SET status='expired',expired_at='2026-07-21 12:06:00+00',version=2,updated_at='2026-07-21 12:06:00+00' WHERE id='${ATTEMPT}'; UPDATE saas.checkout_payment_attempts SET status='reserved',version=3,updated_at='2026-07-21 12:07:00+00' WHERE id='${ATTEMPT}';`);
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.checkout_payment_attempts SET status='initiation_unknown',initiation_unknown_at='2026-07-21 12:01:00+00',provider_token_digest=repeat('1',64),provider_token_key_id='key-1',sealed_provider_token=${ENVELOPE},version=2,updated_at='2026-07-21 12:01:00+00' WHERE id='${ATTEMPT}';`);
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.checkout_payment_attempts SET redemption_session_id='61000000-0000-4000-8000-000000000099',version=2,updated_at='2026-07-21 12:01:00+00' WHERE id='${ATTEMPT}';`);
      assert.equal(psql(backend, `SELECT status||':'||version FROM saas.checkout_payment_attempts WHERE id='${ATTEMPT}';`), "reserved:1");
    });

    await scenario("reservations enforce one held variant and tracked-untracked lifecycle semantics", async () => {
      denied(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.checkout_inventory_reservations(id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at) VALUES ('63000000-0000-4000-8000-000000000002','${STORE}','${ATTEMPT}','${LINK}','${PRODUCT}','${VARIANT}',1,true,'held','2026-07-21 12:00:00+00',1,'2026-07-21 12:00:00+00');`);
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.checkout_inventory_reservations SET stock_tracked=false,version=2,updated_at='2026-07-21 12:01:00+00' WHERE id='${RESERVATION}';`);
      psql(backend, `BEGIN; SET ROLE celebix_saas_owner; INSERT INTO saas.checkout_inventory_reservations(id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at) VALUES ('63000000-0000-4000-8000-000000000003','${STORE}','${ATTEMPT}','${LINK}','${PRODUCT}','${VARIANT_2}',999999,false,'held','2026-07-21 12:00:00+00',1,'2026-07-21 12:00:00+00'); ROLLBACK;`);
      denied(backend, `BEGIN; SET ROLE celebix_saas_owner; INSERT INTO saas.checkout_inventory_reservations(id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at) VALUES ('63000000-0000-4000-8000-000000000004','${STORE}','${ATTEMPT}','${LINK}','${PRODUCT}','${VARIANT_2}',999999,false,'held','2026-07-21 12:00:00+00',1,'2026-07-21 12:00:00+00'); UPDATE saas.checkout_inventory_reservations SET status='released',released_at='2026-07-21 12:01:00+00',version=2,updated_at='2026-07-21 12:01:00+00' WHERE id='63000000-0000-4000-8000-000000000004'; UPDATE saas.checkout_inventory_reservations SET status='held',released_at=NULL,version=3,updated_at='2026-07-21 12:02:00+00' WHERE id='63000000-0000-4000-8000-000000000004';`);
    });

    await scenario("catalog variant guard protects aggregate held stock without blocking safe edits", async () => {
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.product_variants SET stock_quantity=1,version=2,updated_at='2026-07-21' WHERE id='${VARIANT}';`);
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.product_variants SET stock_tracking=false,version=2,updated_at='2026-07-21' WHERE id='${VARIANT}';`);
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.product_variants SET status='archived',archived_at='2026-07-21',version=2,updated_at='2026-07-21' WHERE id='${VARIANT}';`);
      denied(backend, `SET ROLE celebix_saas_app; SELECT outcome FROM saas.catalog_archive_product('${STORE}','${PRINCIPAL}','${MEMBERSHIP}','${PLAN}','free_starter',1,100,'2026-07-21','90000000-0000-4000-8000-000000000090',repeat('8',64),'${PRODUCT}',1);`);
      psql(backend, `SET ROLE celebix_saas_owner; UPDATE saas.product_variants SET title='Tracked safe edit',stock_quantity=6,version=2,updated_at='2026-07-21' WHERE id='${VARIANT}';`);
      assert.equal(psql(backend, `SELECT stock_quantity FROM saas.product_variants WHERE id='${VARIANT}';`), "6");
    });

    await scenario("callback operation and reconciliation receipts are unique immutable and bounded", async () => {
      psql(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.checkout_callback_receipts(id,store_id,attempt_id,callback_digest,currency,callback_status,result_payload,received_at) VALUES ('64000000-0000-4000-8000-000000000001','${STORE}','${ATTEMPT}',repeat('a',64),'TRY','failed','{}','2026-07-21 12:01:00+00'); INSERT INTO saas.checkout_operations(operation_id,store_id,attempt_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES ('65000000-0000-4000-8000-000000000001','${STORE}','${ATTEMPT}','begin_attempt',repeat('b',64),'{}','2026-07-21 12:01:00+00'); INSERT INTO saas.checkout_reconciliation_receipts(id,store_id,attempt_id,operation_id,currency,outcome,payload_fingerprint,result_payload,committed_at) VALUES ('66000000-0000-4000-8000-000000000001','${STORE}','${ATTEMPT}','67000000-0000-4000-8000-000000000001','TRY','unknown',repeat('c',64),'{}','2026-07-21 12:01:00+00');`);
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.checkout_callback_receipts SET result_payload='{"changed":true}' WHERE id='64000000-0000-4000-8000-000000000001';`);
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.checkout_operations SET result_payload='{"changed":true}' WHERE operation_id='65000000-0000-4000-8000-000000000001';`);
      denied(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.checkout_callback_receipts(id,store_id,attempt_id,callback_digest,currency,callback_status,result_payload,received_at) VALUES ('64000000-0000-4000-8000-000000000002','${STORE}','${ATTEMPT}',repeat('a',64),'TRY','failed','{}','2026-07-21 12:01:00+00');`);
      denied(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.checkout_callback_receipts(id,store_id,attempt_id,callback_digest,currency,callback_status,result_payload,received_at) VALUES ('64000000-0000-4000-8000-000000000003','${STORE}','${ATTEMPT}',repeat('f',64),'USD','failed','{}','2026-07-21 12:01:00+00');`);
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.checkout_reconciliation_receipts SET outcome='succeeded' WHERE id='66000000-0000-4000-8000-000000000001';`);
      denied(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.checkout_reconciliation_receipts(id,store_id,attempt_id,operation_id,currency,outcome,payload_fingerprint,result_payload,committed_at) VALUES ('66000000-0000-4000-8000-000000000002','${STORE}','${ATTEMPT}','67000000-0000-4000-8000-000000000002','TRY','unknown',repeat('d',64),jsonb_build_object('oversized',repeat('x',40000)),'2026-07-21 12:01:00+00');`);
      denied(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.checkout_reconciliation_receipts(id,store_id,attempt_id,operation_id,currency,outcome,payload_fingerprint,result_payload,committed_at) VALUES ('66000000-0000-4000-8000-000000000003','${STORE}','${ATTEMPT}','67000000-0000-4000-8000-000000000003','USD','unknown',repeat('e',64),'{}','2026-07-21 12:01:00+00');`);
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.checkout_reconciliation_jobs SET attempt_number=-1,updated_at='2026-07-21 11:59:00+00' WHERE attempt_id='${ATTEMPT}';`);
    });

    await scenario("orders bind exactly one quick-link source through composite authority", async () => {
      psql(backend, `BEGIN; SET ROLE celebix_saas_owner; INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,billing_address,quick_order_link_id,version,created_at,updated_at) VALUES ('70000000-0000-4000-8000-000000000001','${STORE}','QL-1','quick_link','Ada','ada@example.test','TRY',10000,0,0,10000,'confirmed','completed','{}','{}','${LINK}',1,'2026-07-21','2026-07-21'); ROLLBACK;`);
      denied(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at) VALUES ('70000000-0000-4000-8000-000000000002','${STORE}','BAD-1','quick_link','Ada','ada@example.test','TRY',1,0,0,1,'pending','pending','{}',1,'2026-07-21','2026-07-21');`);
      denied(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,billing_address,quick_order_link_id,version,created_at,updated_at) VALUES ('70000000-0000-4000-8000-000000000003','${STORE}','BAD-TRY','quick_link','Ada','ada@example.test','USD',1,0,0,1,'pending','pending','{}','{}','${LINK}',1,'2026-07-21','2026-07-21');`);
      denied(backend, `BEGIN; SET ROLE celebix_saas_owner; INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,billing_address,quick_order_link_id,version,created_at,updated_at) VALUES ('70000000-0000-4000-8000-000000000004','${STORE}','QL-4','quick_link','Ada','ada@example.test','TRY',10000,0,0,10000,'confirmed','completed','{}','{}','${LINK}',1,'2026-07-21','2026-07-21'); UPDATE saas.quick_order_links SET status='opened',opened_at='2026-07-21 12:01:00+00',version=2,updated_at='2026-07-21 12:01:00+00' WHERE id='${LINK}'; UPDATE saas.quick_order_links SET status='paid',paid_at='2026-07-21 12:02:00+00',order_id='70000000-0000-4000-8000-000000000004',version=3,updated_at='2026-07-21 12:02:00+00' WHERE id='${LINK}'; UPDATE saas.quick_order_links SET internal_label='changed',version=4,updated_at='2026-07-21 12:03:00+00' WHERE id='${LINK}';`);
    });

    await scenario("cancel and expiry guards prelock live attempts in deterministic order", async () => {
      const reservedDatabase = cloneDatabase(backend, "race_reserved");
      await raceLiveAttemptAgainstCancel(backend, reservedDatabase, "reserved", "90000000-0000-4000-8000-000000000011", "reserved");

      const providerReadyDatabase = cloneDatabase(backend, "race_provider_ready");
      makeAttemptProviderReady(backend, providerReadyDatabase);
      await raceLiveAttemptAgainstCancel(backend, providerReadyDatabase, "provider_ready", "90000000-0000-4000-8000-000000000012", "provider_ready");

      const initiationUnknownDatabase = cloneDatabase(backend, "race_initiation_unknown");
      makeAttemptInitiationUnknown(backend, initiationUnknownDatabase);
      await raceLiveAttemptAgainstCancel(backend, initiationUnknownDatabase, "initiation_unknown", "90000000-0000-4000-8000-000000000013", "initiation_unknown");

      const expiryDatabase = cloneDatabase(backend, "race_expiry");
      psql(backend, `SET ROLE celebix_saas_owner;
        UPDATE saas.checkout_payment_attempts SET status='expired',expired_at='2026-07-21 12:06:00+00',version=2,updated_at='2026-07-21 12:06:00+00' WHERE id='${ATTEMPT}';
        UPDATE saas.checkout_inventory_reservations SET status='expired',expired_at='2026-07-21 12:06:00+00',version=2,updated_at='2026-07-21 12:06:00+00' WHERE id='${RESERVATION}';`, expiryDatabase);
      const expiryBegin = openPsqlSession(backend, expiryDatabase, "expiry_begin");
      const expiryUpdate = openPsqlSession(backend, expiryDatabase, "expiry_update");
      try {
        await expiryBegin.execute(`BEGIN; SET ROLE celebix_saas_owner;
          SELECT id FROM saas.quick_order_links WHERE id='${LINK}' FOR UPDATE;
          INSERT INTO saas.checkout_payment_attempts SELECT
            '62000000-0000-4000-8000-000000000019',store_id,quick_order_link_id,redemption_session_id,provider_config_id,
            provider_config_version,configuration_digest,configuration_key_id,sealed_configuration,
            '2123456789abcdef0123456789abcdef',expected_subtotal_cents,expected_shipping_cents,expected_discount_cents,
            expected_payment_amount,currency,'reserved',NULL,NULL,NULL,
            '2026-07-21 12:15:00+00',NULL,NULL,NULL,NULL,NULL,NULL,
            1,'2026-07-21 12:10:00+00','2026-07-21 12:10:00+00' FROM saas.checkout_payment_attempts WHERE id='${ATTEMPT}';
          INSERT INTO saas.checkout_inventory_reservations(id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at)
            VALUES ('63000000-0000-4000-8000-000000000019','${STORE}','62000000-0000-4000-8000-000000000019','${LINK}','${PRODUCT}','${VARIANT_2}',1,false,'held','2026-07-21 12:10:00+00',1,'2026-07-21 12:10:00+00');`);
        const expiryResult = expiryUpdate.execute(`BEGIN; SET ROLE celebix_saas_owner;
          UPDATE saas.quick_order_links SET status='expired',version=2,updated_at='2026-07-21 12:01:00+00' WHERE id='${LINK}';
          COMMIT;`);
        await waitForBlockedSession(backend, expiryDatabase, expiryUpdate.applicationName);
        await expiryBegin.execute("COMMIT;");
        await assert.rejects(expiryResult, /QUICK_LINK_HAS_LIVE_PAYMENT_ATTEMPT/);
        assert.equal(psql(backend, `SELECT status||'|'||version FROM saas.quick_order_links WHERE id='${LINK}';`, expiryDatabase), "active|1");
        assert.equal(psql(backend, `SELECT count(*) FROM saas.checkout_payment_attempts AS attempt JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id WHERE attempt.quick_order_link_id='${LINK}' AND attempt.status='reserved' AND reservation.status='held';`, expiryDatabase), "1");
      } finally {
        await Promise.all([expiryBegin.close(), expiryUpdate.close()]);
      }

      const expiryWinsDatabase = cloneDatabase(backend, "race_expiry_wins");
      psql(backend, `SET ROLE celebix_saas_owner;
        UPDATE saas.checkout_payment_attempts SET status='expired',expired_at='2026-07-21 12:06:00+00',version=2,updated_at='2026-07-21 12:06:00+00' WHERE id='${ATTEMPT}';
        UPDATE saas.checkout_inventory_reservations SET status='expired',expired_at='2026-07-21 12:06:00+00',version=2,updated_at='2026-07-21 12:06:00+00' WHERE id='${RESERVATION}';`, expiryWinsDatabase);
      const expiryWinner = openPsqlSession(backend, expiryWinsDatabase, "expiry_winner");
      const beginLoser = openPsqlSession(backend, expiryWinsDatabase, "begin_after_expiry");
      try {
        await expiryWinner.execute(`BEGIN; SET ROLE celebix_saas_owner;
          UPDATE saas.quick_order_links SET status='expired',version=2,updated_at='2026-07-21 12:07:00+00' WHERE id='${LINK}';`);
        const beginResult = beginLoser.execute(`BEGIN; SET ROLE celebix_saas_owner;
          DO $begin$
          DECLARE link_status text;
          BEGIN
            SELECT status INTO link_status FROM saas.quick_order_links WHERE id='${LINK}' FOR UPDATE;
            IF link_status NOT IN ('active','opened') THEN RAISE EXCEPTION 'CHECKOUT_BEGIN_LINK_UNAVAILABLE'; END IF;
            INSERT INTO saas.checkout_payment_attempts SELECT
              '62000000-0000-4000-8000-000000000020',store_id,quick_order_link_id,redemption_session_id,provider_config_id,
              provider_config_version,configuration_digest,configuration_key_id,sealed_configuration,
              '3123456789abcdef0123456789abcdef',expected_subtotal_cents,expected_shipping_cents,expected_discount_cents,
              expected_payment_amount,currency,'reserved',NULL,NULL,NULL,
              '2026-07-21 12:15:00+00',NULL,NULL,NULL,NULL,NULL,NULL,
              1,'2026-07-21 12:10:00+00','2026-07-21 12:10:00+00'
            FROM saas.checkout_payment_attempts WHERE id='${ATTEMPT}';
          END
          $begin$; COMMIT;`);
        await waitForBlockedSession(backend, expiryWinsDatabase, beginLoser.applicationName);
        await expiryWinner.execute("COMMIT;");
        await assert.rejects(beginResult, /CHECKOUT_BEGIN_LINK_UNAVAILABLE/);
        assert.equal(psql(backend, `SELECT status||'|'||version||'|'||(SELECT count(*) FROM saas.checkout_payment_attempts WHERE quick_order_link_id='${LINK}' AND status='reserved')||'|'||(SELECT count(*) FROM saas.orders WHERE quick_order_link_id='${LINK}') FROM saas.quick_order_links WHERE id='${LINK}';`, expiryWinsDatabase), "expired|2|0|0");
      } finally {
        await Promise.all([expiryWinner.close(), beginLoser.close()]);
      }

      const failureDatabase = cloneDatabase(backend, "race_signed_failure");
      makeAttemptProviderReady(backend, failureDatabase);
      const failure = openPsqlSession(backend, failureDatabase, "signed_failure");
      const failureCancel = openPsqlSession(backend, failureDatabase, "signed_failure_cancel");
      try {
        await failure.execute(`BEGIN; SET ROLE celebix_saas_owner; SELECT id FROM saas.checkout_payment_attempts WHERE id='${ATTEMPT}' FOR UPDATE;`);
        const cancelResult = failureCancel.execute(`BEGIN; ${cancelSql("90000000-0000-4000-8000-000000000014")} COMMIT;`);
        await waitForBlockedSession(backend, failureDatabase, failureCancel.applicationName);
        await failure.execute(`UPDATE saas.checkout_payment_attempts SET status='failed',failed_at='2026-07-21 12:02:00+00',version=3,updated_at='2026-07-21 12:02:00+00' WHERE id='${ATTEMPT}';
          UPDATE saas.checkout_inventory_reservations SET status='released',released_at='2026-07-21 12:02:00+00',version=2,updated_at='2026-07-21 12:02:00+00' WHERE attempt_id='${ATTEMPT}'; COMMIT;`);
        assert.equal((await cancelResult).split("\n").at(-1), "committed");
        assert.equal(psql(backend, `SELECT link.status||'|'||attempt.status||'|'||reservation.status||'|'||(SELECT count(*) FROM saas.orders WHERE quick_order_link_id='${LINK}') FROM saas.quick_order_links AS link JOIN saas.checkout_payment_attempts AS attempt ON attempt.quick_order_link_id=link.id JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id WHERE link.id='${LINK}' AND attempt.id='${ATTEMPT}' AND reservation.id='${RESERVATION}';`, failureDatabase), "cancelled|failed|released|0");
      } finally {
        await Promise.all([failure.close(), failureCancel.close()]);
      }

      const failureExpiryDatabase = cloneDatabase(backend, "race_failure_expiry");
      makeAttemptProviderReady(backend, failureExpiryDatabase);
      const failureWinner = openPsqlSession(backend, failureExpiryDatabase, "failure_before_expiry");
      const expiryAfterFailure = openPsqlSession(backend, failureExpiryDatabase, "expiry_after_failure");
      try {
        await failureWinner.execute(`BEGIN; SET ROLE celebix_saas_owner;
          SELECT id FROM saas.checkout_payment_attempts WHERE id='${ATTEMPT}' FOR UPDATE;
          SELECT id FROM saas.quick_order_links WHERE id='${LINK}' FOR UPDATE;`);
        const expiryResult = expiryAfterFailure.execute(`BEGIN; SET ROLE celebix_saas_owner;
          SELECT id FROM saas.quick_order_links WHERE id='${LINK}' FOR UPDATE;
          UPDATE saas.quick_order_links SET status='expired',version=2,updated_at='2026-07-21 12:03:00+00' WHERE id='${LINK}';
          COMMIT; SELECT 'expired';`);
        await waitForBlockedSession(backend, failureExpiryDatabase, expiryAfterFailure.applicationName);
        await failureWinner.execute(`UPDATE saas.checkout_payment_attempts SET status='failed',failed_at='2026-07-21 12:02:00+00',version=3,updated_at='2026-07-21 12:02:00+00' WHERE id='${ATTEMPT}';
          UPDATE saas.checkout_inventory_reservations SET status='released',released_at='2026-07-21 12:02:00+00',version=2,updated_at='2026-07-21 12:02:00+00' WHERE attempt_id='${ATTEMPT}'; COMMIT;`);
        assert.equal((await expiryResult).split("\n").at(-1), "expired");
        assert.equal(psql(backend, `SELECT link.status||'|'||attempt.status||'|'||reservation.status||'|'||(SELECT count(*) FROM saas.orders WHERE quick_order_link_id='${LINK}')||'|'||(SELECT stock_quantity FROM saas.product_variants WHERE id='${VARIANT}') FROM saas.quick_order_links AS link JOIN saas.checkout_payment_attempts AS attempt ON attempt.quick_order_link_id=link.id JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id WHERE link.id='${LINK}' AND attempt.id='${ATTEMPT}' AND reservation.id='${RESERVATION}';`, failureExpiryDatabase), "expired|failed|released|0|6");
      } finally {
        await Promise.all([failureWinner.close(), expiryAfterFailure.close()]);
      }

      const expiryFirstFailureDatabase = cloneDatabase(backend, "race_expiry_first_failure");
      makeAttemptProviderReady(backend, expiryFirstFailureDatabase);
      const failureAfterExpiry = openPsqlSession(backend, expiryFirstFailureDatabase, "failure_after_expiry");
      const expiryFirst = openPsqlSession(backend, expiryFirstFailureDatabase, "expiry_before_failure");
      try {
        await failureAfterExpiry.execute(`BEGIN; SET ROLE celebix_saas_owner;
          SELECT id FROM saas.checkout_payment_attempts WHERE id='${ATTEMPT}' FOR UPDATE;`);
        await expiryFirst.execute(`BEGIN; SET ROLE celebix_saas_owner;
          SELECT id FROM saas.quick_order_links WHERE id='${LINK}' FOR UPDATE;`);
        const failureLinkLock = failureAfterExpiry.execute(`SELECT id FROM saas.quick_order_links WHERE id='${LINK}' FOR UPDATE;`);
        await waitForBlockedSession(backend, expiryFirstFailureDatabase, failureAfterExpiry.applicationName);
        await assert.rejects(
          expiryFirst.execute(`UPDATE saas.quick_order_links SET status='expired',version=2,updated_at='2026-07-21 12:03:00+00' WHERE id='${LINK}'; COMMIT;`),
          /QUICK_LINK_HAS_LIVE_PAYMENT_ATTEMPT/,
        );
        await failureLinkLock;
        await failureAfterExpiry.execute(`UPDATE saas.checkout_payment_attempts SET status='failed',failed_at='2026-07-21 12:02:00+00',version=3,updated_at='2026-07-21 12:02:00+00' WHERE id='${ATTEMPT}';
          UPDATE saas.checkout_inventory_reservations SET status='released',released_at='2026-07-21 12:02:00+00',version=2,updated_at='2026-07-21 12:02:00+00' WHERE attempt_id='${ATTEMPT}'; COMMIT;`);
        psql(backend, `SET ROLE celebix_saas_owner; UPDATE saas.quick_order_links SET status='expired',version=2,updated_at='2026-07-21 12:04:00+00' WHERE id='${LINK}';`, expiryFirstFailureDatabase);
        assert.equal(psql(backend, `SELECT link.status||'|'||attempt.status||'|'||reservation.status||'|'||(SELECT count(*) FROM saas.orders WHERE quick_order_link_id='${LINK}')||'|'||(SELECT stock_quantity FROM saas.product_variants WHERE id='${VARIANT}') FROM saas.quick_order_links AS link JOIN saas.checkout_payment_attempts AS attempt ON attempt.quick_order_link_id=link.id JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id WHERE link.id='${LINK}' AND attempt.id='${ATTEMPT}' AND reservation.id='${RESERVATION}';`, expiryFirstFailureDatabase), "expired|failed|released|0|6");
      } finally {
        await Promise.all([failureAfterExpiry.close(), expiryFirst.close()]);
      }

      const successDatabase = cloneDatabase(backend, "race_success");
      makeAttemptProviderReady(backend, successDatabase);
      const success = openPsqlSession(backend, successDatabase, "success_settlement");
      const successCancel = openPsqlSession(backend, successDatabase, "success_cancel");
      try {
        await success.execute(`BEGIN; SET ROLE celebix_saas_owner; SELECT id FROM saas.checkout_payment_attempts WHERE id='${ATTEMPT}' FOR UPDATE;`);
        const cancelResult = successCancel.execute(`BEGIN; ${cancelSql("90000000-0000-4000-8000-000000000015", "2026-07-21 12:03:00+00", 2)} COMMIT;`);
        await waitForBlockedSession(backend, successDatabase, successCancel.applicationName);
        await success.execute(`${settlementSql()} COMMIT;`);
        assert.equal((await cancelResult).split("\n").at(-1), "invalid_transition");
        assert.equal(psql(backend, `SELECT link.status||'|'||attempt.status||'|'||reservation.status||'|'||link.order_id||'|'||attempt.settled_order_id||'|'||(SELECT count(*) FROM saas.orders WHERE quick_order_link_id='${LINK}')||'|'||(SELECT stock_quantity FROM saas.product_variants WHERE id='${VARIANT}') FROM saas.quick_order_links AS link JOIN saas.checkout_payment_attempts AS attempt ON attempt.quick_order_link_id=link.id JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id WHERE link.id='${LINK}' AND attempt.id='${ATTEMPT}' AND reservation.id='${RESERVATION}';`, successDatabase), `paid|succeeded|consumed|${SUCCESS_ORDER}|${SUCCESS_ORDER}|1|4`);
      } finally {
        await Promise.all([success.close(), successCancel.close()]);
      }

      const successExpiryDatabase = cloneDatabase(backend, "race_success_expiry");
      makeAttemptProviderReady(backend, successExpiryDatabase);
      const successWinner = openPsqlSession(backend, successExpiryDatabase, "success_before_expiry");
      const expiryAfterSuccess = openPsqlSession(backend, successExpiryDatabase, "expiry_after_success");
      try {
        await successWinner.execute(`BEGIN; SET ROLE celebix_saas_owner;
          SELECT id FROM saas.checkout_payment_attempts WHERE id='${ATTEMPT}' FOR UPDATE;
          SELECT id FROM saas.quick_order_links WHERE id='${LINK}' FOR UPDATE;`);
        const expiryResult = expiryAfterSuccess.execute(`BEGIN; SET ROLE celebix_saas_owner;
          SELECT id FROM saas.quick_order_links WHERE id='${LINK}' FOR UPDATE;
          UPDATE saas.quick_order_links SET status='expired',version=2,updated_at='2026-07-21 12:03:00+00' WHERE id='${LINK}';
          COMMIT;`);
        await waitForBlockedSession(backend, successExpiryDatabase, expiryAfterSuccess.applicationName);
        await successWinner.execute(`${settlementSql("70000000-0000-4000-8000-000000000012")} COMMIT;`);
        await assert.rejects(expiryResult, /QUICK_LINK_(?:PAID_IMMUTABLE|TERMINAL_STATUS_IMMUTABLE)/);
        assert.equal(psql(backend, `SELECT link.status||'|'||attempt.status||'|'||reservation.status||'|'||link.order_id||'|'||attempt.settled_order_id||'|'||(SELECT count(*) FROM saas.orders WHERE quick_order_link_id='${LINK}')||'|'||(SELECT stock_quantity FROM saas.product_variants WHERE id='${VARIANT}') FROM saas.quick_order_links AS link JOIN saas.checkout_payment_attempts AS attempt ON attempt.quick_order_link_id=link.id JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id WHERE link.id='${LINK}' AND attempt.id='${ATTEMPT}' AND reservation.id='${RESERVATION}';`, successExpiryDatabase), "paid|succeeded|consumed|70000000-0000-4000-8000-000000000012|70000000-0000-4000-8000-000000000012|1|4");
      } finally {
        await Promise.all([successWinner.close(), expiryAfterSuccess.close()]);
      }

      const definition = psql(backend, "SELECT pg_get_functiondef('saas.quick_links_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,uuid,text)'::regprocedure);");
      assert.ok(definition.indexOf("ORDER BY attempt.id") < definition.indexOf("SELECT link.* INTO current_link"));
    });

    await scenario("archive and settlement lock ordering completes without deadlock", async () => {
      const database = cloneDatabase(backend, "race_archive");
      makeAttemptProviderReady(backend, database);
      psql(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.checkout_inventory_reservations(id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at) VALUES ('63000000-0000-4000-8000-000000000005','${STORE}','${ATTEMPT}','${LINK}','${PRODUCT}','${VARIANT_2}',999999,false,'held','2026-07-21 12:00:00+00',1,'2026-07-21 12:00:00+00');`, database);
      const settle = openPsqlSession(backend, database, "archive_settlement");
      const archive = openPsqlSession(backend, database, "archive_catalog");
      try {
        await settle.execute(`BEGIN; SET ROLE celebix_saas_owner;
          SELECT id FROM saas.checkout_payment_attempts WHERE id='${ATTEMPT}' FOR UPDATE;
          SELECT id FROM saas.quick_order_links WHERE id='${LINK}' FOR UPDATE;
          SELECT id FROM saas.product_variants WHERE id='${VARIANT}' FOR UPDATE;`);
        const archiveResult = archive.execute(`BEGIN; SET lock_timeout='2s'; SET deadlock_timeout='50ms'; SET ROLE celebix_saas_app;
          SELECT outcome FROM saas.catalog_archive_product('${STORE}','${PRINCIPAL}','${MEMBERSHIP}','${PLAN}','free_starter',1,100,'2026-07-21 12:03:00+00','90000000-0000-4000-8000-000000000016',repeat('9',64),'${PRODUCT}',1); COMMIT;`);
        await waitForBlockedSession(backend, database, archive.applicationName);
        await settle.execute(`SET lock_timeout='2s'; SELECT id FROM saas.product_variants WHERE id='${VARIANT_2}' FOR UPDATE;
          SELECT id FROM saas.checkout_inventory_reservations WHERE attempt_id='${ATTEMPT}' ORDER BY variant_id FOR UPDATE;
          ${settlementSql("70000000-0000-4000-8000-000000000011")}
          COMMIT;`);
        assert.equal((await archiveResult).split("\n").at(-1), "archived");
        assert.equal(psql(backend, `SELECT product.status||'|'||string_agg(variant.status,',' ORDER BY variant.id)||'|'||attempt.status||'|'||link.status||'|'||(SELECT count(*) FROM saas.checkout_inventory_reservations WHERE attempt_id='${ATTEMPT}' AND status='consumed') FROM saas.products AS product JOIN saas.product_variants AS variant ON variant.product_id=product.id JOIN saas.checkout_payment_attempts AS attempt ON attempt.id='${ATTEMPT}' JOIN saas.quick_order_links AS link ON link.id=attempt.quick_order_link_id WHERE product.id='${PRODUCT}' GROUP BY product.status,attempt.status,link.status;`, database), "archived|archived,archived|succeeded|paid|2");
      } finally {
        await Promise.all([settle.close(), archive.close()]);
      }
    });

    await scenario("down restores exact 025 bodies then reapply and partial-start cleanup succeeds", async () => {
      apply(backend, "202607220026_quick_order_checkout_runtime.up.sql", ROLLBACK_DATABASE);
      psql(backend, `SET ROLE celebix_saas_owner;
        UPDATE saas.checkout_provider_configs SET status='revoked',configuration_digest=repeat('d',64),version=2,updated_at='2026-07-21' WHERE id='${PROVIDER}';
        INSERT INTO saas.checkout_provider_configs(id,store_id,provider_key,status,public_origin,configuration_key_id,sealed_configuration,configuration_digest,version,created_at,updated_at)
          VALUES ('50000000-0000-4000-8000-000000000009','${STORE}','paytr','active','https://www.paytr.com','key-1',${ENVELOPE},repeat('e',64),1,'2026-07-21','2026-07-21');`, ROLLBACK_DATABASE);
      const unsafeDown = apply(backend, "202607220026_quick_order_checkout_runtime.down.sql", ROLLBACK_DATABASE, true);
      assert.notEqual(unsafeDown.status, 0);
      assert.match(unsafeDown.stderr, /QUICK_ORDER_RUNTIME_DOWN_PROVIDER_HISTORY_CONFLICT/);
      assert.equal(psql(backend, "SELECT to_regclass('saas.checkout_payment_attempts') IS NOT NULL;", ROLLBACK_DATABASE), "t");
      psql(backend, `SET ROLE celebix_saas_owner;
        ALTER TABLE saas.checkout_provider_configs DISABLE TRIGGER checkout_provider_configs_terminal;
        DELETE FROM saas.checkout_provider_configs WHERE id='50000000-0000-4000-8000-000000000009';
        UPDATE saas.checkout_provider_configs SET status='active',version=3,updated_at='2026-07-21 00:00:01+00' WHERE id='${PROVIDER}';
        ALTER TABLE saas.checkout_provider_configs ENABLE TRIGGER checkout_provider_configs_terminal;`, ROLLBACK_DATABASE);
      apply(backend, "202607220026_quick_order_checkout_runtime.down.sql", ROLLBACK_DATABASE);
      const down = readFileSync(path.join(SQL, "202607220026_quick_order_checkout_runtime.down.sql"), "utf8");
      assert.equal(normalizedFunction(down, "quick_links_cancel"), normalizedFunction(readFileSync(path.join(SQL, "202607220025_quick_order_links_api.up.sql"), "utf8"), "quick_links_cancel"));
      assert.equal(normalizedFunction(down, "catalog_archive_product"), normalizedFunction(readFileSync(path.join(SQL, "202607160018_product_catalog.up.sql"), "utf8"), "catalog_archive_product"));
      apply(backend, "202607220026_quick_order_checkout_runtime.up.sql", ROLLBACK_DATABASE);
      apply(backend, "202607220026_quick_order_checkout_runtime_assertions.sql", ROLLBACK_DATABASE);
      psql(backend, "SET ROLE celebix_saas_owner; ALTER TABLE saas.checkout_provider_configs ADD COLUMN configuration_digest char(64);", PARTIAL_DATABASE);
      assert.notEqual(apply(backend, "202607220026_quick_order_checkout_runtime.up.sql", PARTIAL_DATABASE, true).status, 0);
      assert.equal(psql(backend, "SELECT to_regclass('saas.checkout_payment_attempts') IS NULL;", PARTIAL_DATABASE), "t");
      psql(backend, "SET ROLE celebix_saas_owner; ALTER TABLE saas.checkout_provider_configs DROP COLUMN configuration_digest;", PARTIAL_DATABASE);
      apply(backend, "202607220026_quick_order_checkout_runtime.up.sql", PARTIAL_DATABASE);
      apply(backend, "202607220026_quick_order_checkout_runtime.down.sql", PARTIAL_DATABASE);

      for (const failAfter of ["temporary-directory", "socket-directory", "initdb", "pg-ctl-started"]) {
        const allocations = [];
        assert.throws(
          () => startPostgres({
            token: `${TOKEN.slice(0, 6)}${failAfter.replaceAll("-", "").slice(0, 5)}`,
            failAfter,
            onAllocation: (_kind, allocationPath) => allocations.push(allocationPath),
          }),
          new RegExp(`INJECTED_${failAfter.replaceAll("-", "_").toUpperCase()}_FAILURE`),
        );
        assert.ok(allocations.length >= 1, `${failAfter} did not reach an allocation boundary`);
        for (const allocationPath of allocations) assert.equal(existsSync(allocationPath), false, `${failAfter} leaked ${allocationPath}`);
      }
    });

    assert.equal(completed.length, TOTAL);
    process.stdout.write(`PASS ${TOTAL}/${TOTAL} quick-order runtime PostgreSQL 16 harness complete; rollback/reapply and cleanup confirmed\n`);
  } finally {
    stopPostgres(backend);
  }
}

await main();
