import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DATABASE = `manual_order_drafts_${randomBytes(5).toString("hex")}`;
const PLAN = "00000000-0000-4000-8000-000000000001";
const STORE = "10000000-0000-4000-8000-000000000078";
const STORE_B = "10000000-0000-4000-8000-000000000079";
const PRINCIPAL = "20000000-0000-4000-8000-000000000078";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000078";
const PRODUCT = "40000000-0000-4000-8000-000000000078";
const VARIANT = "50000000-0000-4000-8000-000000000078";
const UNTRACKED_VARIANT = "50000000-0000-4000-8000-000000000079";
const CUSTOMER = "60000000-0000-4000-8000-000000000078";
const DRAFT = "70000000-0000-4000-8000-000000000078";
const ARCHIVE_DRAFT = "70000000-0000-4000-8000-000000000079";
const LINE = "80000000-0000-4000-8000-000000000078";
const CREATE_OPERATION = "90000000-0000-4000-8000-000000000078";
const UPDATE_OPERATION = "90000000-0000-4000-8000-000000000079";
const CONVERT_OPERATION = "90000000-0000-4000-8000-000000000080";
const CANCEL_OPERATION = "90000000-0000-4000-8000-000000000081";
const ARCHIVE_CREATE_OPERATION = "90000000-0000-4000-8000-000000000082";
const ARCHIVE_OPERATION = "90000000-0000-4000-8000-000000000083";
const FINGERPRINT = "a".repeat(64);
const NOW = "2026-08-01T12:00:00.000Z";
const LATER = "2026-08-01T12:05:00.000Z";
const ADDRESS = { recipientName: "Ada Lovelace", line1: "Ada Sokak 1", district: "Kadikoy", city: "Istanbul", postalCode: "34710", country: "TR" };
const CONTRACT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const PRIOR = [
  "202607110001_roles.up.sql", "202607110002_foundation.up.sql", "202607110003_free_starter.seed.sql", "202607110003_plan_versions.freeze.sql", "202607110004_grants.sql", "202607110005_catalog_assertions.sql",
  "202607110007_identity_roles.up.sql", "202607110008_identity_persistence.up.sql", "202607110009_identity_grants.sql", "202607110010_identity_catalog_assertions.sql",
  "202607120012_verified_identity_snapshot.up.sql", "202607120013_verified_identity_grants.sql", "202607120014_verified_identity_catalog_assertions.sql",
  "202607140015_panel_sessions.up.sql", "202607140016_panel_session_handoffs.up.sql", "202607140017_panel_browser_bindings.up.sql",
  "202607160018_product_catalog.up.sql", "202607160018_product_catalog_assertions.sql", "202607160019_product_catalog_api.up.sql", "202607160019_product_catalog_api_assertions.sql", "202607160020_pilot_storefront_media_domains.up.sql", "202607160020_pilot_storefront_media_domains_assertions.sql",
  "202607200021_catalog_dashboard_summary.up.sql", "202607200021_catalog_dashboard_summary_assertions.sql",
  "202607210022_order_management.up.sql", "202607210022_order_management_assertions.sql", "202607210023_order_management_api.up.sql", "202607210023_order_management_api_assertions.sql",
  "202607220024_quick_order_links.up.sql", "202607220024_quick_order_links_assertions.sql", "202607220025_quick_order_links_api.up.sql", "202607220025_quick_order_links_api_assertions.sql",
  "202607220026_quick_order_checkout_runtime.up.sql", "202607220026_quick_order_checkout_runtime_assertions.sql", "202607220027_quick_order_checkout_api.up.sql", "202607220027_quick_order_checkout_api_assertions.sql",
  "202607220028_quick_order_redemption_expiry_authority.up.sql", "202607220028_quick_order_redemption_expiry_authority_assertions.sql", "202607220029_quick_order_settlement_authority.up.sql", "202607220029_quick_order_settlement_authority_assertions.sql",
  "202607220030_abandoned_carts.up.sql", "202607220030_abandoned_carts_assertions.sql", "202607220031_abandoned_cart_api.up.sql", "202607220031_abandoned_cart_api_assertions.sql", "202607220032_abandoned_cart_capture.up.sql", "202607220032_abandoned_cart_capture_assertions.sql",
  "202607220033_customer_management.up.sql", "202607220033_customer_management_assertions.sql", "202607220034_customer_management_api.up.sql", "202607220034_customer_management_api_assertions.sql",
  "202607220035_catalog_administration.up.sql", "202607220035_catalog_administration_assertions.sql", "202607220036_merchant_admin_modules.up.sql", "202607220036_merchant_admin_modules_assertions.sql", "202607220037_merchant_provider_preparation.up.sql", "202607220037_merchant_provider_preparation_assertions.sql",
  "202607220038_merchant_analytics.up.sql", "202607220038_merchant_analytics_assertions.sql", "202607220039_typed_storefront_settings.up.sql", "202607220039_typed_storefront_settings_assertions.sql", "202607220040_advanced_seo_preferences.up.sql", "202607220040_advanced_seo_preferences_assertions.sql", "202607220041_catalog_import_previews.up.sql", "202607220041_catalog_import_previews_assertions.sql", "202607220042_catalog_product_tags.up.sql", "202607220042_catalog_product_tags_assertions.sql",
];

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* try next */ }
  }
  return null;
}

function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, { cwd: ROOT, encoding: "utf8", input, env: { ...process.env, PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" }, maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}

function start() {
  assertSafeEnvironment();
  const tools = Object.fromEntries([...new Set(REQUIRED_NATIVE_TOOLS)].map((name) => [name, executable(name)]));
  if (Object.values(tools).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const root = mkdtempSync("/tmp/celebix-manual-order-drafts-");
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

function psql(box, source, database = DATABASE, allowFailure = false) {
  return command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], source, allowFailure).stdout.trim();
}

function apply(box, file) { psql(box, readFileSync(path.join(SQL, file), "utf8")); }
function authority(store = STORE) { return `'${store}'::uuid,'${PRINCIPAL}'::uuid,'${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${NOW}'::timestamptz`; }
function result(box, call) { return JSON.parse(psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${call};COMMIT;`)); }
function intent({ quantity = 2, priceDiscount = 100, expectedVersion, adjustInventory = true } = {}) {
  return { customerId: CUSTOMER, customerName: "Ada Lovelace", customerEmail: "ada@example.com", customerPhone: "+905551112233", currency: "TRY", shippingCents: 500, discountCents: 100, shippingAddress: ADDRESS, billingAddress: ADDRESS, note: "Hediye paketi", adjustInventory, lines: [{ lineId: LINE, productId: PRODUCT, variantId: VARIANT, quantity, discountCents: priceDiscount }], ...(expectedVersion === undefined ? {} : { expectedVersion }) };
}
function createCall({ draft = DRAFT, operation = CREATE_OPERATION, fingerprint = FINGERPRINT, value = intent() } = {}) { return `saas.order_drafts_create(${authority()},'${operation}'::uuid,'${fingerprint}','${draft}'::uuid,'${JSON.stringify(value)}'::jsonb)`; }
function updateCall({ fingerprint = FINGERPRINT, expected = 1, value = intent({ expectedVersion: expected }) } = {}) { return `saas.order_drafts_update(${authority()},'${UPDATE_OPERATION}'::uuid,'${fingerprint}','${DRAFT}'::uuid,${expected},'${JSON.stringify(value)}'::jsonb)`; }
function convertCall({ fingerprint = FINGERPRINT, expected = 2 } = {}) { return `saas.order_drafts_convert(${authority()},'${CONVERT_OPERATION}'::uuid,'${fingerprint}','${DRAFT}'::uuid,${expected})`; }

function seed(box) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${PRINCIPAL}','https://identity.example.test/oidc','manual-order-owner','owner@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${STORE}','Manual Orders','manual-orders-78','active','tr','TRY','default','2026-01-01','2026-01-01'),('${STORE_B}','Other Store','other-store-79','active','tr','TRY','default','2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${MEMBERSHIP}','${PRINCIPAL}','${STORE}','store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('31000000-0000-4000-8000-000000000078','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
    INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES('${PRODUCT}','${STORE}','atlas-kolye','Atlas Kolye','active','TRY',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,cost_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES('${VARIANT}','${PRODUCT}','${STORE}','Altın','ATL-KOL-ALT',1000,500,true,10,'active','{}',1,'2026-01-01','2026-01-01'),('${UNTRACKED_VARIANT}','${PRODUCT}','${STORE}','Dijital','ATL-KOL-DIJ',500,0,false,0,'active','{}',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,phone,version,created_at,updated_at) VALUES('${CUSTOMER}','${STORE}','active','Ada','Lovelace','ada@example.com','+905551112233',1,'2026-01-01','2026-01-01');
    COMMIT;`);
}

function main() {
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DATABASE};`, "postgres");
    for (const file of PRIOR) apply(box, file);
    seed(box);
    apply(box, "202607220043_inventory_purchasing.up.sql");
    apply(box, "202607220043_inventory_purchasing_assertions.sql");
    apply(box, "202608010078_manual_order_drafts.up.sql");
    apply(box, "202608010078_manual_order_drafts_assertions.sql");
    apply(box, "202608010079_manual_order_uuid_contract.up.sql");
    apply(box, "202608010079_manual_order_uuid_contract_assertions.sql");
    assert.match(psql(box, "SHOW server_version;"), /^16[.]/);

    apply(box, "202608010079_manual_order_uuid_contract.down.sql");
    apply(box, "202608010078_manual_order_drafts.down.sql");
    assert.equal(psql(box, "SELECT pg_catalog.to_regclass('saas.order_drafts') IS NULL;"), "t");
    apply(box, "202608010078_manual_order_drafts.up.sql");
    apply(box, "202608010078_manual_order_drafts_assertions.sql");
    apply(box, "202608010079_manual_order_uuid_contract.up.sql");
    apply(box, "202608010079_manual_order_uuid_contract_assertions.sql");

    const created = result(box, createCall());
    assert.equal(created.outcome, "created");
    assert.equal(created.result.version, 1);
    assert.equal(created.result.subtotalCents, 1900);
    assert.equal(created.result.totalCents, 2300);
    assert.equal(created.result.lines[0].unitPriceCents, 1000);
    assert.deepEqual(result(box, createCall()), { outcome: "operation_replayed", result: created.result });
    assert.equal(result(box, createCall({ fingerprint: "b".repeat(64) })).outcome, "operation_mismatch");

    const listed = result(box, `saas.order_drafts_list(${authority()},20,NULL,NULL)`);
    assert.equal(listed.outcome, "listed");
    assert.equal(listed.result.items.length, 1);
    assert.equal(result(box, `saas.order_drafts_get(${authority()},'${DRAFT}'::uuid)`).result.id, DRAFT);
    assert.equal(result(box, `saas.order_drafts_get(${authority(STORE_B)},'${DRAFT}'::uuid)`).outcome, "membership_denied");

    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.product_variants SET price_cents=1200,version=version+1,updated_at='${LATER}' WHERE store_id='${STORE}' AND id='${VARIANT}';COMMIT;`);
    assert.equal(result(box, updateCall({ expected: 9, value: intent({ expectedVersion: 9 }) })).outcome, "version_conflict");
    const updated = result(box, updateCall());
    assert.equal(updated.outcome, "updated");
    assert.equal(updated.result.version, 2);
    assert.equal(updated.result.lines[0].unitPriceCents, 1200);
    assert.equal(updated.result.subtotalCents, 2300);

    const converted = result(box, convertCall());
    assert.equal(converted.outcome, "converted");
    assert.equal(converted.result.adjustedInventory, true);
    assert.match(converted.result.orderId, CONTRACT_UUID);
    assert.match(converted.result.orderNumber, /^MAN-[0-9a-f]{20}$/);
    assert.equal(psql(box, `SELECT stock_quantity FROM saas.product_variants WHERE store_id='${STORE}' AND id='${VARIANT}';`), "8");
    assert.equal(psql(box, `SELECT source||':'||status||':'||payment_status FROM saas.orders WHERE store_id='${STORE}' AND id='${converted.result.orderId}';`), "manual:pending:pending");
    assert.equal(psql(box, `SELECT count(*) FROM saas.order_items WHERE store_id='${STORE}' AND order_id='${converted.result.orderId}';`), "1");
    assert.match(psql(box, `SELECT id::text FROM saas.order_items WHERE store_id='${STORE}' AND order_id='${converted.result.orderId}';`), CONTRACT_UUID);
    assert.match(psql(box, `SELECT id::text FROM saas.order_events WHERE store_id='${STORE}' AND order_id='${converted.result.orderId}' AND event_type='order_created';`), CONTRACT_UUID);
    assert.equal(psql(box, `SELECT count(*) FROM saas.manual_order_inventory_commitments WHERE store_id='${STORE}' AND order_id='${converted.result.orderId}' AND restoration_operation_id IS NULL;`), "1");
    assert.equal(result(box, convertCall()).outcome, "operation_replayed");
    assert.equal(psql(box, `SELECT stock_quantity FROM saas.product_variants WHERE store_id='${STORE}' AND id='${VARIANT}';`), "8");

    const cancelCall = `saas.orders_transition_status(${authority()},'${CANCEL_OPERATION}'::uuid,'${FINGERPRINT}','${converted.result.orderId}'::uuid,1,'cancelled')`;
    assert.equal(result(box, cancelCall).outcome, "committed");
    assert.match(psql(box, `SELECT id::text FROM saas.order_events WHERE store_id='${STORE}' AND order_id='${converted.result.orderId}' AND event_type='status_transition';`), CONTRACT_UUID);
    assert.equal(psql(box, `SELECT stock_quantity FROM saas.product_variants WHERE store_id='${STORE}' AND id='${VARIANT}';`), "10");
    assert.equal(result(box, cancelCall).outcome, "operation_replayed");
    assert.equal(psql(box, `SELECT stock_quantity FROM saas.product_variants WHERE store_id='${STORE}' AND id='${VARIANT}';`), "10");
    assert.equal(psql(box, `SELECT count(*) FROM saas.inventory_movements WHERE store_id='${STORE}' AND variant_id='${VARIANT}' AND source_id='${CANCEL_OPERATION}';`), "1");

    const archiveValue = { ...intent({ adjustInventory: false }), lines: [{ ...intent().lines[0], lineId: "80000000-0000-4000-8000-000000000079" }] };
    assert.equal(result(box, createCall({ draft: ARCHIVE_DRAFT, operation: ARCHIVE_CREATE_OPERATION, value: archiveValue })).outcome, "created");
    const archived = result(box, `saas.order_drafts_archive(${authority()},'${ARCHIVE_OPERATION}'::uuid,'${FINGERPRINT}','${ARCHIVE_DRAFT}'::uuid,1)`);
    assert.equal(archived.outcome, "archived");
    assert.equal(archived.result.status, "archived");

    const immutable = command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DATABASE], `SET ROLE celebix_saas_owner;DELETE FROM saas.order_draft_operations WHERE operation_id='${CREATE_OPERATION}';`, true);
    assert.notEqual(immutable.status, 0);
    assert.match(immutable.stderr, /ORDER_DRAFT_OPERATION_IMMUTABLE/);
    assert.equal(psql(box, "SELECT has_function_privilege('public','saas.order_drafts_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,jsonb)','EXECUTE');"), "f");

    process.stdout.write("PASS manual order drafts are tenant-safe, replay-safe, inventory-correct, rollback-safe, and PostgreSQL 16 verified\n");
  } finally {
    stop(box);
  }
}

main();
