import assert from "node:assert/strict";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "exact_record_lookups_analytics";
const RESTORED = "exact_record_lookups_analytics_restored";
const PLAN = "00000000-0000-4000-8000-000000000001";
const STORE = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const OWNER = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000001";
const PRODUCT = "40000000-0000-4000-8000-000000000001";
const RESOURCE = "50000000-0000-4000-8000-000000000001";
const RESOURCE_B = "50000000-0000-4000-8000-000000000002";
const RECORD = "60000000-0000-4000-8000-000000000001";
const RECORD_B = "60000000-0000-4000-8000-000000000002";
const ORDER = "70000000-0000-4000-8000-000000000001";
const NOW = "2026-07-24T12:00:00.000Z";

const priceListsHarness = readFileSync(
  path.join(ROOT, "tests/saas-phase3/price-lists/postgres-harness.mjs"),
  "utf8",
);
const pricingHarness = readFileSync(
  path.join(ROOT, "tests/saas-phase3/pricing-preview/postgres-harness.mjs"),
  "utf8",
);
function migrationArray(sourceFile, name) {
  const source = new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`).exec(sourceFile)?.[1];
  if (!source) throw new Error(`${name}_MIGRATION_LIST_MISSING`);
  return [...source.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}
const BEFORE_048 = [
  ...migrationArray(priceListsHarness, "PRIOR"),
  ...migrationArray(pricingHarness, "AFTER"),
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
    cwd: ROOT,
    encoding: "utf8",
    input,
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
  const executables = Object.fromEntries(
    ["initdb", "pg_ctl", "psql", "pg_dump", "pg_restore"].map((name) => [name, executable(name)]),
  );
  const root = mkdtempSync("/tmp/celebix-exact-records-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 20000 + Math.floor(Math.random() * 15000);
  mkdirSync(socket, { mode: 0o700 });
  command(executables.initdb, [
    "-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8",
  ]);
  command(executables.pg_ctl, [
    "-D", data, "-o", `-k ${socket} -p ${port} -h ''`,
    "-l", path.join(root, "postgres.log"), "start",
  ]);
  return { executables, root, data, socket, port };
}
function stop(box) {
  if (!box) return;
  command(box.executables.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], { allowFailure: true });
  rmSync(box.root, { recursive: true, force: true });
}
function psql(box, input, database = DB, allowFailure = false) {
  return command(box.executables.psql, [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database,
  ], { input, allowFailure });
}
function apply(box, file, database = DB) {
  psql(box, readFileSync(path.join(SQL, file), "utf8"), database);
}
function authority() {
  return `'${STORE}'::uuid,'${OWNER}'::uuid,'${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${NOW}'::timestamptz`;
}
function api(box, name, extra, database = DB) {
  const output = psql(
    box,
    `SET ROLE celebix_saas_app;
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.${name}(${authority()},${extra});`,
    database,
  ).stdout.trim();
  return JSON.parse(output);
}
function seed(box) {
  psql(box, `BEGIN;
SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
VALUES('${OWNER}','https://id.test/oidc','owner','owner@test.invalid',true,'2026-01-01','2026-01-01');
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
('${STORE}','Exact A','exact-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
('${STORE_B}','Exact B','exact-b','active','tr','TRY','default','2026-01-01','2026-01-01');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
VALUES('${MEMBERSHIP}','${OWNER}','${STORE}','store_owner','active','2026-01-01','2026-01-01');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
VALUES('31000000-0000-4000-8000-000000000001','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at)
VALUES('${PRODUCT}','${STORE}','exact-product','Exact Product','active','TRY',1,'2026-01-01','2026-01-01');

INSERT INTO saas.catalog_admin_resources(
  id,store_id,resource_kind,name,slug,description,config,status,version,created_at,updated_at
) VALUES
('${RESOURCE}','${STORE}','collection','Old exact collection','old-exact-collection',NULL,'{}','active',1,'2026-01-01','2026-01-01'),
('${RESOURCE_B}','${STORE_B}','collection','Other tenant collection','other-tenant-collection',NULL,'{}','active',1,'2026-01-01','2026-01-01');
INSERT INTO saas.catalog_admin_resources(
  id,store_id,resource_kind,name,slug,description,config,status,version,created_at,updated_at
)
SELECT ('51000000-0000-4000-8000-'||pg_catalog.lpad(ordinal::text,12,'0'))::uuid,
  '${STORE}','collection','Recent '||ordinal,'recent-'||ordinal,NULL,'{}','active',1,
  '2026-02-01'::timestamptz+ordinal*interval '1 second',
  '2026-02-01'::timestamptz+ordinal*interval '1 second'
FROM pg_catalog.generate_series(1,201) AS ordinal;
INSERT INTO saas.catalog_admin_resource_products(store_id,resource_id,product_id,position)
VALUES('${STORE}','${RESOURCE}','${PRODUCT}',0);

INSERT INTO saas.merchant_admin_records(
  id,store_id,record_kind,name,config,status,version,archived_at,created_at,updated_at
) VALUES
('${RECORD}','${STORE}','blog_post','Old exact post','{"body":"old","locale":"tr-TR"}','draft',1,NULL,'2026-01-01','2026-01-01'),
('${RECORD_B}','${STORE_B}','blog_post','Other tenant post','{"body":"other","locale":"tr-TR"}','draft',1,NULL,'2026-01-01','2026-01-01');
INSERT INTO saas.merchant_admin_records(
  id,store_id,record_kind,name,config,status,version,archived_at,created_at,updated_at
)
SELECT ('61000000-0000-4000-8000-'||pg_catalog.lpad(ordinal::text,12,'0'))::uuid,
  '${STORE}','blog_post','Recent post '||ordinal,'{"body":"recent","locale":"tr-TR"}','draft',1,NULL,
  '2026-02-01'::timestamptz+ordinal*interval '1 second',
  '2026-02-01'::timestamptz+ordinal*interval '1 second'
FROM pg_catalog.generate_series(1,201) AS ordinal;

INSERT INTO saas.orders(
  id,store_id,order_number,source,customer_name,customer_email,currency,
  subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,
  shipping_address,created_at,updated_at
) VALUES(
  '${ORDER}','${STORE}','EX-001','storefront','Exact Buyer','buyer@test.invalid','TRY',
  900,0,0,900,'confirmed','completed','{}','2026-07-23T09:00:00Z','2026-07-23T09:00:00Z'
);
INSERT INTO saas.order_items(
  id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,
  unit_price_cents,quantity,discount_cents,line_total_cents,created_at
) VALUES
('71000000-0000-4000-8000-000000000001','${STORE}','${ORDER}','${PRODUCT}',NULL,0,'Old title',NULL,100,2,0,200,'2026-07-23T09:00:00Z'),
('71000000-0000-4000-8000-000000000002','${STORE}','${ORDER}','${PRODUCT}',NULL,1,'Renamed title',NULL,100,3,0,300,'2026-07-23T10:00:00Z'),
('71000000-0000-4000-8000-000000000003','${STORE}','${ORDER}','${PRODUCT}',NULL,2,'Tie-break title',NULL,100,4,0,400,'2026-07-23T10:00:00Z');
COMMIT;`);
}

const TOTAL = 18;
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
    for (const file of BEFORE_048) apply(box, file);
    seed(box);
    apply(box, "202607240048_exact_record_lookups_analytics.up.sql");

    await scenario("PostgreSQL 16 applies the complete chain through 048", () => {
      assert.match(psql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
    });
    await scenario("048 assertions prove metadata ACL and identity invariants", () => {
      apply(box, "202607240048_exact_record_lookups_analytics_assertions.sql");
    });
    await scenario("catalog exact get reaches an item older than the 200-row list window", () => {
      const result = api(box, "catalog_admin_get_resource", `'collection','${RESOURCE}'`);
      assert.equal(result.outcome, "found");
      assert.equal(result.result.id, RESOURCE);
      assert.equal(result.result.name, "Old exact collection");
    });
    await scenario("catalog exact get preserves the complete product relation", () => {
      const result = api(box, "catalog_admin_get_resource", `'collection','${RESOURCE}'`).result;
      assert.deepEqual(result.productIds, [PRODUCT]);
      assert.equal(result.productCount, 1);
    });
    await scenario("catalog wrong kind is indistinguishable from missing", () => {
      assert.equal(api(box, "catalog_admin_get_resource", `'brand','${RESOURCE}'`).outcome, "resource_not_found");
    });
    await scenario("catalog cross-store id does not leak", () => {
      assert.deepEqual(
        api(box, "catalog_admin_get_resource", `'collection','${RESOURCE_B}'`),
        { outcome: "resource_not_found", result: null },
      );
    });
    await scenario("catalog invalid kind fails closed", () => {
      assert.equal(api(box, "catalog_admin_get_resource", `'unknown','${RESOURCE}'`).outcome, "invalid_input");
    });
    await scenario("merchant exact get reaches an item older than the 200-row list window", () => {
      const result = api(box, "merchant_admin_get_record", `'blog_post','${RECORD}'`);
      assert.equal(result.outcome, "found");
      assert.equal(result.result.id, RECORD);
      assert.equal(result.result.name, "Old exact post");
    });
    await scenario("merchant wrong kind is indistinguishable from missing", () => {
      assert.equal(api(box, "merchant_admin_get_record", `'page','${RECORD}'`).outcome, "record_not_found");
    });
    await scenario("merchant cross-store id does not leak", () => {
      assert.deepEqual(
        api(box, "merchant_admin_get_record", `'blog_post','${RECORD_B}'`),
        { outcome: "record_not_found", result: null },
      );
    });
    await scenario("application retains no direct relation reads", () => {
      for (const relation of [
        "catalog_admin_resources", "catalog_admin_resource_products",
        "merchant_admin_records", "order_items",
      ]) {
        const attempted = psql(
          box,
          `SET ROLE celebix_saas_app;SELECT count(*) FROM saas.${relation};`,
          DB,
          true,
        );
        assert.notEqual(attempted.status, 0);
      }
    });
    await scenario("renamed snapshots aggregate once by immutable product id", () => {
      const top = api(box, "merchant_analytics_dashboard", "'month'").result.topProducts;
      assert.deepEqual(top, [{
        productId: PRODUCT,
        title: "Tie-break title",
        quantity: 9,
        revenueCents: 900,
      }]);
    });
    await scenario("analytics title and ordering are repeatable", () => {
      const first = api(box, "merchant_analytics_dashboard", "'month'").result.topProducts;
      const second = api(box, "merchant_analytics_dashboard", "'month'").result.topProducts;
      assert.deepEqual(second, first);
    });
    await scenario("backup restore preserves exact lookup and analytics truth", () => {
      const dump = path.join(box.root, "exact-records.dump");
      command(box.executables.pg_dump, [
        "-h", box.socket, "-p", String(box.port), "-U", "postgres", "-Fc", "-f", dump, DB,
      ]);
      psql(box, `CREATE DATABASE ${RESTORED};`, "postgres");
      command(box.executables.pg_restore, [
        "-h", box.socket, "-p", String(box.port), "-U", "postgres", "-d", RESTORED, dump,
      ]);
      assert.deepEqual(
        api(box, "catalog_admin_get_resource", `'collection','${RESOURCE}'`, RESTORED),
        api(box, "catalog_admin_get_resource", `'collection','${RESOURCE}'`),
      );
      assert.deepEqual(
        api(box, "merchant_analytics_dashboard", "'month'", RESTORED),
        api(box, "merchant_analytics_dashboard", "'month'"),
      );
    });
    const guardedDown = (mutation) => psql(
      box,
      `BEGIN;${mutation}
${readFileSync(path.join(SQL, "202607240048_exact_record_lookups_analytics.down.sql"), "utf8")}`,
      DB,
      true,
    );
    await scenario("down refuses exact lookup definition drift", () => {
      const failed = guardedDown(`
CREATE OR REPLACE FUNCTION saas.catalog_admin_get_resource(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text,p_resource_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $$ SELECT 'resource_not_found'::text,NULL::jsonb $$;`);
      assert.notEqual(failed.status, 0);
      assert.match(failed.stderr, /EXACT_RECORD_LOOKUPS_ANALYTICS_ROLLBACK_DRIFT/);
    });
    await scenario("down refuses exact lookup ACL drift", () => {
      const failed = guardedDown(`
GRANT EXECUTE ON FUNCTION
  saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid)
TO celebix_saas_workflow;`);
      assert.notEqual(failed.status, 0);
      assert.match(failed.stderr, /EXACT_RECORD_LOOKUPS_ANALYTICS_ROLLBACK_DRIFT/);
    });
    await scenario("exact down restores 038 analytics and removes lookup functions", () => {
      apply(box, "202607240048_exact_record_lookups_analytics.down.sql");
      assert.equal(psql(
        box,
        "SELECT to_regprocedure('saas.catalog_admin_get_resource(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid)') IS NULL;",
      ).stdout.trim(), "t");
      assert.equal(psql(
        box,
        "SELECT position('GROUP BY item.product_id,item.product_name' IN pg_get_functiondef('saas.merchant_analytics_dashboard(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text)'::regprocedure))>0;",
      ).stdout.trim(), "t");
    });
    await scenario("048 reapplies cleanly after exact down", () => {
      apply(box, "202607240048_exact_record_lookups_analytics.up.sql");
      apply(box, "202607240048_exact_record_lookups_analytics_assertions.sql");
      assert.equal(
        api(box, "catalog_admin_get_resource", `'collection','${RESOURCE}'`).outcome,
        "found",
      );
    });
    assert.equal(count, TOTAL);
    console.log(`${TOTAL}/${TOTAL} PASS`);
  } finally {
    stop(box);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
