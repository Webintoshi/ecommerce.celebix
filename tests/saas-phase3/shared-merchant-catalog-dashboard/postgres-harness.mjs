import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";

import {
  REQUIRED_NATIVE_TOOLS,
  assertSafeEnvironment,
} from "../../saas-phase2/postgres/disposable-harness.mjs";

const { Pool } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SQL = path.join(ROOT, "apps", "owner", "scripts", "sql", "saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const TOKEN = randomBytes(6).toString("hex");
const DATABASE = `merchant_dashboard_${TOKEN}`;
const RESTORE_DATABASE = `${DATABASE}_restore`;
const ROLLBACK_DATABASE = `${DATABASE}_rollback`;
const WORKLOAD_ROLE = `merchant_dashboard_runtime_${TOKEN}`;
const TOTAL = 18;
const completed = [];
const NOW = "2026-07-20T10:00:00.000Z";
const PLAN = "00000000-0000-4000-8000-000000000001";
const STORE_A = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const PRINCIPAL_A = "20000000-0000-4000-8000-000000000001";
const PRINCIPAL_B = "20000000-0000-4000-8000-000000000002";
const MEMBERSHIP_A = "30000000-0000-4000-8000-000000000001";
const MEMBERSHIP_B = "30000000-0000-4000-8000-000000000002";
const PRODUCT_ACTIVE = "40000000-0000-4000-8000-000000000001";
const PRODUCT_DRAFT = "40000000-0000-4000-8000-000000000002";
const PRODUCT_ARCHIVED = "40000000-0000-4000-8000-000000000003";
const PRODUCT_B = "40000000-0000-4000-8000-000000000004";
const VARIANT_ZERO = "50000000-0000-4000-8000-000000000001";
const VARIANT_UNTRACKED = "50000000-0000-4000-8000-000000000002";
const VARIANT_DRAFT = "50000000-0000-4000-8000-000000000003";
const VARIANT_ARCHIVED = "50000000-0000-4000-8000-000000000004";
const VARIANT_HIDDEN_PRODUCT = "50000000-0000-4000-8000-000000000005";
const VARIANT_B = "50000000-0000-4000-8000-000000000006";
const MEDIA_ACTIVE = "60000000-0000-4000-8000-000000000001";
const MEDIA_PENDING = "60000000-0000-4000-8000-000000000002";
const MEDIA_ARCHIVED = "60000000-0000-4000-8000-000000000003";
const MEDIA_HIDDEN_PRODUCT = "60000000-0000-4000-8000-000000000004";
const MEDIA_B = "60000000-0000-4000-8000-000000000005";
const SUMMARY_SIGNATURE = "saas.catalog_get_dashboard_summary(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone)";
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
];

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through isolated native and PATH candidates.
    }
  }
  return null;
}

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: options.binary ? null : "utf8",
    input: options.input,
    env: { PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`disposable command failed: ${path.basename(program)}\n${String(result.stderr ?? "").trim()}`);
  }
  return result;
}

function startPostgres() {
  assertSafeEnvironment();
  const executables = Object.fromEntries(REQUIRED_NATIVE_TOOLS.map((name) => [name, executable(name)]));
  if (Object.values(executables).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "celebix-merchant-dashboard-"));
  const socketDirectory = path.join("/tmp", `cmd-${TOKEN}`);
  const dataDirectory = path.join(temporaryDirectory, "data");
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  mkdirSync(socketDirectory, { mode: 0o700 });
  command(executables.initdb, ["-D", dataDirectory, "--auth=trust", "--username=postgres", "--no-locale"]);
  command(executables.pg_ctl, [
    "-D", dataDirectory,
    "-o", `-k ${socketDirectory} -p ${port} -h ''`,
    "-l", path.join(temporaryDirectory, "postgres.log"),
    "start",
  ]);
  return { executables, temporaryDirectory, socketDirectory, dataDirectory, port, started: true };
}

function stopPostgres(backend) {
  if (!backend) return;
  if (backend.started) {
    command(backend.executables.pg_ctl, ["-D", backend.dataDirectory, "-m", "fast", "stop"], { allowFailure: true });
    backend.started = false;
  }
  rmSync(backend.socketDirectory, { recursive: true, force: true });
  rmSync(backend.temporaryDirectory, { recursive: true, force: true });
}

function psqlResult(backend, source, database = DATABASE, options = {}) {
  return command(backend.executables.psql, [
    "-h", backend.socketDirectory,
    "-p", String(backend.port),
    "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], { input: source, allowFailure: options.allowFailure });
}

function psql(backend, source, database = DATABASE, options = {}) {
  return psqlResult(backend, source, database, options).stdout.trim();
}

function apply(backend, file, database = DATABASE) {
  psql(backend, readFileSync(path.join(SQL, file), "utf8"), database);
}

function createDatabase(backend, database, template) {
  psql(backend, `CREATE DATABASE ${database}${template ? ` TEMPLATE ${template}` : ""};`, "postgres");
}

async function scenario(name, run) {
  await run();
  completed.push(name);
  process.stdout.write(`PASS ${completed.length}/${TOTAL} ${name}\n`);
}

function authority(options = {}) {
  return [
    options.store ?? STORE_A,
    options.principal ?? PRINCIPAL_A,
    options.membership ?? MEMBERSHIP_A,
    PLAN,
    "free_starter",
    options.planVersion ?? 1,
    options.productLimit ?? 100,
    options.now ?? NOW,
  ];
}

function appSummarySql(options = {}) {
  const values = authority(options).map((value, index) => {
    if (index === 5 || index === 6) return String(value);
    const type = index <= 3 ? "uuid" : index === 7 ? "timestamptz" : "text";
    return `'${String(value).replaceAll("'", "''")}'::${type}`;
  });
  return `BEGIN; SET LOCAL ROLE celebix_saas_app; SELECT outcome || E'\\t' || COALESCE(result_payload::text, 'null') FROM saas.catalog_get_dashboard_summary(${values.join(",")}); COMMIT;`;
}

function summary(backend, options = {}, database = DATABASE) {
  const output = psql(backend, appSummarySql(options), database);
  const [outcome, raw] = output.split("\t", 2);
  return { outcome, payload: raw === "null" ? null : JSON.parse(raw) };
}

function seed(backend, database = DATABASE) {
  psql(backend, `
    BEGIN;
    SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
      ('${PRINCIPAL_A}','https://identity.example.test/oidc','dashboard-a','a@example.test',true,'2026-01-01','2026-01-01'),
      ('${PRINCIPAL_B}','https://identity.example.test/oidc','dashboard-b','b@example.test',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE_A}','Dashboard Store A','dashboard-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
      ('${STORE_B}','Dashboard Store B','dashboard-b','active','tr','TRY','default','2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
      ('${MEMBERSHIP_A}','${PRINCIPAL_A}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01'),
      ('${MEMBERSHIP_B}','${PRINCIPAL_B}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES
      ('70000000-0000-4000-8000-000000000001','${STORE_A}','${PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01'),
      ('70000000-0000-4000-8000-000000000002','${STORE_B}','${PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01');
    INSERT INTO saas.products(id,store_id,slug,title,description,status,currency,version,created_at,updated_at,archived_at) VALUES
      ('${PRODUCT_ACTIVE}','${STORE_A}','active-product','Active product','Visible','active','TRY',1,'2026-02-01','2026-02-01',NULL),
      ('${PRODUCT_DRAFT}','${STORE_A}','draft-product','Draft product','Draft','draft','TRY',1,'2026-03-01','2026-03-01',NULL),
      ('${PRODUCT_ARCHIVED}','${STORE_A}','archived-product','Archived product','Hidden','archived','TRY',2,'2026-01-15','2026-04-01','2026-04-01'),
      ('${PRODUCT_B}','${STORE_B}','tenant-b-product','Tenant B product','Other tenant','active','TRY',1,'2026-02-01','2026-02-01',NULL);
    INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at,archived_at) VALUES
      ('${VARIANT_ZERO}','${PRODUCT_ACTIVE}','${STORE_A}','Tracked zero','A-ZERO',1000,true,0,'active','{}',1,'2026-02-01','2026-02-01',NULL),
      ('${VARIANT_UNTRACKED}','${PRODUCT_ACTIVE}','${STORE_A}','Untracked zero','A-UNTRACKED',1000,false,0,'active','{}',1,'2026-02-01','2026-02-01',NULL),
      ('${VARIANT_DRAFT}','${PRODUCT_DRAFT}','${STORE_A}','Draft variant','A-DRAFT',1000,true,5,'active','{}',1,'2026-03-01','2026-03-01',NULL),
      ('${VARIANT_ARCHIVED}','${PRODUCT_ACTIVE}','${STORE_A}','Archived variant','A-ARCHIVED',1000,true,0,'archived','{}',2,'2026-02-01','2026-04-01','2026-04-01'),
      ('${VARIANT_HIDDEN_PRODUCT}','${PRODUCT_ARCHIVED}','${STORE_A}','Hidden product variant','A-HIDDEN',1000,true,0,'active','{}',1,'2026-02-01','2026-02-01',NULL),
      ('${VARIANT_B}','${PRODUCT_B}','${STORE_B}','Tenant B variant','B-ONE',1000,false,0,'active','{}',1,'2026-02-01','2026-02-01',NULL);
    INSERT INTO saas.product_media(id,store_id,product_id,object_key,public_url,media_type,alt_text,width,height,byte_size,sort_order,status,created_at,updated_at,archived_at,version) VALUES
      ('${MEDIA_ACTIVE}','${STORE_A}','${PRODUCT_ACTIVE}','stores/${STORE_A}/products/${PRODUCT_ACTIVE}/${MEDIA_ACTIVE}.webp','https://media.example.test/stores/${STORE_A}/products/${PRODUCT_ACTIVE}/${MEDIA_ACTIVE}.webp','image/webp','Active',1200,1200,1000,0,'active','2026-02-01','2026-02-01',NULL,1),
      ('${MEDIA_PENDING}','${STORE_A}','${PRODUCT_ACTIVE}','stores/${STORE_A}/products/${PRODUCT_ACTIVE}/${MEDIA_PENDING}.webp','https://media.example.test/stores/${STORE_A}/products/${PRODUCT_ACTIVE}/${MEDIA_PENDING}.webp','image/webp','Pending',1200,1200,1000,1,'pending','2026-02-01','2026-02-01',NULL,1),
      ('${MEDIA_ARCHIVED}','${STORE_A}','${PRODUCT_ACTIVE}','stores/${STORE_A}/products/${PRODUCT_ACTIVE}/${MEDIA_ARCHIVED}.webp','https://media.example.test/stores/${STORE_A}/products/${PRODUCT_ACTIVE}/${MEDIA_ARCHIVED}.webp','image/webp','Archived',1200,1200,1000,2,'archived','2026-02-01','2026-04-01','2026-04-01',2),
      ('${MEDIA_HIDDEN_PRODUCT}','${STORE_A}','${PRODUCT_ARCHIVED}','stores/${STORE_A}/products/${PRODUCT_ARCHIVED}/${MEDIA_HIDDEN_PRODUCT}.webp','https://media.example.test/stores/${STORE_A}/products/${PRODUCT_ARCHIVED}/${MEDIA_HIDDEN_PRODUCT}.webp','image/webp','Hidden',1200,1200,1000,0,'active','2026-02-01','2026-02-01',NULL,1),
      ('${MEDIA_B}','${STORE_B}','${PRODUCT_B}','stores/${STORE_B}/products/${PRODUCT_B}/${MEDIA_B}.webp','https://media.example.test/stores/${STORE_B}/products/${PRODUCT_B}/${MEDIA_B}.webp','image/webp','Tenant B',1200,1200,1000,0,'active','2026-02-01','2026-02-01',NULL,1);
    COMMIT;
  `, database);
}

function expectedA() {
  return {
    activeMedia: 1,
    activeProducts: 1,
    activeVariants: 3,
    draftProducts: 1,
    outOfStockVariants: 1,
    productLimit: 100,
    productsWithoutMedia: 1,
    totalProducts: 2,
  };
}

async function main() {
  const backend = startPostgres();
  let pool;
  try {
    createDatabase(backend, DATABASE);
    for (const migration of migrations) apply(backend, migration);

    await scenario("PostgreSQL 16 applies migrations 001-021", async () => {
      assert.match(psql(backend, "SHOW server_version;"), /^16\.14/);
      assert.equal(psql(backend, `SELECT to_regprocedure('${SUMMARY_SIGNATURE}')::text;`), SUMMARY_SIGNATURE);
    });

    await scenario("manifest binds exact 021 artifact bytes", async () => {
      const manifest = JSON.parse(readFileSync(path.join(SQL, "shared-merchant-catalog-dashboard-manifest.json"), "utf8"));
      assert.equal(manifest.postgresqlMajor, 16);
      for (const artifact of manifest.artifacts) {
        const digest = createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex");
        assert.equal(artifact.sha256, digest);
      }
    });

    await scenario("summary function is stable SECURITY DEFINER with pinned search_path", async () => {
      assert.equal(
        psql(backend, `SELECT owner.rolname||':'||procedure.prosecdef::text||':'||procedure.provolatile::text||':'||array_to_string(procedure.proconfig,',') FROM pg_proc AS procedure JOIN pg_roles AS owner ON owner.oid=procedure.proowner WHERE procedure.oid='${SUMMARY_SIGNATURE}'::regprocedure;`),
        "celebix_saas_owner:true:s:search_path=pg_catalog, saas",
      );
    });

    await scenario("PUBLIC cannot execute and app role can execute summary", async () => {
      assert.equal(
        psql(backend, `SELECT has_function_privilege('public','${SUMMARY_SIGNATURE}','EXECUTE')||':'||has_function_privilege('celebix_saas_app','${SUMMARY_SIGNATURE}','EXECUTE');`),
        "false:true",
      );
    });

    await scenario("app role has no direct catalog table SELECT", async () => {
      for (const table of ["products", "product_variants", "product_media"]) {
        assert.equal(psql(backend, `SELECT has_table_privilege('celebix_saas_app','saas.${table}','SELECT');`), "f");
      }
      const denied = psqlResult(backend, "BEGIN; SET LOCAL ROLE celebix_saas_app; SELECT count(*) FROM saas.products; COMMIT;", DATABASE, { allowFailure: true });
      assert.notEqual(denied.status, 0);
    });

    seed(backend);

    await scenario("owner A sees exact product variant media counts", async () => {
      assert.deepEqual(summary(backend), { outcome: "summarized", payload: expectedA() });
      assert.deepEqual(Object.keys(summary(backend).payload).sort(), [
        "activeMedia", "activeProducts", "activeVariants", "draftProducts",
        "outOfStockVariants", "productLimit", "productsWithoutMedia", "totalProducts",
      ]);
    });

    await scenario("owner B sees only store B counts", async () => {
      assert.deepEqual(summary(backend, { store: STORE_B, principal: PRINCIPAL_B, membership: MEMBERSHIP_B }), {
        outcome: "summarized",
        payload: {
          activeMedia: 1,
          activeProducts: 1,
          activeVariants: 1,
          draftProducts: 0,
          outOfStockVariants: 0,
          productLimit: 100,
          productsWithoutMedia: 0,
          totalProducts: 1,
        },
      });
    });

    await scenario("archived products are excluded from visible totals", async () => {
      assert.equal(summary(backend).payload.totalProducts, 2);
      assert.equal(summary(backend).payload.activeVariants, 3);
      assert.equal(summary(backend).payload.activeMedia, 1);
    });

    await scenario("archived variants and media are excluded", async () => {
      assert.equal(summary(backend).payload.activeVariants, 3);
      assert.equal(summary(backend).payload.activeMedia, 1);
    });

    await scenario("tracked zero stock variants are counted exactly", async () => {
      assert.equal(summary(backend).payload.outOfStockVariants, 1);
    });

    await scenario("untracked zero quantity is not out of stock", async () => {
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.product_variants SET stock_tracking=false,stock_quantity=0 WHERE id='${VARIANT_ZERO}'; COMMIT;`);
      assert.equal(summary(backend).payload.outOfStockVariants, 0);
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.product_variants SET stock_tracking=true,stock_quantity=0 WHERE id='${VARIANT_ZERO}'; COMMIT;`);
    });

    await scenario("wrong store authority is denied", async () => {
      assert.deepEqual(summary(backend, { store: STORE_A, principal: PRINCIPAL_B, membership: MEMBERSHIP_B }), { outcome: "membership_denied", payload: null });
    });

    await scenario("inactive membership is denied", async () => {
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.memberships SET status='revoked',updated_at='${NOW}' WHERE id='${MEMBERSHIP_A}'; COMMIT;`);
      assert.deepEqual(summary(backend), { outcome: "membership_denied", payload: null });
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.memberships SET status='active',updated_at='${NOW}' WHERE id='${MEMBERSHIP_A}'; COMMIT;`);
    });

    await scenario("expired subscription is denied", async () => {
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.subscriptions SET valid_until='2026-07-19',updated_at='${NOW}' WHERE store_id='${STORE_A}'; COMMIT;`);
      assert.deepEqual(summary(backend), { outcome: "durable_authority_invalid", payload: null });
      psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.subscriptions SET valid_until=NULL,updated_at='${NOW}' WHERE store_id='${STORE_A}'; COMMIT;`);
    });

    await scenario("wrong plan version and product limit are denied", async () => {
      assert.deepEqual(summary(backend, { planVersion: 2 }), { outcome: "durable_authority_invalid", payload: null });
      assert.deepEqual(summary(backend, { productLimit: 99 }), { outcome: "durable_authority_invalid", payload: null });
    });

    psql(backend, `CREATE ROLE ${WORKLOAD_ROLE} LOGIN; GRANT celebix_saas_app TO ${WORKLOAD_ROLE};`);
    pool = new Pool({ host: backend.socketDirectory, port: backend.port, user: WORKLOAD_ROLE, database: DATABASE, max: 16 });
    await scenario("concurrent reads return one internally consistent snapshot shape", async () => {
      const values = authority();
      const results = await Promise.all(Array.from({ length: 16 }, () => pool.query(
        `SELECT outcome, result_payload FROM saas.catalog_get_dashboard_summary($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::bigint,$7::bigint,$8::timestamptz)`,
        values,
      )));
      for (const result of results) {
        assert.equal(result.rows.length, 1);
        assert.equal(result.rows[0].outcome, "summarized");
        assert.deepEqual(result.rows[0].result_payload, expectedA());
      }
    });
    await pool.end();
    pool = undefined;

    const dump = path.join(backend.temporaryDirectory, "merchant-dashboard.dump");
    command(backend.executables.pg_dump, ["-h", backend.socketDirectory, "-p", String(backend.port), "-U", "postgres", "-Fc", "-f", dump, DATABASE]);
    createDatabase(backend, RESTORE_DATABASE);
    command(backend.executables.pg_restore, ["-h", backend.socketDirectory, "-p", String(backend.port), "-U", "postgres", "-d", RESTORE_DATABASE, dump]);
    await scenario("backup restore preserves the summary", async () => {
      assert.deepEqual(summary(backend, {}, RESTORE_DATABASE), { outcome: "summarized", payload: expectedA() });
    });

    createDatabase(backend, ROLLBACK_DATABASE, DATABASE);
    apply(backend, "202607200021_catalog_dashboard_summary.down.sql", ROLLBACK_DATABASE);
    assert.equal(psql(backend, `SELECT to_regprocedure('${SUMMARY_SIGNATURE}') IS NULL;`, ROLLBACK_DATABASE), "t");
    apply(backend, "202607200021_catalog_dashboard_summary.up.sql", ROLLBACK_DATABASE);
    apply(backend, "202607200021_catalog_dashboard_summary_assertions.sql", ROLLBACK_DATABASE);
    await scenario("rollback removes only 021 and reapply restores it with cleanup", async () => {
      assert.deepEqual(summary(backend, {}, ROLLBACK_DATABASE), { outcome: "summarized", payload: expectedA() });
      assert.equal(psql(backend, "SELECT to_regclass('saas.products')::text||':'||to_regclass('saas.product_media')::text;", ROLLBACK_DATABASE), "saas.products:saas.product_media");
    });

    assert.equal(completed.length, TOTAL);
    process.stdout.write(`PASS ${TOTAL}/${TOTAL} shared merchant catalog dashboard PostgreSQL harness complete\n`);
  } finally {
    if (pool) await pool.end().catch(() => undefined);
    stopPostgres(backend);
  }
}

await main();
