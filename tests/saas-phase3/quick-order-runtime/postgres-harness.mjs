import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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

function startPostgres() {
  assertSafeEnvironment();
  const executables = Object.fromEntries(REQUIRED_NATIVE_TOOLS.map((name) => [name, executable(name)]));
  if (Object.values(executables).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "celebix-quick-order-runtime-"));
  const socketDirectory = path.join("/tmp", `c3b2r-${TOKEN}`);
  const dataDirectory = path.join(temporaryDirectory, "data");
  const port = 20_000 + Math.floor(Math.random() * 15_000);
  mkdirSync(socketDirectory, { mode: 0o700 });
  const backend = { executables, temporaryDirectory, socketDirectory, dataDirectory, port, started: false };
  try {
    command(executables.initdb, ["-D", dataDirectory, "--auth=trust", "--username=postgres", "--no-locale"]);
    command(executables.pg_ctl, ["-D", dataDirectory, "-o", `-k ${socketDirectory} -p ${port} -h ''`, "-l", path.join(temporaryDirectory, "postgres.log"), "start"]);
    backend.started = true;
    return backend;
  } catch (error) {
    stopPostgres(backend);
    throw error;
  }
}

function stopPostgres(backend) {
  if (!backend) return;
  if (backend.started) command(backend.executables.pg_ctl, ["-D", backend.dataDirectory, "-m", "fast", "stop"], { allowFailure: true });
  rmSync(backend.socketDirectory, { recursive: true, force: true });
  rmSync(backend.temporaryDirectory, { recursive: true, force: true });
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

function psqlAsync(backend, source, database = DATABASE) {
  return new Promise((resolve, reject) => {
    const child = spawn(backend.executables.psql, ["-h", backend.socketDirectory, "-p", String(backend.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], {
      cwd: ROOT, env: { PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" }, stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)));
    child.stdin.end(source);
  });
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
      assert.equal(psql(backend, "SELECT count(*) FROM information_schema.columns WHERE table_schema='saas' AND table_name='checkout_payment_attempts';"), "29");
      assert.equal(psql(backend, "SELECT to_regclass('saas.orders_store_quick_order_link_key') IS NOT NULL;"), "t");
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
      psql(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.checkout_callback_receipts(id,store_id,attempt_id,callback_digest,callback_status,result_payload,received_at) VALUES ('64000000-0000-4000-8000-000000000001','${STORE}','${ATTEMPT}',repeat('a',64),'failed','{}','2026-07-21 12:01:00+00'); INSERT INTO saas.checkout_operations(operation_id,store_id,attempt_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES ('65000000-0000-4000-8000-000000000001','${STORE}','${ATTEMPT}','begin_attempt',repeat('b',64),'{}','2026-07-21 12:01:00+00'); INSERT INTO saas.checkout_reconciliation_receipts(id,store_id,attempt_id,operation_id,outcome,payload_fingerprint,result_payload,committed_at) VALUES ('66000000-0000-4000-8000-000000000001','${STORE}','${ATTEMPT}','67000000-0000-4000-8000-000000000001','unknown',repeat('c',64),'{}','2026-07-21 12:01:00+00');`);
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.checkout_callback_receipts SET result_payload='{"changed":true}' WHERE id='64000000-0000-4000-8000-000000000001';`);
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.checkout_operations SET result_payload='{"changed":true}' WHERE operation_id='65000000-0000-4000-8000-000000000001';`);
      denied(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.checkout_callback_receipts(id,store_id,attempt_id,callback_digest,callback_status,result_payload,received_at) VALUES ('64000000-0000-4000-8000-000000000002','${STORE}','${ATTEMPT}',repeat('a',64),'failed','{}','2026-07-21 12:01:00+00');`);
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.checkout_reconciliation_receipts SET outcome='succeeded' WHERE id='66000000-0000-4000-8000-000000000001';`);
      denied(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.checkout_reconciliation_receipts(id,store_id,attempt_id,operation_id,outcome,payload_fingerprint,result_payload,committed_at) VALUES ('66000000-0000-4000-8000-000000000002','${STORE}','${ATTEMPT}','67000000-0000-4000-8000-000000000002','unknown',repeat('d',64),jsonb_build_object('oversized',repeat('x',40000)),'2026-07-21 12:01:00+00');`);
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.checkout_reconciliation_jobs SET attempt_number=-1,updated_at='2026-07-21 11:59:00+00' WHERE attempt_id='${ATTEMPT}';`);
    });

    await scenario("orders bind exactly one quick-link source through composite authority", async () => {
      psql(backend, `BEGIN; SET ROLE celebix_saas_owner; INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,billing_address,quick_order_link_id,version,created_at,updated_at) VALUES ('70000000-0000-4000-8000-000000000001','${STORE}','QL-1','quick_link','Ada','ada@example.test','TRY',10000,0,0,10000,'confirmed','completed','{}','{}','${LINK}',1,'2026-07-21','2026-07-21'); ROLLBACK;`);
      denied(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at) VALUES ('70000000-0000-4000-8000-000000000002','${STORE}','BAD-1','quick_link','Ada','ada@example.test','TRY',1,0,0,1,'pending','pending','{}',1,'2026-07-21','2026-07-21');`);
      denied(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,billing_address,quick_order_link_id,version,created_at,updated_at) VALUES ('70000000-0000-4000-8000-000000000003','${STORE}','BAD-TRY','quick_link','Ada','ada@example.test','USD',1,0,0,1,'pending','pending','{}','{}','${LINK}',1,'2026-07-21','2026-07-21');`);
      denied(backend, `BEGIN; SET ROLE celebix_saas_owner; INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,billing_address,quick_order_link_id,version,created_at,updated_at) VALUES ('70000000-0000-4000-8000-000000000004','${STORE}','QL-4','quick_link','Ada','ada@example.test','TRY',10000,0,0,10000,'confirmed','completed','{}','{}','${LINK}',1,'2026-07-21','2026-07-21'); UPDATE saas.quick_order_links SET status='opened',opened_at='2026-07-21 12:01:00+00',version=2,updated_at='2026-07-21 12:01:00+00' WHERE id='${LINK}'; UPDATE saas.quick_order_links SET status='paid',paid_at='2026-07-21 12:02:00+00',order_id='70000000-0000-4000-8000-000000000004',version=3,updated_at='2026-07-21 12:02:00+00' WHERE id='${LINK}'; UPDATE saas.quick_order_links SET internal_label='changed',version=4,updated_at='2026-07-21 12:03:00+00' WHERE id='${LINK}';`);
    });

    await scenario("cancel and expiry guards prelock live attempts in deterministic order", async () => {
      assert.equal(psql(backend, `SELECT count(*) FROM saas.checkout_payment_attempts AS attempt JOIN saas.checkout_inventory_reservations AS reservation ON reservation.store_id=attempt.store_id AND reservation.attempt_id=attempt.id AND reservation.status='held' WHERE attempt.quick_order_link_id='${LINK}' AND attempt.status IN ('reserved','provider_ready','initiation_unknown');`), "1");
      const result = psql(backend, `SET ROLE celebix_saas_app; SELECT outcome FROM saas.quick_links_cancel('${STORE}','${PRINCIPAL}','${MEMBERSHIP}','${PLAN}','free_starter',1,'2026-07-21 12:01:00+00','${LINK}',1,'90000000-0000-4000-8000-000000000001',repeat('f',64));`);
      assert.equal(result, "invalid_transition");
      for (const transition of [
        `status='provider_ready',provider_ready_at='2026-07-21 12:01:00+00',provider_token_digest=repeat('1',64),provider_token_key_id='key-1',sealed_provider_token=${ENVELOPE}`,
        `status='initiation_unknown',initiation_unknown_at='2026-07-21 12:01:00+00'`,
      ]) {
        const outcome = psql(backend, `BEGIN; SET ROLE celebix_saas_owner; UPDATE saas.checkout_payment_attempts SET ${transition},version=2,updated_at='2026-07-21 12:01:00+00' WHERE id='${ATTEMPT}'; SET ROLE celebix_saas_app; SELECT outcome FROM saas.quick_links_cancel('${STORE}','${PRINCIPAL}','${MEMBERSHIP}','${PLAN}','free_starter',1,'2026-07-21 12:02:00+00','${LINK}',1,'90000000-0000-4000-8000-000000000003',repeat('7',64)); ROLLBACK;`);
        assert.equal(outcome, "invalid_transition");
      }
      denied(backend, `SET ROLE celebix_saas_owner; UPDATE saas.quick_order_links SET status='expired',version=2,updated_at='2026-07-21 12:01:00+00' WHERE id='${LINK}';`);
      const blocker = psqlAsync(backend, `BEGIN; SET ROLE celebix_saas_owner; SELECT 1 FROM saas.checkout_payment_attempts WHERE id='${ATTEMPT}' FOR UPDATE; SELECT pg_sleep(0.2); COMMIT; SELECT 'released';`);
      await new Promise((resolve) => setTimeout(resolve, 25));
      const concurrentCancel = psqlAsync(backend, `SET statement_timeout='3s'; SET ROLE celebix_saas_app; SELECT outcome FROM saas.quick_links_cancel('${STORE}','${PRINCIPAL}','${MEMBERSHIP}','${PLAN}','free_starter',1,'2026-07-21 12:02:00+00','${LINK}',1,'90000000-0000-4000-8000-000000000004',repeat('6',64));`);
      const [, concurrentOutcome] = await Promise.all([blocker, concurrentCancel]);
      assert.equal(concurrentOutcome, "invalid_transition");
      const definition = psql(backend, "SELECT pg_get_functiondef('saas.quick_links_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,uuid,text)'::regprocedure);");
      assert.ok(definition.indexOf("ORDER BY attempt.id") < definition.indexOf("SELECT link.* INTO current_link"));
    });

    await scenario("archive and settlement lock ordering completes without deadlock", async () => {
      psql(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.checkout_inventory_reservations(id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at) VALUES ('63000000-0000-4000-8000-000000000005','${STORE}','${ATTEMPT}','${LINK}','${PRODUCT}','${VARIANT_2}',999999,false,'held','2026-07-21 12:00:00+00',1,'2026-07-21 12:00:00+00');`);
      const settle = psqlAsync(backend, `BEGIN; SET ROLE celebix_saas_owner; SELECT 1 FROM saas.checkout_payment_attempts WHERE id='${ATTEMPT}' FOR UPDATE; SELECT 1 FROM saas.quick_order_links WHERE id='${LINK}' FOR UPDATE; SELECT 1 FROM saas.product_variants WHERE store_id='${STORE}' AND product_id='${PRODUCT}' ORDER BY id DESC FOR UPDATE; SELECT pg_sleep(0.2); SELECT 1 FROM saas.checkout_inventory_reservations WHERE attempt_id='${ATTEMPT}' ORDER BY variant_id DESC FOR UPDATE; UPDATE saas.checkout_inventory_reservations SET status='consumed',consumed_at='2026-07-21 12:02:00+00',version=2,updated_at='2026-07-21 12:02:00+00' WHERE attempt_id='${ATTEMPT}'; COMMIT; SELECT 'settled';`);
      await new Promise((resolve) => setTimeout(resolve, 30));
      const archive = psqlAsync(backend, `SET statement_timeout='3s'; SET ROLE celebix_saas_app; SELECT outcome FROM saas.catalog_archive_product('${STORE}','${PRINCIPAL}','${MEMBERSHIP}','${PLAN}','free_starter',1,100,'2026-07-21 12:03:00+00','90000000-0000-4000-8000-000000000002',repeat('9',64),'${PRODUCT}',1);`);
      const [settled, archived] = await Promise.all([settle, archive]);
      assert.match(settled, /settled/); assert.equal(archived.split("\n").at(-1), "archived");
    });

    await scenario("down restores exact 025 bodies then reapply and partial-start cleanup succeeds", async () => {
      apply(backend, "202607220026_quick_order_checkout_runtime.up.sql", ROLLBACK_DATABASE);
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
    });

    assert.equal(completed.length, TOTAL);
    process.stdout.write(`PASS ${TOTAL}/${TOTAL} quick-order runtime PostgreSQL 16 harness complete; rollback/reapply and cleanup confirmed\n`);
  } finally {
    stopPostgres(backend);
  }
}

await main();
