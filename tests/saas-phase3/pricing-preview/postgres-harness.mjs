import assert from "node:assert/strict";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "pricing_preview";
const RESTORED = "pricing_preview_restored";
const PLAN = "00000000-0000-4000-8000-000000000001";
const STORE = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const OWNER = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000001";
const MEMBERSHIP_B = "30000000-0000-4000-8000-000000000002";
const PRODUCT = "40000000-0000-4000-8000-000000000001";
const PRODUCT_INACTIVE = "40000000-0000-4000-8000-000000000002";
const PRODUCT_B = "40000000-0000-4000-8000-000000000003";
const VARIANT = "50000000-0000-4000-8000-000000000001";
const VARIANT_BASE = "50000000-0000-4000-8000-000000000002";
const VARIANT_INACTIVE = "50000000-0000-4000-8000-000000000003";
const VARIANT_PRODUCT_INACTIVE = "50000000-0000-4000-8000-000000000004";
const VARIANT_B = "50000000-0000-4000-8000-000000000005";
const TAG = "60000000-0000-4000-8000-000000000001";
const GLOBAL = "70000000-0000-4000-8000-000000000001";
const QUICK = "70000000-0000-4000-8000-000000000002";
const TAGGED = "70000000-0000-4000-8000-000000000003";
const TEMP = "70000000-0000-4000-8000-000000000004";
const NOW = "2026-07-23T12:00:00.123456Z";

const source = readFileSync(path.join(ROOT, "tests/saas-phase3/price-lists/postgres-harness.mjs"), "utf8");
const priorSource = /const PRIOR = (\[[\s\S]*?\]);/.exec(source)?.[1];
if (!priorSource) throw new Error("PRIOR_MIGRATION_LIST_MISSING");
const PRIOR = [...priorSource.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
const AFTER = [
  "202607220043_inventory_purchasing.up.sql", "202607220043_inventory_purchasing_assertions.sql",
  "202607220044_inventory_counts_transfers.up.sql", "202607220044_inventory_counts_transfers_assertions.sql",
  "202607220045_price_lists.up.sql", "202607220045_price_lists_assertions.sql",
  "202607230046_inventory_locations.up.sql", "202607230046_inventory_locations_assertions.sql",
  "202607230047_pricing_preview.up.sql", "202607230047_pricing_preview_assertions.sql",
];

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {}
  }
  throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
}
function command(program, args, { input, allowFailure = false } = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT, encoding: "utf8", input,
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}
function start() {
  const executables = Object.fromEntries(["initdb", "pg_ctl", "psql", "pg_dump", "pg_restore"].map((name) => [name, executable(name)]));
  const root = mkdtempSync("/tmp/celebix-pricing-preview-");
  const data = path.join(root, "data"), socket = path.join(root, "socket");
  const port = 20000 + Math.floor(Math.random() * 15000);
  mkdirSync(socket, { mode: 0o700 });
  command(executables.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(executables.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { executables, root, data, socket, port };
}
function stop(box) {
  if (!box) return;
  command(box.executables.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], { allowFailure: true });
  rmSync(box.root, { recursive: true, force: true });
}
function psql(box, input, database = DB, allowFailure = false) {
  return command(box.executables.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input, allowFailure });
}
function apply(box, file, database = DB) { psql(box, readFileSync(path.join(SQL, file), "utf8"), database); }
function authority(store = STORE, membership = MEMBERSHIP, now = NOW) {
  return `'${store}'::uuid,'${OWNER}'::uuid,'${membership}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${now}'::timestamptz`;
}
function array(ids) { return `ARRAY[${ids.map((id) => `'${id}'::uuid`).join(",")}]`; }
function call(box, { store = STORE, membership = MEMBERSHIP, now = NOW, channel = "storefront", variants = array([VARIANT]) } = {}, database = DB) {
  const output = psql(box, `SET ROLE celebix_saas_app;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.pricing_preview(${authority(store, membership, now)},'${channel}',${variants});`, database).stdout.trim();
  return JSON.parse(output);
}
function seed(box, database = DB) {
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
VALUES('${OWNER}','https://id.test/oidc','owner','owner@test.invalid',true,'2026-01-01','2026-01-01');
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
('${STORE}','Preview A','preview-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
('${STORE_B}','Preview B','preview-b','active','tr','TRY','default','2026-01-01','2026-01-01');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
('${MEMBERSHIP}','${OWNER}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),
('${MEMBERSHIP_B}','${OWNER}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
('31000000-0000-4000-8000-000000000001','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01'),
('31000000-0000-4000-8000-000000000002','${STORE_B}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,archived_at,created_at,updated_at) VALUES
('${PRODUCT}','${STORE}','preview-product','Preview Product','active','TRY',1,NULL,'2026-01-01','2026-01-01'),
('${PRODUCT_INACTIVE}','${STORE}','inactive-product','Inactive Product','archived','TRY',1,'2026-01-02','2026-01-01','2026-01-02'),
('${PRODUCT_B}','${STORE_B}','cross-product','Cross Product','active','TRY',1,NULL,'2026-01-01','2026-01-01');
INSERT INTO saas.inventory_locations(id,store_id,name,is_default,status,version,created_at,updated_at) VALUES
('32000000-0000-4000-8000-000000000001','${STORE}','Default',true,'active',1,'2026-01-01','2026-01-01'),
('32000000-0000-4000-8000-000000000002','${STORE_B}','Default',true,'active',1,'2026-01-01','2026-01-01');
SELECT pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
SELECT pg_catalog.set_config('saas.inventory.source_id','31000000-0000-4000-8000-000000000003',true);
SELECT pg_catalog.set_config('saas.inventory.source_time','2026-01-01T00:00:00Z',true);
INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,cost_cents,stock_tracking,stock_quantity,status,attributes,version,archived_at,created_at,updated_at) VALUES
('${VARIANT}','${PRODUCT}','${STORE}','Default','PRE-1',1500,700,true,50,'active','{}',1,NULL,'2026-01-01','2026-01-01'),
('${VARIANT_BASE}','${PRODUCT}','${STORE}','Base','PRE-2',2500,900,true,50,'active','{}',1,NULL,'2026-01-01','2026-01-01'),
('${VARIANT_INACTIVE}','${PRODUCT}','${STORE}','Inactive','PRE-3',3000,900,true,50,'archived','{}',1,'2026-01-02','2026-01-01','2026-01-02'),
('${VARIANT_PRODUCT_INACTIVE}','${PRODUCT_INACTIVE}','${STORE}','Inactive product variant','PRE-4',3500,900,true,50,'active','{}',1,NULL,'2026-01-01','2026-01-01'),
('${VARIANT_B}','${PRODUCT_B}','${STORE_B}','Cross','PRE-B',999,400,true,50,'active','{}',1,NULL,'2026-01-01','2026-01-01');
INSERT INTO saas.customer_tags(id,store_id,name,color,version,created_at,updated_at)
VALUES('${TAG}','${STORE}','VIP','#112233',1,'2026-01-01','2026-01-01');
INSERT INTO saas.price_lists(id,store_id,name,status,version,activated_at,created_at,updated_at) VALUES
('${GLOBAL}','${STORE}','Global','active',1,'2026-01-01','2026-01-01','2026-01-01'),
('${QUICK}','${STORE}','Quick','active',1,'2026-01-01','2026-01-01','2026-01-01'),
('${TAGGED}','${STORE}','Tagged','active',1,'2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.price_list_items(store_id,price_list_id,variant_id,price_cents,created_at) VALUES
('${STORE}','${GLOBAL}','${VARIANT}',1200,'2026-01-01'),
('${STORE}','${QUICK}','${VARIANT}',1300,'2026-01-01'),
('${STORE}','${TAGGED}','${VARIANT}',900,'2026-01-01');
INSERT INTO saas.price_list_rules(id,store_id,price_list_id,channel,customer_tag_id,starts_at,ends_at,priority,created_at) VALUES
('71000000-0000-4000-8000-000000000001','${STORE}','${GLOBAL}','storefront',NULL,'2026-01-01',NULL,10,'2026-01-01'),
('71000000-0000-4000-8000-000000000002','${STORE}','${QUICK}','quick_order',NULL,'2026-01-01',NULL,10,'2026-01-01'),
('71000000-0000-4000-8000-000000000003','${STORE}','${TAGGED}','storefront','${TAG}','2026-01-01',NULL,100,'2026-01-01');
COMMIT;`, database);
}

const TOTAL = 32;
let count = 0;
async function scenario(name, run) {
  await run();
  count += 1;
  console.log(`PASS ${count}/${TOTAL} ${name}`);
}

async function main() {
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const file of PRIOR) apply(box, file);
    for (const file of AFTER) apply(box, file);
    seed(box);

    await scenario("PostgreSQL 16 disposable authority is active", () => assert.match(psql(box, "SHOW server_version;").stdout.trim(), /^16[.]/));
    await scenario("047 assertions apply on the complete migration chain", () => apply(box, "202607230047_pricing_preview_assertions.sql"));
    await scenario("global active storefront price is exact", () => {
      const result = call(box); assert.equal(result.outcome, "previewed"); assert.equal(result.result.entries[0].effectivePriceCents, 1200);
    });
    await scenario("base price is the exact fallback", () => {
      const result = call(box, { variants: array([VARIANT_BASE]) }); assert.deepEqual(result.result.entries[0], { variantId: VARIANT_BASE, channel: "storefront", basePriceCents: 2500, effectivePriceCents: 2500, sourceKind: "base" });
    });
    await scenario("quick order channel is isolated", () => assert.equal(call(box, { channel: "quick_order" }).result.entries[0].effectivePriceCents, 1300));
    await scenario("storefront channel ignores quick-order rules", () => assert.equal(call(box).result.entries[0].effectivePriceCents, 1200));
    await scenario("anonymous preview excludes tagged rules", () => assert.equal(call(box).result.entries[0].priceListId, GLOBAL));
    await scenario("higher global priority wins", () => {
      psql(box, `SET ROLE celebix_saas_owner;INSERT INTO saas.price_lists VALUES('${TEMP}','${STORE}','Priority','active',1,'2026-01-01',NULL,'2026-01-01','2026-01-01');INSERT INTO saas.price_list_items VALUES('${STORE}','${TEMP}','${VARIANT}',1100,'2026-01-01');INSERT INTO saas.price_list_rules VALUES('71000000-0000-4000-8000-000000000004','${STORE}','${TEMP}','storefront',NULL,'2026-01-01',NULL,50,'2026-01-01');`);
      assert.equal(call(box).result.entries[0].effectivePriceCents, 1100);
    });
    await scenario("rule start boundary is inclusive", () => {
      psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.price_list_rules SET starts_at='${NOW}' WHERE price_list_id='${TEMP}';`);
      assert.equal(call(box).result.entries[0].effectivePriceCents, 1100);
    });
    await scenario("rule end boundary is exclusive", () => {
      psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.price_list_rules SET starts_at='2026-01-01',ends_at='${NOW}' WHERE price_list_id='${TEMP}';`);
      assert.equal(call(box).result.entries[0].effectivePriceCents, 1200);
    });
    await scenario("archived list falls back without partial data", () => {
      psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.price_lists SET status='archived',archived_at='${NOW}',updated_at='${NOW}' WHERE id='${GLOBAL}';`);
      assert.equal(call(box).result.entries[0].effectivePriceCents, 1500);
      psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.price_lists SET status='active',archived_at=NULL,updated_at='${NOW}' WHERE id='${GLOBAL}';`);
    });
    await scenario("wrong-store variant is not found", () => assert.equal(call(box, { variants: array([VARIANT_B]) }).outcome, "not_found"));
    await scenario("inactive variant is not found", () => assert.equal(call(box, { variants: array([VARIANT_INACTIVE]) }).outcome, "not_found"));
    await scenario("variant under inactive product is not found", () => assert.equal(call(box, { variants: array([VARIANT_PRODUCT_INACTIVE]) }).outcome, "not_found"));
    await scenario("missing variant is not found", () => assert.equal(call(box, { variants: array(["50000000-0000-4000-8000-000000000099"]) }).outcome, "not_found"));
    await scenario("duplicate variants are invalid", () => assert.equal(call(box, { variants: array([VARIANT, VARIANT]) }).outcome, "invalid_input"));
    await scenario("empty variants are invalid", () => assert.equal(call(box, { variants: "ARRAY[]::uuid[]" }).outcome, "invalid_input"));
    await scenario("more than one hundred variants are invalid", () => {
      const ids = Array.from({ length: 101 }, (_, index) => `80000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
      assert.equal(call(box, { variants: array(ids) }).outcome, "invalid_input");
    });
    await scenario("null variant element is invalid", () => assert.equal(call(box, { variants: `ARRAY['${VARIANT}'::uuid,NULL::uuid]` }).outcome, "invalid_input"));
    await scenario("multidimensional variant array is invalid", () => assert.equal(call(box, { variants: `ARRAY[ARRAY['${VARIANT}'::uuid],ARRAY['${VARIANT_BASE}'::uuid]]` }).outcome, "invalid_input"));
    await scenario("non-one lower bound variant array is invalid", () => assert.equal(call(box, { variants: `'[0:0]={${VARIANT}}'::uuid[]` }).outcome, "invalid_input"));
    await scenario("unknown channel is invalid", () => assert.equal(call(box, { channel: "browser" }).outcome, "invalid_input"));
    await scenario("null and infinite timestamps are invalid", () => {
      assert.equal(call(box, { now: "infinity" }).outcome, "invalid_input");
      const output = psql(box, `SET ROLE celebix_saas_app;SELECT outcome FROM saas.pricing_preview('${STORE}','${OWNER}','${MEMBERSHIP}','${PLAN}','free_starter',1,NULL,'storefront',ARRAY['${VARIANT}'::uuid]);`).stdout.trim();
      assert.equal(output, "invalid_input");
    });
    await scenario("wrong TenantContext tuple is denied", () => assert.notEqual(call(box, { store: STORE_B, membership: MEMBERSHIP_B, variants: array([VARIANT]) }).outcome, "previewed"));
    await scenario("entries are deterministic sorted and repeatable", () => {
      const first = call(box, { variants: array([VARIANT_BASE, VARIANT]) }).result;
      const second = call(box, { variants: array([VARIANT, VARIANT_BASE]) }).result;
      assert.deepEqual(first, second);
      assert.deepEqual(first.entries.map((entry) => entry.variantId), [VARIANT, VARIANT_BASE]);
    });
    await scenario("asOf preserves exact UTC microseconds", () => assert.equal(call(box).result.asOf, NOW));
    await scenario("projection keys contain no private authority", () => {
      const result = call(box).result;
      assert.deepEqual(Object.keys(result).sort(), ["asOf", "entries"]);
      assert.deepEqual(Object.keys(result.entries[0]).sort(), ["basePriceCents", "channel", "effectivePriceCents", "priceListId", "sourceKind", "variantId"]);
      assert.doesNotMatch(JSON.stringify(result), /customer|email|tag|storeId|tenant/i);
    });
    await scenario("app ACL is exact and direct pricing relation access stays denied", () => {
      assert.equal(psql(box, `SELECT has_function_privilege('celebix_saas_app','saas.pricing_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid[])','EXECUTE');`).stdout.trim(), "t");
      assert.equal(psql(box, `SELECT has_function_privilege('celebix_saas_workflow','saas.pricing_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid[])','EXECUTE');`).stdout.trim(), "f");
      assert.notEqual(psql(box, "SET ROLE celebix_saas_app;SELECT count(*) FROM saas.price_lists;", DB, true).status, 0);
    });
    await scenario("backup restore preserves preview truth", () => {
      const dump = path.join(box.root, "preview.dump");
      command(box.executables.pg_dump, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-Fc", "-f", dump, DB]);
      psql(box, `CREATE DATABASE ${RESTORED};`, "postgres");
      command(box.executables.pg_restore, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-d", RESTORED, dump]);
      assert.deepEqual(call(box, {}, RESTORED), call(box));
    });
    await scenario("down refuses function drift", () => {
      psql(box, "ALTER FUNCTION saas.pricing_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid[]) VOLATILE;");
      const failed = psql(box, readFileSync(path.join(SQL, "202607230047_pricing_preview.down.sql"), "utf8"), DB, true);
      assert.notEqual(failed.status, 0); assert.match(failed.stderr, /PRICING_PREVIEW_ROLLBACK_DRIFT/);
      psql(box, "ALTER FUNCTION saas.pricing_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid[]) STABLE;");
    });
    await scenario("exact down and reapply restore authority", () => {
      apply(box, "202607230047_pricing_preview.down.sql");
      assert.equal(psql(box, "SELECT to_regprocedure('saas.pricing_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid[])') IS NULL;").stdout.trim(), "t");
      apply(box, "202607230047_pricing_preview.up.sql");
      apply(box, "202607230047_pricing_preview_assertions.sql");
      assert.equal(call(box).outcome, "previewed");
    });
    await scenario("cleanup removes disposable PostgreSQL data", () => {
      const root = box.root; stop(box); box = null; assert.equal(rmSync(root, { recursive: true, force: true }), undefined);
    });
    assert.equal(count, TOTAL);
  } finally {
    stop(box);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
