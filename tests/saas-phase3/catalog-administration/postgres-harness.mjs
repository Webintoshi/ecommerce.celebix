import assert from "node:assert/strict";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "catalog_administration";
const STORE = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const PLAN = "00000000-0000-4000-8000-000000000001";
const OWNER = "20000000-0000-4000-8000-000000000001";
const EDITOR = "20000000-0000-4000-8000-000000000002";
const ANALYST = "20000000-0000-4000-8000-000000000003";
const MO = "30000000-0000-4000-8000-000000000001";
const ME = "30000000-0000-4000-8000-000000000002";
const MA = "30000000-0000-4000-8000-000000000003";
const PRODUCT = "40000000-0000-4000-8000-000000000001";
const PRODUCT_B = "40000000-0000-4000-8000-000000000002";
const RESOURCE = "50000000-0000-4000-8000-000000000001";
const REVIEW = "60000000-0000-4000-8000-000000000001";
const NOW = "2026-07-22T18:00:00.000Z";
const prior = ["202607110001_roles.up.sql","202607110002_foundation.up.sql","202607110003_free_starter.seed.sql","202607110003_plan_versions.freeze.sql","202607110004_grants.sql","202607110005_catalog_assertions.sql","202607110007_identity_roles.up.sql","202607110008_identity_persistence.up.sql","202607110009_identity_grants.sql","202607110010_identity_catalog_assertions.sql","202607120012_verified_identity_snapshot.up.sql","202607120013_verified_identity_grants.sql","202607120014_verified_identity_catalog_assertions.sql","202607140015_panel_sessions.up.sql","202607140016_panel_session_handoffs.up.sql","202607140017_panel_browser_bindings.up.sql","202607160018_product_catalog.up.sql","202607160018_product_catalog_assertions.sql","202607160019_product_catalog_api.up.sql","202607160019_product_catalog_api_assertions.sql","202607160020_pilot_storefront_media_domains.up.sql","202607160020_pilot_storefront_media_domains_assertions.sql","202607200021_catalog_dashboard_summary.up.sql","202607200021_catalog_dashboard_summary_assertions.sql","202607210022_order_management.up.sql","202607210022_order_management_assertions.sql","202607210023_order_management_api.up.sql","202607210023_order_management_api_assertions.sql","202607220024_quick_order_links.up.sql","202607220024_quick_order_links_assertions.sql","202607220025_quick_order_links_api.up.sql","202607220025_quick_order_links_api_assertions.sql","202607220026_quick_order_checkout_runtime.up.sql","202607220026_quick_order_checkout_runtime_assertions.sql","202607220027_quick_order_checkout_api.up.sql","202607220027_quick_order_checkout_api_assertions.sql","202607220028_quick_order_redemption_expiry_authority.up.sql","202607220028_quick_order_redemption_expiry_authority_assertions.sql","202607220029_quick_order_settlement_authority.up.sql","202607220029_quick_order_settlement_authority_assertions.sql","202607220030_abandoned_carts.up.sql","202607220030_abandoned_carts_assertions.sql","202607220031_abandoned_cart_api.up.sql","202607220031_abandoned_cart_api_assertions.sql","202607220032_abandoned_cart_capture.up.sql","202607220032_abandoned_cart_capture_assertions.sql","202607220033_customer_management.up.sql","202607220033_customer_management_assertions.sql","202607220034_customer_management_api.up.sql","202607220034_customer_management_api_assertions.sql"];

function executable(name) { for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) { if (!directory) continue; const candidate = path.join(directory, name); try { accessSync(candidate, constants.X_OK); return candidate; } catch {} } throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED"); }
function command(program, args, options = {}) { const result = spawnSync(program, args, { cwd: ROOT, encoding: "utf8", input: options.input, env: { ...process.env, LC_ALL: "C", LANG: "C" }, maxBuffer: 64 * 1024 * 1024 }); if (result.error) throw result.error; if (!options.allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`); return result; }
function start() { const executables = Object.fromEntries(["initdb", "pg_ctl", "psql"].map((name) => [name, executable(name)])); const root = mkdtempSync(path.join(tmpdir(), "celebix-catalog-admin-")); const data = path.join(root, "data"); const socket = path.join(root, "socket"); const port = 20000 + Math.floor(Math.random() * 15000); mkdirSync(socket, { mode: 0o700 }); command(executables.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale"]); command(executables.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]); return { executables, root, data, socket, port }; }
function stop(box) { if (!box) return; command(box.executables.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], { allowFailure: true }); rmSync(box.root, { recursive: true, force: true }); }
function psql(box, source, database = DB, options = {}) { return command(box.executables.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input: source, allowFailure: options.allowFailure }); }
function apply(box, file) { psql(box, readFileSync(path.join(SQL, file), "utf8")); }
function authority({ principal = OWNER, membership = MO } = {}) { return `'${STORE}'::uuid,'${principal}'::uuid,'${membership}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${NOW}'::timestamptz`; }
function api(box, name, extra = "", actor = {}) { const output = psql(box, `SET ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.${name}(${authority(actor)}${extra ? `,${extra}` : ""});`).stdout.trim(); return JSON.parse(output); }
function seed(box) { psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES('${OWNER}','https://id.test/oidc','owner','owner@test.invalid',true,'2026-01-01','2026-01-01'),('${EDITOR}','https://id.test/oidc','editor','editor@test.invalid',true,'2026-01-01','2026-01-01'),('${ANALYST}','https://id.test/oidc','analyst','analyst@test.invalid',true,'2026-01-01','2026-01-01');
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${STORE}','Catalog A','catalog-a','active','tr','TRY','default','2026-01-01','2026-01-01'),('${STORE_B}','Catalog B','catalog-b','active','tr','TRY','default','2026-01-01','2026-01-01');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES('${MO}','${OWNER}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),('${ME}','${EDITOR}','${STORE}','editor','active','2026-01-01','2026-01-01'),('${MA}','${ANALYST}','${STORE}','analyst','active','2026-01-01','2026-01-01');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES('70000000-0000-4000-8000-000000000001','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES('${PRODUCT}','${STORE}','keten-gomlek','Keten Gomlek','active','TRY',1,'2026-01-01','2026-01-01'),('${PRODUCT_B}','${STORE_B}','baska-urun','Baska Urun','active','TRY',1,'2026-01-01','2026-01-01');
INSERT INTO saas.product_reviews(id,store_id,product_id,reviewer_name,rating,review_title,review_body,status,version,created_at,updated_at) VALUES('${REVIEW}','${STORE}','${PRODUCT}','Ada',5,'Harika','Cok memnun kaldim.','pending',1,'2026-01-02','2026-01-02');COMMIT;`); }
let count = 0;
async function scenario(name, run) { await run(); count += 1; console.log(`PASS ${count}/16 ${name}`); }

async function main() { let box; try { box = start(); psql(box, `CREATE DATABASE ${DB};`, "postgres"); for (const file of prior) apply(box, file); apply(box, "202607220035_catalog_administration.up.sql"); apply(box, "202607220035_catalog_administration_assertions.sql"); seed(box);
  await scenario("manifest pins every migration artifact", () => { const manifest = JSON.parse(readFileSync(path.join(SQL, "phase3c2-catalog-administration-manifest.json"), "utf8")); assert.equal(manifest.artifacts.length, 3); for (const artifact of manifest.artifacts) assert.equal(createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex"), artifact.sha256); });
  await scenario("PostgreSQL 16 applies migration 035", () => assert.match(psql(box, "SHOW server_version;").stdout, /^16\./));
  await scenario("all catalog administration tables force RLS", () => assert.equal(psql(box, "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relname IN('catalog_admin_resources','catalog_admin_resource_products','product_reviews','catalog_import_jobs','catalog_admin_operations') AND c.relrowsecurity AND c.relforcerowsecurity;").stdout.trim(), "5"));
  await scenario("runtime has no direct table writes", () => assert.notEqual(psql(box, `SET ROLE celebix_saas_app;INSERT INTO saas.catalog_admin_resources(id,store_id,resource_kind,name,slug,status,version,created_at,updated_at) VALUES(gen_random_uuid(),'${STORE}','brand','X','x','active',1,now(),now());`, DB, { allowFailure: true }).status, 0));
  const save = `'80000000-0000-4000-8000-000000000001'::uuid,'${"a".repeat(64)}','${RESOURCE}'::uuid,NULL,'collection','Yeni Gelenler','yeni-gelenler','Vitrin koleksiyonu','{"featured":true}'::jsonb,ARRAY['${PRODUCT}'::uuid]`;
  await scenario("owner creates a product-backed collection", () => assert.equal(api(box, "catalog_admin_save_resource", save).outcome, "saved"));
  await scenario("resource list projects truthful product count", () => { const value = api(box, "catalog_admin_list_resources", "'collection'"); assert.equal(value.result.items[0].productCount, 1); });
  await scenario("same operation replays", () => assert.equal(api(box, "catalog_admin_save_resource", save).outcome, "operation_replayed"));
  await scenario("operation mismatch is denied", () => assert.equal(api(box, "catalog_admin_save_resource", save.replace("a".repeat(64), "b".repeat(64))).outcome, "operation_mismatch"));
  await scenario("analyst reads resources", () => assert.equal(api(box, "catalog_admin_list_resources", "'collection'", { principal: ANALYST, membership: MA }).outcome, "listed"));
  await scenario("analyst cannot mutate resources", () => assert.equal(api(box, "catalog_admin_save_resource", save.replace("80000000-0000-4000-8000-000000000001", "80000000-0000-4000-8000-000000000002"), { principal: ANALYST, membership: MA }).outcome, "membership_denied"));
  await scenario("cross-store product assignment is denied", () => { const input = save.replace("80000000-0000-4000-8000-000000000001", "80000000-0000-4000-8000-000000000003").replace(PRODUCT, PRODUCT_B).replace(RESOURCE, "50000000-0000-4000-8000-000000000003"); assert.equal(api(box, "catalog_admin_save_resource", input).outcome, "invalid_input"); });
  await scenario("review list exposes no reviewer credential", () => { const review = api(box, "catalog_admin_list_reviews", "'pending'").result.items[0]; assert.equal(review.rating, 5); assert.equal(Object.hasOwn(review, "reviewerEmail"), false); });
  await scenario("owner moderates a review", () => assert.equal(api(box, "catalog_admin_moderate_review", `'80000000-0000-4000-8000-000000000004','${"c".repeat(64)}','${REVIEW}',1,'approved','Tesekkur ederiz.'`).outcome, "moderated"));
  const rows = JSON.stringify([{ productId: "41000000-0000-4000-8000-000000000001", variantId: "42000000-0000-4000-8000-000000000001", title: "Yeni Urun", slug: "yeni-urun", priceCents: 12900, sku: "YENI-1", stockQuantity: 8 }]).replaceAll("'", "''");
  await scenario("bulk import creates durable products and job", () => assert.equal(api(box, "catalog_admin_import_products", `100,'80000000-0000-4000-8000-000000000005','${"d".repeat(64)}','90000000-0000-4000-8000-000000000001','urunler.csv','${rows}'::jsonb`).outcome, "imported"));
  await scenario("import list omits raw rows", () => { const job = api(box, "catalog_admin_list_imports").result.items[0]; assert.equal(job.succeededRows, 1); assert.equal(Object.hasOwn(job, "rows"), false); });
  await scenario("035 rollback and reapply is clean", () => { apply(box, "202607220035_catalog_administration.down.sql"); assert.equal(psql(box, "SELECT to_regclass('saas.catalog_admin_resources') IS NULL;").stdout.trim(), "t"); apply(box, "202607220035_catalog_administration.up.sql"); apply(box, "202607220035_catalog_administration_assertions.sql"); });
  assert.equal(count, 16); console.log("16/16 PASS");
} finally { stop(box); } }
main().catch((error) => { console.error(error); process.exitCode = 1; });
