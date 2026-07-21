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
const TOTAL = 49;
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
const HOSTNAME = "runtime-store.example.test";
const ALIAS_HOSTNAME = "shop.runtime-store.example.test";
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

function blockingApplications(backend, database, applicationName) {
  const raw = psql(backend, `SELECT COALESCE(pg_catalog.string_agg(blocker.application_name,',' ORDER BY blocker.application_name),'')
    FROM pg_catalog.pg_stat_activity AS activity
    CROSS JOIN LATERAL pg_catalog.unnest(pg_catalog.pg_blocking_pids(activity.pid)) AS blocked(blocker_pid)
    JOIN pg_catalog.pg_stat_activity AS blocker ON blocker.pid=blocked.blocker_pid
    WHERE activity.datname=${sqlLiteral(database)} AND activity.application_name=${sqlLiteral(applicationName)};`, database);
  return raw === "" ? [] : raw.split(",");
}

async function waitForBlockedBySession(backend, database, applicationName, blockerApplicationName) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (blockingApplications(backend,database,applicationName).includes(blockerApplicationName)) return;
    await delay(10);
  }
  throw new Error(`session ${applicationName} was not blocked by ${blockerApplicationName}`);
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

function functionResult(backend, expression, database = DATABASE, role = "celebix_saas_workflow") {
  const raw = psql(backend, `SET ROLE ${role}; SELECT outcome||E'\\t'||COALESCE(result_payload::text,'null') FROM ${expression};`, database);
  const separator = raw.indexOf("\t");
  assert.notEqual(separator, -1, `function did not return one controlled row: ${raw}`);
  return { outcome: raw.slice(0, separator), payload: JSON.parse(raw.slice(separator + 1)) };
}

function checkoutMutationBytes(backend, database) {
  return psql(backend, `SELECT pg_catalog.jsonb_build_object(
    'attempts',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) ORDER BY row_data.id),'[]'::jsonb) FROM saas.checkout_payment_attempts AS row_data),
    'callbackReceipts',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) ORDER BY row_data.id),'[]'::jsonb) FROM saas.checkout_callback_receipts AS row_data),
    'jobs',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) ORDER BY row_data.attempt_id),'[]'::jsonb) FROM saas.checkout_reconciliation_jobs AS row_data),
    'links',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) ORDER BY row_data.id),'[]'::jsonb) FROM saas.quick_order_links AS row_data),
    'operations',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) ORDER BY row_data.operation_id),'[]'::jsonb) FROM saas.checkout_operations AS row_data),
    'orderEvents',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) ORDER BY row_data.id),'[]'::jsonb) FROM saas.order_events AS row_data),
    'orderItems',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) ORDER BY row_data.id),'[]'::jsonb) FROM saas.order_items AS row_data),
    'orders',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) ORDER BY row_data.id),'[]'::jsonb) FROM saas.orders AS row_data),
    'products',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) ORDER BY row_data.id),'[]'::jsonb) FROM saas.products AS row_data),
    'reconciliationReceipts',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) ORDER BY row_data.id),'[]'::jsonb) FROM saas.checkout_reconciliation_receipts AS row_data),
    'reservations',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) ORDER BY row_data.id),'[]'::jsonb) FROM saas.checkout_inventory_reservations AS row_data),
    'variants',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_data) ORDER BY row_data.id),'[]'::jsonb) FROM saas.product_variants AS row_data)
  )::text;`, database);
}

function merchantAuthority(membership = MEMBERSHIP, principal = PRINCIPAL) {
  return `'${STORE}','${principal}','${membership}','${PLAN}','free_starter',1`;
}

function fixtureUuid(prefix, number) {
  return `${prefix}0000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
}

function fixtureDigest(label) {
  return createHash("sha256").update(`${TOKEN}:${label}`).digest("hex");
}

function seedCheckoutLink(backend, database, number, options = {}) {
  const link = fixtureUuid("6", number);
  const item = fixtureUuid("8", number);
  const digest = fixtureDigest(`token:${number}`);
  const quantity = options.quantity ?? 1;
  const name = options.customerName ?? "Ada Lovelace";
  const email = options.email ?? "ada@example.test";
  const phone = options.phone ?? "+905551110000";
  const price = options.variant === VARIANT_2 ? 11000 : 10000;
  const variant = options.variant ?? VARIANT;
  const total = price * quantity;
  psql(backend, `SET ROLE celebix_saas_owner;
    INSERT INTO saas.quick_order_links(
      id,store_id,creating_membership_id,provider_config_id,status,token_digest,token_key_id,sealed_token,
      customer_name,customer_email,customer_phone,shipping_address,billing_address,internal_label,currency,
      subtotal_cents,shipping_cents,discount_cents,total_cents,expires_at,version,created_at,updated_at
    ) VALUES(
      '${link}','${STORE}','${MEMBERSHIP}','${options.provider ?? PROVIDER}','active','${digest}','key-1',${ENVELOPE},
      ${sqlLiteral(name)},${sqlLiteral(email)},${sqlLiteral(phone)},${ADDRESS},${ADDRESS},'runtime','TRY',
      ${total},0,0,${total},'${options.linkExpiresAt ?? "2026-07-22 10:00:00+00"}',1,'2026-07-21 10:00:00+00','2026-07-21 10:00:00+00'
    );
    INSERT INTO saas.quick_order_link_items(
      id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,variant_name,
      unit_price_cents,quantity,line_total_cents,created_at
    ) VALUES(
      '${item}','${STORE}','${link}','${PRODUCT}','${variant}',0,'Runtime Product',
      ${variant === VARIANT_2 ? "'Untracked'" : "'Tracked'"},${price},${quantity},${total},'2026-07-21 10:00:00+00'
    );`, database);
  return { link, item, digest };
}

function claimLink(backend, database, linkFixture, number, options = {}) {
  const redemption = fixtureUuid("a", number);
  const cookieDigest = fixtureDigest(`cookie:${number}`);
  const result = functionResult(backend,
    `saas.quick_links_claim_redemption(${sqlLiteral(options.hostname ?? HOSTNAME)},'${linkFixture.digest}','${redemption}','${cookieDigest}',` +
      `'${options.now ?? "2026-07-21 12:10:00+00"}','${options.expiresAt ?? "2026-07-21 12:20:00+00"}')`, database);
  return { ...result, redemption, cookieDigest };
}

function beginAttempt(backend, database, claim, number, options = {}) {
  const attempt = fixtureUuid("b", number);
  const operation = fixtureUuid("c", number);
  const merchantOid = options.merchantOid ?? createHash("md5").update(`${TOKEN}:merchant:${number}`).digest("hex");
  const result = functionResult(backend,
    `saas.checkout_begin_attempt(${sqlLiteral(options.hostname ?? HOSTNAME)},'${claim.cookieDigest}','${attempt}',` +
      `'${merchantOid}','${operation}',repeat('${options.fingerprint ?? "1"}',64),'${options.now ?? "2026-07-21 12:11:00+00"}')`, database);
  return { ...result, attempt, operation, merchantOid };
}

function markAttemptProviderReady(backend, database, begun, number, options = {}) {
  const operation = options.operation ?? fixtureUuid("c", number);
  const result = functionResult(backend,
    `saas.checkout_mark_provider_ready('${begun.attempt}','${operation}',repeat('${options.fingerprint ?? "4"}',64),` +
      `${ENVELOPE},repeat('${options.tokenDigest ?? "5"}',64),'${options.now ?? "2026-07-21 12:12:00+00"}')`, database);
  return { ...result, operation };
}

function settleCallback(backend, database, begun, number, options = {}) {
  const status = options.status ?? "success";
  const callbackDigest = options.callbackDigest ?? fixtureDigest(`callback:${number}`);
  const operation = options.operation ?? fixtureUuid("d", number);
  const fingerprint = options.fingerprint ?? "6";
  const order = status === "success" ? (options.order ?? fixtureUuid("7", number)) : null;
  const orderItems = status === "success" ? (options.orderItems ?? [fixtureUuid("8", number)]) : null;
  const event = status === "success" ? (options.event ?? fixtureUuid("9", number)) : null;
  const expectedPaymentAmount = begun.payload?.paymentAmount ?? 10000;
  const paymentAmount = options.paymentAmount === undefined ? expectedPaymentAmount : options.paymentAmount;
  const totalAmount = options.totalAmount === undefined ? expectedPaymentAmount : options.totalAmount;
  const currency = options.currency === undefined ? "TRY" : options.currency;
  const paymentType = options.paymentType ?? "card";
  const testMode = options.testMode === undefined ? 1 : options.testMode;
  const failedReasonCode = options.failedReasonCode === undefined ? null : options.failedReasonCode;
  const failedReasonMessageDigest = options.failedReasonMessageDigest === undefined
    ? null
    : options.failedReasonMessageDigest;
  const sqlNullable = (value) => value === null ? "NULL" : sqlLiteral(value);
  const result = functionResult(backend,
    `saas.checkout_settle_callback('${begun.merchantOid}','${callbackDigest}','${operation}',repeat('${fingerprint}',64),` +
      `'${status}',${paymentAmount === null ? "NULL" : paymentAmount},${totalAmount === null ? "NULL" : totalAmount},` +
      `${sqlNullable(currency)},'${paymentType}',${testMode === null ? "NULL" : testMode},${sqlNullable(failedReasonCode)},` +
      `${sqlNullable(failedReasonMessageDigest)},${order === null ? "NULL" : sqlLiteral(order)},` +
      `${orderItems === null ? "NULL::uuid[]" : `ARRAY[${orderItems.map(sqlLiteral).join(",")}]::uuid[]`},` +
      `${event === null ? "NULL" : sqlLiteral(event)},${status === "success" ? sqlLiteral(options.orderNumber ?? `QO-${number}`) : "NULL"},` +
      `'${options.now ?? "2026-07-21 12:13:00+00"}')`, database);
  return { ...result, callbackDigest, operation, order, orderItems, event };
}

function claimReconciliation(backend, database, worker, now, leaseExpiresAt, limit = 25) {
  return functionResult(backend,
    `saas.checkout_claim_reconciliation('${worker}','${now}','${leaseExpiresAt}',${limit})`, database);
}

function beginReconciliationRun(backend, database, worker, now = "2026-07-21 12:10:00+00", leaseExpiresAt = "2026-07-21 12:11:00+00") {
  const runToken = createHash("sha256").update(`${TOKEN}:${database}:${worker}`).digest("base64url");
  const runTokenDigest = createHash("sha256").update(runToken).digest("hex");
  const result = functionResult(backend,
    `saas.checkout_begin_reconciliation_run('${worker}','${runTokenDigest}','${now}','${leaseExpiresAt}')`, database);
  return { ...result, runToken, runTokenDigest };
}

function applyReconciliationSuccess(backend, database, begun, claim, number, options = {}) {
  const operation = options.operation ?? fixtureUuid("d", number);
  const order = options.order ?? fixtureUuid("7", number);
  const orderItems = options.orderItems ?? [fixtureUuid("8", number)];
  const event = options.event ?? fixtureUuid("9", number);
  const expectedPaymentAmount = begun.payload?.paymentAmount ?? 10000;
  const result = functionResult(backend,
    `saas.checkout_apply_reconciliation_success('${begun.merchantOid}','${options.worker ?? claim.workerId}',` +
      `'${options.leaseToken ?? claim.leaseToken}','${operation}',repeat('${options.fingerprint ?? "7"}',64),` +
      `${options.paymentAmount ?? expectedPaymentAmount},${options.totalAmount ?? expectedPaymentAmount},${sqlLiteral(options.currency ?? "TRY")},` +
      `${options.testMode ?? 1},'${order}',ARRAY[${orderItems.map(sqlLiteral).join(",")}]::uuid[],'${event}',` +
      `${sqlLiteral(options.orderNumber ?? `QO-R-${number}`)},'${options.now ?? "2026-07-21 12:13:30+00"}')`, database);
  return { ...result, operation, order, orderItems, event };
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
    INSERT INTO saas.domains(id,store_id,normalized_hostname,domain_type,status,canonical,cache_version,created_at,updated_at) VALUES
      ('11000000-0000-4000-8000-000000000001','${STORE}','${HOSTNAME}','custom','active',true,1,'2026-01-01','2026-01-01');
    INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES
      ('12000000-0000-4000-8000-000000000001','${STORE}','${HOSTNAME}','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1),
      ('12000000-0000-4000-8000-000000000002','${STORE}','${ALIAS_HOSTNAME}','custom_domain','active',false,'2026-01-01','2026-01-01','2026-01-01',1);
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
      assert.deepEqual(manifest.artifacts.map((artifact)=>artifact.id),[
        "202607220026_quick_order_checkout_runtime_up",
        "202607220026_quick_order_checkout_runtime_down",
        "202607220026_quick_order_checkout_runtime_assertions",
        "202607220027_quick_order_checkout_api_up",
        "202607220027_quick_order_checkout_api_down",
        "202607220027_quick_order_checkout_api_assertions",
        "202607220028_quick_order_redemption_expiry_authority_up",
        "202607220028_quick_order_redemption_expiry_authority_down",
        "202607220028_quick_order_redemption_expiry_authority_assertions",
      ]);
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

    await scenario("migrations 027 and 028 checkout authority apply with exact role grants", async () => {
      apply(backend, "202607220027_quick_order_checkout_api.up.sql");
      apply(backend, "202607220027_quick_order_checkout_api_assertions.sql");
      apply(backend, "202607220028_quick_order_redemption_expiry_authority.up.sql");
      apply(backend, "202607220028_quick_order_redemption_expiry_authority_assertions.sql");
      assert.equal(psql(backend, "SELECT has_schema_privilege('celebix_saas_workflow','saas','USAGE');"), "t");
      const workflowFunctionCount = Number(psql(backend, "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND has_function_privilege('celebix_saas_workflow',p.oid,'EXECUTE');"));
      assert.equal(workflowFunctionCount,24);
      denied(backend,`SET ROLE celebix_saas_owner; INSERT INTO saas.checkout_operations(operation_id,store_id,attempt_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES ('${fixtureUuid("c",19)}','${STORE}','${ATTEMPT}','configure_provider',repeat('1',64),'{}','2026-07-21 12:01:00+00');`);
      denied(backend,`SET ROLE celebix_saas_owner; INSERT INTO saas.checkout_operations(operation_id,store_id,worker_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES ('${fixtureUuid("c",18)}',NULL,'${fixtureUuid("d",19)}','begin_attempt',repeat('1',64),'{}','2026-07-21 12:01:00+00');`);
    });

    await scenario("owner and admin configure rotate revoke and replace provider with exact replay", async () => {
      const database = cloneDatabase(backend, "provider_mutations");
      const adminPrincipal = fixtureUuid("2", 20);
      const adminMembership = fixtureUuid("3", 20);
      const editorPrincipal = fixtureUuid("2", 21);
      const editorMembership = fixtureUuid("3", 21);
      const analystPrincipal = fixtureUuid("2", 22);
      const analystMembership = fixtureUuid("3", 22);
      psql(backend, `SET ROLE celebix_saas_owner;
        INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
          ('${adminPrincipal}','https://identity.example.test/oidc','runtime-admin','admin@example.test',true,'2026-01-01','2026-01-01'),
          ('${editorPrincipal}','https://identity.example.test/oidc','runtime-editor','editor@example.test',true,'2026-01-01','2026-01-01'),
          ('${analystPrincipal}','https://identity.example.test/oidc','runtime-analyst','analyst@example.test',true,'2026-01-01','2026-01-01');
        INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
          ('${adminMembership}','${adminPrincipal}','${STORE}','admin','active','2026-01-01','2026-01-01'),
          ('${editorMembership}','${editorPrincipal}','${STORE}','editor','active','2026-01-01','2026-01-01'),
          ('${analystMembership}','${analystPrincipal}','${STORE}','analyst','active','2026-01-01','2026-01-01');`, database);
      const configure = `saas.quick_links_configure_provider(${merchantAuthority()},'2026-07-21 12:12:00+00','${PROVIDER}',2,repeat('e',64),'key-1',${ENVELOPE},'${fixtureUuid("c", 20)}',repeat('2',64))`;
      assert.equal(functionResult(backend, configure, database, "celebix_saas_app").outcome, "committed");
      assert.equal(functionResult(backend, configure, database, "celebix_saas_app").outcome, "operation_replayed");
      assert.equal(functionResult(backend,
        `saas.quick_links_recover_provider_operation(${merchantAuthority()},'2026-07-21 12:12:00+00','${PROVIDER}','${fixtureUuid("c",20)}','configure_provider',repeat('2',64))`,
        database,"celebix_saas_app").outcome,"operation_replayed");
      const providerRecoveryBytes=psql(backend,`SELECT count(*)||'|'||md5(string_agg(operation_id::text||result_payload::text,',' ORDER BY operation_id)) FROM saas.checkout_operations;`,database);
      assert.equal(psql(backend,`BEGIN READ ONLY; SET LOCAL ROLE celebix_saas_app; SELECT outcome FROM saas.quick_links_recover_provider_operation(${merchantAuthority()},'2026-07-21 12:12:00+00','${PROVIDER}','${fixtureUuid("c",20)}','configure_provider',repeat('2',64)); COMMIT;`,database).split("\n").at(-1),"operation_replayed");
      assert.equal(functionResult(backend,`saas.quick_links_recover_provider_operation(${merchantAuthority()},'2026-07-21 12:12:00+00','${PROVIDER}','${fixtureUuid("c",20)}','revoke_provider',repeat('2',64))`,database,"celebix_saas_app").outcome,"operation_mismatch");
      assert.equal(functionResult(backend,`saas.quick_links_recover_provider_operation(${merchantAuthority()},'2026-07-21 12:12:00+00','${fixtureUuid("5",99)}','${fixtureUuid("c",20)}','configure_provider',repeat('2',64))`,database,"celebix_saas_app").outcome,"not_found");
      assert.equal(functionResult(backend,`saas.quick_links_recover_provider_operation(${merchantAuthority()},'2026-07-21 12:12:00+00','${PROVIDER}','${fixtureUuid("c",20)}','configure_provider',repeat('0',64))`,database,"celebix_saas_app").outcome,"operation_mismatch");
      assert.equal(psql(backend,`SELECT count(*)||'|'||md5(string_agg(operation_id::text||result_payload::text,',' ORDER BY operation_id)) FROM saas.checkout_operations;`,database),providerRecoveryBytes);
      assert.equal(functionResult(backend, configure.replace("repeat('2',64)", "repeat('3',64)"), database, "celebix_saas_app").outcome, "operation_mismatch");
      const adminRotate = functionResult(backend,
        `saas.quick_links_configure_provider(${merchantAuthority(adminMembership, adminPrincipal)},'2026-07-21 12:12:01+00','${PROVIDER}',3,repeat('f',64),'key-1',${ENVELOPE},'${fixtureUuid("c", 21)}',repeat('4',64))`,
        database, "celebix_saas_app");
      assert.equal(adminRotate.outcome, "committed");
      const staleVersionBytes=psql(backend,`SELECT status||'|'||version||'|'||configuration_digest||'|'||updated_at::text||'|'||
        (SELECT count(*) FROM saas.checkout_provider_configs WHERE store_id='${STORE}' AND provider_key='paytr' AND status='active')||'|'||
        (SELECT count(*) FROM saas.checkout_operations) FROM saas.checkout_provider_configs WHERE id='${PROVIDER}';`,database);
      assert.equal(functionResult(backend,
        `saas.quick_links_configure_provider(${merchantAuthority()},'2026-07-21 12:12:02+00','${PROVIDER}',3,repeat('0',64),'key-1',${ENVELOPE},'${fixtureUuid("c",27)}',repeat('0',64))`,
        database,"celebix_saas_app").outcome,"version_conflict");
      assert.equal(psql(backend,`SELECT status||'|'||version||'|'||configuration_digest||'|'||updated_at::text||'|'||
        (SELECT count(*) FROM saas.checkout_provider_configs WHERE store_id='${STORE}' AND provider_key='paytr' AND status='active')||'|'||
        (SELECT count(*) FROM saas.checkout_operations) FROM saas.checkout_provider_configs WHERE id='${PROVIDER}';`,database),staleVersionBytes);
      assert.equal(functionResult(backend,
        `saas.quick_links_revoke_provider(${merchantAuthority()},'2026-07-21 12:12:02+00','${PROVIDER}',3,'${fixtureUuid("c",28)}',repeat('1',64))`,
        database,"celebix_saas_app").outcome,"version_conflict");
      assert.equal(psql(backend,`SELECT status||'|'||version||'|'||configuration_digest||'|'||updated_at::text||'|'||
        (SELECT count(*) FROM saas.checkout_provider_configs WHERE store_id='${STORE}' AND provider_key='paytr' AND status='active')||'|'||
        (SELECT count(*) FROM saas.checkout_operations) FROM saas.checkout_provider_configs WHERE id='${PROVIDER}';`,database),staleVersionBytes);
      const editorDenied = functionResult(backend,
        `saas.quick_links_configure_provider(${merchantAuthority(editorMembership, editorPrincipal)},'2026-07-21 12:12:02+00','${PROVIDER}',4,repeat('1',64),'key-1',${ENVELOPE},'${fixtureUuid("c", 22)}',repeat('5',64))`,
        database, "celebix_saas_app");
      assert.equal(editorDenied.outcome, "action_denied");
      assert.equal(functionResult(backend,
        `saas.quick_links_reveal_credential(${merchantAuthority(analystMembership,analystPrincipal)},'2026-07-21 12:12:02+00','${LINK}')`,
        database,"celebix_saas_app").outcome,"action_denied");
      assert.equal(functionResult(backend,
        `saas.quick_links_revoke_provider(${merchantAuthority(analystMembership,analystPrincipal)},'2026-07-21 12:12:02+00','${PROVIDER}',4,'${fixtureUuid("c",26)}',repeat('5',64))`,
        database,"celebix_saas_app").outcome,"action_denied");
      assert.equal(functionResult(backend,
        `saas.quick_links_revoke_provider(${merchantAuthority()},'2026-07-21 12:12:03+00','${PROVIDER}',4,'${fixtureUuid("c", 23)}',repeat('6',64))`,
        database, "celebix_saas_app").outcome, "committed");
      assert.equal(functionResult(backend,
        `saas.quick_links_recover_provider_operation(${merchantAuthority()},'2026-07-21 12:12:03+00','${PROVIDER}','${fixtureUuid("c",23)}','revoke_provider',repeat('6',64))`,
        database,"celebix_saas_app").outcome,"operation_replayed");
      const readiness = functionResult(backend,
        `saas.quick_links_get_provider_readiness(${merchantAuthority()},'2026-07-21 12:12:00+00')`,database,"celebix_saas_app");
      assert.equal(readiness.payload.status, "revoked");
      const replacement = fixtureUuid("5", 20);
      assert.equal(functionResult(backend,
        `saas.quick_links_configure_provider(${merchantAuthority()},'2026-07-21 12:12:04+00','${replacement}',0,repeat('7',64),'key-1',${ENVELOPE},'${fixtureUuid("c", 24)}',repeat('7',64))`,
        database,"celebix_saas_app").outcome,"committed");
      assert.equal(functionResult(backend,
        `saas.quick_links_configure_provider(${merchantAuthority()},'2026-07-21 12:12:05+00','${PROVIDER}',5,repeat('8',64),'key-1',${ENVELOPE},'${fixtureUuid("c", 25)}',repeat('8',64))`,
        database,"celebix_saas_app").outcome,"provider_revoked");
      // Reveal stays grouped with provider authority: it must never mint or mutate.
      const credential = functionResult(backend,
        `saas.quick_links_reveal_credential(${merchantAuthority()},'2026-07-21 12:12:00+00','${LINK}')`,DATABASE,"celebix_saas_app");
      assert.equal(credential.outcome,"found");
      assert.equal(credential.payload.storeId,STORE);
      assert.equal(credential.payload.linkId,LINK);
      assert.equal(credential.payload.canonicalHostname,HOSTNAME);
      assert.equal(credential.payload.tokenDigest,"a".repeat(64));
      assert.deepEqual(credential.payload.sealedToken,JSON.parse(ENVELOPE.match(/'([^']+)'::jsonb/)[1]));
      const provider = functionResult(backend,
        `saas.quick_links_reveal_provider_configuration(${merchantAuthority()},'2026-07-21 12:12:00+00','${PROVIDER}')`,DATABASE,"celebix_saas_app");
      assert.equal(provider.outcome,"found");
      assert.equal(provider.payload.storeId,STORE);
      assert.equal(provider.payload.providerConfigId,PROVIDER);
      assert.equal(provider.payload.configurationDigest,"d".repeat(64));
      assert.equal(psql(backend,"SELECT count(*) FROM saas.quick_order_links WHERE id='"+LINK+"';"),"1");
      assert.equal(psql(backend,"SELECT count(*) FROM saas.quick_order_link_operations;"),"0");

      const providerRaceDatabase=cloneDatabase(backend,"provider_namespace_race");
      const revokeWinner=openPsqlSession(backend,providerRaceDatabase,"provider_revoke_winner");
      const staleReplacement=openPsqlSession(backend,providerRaceDatabase,"provider_stale_replacement");
      const replacementId=fixtureUuid("5",299);
      try {
        const revokeWinnerResult=await revokeWinner.execute(`BEGIN; SET LOCAL ROLE celebix_saas_app;
          SELECT outcome FROM saas.quick_links_revoke_provider(${merchantAuthority()},'2026-07-21 12:20:00+00','${PROVIDER}',2,'${fixtureUuid("c",290)}',repeat('a',64));`);
        assert.equal(revokeWinnerResult.split("\n").at(-1),"committed");
        const staleReplacementResult=staleReplacement.execute(`SET ROLE celebix_saas_app;
          SELECT outcome FROM saas.quick_links_configure_provider(${merchantAuthority()},'2026-07-21 12:10:00+00','${replacementId}',0,repeat('b',64),'key-1',${ENVELOPE},'${fixtureUuid("c",291)}',repeat('b',64));`);
        await waitForBlockedSession(backend,providerRaceDatabase,staleReplacement.applicationName);
        await revokeWinner.execute("COMMIT;");
        assert.equal((await staleReplacementResult).split("\n").at(-1),"invalid_input");
        assert.equal(psql(backend,`SELECT count(*) FROM saas.checkout_provider_configs WHERE store_id='${STORE}' AND status='active';`,providerRaceDatabase),"0");
        assert.equal(psql(backend,`SELECT count(*) FROM saas.checkout_provider_configs WHERE id='${replacementId}';`,providerRaceDatabase),"0");
      } finally { await Promise.all([revokeWinner.close(),staleReplacement.close()]); }
    });

    await scenario("alias canonicalization precedes token lookup and primary claim opens exactly once", async () => {
      const database=cloneDatabase(backend,"claim_canonical");
      const link=seedCheckoutLink(backend,database,220);
      const aliasClaim=claimLink(backend,database,link,220,{hostname:ALIAS_HOSTNAME});
      assert.equal(aliasClaim.outcome,"canonicalize");
      assert.equal(aliasClaim.payload.canonicalHostname,HOSTNAME);
      assert.equal(psql(backend,`SELECT status||'|'||(SELECT count(*) FROM saas.quick_order_redemption_sessions WHERE quick_order_link_id='${link.link}') FROM saas.quick_order_links WHERE id='${link.link}';`,database),"active|0");
      assert.equal(functionResult(backend,`saas.quick_links_claim_redemption('${ALIAS_HOSTNAME}',repeat('0',64),'${fixtureUuid("a",222)}',repeat('1',64),'2026-07-21 12:10:00+00','2026-07-21 12:20:00+00')`,database).outcome,"canonicalize");
      const claimed=claimLink(backend,database,link,221);
      assert.equal(claimed.outcome,"claimed");
      assert.equal(claimed.payload.canonicalHostname,HOSTNAME);
      assert.equal(claimed.payload.quote.currency,"TRY");
      assert.equal(psql(backend,`SELECT status||'|'||version||'|'||(SELECT count(*) FROM saas.quick_order_redemption_sessions WHERE quick_order_link_id='${link.link}') FROM saas.quick_order_links WHERE id='${link.link}';`,database),"opened|2|1");
      assert.equal(claimLink(backend,database,link,223).outcome,"claimed");
      const expired=seedCheckoutLink(backend,database,224);
      psql(backend,`SET ROLE celebix_saas_owner; UPDATE saas.quick_order_links SET status='expired',version=2,updated_at='2026-07-21 12:00:00+00' WHERE id='${expired.link}';`,database);
      assert.equal(claimLink(backend,database,expired,224).outcome,"unavailable");
      const futureUpdated=seedCheckoutLink(backend,database,226);
      psql(backend,`SET ROLE celebix_saas_owner; UPDATE saas.quick_order_links SET version=2,updated_at='2026-07-21 12:11:00+00' WHERE id='${futureUpdated.link}';`,database);
      assert.equal(claimLink(backend,database,futureUpdated,226,{now:"2026-07-21 12:10:00+00"}).outcome,"invalid_input");
      const cancelled=seedCheckoutLink(backend,database,225);
      const cancelledClaim=claimLink(backend,database,cancelled,225);
      psql(backend,`SET ROLE celebix_saas_owner; UPDATE saas.quick_order_links SET status='cancelled',cancelled_at='2026-07-21 12:11:00+00',version=3,updated_at='2026-07-21 12:11:00+00' WHERE id='${cancelled.link}';`,database);
      assert.deepEqual(functionResult(backend,`saas.checkout_get_redemption_status('${HOSTNAME}','${cancelledClaim.cookieDigest}','2026-07-21 12:12:00+00')`,database).payload,{kind:"unavailable"});
    });

    await scenario("near-expiry claim atomically persists the link-bounded expiry under one row lock", async () => {
      const database=cloneDatabase(backend,"claim_near_expiry");
      const link=seedCheckoutLink(backend,database,228,{linkExpiresAt:"2026-07-21 14:00:00+00"});
      const claimed=claimLink(backend,database,link,228,{now:"2026-07-21 13:58:30+00",expiresAt:"2026-07-21 14:13:30+00"});
      assert.equal(claimed.outcome,"claimed");
      assert.equal(claimed.payload.redemptionExpiresAt,"2026-07-21T14:00:00.000000Z");
      assert.equal(psql(backend,`SELECT expires_at='2026-07-21 14:00:00+00' AND expires_at<='2026-07-21 14:13:30+00' FROM saas.quick_order_redemption_sessions WHERE id='${claimed.redemption}';`,database),"t");
      assert.equal(psql(backend,`SELECT status||'|'||version FROM saas.quick_order_links WHERE id='${link.link}';`,database),"opened|2");
      const up=readFileSync(path.join(SQL,"202607220028_quick_order_redemption_expiry_authority.up.sql"),"utf8");
      const down=readFileSync(path.join(SQL,"202607220028_quick_order_redemption_expiry_authority.down.sql"),"utf8");
      const migration027=readFileSync(path.join(SQL,"202607220027_quick_order_checkout_api.up.sql"),"utf8");
      assert.match(normalizedFunction(up,"quick_links_claim_redemption"),/effective_expires_at:=LEAST\(p_expires_at,current_link.expires_at\)/);
      assert.equal(normalizedFunction(down,"quick_links_claim_redemption"),normalizedFunction(migration027,"quick_links_claim_redemption"));
    });

    await scenario("redemption resolution is cookie digest store and canonical-host isolated", async () => {
      const database=cloneDatabase(backend,"resolve_isolation");
      const link=seedCheckoutLink(backend,database,230);
      const claimed=claimLink(backend,database,link,230);
      assert.equal(claimed.outcome,"claimed");
      assert.equal(functionResult(backend,`saas.quick_links_resolve_redemption('${HOSTNAME}','${claimed.cookieDigest}','2026-07-21 12:12:00+00')`,database).outcome,"found");
      assert.equal(functionResult(backend,`saas.quick_links_resolve_redemption('${ALIAS_HOSTNAME}','${claimed.cookieDigest}','2026-07-21 12:12:00+00')`,database).outcome,"not_found");
      assert.equal(functionResult(backend,`saas.quick_links_resolve_redemption('${HOSTNAME}',repeat('0',64),'2026-07-21 12:12:00+00')`,database).outcome,"not_found");
      assert.equal(functionResult(backend,`saas.quick_links_resolve_redemption('wrong.example.test','${claimed.cookieDigest}','2026-07-21 12:12:00+00')`,database).outcome,"not_found");
      assert.equal(psql(backend,`SELECT cookie_digest='${claimed.cookieDigest}' FROM saas.quick_order_redemption_sessions WHERE id='${claimed.redemption}';`,database),"t");
      assert.equal(psql(backend,"SELECT string_agg(attname,',' ORDER BY attnum) FROM pg_attribute WHERE attrelid='saas.quick_order_redemption_sessions'::regclass AND attnum>0 AND NOT attisdropped;",database).includes("token"),false);
      psql(backend,`SET ROLE celebix_saas_owner; UPDATE saas.stores SET status='suspended',updated_at='2026-07-21 12:13:00+00' WHERE id='${STORE}';`,database);
      assert.equal(functionResult(backend,`saas.quick_links_resolve_redemption('${HOSTNAME}','${claimed.cookieDigest}','2026-07-21 12:14:00+00')`,database).outcome,"not_found");
      const suspendedBegin=beginAttempt(backend,database,claimed,231,{now:"2026-07-21 12:14:00+00"});
      assert.equal(suspendedBegin.outcome,"unavailable");
      assert.equal(psql(backend,`SELECT count(*) FROM saas.checkout_payment_attempts WHERE id='${suspendedBegin.attempt}';`,database),"0");
    });

    await scenario("redemption revocation is exact-host idempotent and never a cross-host operation oracle", async () => {
      const database=cloneDatabase(backend,"revoke_redemption");
      const link=seedCheckoutLink(backend,database,240);
      const claimed=claimLink(backend,database,link,240);
      const operation=fixtureUuid("c",240);
      const expression=`saas.quick_links_revoke_redemption('${HOSTNAME}','${claimed.cookieDigest}','${operation}',repeat('a',64),'2026-07-21 12:13:00+00')`;
      assert.equal(functionResult(backend,expression,database).outcome,"committed");
      assert.equal(functionResult(backend,expression,database).outcome,"operation_replayed");
      assert.equal(functionResult(backend,`saas.quick_links_recover_redemption_revoke('${HOSTNAME}','${claimed.cookieDigest}','${operation}',repeat('a',64),'2026-07-21 12:13:00+00')`,database).outcome,"operation_replayed");
      const revokeRecoveryBytes=psql(backend,`SELECT count(*)||'|'||md5(string_agg(operation_id::text||result_payload::text,',' ORDER BY operation_id)) FROM saas.checkout_operations;`,database);
      assert.equal(psql(backend,`BEGIN READ ONLY; SET LOCAL ROLE celebix_saas_workflow; SELECT outcome FROM saas.quick_links_recover_redemption_revoke('${HOSTNAME}','${claimed.cookieDigest}','${operation}',repeat('a',64),'2026-07-21 12:13:00+00'); COMMIT;`,database).split("\n").at(-1),"operation_replayed");
      assert.equal(functionResult(backend,`saas.quick_links_recover_redemption_revoke('${ALIAS_HOSTNAME}','${claimed.cookieDigest}','${operation}',repeat('a',64),'2026-07-21 12:13:00+00')`,database).outcome,"not_found");
      assert.equal(functionResult(backend,`saas.quick_links_recover_redemption_revoke('${HOSTNAME}','${claimed.cookieDigest}','${operation}',repeat('0',64),'2026-07-21 12:13:00+00')`,database).outcome,"operation_mismatch");
      assert.equal(functionResult(backend,`saas.quick_links_recover_redemption_revoke('${HOSTNAME}',repeat('0',64),'${operation}',repeat('a',64),'2026-07-21 12:13:00+00')`,database).outcome,"not_found");
      assert.equal(psql(backend,`SELECT count(*)||'|'||md5(string_agg(operation_id::text||result_payload::text,',' ORDER BY operation_id)) FROM saas.checkout_operations;`,database),revokeRecoveryBytes);
      assert.equal(functionResult(backend,expression.replace(HOSTNAME,ALIAS_HOSTNAME),database).outcome,"not_found");
      assert.equal(functionResult(backend,`saas.quick_links_resolve_redemption('${HOSTNAME}','${claimed.cookieDigest}','2026-07-21 12:14:00+00')`,database).outcome,"not_found");
      assert.equal(psql(backend,`SELECT revoked_at IS NOT NULL AND consumed_at IS NULL FROM saas.quick_order_redemption_sessions WHERE id='${claimed.redemption}';`,database),"t");
      const staleLink=seedCheckoutLink(backend,database,241);
      const staleClaim=claimLink(backend,database,staleLink,241);
      psql(backend,`SET ROLE celebix_saas_owner; UPDATE saas.quick_order_redemption_sessions SET version=2,updated_at='2026-07-21 12:14:00+00' WHERE id='${staleClaim.redemption}';`,database);
      const staleRevokeOperation=fixtureUuid("c",241);
      assert.equal(functionResult(backend,`saas.quick_links_revoke_redemption('${HOSTNAME}','${staleClaim.cookieDigest}','${staleRevokeOperation}',repeat('b',64),'2026-07-21 12:13:00+00')`,database).outcome,"invalid_input");
      assert.equal(psql(backend,`SELECT revoked_at IS NULL FROM saas.quick_order_redemption_sessions WHERE id='${staleClaim.redemption}';`,database),"t");
      assert.equal(psql(backend,`SELECT count(*) FROM saas.checkout_operations WHERE operation_id='${staleRevokeOperation}';`,database),"0");
    });

    await scenario("begin attempt returns exact persisted PayTR snapshot and creates deterministic holds", async () => {
      const database=cloneDatabase(backend,"begin_happy");
      const link=seedCheckoutLink(backend,database,250);
      const claimed=claimLink(backend,database,link,250);
      const readyStatus=functionResult(backend,`saas.checkout_get_redemption_status('${HOSTNAME}','${claimed.cookieDigest}','2026-07-21 12:10:30+00')`,database);
      assert.equal(readyStatus.outcome,"found");
      assert.deepEqual(Object.keys(readyStatus.payload).sort(),["kind","quote"]);
      assert.equal(readyStatus.payload.kind,"ready");
      const begun=beginAttempt(backend,database,claimed,250);
      assert.equal(begun.outcome,"committed");
      assert.equal(begun.payload.currency,"TRY");
      assert.equal(begun.payload.paymentAmount,10000);
      assert.equal(begun.payload.customerEmail,"ada@example.test");
      assert.equal(begun.payload.providerConfigVersion,2);
      assert.equal(begun.payload.configurationDigest,"d".repeat(64));
      assert.equal(begun.payload.basket.length,1);
      const processingStatus=functionResult(backend,`saas.checkout_get_redemption_status('${HOSTNAME}','${claimed.cookieDigest}','2026-07-21 12:11:30+00')`,database);
      assert.deepEqual(processingStatus.payload,{kind:"processing"});
      assert.equal(psql(backend,`SELECT status||'|'||currency||'|'||(hold_expires_at-created_at)||'|'||(SELECT count(*) FROM saas.checkout_inventory_reservations WHERE attempt_id='${begun.attempt}' AND status='held') FROM saas.checkout_payment_attempts WHERE id='${begun.attempt}';`,database),"reserved|TRY|00:05:00|1");
      assert.equal(beginAttempt(backend,database,claimed,250).outcome,"operation_replayed");

      const staleProviderDatabase=cloneDatabase(backend,"begin_stale_provider");
      const staleProviderLink=seedCheckoutLink(backend,staleProviderDatabase,252);
      const staleProviderClaim=claimLink(backend,staleProviderDatabase,staleProviderLink,252);
      assert.equal(functionResult(backend,`saas.quick_links_configure_provider(${merchantAuthority()},'2026-07-21 12:12:00+00','${PROVIDER}',2,repeat('7',64),'key-1',${ENVELOPE},'${fixtureUuid("c",253)}',repeat('7',64))`,staleProviderDatabase,"celebix_saas_app").outcome,"committed");
      const staleProviderBegin=beginAttempt(backend,staleProviderDatabase,staleProviderClaim,252,{now:"2026-07-21 12:11:00+00"});
      assert.equal(staleProviderBegin.outcome,"invalid_input");
      assert.equal(psql(backend,`SELECT count(*) FROM saas.checkout_payment_attempts WHERE id='${staleProviderBegin.attempt}';`,staleProviderDatabase),"0");

      const staleCatalogDatabase=cloneDatabase(backend,"begin_stale_catalog");
      const staleCatalogLink=seedCheckoutLink(backend,staleCatalogDatabase,254,{variant:VARIANT_2});
      const staleCatalogClaim=claimLink(backend,staleCatalogDatabase,staleCatalogLink,254);
      psql(backend,`SET ROLE celebix_saas_owner; UPDATE saas.product_variants SET version=version+1,updated_at='2026-07-21 12:12:00+00' WHERE id='${VARIANT_2}';`,staleCatalogDatabase);
      const staleCatalogBegin=beginAttempt(backend,staleCatalogDatabase,staleCatalogClaim,254,{now:"2026-07-21 12:11:00+00"});
      assert.equal(staleCatalogBegin.outcome,"invalid_input");
      assert.equal(psql(backend,`SELECT count(*) FROM saas.checkout_payment_attempts WHERE id='${staleCatalogBegin.attempt}';`,staleCatalogDatabase),"0");
    });

    await scenario("persisted PayTR customer basket and money bounds fail before reservation", async () => {
      const database=cloneDatabase(backend,"begin_bounds");
      const longLink=seedCheckoutLink(backend,database,260,{customerName:"x".repeat(61)});
      const longClaim=claimLink(backend,database,longLink,260);
      const result=beginAttempt(backend,database,longClaim,260);
      assert.equal(result.outcome,"unavailable");
      assert.equal(psql(backend,`SELECT count(*) FROM saas.checkout_payment_attempts WHERE id='${result.attempt}';`,database),"0");
      const zeroLink=seedCheckoutLink(backend,database,261);
      psql(backend,`SET ROLE celebix_saas_owner; UPDATE saas.quick_order_link_items SET unit_price_cents=0,line_total_cents=0 WHERE quick_order_link_id='${zeroLink.link}'; UPDATE saas.quick_order_links SET subtotal_cents=0,total_cents=0 WHERE id='${zeroLink.link}';`,database);
      const zeroClaim=claimLink(backend,database,zeroLink,261);
      const zeroResult=beginAttempt(backend,database,zeroClaim,261);
      assert.equal(zeroResult.outcome,"invalid_input");
      assert.equal(psql(backend,`SELECT count(*) FROM saas.checkout_inventory_reservations WHERE attempt_id='${zeroResult.attempt}';`,database),"0");

      const invalidFixtures = [
        { number:262, options:{email:"ada@örnek.test"}, expected:"unavailable" },
        { number:263, options:{phone:"PAYTR-PHONE"}, expected:"unavailable" },
      ];
      for (const invalidFixture of invalidFixtures) {
        const fixture=seedCheckoutLink(backend,database,invalidFixture.number,invalidFixture.options);
        const claim=claimLink(backend,database,fixture,invalidFixture.number);
        const rejected=beginAttempt(backend,database,claim,invalidFixture.number);
        assert.equal(rejected.outcome,invalidFixture.expected);
        assert.equal(psql(backend,`SELECT count(*) FROM saas.checkout_payment_attempts WHERE id='${rejected.attempt}';`,database),"0");
      }

      const addressLink=seedCheckoutLink(backend,database,264);
      psql(backend,`SET ROLE celebix_saas_owner; UPDATE saas.quick_order_links SET shipping_address=jsonb_build_object(
        'recipientName','Ada','phone','+905551110000','line1',repeat('a',200),'line2',repeat('b',200),'city','Istanbul','country','TR'
      ) WHERE id='${addressLink.link}';`,database);
      const addressClaim=claimLink(backend,database,addressLink,264);
      assert.equal(beginAttempt(backend,database,addressClaim,264).outcome,"unavailable");

      const cardinalityLink=seedCheckoutLink(backend,database,265);
      const extraItems=Array.from({length:100},(_,index)=>`(
        '${fixtureUuid("8",265000+index)}','${STORE}','${cardinalityLink.link}','${PRODUCT}','${VARIANT_2}',${index+1},
        'Runtime Product ${index+1}','Untracked',11000,1,11000,'2026-07-21 10:00:00+00')`).join(",");
      psql(backend,`SET ROLE celebix_saas_owner;
        ALTER TABLE saas.quick_order_link_items DROP CONSTRAINT quick_order_link_items_position_check;
        INSERT INTO saas.quick_order_link_items(id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,variant_name,unit_price_cents,quantity,line_total_cents,created_at) VALUES ${extraItems};
        UPDATE saas.quick_order_links SET subtotal_cents=1110000,total_cents=1110000 WHERE id='${cardinalityLink.link}';`,database);
      const cardinalityClaim=claimLink(backend,database,cardinalityLink,265);
      assert.equal(beginAttempt(backend,database,cardinalityClaim,265).outcome,"invalid_input");

      const historicalBounds=seedCheckoutLink(backend,database,266);
      psql(backend,`SET ROLE celebix_saas_owner;
        ALTER TABLE saas.quick_order_link_items DROP CONSTRAINT quick_order_link_items_product_name_check;
        ALTER TABLE saas.quick_order_link_items DROP CONSTRAINT quick_order_link_items_quantity_check;
        ALTER TABLE saas.quick_order_link_items DROP CONSTRAINT quick_order_link_items_unit_price_check;
        ALTER TABLE saas.quick_order_link_items DROP CONSTRAINT quick_order_link_items_line_total_check;
        UPDATE saas.quick_order_link_items SET product_name=repeat('x',201),unit_price_cents=8000000001,quantity=10000,
          line_total_cents=80000000010000 WHERE quick_order_link_id='${historicalBounds.link}';
        UPDATE saas.quick_order_links SET subtotal_cents=80000000010000,total_cents=80000000010000 WHERE id='${historicalBounds.link}';`,database);
      const historicalBoundsClaim=claimLink(backend,database,historicalBounds,266);
      assert.equal(beginAttempt(backend,database,historicalBoundsClaim,266).outcome,"invalid_input");

      const basketLink=seedCheckoutLink(backend,database,267);
      const basketItems=Array.from({length:99},(_,index)=>`(
        '${fixtureUuid("8",267000+index)}','${STORE}','${basketLink.link}','${PRODUCT}','${VARIANT_2}',${index+1},
        repeat('😀',200),'Untracked',11000,1,11000,'2026-07-21 10:00:00+00')`).join(",");
      psql(backend,`SET ROLE celebix_saas_owner;
        INSERT INTO saas.quick_order_link_items(id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,variant_name,unit_price_cents,quantity,line_total_cents,created_at) VALUES ${basketItems};
        UPDATE saas.quick_order_links SET subtotal_cents=1100000,total_cents=1100000 WHERE id='${basketLink.link}';`,database);
      const basketClaim=claimLink(backend,database,basketLink,267);
      assert.equal(beginAttempt(backend,database,basketClaim,267).outcome,"invalid_input");

      const nonTryDatabase=cloneDatabase(backend,"historical_non_try_api");
      psql(backend,`ALTER TABLE saas.quick_order_links DISABLE TRIGGER ALL;
        ALTER TABLE saas.quick_order_links DROP CONSTRAINT quick_order_links_currency_check;
        UPDATE saas.quick_order_links SET currency='USD' WHERE id='${LINK}';
        ALTER TABLE saas.quick_order_links ENABLE TRIGGER ALL;`,nonTryDatabase);
      assert.equal(functionResult(backend,
        `saas.quick_links_reveal_credential(${merchantAuthority()},'2026-07-21 12:12:00+00','${LINK}')`,
        nonTryDatabase,"celebix_saas_app").outcome,"quick_link_not_found");
      assert.equal(functionResult(backend,
        `saas.quick_links_claim_redemption('${HOSTNAME}',repeat('a',64),'${fixtureUuid("a",268)}',repeat('b',64),'2026-07-21 12:12:00+00','2026-07-21 12:20:00+00')`,
        nonTryDatabase).outcome,"unavailable");
      assert.equal(functionResult(backend,
        `saas.quick_links_duplicate(${merchantAuthority()},'2026-07-21 12:12:00+00','${LINK}','${fixtureUuid("6",268)}',ARRAY['${fixtureUuid("8",268)}']::uuid[],repeat('c',64),'key-1',${ENVELOPE},'${fixtureUuid("9",268)}',repeat('d',64))`,
        nonTryDatabase,"celebix_saas_app").outcome,"invalid_input");
      psql(backend,`ALTER TABLE saas.stores DISABLE TRIGGER ALL;
        ALTER TABLE saas.stores DROP CONSTRAINT stores_currency_check;
        UPDATE saas.stores SET currency='USD' WHERE id='${STORE}';
        ALTER TABLE saas.stores ENABLE TRIGGER ALL;`,nonTryDatabase);
      assert.equal(functionResult(backend,
        `saas.quick_links_create(${merchantAuthority()},'2026-07-21 12:12:00+00','${fixtureUuid("6",269)}',ARRAY['${fixtureUuid("8",269)}']::uuid[],ARRAY['${VARIANT}']::uuid[],ARRAY[1]::bigint[],'${PROVIDER}','Ada','ada@example.test','+905551110000',${ADDRESS},${ADDRESS},NULL,'non-try',0,0,24,repeat('e',64),'key-1',${ENVELOPE},'${fixtureUuid("9",269)}',repeat('f',64))`,
        nonTryDatabase,"celebix_saas_app").outcome,"invalid_input");
      assert.equal(psql(backend,`SELECT count(*) FROM saas.quick_order_links WHERE id IN ('${fixtureUuid("6",268)}','${fixtureUuid("6",269)}');`,nonTryDatabase),"0");
    });

    await scenario("merchant oid collision and one-live-attempt rule are controlled no-mutation outcomes", async () => {
      const database=cloneDatabase(backend,"attempt_collision");
      const firstLink=seedCheckoutLink(backend,database,270);
      const firstClaim=claimLink(backend,database,firstLink,270);
      const first=beginAttempt(backend,database,firstClaim,270);
      assert.equal(first.outcome,"committed");
      const secondLink=seedCheckoutLink(backend,database,271);
      const secondClaim=claimLink(backend,database,secondLink,271);
      const collision=beginAttempt(backend,database,secondClaim,271,{merchantOid:first.merchantOid});
      assert.equal(collision.outcome,"merchant_oid_conflict");
      assert.equal(psql(backend,`SELECT count(*) FROM saas.checkout_payment_attempts WHERE id='${collision.attempt}';`,database),"0");
      const another=beginAttempt(backend,database,firstClaim,272);
      assert.equal(another.outcome,"attempt_in_progress");
      assert.equal(psql(backend,`SELECT count(*) FROM saas.checkout_payment_attempts WHERE quick_order_link_id='${firstLink.link}';`,database),"1");

      const raceLinkA=seedCheckoutLink(backend,database,273);
      const raceClaimA=claimLink(backend,database,raceLinkA,273);
      const raceLinkB=seedCheckoutLink(backend,database,274);
      const raceClaimB=claimLink(backend,database,raceLinkB,274);
      const sharedMerchantOid=createHash("md5").update(`${TOKEN}:merchant:shared-race`).digest("hex");
      const firstRace=openPsqlSession(backend,database,"merchant_oid_first");
      const secondRace=openPsqlSession(backend,database,"merchant_oid_second");
      try {
        const firstRaceResult=await firstRace.execute(`BEGIN; SET LOCAL ROLE celebix_saas_workflow;
          SELECT outcome FROM saas.checkout_begin_attempt('${HOSTNAME}','${raceClaimA.cookieDigest}','${fixtureUuid("b",273)}','${sharedMerchantOid}','${fixtureUuid("c",273)}',repeat('3',64),'2026-07-21 12:11:00+00');`);
        assert.equal(firstRaceResult.split("\n").at(-1),"committed");
        const secondRaceResult=secondRace.execute(`SET ROLE celebix_saas_workflow;
          SELECT outcome FROM saas.checkout_begin_attempt('${HOSTNAME}','${raceClaimB.cookieDigest}','${fixtureUuid("b",274)}','${sharedMerchantOid}','${fixtureUuid("c",274)}',repeat('4',64),'2026-07-21 12:11:00+00');`);
        await waitForBlockedSession(backend,database,secondRace.applicationName);
        await firstRace.execute("COMMIT;");
        assert.equal((await secondRaceResult).split("\n").at(-1),"merchant_oid_conflict");
        assert.equal(psql(backend,`SELECT count(*) FROM saas.checkout_payment_attempts WHERE merchant_oid='${sharedMerchantOid}';`,database),"1");
      } finally { await Promise.all([firstRace.close(),secondRace.close()]); }
    });

    await scenario("aggregate tracked availability and untracked lifecycle rows remain distinct", async () => {
      const database=cloneDatabase(backend,"stock_semantics");
      const tooMany=seedCheckoutLink(backend,database,280,{quantity:5});
      const tooManyClaim=claimLink(backend,database,tooMany,280);
      assert.equal(beginAttempt(backend,database,tooManyClaim,280).outcome,"stock_unavailable");
      const untracked=seedCheckoutLink(backend,database,281,{quantity:999,variant:VARIANT_2});
      const untrackedClaim=claimLink(backend,database,untracked,281);
      const begun=beginAttempt(backend,database,untrackedClaim,281);
      assert.equal(begun.outcome,"committed");
      assert.equal(psql(backend,`SELECT stock_tracked||'|'||quantity FROM saas.checkout_inventory_reservations WHERE attempt_id='${begun.attempt}';`,database),"false|999");
      assert.equal(psql(backend,`SELECT stock_quantity FROM saas.product_variants WHERE id='${VARIANT_2}';`,database),"0");
      const toggle=psqlResult(backend,`SET ROLE celebix_saas_owner; UPDATE saas.product_variants SET stock_tracking=true,version=version+1,updated_at='2026-07-21 12:12:00+00' WHERE id='${VARIANT_2}';`,database,{allowFailure:true});
      assert.notEqual(toggle.status,0); assert.match(toggle.stderr,/CATALOG_VARIANT_HAS_HELD_CHECKOUT_RESERVATION/);
      // Catalog interlocks are part of the same tracked/untracked authority scenario.
      {
      const database=cloneDatabase(backend,"catalog_interlock_api");
      const link=seedCheckoutLink(backend,database,290);
      psql(backend,`SET ROLE celebix_saas_owner;
        UPDATE saas.quick_order_link_items SET variant_id='${VARIANT_2}' WHERE quick_order_link_id='${link.link}';
        UPDATE saas.product_variants SET status='archived',archived_at='2026-07-21 12:00:00+00',version=version+1,updated_at='2026-07-21 12:00:00+00' WHERE id='${VARIANT_2}';`,database);
      const claimed=claimLink(backend,database,link,290);
      assert.equal(beginAttempt(backend,database,claimed,290).outcome,"catalog_item_unavailable");
      const source=psql(backend,"SELECT prosrc FROM pg_proc WHERE oid='saas.checkout_begin_attempt(text,text,uuid,text,uuid,text,timestamptz)'::regprocedure;",database);
      assert.ok(source.indexOf("FOR UPDATE OF link")<source.indexOf("ORDER BY product.id,variant.id FOR UPDATE"));
      assert.match(source,/sum\(reservation\.quantity\)/);
      }
    });

    await scenario("attempt keeps immutable provider snapshot across later rotation and revocation", async () => {
      const database=cloneDatabase(backend,"provider_snapshot");
      const link=seedCheckoutLink(backend,database,300);
      const claimed=claimLink(backend,database,link,300);
      const begun=beginAttempt(backend,database,claimed,300);
      const other=seedCheckoutLink(backend,database,301,{provider:PROVIDER});
      const otherClaim=claimLink(backend,database,other,301);
      assert.equal(begun.outcome,"committed");
      assert.equal(functionResult(backend,`saas.quick_links_configure_provider(${merchantAuthority()},'2026-07-21 12:12:00+00','${PROVIDER}',2,repeat('9',64),'key-1',${ENVELOPE},'${fixtureUuid("c",303)}',repeat('9',64))`,database,"celebix_saas_app").outcome,"committed");
      assert.equal(functionResult(backend,`saas.quick_links_revoke_provider(${merchantAuthority()},'2026-07-21 12:12:01+00','${PROVIDER}',3,'${fixtureUuid("c",304)}',repeat('8',64))`,database,"celebix_saas_app").outcome,"committed");
      assert.equal(psql(backend,`SELECT provider_config_version||'|'||configuration_digest||'|'||configuration_key_id FROM saas.checkout_payment_attempts WHERE id='${begun.attempt}';`,database),`2|${"d".repeat(64)}|key-1`);
      assert.equal(beginAttempt(backend,database,otherClaim,301).outcome,"provider_not_ready");
    });

    await scenario("concurrent initiation serializes on the link with one winner and no oversell", async () => {
      const database=cloneDatabase(backend,"concurrent_begin");
      const link=seedCheckoutLink(backend,database,310);
      const claimed=claimLink(backend,database,link,310);
      const first=openPsqlSession(backend,database,"checkout_begin_first");
      const second=openPsqlSession(backend,database,"checkout_begin_second");
      const attempt1=fixtureUuid("b",310),attempt2=fixtureUuid("b",311);
      try {
        await first.execute(`BEGIN; SET ROLE celebix_saas_owner; SELECT id FROM saas.quick_order_links WHERE id='${link.link}' FOR UPDATE;`);
        const secondResult=second.execute(`SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.checkout_begin_attempt('${HOSTNAME}','${claimed.cookieDigest}','${attempt2}','${createHash("md5").update("second").digest("hex")}','${fixtureUuid("c",311)}',repeat('2',64),'2026-07-21 12:11:00+00');`);
        await waitForBlockedSession(backend,database,second.applicationName);
        const firstResult=first.execute(`SET LOCAL ROLE celebix_saas_workflow; SELECT outcome FROM saas.checkout_begin_attempt('${HOSTNAME}','${claimed.cookieDigest}','${attempt1}','${createHash("md5").update("first").digest("hex")}','${fixtureUuid("c",310)}',repeat('1',64),'2026-07-21 12:11:00+00'); COMMIT;`);
        assert.equal((await firstResult).split("\n").at(-1),"committed");
        assert.equal((await secondResult).split("\n").at(-1),"attempt_in_progress");
        assert.equal(psql(backend,`SELECT count(*)||'|'||(SELECT count(*) FROM saas.checkout_inventory_reservations WHERE quick_order_link_id='${link.link}' AND status='held') FROM saas.checkout_payment_attempts WHERE quick_order_link_id='${link.link}';`,database),"1|1");
      } finally { await Promise.all([first.close(),second.close()]); }

      const revokedLink=seedCheckoutLink(backend,database,312);
      const revokedClaim=claimLink(backend,database,revokedLink,312);
      const revoker=openPsqlSession(backend,database,"checkout_revoke_first");
      const blockedBegin=openPsqlSession(backend,database,"checkout_begin_after_revoke");
      try {
        await revoker.execute(`BEGIN; SET ROLE celebix_saas_owner;
          SELECT id FROM saas.quick_order_links WHERE id='${revokedLink.link}' FOR UPDATE;
          SELECT id FROM saas.quick_order_redemption_sessions WHERE id='${revokedClaim.redemption}' FOR UPDATE;`);
        const blockedResult=blockedBegin.execute(`SET ROLE celebix_saas_workflow; SELECT outcome FROM saas.checkout_begin_attempt(
          '${HOSTNAME}','${revokedClaim.cookieDigest}','${fixtureUuid("b",312)}','${createHash("md5").update("revoked-race").digest("hex")}',
          '${fixtureUuid("c",312)}',repeat('3',64),'2026-07-21 12:11:00+00');`);
        await waitForBlockedSession(backend,database,blockedBegin.applicationName);
        await revoker.execute(`UPDATE saas.quick_order_redemption_sessions SET revoked_at='2026-07-21 12:10:30+00',version=version+1,updated_at='2026-07-21 12:10:30+00' WHERE id='${revokedClaim.redemption}'; COMMIT;`);
        assert.equal((await blockedResult).split("\n").at(-1),"unavailable");
        assert.equal(psql(backend,`SELECT count(*) FROM saas.checkout_payment_attempts WHERE id='${fixtureUuid("b",312)}';`,database),"0");
      } finally { await Promise.all([revoker.close(),blockedBegin.close()]); }

      const begunFirstLink=seedCheckoutLink(backend,database,313);
      const begunFirstClaim=claimLink(backend,database,begunFirstLink,313);
      const beginWinner=openPsqlSession(backend,database,"checkout_begin_before_revoke");
      const blockedRevoke=openPsqlSession(backend,database,"checkout_revoke_after_begin");
      try {
        const beginWinnerResult=await beginWinner.execute(`BEGIN; SET LOCAL ROLE celebix_saas_workflow;
          SELECT outcome FROM saas.checkout_begin_attempt('${HOSTNAME}','${begunFirstClaim.cookieDigest}','${fixtureUuid("b",313)}','${createHash("md5").update("begin-first-race").digest("hex")}','${fixtureUuid("c",313)}',repeat('4',64),'2026-07-21 12:11:00+00');`);
        assert.equal(beginWinnerResult.split("\n").at(-1),"committed");
        const blockedRevokeResult=blockedRevoke.execute(`SET ROLE celebix_saas_workflow;
          SELECT outcome FROM saas.quick_links_revoke_redemption('${HOSTNAME}','${begunFirstClaim.cookieDigest}','${fixtureUuid("c",314)}',repeat('5',64),'2026-07-21 12:12:00+00');`);
        await waitForBlockedSession(backend,database,blockedRevoke.applicationName);
        await beginWinner.execute("COMMIT;");
        assert.equal((await blockedRevokeResult).split("\n").at(-1),"unavailable");
        assert.equal(psql(backend,`SELECT revoked_at IS NULL FROM saas.quick_order_redemption_sessions WHERE id='${begunFirstClaim.redemption}';`,database),"t");
      } finally { await Promise.all([beginWinner.close(),blockedRevoke.close()]); }

      const authorityRaceLink=seedCheckoutLink(backend,database,315);
      const authorityLocker=openPsqlSession(backend,database,"checkout_authority_suspender");
      const blockedClaim=openPsqlSession(backend,database,"checkout_claim_after_suspend");
      const authorityRedemption=fixtureUuid("a",315);
      try {
        await authorityLocker.execute(`BEGIN; SET ROLE celebix_saas_owner;
          SELECT id FROM saas.quick_order_links WHERE id='${authorityRaceLink.link}' FOR UPDATE;`);
        const blockedClaimResult=blockedClaim.execute(`SET ROLE celebix_saas_workflow;
          SELECT outcome FROM saas.quick_links_claim_redemption('${HOSTNAME}','${authorityRaceLink.digest}','${authorityRedemption}',repeat('6',64),'2026-07-21 12:10:00+00','2026-07-21 12:20:00+00');`);
        await waitForBlockedSession(backend,database,blockedClaim.applicationName);
        await authorityLocker.execute(`UPDATE saas.stores SET status='suspended',updated_at='2026-07-21 12:09:00+00' WHERE id='${STORE}'; COMMIT;`);
        assert.equal((await blockedClaimResult).split("\n").at(-1),"unavailable");
        assert.equal(psql(backend,`SELECT count(*) FROM saas.quick_order_redemption_sessions WHERE id='${authorityRedemption}';`,database),"0");
      } finally { await Promise.all([authorityLocker.close(),blockedClaim.close()]); }
    });

    await scenario("provider-ready replay presentation and recovery preserve exact sealed token authority", async () => {
      const database=cloneDatabase(backend,"provider_ready_api");
      const link=seedCheckoutLink(backend,database,320);
      const claimed=claimLink(backend,database,link,320);
      const begun=beginAttempt(backend,database,claimed,320);
      const operation=fixtureUuid("c",321);
      const expression=`saas.checkout_mark_provider_ready('${begun.attempt}','${operation}',repeat('3',64),${ENVELOPE},repeat('4',64),'2026-07-21 12:12:00+00')`;
      const ready=functionResult(backend,expression,database); assert.equal(ready.outcome,"committed");
      const replay=functionResult(backend,expression,database); assert.equal(replay.outcome,"operation_replayed");
      assert.deepEqual(replay.payload.sealedProviderToken,ready.payload.sealedProviderToken);
      const presentation=functionResult(backend,`saas.checkout_get_payment_presentation('${HOSTNAME}','${claimed.cookieDigest}','2026-07-21 12:13:00+00')`,database);
      assert.equal(presentation.outcome,"found");
      assert.deepEqual(presentation.payload.sealedProviderToken,ready.payload.sealedProviderToken);
      assert.equal(JSON.stringify(presentation.payload).includes("sealedConfiguration"),false);
      const recovered=functionResult(backend,`saas.checkout_recover_attempt_operation('${begun.attempt}','${operation}','provider_ready',repeat('3',64))`,database);
      assert.equal(recovered.outcome,"operation_replayed");
      const attemptRecoveryBytes=psql(backend,`SELECT count(*)||'|'||md5(string_agg(operation_id::text||result_payload::text,',' ORDER BY operation_id)) FROM saas.checkout_operations;`,database);
      assert.equal(psql(backend,`BEGIN READ ONLY; SET LOCAL ROLE celebix_saas_workflow; SELECT outcome FROM saas.checkout_recover_attempt_operation('${begun.attempt}','${operation}','provider_ready',repeat('3',64)); COMMIT;`,database).split("\n").at(-1),"operation_replayed");
      assert.equal(functionResult(backend,`saas.checkout_recover_attempt_operation('${begun.attempt}','${operation}','initiation_unknown',repeat('3',64))`,database).outcome,"operation_mismatch");
      assert.equal(functionResult(backend,`saas.checkout_recover_attempt_operation('${fixtureUuid("b",399)}','${operation}','provider_ready',repeat('3',64))`,database).outcome,"not_found");
      assert.equal(functionResult(backend,`saas.checkout_recover_attempt_operation('${begun.attempt}','${operation}','provider_ready',repeat('0',64))`,database).outcome,"operation_mismatch");
      assert.equal(psql(backend,`SELECT count(*)||'|'||md5(string_agg(operation_id::text||result_payload::text,',' ORDER BY operation_id)) FROM saas.checkout_operations;`,database),attemptRecoveryBytes);
    });

    await scenario("unknown and failed initiation preserve or release holds exactly", async () => {
      const database=cloneDatabase(backend,"initiation_states");
      const unknownLink=seedCheckoutLink(backend,database,330);
      const unknownClaim=claimLink(backend,database,unknownLink,330);
      const unknownAttempt=beginAttempt(backend,database,unknownClaim,330);
      assert.equal(functionResult(backend,`saas.checkout_mark_initiation_unknown('${unknownAttempt.attempt}','${fixtureUuid("c",331)}',repeat('5',64),'2026-07-21 12:12:00+00')`,database).outcome,"committed");
      assert.equal(psql(backend,`SELECT attempt.status||'|'||reservation.status||'|'||(SELECT status FROM saas.checkout_reconciliation_jobs WHERE attempt_id=attempt.id) FROM saas.checkout_payment_attempts AS attempt JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id WHERE attempt.id='${unknownAttempt.attempt}';`,database),"initiation_unknown|held|pending");
      const failedLink=seedCheckoutLink(backend,database,331);
      const failedClaim=claimLink(backend,database,failedLink,331);
      const failedAttempt=beginAttempt(backend,database,failedClaim,332);
      assert.equal(functionResult(backend,`saas.checkout_mark_initiation_failed('${failedAttempt.attempt}','${fixtureUuid("c",334)}',repeat('6',64),'2026-07-21 12:12:00+00')`,database).outcome,"committed");
      assert.equal(psql(backend,`SELECT attempt.status||'|'||reservation.status FROM saas.checkout_payment_attempts AS attempt JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id WHERE attempt.id='${failedAttempt.attempt}';`,database),"failed|released");
      assert.equal(functionResult(backend,`saas.checkout_mark_initiation_unknown('${ATTEMPT}','${fixtureUuid("c",333)}',repeat('7',64),'2026-07-21 12:06:00+00')`,database).outcome,"invalid_transition");

      const staleLink=seedCheckoutLink(backend,database,335);
      const staleClaim=claimLink(backend,database,staleLink,335);
      const staleAttempt=beginAttempt(backend,database,staleClaim,335);
      const staleBefore=psql(backend,`SELECT attempt.status||'|'||attempt.version||'|'||reservation.status||'|'||reservation.version FROM saas.checkout_payment_attempts AS attempt JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id WHERE attempt.id='${staleAttempt.attempt}';`,database);
      assert.equal(functionResult(backend,`saas.checkout_mark_initiation_failed('${staleAttempt.attempt}','${fixtureUuid("c",336)}',repeat('8',64),'2026-07-21 12:10:30+00')`,database).outcome,"invalid_transition");
      assert.equal(psql(backend,`SELECT attempt.status||'|'||attempt.version||'|'||reservation.status||'|'||reservation.version FROM saas.checkout_payment_attempts AS attempt JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id WHERE attempt.id='${staleAttempt.attempt}';`,database),staleBefore);

      const maxLink=seedCheckoutLink(backend,database,337,{variant:VARIANT_2});
      const maxClaim=claimLink(backend,database,maxLink,337);
      const maxAttempt=beginAttempt(backend,database,maxClaim,337);
      psql(backend,`SET ROLE celebix_saas_owner;
        ALTER TABLE saas.checkout_inventory_reservations DISABLE TRIGGER checkout_inventory_reservations_transition;
        UPDATE saas.checkout_inventory_reservations SET version=9007199254740991 WHERE attempt_id='${maxAttempt.attempt}';
        ALTER TABLE saas.checkout_inventory_reservations ENABLE TRIGGER checkout_inventory_reservations_transition;`,database);
      const maxBefore=psql(backend,`SELECT attempt.status||'|'||attempt.version||'|'||reservation.status||'|'||reservation.version FROM saas.checkout_payment_attempts AS attempt JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id WHERE attempt.id='${maxAttempt.attempt}';`,database);
      assert.equal(functionResult(backend,`saas.checkout_mark_initiation_failed('${maxAttempt.attempt}','${fixtureUuid("c",338)}',repeat('9',64),'2026-07-21 12:12:00+00')`,database).outcome,"invalid_transition");
      assert.equal(psql(backend,`SELECT attempt.status||'|'||attempt.version||'|'||reservation.status||'|'||reservation.version FROM saas.checkout_payment_attempts AS attempt JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id WHERE attempt.id='${maxAttempt.attempt}';`,database),maxBefore);
    });

    await scenario("five-minute cleanup expires only reserved holds and zero-result replay is durable", async () => {
      const database=cloneDatabase(backend,"cleanup_api");
      const staleLink=seedCheckoutLink(backend,database,340);
      const staleClaim=claimLink(backend,database,staleLink,340,{now:"2026-07-21 12:00:00+00",expiresAt:"2026-07-21 12:15:00+00"});
      const staleAttempt=beginAttempt(backend,database,staleClaim,340,{now:"2026-07-21 12:00:00+00"});
      const worker=fixtureUuid("d",340),operation=fixtureUuid("c",342);
      const cleanup=`saas.checkout_cleanup_pre_provider_attempts('${worker}','${operation}',repeat('8',64),'2026-07-21 12:05:00+00',10)`;
      const cleaned=functionResult(backend,cleanup,database); assert.equal(cleaned.outcome,"committed",JSON.stringify(cleaned)); assert.equal(cleaned.payload.releasedCount,2);
      assert.equal(psql(backend,`SELECT status||'|'||(SELECT status FROM saas.checkout_inventory_reservations WHERE attempt_id='${staleAttempt.attempt}') FROM saas.checkout_payment_attempts WHERE id='${staleAttempt.attempt}';`,database),"expired|expired");
      assert.equal(functionResult(backend,cleanup,database).outcome,"operation_replayed");
      assert.equal(functionResult(backend,`saas.checkout_recover_cleanup_operation('${worker}','${operation}',repeat('8',64))`,database).outcome,"operation_replayed");
      const cleanupRecoveryBytes=psql(backend,`SELECT count(*)||'|'||md5(string_agg(operation_id::text||result_payload::text,',' ORDER BY operation_id)) FROM saas.checkout_operations;`,database);
      assert.equal(psql(backend,`BEGIN READ ONLY; SET LOCAL ROLE celebix_saas_workflow; SELECT outcome FROM saas.checkout_recover_cleanup_operation('${worker}','${operation}',repeat('8',64)); COMMIT;`,database).split("\n").at(-1),"operation_replayed");
      assert.equal(functionResult(backend,`saas.checkout_recover_cleanup_operation('${fixtureUuid("d",399)}','${operation}',repeat('8',64))`,database).outcome,"not_found");
      assert.equal(functionResult(backend,`saas.checkout_recover_cleanup_operation('${worker}','${operation}',repeat('0',64))`,database).outcome,"operation_mismatch");
      assert.equal(psql(backend,`SELECT count(*)||'|'||md5(string_agg(operation_id::text||result_payload::text,',' ORDER BY operation_id)) FROM saas.checkout_operations;`,database),cleanupRecoveryBytes);
      const zero=`saas.checkout_cleanup_pre_provider_attempts('${worker}','${fixtureUuid("c",341)}',repeat('9',64),'2026-07-21 12:05:01+00',10)`;
      assert.equal(functionResult(backend,zero,database).payload.releasedCount,0);
      assert.equal(functionResult(backend,zero,database).outcome,"operation_replayed");
      assert.equal(psql(backend,"SELECT count(*) FROM saas.checkout_operations WHERE worker_id IS NOT NULL AND operation_kind='cleanup_attempt';",database),"2");

      const cleanupMaxDatabase=cloneDatabase(backend,"cleanup_max_atomic");
      const maxLink=seedCheckoutLink(backend,cleanupMaxDatabase,343,{variant:VARIANT_2});
      const maxClaim=claimLink(backend,cleanupMaxDatabase,maxLink,343,{now:"2026-07-21 12:00:00+00",expiresAt:"2026-07-21 12:15:00+00"});
      const maxAttempt=beginAttempt(backend,cleanupMaxDatabase,maxClaim,343,{now:"2026-07-21 12:00:00+00"});
      psql(backend,`SET ROLE celebix_saas_owner;
        ALTER TABLE saas.checkout_inventory_reservations DISABLE TRIGGER checkout_inventory_reservations_transition;
        UPDATE saas.checkout_inventory_reservations SET version=9007199254740991 WHERE attempt_id='${maxAttempt.attempt}';
        ALTER TABLE saas.checkout_inventory_reservations ENABLE TRIGGER checkout_inventory_reservations_transition;`,cleanupMaxDatabase);
      const maxCleanupBefore=psql(backend,"SELECT string_agg(attempt.id||':'||attempt.status||':'||attempt.version||':'||reservation.status||':'||reservation.version,',' ORDER BY attempt.id) FROM saas.checkout_payment_attempts AS attempt JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id;",cleanupMaxDatabase);
      assert.equal(functionResult(backend,`saas.checkout_cleanup_pre_provider_attempts('${fixtureUuid("d",343)}','${fixtureUuid("c",344)}',repeat('a',64),'2026-07-21 12:05:00+00',10)`,cleanupMaxDatabase).outcome,"invalid_transition");
      assert.equal(psql(backend,"SELECT string_agg(attempt.id||':'||attempt.status||':'||attempt.version||':'||reservation.status||':'||reservation.version,',' ORDER BY attempt.id) FROM saas.checkout_payment_attempts AS attempt JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id;",cleanupMaxDatabase),maxCleanupBefore);
      assert.equal(psql(backend,`SELECT count(*) FROM saas.checkout_operations WHERE operation_id='${fixtureUuid("c",344)}';`,cleanupMaxDatabase),"0");

      const cleanupStaleDatabase=cloneDatabase(backend,"cleanup_stale_atomic");
      const laterLink=seedCheckoutLink(backend,cleanupStaleDatabase,345,{variant:VARIANT_2});
      const laterClaim=claimLink(backend,cleanupStaleDatabase,laterLink,345,{now:"2026-07-21 12:00:00+00",expiresAt:"2026-07-21 12:15:00+00"});
      const laterAttempt=beginAttempt(backend,cleanupStaleDatabase,laterClaim,345,{now:"2026-07-21 12:00:00+00"});
      psql(backend,`SET ROLE celebix_saas_owner; UPDATE saas.checkout_inventory_reservations
        SET version=version+1,updated_at='2026-07-21 12:06:00+00' WHERE attempt_id='${laterAttempt.attempt}';`,cleanupStaleDatabase);
      const staleCleanupBefore=psql(backend,`SELECT attempt.status||'|'||attempt.version||'|'||reservation.status||'|'||reservation.version||'|'||reservation.updated_at FROM saas.checkout_payment_attempts AS attempt JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id WHERE attempt.id='${laterAttempt.attempt}';`,cleanupStaleDatabase);
      assert.equal(functionResult(backend,`saas.checkout_cleanup_pre_provider_attempts('${fixtureUuid("d",345)}','${fixtureUuid("c",346)}',repeat('b',64),'2026-07-21 12:05:00+00',10)`,cleanupStaleDatabase).outcome,"invalid_transition");
      assert.equal(psql(backend,`SELECT attempt.status||'|'||attempt.version||'|'||reservation.status||'|'||reservation.version||'|'||reservation.updated_at FROM saas.checkout_payment_attempts AS attempt JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id WHERE attempt.id='${laterAttempt.attempt}';`,cleanupStaleDatabase),staleCleanupBefore);
      assert.equal(psql(backend,`SELECT count(*) FROM saas.checkout_operations WHERE operation_id='${fixtureUuid("c",346)}';`,cleanupStaleDatabase),"0");
    });

    await scenario("provider-ready and initiation-unknown holds never release by elapsed time alone", async () => {
      const database=cloneDatabase(backend,"cleanup_persistent");
      const readyLink=seedCheckoutLink(backend,database,350);
      const readyClaim=claimLink(backend,database,readyLink,350,{now:"2026-07-21 12:00:00+00",expiresAt:"2026-07-21 12:15:00+00"});
      const readyAttempt=beginAttempt(backend,database,readyClaim,350,{now:"2026-07-21 12:00:00+00"});
      assert.equal(functionResult(backend,`saas.checkout_mark_provider_ready('${readyAttempt.attempt}','${fixtureUuid("c",450)}',repeat('a',64),${ENVELOPE},repeat('b',64),'2026-07-21 12:01:00+00')`,database).outcome,"committed");
      const unknownLink=seedCheckoutLink(backend,database,351);
      const unknownClaim=claimLink(backend,database,unknownLink,351,{now:"2026-07-21 12:00:00+00",expiresAt:"2026-07-21 12:15:00+00"});
      const unknownAttempt=beginAttempt(backend,database,unknownClaim,351,{now:"2026-07-21 12:00:00+00"});
      assert.equal(functionResult(backend,`saas.checkout_mark_initiation_unknown('${unknownAttempt.attempt}','${fixtureUuid("c",451)}',repeat('c',64),'2026-07-21 12:01:00+00')`,database).outcome,"committed");
      const cleanup=functionResult(backend,`saas.checkout_cleanup_pre_provider_attempts('${fixtureUuid("d",351)}','${fixtureUuid("c",352)}',repeat('d',64),'2026-07-21 13:00:00+00',100)`,database);
      assert.ok(cleanup.payload.releasedCount>=1);
      assert.equal(psql(backend,`SELECT string_agg(attempt.status||':'||reservation.status,',' ORDER BY attempt.id) FROM saas.checkout_payment_attempts AS attempt JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id WHERE attempt.id IN ('${readyAttempt.attempt}','${unknownAttempt.attempt}');`,database),"provider_ready:held,initiation_unknown:held");
    });

    await scenario("migration 027 down restores exact 025 functions then 026 and 027 reapply cleanly", async () => {
      const database=cloneDatabase(backend,"api_rollback");
      const retainedOperation=fixtureUuid("c",390);
      psql(backend,`SET ROLE celebix_saas_owner;
        INSERT INTO saas.checkout_operations(operation_id,store_id,attempt_id,operation_kind,payload_fingerprint,result_payload,committed_at)
        VALUES('${retainedOperation}','${STORE}','${ATTEMPT}','begin_attempt',repeat('1',64),'{"proof":"migration-026-retained"}'::jsonb,'2026-07-21 12:04:00+00');`,database);
      const retainedBytes=psql(backend,`SELECT operation_kind||'|'||payload_fingerprint||'|'||result_payload::text||'|'||committed_at::text FROM saas.checkout_operations WHERE operation_id='${retainedOperation}';`,database);
      apply(backend,"202607220028_quick_order_redemption_expiry_authority.down.sql",database);
      apply(backend,"202607220027_quick_order_checkout_api.down.sql",database);
      assert.equal(psql(backend,`SELECT operation_kind||'|'||payload_fingerprint||'|'||result_payload::text||'|'||committed_at::text FROM saas.checkout_operations WHERE operation_id='${retainedOperation}';`,database),retainedBytes);
      const createDefinition="SELECT pg_get_functiondef('saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)'::regprocedure);";
      const duplicateDefinition="SELECT pg_get_functiondef('saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid[],text,text,jsonb,uuid,text)'::regprocedure);";
      assert.equal(psql(backend,createDefinition,database).replace(/\s+/g," ").trim(),psql(backend,createDefinition,ROLLBACK_DATABASE).replace(/\s+/g," ").trim());
      assert.equal(psql(backend,duplicateDefinition,database).replace(/\s+/g," ").trim(),psql(backend,duplicateDefinition,ROLLBACK_DATABASE).replace(/\s+/g," ").trim());
      assert.equal(psql(backend,"SELECT to_regprocedure('saas.quick_links_create_025(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)') IS NULL AND to_regprocedure('saas.quick_links_duplicate_025(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid[],text,text,jsonb,uuid,text)') IS NULL;",database),"t");
      assert.equal(psql(backend,"SELECT has_function_privilege('celebix_saas_app','saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)','EXECUTE') AND has_function_privilege('celebix_saas_app','saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid[],text,text,jsonb,uuid,text)','EXECUTE');",database),"t");
      assert.equal(psql(backend,"SELECT has_schema_privilege('celebix_saas_workflow','saas','USAGE');",database),"f");
      apply(backend,"202607220026_quick_order_checkout_runtime.down.sql",database);
      apply(backend,"202607220026_quick_order_checkout_runtime.up.sql",database);
      apply(backend,"202607220026_quick_order_checkout_runtime_assertions.sql",database);
      apply(backend,"202607220027_quick_order_checkout_api.up.sql",database);
      apply(backend,"202607220027_quick_order_checkout_api_assertions.sql",database);
      apply(backend,"202607220028_quick_order_redemption_expiry_authority.up.sql",database);
      apply(backend,"202607220028_quick_order_redemption_expiry_authority_assertions.sql",database);
      assert.equal(psql(backend,"SELECT to_regprocedure('saas.checkout_begin_attempt(text,text,uuid,text,uuid,text,timestamptz)') IS NOT NULL;",database),"t");

      const historyDatabase=cloneDatabase(backend,"api_rollback_history");
      assert.equal(functionResult(backend,
        `saas.quick_links_configure_provider(${merchantAuthority()},'2026-07-21 12:12:00+00','${PROVIDER}',2,repeat('9',64),'key-1',${ENVELOPE},'${fixtureUuid("c",391)}',repeat('9',64))`,
        historyDatabase,"celebix_saas_app").outcome,"committed");
      assert.equal(functionResult(backend,
        `saas.checkout_cleanup_pre_provider_attempts('${fixtureUuid("d",391)}','${fixtureUuid("c",392)}',repeat('8',64),'2026-07-21 12:00:01+00',1)`,
        historyDatabase).outcome,"committed");
      const historyDown=apply(backend,"202607220027_quick_order_checkout_api.down.sql",historyDatabase,true);
      assert.notEqual(historyDown.status,0);
      assert.match(historyDown.stderr,/QUICK_ORDER_CHECKOUT_API_ROLLBACK_HISTORY_CONFLICT/);
      assert.equal(psql(backend,"SELECT count(*) FROM saas.checkout_operations WHERE provider_config_id IS NOT NULL OR worker_id IS NOT NULL;",historyDatabase),"2");
      assert.equal(psql(backend,"SELECT to_regprocedure('saas.checkout_begin_attempt(text,text,uuid,text,uuid,text,timestamptz)') IS NOT NULL;",historyDatabase),"t");

      const partialApiDatabase=`${DATABASE}_api_partial_027`;
      createDatabase(backend,partialApiDatabase,ROLLBACK_DATABASE);
      psql(backend,"SET ROLE celebix_saas_owner; ALTER TABLE saas.checkout_operations ADD COLUMN provider_config_id uuid;",partialApiDatabase);
      const partialApply=apply(backend,"202607220027_quick_order_checkout_api.up.sql",partialApiDatabase,true);
      assert.notEqual(partialApply.status,0);
      assert.equal(psql(backend,"SELECT to_regprocedure('saas.checkout_begin_attempt(text,text,uuid,text,uuid,text,timestamptz)') IS NULL;",partialApiDatabase),"t");
      assert.equal(psql(backend,"SELECT to_regprocedure('saas.quick_links_create_025(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)') IS NULL;",partialApiDatabase),"t");
      psql(backend,"SET ROLE celebix_saas_owner; ALTER TABLE saas.checkout_operations DROP COLUMN provider_config_id;",partialApiDatabase);
      apply(backend,"202607220027_quick_order_checkout_api.up.sql",partialApiDatabase);
      apply(backend,"202607220027_quick_order_checkout_api_assertions.sql",partialApiDatabase);
      apply(backend,"202607220027_quick_order_checkout_api.down.sql",partialApiDatabase);
    });

    await scenario("callback authority is opaque and returns only the immutable attempt provider snapshot", async () => {
      const database=cloneDatabase(backend,"callback_authority");
      const link=seedCheckoutLink(backend,database,400);
      const claimed=claimLink(backend,database,link,400);
      const begun=beginAttempt(backend,database,claimed,400);
      assert.equal(markAttemptProviderReady(backend,database,begun,401).outcome,"committed");
      const authority=functionResult(backend,
        `saas.checkout_get_callback_authority('${begun.merchantOid}','2026-07-21 12:13:00+00')`,database);
      assert.equal(authority.outcome,"found");
      assert.deepEqual(Object.keys(authority.payload).sort(),[
        "attemptId","configurationDigest","configurationKeyId","currency","expectedPaymentAmount",
        "merchantOid","providerConfigId","sealedConfiguration","status","storeId",
      ]);
      assert.equal(authority.payload.attemptId,begun.attempt);
      assert.equal(authority.payload.status,"provider_ready");
      assert.equal(authority.payload.configurationDigest,"d".repeat(64));
      assert.equal(functionResult(backend,
        `saas.checkout_get_callback_authority('${"0".repeat(32)}','2026-07-21 12:13:00+00')`,database).outcome,"not_found");
      assert.equal(functionResult(backend,
        "saas.checkout_get_callback_authority('INVALID','2026-07-21 12:13:00+00')",database).outcome,"invalid_input");
    });

    await scenario("successful callback atomically persists provider facts snapshots one order and one stock decrement", async () => {
      const database=cloneDatabase(backend,"callback_success");
      const link=seedCheckoutLink(backend,database,410);
      const claimed=claimLink(backend,database,link,410);
      const begun=beginAttempt(backend,database,claimed,410);
      assert.equal(markAttemptProviderReady(backend,database,begun,411).outcome,"committed");
      psql(backend,`SET ROLE celebix_saas_owner;
        UPDATE saas.products SET title='Changed Product',version=version+1,updated_at='2026-07-21 12:12:30+00' WHERE id='${PRODUCT}';
        UPDATE saas.product_variants SET title='Changed Variant',price_cents=77777,version=version+1,updated_at='2026-07-21 12:12:30+00' WHERE id='${VARIANT}';`,database);
      const settled=settleCallback(backend,database,begun,410,{totalAmount:10500,paymentType:"eft"});
      assert.equal(settled.outcome,"settled",JSON.stringify(settled));
      assert.equal(settled.payload.orderNumber,"QO-410");
      assert.equal(psql(backend,`SELECT link.status||'|'||attempt.status||'|'||reservation.status||'|'||variant.stock_quantity||'|'||
        (SELECT count(*) FROM saas.orders WHERE quick_order_link_id=link.id)||'|'||(SELECT count(*) FROM saas.order_items WHERE order_id=link.order_id)||'|'||
        (SELECT count(*) FROM saas.order_events WHERE order_id=link.order_id AND event_type='order_created' AND actor_membership_id IS NULL)
        FROM saas.quick_order_links AS link JOIN saas.checkout_payment_attempts AS attempt ON attempt.quick_order_link_id=link.id
        JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id
        JOIN saas.product_variants AS variant ON variant.id=reservation.variant_id WHERE link.id='${link.link}';`,database),
        "paid|succeeded|consumed|5|1|1|1");
      assert.equal(psql(backend,`SELECT ordered.source||'|'||ordered.status||'|'||ordered.payment_status||'|'||ordered.customer_name||'|'||
        item.product_name||'|'||item.variant_name||'|'||item.unit_price_cents||'|'||item.quantity||'|'||
        (ordered.shipping_address=(SELECT shipping_address FROM saas.quick_order_links WHERE id='${link.link}'))||'|'||
        (ordered.billing_address=(SELECT billing_address FROM saas.quick_order_links WHERE id='${link.link}'))
        FROM saas.orders AS ordered JOIN saas.order_items AS item ON item.order_id=ordered.id WHERE ordered.id='${settled.order}';`,database),
        "quick_link|confirmed|completed|Ada Lovelace|Runtime Product|Tracked|10000|1|true|true");
      assert.equal(psql(backend,`SELECT callback_status||'|'||currency||'|'||(result_payload->>'paymentAmount')||'|'||
        (result_payload->>'totalAmount')||'|'||(result_payload->>'paymentType')||'|'||(result_payload->>'testMode')
        FROM saas.checkout_callback_receipts WHERE attempt_id='${begun.attempt}';`,database),"success|TRY|10000|10500|eft|1");
    });

    await scenario("duplicate callback digest replays before fresh identifiers and a different terminal digest conflicts", async () => {
      const database=cloneDatabase(backend,"callback_replay");
      const link=seedCheckoutLink(backend,database,420);
      const claimed=claimLink(backend,database,link,420);
      const begun=beginAttempt(backend,database,claimed,420);
      assert.equal(markAttemptProviderReady(backend,database,begun,421).outcome,"committed");
      const first=settleCallback(backend,database,begun,420);
      assert.equal(first.outcome,"settled");
      const replay=settleCallback(backend,database,begun,422,{
        callbackDigest:first.callbackDigest,operation:fixtureUuid("d",422),order:fixtureUuid("7",422),
        orderItems:[fixtureUuid("8",422)],event:fixtureUuid("9",422),orderNumber:"FRESH-IDS-IGNORED",
      });
      assert.equal(replay.outcome,"replayed");
      assert.equal(replay.payload.orderNumber,"QO-420");
      const conflict=settleCallback(backend,database,begun,423,{callbackDigest:fixtureDigest("different-terminal-callback")});
      assert.equal(conflict.outcome,"conflict");
      assert.equal(psql(backend,`SELECT (SELECT count(*) FROM saas.orders WHERE quick_order_link_id='${link.link}')||'|'||
        (SELECT count(*) FROM saas.checkout_callback_receipts WHERE attempt_id='${begun.attempt}')||'|'||
        (SELECT stock_quantity FROM saas.product_variants WHERE id='${VARIANT}');`,database),"1|1|5");
    });

    await scenario("signed failure accepts the exact failure shape releases holds and leaves the link retryable", async () => {
      const database=cloneDatabase(backend,"callback_failure");
      const link=seedCheckoutLink(backend,database,430);
      const claimed=claimLink(backend,database,link,430);
      const begun=beginAttempt(backend,database,claimed,430);
      assert.equal(markAttemptProviderReady(backend,database,begun,431).outcome,"committed");
      const failure=settleCallback(backend,database,begun,430,{
        status:"failed",paymentAmount:null,currency:null,totalAmount:10000,paymentType:"card",
        failedReasonCode:"declined",failedReasonMessageDigest:fixtureDigest("paytr-failure-message"),
      });
      assert.equal(failure.outcome,"failed");
      assert.equal(psql(backend,`SELECT link.status||'|'||attempt.status||'|'||reservation.status||'|'||
        (SELECT count(*) FROM saas.orders WHERE quick_order_link_id=link.id)||'|'||(SELECT stock_quantity FROM saas.product_variants WHERE id='${VARIANT}')
        FROM saas.quick_order_links AS link JOIN saas.checkout_payment_attempts AS attempt ON attempt.quick_order_link_id=link.id
        JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id WHERE link.id='${link.link}';`,database),
        "opened|failed|released|0|6");
      assert.equal(psql(backend,`SELECT result_payload ? 'failedReasonMessageDigest' AND NOT result_payload ? 'failedReasonMessage'
        FROM saas.checkout_callback_receipts WHERE attempt_id='${begun.attempt}';`,database),"t");
      const retry=beginAttempt(backend,database,claimed,432,{now:"2026-07-21 12:14:00+00"});
      assert.equal(retry.outcome,"committed");
      const authority=functionResult(backend,`saas.checkout_get_callback_authority('${begun.merchantOid}','2026-07-21 12:14:00+00')`,database);
      assert.equal(authority.payload.status,"failed");
    });

    await scenario("callback protocol rejects underpayment quote currency type and staging mode drift without mutation", async () => {
      const cases=[
        [440,{paymentAmount:9999},"invalid_input"],
        [441,{totalAmount:9999},"invalid_input"],
        [442,{currency:"USD"},"invalid_input"],
        [443,{paymentType:"cash"},"invalid_input"],
        [444,{testMode:0},"invalid_input"],
        [445,{testMode:null},"invalid_input"],
        [446,{status:"failed",paymentAmount:null,currency:null,failedReasonCode:null,failedReasonMessageDigest:null},"invalid_input"],
        [447,{paymentAmount:9007199254740992,totalAmount:9007199254740992},"invalid_input"],
      ];
      for (const [number,options,expected] of cases) {
        const database=cloneDatabase(backend,`callback_validation_${number}`);
        const link=seedCheckoutLink(backend,database,number);
        const claimed=claimLink(backend,database,link,number);
        const begun=beginAttempt(backend,database,claimed,number);
        assert.equal(markAttemptProviderReady(backend,database,begun,number+100).outcome,"committed");
        assert.equal(settleCallback(backend,database,begun,number,options).outcome,expected);
        assert.equal(psql(backend,`SELECT attempt.status||'|'||reservation.status||'|'||
          (SELECT count(*) FROM saas.checkout_callback_receipts WHERE attempt_id=attempt.id)||'|'||
          (SELECT count(*) FROM saas.orders WHERE quick_order_link_id=attempt.quick_order_link_id)
          FROM saas.checkout_payment_attempts AS attempt JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id
          WHERE attempt.id='${begun.attempt}';`,database),"provider_ready|held|0|0");
      }
      const lowerBoundDatabase=cloneDatabase(backend,"callback_validation_lower_bound");
      const lowerBoundLink=seedCheckoutLink(backend,lowerBoundDatabase,448);
      const lowerBoundClaim=claimLink(backend,lowerBoundDatabase,lowerBoundLink,448);
      const lowerBoundAttempt=beginAttempt(backend,lowerBoundDatabase,lowerBoundClaim,448);
      assert.equal(markAttemptProviderReady(backend,lowerBoundDatabase,lowerBoundAttempt,548).outcome,"committed");
      const lowerBoundBefore=checkoutMutationBytes(backend,lowerBoundDatabase);
      const lowerBoundResult=functionResult(backend,`saas.checkout_settle_callback(
        '${lowerBoundAttempt.merchantOid}','${fixtureDigest("callback-lower-bound")}',
        '${fixtureUuid("d",448)}',repeat('6',64),'success',10000,10000,'TRY','card',1,NULL,NULL,
        '${fixtureUuid("7",448)}','[0:0]={${fixtureUuid("8",448)}}'::uuid[],
        '${fixtureUuid("9",448)}','QO-448','2026-07-21 12:13:00+00')`,lowerBoundDatabase);
      assert.equal(lowerBoundResult.outcome,"invalid_input");
      assert.equal(checkoutMutationBytes(backend,lowerBoundDatabase),lowerBoundBefore);
    });

    await scenario("singleton reconciliation run lease is recoverable busy fenced and replaceable after expiry", async () => {
      const database=cloneDatabase(backend,"reconciliation_run");
      const worker=fixtureUuid("d",450),otherWorker=fixtureUuid("d",451);
      const runToken="a".repeat(43),otherToken="b".repeat(43);
      const runDigest=createHash("sha256").update(runToken).digest("hex");
      const otherDigest=createHash("sha256").update(otherToken).digest("hex");
      const begin=`saas.checkout_begin_reconciliation_run('${worker}','${runDigest}','2026-07-21 12:10:00+00','2026-07-21 12:11:00+00')`;
      assert.equal(functionResult(backend,begin,database).outcome,"acquired");
      assert.equal(psql(backend,`BEGIN READ ONLY; SET LOCAL ROLE celebix_saas_workflow; SELECT outcome FROM saas.checkout_recover_reconciliation_run(
        '${worker}','${runDigest}','2026-07-21 12:10:30+00'); COMMIT;`,database).split("\n").at(-1),"acquired");
      assert.equal(functionResult(backend,`saas.checkout_begin_reconciliation_run('${otherWorker}','${otherDigest}',
        '2026-07-21 12:10:30+00','2026-07-21 12:11:30+00')`,database).outcome,"busy");
      assert.equal(functionResult(backend,`saas.checkout_finish_reconciliation_run('${worker}','${otherToken}','2026-07-21 12:10:40+00')`,database).outcome,"invalid_lease");
      assert.equal(functionResult(backend,`saas.checkout_finish_reconciliation_run('${worker}','${runToken}','2026-07-21 12:10:40+00')`,database).outcome,"committed");
      assert.equal(functionResult(backend,`saas.checkout_recover_reconciliation_run('${worker}','${runDigest}','2026-07-21 12:10:41+00')`,database).outcome,"not_found");
      assert.equal(functionResult(backend,`saas.checkout_begin_reconciliation_run('${worker}','${runDigest}',
        '2026-07-21 12:11:00+00','2026-07-21 12:11:05+00')`,database).outcome,"acquired");
      assert.equal(functionResult(backend,`saas.checkout_begin_reconciliation_run('${otherWorker}','${otherDigest}',
        '2026-07-21 12:11:05+00','2026-07-21 12:12:05+00')`,database).outcome,"acquired");
      assert.equal(claimReconciliation(backend,database,worker,"2026-07-21 12:11:06+00","2026-07-21 12:12:00+00").outcome,"run_not_owned");
      assert.equal(claimReconciliation(backend,database,otherWorker,"2026-07-21 12:11:06+00","2026-07-21 12:12:06+00").outcome,"invalid_input");

      const emptyRaceDatabase=cloneDatabase(backend,"reconciliation_run_empty_race");
      const first=openPsqlSession(backend,emptyRaceDatabase,"reconciliation_run_first");
      const second=openPsqlSession(backend,emptyRaceDatabase,"reconciliation_run_second");
      try {
        const firstResult=await first.execute(`BEGIN; SET LOCAL ROLE celebix_saas_workflow;
          SELECT outcome FROM saas.checkout_begin_reconciliation_run('${worker}','${runDigest}',
          '2026-07-21 12:10:00+00','2026-07-21 12:11:00+00');`);
        assert.equal(firstResult.split("\n").at(-1),"acquired");
        const secondResult=second.execute(`SET ROLE celebix_saas_workflow;
          SELECT outcome FROM saas.checkout_begin_reconciliation_run('${otherWorker}','${otherDigest}',
          '2026-07-21 12:10:00+00','2026-07-21 12:11:00+00');`);
        await waitForBlockedSession(backend,emptyRaceDatabase,second.applicationName);
        await first.execute("COMMIT;");
        assert.equal((await secondResult).split("\n").at(-1),"busy");
      } finally { await Promise.all([first.close(),second.close()]); }

      const fenceDatabase=cloneDatabase(backend,"reconciliation_run_claim_fence");
      makeAttemptProviderReady(backend,fenceDatabase);
      const fencedRun=beginReconciliationRun(backend,fenceDatabase,worker,"2026-07-21 12:10:00+00","2026-07-21 12:11:00+00");
      assert.equal(fencedRun.outcome,"acquired");
      const claimant=openPsqlSession(backend,fenceDatabase,"reconciliation_claim_holds_run");
      const finisher=openPsqlSession(backend,fenceDatabase,"reconciliation_finish_waits_for_claim");
      try {
        const claimed=await claimant.execute(`BEGIN; SET LOCAL ROLE celebix_saas_workflow;
          SELECT outcome FROM saas.checkout_claim_reconciliation('${worker}','2026-07-21 12:10:01+00',
          '2026-07-21 12:11:00+00',25);`);
        assert.equal(claimed.split("\n").at(-1),"claimed");
        const finishResult=finisher.execute(`SET ROLE celebix_saas_workflow;
          SELECT outcome FROM saas.checkout_finish_reconciliation_run('${worker}','${fencedRun.runToken}',
          '2026-07-21 12:10:02+00');`);
        await waitForBlockedSession(backend,fenceDatabase,finisher.applicationName);
        await claimant.execute("COMMIT;");
        assert.equal((await finishResult).split("\n").at(-1),"committed");
      } finally { await Promise.all([claimant.close(),finisher.close()]); }
      const laterRun=beginReconciliationRun(backend,fenceDatabase,otherWorker,"2026-07-21 12:10:30+00","2026-07-21 12:11:30+00");
      assert.equal(laterRun.outcome,"acquired");
      assert.equal(claimReconciliation(backend,fenceDatabase,otherWorker,"2026-07-21 12:10:31+00","2026-07-21 12:11:30+00").payload.claims.length,0);
      assert.equal(claimReconciliation(backend,fenceDatabase,otherWorker,"2026-07-21 12:11:00+00","2026-07-21 12:11:30+00").payload.claims.length,1);
    });

    await scenario("global reconciliation claims are bounded skip locked and persist only lease digests", async () => {
      const database=cloneDatabase(backend,"reconciliation_claims");
      const attempts=[];
      for (let offset=0;offset<27;offset+=1) {
        const number=500+offset;
        const link=seedCheckoutLink(backend,database,number,{variant:VARIANT_2});
        const claimed=claimLink(backend,database,link,number,{now:"2026-07-21 12:00:00+00",expiresAt:"2026-07-21 12:15:00+00"});
        const begun=beginAttempt(backend,database,claimed,number,{now:"2026-07-21 12:01:00+00"});
        assert.equal(markAttemptProviderReady(backend,database,begun,600+offset,{now:"2026-07-21 12:02:00+00"}).outcome,"committed");
        attempts.push(begun);
      }
      const locked=openPsqlSession(backend,database,"reconciliation_skip_locked");
      try {
        await locked.execute(`BEGIN; SET ROLE celebix_saas_owner; SELECT id FROM saas.checkout_payment_attempts WHERE id='${attempts[0].attempt}' FOR UPDATE;`);
        const worker=fixtureUuid("d",500);
        assert.equal(beginReconciliationRun(backend,database,worker,"2026-07-21 12:10:00+00","2026-07-21 12:11:00+00").outcome,"acquired");
        const claimed=claimReconciliation(backend,database,worker,"2026-07-21 12:10:00+00","2026-07-21 12:11:00+00",25);
        assert.equal(claimed.outcome,"claimed");
        assert.equal(claimed.payload.claims.length,25);
        assert.equal(claimed.payload.claims.some((claim)=>claim.attemptId===attempts[0].attempt),false);
        for (const claim of claimed.payload.claims) {
          assert.equal(claim.workerId,worker);
          assert.match(claim.leaseToken,/^[A-Za-z0-9_-]{43}$/);
          assert.equal(claim.attemptNumber,1);
          assert.equal(psql(backend,`SELECT lease_token_digest='${createHash("sha256").update(claim.leaseToken).digest("hex")}'
            AND lease_token_digest<>${sqlLiteral(claim.leaseToken)} FROM saas.checkout_reconciliation_jobs WHERE attempt_id='${claim.attemptId}';`,database),"t");
        }
        await locked.execute("COMMIT;");
        const remainder=claimReconciliation(backend,database,worker,"2026-07-21 12:10:01+00","2026-07-21 12:11:00+00",25);
        assert.equal(remainder.payload.claims.length,2);
      } finally { await locked.close(); }
    });

    await scenario("cookie reconciliation claim is exact hostname and redemption digest scoped", async () => {
      const database=cloneDatabase(backend,"redemption_reconciliation_claim");
      const link=seedCheckoutLink(backend,database,540,{variant:VARIANT_2});
      const claimed=claimLink(backend,database,link,540);
      const begun=beginAttempt(backend,database,claimed,540);
      assert.equal(markAttemptProviderReady(backend,database,begun,541).outcome,"committed");
      const worker=fixtureUuid("d",540);
      assert.equal(functionResult(backend,`saas.checkout_claim_redemption_reconciliation('${ALIAS_HOSTNAME}',
        '${claimed.cookieDigest}','${worker}','2026-07-21 12:13:00+00','2026-07-21 12:14:00+00')`,database).outcome,"not_found");
      assert.equal(functionResult(backend,`saas.checkout_claim_redemption_reconciliation('${HOSTNAME}',repeat('0',64),
        '${worker}','2026-07-21 12:13:00+00','2026-07-21 12:14:00+00')`,database).outcome,"not_found");
      const exact=functionResult(backend,`saas.checkout_claim_redemption_reconciliation('${HOSTNAME}',
        '${claimed.cookieDigest}','${worker}','2026-07-21 12:13:00+00','2026-07-21 12:14:00+00')`,database);
      assert.equal(exact.outcome,"claimed");
      assert.equal(exact.payload.attemptId,begun.attempt);
      assert.equal(exact.payload.workerId,worker);
      assert.equal(claimReconciliation(backend,database,fixtureUuid("d",541),"2026-07-21 12:13:01+00","2026-07-21 12:14:01+00").payload.claims.length,0);
    });

    await scenario("unknown reconciliation is lease fenced exponentially requeued and never releases a hold", async () => {
      const database=cloneDatabase(backend,"reconciliation_unknown");
      const link=seedCheckoutLink(backend,database,550,{variant:VARIANT_2});
      const claimed=claimLink(backend,database,link,550);
      const begun=beginAttempt(backend,database,claimed,550);
      assert.equal(markAttemptProviderReady(backend,database,begun,551).outcome,"committed");
      const worker=fixtureUuid("d",550);
      assert.equal(beginReconciliationRun(backend,database,worker,"2026-07-21 12:13:00+00","2026-07-21 12:14:00+00").outcome,"acquired");
      const authority=claimReconciliation(backend,database,worker,"2026-07-21 12:13:00+00","2026-07-21 12:14:00+00").payload.claims[0];
      const operation=fixtureUuid("d",552);
      const expression=(workerId,leaseToken)=>`saas.checkout_record_reconciliation_unknown('${begun.merchantOid}','${workerId}',
        '${leaseToken}','${operation}',repeat('8',64),'2026-07-21 12:13:30+00','2026-07-21 12:13:00+00')`;
      assert.equal(functionResult(backend,expression(fixtureUuid("d",999),authority.leaseToken),database).outcome,"invalid_lease");
      assert.equal(functionResult(backend,expression(worker,authority.leaseToken),database).outcome,"committed");
      assert.equal(functionResult(backend,expression(worker,authority.leaseToken),database).outcome,"operation_replayed");
      assert.equal(psql(backend,`SELECT attempt.status||'|'||reservation.status||'|'||job.status||'|'||job.attempt_number||'|'||
        (job.next_attempt_at='2026-07-21 12:13:30+00')||'|'||(SELECT count(*) FROM saas.orders WHERE quick_order_link_id=attempt.quick_order_link_id)
        FROM saas.checkout_payment_attempts AS attempt JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id
        JOIN saas.checkout_reconciliation_jobs AS job ON job.attempt_id=attempt.id WHERE attempt.id='${begun.attempt}';`,database),
        "provider_ready|held|pending|1|true|0");
      const later=claimReconciliation(backend,database,worker,"2026-07-21 12:13:30+00","2026-07-21 12:14:00+00").payload.claims[0];
      assert.equal(later.attemptNumber,2);
      assert.equal(functionResult(backend,`saas.checkout_record_reconciliation_unknown('${begun.merchantOid}','${worker}',
        '${authority.leaseToken}','${fixtureUuid("d",554)}',repeat('9',64),'2026-07-21 12:14:00+00','2026-07-21 12:13:31+00')`,database).outcome,"invalid_lease");
      psql(backend,`SET ROLE celebix_saas_owner; UPDATE saas.checkout_reconciliation_jobs SET attempt_number=11
        WHERE attempt_id='${begun.attempt}';`,database);
      assert.equal(functionResult(backend,`saas.checkout_record_reconciliation_unknown('${begun.merchantOid}','${worker}',
        '${later.leaseToken}','${fixtureUuid("d",555)}',repeat('a',64),'2026-07-21 18:13:30+00','2026-07-21 12:13:30+00')`,database).outcome,"committed");
      assert.equal(psql(backend,`SELECT status||'|'||attempt_number||'|'||(next_attempt_at-'2026-07-21 12:13:30+00'::timestamptz)
        FROM saas.checkout_reconciliation_jobs WHERE attempt_id='${begun.attempt}';`,database),"pending|11|06:00:00");
      psql(backend,`SET ROLE celebix_saas_owner; UPDATE saas.checkout_reconciliation_jobs
        SET attempt_number=1000,next_attempt_at='2026-07-21 12:13:31+00',updated_at='2026-07-21 12:13:31+00'
        WHERE attempt_id='${begun.attempt}';`,database);
      const maxed=claimReconciliation(backend,database,worker,"2026-07-21 12:13:31+00","2026-07-21 12:14:00+00");
      assert.equal(maxed.outcome,"claimed");
      assert.equal(maxed.payload.claims.length,0);
      assert.equal(psql(backend,`SELECT status||'|'||attempt_number FROM saas.checkout_reconciliation_jobs WHERE attempt_id='${begun.attempt}';`,database),"pending|1000");
    });

    await scenario("status reconciliation success shares atomic snapshot settlement and decrements tracked stock once", async () => {
      const database=cloneDatabase(backend,"reconciliation_success");
      const link=seedCheckoutLink(backend,database,560);
      const claimed=claimLink(backend,database,link,560);
      const begun=beginAttempt(backend,database,claimed,560);
      assert.equal(functionResult(backend,`saas.checkout_mark_initiation_unknown('${begun.attempt}','${fixtureUuid("c",561)}',
        repeat('a',64),'2026-07-21 12:12:00+00')`,database).outcome,"committed");
      const worker=fixtureUuid("d",560);
      assert.equal(beginReconciliationRun(backend,database,worker,"2026-07-21 12:13:00+00","2026-07-21 12:14:00+00").outcome,"acquired");
      const authority=claimReconciliation(backend,database,worker,"2026-07-21 12:13:00+00","2026-07-21 12:14:00+00").payload.claims[0];
      const lowerBoundBefore=checkoutMutationBytes(backend,database);
      const lowerBoundResult=functionResult(backend,`saas.checkout_apply_reconciliation_success(
        '${begun.merchantOid}','${worker}','${authority.leaseToken}','${fixtureUuid("d",567)}',repeat('7',64),
        10000,10000,'TRY',1,'${fixtureUuid("7",567)}','[0:0]={${fixtureUuid("8",567)}}'::uuid[],
        '${fixtureUuid("9",567)}','QO-R-567','2026-07-21 12:13:30+00')`,database);
      assert.equal(lowerBoundResult.outcome,"invalid_input");
      assert.equal(checkoutMutationBytes(backend,database),lowerBoundBefore);
      for (const [number,options] of [
        [562,{paymentAmount:9999,totalAmount:10000}],
        [563,{paymentAmount:10000,totalAmount:9999}],
        [564,{currency:"TL"}],
        [565,{testMode:0}],
        [566,{paymentAmount:9007199254740992,totalAmount:9007199254740992}],
      ]) {
        assert.equal(applyReconciliationSuccess(backend,database,begun,authority,number,{worker,...options}).outcome,"invalid_input");
      }
      assert.equal(psql(backend,`SELECT attempt.status||'|'||reservation.status||'|'||variant.stock_quantity||'|'||job.status||'|'||
        (SELECT count(*) FROM saas.orders WHERE quick_order_link_id=attempt.quick_order_link_id)
        FROM saas.checkout_payment_attempts AS attempt JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id
        JOIN saas.product_variants AS variant ON variant.id=reservation.variant_id
        JOIN saas.checkout_reconciliation_jobs AS job ON job.attempt_id=attempt.id WHERE attempt.id='${begun.attempt}';`,database),
        "initiation_unknown|held|6|leased|0");
      const settled=applyReconciliationSuccess(backend,database,begun,authority,560,{worker,totalAmount:10100});
      assert.equal(settled.outcome,"settled");
      const replay=applyReconciliationSuccess(backend,database,begun,authority,561,{
        worker,operation:settled.operation,fingerprint:"7",order:fixtureUuid("7",561),orderItems:[fixtureUuid("8",561)],event:fixtureUuid("9",561),
      });
      assert.equal(replay.outcome,"replayed");
      assert.equal(replay.payload.orderNumber,"QO-R-560");
      assert.equal(psql(backend,`SELECT attempt.status||'|'||link.status||'|'||reservation.status||'|'||variant.stock_quantity||'|'||job.status||'|'||
        (SELECT count(*) FROM saas.checkout_reconciliation_receipts WHERE attempt_id=attempt.id)||'|'||
        (SELECT count(*) FROM saas.orders WHERE quick_order_link_id=link.id)
        FROM saas.checkout_payment_attempts AS attempt JOIN saas.quick_order_links AS link ON link.id=attempt.quick_order_link_id
        JOIN saas.checkout_inventory_reservations AS reservation ON reservation.attempt_id=attempt.id
        JOIN saas.product_variants AS variant ON variant.id=reservation.variant_id
        JOIN saas.checkout_reconciliation_jobs AS job ON job.attempt_id=attempt.id WHERE attempt.id='${begun.attempt}';`,database),
        "succeeded|paid|consumed|5|completed|1|1");
    });

    await scenario("callback and status reconciliation race has one settlement winner and one quick-link order", async () => {
      const database=cloneDatabase(backend,"callback_reconciliation_race");
      const link=seedCheckoutLink(backend,database,570);
      const claimed=claimLink(backend,database,link,570);
      const begun=beginAttempt(backend,database,claimed,570);
      assert.equal(markAttemptProviderReady(backend,database,begun,571).outcome,"committed");
      const worker=fixtureUuid("d",570);
      assert.equal(beginReconciliationRun(backend,database,worker,"2026-07-21 12:13:00+00","2026-07-21 12:14:00+00").outcome,"acquired");
      const authority=claimReconciliation(backend,database,worker,"2026-07-21 12:13:00+00","2026-07-21 12:14:00+00").payload.claims[0];
      const callback=openPsqlSession(backend,database,"callback_race_winner");
      const reconciliation=openPsqlSession(backend,database,"reconciliation_race_loser");
      try {
        const callbackResult=await callback.execute(`BEGIN; SET LOCAL ROLE celebix_saas_workflow;
          SELECT outcome FROM saas.checkout_settle_callback('${begun.merchantOid}','${fixtureDigest("race-callback")}',
          '${fixtureUuid("d",570)}',repeat('b',64),'success',10000,10000,'TRY','card',1,NULL,NULL,
          '${fixtureUuid("7",570)}',ARRAY['${fixtureUuid("8",570)}']::uuid[],'${fixtureUuid("9",570)}','RACE-CB','2026-07-21 12:13:10+00');`);
        assert.equal(callbackResult.split("\n").at(-1),"settled");
        const reconciliationResult=reconciliation.execute(`SET ROLE celebix_saas_workflow;
          SELECT outcome FROM saas.checkout_apply_reconciliation_success('${begun.merchantOid}','${worker}','${authority.leaseToken}',
          '${fixtureUuid("d",571)}',repeat('c',64),10000,10000,'TRY',1,'${fixtureUuid("7",571)}',
          ARRAY['${fixtureUuid("8",571)}']::uuid[],'${fixtureUuid("9",571)}','RACE-RECON','2026-07-21 12:13:11+00');`);
        await waitForBlockedSession(backend,database,reconciliation.applicationName);
        await callback.execute("COMMIT;");
        assert.equal((await reconciliationResult).split("\n").at(-1),"conflict");
        assert.equal(psql(backend,`SELECT count(*)||'|'||min(order_number)||'|'||(SELECT stock_quantity FROM saas.product_variants WHERE id='${VARIANT}')
          FROM saas.orders WHERE quick_order_link_id='${link.link}';`,database),"1|RACE-CB|5");
      } finally { await Promise.all([callback.close(),reconciliation.close()]); }

      const reconciliationFirstDatabase=cloneDatabase(backend,"reconciliation_callback_race");
      const reconciliationFirstLink=seedCheckoutLink(backend,reconciliationFirstDatabase,575);
      const reconciliationFirstClaim=claimLink(backend,reconciliationFirstDatabase,reconciliationFirstLink,575);
      const reconciliationFirstAttempt=beginAttempt(backend,reconciliationFirstDatabase,reconciliationFirstClaim,575);
      assert.equal(markAttemptProviderReady(backend,reconciliationFirstDatabase,reconciliationFirstAttempt,576).outcome,"committed");
      const reconciliationFirstWorker=fixtureUuid("d",575);
      assert.equal(beginReconciliationRun(backend,reconciliationFirstDatabase,reconciliationFirstWorker,
        "2026-07-21 12:13:00+00","2026-07-21 12:14:00+00").outcome,"acquired");
      const reconciliationFirstAuthority=claimReconciliation(backend,reconciliationFirstDatabase,reconciliationFirstWorker,
        "2026-07-21 12:13:00+00","2026-07-21 12:14:00+00").payload.claims[0];
      assert.equal(applyReconciliationSuccess(backend,reconciliationFirstDatabase,reconciliationFirstAttempt,
        reconciliationFirstAuthority,575,{worker:reconciliationFirstWorker,totalAmount:10050}).outcome,"settled");
      const callbackDigest=fixtureDigest("reconciliation-first-callback");
      const authenticated=settleCallback(backend,reconciliationFirstDatabase,reconciliationFirstAttempt,576,{
        callbackDigest,totalAmount:10050,order:fixtureUuid("7",576),orderItems:[fixtureUuid("8",576)],event:fixtureUuid("9",576),
      });
      assert.equal(authenticated.outcome,"replayed");
      assert.equal(settleCallback(backend,reconciliationFirstDatabase,reconciliationFirstAttempt,577,{
        callbackDigest,totalAmount:10050,operation:fixtureUuid("d",577),order:fixtureUuid("7",577),
        orderItems:[fixtureUuid("8",577)],event:fixtureUuid("9",577),
      }).outcome,"replayed");
      assert.equal(settleCallback(backend,reconciliationFirstDatabase,reconciliationFirstAttempt,578,{
        callbackDigest:fixtureDigest("different-after-bound-callback"),totalAmount:10050,
      }).outcome,"conflict");
      assert.equal(psql(backend,`SELECT (SELECT count(*) FROM saas.orders WHERE quick_order_link_id='${reconciliationFirstLink.link}')||'|'||
        (SELECT count(*) FROM saas.checkout_callback_receipts WHERE attempt_id='${reconciliationFirstAttempt.attempt}')||'|'||
        (SELECT count(*) FROM saas.checkout_reconciliation_receipts WHERE attempt_id='${reconciliationFirstAttempt.attempt}')||'|'||
        (SELECT stock_quantity FROM saas.product_variants WHERE id='${VARIANT}');`,reconciliationFirstDatabase),"1|1|1|5");
    });

    await scenario("catalog archive and callback settlement follow deterministic locks without deadlock", async () => {
      const database=cloneDatabase(backend,"callback_archive_race");
      const link=seedCheckoutLink(backend,database,580);
      psql(backend,`SET ROLE celebix_saas_owner;
        UPDATE saas.quick_order_link_items SET position=1 WHERE quick_order_link_id='${link.link}';
        INSERT INTO saas.quick_order_link_items(
          id,store_id,quick_order_link_id,product_id,variant_id,position,product_name,variant_name,
          unit_price_cents,quantity,line_total_cents,created_at
        ) VALUES('${fixtureUuid("8",581)}','${STORE}','${link.link}','${PRODUCT}','${VARIANT_2}',0,
          'Runtime Product','Untracked',11000,1,11000,'2026-07-21 10:00:00+00');
        UPDATE saas.quick_order_links SET subtotal_cents=21000,total_cents=21000 WHERE id='${link.link}';`,database);
      const claimed=claimLink(backend,database,link,580);
      const begun=beginAttempt(backend,database,claimed,580);
      assert.equal(markAttemptProviderReady(backend,database,begun,581).outcome,"committed");
      psql(backend,`CREATE FUNCTION saas.quick_checkout_settlement_race_barrier()
        RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
        BEGIN
          IF pg_catalog.current_setting('celebix.test_settlement_barrier',true)='on' THEN
            PERFORM pg_catalog.pg_advisory_xact_lock(1498934,581);
          END IF;
          RETURN NULL;
        END
        $function$;
        CREATE TRIGGER quick_checkout_settlement_race_barrier
          BEFORE INSERT ON saas.orders FOR EACH STATEMENT
          EXECUTE FUNCTION saas.quick_checkout_settlement_race_barrier();`,database);
      const barrier=openPsqlSession(backend,database,"callback_archive_barrier");
      const settle=openPsqlSession(backend,database,"callback_archive_settlement");
      const archive=openPsqlSession(backend,database,"callback_archive_catalog");
      try {
        await barrier.execute("SELECT pg_catalog.pg_advisory_lock(1498934,581);");
        const settleResult=settle.execute(`SET lock_timeout='5s'; SET deadlock_timeout='50ms';
          SET celebix.test_settlement_barrier='on'; SET ROLE celebix_saas_workflow;
          SELECT outcome FROM saas.checkout_settle_callback('${begun.merchantOid}','${fixtureDigest("archive-callback")}',
          '${fixtureUuid("d",580)}',repeat('e',64),'success',21000,21000,'TRY','card',1,NULL,NULL,
          '${fixtureUuid("7",580)}',ARRAY['${fixtureUuid("8",582)}','${fixtureUuid("8",583)}']::uuid[],
          '${fixtureUuid("9",580)}','ARCHIVE-CB','2026-07-21 12:13:00+00');`);
        await waitForBlockedBySession(backend,database,settle.applicationName,barrier.applicationName);
        const archiveResult=archive.execute(`SET lock_timeout='5s'; SET deadlock_timeout='50ms'; SET ROLE celebix_saas_app;
          SELECT outcome FROM saas.catalog_archive_product('${STORE}','${PRINCIPAL}','${MEMBERSHIP}','${PLAN}','free_starter',1,100,
          '2026-07-21 12:14:00+00','${fixtureUuid("c",582)}',repeat('d',64),'${PRODUCT}',1);`);
        await waitForBlockedBySession(backend,database,archive.applicationName,settle.applicationName);
        await barrier.execute("SELECT pg_catalog.pg_advisory_unlock(1498934,581);");
        const [archiveOutcome,settlementOutcome]=await Promise.allSettled([archiveResult,settleResult]);
        const raceErrors=[archiveOutcome,settlementOutcome].filter((result)=>result.status==="rejected")
          .map((result)=>result.reason.message).join("\n");
        assert.doesNotMatch(raceErrors,/deadlock detected/i);
        assert.equal(settlementOutcome.status,"fulfilled");
        assert.equal(settlementOutcome.value.split("\n").at(-1),"settled");
        assert.equal(archiveOutcome.status,"rejected");
        assert.match(archiveOutcome.reason.message,/CATALOG_VARIANT_HAS_HELD_CHECKOUT_RESERVATION/);
        assert.equal(psql(backend,`SELECT product.status||'|'||string_agg(variant.status,',' ORDER BY variant.id)||'|'||attempt.status||'|'||link.status||'|'||
          (SELECT count(*) FROM saas.checkout_inventory_reservations WHERE attempt_id=attempt.id AND status='consumed')||'|'||
          (((product.status='archived')::integer+(attempt.status='succeeded')::integer)=1)
          FROM saas.products AS product JOIN saas.product_variants AS variant ON variant.product_id=product.id
          JOIN saas.checkout_payment_attempts AS attempt ON attempt.id='${begun.attempt}'
          JOIN saas.quick_order_links AS link ON link.id=attempt.quick_order_link_id WHERE product.id='${PRODUCT}'
          GROUP BY product.status,attempt.id,attempt.status,link.status;`,database),"active|active,active|succeeded|paid|2|true");
        const source=psql(backend,"SELECT prosrc FROM pg_proc WHERE oid='saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamptz)'::regprocedure;",database);
        assert.ok(source.indexOf("SELECT attempt.* INTO current_attempt")<source.indexOf("SELECT link.* INTO current_link"));
        assert.ok(source.indexOf("ORDER BY product.id FOR KEY SHARE")>source.indexOf("SELECT link.* INTO current_link"));
        assert.ok(source.indexOf("ORDER BY product.id FOR KEY SHARE")<source.indexOf("ORDER BY variant.id FOR UPDATE"));
        assert.ok(source.indexOf("ORDER BY variant.id FOR UPDATE")<source.indexOf("ORDER BY reservation.variant_id,reservation.id FOR UPDATE"));
      } finally { await Promise.all([barrier.close(),settle.close(),archive.close()]); }
    });

    await scenario("callback and reconciliation unknown-commit recovery is read only exact scoped and nonduplicating", async () => {
      const callbackDatabase=cloneDatabase(backend,"callback_recovery");
      const callbackLink=seedCheckoutLink(backend,callbackDatabase,590);
      const callbackClaim=claimLink(backend,callbackDatabase,callbackLink,590);
      const callbackAttempt=beginAttempt(backend,callbackDatabase,callbackClaim,590);
      assert.equal(markAttemptProviderReady(backend,callbackDatabase,callbackAttempt,591).outcome,"committed");
      const settled=settleCallback(backend,callbackDatabase,callbackAttempt,590);
      const callbackBytes=psql(backend,`SELECT (SELECT count(*) FROM saas.checkout_operations)||'|'||
        (SELECT count(*) FROM saas.checkout_callback_receipts)||'|'||(SELECT count(*) FROM saas.orders);`,callbackDatabase);
      assert.equal(psql(backend,`BEGIN READ ONLY; SET LOCAL ROLE celebix_saas_workflow;
        SELECT outcome FROM saas.checkout_recover_callback('${callbackAttempt.merchantOid}','${settled.callbackDigest}',
        '${settled.operation}',repeat('6',64)); COMMIT;`,callbackDatabase).split("\n").at(-1),"operation_replayed");
      assert.equal(functionResult(backend,`saas.checkout_recover_callback('${callbackAttempt.merchantOid}',repeat('0',64),
        '${settled.operation}',repeat('6',64))`,callbackDatabase).outcome,"not_found");
      assert.equal(psql(backend,`SELECT (SELECT count(*) FROM saas.checkout_operations)||'|'||
        (SELECT count(*) FROM saas.checkout_callback_receipts)||'|'||(SELECT count(*) FROM saas.orders);`,callbackDatabase),callbackBytes);

      const reconciliationDatabase=cloneDatabase(backend,"reconciliation_recovery");
      const reconciliationLink=seedCheckoutLink(backend,reconciliationDatabase,591,{variant:VARIANT_2});
      const reconciliationClaim=claimLink(backend,reconciliationDatabase,reconciliationLink,591);
      const reconciliationAttempt=beginAttempt(backend,reconciliationDatabase,reconciliationClaim,591);
      assert.equal(markAttemptProviderReady(backend,reconciliationDatabase,reconciliationAttempt,592).outcome,"committed");
      const worker=fixtureUuid("d",591);
      assert.equal(beginReconciliationRun(backend,reconciliationDatabase,worker,"2026-07-21 12:13:00+00","2026-07-21 12:14:00+00").outcome,"acquired");
      const authority=claimReconciliation(backend,reconciliationDatabase,worker,"2026-07-21 12:13:00+00","2026-07-21 12:14:00+00").payload.claims[0];
      const reconciled=applyReconciliationSuccess(backend,reconciliationDatabase,reconciliationAttempt,authority,591,{worker});
      const reconciliationBytes=psql(backend,`SELECT (SELECT count(*) FROM saas.checkout_operations)||'|'||
        (SELECT count(*) FROM saas.checkout_reconciliation_receipts)||'|'||(SELECT count(*) FROM saas.orders);`,reconciliationDatabase);
      assert.equal(psql(backend,`BEGIN READ ONLY; SET LOCAL ROLE celebix_saas_workflow;
        SELECT outcome FROM saas.checkout_recover_reconciliation('${reconciliationAttempt.merchantOid}','${reconciled.operation}',repeat('7',64)); COMMIT;`,reconciliationDatabase).split("\n").at(-1),"operation_replayed");
      assert.equal(functionResult(backend,`saas.checkout_recover_reconciliation('${"0".repeat(32)}','${reconciled.operation}',repeat('7',64))`,reconciliationDatabase).outcome,"not_found");
      assert.equal(psql(backend,`SELECT (SELECT count(*) FROM saas.checkout_operations)||'|'||
        (SELECT count(*) FROM saas.checkout_reconciliation_receipts)||'|'||(SELECT count(*) FROM saas.orders);`,reconciliationDatabase),reconciliationBytes);
      assert.equal(psql(backend,"SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND has_function_privilege('celebix_saas_workflow',p.oid,'EXECUTE');",reconciliationDatabase),"24");
      assert.equal(psql(backend,"SELECT count(*) FROM information_schema.table_privileges WHERE grantee='celebix_saas_workflow' AND table_schema='saas';",reconciliationDatabase),"0");
    });

    await scenario("backup restore rollback partial reapply and final cleanup preserve Task 4 authority", async () => {
      const sourceDatabase=cloneDatabase(backend,"task4_backup_source");
      const link=seedCheckoutLink(backend,sourceDatabase,600,{variant:VARIANT_2});
      const claimed=claimLink(backend,sourceDatabase,link,600);
      const begun=beginAttempt(backend,sourceDatabase,claimed,600);
      assert.equal(markAttemptProviderReady(backend,sourceDatabase,begun,601).outcome,"committed");
      const settled=settleCallback(backend,sourceDatabase,begun,600);
      assert.equal(settled.outcome,"settled");
      const dump=path.join(backend.temporaryDirectory,"quick-order-runtime-task4.dump");
      const restoredDatabase=`${DATABASE}_task4_restored`;
      command(backend.executables.pg_dump,["-h",backend.socketDirectory,"-p",String(backend.port),"-U","postgres","-d",sourceDatabase,"-Fc","-f",dump]);
      createDatabase(backend,restoredDatabase);
      command(backend.executables.pg_restore,["-h",backend.socketDirectory,"-p",String(backend.port),"-U","postgres","-d",restoredDatabase,"--exit-on-error",dump]);
      assert.equal(psql(backend,`SELECT link.status||'|'||attempt.status||'|'||(SELECT count(*) FROM saas.orders WHERE quick_order_link_id=link.id)||'|'||
        (SELECT count(*) FROM saas.checkout_callback_receipts WHERE attempt_id=attempt.id)
        FROM saas.quick_order_links AS link JOIN saas.checkout_payment_attempts AS attempt ON attempt.quick_order_link_id=link.id
        WHERE link.id='${link.link}';`,restoredDatabase),"paid|succeeded|1|1");
      assert.equal(functionResult(backend,`saas.checkout_get_callback_authority('${begun.merchantOid}','2026-07-21 12:14:00+00')`,restoredDatabase).outcome,"found");
      apply(backend,"202607220027_quick_order_checkout_api_assertions.sql",restoredDatabase);
      apply(backend,"202607220028_quick_order_redemption_expiry_authority_assertions.sql",restoredDatabase);
      rmSync(dump,{force:true});
      assert.equal(existsSync(dump),false);

      const rollbackDatabase=cloneDatabase(backend,"task4_api_rollback");
      apply(backend,"202607220028_quick_order_redemption_expiry_authority.down.sql",rollbackDatabase);
      apply(backend,"202607220027_quick_order_checkout_api.down.sql",rollbackDatabase);
      assert.equal(psql(backend,"SELECT to_regprocedure('saas.checkout_get_callback_authority(text,timestamptz)') IS NULL;",rollbackDatabase),"t");
      assert.equal(psql(backend,"SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND has_function_privilege('celebix_saas_workflow',p.oid,'EXECUTE');",rollbackDatabase),"0");
      apply(backend,"202607220027_quick_order_checkout_api.up.sql",rollbackDatabase);
      apply(backend,"202607220027_quick_order_checkout_api_assertions.sql",rollbackDatabase);
      apply(backend,"202607220028_quick_order_redemption_expiry_authority.up.sql",rollbackDatabase);
      apply(backend,"202607220028_quick_order_redemption_expiry_authority_assertions.sql",rollbackDatabase);
      assert.equal(psql(backend,"SELECT to_regprocedure('saas.checkout_get_callback_authority(text,timestamptz)') IS NOT NULL;",rollbackDatabase),"t");

      const partialDatabase=`${DATABASE}_task4_partial`;
      createDatabase(backend,partialDatabase,ROLLBACK_DATABASE);
      psql(backend,`SET ROLE celebix_saas_owner; CREATE FUNCTION saas.checkout_get_callback_authority(text,timestamptz)
        RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql AS 'SELECT ''partial''::text,NULL::jsonb';`,partialDatabase);
      const partialApply=apply(backend,"202607220027_quick_order_checkout_api.up.sql",partialDatabase,true);
      assert.notEqual(partialApply.status,0);
      assert.equal(psql(backend,"SELECT to_regprocedure('saas.checkout_settle_callback(text,text,uuid,text,text,bigint,bigint,text,text,integer,text,text,uuid,uuid[],uuid,text,timestamptz)') IS NULL;",partialDatabase),"t");
      psql(backend,"SET ROLE celebix_saas_owner; DROP FUNCTION saas.checkout_get_callback_authority(text,timestamptz);",partialDatabase);
      apply(backend,"202607220027_quick_order_checkout_api.up.sql",partialDatabase);
      apply(backend,"202607220027_quick_order_checkout_api_assertions.sql",partialDatabase);
      apply(backend,"202607220027_quick_order_checkout_api.down.sql",partialDatabase);
    });

    assert.equal(completed.length, TOTAL);
    process.stdout.write(`PASS ${TOTAL}/${TOTAL} quick-order runtime PostgreSQL 16 harness complete; rollback/reapply and cleanup confirmed\n`);
  } finally {
    stopPostgres(backend);
  }
}

await main();
