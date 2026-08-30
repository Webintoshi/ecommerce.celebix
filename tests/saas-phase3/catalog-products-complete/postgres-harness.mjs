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
const DATABASE = `catalog_products_complete_${randomBytes(6).toString("hex")}`;
const NOW = "2026-08-30T12:00:00.000Z";
const LATER = "2026-10-01T12:00:00.000Z";
const PLAN = "00000000-0000-4000-8000-000000000001";
const STORE = "10000000-0000-4000-8000-000000000121";
const STORE_B = "10000000-0000-4000-8000-000000000122";
const PRODUCT_A = "50000000-0000-4000-8000-000000000121";
const PRODUCT_B = "50000000-0000-4000-8000-000000000122";
const PRODUCT_C = "50000000-0000-4000-8000-000000000123";
const PRODUCT_FOREIGN = "50000000-0000-4000-8000-000000000124";
const MEDIA_RESTORE = "70000000-0000-4000-8000-000000000121";
const MEDIA_CLEANUP = "70000000-0000-4000-8000-000000000122";
const FINGERPRINT = "a".repeat(64);
const actors = Object.freeze({
  owner: ["20000000-0000-4000-8000-000000000121", "30000000-0000-4000-8000-000000000121"],
  admin: ["20000000-0000-4000-8000-000000000122", "30000000-0000-4000-8000-000000000122"],
  editor: ["20000000-0000-4000-8000-000000000123", "30000000-0000-4000-8000-000000000123"],
  analyst: ["20000000-0000-4000-8000-000000000124", "30000000-0000-4000-8000-000000000124"],
  foreign: ["20000000-0000-4000-8000-000000000125", "30000000-0000-4000-8000-000000000125"],
});
const V1 = "saas.catalog_list_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,integer,timestamp with time zone,uuid)";
const V2 = "saas.catalog_list_products_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,integer,timestamp with time zone,uuid)";
const V3 = "saas.catalog_list_products_v3(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,text,text,uuid,uuid,uuid,text,integer,timestamp with time zone,text,uuid)";
const PRIOR = JSON.parse(readFileSync(path.join(SQL, "phase3n-hosted-callback-lifecycle-manifest.json"), "utf8"));
const before117 = [
  ...PRIOR.migrationChain.map(({ file }) => file),
  "202607280056_catalog_product_onboarding.up.sql",
  "202607280056_catalog_product_onboarding_assertions.sql",
  "202607280058_store_media_namespace_exports.up.sql",
  "202607280058_store_media_namespace_exports_assertions.sql",
  "202607290065_catalog_featured_image_listing.up.sql",
  "202607290065_catalog_featured_image_listing_assertions.sql",
  "202608250114_catalog_product_lifecycle_authorization.up.sql",
  "202608250114_catalog_product_lifecycle_authorization_assertions.sql",
  "202608260115_catalog_product_list_projection.up.sql",
  "202608260115_catalog_product_list_projection_assertions.sql",
  "202608260116_catalog_product_global_query.up.sql",
  "202608260116_catalog_product_global_query_assertions.sql",
];
const additions = [
  "202608300117_catalog_product_bulk_safe_removal.up.sql",
  "202608300117_catalog_product_bulk_safe_removal_assertions.sql",
  "202608300118_catalog_media_retention_restore.up.sql",
  "202608300118_catalog_media_retention_restore_assertions.sql",
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
  if (!options.allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${String(result.stderr).trim()}`);
  return result;
}

function start() {
  assertSafeEnvironment();
  const executables = Object.fromEntries(REQUIRED_NATIVE_TOOLS.map((name) => [name, executable(name)]));
  if (Object.values(executables).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const root = mkdtempSync(path.join("/tmp", "celebix-catalog-products-complete-"));
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

function psql(box, source, database = DATABASE) {
  return command(box.executables.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input: source }).stdout.trim();
}
function apply(box, file) { psql(box, readFileSync(path.join(SQL, file), "utf8")); }
function authority(actor = "owner", store = STORE, now = NOW, limit = 100) {
  const [principal, membership] = actors[actor];
  return `'${store}'::uuid,'${principal}'::uuid,'${membership}'::uuid,'${PLAN}'::uuid,'free_starter'::text,1::bigint,${limit}::bigint,'${now}'::timestamptz`;
}
function result(box, expression) {
  const raw = psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_app; SELECT pg_catalog.jsonb_build_object('outcome',outcome,'payload',result_payload) FROM ${expression}; COMMIT;`);
  return JSON.parse(raw);
}
function bulk(box, actor, operation, action, targets, now = NOW) {
  return result(box, `saas.catalog_bulk_mutate_products(${authority(actor, STORE, now)},'${operation}'::uuid,'${FINGERPRINT}'::text,'${action}'::text,'${JSON.stringify(targets)}'::jsonb)`);
}
function eligibility(box, actor, product = PRODUCT_A, store = STORE) {
  return result(box, `saas.catalog_product_removal_eligibility(${authority(actor, store)},'${product}'::uuid)`);
}

function seed(box) {
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
      ('${actors.owner[0]}','https://id.test/oidc','products-owner','owner@test.invalid',true,'2026-01-01','2026-01-01'),
      ('${actors.admin[0]}','https://id.test/oidc','products-admin','admin@test.invalid',true,'2026-01-01','2026-01-01'),
      ('${actors.editor[0]}','https://id.test/oidc','products-editor','editor@test.invalid',true,'2026-01-01','2026-01-01'),
      ('${actors.analyst[0]}','https://id.test/oidc','products-analyst','analyst@test.invalid',true,'2026-01-01','2026-01-01'),
      ('${actors.foreign[0]}','https://id.test/oidc','products-foreign','foreign@test.invalid',true,'2026-01-01','2026-01-01');
    INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
      ('${STORE}','Products Complete','products-complete','active','tr','TRY','default','2026-01-01','2026-01-01'),
      ('${STORE_B}','Products Foreign','products-foreign','active','tr','TRY','default','2026-01-01','2026-01-01');
    INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
      ('${actors.owner[1]}','${actors.owner[0]}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),
      ('${actors.admin[1]}','${actors.admin[0]}','${STORE}','admin','active','2026-01-01','2026-01-01'),
      ('${actors.editor[1]}','${actors.editor[0]}','${STORE}','editor','active','2026-01-01','2026-01-01'),
      ('${actors.analyst[1]}','${actors.analyst[0]}','${STORE}','analyst','active','2026-01-01','2026-01-01'),
      ('${actors.foreign[1]}','${actors.foreign[0]}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01');
    INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
      ('43000000-0000-4000-8000-000000000121','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01'),
      ('43000000-0000-4000-8000-000000000122','${STORE_B}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
    INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES
      ('44000000-0000-4000-8000-000000000121','${STORE}','products-complete.example.test','custom_domain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
    INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,archived_at,created_at,updated_at) VALUES
      ('${PRODUCT_A}','${STORE}','product-a','Product A','draft','TRY',1,NULL,'2026-01-01','2026-01-01'),
      ('${PRODUCT_B}','${STORE}','product-b','Product B','draft','TRY',1,NULL,'2026-01-01','2026-01-01'),
      ('${PRODUCT_C}','${STORE}','product-c','Product C','archived','TRY',1,'2026-08-01','2026-01-01','2026-08-01'),
      ('${PRODUCT_FOREIGN}','${STORE_B}','foreign','Foreign','draft','TRY',1,NULL,'2026-01-01','2026-01-01');
    ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES
      ('60000000-0000-4000-8000-000000000121','${PRODUCT_A}','${STORE}','Default','A-1',1000,true,4,'active','{"Renk":"Altın"}',1,'2026-01-01','2026-01-01'),
      ('60000000-0000-4000-8000-000000000122','${PRODUCT_B}','${STORE}','Default','B-1',2000,true,2,'active','{}',1,'2026-01-01','2026-01-01');
    ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.product_media(id,store_id,product_id,object_key,public_url,media_type,alt_text,width,height,byte_size,sort_order,status,cleanup_state,retention_expires_at,archived_at,created_at,updated_at,version) VALUES
      ('${MEDIA_RESTORE}','${STORE}','${PRODUCT_A}','stores/${STORE}/products/${PRODUCT_A}/${MEDIA_RESTORE}.webp','https://media.saas-staging.celebix.site/stores/${STORE}/products/${PRODUCT_A}/${MEDIA_RESTORE}.webp','image/webp','Restore',100,100,1000,0,'archived','retained','2026-09-29','2026-08-30','2026-01-01','2026-08-30',1),
      ('${MEDIA_CLEANUP}','${STORE}','${PRODUCT_A}','stores/${STORE}/products/${PRODUCT_A}/${MEDIA_CLEANUP}.webp','https://media.saas-staging.celebix.site/stores/${STORE}/products/${PRODUCT_A}/${MEDIA_CLEANUP}.webp','image/webp','Cleanup',100,100,1000,1,'archived','retained','2026-09-29','2026-08-30','2026-01-01','2026-08-30',1);
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
    for (const migration of before117) apply(box, migration);
    const oldDefinitions = Object.fromEntries([V1, V2, V3].map((signature) => [signature, psql(box, `SELECT pg_catalog.pg_get_functiondef('${signature}'::regprocedure);`)]));

    await scenario("PostgreSQL 16 applies the canonical 114 to 115 to 116 schema", () => {
      assert.match(psql(box, "SHOW server_version;"), /^16[.]/);
      assert.equal(psql(box, `SELECT to_regprocedure('${V1}') IS NOT NULL AND to_regprocedure('${V2}') IS NOT NULL AND to_regprocedure('${V3}') IS NOT NULL;`), "t");
    });

    for (const migration of additions) apply(box, migration);
    seed(box);

    await scenario("migrations 117 and 118 apply with their assertions", () => {
      assert.equal(psql(box, "SELECT to_regprocedure('saas.catalog_bulk_mutate_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,text,jsonb)') IS NOT NULL;"), "t");
      assert.equal(psql(box, "SELECT to_regprocedure('saas.media_restore_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint)') IS NOT NULL;"), "t");
    });

    await scenario("old application functions and exact definitions survive the new schema", () => {
      for (const [signature, definition] of Object.entries(oldDefinitions)) assert.equal(psql(box, `SELECT pg_catalog.pg_get_functiondef('${signature}'::regprocedure);`), definition);
      const old = result(box, `saas.catalog_list_products_v2(${authority()},NULL::text,20::integer,NULL::timestamptz,NULL::uuid)`);
      assert.equal(old.outcome, "listed");
    });

    await scenario("new application preview is canonical and contains no private media authority", () => {
      const preview = result(box, `saas.catalog_get_product_preview(${authority()},'${PRODUCT_A}'::uuid)`);
      assert.equal(preview.outcome, "found");
      assert.equal(preview.payload.canonicalStorefrontUrl, "https://products-complete.example.test/products/product-a");
      assert.equal(preview.payload.variants[0].attributes.Renk, "Altın");
      assert.equal(JSON.stringify(preview.payload).includes("objectKey"), false);
    });

    await scenario("owner bulk mutation is atomic and idempotently replayed", () => {
      const targets = [{ productId: PRODUCT_A, expectedVersion: 1 }, { productId: PRODUCT_B, expectedVersion: 1 }];
      const first = bulk(box, "owner", "80000000-0000-4000-8000-000000000121", "active", targets);
      const replay = bulk(box, "owner", "80000000-0000-4000-8000-000000000121", "active", targets);
      assert.equal(first.outcome, "committed");
      assert.equal(replay.outcome, "operation_replayed");
      assert.equal(psql(box, `SELECT count(*) FROM saas.products WHERE id IN('${PRODUCT_A}','${PRODUCT_B}') AND status='active' AND version=2;`), "2");
    });

    await scenario("one version conflict prevents every bulk row mutation", () => {
      const before = psql(box, `SELECT pg_catalog.string_agg(id::text||':'||version::text,',' ORDER BY id) FROM saas.products WHERE id IN('${PRODUCT_A}','${PRODUCT_B}');`);
      const conflict = bulk(box, "owner", "80000000-0000-4000-8000-000000000122", "draft", [{ productId: PRODUCT_A, expectedVersion: 2 }, { productId: PRODUCT_B, expectedVersion: 1 }]);
      assert.equal(conflict.outcome, "version_conflict");
      assert.equal(psql(box, `SELECT pg_catalog.string_agg(id::text||':'||version::text,',' ORDER BY id) FROM saas.products WHERE id IN('${PRODUCT_A}','${PRODUCT_B}');`), before);
    });

    await scenario("role matrix permits owner admin editor manage and denies analyst", () => {
      assert.equal(bulk(box, "admin", "80000000-0000-4000-8000-000000000123", "draft", [{ productId: PRODUCT_A, expectedVersion: 2 }]).outcome, "committed");
      assert.equal(bulk(box, "editor", "80000000-0000-4000-8000-000000000124", "active", [{ productId: PRODUCT_A, expectedVersion: 3 }]).outcome, "committed");
      assert.equal(bulk(box, "analyst", "80000000-0000-4000-8000-000000000125", "draft", [{ productId: PRODUCT_A, expectedVersion: 4 }]).outcome, "membership_denied");
      assert.equal(bulk(box, "editor", "80000000-0000-4000-8000-000000000126", "archive", [{ productId: PRODUCT_A, expectedVersion: 4 }]).outcome, "membership_denied");
    });

    await scenario("cross tenant records are indistinguishable from missing products", () => {
      assert.equal(eligibility(box, "owner", PRODUCT_FOREIGN).outcome, "product_not_found");
      assert.equal(eligibility(box, "foreign", PRODUCT_A, STORE_B).outcome, "product_not_found");
    });

    await scenario("archived media restores before retention expiry and editor is denied", () => {
      const denied = result(box, `saas.media_restore_product(${authority("editor", STORE, NOW, 1000000000)},'81000000-0000-4000-8000-000000000121','${FINGERPRINT}','${PRODUCT_A}','${MEDIA_RESTORE}',1)`);
      assert.equal(denied.outcome, "membership_denied");
      const restored = result(box, `saas.media_restore_product(${authority("owner", STORE, NOW, 1000000000)},'81000000-0000-4000-8000-000000000122','${FINGERPRINT}','${PRODUCT_A}','${MEDIA_RESTORE}',1)`);
      assert.equal(restored.outcome, "committed");
      assert.equal(restored.payload.media.status, "active");
    });

    await scenario("retention blocks early cleanup and deletion proof finalizes an expired object", () => {
      const early = result(box, `saas.media_claim_archived_cleanup(${authority("owner", STORE, NOW, 1000000000)},'82000000-0000-4000-8000-000000000121','${FINGERPRINT}','${PRODUCT_A}','${MEDIA_CLEANUP}',1)`);
      assert.equal(early.outcome, "retention_active");
      const claimed = result(box, `saas.media_claim_archived_cleanup(${authority("owner", STORE, LATER, 1000000000)},'82000000-0000-4000-8000-000000000122','${FINGERPRINT}','${PRODUCT_A}','${MEDIA_CLEANUP}',1)`);
      assert.equal(claimed.outcome, "claimed");
      const deleted = result(box, `saas.media_record_archived_object_deleted(${authority("owner", STORE, LATER, 1000000000)},'82000000-0000-4000-8000-000000000122','${PRODUCT_A}','${MEDIA_CLEANUP}','stores/${STORE}/products/${PRODUCT_A}/${MEDIA_CLEANUP}.webp')`);
      assert.equal(deleted.outcome, "deleted");
      assert.equal(deleted.payload.media.cleanupState, "object_deleted");
    });

    await scenario("safe removal explains blockers and rechecks eligibility server side", () => {
      const blocked = eligibility(box, "owner", PRODUCT_A);
      assert.equal(blocked.payload.eligible, false);
      assert.equal(blocked.payload.reasons.includes("product_not_archived"), true);
      const removeBlocked = result(box, `saas.catalog_remove_product(${authority()},'83000000-0000-4000-8000-000000000121','${FINGERPRINT}','${PRODUCT_A}',4)`);
      assert.equal(removeBlocked.outcome, "removal_not_eligible");
    });

    await scenario("eligible archived product removal is tenant bound and replay safe", () => {
      assert.equal(eligibility(box, "owner", PRODUCT_C).payload.eligible, true);
      const expression = `saas.catalog_remove_product(${authority()},'83000000-0000-4000-8000-000000000122','${FINGERPRINT}','${PRODUCT_C}',1)`;
      assert.equal(result(box, expression).outcome, "removed");
      assert.equal(result(box, expression).outcome, "operation_replayed");
      assert.equal(psql(box, `SELECT count(*) FROM saas.products WHERE id='${PRODUCT_C}';`), "0");
    });

    process.stdout.write("PASS 12/12 catalog products complete PostgreSQL 16 rehearsal complete\n");
  } finally {
    stop(box);
  }
}

await main();
