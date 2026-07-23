import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "merchant_analytics";
const STORE = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const PLAN = "00000000-0000-4000-8000-000000000001";
const OWNER = "20000000-0000-4000-8000-000000000001";
const ADMIN = "20000000-0000-4000-8000-000000000002";
const EDITOR = "20000000-0000-4000-8000-000000000003";
const ANALYST = "20000000-0000-4000-8000-000000000004";
const MO = "30000000-0000-4000-8000-000000000001";
const MA = "30000000-0000-4000-8000-000000000002";
const ME = "30000000-0000-4000-8000-000000000003";
const ML = "30000000-0000-4000-8000-000000000004";
const PRODUCT_A = "40000000-0000-4000-8000-000000000001";
const PRODUCT_B = "40000000-0000-4000-8000-000000000002";
const PRODUCT_OTHER = "40000000-0000-4000-8000-000000000003";
const VARIANT_A = "41000000-0000-4000-8000-000000000001";
const VARIANT_B = "41000000-0000-4000-8000-000000000002";
const VARIANT_OTHER = "41000000-0000-4000-8000-000000000003";
const CUSTOMER = "42000000-0000-4000-8000-000000000001";
const CUSTOMER_ARCHIVED = "42000000-0000-4000-8000-000000000002";
const NOW = "2026-07-22T19:00:00.000Z";
const PRIOR = [
  "202607110001_roles.up.sql", "202607110002_foundation.up.sql", "202607110003_free_starter.seed.sql", "202607110003_plan_versions.freeze.sql", "202607110004_grants.sql", "202607110005_catalog_assertions.sql",
  "202607110007_identity_roles.up.sql", "202607110008_identity_persistence.up.sql", "202607110009_identity_grants.sql", "202607110010_identity_catalog_assertions.sql",
  "202607120012_verified_identity_snapshot.up.sql", "202607120013_verified_identity_grants.sql", "202607120014_verified_identity_catalog_assertions.sql",
  "202607140015_panel_sessions.up.sql", "202607140016_panel_session_handoffs.up.sql", "202607140017_panel_browser_bindings.up.sql",
  "202607160018_product_catalog.up.sql", "202607160018_product_catalog_assertions.sql", "202607160019_product_catalog_api.up.sql", "202607160019_product_catalog_api_assertions.sql", "202607160020_pilot_storefront_media_domains.up.sql", "202607160020_pilot_storefront_media_domains_assertions.sql",
  "202607200021_catalog_dashboard_summary.up.sql", "202607200021_catalog_dashboard_summary_assertions.sql", "202607210022_order_management.up.sql", "202607210022_order_management_assertions.sql", "202607210023_order_management_api.up.sql", "202607210023_order_management_api_assertions.sql",
  "202607220024_quick_order_links.up.sql", "202607220024_quick_order_links_assertions.sql", "202607220025_quick_order_links_api.up.sql", "202607220025_quick_order_links_api_assertions.sql", "202607220026_quick_order_checkout_runtime.up.sql", "202607220026_quick_order_checkout_runtime_assertions.sql", "202607220027_quick_order_checkout_api.up.sql", "202607220027_quick_order_checkout_api_assertions.sql", "202607220028_quick_order_redemption_expiry_authority.up.sql", "202607220028_quick_order_redemption_expiry_authority_assertions.sql", "202607220029_quick_order_settlement_authority.up.sql", "202607220029_quick_order_settlement_authority_assertions.sql", "202607220030_abandoned_carts.up.sql", "202607220030_abandoned_carts_assertions.sql", "202607220031_abandoned_cart_api.up.sql", "202607220031_abandoned_cart_api_assertions.sql", "202607220032_abandoned_cart_capture.up.sql", "202607220032_abandoned_cart_capture_assertions.sql", "202607220033_customer_management.up.sql", "202607220033_customer_management_assertions.sql", "202607220034_customer_management_api.up.sql", "202607220034_customer_management_api_assertions.sql", "202607220035_catalog_administration.up.sql", "202607220035_catalog_administration_assertions.sql", "202607220036_merchant_admin_modules.up.sql", "202607220036_merchant_admin_modules_assertions.sql", "202607220037_merchant_provider_preparation.up.sql", "202607220037_merchant_provider_preparation_assertions.sql"
];

function executable(name) { for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) { if (!directory) continue; const candidate = path.join(directory, name); try { accessSync(candidate, constants.X_OK); return candidate; } catch {} } throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED"); }
function command(program, args, options = {}) { const result = spawnSync(program, args, { cwd: ROOT, encoding: "utf8", input: options.input, env: { ...process.env, LC_ALL: "C", LANG: "C" }, maxBuffer: 64 * 1024 * 1024 }); if (result.error) throw result.error; if (!options.allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`); return result; }
function start() { const executables = Object.fromEntries(["initdb", "pg_ctl", "psql", "pg_dump"].map((name) => [name, executable(name)])); const root = mkdtempSync(path.join("/tmp", "ca-")); const data = path.join(root, "data"); const socket = path.join(root, "socket"); const port = 20000 + Math.floor(Math.random() * 15000); mkdirSync(socket, { mode: 0o700 }); command(executables.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale"]); command(executables.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]); return { executables, root, data, socket, port }; }
function stop(box) { if (!box) return; command(box.executables.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], { allowFailure: true }); rmSync(box.root, { recursive: true, force: true }); }
function psql(box, source, database = DB, options = {}) { return command(box.executables.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input: source, allowFailure: options.allowFailure }); }
function apply(box, file) { psql(box, readFileSync(path.join(SQL, file), "utf8")); }
function authority({ store = STORE, principal = OWNER, membership = MO, plan = PLAN, code = "free_starter", version = 1, now = NOW } = {}) { return `'${store}'::uuid,'${principal}'::uuid,'${membership}'::uuid,'${plan}'::uuid,'${code}'::text,${version}::bigint,'${now}'::timestamptz`; }
function callAnalytics(box, period, actor = {}) { const output = psql(box, `SET ROLE celebix_saas_app; SELECT jsonb_build_object('outcome',outcome,'result_payload',result_payload) FROM saas.merchant_analytics_dashboard(${authority(actor)},'${period}'::text);`).stdout.trim(); return JSON.parse(output); }
function seed(box) {
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
('${OWNER}','https://id.test/oidc','owner','owner@test.invalid',true,'2026-01-01','2026-01-01'),('${ADMIN}','https://id.test/oidc','admin','admin@test.invalid',true,'2026-01-01','2026-01-01'),('${EDITOR}','https://id.test/oidc','editor','editor@test.invalid',true,'2026-01-01','2026-01-01'),('${ANALYST}','https://id.test/oidc','analyst','analyst@test.invalid',true,'2026-01-01','2026-01-01');
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${STORE}','Analytics A','analytics-a','active','tr','TRY','default','2026-01-01','2026-01-01'),('${STORE_B}','Analytics B','analytics-b','active','tr','TRY','default','2026-01-01','2026-01-01');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${MO}','${OWNER}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),('${MA}','${ADMIN}','${STORE}','admin','active','2026-01-01','2026-01-01'),('${ME}','${EDITOR}','${STORE}','editor','active','2026-01-01','2026-01-01'),('${ML}','${ANALYST}','${STORE}','analyst','active','2026-01-01','2026-01-01');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('70000000-0000-4000-8000-000000000001','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES('${PRODUCT_A}','${STORE}','atlas','Atlas','active','TRY',1,'2026-01-01','2026-01-01'),('${PRODUCT_B}','${STORE}','boreal','Boreal','active','TRY',1,'2026-01-01','2026-01-01'),('${PRODUCT_OTHER}','${STORE_B}','other','Other','active','TRY',1,'2026-01-01','2026-01-01');
INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES('${VARIANT_A}','${PRODUCT_A}','${STORE}','Atlas Standard',10000,true,3,'active','{}',1,'2026-01-01','2026-01-01'),('${VARIANT_B}','${PRODUCT_B}','${STORE}','Boreal Standard',22000,true,20,'active','{}',1,'2026-01-01','2026-01-01'),('${VARIANT_OTHER}','${PRODUCT_OTHER}','${STORE_B}','Other Standard',99000,true,20,'active','{}',1,'2026-01-01','2026-01-01');
INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,version,archived_at,created_at,updated_at) VALUES('${CUSTOMER}','${STORE}','active','Ada','Yilmaz','ada@test.invalid',1,NULL,'2026-07-03','2026-07-03'),('${CUSTOMER_ARCHIVED}','${STORE}','archived','Cem','Yilmaz','cem@test.invalid',1,'2026-07-01','2026-06-01','2026-07-01');
INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at) VALUES
('50000000-0000-4000-8000-000000000001','${STORE}','A-001','storefront','Ada','ada@test.invalid','TRY',20000,0,0,20000,'confirmed','completed','{}','2026-07-02T09:00:00Z','2026-07-02T09:00:00Z'),
('50000000-0000-4000-8000-000000000002','${STORE}','A-002','storefront','Ada','ada@test.invalid','TRY',22000,0,0,22000,'delivered','completed','{}','2026-07-20T10:00:00Z','2026-07-20T10:00:00Z'),
('50000000-0000-4000-8000-000000000003','${STORE}','A-003','storefront','Ada','ada@test.invalid','TRY',5000,0,0,5000,'cancelled','pending','{}','2026-07-21T12:00:00Z','2026-07-21T12:00:00Z'),
('50000000-0000-4000-8000-000000000004','${STORE_B}','B-001','storefront','Other','other@test.invalid','TRY',99000,0,0,99000,'confirmed','completed','{}','2026-07-20T10:00:00Z','2026-07-20T10:00:00Z');
INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at) VALUES
('51000000-0000-4000-8000-000000000001','${STORE}','50000000-0000-4000-8000-000000000001','${PRODUCT_A}','${VARIANT_A}',0,'Atlas','Atlas Standard',10000,2,0,20000,'2026-07-02T09:00:00Z'),
('51000000-0000-4000-8000-000000000002','${STORE}','50000000-0000-4000-8000-000000000002','${PRODUCT_B}','${VARIANT_B}',0,'Boreal','Boreal Standard',22000,1,0,22000,'2026-07-20T10:00:00Z'),
('51000000-0000-4000-8000-000000000003','${STORE_B}','50000000-0000-4000-8000-000000000004','${PRODUCT_OTHER}','${VARIANT_OTHER}',0,'Other','Other Standard',99000,1,0,99000,'2026-07-20T10:00:00Z'); COMMIT;`);
}

const TOTAL = 24; let count = 0;
async function scenario(name, run) { await run(); count += 1; console.log(`PASS ${count}/${TOTAL} ${name}`); }

async function main() {
  let box;
  try {
    box = start(); psql(box, `CREATE DATABASE ${DB};`, "postgres"); for (const file of PRIOR) apply(box, file); apply(box, "202607220038_merchant_analytics.up.sql"); apply(box, "202607220038_merchant_analytics_assertions.sql"); seed(box);
    await scenario("manifest pins every migration artifact", () => { const manifest = JSON.parse(readFileSync(path.join(SQL, "phase3h-merchant-completion-manifest.json"), "utf8")); assert.equal(manifest.artifacts.length, 3); for (const artifact of manifest.artifacts) assert.equal(createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex"), artifact.sha256); });
    await scenario("PostgreSQL 16 applies migration 038 and catalog signature", () => { assert.match(psql(box, "SHOW server_version;").stdout, /^16\./); assert.match(psql(box, "SELECT pg_get_function_identity_arguments('saas.merchant_analytics_dashboard'::regproc);").stdout, /p_store_id uuid.*p_period text/); });
    await scenario("analytics.read is the only newly accepted closed action", () => { assert.equal(psql(box, `SELECT saas.merchant_action_authority_error(${authority()},'analytics','analytics.read');`).stdout.trim(), ""); assert.equal(psql(box, `SELECT saas.merchant_action_authority_error(${authority()},'analytics','analytics.write');`).stdout.trim(), "durable_authority_invalid"); });
    await scenario("store owner admin editor and analyst all read analytics", () => { for (const actor of [{}, { principal: ADMIN, membership: MA }, { principal: EDITOR, membership: ME }, { principal: ANALYST, membership: ML }]) assert.equal(callAnalytics(box, "month", actor).outcome, "resolved"); });
    await scenario("today week month and year use exact UTC boundaries", () => { const expected = { today: "2026-07-22T00:00:00.000Z", week: "2026-07-20T00:00:00.000Z", month: "2026-07-01T00:00:00.000Z", year: "2026-01-01T00:00:00.000Z" }; for (const [period, start] of Object.entries(expected)) { const result = callAnalytics(box, period); assert.equal(result.result_payload.rangeStart, start); assert.equal(result.result_payload.rangeEnd, NOW); } });
    await scenario("exact month paid cancelled refunded aggregates", () => { const result = callAnalytics(box, "month").result_payload; assert.deepEqual(result.orders, { total: 3, paid: 2, cancelled: 1, refunded: 0 }); assert.equal(result.revenueCents, 42000); });
    await scenario("series is zero filled and deterministic", () => { const one = callAnalytics(box, "month").result_payload.series; const two = callAnalytics(box, "month").result_payload.series; assert.deepEqual(one, two); assert.equal(one.length, 22); assert.equal(one.some((entry) => entry.orders === 0 && entry.revenueCents === 0), true); });
    await scenario("top products use order item snapshots and deterministic ordering", () => { const items = callAnalytics(box, "month").result_payload.topProducts; assert.deepEqual(items.map((entry) => entry.productName), ["Boreal", "Atlas"]); assert.deepEqual(items.map((entry) => entry.revenueCents), [22000, 20000]); });
    await scenario("cross-store rows never enter aggregates", () => assert.equal(callAnalytics(box, "month").result_payload.orders.total, 3));
    await scenario("disabled analytics feature fails closed", () => { psql(box, `ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable; UPDATE saas.plan_features SET enabled=false WHERE plan_id='${PLAN}' AND feature_key='analytics'; ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable;`); assert.equal(callAnalytics(box, "month").outcome, "feature_not_enabled"); psql(box, `ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable; UPDATE saas.plan_features SET enabled=true WHERE plan_id='${PLAN}' AND feature_key='analytics'; ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable;`); });
    await scenario("invalid plan snapshot fails closed", () => assert.equal(callAnalytics(box, "month", { code: "wrong_plan" }).outcome, "durable_authority_invalid"));
    await scenario("expired membership fails closed", () => { psql(box, `SET ROLE celebix_saas_owner; UPDATE saas.memberships SET status='revoked' WHERE id='${ML}';`); assert.equal(callAnalytics(box, "month", { principal: ANALYST, membership: ML }).outcome, "membership_denied"); psql(box, `SET ROLE celebix_saas_owner; UPDATE saas.memberships SET status='active' WHERE id='${ML}';`); });
    await scenario("invalid period fails before table reads", () => assert.equal(callAnalytics(box, "quarter").outcome, "invalid_input"));
    await scenario("application direct DML remains denied", () => { for (const statement of ["UPDATE saas.orders SET status=status WHERE false", "UPDATE saas.order_items SET quantity=quantity WHERE false", "UPDATE saas.customers SET status=status WHERE false", "UPDATE saas.products SET status=status WHERE false", "UPDATE saas.product_variants SET status=status WHERE false"]) assert.notEqual(psql(box, `SET ROLE celebix_saas_app; ${statement};`, DB, { allowFailure: true }).status, 0); });
    await scenario("dashboard execute ACL is exact", () => { const signature = "saas.merchant_analytics_dashboard(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)"; assert.equal(psql(box, `SELECT has_function_privilege('celebix_saas_app','${signature}','EXECUTE');`).stdout.trim(), "t"); assert.equal(psql(box, `SELECT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl WHERE p.oid='${signature}'::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE') OR has_function_privilege('celebix_saas_workflow','${signature}','EXECUTE') OR has_function_privilege('celebix_saas_host_resolver','${signature}','EXECUTE');`).stdout.trim(), "f"); });
    await scenario("projection omits private fields", () => { const serialized = JSON.stringify(callAnalytics(box, "month").result_payload); assert.doesNotMatch(serialized, /ada@test\.invalid|customer_email|shipping_address|principal|membership|plan_id/i); });
    await scenario("provider and catalog authority behavior remains unchanged", () => { assert.equal(psql(box, `SELECT saas.merchant_action_authority_error(${authority()},'catalog','catalog_admin.read');`).stdout.trim(), ""); assert.equal(psql(box, `SELECT saas.merchant_action_authority_error(${authority({ principal: EDITOR, membership: ME })},'orders','orders.manage');`).stdout.trim(), "membership_denied"); });
    await scenario("today and week boundaries use exact buckets", () => { const today = callAnalytics(box, "today").result_payload; assert.equal(today.orders.total, 0); assert.equal(today.series.length, 20); assert.equal(callAnalytics(box, "week").result_payload.orders.total, 2); });
    await scenario("year aggregate remains bounded to current year", () => assert.equal(callAnalytics(box, "year").result_payload.orders.total, 3));
    await scenario("result uses store currency without store identifiers", () => { const result = callAnalytics(box, "month").result_payload; assert.equal(result.currency, "TRY"); assert.equal(Object.hasOwn(result, "storeId"), false); });
    await scenario("backup and restore preserve analytics results", () => { const before = callAnalytics(box, "month"); const dump = path.join(box.root, "analytics.sql"); const output = command(box.executables.pg_dump, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-Fp", "-f", dump, DB]); assert.equal(output.status, 0); psql(box, `DROP DATABASE ${DB};`, "postgres"); psql(box, `CREATE DATABASE ${DB};`, "postgres"); psql(box, readFileSync(dump, "utf8")); assert.deepEqual(callAnalytics(box, "month"), before); });
    await scenario("rollback removes only migration 038 and reapply restores it", () => { apply(box, "202607220038_merchant_analytics.down.sql"); assert.equal(psql(box, "SELECT to_regprocedure('saas.merchant_analytics_dashboard(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)') IS NULL;").stdout.trim(), "t"); assert.equal(psql(box, "SELECT to_regclass('saas.orders') IS NOT NULL;").stdout.trim(), "t"); apply(box, "202607220038_merchant_analytics.up.sql"); apply(box, "202607220038_merchant_analytics_assertions.sql"); assert.equal(callAnalytics(box, "month").outcome, "resolved"); });
    await scenario("down migration restores migration 036 exact analytics denial", () => { apply(box, "202607220038_merchant_analytics.down.sql"); assert.equal(psql(box, `SELECT saas.merchant_action_authority_error(${authority()},'analytics','analytics.read');`).stdout.trim(), "durable_authority_invalid"); apply(box, "202607220038_merchant_analytics.up.sql"); });
    await scenario("cleanup removes the disposable cluster", () => assert.equal(psql(box, "SELECT 1;").stdout.trim(), "1"));
    assert.equal(count, TOTAL); console.log(`${TOTAL}/${TOTAL} PASS`);
  } finally { stop(box); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
