import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const TOKEN = randomBytes(5).toString("hex");
const DB = `guzide_catalog_${TOKEN}`;
const ROLLBACK = `${DB}_rollback`;
const RESTORE = `${DB}_restore`;
const STORE = "41000000-0000-4000-8000-000000000001";
const STORE_B = "41000000-0000-4000-8000-000000000002";
const PRINCIPAL = "42000000-0000-4000-8000-000000000001";
const PRINCIPAL_B = "42000000-0000-4000-8000-000000000002";
const MEMBERSHIP = "43000000-0000-4000-8000-000000000001";
const MEMBERSHIP_B = "43000000-0000-4000-8000-000000000002";
const SUBSCRIPTION = "44000000-0000-4000-8000-000000000001";
const SUBSCRIPTION_B = "44000000-0000-4000-8000-000000000002";
const PLAN = "00000000-0000-4000-8000-000000000001";
const JOB = "45000000-0000-4000-8000-000000000001";
const CATEGORY = "46000000-0000-4000-8000-000000000001";
const BRAND = "47000000-0000-4000-8000-000000000001";
const PRODUCT_A = "48000000-0000-4000-8000-000000000001";
const PRODUCT_B = "48000000-0000-4000-8000-000000000002";
const VARIANT_A = "49000000-0000-4000-8000-000000000001";
const VARIANT_B = "49000000-0000-4000-8000-000000000002";
const BEGIN_OP = "4a000000-0000-4000-8000-000000000001";
const BATCH_OP_A = "4a000000-0000-4000-8000-000000000002";
const BATCH_OP_B = "4a000000-0000-4000-8000-000000000003";
const SOURCE = "a".repeat(64);
const IMAGE_A = "b".repeat(64);
const IMAGE_B = "c".repeat(64);
const IMAGE_C = "d".repeat(64);
const NOW = "2026-07-28T12:00:00.000Z";
const UP = "202607280059_catalog_product_migrations.up.sql";
const DOWN = "202607280059_catalog_product_migrations.down.sql";
const ASSERTIONS = "202607280059_catalog_product_migrations_assertions.sql";
const PRIOR = JSON.parse(readFileSync(path.join(SQL, "phase3n-hosted-callback-lifecycle-manifest.json"), "utf8"));
const ONBOARDING = JSON.parse(readFileSync(path.join(SQL, "phase3-product-onboarding-manifest.json"), "utf8"));
const MEDIA = JSON.parse(readFileSync(path.join(SQL, "phase3-tenant-r2-media-manifest.json"), "utf8"));
const MANIFEST = JSON.parse(readFileSync(path.join(SQL, "phase3-guzide-catalog-migration-manifest.json"), "utf8"));
const TOTAL = 23;
let completed = 0;
let winningBatchOperation = "";

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {}
  }
  return null;
}
function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT, encoding: "utf8", input: options.input,
    env: { ...process.env, PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}
function commandAsync(program, args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd: ROOT, env: { ...process.env, PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject); child.once("close", (status) => resolve({ status, stdout, stderr })); child.stdin.end(input);
  });
}
function start() {
  assertSafeEnvironment();
  const names = [...new Set([...REQUIRED_NATIVE_TOOLS, "pg_dump", "pg_restore", "createdb", "dropdb"])];
  const executables = Object.fromEntries(names.map((name) => [name, executable(name)]));
  if (Object.values(executables).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const root = mkdtempSync("/tmp/celebix-guzide-catalog-");
  const data = path.join(root, "data"), socket = path.join(root, "socket"), port = 20_000 + Math.floor(Math.random() * 15_000);
  mkdirSync(socket, { mode: 0o700 });
  command(executables.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(executables.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { executables, root, data, socket, port, pid: Number.parseInt(readFileSync(path.join(data, "postmaster.pid"), "utf8"), 10), started: true };
}
function stop(box) {
  if (!box) return;
  if (box.started) command(box.executables.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], { allowFailure: true });
  rmSync(box.root, { recursive: true, force: true });
}
function args(box, database = DB) { return ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database]; }
function psql(box, source, database = DB, allowFailure = false) { return command(box.executables.psql, args(box, database), { input: source, allowFailure }); }
async function psqlAsync(box, source, database = DB) {
  const result = await commandAsync(box.executables.psql, args(box, database), source);
  if (result.status !== 0) throw new Error(`psql failed\n${result.stderr}`);
  return result.stdout.trim();
}
function apply(box, file, database = DB) { psql(box, readFileSync(path.join(SQL, file), "utf8"), database); }
function sha256(file) { return createHash("sha256").update(readFileSync(path.join(SQL, file))).digest("hex"); }
function digest(marker) { return createHash("sha256").update(marker).digest("hex"); }
function applyBase(box, database = DB) {
  for (const artifact of PRIOR.migrationChain) { assert.equal(sha256(artifact.file), artifact.sha256); apply(box, artifact.file, database); }
  for (const bundle of [ONBOARDING, MEDIA]) for (const artifact of bundle.artifacts) {
    if (artifact.direction === "up" || artifact.direction === "verify") { assert.equal(sha256(artifact.file), artifact.sha256); apply(box, artifact.file, database); }
  }
}
async function scenario(name, run) { await run(); completed += 1; process.stdout.write(`PASS ${completed}/${TOTAL} ${name}\n`); }
function authority(overrides = {}) {
  return `'${overrides.store ?? STORE}','${overrides.principal ?? PRINCIPAL}','${overrides.membership ?? MEMBERSHIP}','${overrides.plan ?? PLAN}','${overrides.code ?? "free_starter"}',${overrides.version ?? 1},${overrides.limit ?? 100},'${overrides.now ?? NOW}'`;
}
function outcome(box, expression, database = DB) {
  const raw = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${expression};COMMIT;`, database).stdout.trim();
  return JSON.parse(raw);
}
function categories() { return JSON.stringify([{ id: CATEGORY, name: "Yüzükler", slug: "yuzukler" }]); }
function brands() { return JSON.stringify([{ id: BRAND, name: "Güzide Kuyumcu", slug: "guzide-kuyumcu" }]); }
function beginExpression(operation = BEGIN_OP, fingerprint = digest("begin"), totalProducts = 2, totalMedia = 3) {
  return `saas.catalog_migration_begin(${authority()},'${operation}','${fingerprint}','${JOB}','${SOURCE}',${totalProducts},${totalMedia},$json$${categories()}$json$::jsonb,$json$${brands()}$json$::jsonb)`;
}
const PRODUCTS = JSON.stringify([
  {
    sourceProductId: "30794", productId: PRODUCT_A, title: "14 Ayar Altın Yüzük", slug: "14-ayar-altin-yuzuk-30794",
    description: "Birinci satır\n\nİkinci satır", status: "active", categorySlugs: ["yuzukler"], brandSlugs: ["guzide-kuyumcu"],
    variant: { variantId: VARIANT_A, title: "Varsayılan", sku: "YZK-30794", barcode: "8680000030794", priceCents: 1_127_100, stockQuantity: 1, attributes: { "Ağırlık (g)": "2.35" } },
    sourceImageDigests: [IMAGE_A, IMAGE_B],
  },
  {
    sourceProductId: "30795", productId: PRODUCT_B, title: "14 Ayar Altın Kolye", slug: "14-ayar-altin-kolye-30795",
    status: "draft", categorySlugs: ["yuzukler"], brandSlugs: ["guzide-kuyumcu"],
    variant: { variantId: VARIANT_B, title: "Varsayılan", sku: "KLY-30795", priceCents: 0, stockQuantity: 0, attributes: { "Ağırlık (g)": "5.556" } },
    sourceImageDigests: [IMAGE_C],
  },
]);
function batchExpression(operation, fingerprint = digest("batch"), products = PRODUCTS) {
  return `saas.catalog_migration_import_batch(${authority()},'${operation}','${fingerprint}','${JOB}','${SOURCE}',$json$${products}$json$::jsonb)`;
}
function absent(pid) { if (!Number.isSafeInteger(pid)) return true; return spawnSync("kill", ["-0", String(pid)]).status !== 0; }

async function main() {
  let box; let cleanupReady = false;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    applyBase(box);
    psql(box, `CREATE DATABASE ${ROLLBACK} TEMPLATE ${DB};`, "postgres");
    apply(box, UP); apply(box, ASSERTIONS);
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
        ('${STORE}','Guzide Staging','guzide-staging','active','tr','TRY','default','${NOW}','${NOW}'),
        ('${STORE_B}','Other Staging','other-staging','active','tr','TRY','default','${NOW}','${NOW}');
      INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
        ('${PRINCIPAL}','https://identity.example.test/oidc','guzide','guzide@example.test',true,'${NOW}','${NOW}'),
        ('${PRINCIPAL_B}','https://identity.example.test/oidc','other','other@example.test',true,'${NOW}','${NOW}');
      INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
        ('${MEMBERSHIP}','${PRINCIPAL}','${STORE}','store_owner','active','${NOW}','${NOW}'),
        ('${MEMBERSHIP_B}','${PRINCIPAL_B}','${STORE_B}','store_owner','active','${NOW}','${NOW}');
      INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
        ('${SUBSCRIPTION}','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01T00:00:00.000Z','${NOW}','${NOW}'),
        ('${SUBSCRIPTION_B}','${STORE_B}','${PLAN}','free_starter',1,'active','2026-01-01T00:00:00.000Z','${NOW}','${NOW}');
      COMMIT;`);

    await scenario("PostgreSQL 16 applies the complete chain through migration 059", () => {
      assert.match(psql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
      assert.equal(psql(box, "SELECT to_regclass('saas.catalog_product_migration_jobs') IS NOT NULL;").stdout.trim(), "t");
    });
    await scenario("manifest checksums are exact", () => {
      assert.equal(MANIFEST.postgresqlMajor, 16);
      for (const artifact of MANIFEST.artifacts) assert.equal(sha256(artifact.file), artifact.sha256, artifact.file);
    });
    await scenario("begin creates one processing job", () => {
      const result = outcome(box, beginExpression()); assert.equal(result.outcome, "begun"); assert.equal(result.result.jobId, JOB); assert.equal(result.result.replayed, false);
    });
    await scenario("begin creates exact category and brand authority", () => {
      assert.equal(psql(box, `SELECT name||'|'||slug FROM saas.catalog_categories WHERE store_id='${STORE}';`).stdout.trim(), "Yüzükler|yuzukler");
      assert.equal(psql(box, `SELECT name||'|'||slug FROM saas.catalog_admin_resources WHERE store_id='${STORE}' AND resource_kind='brand';`).stdout.trim(), "Güzide Kuyumcu|guzide-kuyumcu");
    });
    await scenario("begin operation replay is exact and mismatch is denied", () => {
      assert.equal(outcome(box, beginExpression()).outcome, "operation_replayed");
      assert.equal(outcome(box, beginExpression(BEGIN_OP, "f".repeat(64))).outcome, "operation_mismatch");
    });
    await scenario("same source with incompatible totals is denied", () => {
      assert.equal(outcome(box, beginExpression("4a000000-0000-4000-8000-000000000010", digest("begin-other"), 3, 3)).outcome, "job_mismatch");
    });
    await scenario("job read exposes only durable progress", () => {
      const result = outcome(box, `saas.catalog_migration_get(${authority()},'${JOB}')`); assert.equal(result.outcome, "found"); assert.equal(result.result.importedProducts, 0); assert.equal(JSON.stringify(result).includes("tenantContext"), false);
    });
    await scenario("cross-store and mismatched plan authority are denied", () => {
      assert.equal(outcome(box, `saas.catalog_migration_get(${authority({ store: STORE_B, principal: PRINCIPAL_B, membership: MEMBERSHIP_B })},'${JOB}')`).outcome, "job_not_found");
      assert.equal(outcome(box, `saas.catalog_migration_get(${authority({ code: "growth" })},'${JOB}')`).outcome, "durable_authority_invalid");
    });
    await scenario("a batch cannot use taxonomy outside its immutable job manifest", () => {
      psql(box, `SET ROLE celebix_saas_owner;INSERT INTO saas.catalog_categories(id,store_id,name,slug,position,depth,status,version,created_at,updated_at) VALUES('46000000-0000-4000-8000-000000000002','${STORE}','Other','other-category',0,1,'active',1,'${NOW}','${NOW}');`);
      const hostile = JSON.parse(PRODUCTS); hostile[0].categorySlugs = ["other-category"];
      assert.equal(outcome(box, batchExpression("4a000000-0000-4000-8000-000000000011", digest("outside-taxonomy"), JSON.stringify(hostile))).outcome, "import_conflict");
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_product_migration_items WHERE job_id='${JOB}';`).stdout.trim(), "0");
    });
    await scenario("concurrent batch attempts import products exactly once", async () => {
      const sql = (operation) => `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM ${batchExpression(operation)};COMMIT;`;
      const results = await Promise.all([psqlAsync(box, sql(BATCH_OP_A)), psqlAsync(box, sql(BATCH_OP_B))]);
      assert.deepEqual(results.sort(), ["batch_imported", "job_mismatch"]);
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_product_migration_items WHERE store_id='${STORE}' AND job_id='${JOB}';`).stdout.trim(), "2");
      winningBatchOperation = psql(box, `SELECT operation_id FROM saas.catalog_product_migration_operations WHERE operation_id IN('${BATCH_OP_A}','${BATCH_OP_B}');`).stdout.trim();
      assert.ok([BATCH_OP_A, BATCH_OP_B].includes(winningBatchOperation));
    });
    await scenario("products variants and multiline descriptions persist exactly", () => {
      assert.equal(psql(box, `SELECT title||'|'||status||'|'||currency FROM saas.products WHERE id='${PRODUCT_A}';`).stdout.trim(), "14 Ayar Altın Yüzük|active|TRY");
      assert.equal(psql(box, `SELECT description=E'Birinci satır\\n\\nİkinci satır' FROM saas.products WHERE id='${PRODUCT_A}';`).stdout.trim(), "t");
      assert.equal(psql(box, `SELECT sku||'|'||price_cents||'|'||stock_quantity FROM saas.product_variants WHERE id='${VARIANT_A}';`).stdout.trim(), "YZK-30794|1127100|1");
    });
    await scenario("precise gram weights persist in commerce profiles", () => {
      assert.equal(psql(box, `SELECT measured_quantity_milli||'|'||measured_unit||'|'||base_quantity_milli||'|'||base_unit FROM saas.catalog_variant_commerce_profiles WHERE variant_id='${VARIANT_A}';`).stdout.trim(), "2350|g|1000|g");
      assert.equal(psql(box, `SELECT measured_quantity_milli FROM saas.catalog_variant_commerce_profiles WHERE variant_id='${VARIANT_B}';`).stdout.trim(), "5556");
    });
    await scenario("category and brand relations bind both products", () => {
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_product_categories WHERE store_id='${STORE}' AND category_id='${CATEGORY}';`).stdout.trim(), "2");
      assert.equal(psql(box, `SELECT count(*) FROM saas.catalog_admin_resource_products WHERE store_id='${STORE}' AND resource_id='${BRAND}';`).stdout.trim(), "2");
    });
    await scenario("media ledger stores ordered digests and no raw URLs", () => {
      assert.equal(psql(box, `SELECT string_agg(source_url_digest::text,',' ORDER BY source_product_id,ordinal) FROM saas.catalog_product_migration_media_items WHERE job_id='${JOB}';`).stdout.trim(), [IMAGE_A, IMAGE_B, IMAGE_C].join(","));
      assert.equal(psql(box, "SELECT count(*) FROM information_schema.columns WHERE table_schema='saas' AND table_name LIKE 'catalog_product_migration_%' AND column_name IN('source_url','raw_url');").stdout.trim(), "0");
    });
    await scenario("completed product batches transition to media processing", () => {
      const result = outcome(box, `saas.catalog_migration_get(${authority()},'${JOB}')`); assert.equal(result.result.status, "media_processing"); assert.equal(result.result.importedProducts, 2); assert.equal(result.result.totalMedia, 3);
    });
    await scenario("batch replay returns immutable ordered mappings", () => {
      const result = outcome(box, batchExpression(winningBatchOperation)); assert.equal(result.outcome, "operation_replayed"); assert.deepEqual(result.result.mappings, [{ sourceProductId: "30794", productId: PRODUCT_A }, { sourceProductId: "30795", productId: PRODUCT_B }]);
      assert.equal(outcome(box, batchExpression(winningBatchOperation, "e".repeat(64))).outcome, "operation_mismatch");
    });
    await scenario("read-only operation recovery never repeats a write", () => {
      const result = outcome(box, `saas.catalog_migration_recover_operation(${authority()},'${winningBatchOperation}','${digest("batch")}')`); assert.equal(result.outcome, "operation_replayed"); assert.equal(result.result.importedProducts, 2);
      assert.equal(outcome(box, `saas.catalog_migration_recover_operation(${authority()},'${winningBatchOperation}','${"0".repeat(64)}')`).outcome, "operation_mismatch");
    });
    await scenario("invalid product batches and product limits fail closed", () => {
      assert.equal(outcome(box, `saas.catalog_migration_import_batch(${authority()},'4a000000-0000-4000-8000-000000000020','${digest("empty")}','${JOB}','${SOURCE}','[]'::jsonb)`).outcome, "invalid_input");
      assert.equal(outcome(box, `saas.catalog_migration_get(${authority({ limit: 99 })},'${JOB}')`).outcome, "durable_authority_invalid");
    });
    await scenario("app has function-only authority and forced RLS", () => {
      assert.equal(psql(box, "SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class WHERE oid IN('saas.catalog_product_migration_jobs'::regclass,'saas.catalog_product_migration_items'::regclass,'saas.catalog_product_migration_media_items'::regclass,'saas.catalog_product_migration_operations'::regclass);").stdout.trim(), "t");
      assert.notEqual(psql(box, "SET ROLE celebix_saas_app;SELECT count(*) FROM saas.catalog_product_migration_jobs;", DB, true).status, 0);
    });
    await scenario("operation job and item identities resist privileged mutation", () => {
      assert.notEqual(psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.catalog_product_migration_operations SET payload_fingerprint='${"0".repeat(64)}' WHERE operation_id='${BEGIN_OP}';`, DB, true).status, 0);
      assert.notEqual(psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.catalog_product_migration_jobs SET source_digest='${"0".repeat(64)}',version=version+1 WHERE id='${JOB}';`, DB, true).status, 0);
      assert.notEqual(psql(box, `SET ROLE celebix_saas_owner;DELETE FROM saas.catalog_product_migration_items WHERE job_id='${JOB}';`, DB, true).status, 0);
    });
    await scenario("backup and restore preserve rows ownership ACL RLS and functions", () => {
      const dump = path.join(box.root, "guzide.dump");
      command(box.executables.pg_dump, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-Fc", "-f", dump, DB]);
      psql(box, `CREATE DATABASE ${RESTORE};`, "postgres");
      command(box.executables.pg_restore, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-d", RESTORE, dump]);
      assert.equal(psql(box, "SELECT count(*) FROM saas.catalog_product_migration_items;", RESTORE).stdout.trim(), "2");
      assert.equal(outcome(box, `saas.catalog_migration_get(${authority()},'${JOB}')`, RESTORE).outcome, "found");
      assert.notEqual(psql(box, "SET ROLE celebix_saas_app;SELECT count(*) FROM saas.catalog_product_migration_jobs;", RESTORE, true).status, 0);
    });
    await scenario("empty rollback and reapply restore exact migration 059 authority", () => {
      apply(box, UP, ROLLBACK); apply(box, ASSERTIONS, ROLLBACK); apply(box, DOWN, ROLLBACK);
      assert.equal(psql(box, "SELECT to_regclass('saas.catalog_product_migration_jobs') IS NULL;", ROLLBACK).stdout.trim(), "t");
      apply(box, UP, ROLLBACK); apply(box, ASSERTIONS, ROLLBACK);
      assert.equal(psql(box, "SELECT to_regclass('saas.catalog_product_migration_jobs') IS NOT NULL;", ROLLBACK).stdout.trim(), "t");
    });
    cleanupReady = true;
  } finally {
    const root = box?.root, data = box?.data, socket = box?.socket, pid = box?.pid;
    stop(box);
    if (cleanupReady) {
      await scenario("cleanup removes the isolated PostgreSQL cluster", () => { assert.equal(existsSync(root), false); assert.equal(existsSync(data), false); assert.equal(existsSync(socket), false); assert.equal(absent(pid), true); });
      assert.equal(completed, TOTAL); console.log(`${TOTAL}/${TOTAL} PASS cleanup PASS`);
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
