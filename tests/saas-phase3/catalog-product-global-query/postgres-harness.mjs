import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const TOKEN = randomBytes(6).toString("hex");
const DATABASE = `catalog_global_query_${TOKEN}`;
const NOW = "2026-08-26T12:00:00.000Z";
const FREE_PLAN = "00000000-0000-4000-8000-000000000001";
const STORE_A = "10000000-0000-4000-8000-000000000116";
const STORE_B = "10000000-0000-4000-8000-000000000117";
const PRINCIPAL_A = "20000000-0000-4000-8000-000000000116";
const PRINCIPAL_B = "20000000-0000-4000-8000-000000000117";
const MEMBERSHIP_A = "30000000-0000-4000-8000-000000000116";
const MEMBERSHIP_B = "30000000-0000-4000-8000-000000000117";
const CATEGORY = "40000000-0000-4000-8000-000000000116";
const BRAND = "41000000-0000-4000-8000-000000000116";
const COLLECTION = "42000000-0000-4000-8000-000000000116";
const V1 = "saas.catalog_list_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,integer,timestamp with time zone,uuid)";
const V2 = "saas.catalog_list_products_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,integer,timestamp with time zone,uuid)";
const V3 = "saas.catalog_list_products_v3(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,text,text,uuid,uuid,uuid,text,integer,timestamp with time zone,text,uuid)";
const PRIOR = JSON.parse(readFileSync(path.join(SQL, "phase3n-hosted-callback-lifecycle-manifest.json"), "utf8"));
const migrations = [
  ...PRIOR.migrationChain.map(({ file }) => file),
  "202607280056_catalog_product_onboarding.up.sql",
  "202607280056_catalog_product_onboarding_assertions.sql",
  "202607290065_catalog_featured_image_listing.up.sql",
  "202607290065_catalog_featured_image_listing_assertions.sql",
  "202608250114_catalog_product_lifecycle_authorization.up.sql",
  "202608250114_catalog_product_lifecycle_authorization_assertions.sql",
  "202608260115_catalog_product_list_projection.up.sql",
  "202608260115_catalog_product_list_projection_assertions.sql",
];
let completed = 0;

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
    cwd: ROOT,
    encoding: "utf8",
    input: options.input,
    env: { ...process.env, PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`disposable command failed: ${path.basename(program)}\n${String(result.stderr).trim()}`);
  }
  return result;
}

function start() {
  assertSafeEnvironment();
  const executables = Object.fromEntries(REQUIRED_NATIVE_TOOLS.map((name) => [name, executable(name)]));
  if (Object.values(executables).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const root = mkdtempSync(path.join("/tmp", "celebix-catalog-global-query-"));
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 20_000 + Math.floor(Math.random() * 20_000);
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

function psql(box, source, database = DATABASE, allowFailure = false) {
  return command(box.executables.psql, [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database,
  ], { input: source, allowFailure }).stdout.trim();
}

function apply(box, file) {
  try { psql(box, readFileSync(path.join(SQL, file), "utf8")); }
  catch (error) { throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`); }
}
function productId(ordinal) { return `50000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`; }
function text(value) { return value === undefined ? "NULL::text" : `'${value.replaceAll("'", "''")}'::text`; }
function uuid(value) { return value === undefined ? "NULL::uuid" : `'${value}'::uuid`; }
function timestamp(value) { return value === undefined ? "NULL::timestamptz" : `'${value}'::timestamptz`; }

function authority(store = STORE_A) {
  const principal = store === STORE_A ? PRINCIPAL_A : PRINCIPAL_B;
  const membership = store === STORE_A ? MEMBERSHIP_A : MEMBERSHIP_B;
  return [
    `'${store}'::uuid`, `'${principal}'::uuid`, `'${membership}'::uuid`, `'${FREE_PLAN}'::uuid`,
    "'free_starter'::text", "1::bigint", "100::bigint", `'${NOW}'::timestamptz`,
  ].join(",");
}

function list(box, options = {}) {
  const store = options.store ?? STORE_A;
  const raw = psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_app;
    SELECT pg_catalog.jsonb_build_object('outcome', outcome, 'payload', result_payload)
    FROM saas.catalog_list_products_v3(
      ${authority(store)},${text(options.search)},${text(options.status)},${text(options.stock)},
      ${uuid(options.categoryId)},${uuid(options.brandId)},${uuid(options.collectionId)},
      ${text(options.sort ?? "updated-desc")},${options.pageSize ?? 40}::integer,
      ${timestamp(options.cursorTimestamp)},${text(options.cursorTitle)},${uuid(options.cursorId)}
    ); COMMIT;`);
  return JSON.parse(raw);
}

function seed(box) {
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
      ('${PRINCIPAL_A}','https://identity.example.test/oidc','global-query-a','a@example.test',true,'2026-01-01','2026-01-01'),
      ('${PRINCIPAL_B}','https://identity.example.test/oidc','global-query-b','b@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE_A}','Global Query A','global-query-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
      ('${STORE_B}','Global Query B','global-query-b','active','tr','TRY','default','2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
      ('${MEMBERSHIP_A}','${PRINCIPAL_A}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01'),
      ('${MEMBERSHIP_B}','${PRINCIPAL_B}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES
      ('43000000-0000-4000-8000-000000000116','${STORE_A}','${FREE_PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01'),
      ('43000000-0000-4000-8000-000000000117','${STORE_B}','${FREE_PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01');

    INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,archived_at,created_at,updated_at)
    SELECT
      ('50000000-0000-4000-8000-' || pg_catalog.lpad(series::text,12,'0'))::uuid,
      '${STORE_A}'::uuid,
      'product-' || pg_catalog.lpad(series::text,4,'0'),
      CASE
        WHEN series=4 THEN 'İSTANBUL ÖZEL'
        WHEN series=5 THEN 'Sıra Çanta'
        WHEN series=7 THEN 'Sıra Zebra'
        WHEN series=8 THEN 'IŞIK ÜRÜN'
        WHEN series=11 THEN 'ışık ürün iki'
        WHEN series=13 THEN 'ÉLAN ÜRÜN'
        WHEN series IN (14,16) THEN pg_catalog.repeat('ß',200)
        WHEN series=1201 THEN 'Needle Beyond First Page'
        ELSE 'Product ' || pg_catalog.lpad(series::text,4,'0')
      END,
      CASE WHEN series % 10=0 THEN 'archived' WHEN series % 3=0 THEN 'draft' ELSE 'active' END,
      'TRY',1,
      CASE WHEN series % 10=0 THEN '2026-08-01'::timestamptz ELSE NULL END,
      '2026-01-01'::timestamptz + series * interval '1 second',
      CASE WHEN series % 10=0 THEN '2026-08-01'::timestamptz
        ELSE '2026-01-01'::timestamptz + series * interval '1 second' END
    FROM pg_catalog.generate_series(1,1631) AS series;

    ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.product_variants(
      id,product_id,store_id,title,sku,barcode,price_cents,stock_tracking,stock_quantity,
      status,attributes,version,archived_at,created_at,updated_at
    )
    SELECT
      ('60000000-0000-4000-8000-' || pg_catalog.lpad(series::text,12,'0'))::uuid,
      ('50000000-0000-4000-8000-' || pg_catalog.lpad(series::text,12,'0'))::uuid,
      '${STORE_A}'::uuid,'Default',
      CASE WHEN series=8 THEN 'ISIK-SKU' WHEN series=1631 THEN 'LAST-SKU-1631' ELSE 'SKU-' || pg_catalog.lpad(series::text,4,'0') END,
      CASE WHEN series=8 THEN 'ISIK-BARKOD' WHEN series=1601 THEN 'BARCODE-1601' ELSE NULL END,
      series * 100,
      series % 3 <> 0,
      CASE WHEN series % 3=1 THEN 5 ELSE 0 END,
      'active','{}',1,NULL,
      '2026-01-01'::timestamptz + series * interval '1 second',
      '2026-01-01'::timestamptz + series * interval '1 second'
    FROM pg_catalog.generate_series(1,1631) AS series;

    INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,archived_at,created_at,updated_at) VALUES
      ('50000000-0000-4000-8000-999999999999','${STORE_B}','needle-foreign','Needle Foreign Tenant','active','TRY',1,NULL,'2026-08-01','2026-08-01');
    INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,barcode,price_cents,stock_tracking,stock_quantity,status,attributes,version,archived_at,created_at,updated_at) VALUES
      ('60000000-0000-4000-8000-999999999999','50000000-0000-4000-8000-999999999999','${STORE_B}','Default','LAST-SKU-1631','BARCODE-1601',100,true,1,'active','{}',1,NULL,'2026-08-01','2026-08-01');
    ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;

    INSERT INTO saas.catalog_categories(id,store_id,parent_id,name,slug,position,depth,status,version,archived_at,created_at,updated_at) VALUES
      ('${CATEGORY}','${STORE_A}',NULL,'Featured','featured',0,1,'active',1,NULL,'2026-01-01','2026-01-01');
    INSERT INTO saas.catalog_admin_resources(id,store_id,resource_kind,name,slug,config,status,version,created_at,updated_at) VALUES
      ('${BRAND}','${STORE_A}','brand','Atlas','atlas','{}','active',1,'2026-01-01','2026-01-01'),
      ('${COLLECTION}','${STORE_A}','collection','Summer','summer','{}','active',1,'2026-01-01','2026-01-01');
    INSERT INTO saas.catalog_product_categories(store_id,product_id,category_id,position) VALUES
      ('${STORE_A}','${productId(1)}','${CATEGORY}',0);
    INSERT INTO saas.catalog_admin_resource_products(store_id,resource_id,product_id,position) VALUES
      ('${STORE_A}','${BRAND}','${productId(2)}',0),
      ('${STORE_A}','${COLLECTION}','${productId(3)}',0);
    COMMIT;`);
}

async function scenario(name, run) {
  await run();
  completed += 1;
  process.stdout.write(`PASS ${completed} ${name}\n`);
}

async function main() {
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DATABASE};`, "postgres");
    for (const migration of migrations) apply(box, migration);
    seed(box);
    const v1Definition = psql(box, `SELECT pg_catalog.pg_get_functiondef('${V1}'::regprocedure);`);
    const v2Definition = psql(box, `SELECT pg_catalog.pg_get_functiondef('${V2}'::regprocedure);`);
    const v1Acl = psql(box, `SELECT proacl::text FROM pg_catalog.pg_proc WHERE oid='${V1}'::regprocedure;`);
    const v2Acl = psql(box, `SELECT proacl::text FROM pg_catalog.pg_proc WHERE oid='${V2}'::regprocedure;`);

    await scenario("PostgreSQL 16 starts with 1,631 tenant products and v1/v2 only", () => {
      assert.match(psql(box, "SHOW server_version;"), /^16[.]/);
      assert.equal(psql(box, `SELECT count(*) FROM saas.products WHERE store_id='${STORE_A}';`), "1631");
      assert.equal(psql(box, `SELECT to_regprocedure('${V3}') IS NULL;`), "t");
    });

    apply(box, "202608260116_catalog_product_global_query.up.sql");
    apply(box, "202608260116_catalog_product_global_query_assertions.sql");

    await scenario("additive v3 preserves exact v1 and v2 definitions and ACLs", () => {
      assert.equal(psql(box, `SELECT pg_catalog.pg_get_functiondef('${V1}'::regprocedure);`), v1Definition);
      assert.equal(psql(box, `SELECT pg_catalog.pg_get_functiondef('${V2}'::regprocedure);`), v2Definition);
      assert.equal(psql(box, `SELECT proacl::text FROM pg_catalog.pg_proc WHERE oid='${V1}'::regprocedure;`), v1Acl);
      assert.equal(psql(box, `SELECT proacl::text FROM pg_catalog.pg_proc WHERE oid='${V2}'::regprocedure;`), v2Acl);
    });

    await scenario("global name search finds an unloaded product and reports the real catalog total", () => {
      const result = list(box, { search: "  nEeDlE bEyOnD  " });
      assert.equal(result.outcome, "listed");
      assert.deepEqual(result.payload.items.map(({ id }) => id), [productId(1201)]);
      assert.equal(result.payload.catalogTotal, 1631);
      assert.deepEqual(list(box, { search: "istanbul özel" }).payload.items.map(({ id }) => id), [productId(4)]);
      assert.deepEqual(list(box, { search: "I\u0307STANBUL ÖZEL" }).payload.items.map(({ id }) => id), [productId(4)]);
      const turkishI = list(box, { search: "ışık", sort: "title-asc", pageSize: 1 });
      assert.deepEqual(turkishI.payload.items.map(({ id }) => id), [productId(8)]);
      assert.equal(turkishI.payload.hasMore, true);
      assert.deepEqual(list(box, {
        search: "ışık",
        sort: "title-asc",
        pageSize: 1,
        cursorTitle: turkishI.payload.cursorAnchor.title,
        cursorId: turkishI.payload.cursorAnchor.id,
      }).payload.items.map(({ id }) => id), [productId(11)]);
      assert.deepEqual(list(box, { search: "ısık-sku" }).payload.items.map(({ id }) => id), [productId(8)]);
      assert.deepEqual(list(box, { search: "ısık-barkod" }).payload.items.map(({ id }) => id), [productId(8)]);
      assert.deepEqual(list(box, { search: "élan ürün" }).payload.items.map(({ id }) => id), [productId(13)]);
      const expandingTitle = "ß".repeat(200);
      const expanding = list(box, { search: "ß", sort: "title-asc", pageSize: 1 });
      assert.deepEqual(expanding.payload.items.map(({ id }) => id), [productId(14)]);
      assert.equal(expanding.payload.cursorAnchor.title, expandingTitle);
      assert.deepEqual(list(box, {
        search: "ß",
        sort: "title-asc",
        pageSize: 1,
        cursorTitle: expanding.payload.cursorAnchor.title,
        cursorId: expanding.payload.cursorAnchor.id,
      }).payload.items.map(({ id }) => id), [productId(16)]);
    });

    await scenario("last-page SKU and barcode searches are global while cross-tenant rows stay hidden", () => {
      assert.deepEqual(list(box, { search: "last-sku-1631" }).payload.items.map(({ id }) => id), [productId(1631)]);
      assert.deepEqual(list(box, { search: "barcode-1601" }).payload.items.map(({ id }) => id), [productId(1601)]);
      assert.equal(JSON.stringify(list(box, { search: "needle" }).payload).includes("Foreign Tenant"), false);
      assert.deepEqual(list(box, { store: STORE_B, search: "needle" }).payload.items.map(({ id }) => id), ["50000000-0000-4000-8000-999999999999"]);
    });

    await scenario("status, representative stock, category, brand and collection filters are tenant scoped", () => {
      assert.equal(list(box, { status: "archived", pageSize: 100 }).payload.items.every(({ status }) => status === "archived"), true);
      assert.equal(list(box, { search: "sku-0001", stock: "in-stock" }).payload.variantSummaries[productId(1)].stockQuantity, 5);
      assert.equal(list(box, { search: "sku-0002", stock: "out-of-stock" }).payload.variantSummaries[productId(2)].stockQuantity, 0);
      assert.equal(list(box, { search: "sku-0003", stock: "untracked" }).payload.variantSummaries[productId(3)].stockTracking, false);
      assert.deepEqual(list(box, { categoryId: CATEGORY }).payload.items.map(({ id }) => id), [productId(1)]);
      assert.deepEqual(list(box, { brandId: BRAND }).payload.items.map(({ id }) => id), [productId(2)]);
      assert.deepEqual(list(box, { collectionId: COLLECTION }).payload.items.map(({ id }) => id), [productId(3)]);
    });

    await scenario("global A-Z ordering and title keyset pagination cover every non-archived product once", () => {
      const titles = [];
      const ids = new Set();
      let cursor = {};
      do {
        const result = list(box, { sort: "title-asc", pageSize: 100, ...cursor });
        for (const item of result.payload.items) { titles.push(item.title.toLowerCase()); ids.add(item.id); }
        cursor = result.payload.hasMore ? {
          cursorTitle: result.payload.cursorAnchor.title,
          cursorId: result.payload.cursorAnchor.id,
        } : {};
        if (!result.payload.hasMore) break;
      } while (titles.length <= 1631);
      assert.equal(titles.length, 1468);
      assert.equal(ids.size, titles.length);
      const fixture = list(box, { search: "sıra", sort: "title-asc" });
      assert.deepEqual(fixture.payload.items.map(({ title }) => title), ["Sıra Çanta", "Sıra Zebra"]);
    });

    await scenario("v3 validates sort-specific cursor anchors", () => {
      assert.equal(list(box, { sort: "title-asc", cursorTimestamp: NOW, cursorId: productId(1) }).outcome, "invalid_input");
      assert.equal(list(box, { sort: "created-desc", cursorTitle: "product 0001", cursorId: productId(1) }).outcome, "invalid_input");
      const first = list(box, { sort: "created-asc", pageSize: 1 });
      assert.match(first.payload.cursorAnchor.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.]\d{3}Z$/);
      const second = list(box, {
        sort: "created-asc",
        pageSize: 1,
        cursorTimestamp: first.payload.cursorAnchor.timestamp,
        cursorId: first.payload.cursorAnchor.id,
      });
      assert.notEqual(second.payload.items[0].id, first.payload.items[0].id);
    });

    await scenario("code-only rollback leaves old apps working and reapply restores new app", () => {
      apply(box, "202608260116_catalog_product_global_query.down.sql");
      assert.equal(psql(box, `SELECT to_regprocedure('${V3}') IS NULL;`), "t");
      assert.equal(psql(box, `SELECT pg_catalog.pg_get_functiondef('${V1}'::regprocedure);`), v1Definition);
      assert.equal(psql(box, `SELECT pg_catalog.pg_get_functiondef('${V2}'::regprocedure);`), v2Definition);
      apply(box, "202608260116_catalog_product_global_query.up.sql");
      apply(box, "202608260116_catalog_product_global_query_assertions.sql");
      assert.equal(list(box, { search: "last-sku-1631" }).outcome, "listed");
    });

    process.stdout.write(`PASS ${completed}/${completed} catalog product global query PostgreSQL 16 rehearsal complete\n`);
  } finally {
    stop(box);
  }
}

await main();
