import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  REQUIRED_NATIVE_TOOLS,
  assertSafeEnvironment,
} from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const TOKEN = randomBytes(6).toString("hex");
const DATABASE = `catalog_list_v2_${TOKEN}`;
const UP = "202608260115_catalog_product_list_projection.up.sql";
const DOWN = "202608260115_catalog_product_list_projection.down.sql";
const ASSERTIONS = "202608260115_catalog_product_list_projection_assertions.sql";
const NOW = "2026-08-26T12:00:00.000Z";
const FREE_PLAN = "00000000-0000-4000-8000-000000000001";
const STORE_A = "10000000-0000-4000-8000-000000000115";
const STORE_B = "10000000-0000-4000-8000-000000000116";
const PRINCIPAL_A = "20000000-0000-4000-8000-000000000115";
const PRINCIPAL_B = "20000000-0000-4000-8000-000000000116";
const MEMBERSHIP_A = "30000000-0000-4000-8000-000000000115";
const MEMBERSHIP_B = "30000000-0000-4000-8000-000000000116";
const V1_SIGNATURE = "saas.catalog_list_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,integer,timestamp with time zone,uuid)";
const V2_SIGNATURE = "saas.catalog_list_products_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,integer,timestamp with time zone,uuid)";
const migrations = [
  "202607110001_roles.up.sql",
  "202607110002_foundation.up.sql",
  "202607110003_free_starter.seed.sql",
  "202607110003_plan_versions.freeze.sql",
  "202607110004_grants.sql",
  "202607110005_catalog_assertions.sql",
  "202607110007_identity_roles.up.sql",
  "202607110008_identity_persistence.up.sql",
  "202607110009_identity_grants.sql",
  "202607110010_identity_catalog_assertions.sql",
  "202607120012_verified_identity_snapshot.up.sql",
  "202607120013_verified_identity_grants.sql",
  "202607120014_verified_identity_catalog_assertions.sql",
  "202607140015_panel_sessions.up.sql",
  "202607140016_panel_session_handoffs.up.sql",
  "202607140017_panel_browser_bindings.up.sql",
  "202607160018_product_catalog.up.sql",
  "202607160018_product_catalog_assertions.sql",
  "202607160019_product_catalog_api.up.sql",
  "202607160019_product_catalog_api_assertions.sql",
  "202607160020_pilot_storefront_media_domains.up.sql",
  "202607160020_pilot_storefront_media_domains_assertions.sql",
  "202607200021_catalog_dashboard_summary.up.sql",
  "202607200021_catalog_dashboard_summary_assertions.sql",
  "202607220035_catalog_administration.up.sql",
  "202607220035_catalog_administration_assertions.sql",
  "202607290065_catalog_featured_image_listing.up.sql",
  "202607290065_catalog_featured_image_listing_assertions.sql",
  "202608250114_catalog_product_lifecycle_authorization.up.sql",
  "202608250114_catalog_product_lifecycle_authorization_assertions.sql",
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
  const root = mkdtempSync(path.join("/tmp", "celebix-catalog-list-v2-"));
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  mkdirSync(socket, { mode: 0o700 });
  command(executables.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(executables.pg_ctl, [
    "-D", data,
    "-o", `-k ${socket} -p ${port} -h ''`,
    "-l", path.join(root, "postgres.log"),
    "start",
  ]);
  return { executables, root, data, socket, port, started: true };
}

function stop(box) {
  if (!box) return;
  if (box.started) {
    command(box.executables.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], { allowFailure: true });
    box.started = false;
  }
  rmSync(box.root, { recursive: true, force: true });
}

function psql(box, source, database = DATABASE, allowFailure = false) {
  return command(box.executables.psql, [
    "-h", box.socket,
    "-p", String(box.port),
    "-X", "-qAt",
    "-v", "ON_ERROR_STOP=1",
    "-U", "postgres",
    "-d", database,
  ], { input: source, allowFailure }).stdout.trim();
}

function apply(box, file) {
  psql(box, readFileSync(path.join(SQL, file), "utf8"));
}

function productId(ordinal) { return `50000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`; }
function variantId(ordinal) { return `60000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`; }
function mediaId(ordinal) { return `70000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`; }

function authority(store = STORE_A, principal = PRINCIPAL_A, membership = MEMBERSHIP_A) {
  return [
    `'${store}'::uuid`, `'${principal}'::uuid`, `'${membership}'::uuid`, `'${FREE_PLAN}'::uuid`,
    "'free_starter'::text", "1::bigint", "100::bigint", `'${NOW}'::timestamptz`,
  ].join(",");
}

function list(box, version, options = {}) {
  const status = options.status === undefined ? "NULL::text" : `'${options.status}'::text`;
  const cursorCreatedAt = options.cursorCreatedAt === undefined
    ? "NULL::timestamptz"
    : `'${options.cursorCreatedAt}'::timestamptz`;
  const cursorId = options.cursorId === undefined ? "NULL::uuid" : `'${options.cursorId}'::uuid`;
  const store = options.store ?? STORE_A;
  const principal = store === STORE_A ? PRINCIPAL_A : PRINCIPAL_B;
  const membership = store === STORE_A ? MEMBERSHIP_A : MEMBERSHIP_B;
  const raw = psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_app;
    SELECT pg_catalog.jsonb_build_object('outcome', outcome, 'payload', result_payload)
    FROM saas.catalog_list_products${version === 2 ? "_v2" : ""}(
      ${authority(store, principal, membership)},${status},${options.pageSize ?? 100}::integer,${cursorCreatedAt},${cursorId}
    );
    COMMIT;`);
  return JSON.parse(raw);
}

function seed(box) {
  const image = mediaId(1);
  const objectKey = `stores/${STORE_A}/products/${productId(1)}/${image}.webp`;
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
      ('${PRINCIPAL_A}','https://identity.example.test/oidc','list-v2-a','a@example.test',true,'2026-01-01','2026-01-01'),
      ('${PRINCIPAL_B}','https://identity.example.test/oidc','list-v2-b','b@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE_A}','List V2 A','list-v2-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
      ('${STORE_B}','List V2 B','list-v2-b','active','tr','TRY','default','2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
      ('${MEMBERSHIP_A}','${PRINCIPAL_A}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01'),
      ('${MEMBERSHIP_B}','${PRINCIPAL_B}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES
      ('40000000-0000-4000-8000-000000000115','${STORE_A}','${FREE_PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01'),
      ('40000000-0000-4000-8000-000000000116','${STORE_B}','${FREE_PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01');

    INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,archived_at,created_at,updated_at) VALUES
      ('${productId(1)}','${STORE_A}','active-priority','Active priority','active','TRY',1,NULL,'2026-08-26 11:00:00+00','2026-08-26 11:00:00+00'),
      ('${productId(2)}','${STORE_A}','active-order','Active order','active','TRY',1,NULL,'2026-08-26 10:00:00+00','2026-08-26 10:00:00+00'),
      ('${productId(3)}','${STORE_A}','archived-fallback','Archived fallback','active','TRY',1,NULL,'2026-08-26 09:00:00+00','2026-08-26 09:00:00+00'),
      ('${productId(4)}','${STORE_A}','archived-product','Archived product','archived','TRY',1,'2026-08-26 08:00:00+00','2026-08-26 08:00:00+00','2026-08-26 08:00:00+00'),
      ('${productId(5)}','${STORE_A}','without-variant','Without variant','active','TRY',1,NULL,'2026-08-26 07:00:00+00','2026-08-26 07:00:00+00'),
      ('${productId(6)}','${STORE_A}','second-page','Second page','draft','TRY',1,NULL,'2026-08-26 06:00:00+00','2026-08-26 06:00:00+00'),
      ('${productId(7)}','${STORE_B}','foreign-tenant','Foreign tenant','active','TRY',1,NULL,'2026-08-26 11:30:00+00','2026-08-26 11:30:00+00');

    INSERT INTO saas.product_variants(
      id,product_id,store_id,title,sku,price_cents,compare_at_cents,stock_tracking,stock_quantity,
      status,attributes,version,archived_at,created_at,updated_at
    ) VALUES
      ('${variantId(11)}','${productId(1)}','${STORE_A}','Archived first','ARCHIVED-FIRST',1000,NULL,true,1,'archived','{}',1,'2026-08-26 08:00:00+00','2026-08-26 08:00:00+00','2026-08-26 08:00:00+00'),
      ('${variantId(12)}','${productId(1)}','${STORE_A}','Active later','ACTIVE-LATER',1200,1500,true,12,'active','{}',1,NULL,'2026-08-26 10:00:00+00','2026-08-26 10:00:00+00'),
      ('${variantId(21)}','${productId(2)}','${STORE_A}','Active lower id','ACTIVE-LOWER',2000,NULL,false,0,'active','{}',1,NULL,'2026-08-26 09:00:00+00','2026-08-26 09:00:00+00'),
      ('${variantId(22)}','${productId(2)}','${STORE_A}','Active higher id','ACTIVE-HIGHER',2200,NULL,true,2,'active','{}',1,NULL,'2026-08-26 09:00:00+00','2026-08-26 09:00:00+00'),
      ('${variantId(31)}','${productId(3)}','${STORE_A}','Archived only','ARCHIVED-ONLY',3000,NULL,true,3,'archived','{}',1,'2026-08-26 09:00:00+00','2026-08-26 08:00:00+00','2026-08-26 09:00:00+00'),
      ('${variantId(41)}','${productId(4)}','${STORE_A}','Archived lower','ARCHIVED-LOWER',4000,NULL,true,4,'archived','{}',1,'2026-08-26 08:00:00+00','2026-08-26 07:00:00+00','2026-08-26 08:00:00+00'),
      ('${variantId(42)}','${productId(4)}','${STORE_A}','Archived higher','ARCHIVED-HIGHER',4200,NULL,true,5,'archived','{}',1,'2026-08-26 08:00:00+00','2026-08-26 07:30:00+00','2026-08-26 08:00:00+00'),
      ('${variantId(61)}','${productId(6)}','${STORE_A}','Draft product variant','DRAFT-PAGE',6000,NULL,true,6,'active','{}',1,NULL,'2026-08-26 06:00:00+00','2026-08-26 06:00:00+00'),
      ('${variantId(71)}','${productId(7)}','${STORE_B}','Foreign variant','FOREIGN',7000,NULL,true,7,'active','{}',1,NULL,'2026-08-26 11:30:00+00','2026-08-26 11:30:00+00');

    INSERT INTO saas.product_media(
      id,store_id,product_id,object_key,public_url,media_type,alt_text,width,height,byte_size,
      sort_order,status,created_at,updated_at,version
    ) VALUES (
      '${image}','${STORE_A}','${productId(1)}','${objectKey}','https://media.example.test/${objectKey}',
      'image/webp','Active priority cover',100,100,1024,0,'active','2026-08-26 11:00:00+00','2026-08-26 11:00:00+00',1
    );
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

    const v1Definition = psql(box, `SELECT pg_catalog.pg_get_functiondef('${V1_SIGNATURE}'::regprocedure);`);
    const v1Acl = psql(box, `SELECT proacl::text FROM pg_catalog.pg_proc WHERE oid='${V1_SIGNATURE}'::regprocedure;`);

    await scenario("PostgreSQL 16 starts with target schema through 114, v1 available and v2 absent", () => {
      assert.match(psql(box, "SHOW server_version;"), /^16[.]/);
      assert.equal(psql(box, `SELECT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute
        WHERE attrelid='saas.product_variants'::pg_catalog.regclass
          AND attname='archived_by_product' AND NOT attisdropped
      );`), "t");
      assert.equal(psql(box, `SELECT to_regprocedure(
        'saas.catalog_restore_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint)'
      ) IS NOT NULL;`), "t");
      assert.equal(psql(box, `SELECT to_regprocedure('${V1_SIGNATURE}') IS NOT NULL;`), "t");
      assert.equal(psql(box, `SELECT to_regprocedure('${V2_SIGNATURE}') IS NULL;`), "t");
      assert.deepEqual(Object.keys(list(box, 1).payload).sort(), ["featuredImages", "hasMore", "items"]);
    });

    apply(box, UP);
    apply(box, ASSERTIONS);

    await scenario("migration 115 after 114 preserves the exact v1 definition and ACL", () => {
      assert.equal(psql(box, `SELECT pg_catalog.pg_get_functiondef('${V1_SIGNATURE}'::regprocedure);`), v1Definition);
      assert.equal(psql(box, `SELECT proacl::text FROM pg_catalog.pg_proc WHERE oid='${V1_SIGNATURE}'::regprocedure;`), v1Acl);
      assert.deepEqual(Object.keys(list(box, 1).payload).sort(), ["featuredImages", "hasMore", "items"]);
    });

    const active = list(box, 2);
    await scenario("new application with 114 to 115 schema returns the v2 list envelope", () => {
      assert.equal(active.outcome, "listed");
      assert.deepEqual(Object.keys(active.payload).sort(), ["featuredImages", "hasMore", "items", "variantSummaries"]);
      assert.equal(active.payload.featuredImages[productId(1)].altText, "Active priority cover");
      assert.deepEqual(Object.keys(active.payload.variantSummaries).sort(), [
        productId(1), productId(2), productId(3), productId(6),
      ].sort());
      assert.equal(active.payload.variantSummaries[productId(5)], undefined);
    });

    await scenario("active variants win before deterministic created-at and id ordering", () => {
      assert.equal(active.payload.variantSummaries[productId(1)].variantId, variantId(12));
      assert.equal(active.payload.variantSummaries[productId(2)].variantId, variantId(21));
      assert.equal(active.payload.variantSummaries[productId(1)].sku, "ACTIVE-LATER");
      assert.equal(active.payload.variantSummaries[productId(1)].priceCents, 1200);
      assert.equal(active.payload.variantSummaries[productId(1)].compareAtCents, 1500);
      assert.equal(active.payload.variantSummaries[productId(1)].stockQuantity, 12);
    });

    await scenario("products without active variants fall back to the deterministic first archived variant", () => {
      assert.equal(active.payload.variantSummaries[productId(3)].variantId, variantId(31));
      const archived = list(box, 2, { status: "archived" });
      assert.deepEqual(archived.payload.items.map(({ id }) => id), [productId(4)]);
      assert.equal(archived.payload.variantSummaries[productId(4)].variantId, variantId(41));
    });

    await scenario("variantless products omit summaries without failing the page", () => {
      assert.equal(active.payload.items.some(({ id }) => id === productId(5)), true);
      assert.equal(Object.hasOwn(active.payload.variantSummaries, productId(5)), false);
    });

    await scenario("variant summaries are tenant-bound and cannot cross stores", () => {
      assert.equal(active.payload.items.some(({ id }) => id === productId(7)), false);
      assert.equal(JSON.stringify(active.payload.variantSummaries).includes(variantId(71)), false);
      const foreign = list(box, 2, { store: STORE_B });
      assert.deepEqual(foreign.payload.items.map(({ id }) => id), [productId(7)]);
      assert.equal(foreign.payload.variantSummaries[productId(7)].variantId, variantId(71));
    });

    await scenario("page-scoped summaries and cursor pagination never project outside the page", () => {
      const first = list(box, 2, { pageSize: 2 });
      const itemIds = first.payload.items.map(({ id }) => id);
      assert.equal(first.payload.hasMore, true);
      assert.deepEqual(Object.keys(first.payload.variantSummaries).sort(), itemIds.sort());
      const cursor = first.payload.items.at(-1);
      const second = list(box, 2, {
        pageSize: 2,
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
      assert.equal(second.payload.items.length, 2);
      assert.equal(second.payload.items.some(({ id }) => itemIds.includes(id)), false);
      assert.equal(Object.keys(second.payload.variantSummaries).every((id) => second.payload.items.some((item) => item.id === id)), true);
    });

    await scenario("code-only rollback remains valid on the 114 to 115 schema", () => {
      assert.equal(list(box, 1).outcome, "listed");
      apply(box, DOWN);
      assert.equal(psql(box, `SELECT to_regprocedure('${V2_SIGNATURE}') IS NULL;`), "t");
      assert.equal(list(box, 1).outcome, "listed");
      assert.equal(psql(box, `SELECT pg_catalog.pg_get_functiondef('${V1_SIGNATURE}'::regprocedure);`), v1Definition);
      assert.equal(psql(box, `SELECT proacl::text FROM pg_catalog.pg_proc WHERE oid='${V1_SIGNATURE}'::regprocedure;`), v1Acl);
    });

    await scenario("v2 can be reapplied after disposable rollback without altering v1", () => {
      apply(box, UP);
      apply(box, ASSERTIONS);
      assert.equal(list(box, 2).outcome, "listed");
      assert.equal(psql(box, `SELECT pg_catalog.pg_get_functiondef('${V1_SIGNATURE}'::regprocedure);`), v1Definition);
      assert.equal(psql(box, `SELECT proacl::text FROM pg_catalog.pg_proc WHERE oid='${V1_SIGNATURE}'::regprocedure;`), v1Acl);
    });

    process.stdout.write(`PASS ${completed}/${completed} catalog product list projection PostgreSQL 16 rehearsal complete\n`);
  } finally {
    stop(box);
  }
}

await main();
